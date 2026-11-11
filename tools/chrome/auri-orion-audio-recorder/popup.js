const $ = id => document.getElementById(id);
const ERROR = $('error');
let state = 'idle';
let busy = false;
let status = null;
let savingOptions = false;
const stateLabels = {idle:'Preparado para grabar',starting:'Iniciando grabación…',recording:'Grabando audio',paused:'Grabación pausada',stopping:'Deteniendo grabación…',stopped:'Grabación detenida · lista para guardar',saving:'Guardando archivo…',error:'Revisar el estado'};
function escapeValue(v) {return String(v||'').slice(0,100);}
async function message(type) {
  const response = await chrome.runtime.sendMessage({scope:'ui',type});
  if (!response?.ok) throw Error(response?.error||'Error desconocido.');
  return response;
}
async function refresh() {
  try {
    const result=await message('STATUS');
    status=result;
    state=result.state||'idle';
    $('state').textContent=stateLabels[state]||state;
    $('indicator').className='dot'+(state==='recording'?' rec':state==='paused'?' paused':'');
    $('levels').classList.toggle('active',state==='recording');
    $('start').disabled=busy || !['idle','error'].includes(state);
    $('pause').disabled=busy || !['paused','recording'].includes(state);
    $('stop').disabled=busy || !['paused','recording'].includes(state);
    $('save').disabled=busy || !['paused','recording','stopped'].includes(state);
    $('name').disabled=!['idle','error'].includes(state);
    $('quality').disabled=!['idle','error'].includes(state);
    $('pause').textContent=state==='paused'?'▶ Reanudar':'⏸ Pausar';
    $('actionHelp').textContent=state==='stopped'
      ? 'Grabación detenida y conservada localmente. Pulsa Guardar audio cuando quieras descargarla.'
      : ['recording','paused'].includes(state)
      ? 'PARAR detiene sin descargar. Guardar audio termina la captura y descarga.'
      : state==='stopping' ? 'Finalizando la grabación y almacenando sus fragmentos…'
      : state==='saving' ? 'Preparando la descarga del archivo…'
      : 'PARAR y Guardar audio se activan al comenzar a grabar.';
    if(state==='error' && result.error){ERROR.textContent=escapeValue(result.error);ERROR.hidden=false;}
    else if (!busy) {ERROR.hidden=true;ERROR.textContent='';}
    if(state==='saving'){$('message').textContent='Creando el archivo. Si falla, puedes recuperar los fragmentos desde la extensión.';}
    else if(state==='stopped'){$('message').textContent='Audio detenido y conservado. No se ha descargado ningún archivo.';}
    else if(state==='stopping'){$('message').textContent='Esperando a que Chrome finalice la grabación…';}
    else if(state==='idle'){$('message').textContent='La grabación continúa aunque cierres esta ventana.';}
    const start = Number(status.startedAt||0);
    if(start&&['recording','paused','stopping','stopped','saving'].includes(state)){
      const end=Number(status.finishedAt||0);
      const sec=Math.max(0,Math.floor(((end && ['stopped','saving'].includes(state) ? end : Date.now())-start)/1000));
      $('clock').textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
    }else $('clock').textContent='00:00';
  }catch(error){ERROR.textContent=String(error.message||error);ERROR.hidden=false;}
}
async function saveOptions() {
  if(savingOptions)return;
  savingOptions=true;
  try {await chrome.storage.local.set({options:{name:$('name').value.trim()||'audio-web',bitrate:Number($('quality').value)}});}
  finally{savingOptions=false;}
}
async function act(type) {
  if(busy)return;
  busy=true;ERROR.hidden=true;
  try{
    if(type==='START')await saveOptions();
    await message(type);
  }catch(error){ERROR.textContent=String(error.message||error);ERROR.hidden=false;}
  finally{busy=false;await refresh();}
}
$('start').addEventListener('click',()=>act('START'));
$('pause').addEventListener('click',()=>act(state==='paused'?'RESUME':'PAUSE'));
$('stop').addEventListener('click',()=>act('STOP'));
$('save').addEventListener('click',()=>act('SAVE'));
$('recover').addEventListener('click',()=>act('OPEN_RECOVERY'));
$('name').addEventListener('change',()=>void saveOptions());
$('quality').addEventListener('change',()=>void saveOptions());
chrome.runtime.onMessage.addListener((msg)=>{if(msg?.scope==='ui-event')void refresh();});
(async()=>{
  const {options={}}=await chrome.storage.local.get('options');
  $('name').value=options.name||'audio-web';
  $('quality').value=String(options.bitrate||192000);
  const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
  $('tabTitle').textContent=tab?.title||'Pestaña activa de Chrome';
  await refresh();
  setInterval(()=>void refresh(),1200);
})();
