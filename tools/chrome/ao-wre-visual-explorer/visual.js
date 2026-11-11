import {makeZip} from './zip.js';
import {canonicalUrl, escapeHtml, isSafeInternalLink, planGrid, slug} from './core.js';
import {inspectSideNavigation, clickSideNavigation} from './navigation.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const tabId = Number(params.get('tabId'));
const windowId = Number(params.get('windowId'));
const state = {running:false,cancel:false,original:null,files:[],records:[],errors:[],captures:0,images:0,lastCapture:0,started:null,bytes:0,maxViews:100,limitReached:false};
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));

function log(message) {
  const timestamp = new Date().toLocaleTimeString('es-ES',{hour12:false});
  $('log').textContent += `[${timestamp}] ${message}\n`;
  $('log').scrollTop = $('log').scrollHeight;
}
function status(message,progress) {
  $('message').textContent = message;
  if (Number.isFinite(progress)) $('progress').value = Math.min(100,Math.max(0,progress));
  $('stats').textContent = `${state.records.length} pantalla(s) · ${state.images} imagen(es) · ${state.errors.length} incidencia(s)`;
}
function checkCancel() { if (state.cancel) throw Object.assign(new Error('Captura detenida por el usuario'),{cancelled:true}); }
const MAX_BYTES=500*1024*1024; // Protección de memoria: ZIP en navegador con PNG ya comprimidos.
function checkBudget() {
  if(state.records.length>=state.maxViews || state.bytes>=MAX_BYTES) {
    state.limitReached=true;
    const why=state.records.length>=state.maxViews?`límite de ${state.maxViews} pantallas`:'límite de 500 MB';
    throw Object.assign(new Error(`Alcanzado el ${why}; se exportará lo capturado.`),{limitReached:true});
  }
}
function recordError(message) {state.errors.push(message);log(`AVISO: ${message}`);status($('message').textContent);}
function setBusy(busy) {
  state.running=busy;
  $('start').disabled=busy;
  $('stop').disabled=!busy;
  for (const id of ['mode','maxPages','maxViews','maxTiles','delay','tabs','panels','sidebar','restore']) $(id).disabled=busy;
  if(!busy)$('mode').dispatchEvent(new Event('change'));
}
$('mode').addEventListener('change',() => {
  const mode=$('mode').value;
  $('site-options').classList.toggle('hidden',mode!=='site');
  $('tabs').disabled=mode==='page';
  $('panels').disabled=mode==='page';
  $('sidebar').disabled=mode!=='site';
});
$('mode').dispatchEvent(new Event('change'));
$('stop').addEventListener('click',()=>{if(state.running){state.cancel=true;log('Detención solicitada; se guardará lo que se haya capturado.');}});

