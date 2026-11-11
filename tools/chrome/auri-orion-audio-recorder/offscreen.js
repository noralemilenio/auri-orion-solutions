/* Media capture and encoding must live in a document: MV3 workers cannot record MediaStreams. */
/* global AOAudioDB */
let current = null;
let stopping = null;
let pendingDownloadUrl = null;

function notify(type, details = {}) {
  chrome.runtime.sendMessage({scope: 'worker', type, ...details}).catch(() => {});
}
function safeName(value) {
  const name = String(value || 'audio-pestana').normalize('NFKC')
    .replace(/[\\/<>:"|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim()
    .slice(0, 90).replace(/[. ]+$/g, '');
  return name || 'audio-pestana';
}
function getMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm'];
  return types.find(type => MediaRecorder.isTypeSupported(type)) || '';
}
async function start({streamId, tabId, name, bitrate}) {
  if (current || stopping) throw Error('Ya existe una grabación en curso.');
  if (!streamId) throw Error('No se ha recibido el identificador de captura.');
  const mimeType = getMimeType();
  if (!mimeType) throw Error('Esta versión de Chrome no permite grabar audio WebM/Opus.');
  let stream;
  let audioCtx;
  const id = crypto.randomUUID();
  const startedAt = Date.now();
  const fileName = `${safeName(name)}-${new Date(startedAt).toISOString().replace(/[:.]/g, '-').replace('T','_').slice(0,19)}.webm`;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {mandatory: {chromeMediaSource: 'tab', chromeMediaSourceId: streamId}},
      video: false
    });
    if (!stream.getAudioTracks().length) throw Error('La pestaña no ha entregado una pista de audio.');
    // The captured tab becomes inaudible unless we connect it back to the speakers.
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(audioCtx.destination);
    // Do not block capture if Chrome temporarily suspends background audio output.
    void audioCtx.resume().catch(() => {});
    await AOAudioDB.addRecording({id, fileName, tabId, startedAt, state: 'recording', chunks: 0, bytes: 0, mimeType});
    const rec = new MediaRecorder(stream, {mimeType, audioBitsPerSecond: bitrate});
    const session = {id, rec, stream, audioCtx, fileName, startedAt, tabId, chunks:0, bytes:0, pending:new Set(), writeError:null, seq:0, pausedAt:0, pausedMs:0, ended:false};
    current = session;
    rec.ondataavailable = event => {
      if (!event.data || !event.data.size) return;
      const seq = session.seq++;
      session.bytes += event.data.size;
      session.chunks++;
      const op = AOAudioDB.addChunk(id, seq, event.data).catch(error => {
        session.writeError = error;
        notify('CAPTURE_ERROR', {error: 'Error guardando fragmentos de audio: '+String(error?.message||error)});
        throw error;
      });
      session.pending.add(op);
      op.finally(()=>session.pending.delete(op)).catch(()=>{});
    };
    rec.onerror = event => {
      notify('CAPTURE_ERROR', {error: 'Fallo del grabador: '+(event.error?.message || 'desconocido')});
      void stop('error');
    };
    rec.onstop = () => void finish(session);
    stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
      if (current?.id === id) void stop('track-ended');
    }, {once:true}));
    rec.start(2000);
    notify('CAPTURE_STARTED', {state: 'recording', startedAt, tabId, fileName});
    return {ok:true, id, startedAt, tabId, fileName, mimeType};
  } catch (error) {
    if (current?.id === id) current = null;
    stream?.getTracks().forEach(track => track.stop());
    await audioCtx?.close().catch(()=>{});
    try { await AOAudioDB.removeRecording(id); } catch (_) { /* no data to remove */ }
    throw error;
  }
}
function pause() {
  if (!current || current.rec.state !== 'recording') throw Error('No hay una grabación activa que pausar.');
  current.rec.pause(); current.pausedAt = Date.now();
  notify('CAPTURE_STATE', {state:'paused'});
  return {ok:true, state:'paused'};
}
function resume() {
  if (!current || current.rec.state !== 'paused') throw Error('No hay una grabación pausada.');
  current.pausedMs += Date.now() - current.pausedAt;
  current.pausedAt = 0;
  current.rec.resume();
  notify('CAPTURE_STATE', {state:'recording'});
  return {ok:true, state:'recording'};
}
async function stop(reason = 'user') {
  if (!current) return {ok:false,error:'No hay grabación activa.'};
  const s=current;
  if(s.rec.state==='inactive') return {ok:true,state:'stopping'};
  if(s.rec.state==='paused') s.pausedMs+=Date.now()-s.pausedAt;
  stopping=s.id;
  s.reason=reason;
  s.rec.stop();
  return {ok:true,state:reason==='save'?'saving':'stopping'};
}
async function prepareDownload(id) {
  if (!id) throw Error('No se ha identificado la grabación. Abre Recuperar grabaciones.');
  const recording=await AOAudioDB.getRecording(id);
  if (!recording || !['stopped','ready'].includes(recording.state)) {
    throw Error('La grabación todavía no está preparada. Abre Recuperar grabaciones.');
  }
  const chunks=await AOAudioDB.listChunks(id);
  if(!chunks.length) throw Error('No hay fragmentos disponibles.');
  const blob=new Blob(chunks.map(c=>c.blob), {type:recording.mimeType || 'audio/webm'});
  if (pendingDownloadUrl) URL.revokeObjectURL(pendingDownloadUrl);
  pendingDownloadUrl=URL.createObjectURL(blob);
  await AOAudioDB.patchRecording(id,{state:'ready',bytes:blob.size,chunks:chunks.length});
  notify('CAPTURE_READY',{id,fileName:recording.fileName,url:pendingDownloadUrl,bytes:blob.size});
  return {ok:true,state:'saving'};
}
async function save(id) {
  if(current){
    if(id && current.id!==id) throw Error('Hay otra grabación activa.');
    return stop('save');
  }
  if(stopping) throw Error('La grabación se está terminando.');
  return prepareDownload(id);
}
async function finish(s) {
  // Persist ALL chunks before showing a finished recording or allowing download.
  try {
    const results=await Promise.allSettled([...s.pending]);
    const failed=results.find(x=>x.status==='rejected');
    if(failed) throw failed.reason;
    if(s.writeError) throw s.writeError;
    const chunks=await AOAudioDB.listChunks(s.id);
    if(!chunks.length) throw Error('No se ha recibido audio. Reproduce el vídeo antes de grabar.');
    const bytes=chunks.reduce((acc,c)=>acc+c.blob.size,0);
    const finishedAt=Date.now();
    await AOAudioDB.patchRecording(s.id,{state:'stopped',chunks:chunks.length,bytes,finishedAt});
    if(s.reason==='save') await prepareDownload(s.id);
    else notify('CAPTURE_STOPPED',{id:s.id,fileName:s.fileName,finishedAt,bytes});
  }catch(error){
    await AOAudioDB.patchRecording(s.id,{state:'recovery',error:String(error?.message||error)}).catch(()=>{});
    notify('CAPTURE_ERROR',{error:'No se pudo finalizar la grabación. Abre Recuperar audio: '+String(error?.message||error)});
  }finally{
    if(current?.id===s.id) current=null;
    stopping=null;
    s.stream.getTracks().forEach(t=>t.stop());
    await s.audioCtx.close().catch(()=>{});
  }
}
async function saved(id) {
  // Preserve chunks until Chrome confirms the download completed.
  await AOAudioDB.removeRecording(id);
  if (pendingDownloadUrl) URL.revokeObjectURL(pendingDownloadUrl);
  pendingDownloadUrl = null;
  return {ok:true};
}
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg?.scope !== 'offscreen') return;
  (async () => {
    try {
      let response;
      switch (msg.type) {
        case 'START': response = await start(msg); break;
        case 'STOP': response = await stop(); break;
        case 'SAVE': response = await save(msg.id); break;
        case 'PAUSE': response = pause(); break;
        case 'RESUME': response = resume(); break;
        case 'SAVED': response = await saved(msg.id); break;
        case 'STATUS': response = {ok:true,state:current?.rec.state || (stopping ? 'stopping':'idle'),fileName:current?.fileName||null}; break;
        default: return;
      }
      sendResponse(response);
    } catch (error) { sendResponse({ok:false,error:String(error?.message||error)}); }
  })();
  return true;
});
