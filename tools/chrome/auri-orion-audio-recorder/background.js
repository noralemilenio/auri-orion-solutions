/* Auri–Orion Audio Recorder — background lifecycle, no site injections. */
const OFFSCREEN_URL = 'offscreen.html';
const EMPTY = {state:'idle', tabId:null, startedAt:0, finishedAt:0, recordingId:null, fileName:null,error:null};
let createPromise = null;
const downloads = new Map();
async function rememberDownload(downloadId, recordingId) {
  const {activeDownloads={}}=await chrome.storage.session.get('activeDownloads');
  activeDownloads[downloadId]=recordingId;
  await chrome.storage.session.set({activeDownloads});
}
async function takeDownload(downloadId) {
  const {activeDownloads={}}=await chrome.storage.session.get('activeDownloads');
  const rec=downloads.get(downloadId) || activeDownloads[downloadId];
  downloads.delete(downloadId);
  delete activeDownloads[downloadId];
  await chrome.storage.session.set({activeDownloads});
  return rec;
}

async function getStatus() {
  const {audioStatus} = await chrome.storage.session.get('audioStatus');
  return audioStatus || {...EMPTY};
}
async function setStatus(patch) {
  const prev = await getStatus();
  const next = {...prev,...patch};
  await chrome.storage.session.set({audioStatus:next});
  await chrome.action.setBadgeText({text: next.state==='recording'?'REC':next.state==='paused'?'II':next.state==='saving'?'...':''});
  await chrome.action.setBadgeBackgroundColor({color:next.state==='paused'?'#F59E0B':'#EA4765'});
  chrome.runtime.sendMessage({scope:'ui-event',status:next}).catch(()=>{});
  return next;
}
async function offscreenExists() {
  const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[chrome.runtime.getURL(OFFSCREEN_URL)]});
  return contexts.length>0;
}
async function ensureOffscreen() {
  if (await offscreenExists()) return;
  if (createPromise) return createPromise;
  createPromise=chrome.offscreen.createDocument({url:OFFSCREEN_URL,reasons:['USER_MEDIA','BLOBS'],justification:'Grabar el audio de una pestaña a petición del usuario, guardándolo solo en su equipo.'});
  try {await createPromise;} finally {createPromise=null;}
}
async function sendToOffscreen(type, params={}) {
  if (!await offscreenExists()) throw Error('El proceso de captura no está disponible. Puedes intentar recuperar fragmentos guardados.');
  const reply=await chrome.runtime.sendMessage({scope:'offscreen',type,...params});
  if (!reply?.ok) throw Error(reply?.error||'El grabador no ha podido completar la operación.');
  return reply;
}
async function activeTab() {
  const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
  if (!tab?.id) throw Error('No hay ninguna pestaña activa para grabar.');
  if (tab.url && /^(chrome|chrome-extension|edge|about|devtools):/i.test(tab.url)) {
    throw Error('Chrome no permite capturar audio de páginas internas. Abre una página con vídeo.');
  }
  return tab;
}
async function start(tabOverride=null) {
  const current=await getStatus();
  if (['starting','recording','paused','stopping','stopped','saving'].includes(current.state)) throw Error('Ya hay una grabación pendiente. Guárdala antes de iniciar otra.');
  const tab = tabOverride || await activeTab();
  if (!tab.id) throw Error('Pestaña no válida.');
  await setStatus({state:'starting',tabId:tab.id,error:null,fileName:null,startedAt:0,finishedAt:0,recordingId:null});
  try {
    // Offscreen must exist before obtaining the short-lived streamId.
    await ensureOffscreen();
    const streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:tab.id});
    const {options={}}=await chrome.storage.local.get('options');
    const name=typeof options.name==='string'?options.name:'audio-web';
    const bitrate=[96000,128000,192000,256000].includes(options.bitrate)?options.bitrate:192000;
    const started=await sendToOffscreen('START',{streamId,tabId:tab.id,name,bitrate});
    await setStatus({state:'recording',startedAt:started.startedAt,fileName:started.fileName,recordingId:started.id,tabId:tab.id,error:null});
    return started;
  } catch(error) {
    await setStatus({...EMPTY,state:'error',error:String(error.message||error)});
    if (await offscreenExists()) await chrome.offscreen.closeDocument().catch(()=>{});
    throw error;
  }
}
async function control(type) {
  const previous = await getStatus();
  const state = previous.state;
  if (type==='STOP' && !['recording','paused'].includes(state)) throw Error('No hay grabación activa.');
  if (type==='SAVE' && !['recording','paused','stopped'].includes(state)) throw Error('No hay grabación disponible para guardar.');
  if (type==='PAUSE' && state!=='recording') throw Error('La grabación no está en marcha.');
  if (type==='RESUME' && state!=='paused') throw Error('La grabación no está pausada.');
  // Update the state BEFORE asking MediaRecorder to stop: onstop can finish first.
  if (type==='STOP') await setStatus({state:'stopping'});
  if (type==='SAVE') await setStatus({state:'saving'});
  try {
    if (type==='SAVE' && state==='stopped') await ensureOffscreen();
    const reply=await sendToOffscreen(type, type==='SAVE' && state==='stopped'
      ? {id:previous.recordingId} : {});
    if (type==='PAUSE') await setStatus({state:'paused'});
    if (type==='RESUME') await setStatus({state:'recording'});
    return reply;
  } catch (error) {
    if (['STOP','SAVE'].includes(type)) await setStatus({state:state,error:String(error.message||error)});
    throw error;
  }
}
async function downloadReady(msg) {
  await setStatus({state:'saving',fileName:msg.fileName,error:null});
  try {
    const id=await chrome.downloads.download({url:msg.url,filename:`Auri-Orion-Audio/${msg.fileName}`,conflictAction:'uniquify',saveAs:false});
    if(!Number.isInteger(id))throw Error('Chrome no ha confirmado el inicio de la descarga.');
    downloads.set(id,msg.id);
    await rememberDownload(id,msg.id);
  } catch(error) {
    await setStatus({state:'error',error:'Error descargando el audio. Los fragmentos están guardados en Recuperar audio: '+String(error.message||error)});
  }
}
chrome.downloads.onChanged.addListener(async delta=>{
  if(!delta.state?.current)return;
  const recordingId=await takeDownload(delta.id);
  if(!recordingId)return;
  if(delta.state.current==='complete'){
    try {await sendToOffscreen('SAVED',{id:recordingId});}
    catch (_) { /* recovery can still clear stale chunks */ }
    await setStatus({...EMPTY});
    if (await offscreenExists()) await chrome.offscreen.closeDocument().catch(()=>{});
  }else{
    await setStatus({state:'error',error:'Chrome interrumpió la descarga. Puedes recuperarla desde Recuperar audio.'});
  }
});
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if (!msg || msg.scope==='ui-event') return;
  if (msg.scope==='worker' && sender.url===chrome.runtime.getURL(OFFSCREEN_URL)) {
    (async()=>{
      if(msg.type==='CAPTURE_READY') await downloadReady(msg);
      if(msg.type==='CAPTURE_STOPPED') await setStatus({state:'stopped',recordingId:msg.id,finishedAt:msg.finishedAt,error:null});
      if(msg.type==='CAPTURE_STATE') await setStatus({state:msg.state});
      if(msg.type==='CAPTURE_ERROR') await setStatus({state:'error',error:msg.error});
    })().catch(e=>console.error('Internal recording error',e));
    return;
  }
  if (msg.scope!=='ui') return;
  (async()=>{
    try {
      let response;
      if(msg.type==='STATUS') {
        response=await getStatus();
        if (['recording','paused','starting','stopping','saving'].includes(response.state) && !(await offscreenExists())) {
          response=await setStatus({state:'error',error:'La sesión se interrumpió. Comprueba Recuperar audio.'});
        }
      } else if(msg.type==='START') response=await start();
      else if(['PAUSE','RESUME','STOP','SAVE'].includes(msg.type)) response=await control(msg.type);
      else if(msg.type==='OPEN_RECOVERY'){
        await chrome.tabs.create({url:chrome.runtime.getURL('recover.html')});response={ok:true};
      }else return;
      sendResponse({ok:true,...response});
    }catch(error){sendResponse({ok:false,error:String(error.message||error)});}
  })();
  return true;
});
chrome.commands.onCommand.addListener(async command=>{
  if(command!=='toggle-recording')return;
  try {
    const state=(await getStatus()).state;
    if(['recording','paused'].includes(state))await control('STOP');
    else await start();
  }catch(error){await setStatus({state:'error',error:String(error?.message||error)});}
});
chrome.runtime.onInstalled.addListener(()=>{chrome.action.setBadgeText({text:''});});
