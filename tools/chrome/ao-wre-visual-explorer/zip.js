// ZIP estándar, método STORE sin librerías externas. PNG ya está comprimido.
const encoder = new TextEncoder();
const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let x = i;
  for (let b = 0; b < 8; b++) x = (x & 1) ? 0xedb88320 ^ (x >>> 1) : x >>> 1;
  table[i] = x >>> 0;
}
export function crc32(bytes) {
  let x = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) x = table[(x ^ bytes[i]) & 255] ^ (x >>> 8);
  return (x ^ 0xffffffff) >>> 0;
}
const u16 = (v, p, n) => v.setUint16(p, n, true);
const u32 = (v, p, n) => v.setUint32(p, n, true);
export function makeZip(entries) {
  if (entries.length > 65535) throw new Error('Límite de archivos ZIP alcanzado');
  const blobs = [], directory = [];
  let position = 0, dirLength = 0;
  for (const entry of entries) {
    const filename = encoder.encode(entry.path);
    const content = entry.data instanceof Uint8Array ? entry.data : encoder.encode(String(entry.data));
    if (filename.length > 65535 || content.length > 0xffffffff) throw new Error('Archivo ZIP demasiado grande');
    const crc = crc32(content);
    const local = new Uint8Array(30 + filename.length), a = new DataView(local.buffer);
    u32(a,0,0x04034b50);u16(a,4,20);u16(a,6,0x0800);u16(a,8,0);
    u32(a,14,crc);u32(a,18,content.length);u32(a,22,content.length);u16(a,26,filename.length);
    local.set(filename,30);
    const central = new Uint8Array(46 + filename.length), b = new DataView(central.buffer);
    u32(b,0,0x02014b50);u16(b,4,20);u16(b,6,20);u16(b,8,0x0800);
    u32(b,16,crc);u32(b,20,content.length);u32(b,24,content.length);
    u16(b,28,filename.length);u32(b,42,position);central.set(filename,46);
    blobs.push(local,content);directory.push(central);
    position += local.length + content.length;dirLength += central.length;
    if (position + dirLength > 0xffffffff) throw new Error('El ZIP supera el límite de 4 GB');
  }
  const footer = new Uint8Array(22), e = new DataView(footer.buffer);
  u32(e,0,0x06054b50);u16(e,8,entries.length);u16(e,10,entries.length);
  u32(e,12,dirLength);u32(e,16,position);
  return new Blob([...blobs,...directory,footer],{type:'application/zip'});
}