async function init() {
  try {
    if (!Number.isInteger(tabId) || !Number.isInteger(windowId) || tabId < 0) throw new Error('No se encontró una pestaña de origen.');
    const tab = await chrome.tabs.get(tabId);
    if (!/^https?:\/\//.test(tab.url||'')) throw new Error('Abre primero una página HTTP(S) (no chrome:// ni archivos locales).');
    state.original={url:tab.url,title:tab.title||tab.url,windowId,tabId};
    $('origin').textContent=`${tab.title||'Página sin título'}\n${tab.url}`;
    log('Pestaña preparada. El navegador conserva tu sesión normal de la web.');
  } catch(error) {
    $('origin').textContent=error.message;
    $('start').disabled=true;
    status(`No disponible: ${error.message}`);
  }
}
await init();

async function inject(fn,...args) {
  const result=await chrome.scripting.executeScript({target:{tabId},func:fn,args});
  if (!result?.length) throw new Error('No se pudo ejecutar el capturador en esta web.');
  return result[0].result;
}

// Se ejecuta dentro de la página; no transmite su DOM ni credenciales.
function inspectPage() {
  const d=document,html=d.documentElement,body=d.body;
  const width=Math.max(html.scrollWidth,body?.scrollWidth||0,html.clientWidth,window.innerWidth);
  const height=Math.max(html.scrollHeight,body?.scrollHeight||0,html.clientHeight,window.innerHeight);
  const links=Array.from(d.querySelectorAll('a[href]')).map(a=>({href:a.href,text:(a.innerText||a.title||'').trim().slice(0,100),nav:!!a.closest('nav,header,aside,[role="navigation"]')}));
  const tabList=Array.from(d.querySelectorAll('[role="tab"], [data-bs-toggle="tab"], [data-toggle="tab"]'));
  const tabs=tabList.filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>=12&&r.height>=10&&s.display!=='none'&&s.visibility!=='hidden';})
    .slice(0,9).map(el=>({name:(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,65),selected:el.getAttribute('aria-selected')==='true'||el.classList.contains('active'),index:tabList.indexOf(el)}));
  return {url:location.href,title:d.title||location.href,width,height,viewportWidth:window.innerWidth,
    viewportHeight:window.innerHeight,scale:window.devicePixelRatio||1,links,tabs,scrollX:window.scrollX,scrollY:window.scrollY};
}
function scrollDocument(x,y) {
  window.scrollTo({left:x,top:y,behavior:'instant'});
  return {x:window.scrollX,y:window.scrollY,width:window.innerWidth,height:window.innerHeight};
}
function clickSafeTab(index) {
  const nodes=Array.from(document.querySelectorAll('[role="tab"], [data-bs-toggle="tab"], [data-toggle="tab"]'));
  const el=nodes[index];
  if (!el) return false;
  const href=el.getAttribute('href');
  if (href && !href.startsWith('#') && !href.startsWith('javascript:')) return false;
  if (el.disabled || el.getAttribute('aria-disabled')==='true') return false;
  el.click();return true;
}
function inspectScrollablePanels() {
  const panels=[];
  for (const el of document.querySelectorAll('body *')) {
    if (panels.length>=3) break;
    if (el.matches('textarea,input,[contenteditable="true"]')) continue;
    const r=el.getBoundingClientRect();
    if (r.width<200||r.height<130||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth) continue;
    const s=getComputedStyle(el);
    const y=/^(auto|scroll)$/.test(s.overflowY)&&el.scrollHeight>el.clientHeight+130;
    const x=/^(auto|scroll)$/.test(s.overflowX)&&el.scrollWidth>el.clientWidth+130;
    if (!x&&!y)continue;
    const key=`ao-vex-${panels.length}`;
    el.setAttribute('data-ao-visual-panel',key);
    panels.push({key,name:(el.getAttribute('aria-label')||el.id||el.className?.toString()||el.tagName).slice(0,70),
      maxY:Math.max(0,el.scrollHeight-el.clientHeight),maxX:Math.max(0,el.scrollWidth-el.clientWidth),
      stepY:Math.max(150,el.clientHeight),stepX:Math.max(180,el.clientWidth),originalY:el.scrollTop,originalX:el.scrollLeft});
  }
  return panels;
}
function setNativeDetails(openState) {
  const items=Array.from(document.querySelectorAll('details')).slice(0,12);
  if (openState === null) return items.map((el,i)=>({index:i,open:el.open}));
  for (const pair of openState) if(items[pair.index])items[pair.index].open=pair.open;
  return items.length;
}
function openNativeDetails() {
  const items=Array.from(document.querySelectorAll('details')).slice(0,12);
  const count=items.filter(el=>!el.open).length;
  items.forEach(el=>el.open=true);
  return count;
}
function scrollPanel(key,x,y) {
  const panel=Array.from(document.querySelectorAll('[data-ao-visual-panel]')).find(el=>el.getAttribute('data-ao-visual-panel')===key);
  if (!panel) return false;
  panel.scrollTo({left:x,top:y,behavior:'instant'});
  panel.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  return {x:panel.scrollLeft,y:panel.scrollTop};
}

async function captureViewport() {
  checkCancel();
  const elapsed=Date.now()-state.lastCapture;
  if (elapsed<700) await wait(700-elapsed); // chrome.tabs.captureVisibleTab: máximo 2 por segundo
  const active=await chrome.tabs.query({active:true,windowId});
  if (active[0]?.id!==tabId) await chrome.tabs.update(tabId,{active:true});
  const data=await chrome.tabs.captureVisibleTab(windowId,{format:'png'});
  state.lastCapture=Date.now();
  state.captures++;
  return createImageBitmap(await (await fetch(data)).blob());
}
async function bytesFromCanvas(canvas) {
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('No se pudo generar el PNG')),'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
function saveBytes(path,data) {
  state.files.push({path,data});state.images++;state.bytes+=data.byteLength;
  status($('message').textContent);
}
function pageFolder(pageIndex,title,kind) {
  return `capturas/${String(pageIndex).padStart(2,'0')}-${slug(title).slice(0,38)}-${slug(kind)}`;
}

