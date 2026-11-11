/* Recovery never sends recorded audio over the network. */
/* global AOAudioDB */
const $ = id => document.getElementById(id);
const formatBytes = n => n < 1024 ? `${n} bytes` : n < 1048576 ? `${(n/1024).toFixed(1)} KiB` : `${(n/1048576).toFixed(1)} MiB`;
const states = {recording:'Interrumpida o en curso',paused:'En pausa',stopping:'Deteniendo',stopped:'Detenida · sin descargar',ready:'Preparada',recovery:'Recuperable',saving:'Guardando'};
async function render(){
  const rows=await AOAudioDB.listRecordings();
  const active = await chrome.runtime.sendMessage({scope:'ui',type:'STATUS'}).catch(()=>({}));
  $('items').replaceChildren();
  $('status').textContent=`${rows.length} grabación(es) guardada(s)`;
  if(!rows.length){const p=document.createElement('div');p.className='empty';p.textContent='No hay grabaciones pendientes de recuperación.';$('items').append(p);return;}
  for(const rec of rows){
    const card=document.createElement('div');card.className='card';
    const info=document.createElement('div');const name=document.createElement('div');name.className='name';name.textContent=rec.fileName;
    const note=document.createElement('div');note.className='info';note.textContent=`${states[rec.state]||rec.state} · ${new Date(rec.startedAt).toLocaleString('es-ES')} · ${rec.chunks||0} fragmentos`;
    info.append(name,note);card.append(info);
    const buttons=document.createElement('div');buttons.className='buttons';
    const save=document.createElement('button');save.textContent='↓ Descargar';
    const del=document.createElement('button');del.className='danger';del.textContent='Eliminar copia';
    const inProgress=rec.tabId===active.tabId&&['recording','paused','starting','stopping','saving'].includes(active.state);
    save.disabled=del.disabled=inProgress;
    save.addEventListener('click',async()=>{
      save.disabled=true;
      try{
        const chunks=await AOAudioDB.listChunks(rec.id);
        if(!chunks.length)throw Error('No hay fragmentos de audio disponibles.');
        const blob=new Blob(chunks.map(x=>x.blob),{type:'audio/webm'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;a.download=rec.fileName;document.body.append(a);a.click();a.remove();
        $('status').textContent=`Descarga solicitada · ${formatBytes(blob.size)}. Comprueba el archivo antes de eliminar la copia.`;
        setTimeout(()=>URL.revokeObjectURL(url),60000);
      }catch(error){$('status').textContent='Error: '+String(error.message||error);}
      finally{save.disabled=false;}
    });
    del.addEventListener('click',async()=>{
      if(!confirm(`¿Eliminar definitivamente los fragmentos locales de «${rec.fileName}»?`))return;
      await AOAudioDB.removeRecording(rec.id);await render();
    });
    buttons.append(save,del);card.append(buttons);$('items').append(card);
  }
}
$('refresh').addEventListener('click',()=>render().catch(e=>$('status').textContent=e.message));
render().catch(e=>$('status').textContent=e.message);
