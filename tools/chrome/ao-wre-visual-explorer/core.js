export function isSafeInternalLink(href, originalOrigin) {
  try {
    const url = new URL(href);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== originalOrigin) return false;
    if (/(?:^|[\/._?#=&-])(logout|log-out|signout|sign-out|delete|remove|destroy|drop|borrar|eliminar|cancel|cancelar|payment|checkout|pay|pagar|unsubscribe|unsub|salir)(?:$|[\/._?#=&-])/i.test(url.pathname + url.search)) return false;
    if (/\.(?:pdf|zip|csv|xlsx?|docx?|pptx?|png|jpe?g|gif|webp|svg|mp4|mp3|css|js|xml|json|webmanifest|woff2?|ttf|eot)(?:$|[?#])/i.test(url.pathname)) return false;
    return true;
  } catch { return false; }
}
export function canonicalUrl(input) {
  const url = new URL(input);
  url.hash = '';
  return url.href;
}
export function slug(value) {
  return String(value || 'pagina').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,65) || 'pagina';
}
export function planGrid({width,height,viewportWidth,viewportHeight,scale,maxCanvasPx=8192,maxTiles=60}) {
  if (![width,height,viewportWidth,viewportHeight,scale].every(n => Number.isFinite(n) && n > 0)) throw new Error('Medidas inválidas');
  const cols = Math.ceil(width/viewportWidth), rows = Math.ceil(height/viewportHeight);
  const tiles = rows * cols;
  if (tiles > maxTiles) throw new Error(`La página necesita ${tiles} capturas. Ajusta el límite (máximo permitido: ${maxTiles}).`);
  const colsChunk = Math.max(1, Math.floor(maxCanvasPx/(viewportWidth*scale)));
  const rowsChunk = Math.max(1, Math.floor(maxCanvasPx/(viewportHeight*scale)));
  const chunks = [];
  for (let r = 0; r < rows; r += rowsChunk) {
    for (let c = 0; c < cols; c += colsChunk) {
      const left = c*viewportWidth, top = r*viewportHeight;
      chunks.push({left,top,width:Math.min(width-left,colsChunk*viewportWidth),
        height:Math.min(height-top,rowsChunk*viewportHeight),
        colStart:c, colEnd:Math.min(cols,c+colsChunk),rowStart:r,rowEnd:Math.min(rows,r+rowsChunk)});
    }
  }
  return {cols,rows,tiles,chunks};
}
export function escapeHtml(text) {
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