// Produce imágenes unidas en segmentos de hasta 8192 píxeles físicos para evitar desbordar Canvas.
async function captureFullPage({index,label,kind,maxTiles,delay}) {
  checkCancel();checkBudget();
  const info=await inject(inspectPage);
  const plan=planGrid({...info,maxTiles});
  const folder=pageFolder(index,label||info.title,kind);
  const images=[];
  const originalScroll={x:info.scrollX,y:info.scrollY};
  log(`${info.title} · ${Math.round(info.width)}×${Math.round(info.height)} CSS px · ${plan.tiles} desplazamientos`);
  try {
    for(let ci=0;ci<plan.chunks.length;ci++) {
      checkCancel();
      const chunk=plan.chunks[ci];
      const scale=info.scale;
      const canvas=document.createElement('canvas');
      canvas.width=Math.min(16384,Math.max(1,Math.round(chunk.width*scale)));
      canvas.height=Math.min(16384,Math.max(1,Math.round(chunk.height*scale)));
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx)throw new Error('Canvas 2D no disponible.');
      for(let r=chunk.rowStart;r<chunk.rowEnd;r++) {
        for(let c=chunk.colStart;c<chunk.colEnd;c++) {
          checkCancel();
          const x=c*info.viewportWidth,y=r*info.viewportHeight;
          const actual=await inject(scrollDocument,x,y);
          await wait(Math.max(200,delay));
          const bitmap=await captureViewport();
          try {
            const ratioX=bitmap.width/actual.width, ratioY=bitmap.height/actual.height;
            const cellWidth=Math.min(info.width-x,info.viewportWidth);
            const cellHeight=Math.min(info.height-y,info.viewportHeight);
            const sx=Math.max(0,(x-actual.x)*ratioX),sy=Math.max(0,(y-actual.y)*ratioY);
            const srcWidth=Math.min(cellWidth*ratioX,bitmap.width-sx), srcHeight=Math.min(cellHeight*ratioY,bitmap.height-sy);
            if(srcWidth<=0||srcHeight<=0)throw new Error('Chrome devolvió una captura fuera de la región visible.');
            const dx=Math.round((x-chunk.left)*scale),dy=Math.round((y-chunk.top)*scale);
            const dw=Math.round(cellWidth*scale),dh=Math.round(cellHeight*scale);
            ctx.drawImage(bitmap,sx,sy,srcWidth,srcHeight,dx,dy,dw,dh);
          } finally {bitmap.close();}
        }
      }
      const name=`${folder}/${plan.chunks.length===1?'pagina-completa':`parte-${String(ci+1).padStart(2,'0')}`}.png`;
      saveBytes(name,await bytesFromCanvas(canvas));images.push(name);
      canvas.width=1;canvas.height=1;
      status(`Guardada imagen ${images.length}/${plan.chunks.length} de ${info.title}`,Math.min(93,state.images*3));
      log(`Imagen ${images.length}/${plan.chunks.length}: ${name}`);
    }
  } finally {
    try {await inject(scrollDocument,originalScroll.x,originalScroll.y);} catch {}
  }
  const record={url:info.url,title:info.title,kind,images,viewport:{width:info.viewportWidth,height:info.viewportHeight,scale:info.scale},
    document:{width:info.width,height:info.height},tiles:plan.tiles};
  state.records.push(record);
  status(`Capturada: ${info.title}`);
  return {record,info};
}

