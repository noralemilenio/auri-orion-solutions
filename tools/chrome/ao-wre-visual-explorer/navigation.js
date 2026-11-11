// Los dos métodos se serializan mediante chrome.scripting.executeScript; por eso son autocontenidos.
export function inspectSideNavigation() {
  const doc = document;
  const forbidden = /\b(?:borrar|eliminar|suprimir|destruir|logout|sign\s*out|cerrar\s+sesi[oó]n|salir|comprar|pagar|checkout|publicar|guardar|enviar|confirmar|finalizar|ejecutar|generar|crear|desactivar|activar|eliminar\s+cuenta|cancelar\s+suscripci[oó]n|desconectar|resetear|restablecer|eliminar\s+proyecto|duplicar|archivar|descargar|exportar|importar|subir|cargar\s+archivo)\b/i;
  const norm = t => String(t || '').replace(/\s+/g,' ').trim();
  const isVisible = el => {
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    return r.width>=70 && r.height>=17 && r.height<=105 && s.display!=='none' && s.visibility!=='hidden' && s.opacity!=='0';
  };
  const roots = new Set(doc.querySelectorAll('aside,nav,[role="navigation"],[class*="sidebar"],[class*="side-bar"],[class*="side_nav"],[class*="sidenav"],[class*="side-menu"],[class*="stepper"],[class*="steps-nav"]'));
  // Fallback para SPA con un menú compuesto exclusivamente por <div onClick>.
  let headers=0;
  for (const el of doc.querySelectorAll('body *')) {
    if (++headers>14000) break;
    if (el.children.length>2 || !/^(?:SECCIONES|PASOS|ETAPAS|M[OÓ]DULOS|CAP[IÍ]TULOS|CONTENIDOS)$/i.test(norm(el.textContent))) continue;
    let parent=el.parentElement;
    for (let i=0;parent&&i<5;i++,parent=parent.parentElement) {
      if(parent!==doc.body&&parent!==doc.documentElement) roots.add(parent);
    }
  }
  function itemsIn(root) {
    const selector='a[href],button,[role="button"],[role="menuitem"],[role="link"],[tabindex="0"],[class*="cursor-pointer"],li,div';
    const choices=[];
    let count=0;
    for (const el of root.querySelectorAll(selector)) {
      if (++count>700) break;
      if (el.closest('form,[role="dialog"],[role="alertdialog"],[contenteditable="true"]')) continue;
      if (el.matches('input,textarea,select,[role="switch"],[aria-pressed],button[type="submit"]')) continue;
      const semantic=el.matches('a[href],button,[role="button"],[role="menuitem"],[role="link"],[tabindex="0"]');
      const hasSectionTitle=/\b(?:SECCIONES|PASOS|ETAPAS|M[OÓ]DULOS)\b/i.test((root.innerText||'').slice(0,150));
      const genericNavRow=hasSectionTitle && el.matches('div,li') && /(?:hover|flex|item|step|nav|menu|row|option|rounded|transition)/i.test(String(el.className||''));
      if (!semantic && getComputedStyle(el).cursor!=='pointer' && !genericNavRow) continue;
      if (!isVisible(el)) continue;
      const label=norm(el.getAttribute('aria-label')||el.innerText||el.getAttribute('title'));
      if (label.length<2 || label.length>75 || forbidden.test(label)) continue;
      if (el.disabled || el.getAttribute('aria-disabled')==='true') continue;
      if (el.matches('a[href]')) {
        const raw=el.getAttribute('href');
        if(!raw || /^(?:javascript:|mailto:|tel:|data:)/i.test(raw))continue;
        try {const u=new URL(raw,location.href);if(u.origin!==location.origin||/(?:^|[/._?#=&-])(delete|logout|remove|destroy|checkout|pay)(?:$|[/._?#=&-])/i.test(u.pathname+u.search))continue;}catch{continue;}
      }
      const r=el.getBoundingClientRect();
      choices.push({el,label,y:Math.round(r.top+r.height/2),x:Math.round(r.left),weight:semantic?3:1,
        selected:el.getAttribute('aria-current')==='page'||el.getAttribute('aria-current')==='step'||el.getAttribute('aria-selected')==='true'||
          el.getAttribute('data-state')==='active'||/(?:^|\s)(?:active|selected|current|is-active|bg-purple[^\s]*|bg-violet[^\s]*)(?:\s|$)/i.test(String(el.className||''))});
    }
    // Si un div cursor-pointer envuelve otro control, preferimos el control semántico.
    const unique=[];
    for(const choice of choices.sort((a,b)=>b.weight-a.weight || a.y-b.y)) {
      if(unique.some(other=>other.label===choice.label && Math.abs(other.y-choice.y)<22))continue;
      unique.push(choice);
    }
    return unique.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,70);
  }
  const scored=[];
  for(const root of roots) {
    const r=root.getBoundingClientRect(),style=getComputedStyle(root);
    if (r.width<135 || r.width>innerWidth*.67 || r.height<100 || r.left>innerWidth*.48 || r.bottom<0 || r.top>=innerHeight || style.display==='none') continue;
    const items=itemsIn(root);
    if(items.length<2)continue;
    const distinctY=new Set(items.map(x=>Math.round(x.y/18)));
    if(distinctY.size<2)continue;
    const klass=String(root.className||'');
    const sectionHeading=/\b(?:SECCIONES|PASOS|ETAPAS|M[OÓ]DULOS)\b/i.test(root.innerText.slice(0,250));
    const score=items.length*5+(sectionHeading?100:0)+(/side(?:bar|[-_]nav|[-_]menu)|sidenav|stepper/i.test(klass)?75:0)+
      (root.matches('aside')?40:0)+(root.matches('nav,[role="navigation"]')?20:0)+(r.width<innerWidth*.45?12:0);
    scored.push({root,items,score});
  }
  scored.sort((a,b)=>b.score-a.score);
  const best=scored[0];
  doc.querySelectorAll('[data-ao-vex-nav-index]').forEach(el=>el.removeAttribute('data-ao-vex-nav-index'));
  if(!best)return {items:[],rootFound:false};
  const items=best.items.map(({el,label,selected},index)=>{
    el.setAttribute('data-ao-vex-nav-index',String(index));
    return {index,label,selected,href:el.matches('a[href]')?el.href:null};
  });
  return {rootFound:true,items,rootTag:best.root.tagName,rootClass:String(best.root.className||'').slice(0,110)};
}

export function clickSideNavigation(index,expectedLabel) {
  const el=document.querySelector(`[data-ao-vex-nav-index="${Number(index)}"]`);
  if(!el || el.disabled || el.getAttribute('aria-disabled')==='true' || el.closest('form,[role="dialog"]') || el.matches('button[type="submit"],[aria-pressed]'))return false;
  const label=String(el.getAttribute('aria-label')||el.innerText||el.title||'').replace(/\s+/g,' ').trim();
  if(label!==expectedLabel || /\b(?:borrar|eliminar|destruir|guardar|enviar|comprar|pagar|publicar|confirmar|finalizar|ejecutar|generar|crear|desactivar|activar|exportar|importar|cerrar sesi[oó]n|logout|sign out)\b/i.test(label))return false;
  if(el.matches('a[href]')) {
    try {const href=new URL(el.getAttribute('href'),location.href);if(href.origin!==location.origin || /(?:^|[/._?#=&-])(delete|logout|remove|destroy|checkout|pay)(?:$|[/._?#=&-])/i.test(href.pathname+href.search))return false;}catch{return false;}
  }
  el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  el.click();return true;
}