async function capturePanels({pageIndex,maxTiles,delay,tag=""}) {
  const panels=await inject(inspectScrollablePanels);
  for(let pi=0;pi<panels.length;pi++) {
    checkCancel();
    const p=panels[pi];
    // Recorremos ambos ejes de manera independiente (sin realizar clicks sobre controles).
    const moves=[];
    for(let y=0;y<=Math.min(p.maxY,p.stepY*4);y+=p.stepY) moves.push({x:0,y});
    if(p.maxY>0&&!moves.some(m=>m.y===p.maxY))moves.push({x:0,y:p.maxY});
    for(let x=p.stepX;x<=Math.min(p.maxX,p.stepX*3);x+=p.stepX)moves.push({x,y:0});
    if(p.maxX>0&&!moves.some(m=>m.x===p.maxX&&m.y===0))moves.push({x:p.maxX,y:0});
    const safeMoves=moves.slice(0,9);
    log(`Panel interno ${pi+1} (${p.name}) · ${safeMoves.length} vistas`);
    try {
      for(let mi=0;mi<safeMoves.length;mi++) {
        checkCancel();checkBudget();
        const move=safeMoves[mi];
        const result=await inject(scrollPanel,p.key,move.x,move.y);
        if(!result)break;
        await wait(Math.max(250,delay));
        const bitmap=await captureViewport();
        try {
          const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
          const ctx=canvas.getContext('2d',{alpha:false});ctx.drawImage(bitmap,0,0);
          const name=`capturas/${String(pageIndex).padStart(2,'0')}-${tag?slug(tag)+'-':''}panel-${pi+1}/vista-${String(mi+1).padStart(2,'0')}.png`;
          saveBytes(name,await bytesFromCanvas(canvas));
          state.records.push({url:(await chrome.tabs.get(tabId)).url,title:`Panel ${pi+1}: ${p.name} · vista ${mi+1}`,kind:'panel',images:[name],scroll:result});
        } finally {bitmap.close();}
      }
    } catch(err) {
      if (err.cancelled||err.limitReached) throw err;
      recordError(`Panel ${pi+1}: ${err.message}`);
    } finally {
      try {await inject(scrollPanel,p.key,p.originalX,p.originalY);}catch{}
    }
  }
}

async function captureTabs({pageIndex,maxTiles,delay,alreadySelected,tag=""}) {
  const tabs=(await inject(inspectPage)).tabs.slice(0,7);
  for(let i=0;i<tabs.length;i++) {
    checkCancel();
    const t=tabs[i];
    if(t.selected)continue; // imagen de pestaña activa incluida en captura base
    try {
      const clicked=await inject(clickSafeTab,t.index);
      if (!clicked) {log(`Se omite pestaña con navegación: ${t.name||t.index}`);continue;}
      await wait(Math.max(350,delay));
      const tabAfter=await chrome.tabs.get(tabId);
      if(new URL(tabAfter.url).origin!==new URL(state.original.url).origin)throw new Error('La pestaña salió del dominio.');
      await captureFullPage({index:pageIndex,label:t.name||`tab-${i+1}`,kind:`${tag?slug(tag)+'-':''}pestana-${i+1}`,maxTiles,delay});
    }catch(err){if(err.cancelled||err.limitReached)throw err;recordError(`Pestaña ${t.name||i+1}: ${err.message}`);}
  }
  const selected=alreadySelected.find(t=>t.selected);
  if(selected)try {await inject(clickSafeTab,selected.index);}catch{}
}

async function captureDetails({pageIndex,maxTiles,delay}) {
  const originals=await inject(setNativeDetails,null);
  if(!originals.some(x=>!x.open))return;
  try {
    const opened=await inject(openNativeDetails);
    if(!opened)return;
    await wait(Math.max(300,delay));
    log(`Desplegados ${opened} bloques <details> visibles/ocultos`);
    await captureFullPage({index:pageIndex,label:'Secciones desplegadas',kind:'detalles-expandidos',maxTiles,delay});
  }catch(error){if(error.cancelled||error.limitReached)throw error;recordError(`Secciones desplegables: ${error.message}`);}
  finally {try{await inject(setNativeDetails,originals);}catch{}}
}

// Recorrido lateral: no depende del cambio de URL y reconoce botones/div de SPA (React/Vue/etc).
// Los únicos clics automáticos se hacen sobre opciones detectadas como navegación; nunca sobre formularios.
async function captureSidebar({pageIndex,maxTiles,delay,withTabs,withPanels}) {
  const original=await inject(inspectSideNavigation);
  if(!original.rootFound || !original.items.length){log('No se detectó un menú lateral navegable.');return;}
  const baseUrl=(await chrome.tabs.get(tabId)).url;
  const home=original.items.find(item=>item.selected)||original.items[0];
  const items=original.items.slice(0,70);
  log(`Menú lateral detectado: ${items.length} secciones · ${items.map(t=>t.label).join(' | ')}`);
  let captured=0;
  try {
    for(const item of items) {
      checkCancel();checkBudget();
      if(item.selected){log(`Ya incluida la sección activa: ${item.label}`);continue;}
      try {
        // Volver a la ruta de partida si un clic anterior nos llevó a otra URL.
        const here=await chrome.tabs.get(tabId);
        if(canonicalUrl(here.url)!==canonicalUrl(baseUrl))await navigate(baseUrl,delay);
        const current=await inject(inspectSideNavigation);
        const target=current.items.find(t=>t.label===item.label);
        if(!target){log(`Sección no disponible al regresar: ${item.label}`);continue;}
        const clicked=await inject(clickSideNavigation,target.index,target.label);
        if(!clicked){log(`Se omite control no seguro: ${item.label}`);continue;}
        await wait(Math.max(400,delay));
        const afterTab=await chrome.tabs.get(tabId);
        if(new URL(afterTab.url).origin!==new URL(state.original.url).origin) {
          await navigate(baseUrl,delay);
          recordError(`La sección ${item.label} cambió de dominio; no se capturó.`);
          continue;
        }
        const after=await inject(inspectPage);
        log(`Menú lateral → ${item.label} (${after.url})`);
        await captureFullPage({index:pageIndex,label:item.label,kind:`menu-lateral-${item.index+1}`,maxTiles,delay});
        captured++;
        if(withTabs)await captureTabs({pageIndex,maxTiles,delay,alreadySelected:after.tabs,tag:`menu-${item.index+1}`});
      }catch(error){
        if(error.cancelled||error.limitReached)throw error;
        recordError(`Menú lateral «${item.label}»: ${error.message}`);
      }
    }
    // Segunda pasada: solo después de documentar todas las secciones laterales,
    // por si un panel infinito agotara el presupuesto antes de visitar las demás.
    if(withPanels) {
      for(const item of items) {
        checkCancel();checkBudget();
        try {
          const tab=await chrome.tabs.get(tabId);
          if(canonicalUrl(tab.url)!==canonicalUrl(baseUrl))await navigate(baseUrl,delay);
          const menu=await inject(inspectSideNavigation);
          const target=menu.items.find(t=>t.label===item.label);
          if(!target)continue;
          await inject(clickSideNavigation,target.index,target.label);
          await wait(Math.max(350,delay));
          const current=await chrome.tabs.get(tabId);
          if(new URL(current.url).origin!==new URL(baseUrl).origin)continue;
          await capturePanels({pageIndex,maxTiles,delay,tag:`menu-${item.index+1}`});
        } catch(error) {
          if(error.cancelled||error.limitReached)throw error;
          recordError(`Paneles de ${item.label}: ${error.message}`);
        }
      }
    }
  } finally {
    // Restaurar primero la sección activa, luego la URL por si la aplicación utiliza rutas SPA.
    try {
      const currentTab=await chrome.tabs.get(tabId);
      if(new URL(currentTab.url).origin===new URL(baseUrl).origin) {
        if(canonicalUrl(currentTab.url)!==canonicalUrl(baseUrl))await navigate(baseUrl,delay);
        const current=await inject(inspectSideNavigation);
        const target=current.items.find(item=>item.label===home.label);
        if(target){await inject(clickSideNavigation,target.index,target.label);await wait(Math.max(300,delay));}
        else log('No se pudo localizar la sección original para restaurarla.');
      }
    }catch(error){log(`Aviso al restaurar menú lateral: ${error.message}`);}
  }
  log(`Menú lateral finalizado: ${captured} pantallas adicionales.`);
}

async function navigate(url,delay) {
  checkCancel();
  const expectedOrigin=new URL(state.original.url).origin;
  if(canonicalUrl(url)!==canonicalUrl(state.original.url)&&!isSafeInternalLink(url,expectedOrigin))throw new Error('Navegación descartada por seguridad.');
  const current=await chrome.tabs.get(tabId);
  if(canonicalUrl(current.url)===canonicalUrl(url))return;
  await chrome.tabs.update(tabId,{url});
  await waitForLoad(22000);
  await wait(Math.max(600,delay));
  const tab=await chrome.tabs.get(tabId);
  if(new URL(tab.url).origin!==expectedOrigin)throw new Error('La web redirigió fuera del dominio autorizado.');
}
function waitForLoad(timeoutMs) {
  return new Promise(async (resolve,reject)=>{
    let timeout;
    const handler=(id,info)=>{
      if(id===tabId&&info.status==='complete')finish();
    };
    const finish=(error)=>{chrome.tabs.onUpdated.removeListener(handler);clearTimeout(timeout);error?reject(error):resolve();};
    chrome.tabs.onUpdated.addListener(handler);
    timeout=setTimeout(()=>finish(new Error('Tiempo de carga agotado')),timeoutMs);
    try {const tab=await chrome.tabs.get(tabId);if(tab.status==='complete')finish();}catch(err){finish(err);}
  });
}

function makeGallery(records,metadata) {
  const card=record=>{
    const gallery=record.images.map(src=>`<a href="${escapeHtml(src)}" download><img src="${escapeHtml(src)}" loading="lazy" alt="Captura de ${escapeHtml(record.title)}"><span>${escapeHtml(src.split('/').pop())}</span></a>`).join('');
    return `<article><div class="top"><strong>${escapeHtml(record.title)}</strong><small>${escapeHtml(record.kind)}</small></div><p><a target="_blank" rel="noopener noreferrer" href="${escapeHtml(record.url)}">${escapeHtml(record.url)}</a></p><div class="pics">${gallery}</div></article>`;
  };
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AO-WRE · Galería de capturas</title><style>
  *{box-sizing:border-box}body{margin:auto;max-width:1500px;padding:28px;background:#081322;color:#e6f4ff;font:14px/1.6 system-ui,sans-serif}h1{margin:0;font-size:35px}header{border-bottom:1px solid #314960;padding-bottom:25px}header p{color:#a6bdcf}article{background:#122338;margin:22px 0;border:1px solid #2e5068;padding:20px;border-radius:15px}.top{display:flex;gap:14px;justify-content:space-between}.top strong{font-size:19px}.top small{color:#70dacc}.pics{display:flex;gap:14px;flex-wrap:wrap}.pics a{min-width:200px;max-width:460px;flex:1;color:#a9d3f0}.pics img{max-width:100%;width:100%;max-height:650px;object-fit:contain;object-position:top;display:block;background:#0a1725;border-radius:8px}article p{overflow-wrap:anywhere}article p a{color:#91c9f4}span{display:block}footer{color:#94b7cd}</style><header><h1>AO-WRE · Exploración visual</h1><p>${escapeHtml(metadata.origin)} · ${escapeHtml(metadata.startedAt)} · ${records.length} vistas</p></header>${records.map(card).join('')}<footer>Capturas creadas localmente en Chrome. Los PNG permiten ampliar detalles de cada pantalla. Los archivos pueden contener información sensible.</footer></html>`;
}

async function downloadZip() {
  if(!state.files.length)throw new Error('No hay imágenes capturadas.');
  const now=new Date();
  const report={tool:'AO-WRE Visual Explorer',version:'1.1.0',origin:state.original.url,created_at:now.toISOString(),
    completed:!state.cancel&&!state.limitReached,limit_reached:state.limitReached,mode:$('mode').value,records:state.records,errors:state.errors,total_images:state.images,total_screen_captures:state.captures,total_bytes:state.bytes,max_views:state.maxViews};
  const entries=[...state.files,
    {path:'galeria.html',data:makeGallery(state.records,{origin:state.original.url,startedAt:state.started.toLocaleString('es-ES')})},
    {path:'informe-captura.json',data:JSON.stringify(report,null,2)}];
  status('Comprimiendo y preparando ZIP…',97);
  const zip=makeZip(entries);
  const filename=`AO-WRE-Visual-${slug(new URL(state.original.url).hostname)}-${now.toISOString().replace(/[:.]/g,'-')}.zip`;
  const url=URL.createObjectURL(zip);
  try {
    await chrome.downloads.download({url,filename,conflictAction:'uniquify',saveAs:false});
  } catch(error) {
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
    log(`Descarga alternativa iniciada: ${error.message}`);
  }
  setTimeout(()=>URL.revokeObjectURL(url),120000);
  $('result').classList.remove('hidden');
  $('result').textContent=`${state.cancel||state.limitReached?'Captura parcial':'Captura finalizada'} · ${state.records.length} pantallas · ${state.images} PNG · ${state.captures} capturas de viewport · ${state.errors.length} incidencias · ${(zip.size/1024/1024).toFixed(1)} MB. Archivo: ${filename}. Abre galeria.html dentro del ZIP descomprimido.`;
  log(`ZIP preparado: ${filename}`);
  status(state.cancel||state.limitReached?'ZIP parcial preparado y descarga iniciada.':'ZIP preparado y descarga iniciada.',100);
}

$('start').addEventListener('click',async()=>{
  if(state.running||!state.original)return;
  const origin=new URL(state.original.url).origin;
  // Solicitud de permiso desde el clic real del usuario.
  let authorized=false;
  const host=new URL(state.original.url);
  try {authorized=await chrome.permissions.request({origins:[`${host.protocol}//${host.hostname}/*`]});}
  catch(err){status(`Permiso no concedido: ${err.message}`);return;}
  if(!authorized){status('Sin permiso para inspeccionar este dominio.');return;}
  Object.assign(state,{cancel:false,files:[],records:[],errors:[],images:0,captures:0,lastCapture:0,started:new Date(),bytes:0,limitReached:false});
  $('log').textContent='';$('result').classList.add('hidden');
  setBusy(true);status('Iniciando exploración...',3);
  const mode=$('mode').value;
  const maxPages=mode==='site'?Number($('maxPages').value):1;
  state.maxViews=mode==='site'?Number($('maxViews').value):100;
  const maxTiles=Number($('maxTiles').value);
  const delay=Number($('delay').value);
  const withPanels=mode!=='page'&&$('panels').checked;
  const withTabs=mode!=='page'&&$('tabs').checked;
  const withSidebar=mode==='site'&&$('sidebar').checked;
  const visited=new Set(),queue=[state.original.url];
  try {
    // El explorador solo navega dentro del origen autorizado.
    while(queue.length&&visited.size<maxPages&&state.records.length<state.maxViews) {
      checkCancel();
      const requested=queue.shift();
      const normalized=canonicalUrl(requested);
      if(visited.has(normalized)||!isSafeInternalLink(requested,origin))continue;
      const number=visited.size+1;
      try {
        if(canonicalUrl((await chrome.tabs.get(tabId)).url)!==normalized)await navigate(requested,delay);
        const start=await inject(inspectPage);
        if(new URL(start.url).origin!==origin)throw new Error('La web ha abandonado el dominio autorizado.');
        visited.add(normalized);
        status(`Explorando página ${number}/${maxPages}: ${start.title}`,10+number/maxPages*65);
        log(`Página ${number}: ${start.url}`);
        if(mode==='site') {
          const links=start.links.filter(l=>isSafeInternalLink(l.href,origin))
            .sort((a,b)=>Number(b.nav)-Number(a.nav));
          for(const link of links){
            const key=canonicalUrl(link.href);
            if(!visited.has(key)&&!queue.some(x=>canonicalUrl(x)===key)&&queue.length<maxPages*5)queue.push(link.href);
          }
          log(`${queue.length} enlaces internos en cola`);
        }
        await captureFullPage({index:number,label:start.title,kind:'principal',maxTiles,delay});
        if(withTabs)await captureTabs({pageIndex:number,maxTiles,delay,alreadySelected:start.tabs});
        if(mode!=='page')await captureDetails({pageIndex:number,maxTiles,delay});
        if(withPanels)await capturePanels({pageIndex:number,maxTiles,delay});
        if(withSidebar)await captureSidebar({pageIndex:number,maxTiles,delay,withTabs,withPanels});
      }catch(error){
        if(error.cancelled||error.limitReached)throw error;
        recordError(`Página ${number} (${requested}): ${error.message}`);
        visited.add(normalized);
        try {if(new URL((await chrome.tabs.get(tabId)).url).origin!==origin)break;}catch{break;}
      }
    }
    if(state.records.length>=state.maxViews){state.limitReached=true;log(`Alcanzado el límite de ${state.maxViews} pantallas.`);}
  }catch(error){
    if(error.cancelled)log('Exploración detenida por el usuario.');
    else if(error.limitReached)log(error.message);
    else recordError(error.message);
  }finally{
    if($('restore').checked){
      status('Restaurando la página inicial…',95);
      try {const tab=await chrome.tabs.get(tabId);
        if(canonicalUrl(tab.url)!==canonicalUrl(state.original.url))await navigate(state.original.url,delay);
        log('URL de origen restaurada.');
      }catch(error){recordError(`No se pudo restaurar la URL inicial: ${error.message}`);}
    }
    try {await downloadZip();}
    catch(error){recordError(`No se pudo descargar el ZIP: ${error.message}`);status(`Error de exportación: ${error.message}`);}
    setBusy(false);
  }
});
