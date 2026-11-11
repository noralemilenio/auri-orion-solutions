import test from 'node:test';
import assert from 'node:assert/strict';
import {makeZip,crc32} from '../zip.js';
import {planGrid,isSafeInternalLink,canonicalUrl,slug,escapeHtml} from '../core.js';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('CRC32 estándar',()=>assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926));
test('ZIP escritura y lectura por unzip',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'aowre-'));
  const file=join(folder,'aowre.zip');
  const data=new Uint8Array(await makeZip([{path:'datos/area.txt',data:'áéíóú 🥑'},{path:'datos/imagen.png',data:new Uint8Array([1,2,0,255])}]).arrayBuffer());
  writeFileSync(file,data);
  assert.equal(execFileSync('unzip',['-t',file],{encoding:'utf8'}).includes('No errors detected'),true);
  assert.equal(execFileSync('unzip',['-p',file,'datos/area.txt'],{encoding:'utf8'}),'áéíóú 🥑');
  assert.deepEqual(new Uint8Array(execFileSync('unzip',['-p',file,'datos/imagen.png'])),new Uint8Array([1,2,0,255]));
});
test('rechaza enlaces destructivos y de otra procedencia',()=>{
  const origin='https://app.example.com';
  for(const url of ['https://otro.com/page','https://app.example.com/logout','https://app.example.com/api/delete?id=1','https://app.example.com/pago/checkout','mailto:a@b.com','https://app.example.com/test.csv'])
    assert.equal(isSafeInternalLink(url,origin),false,url);
  for(const url of ['https://app.example.com/RoadmapCanvas?id=10001','https://app.example.com/home','https://app.example.com/panel#tab'])
    assert.equal(isSafeInternalLink(url,origin),true,url);
});
test('canonicaliza sin perder parámetros y escapa HTML',()=>{
  assert.equal(canonicalUrl('https://app.example.com/RoadmapCanvas?id=10001#tab'),'https://app.example.com/RoadmapCanvas?id=10001');
  assert.equal(escapeHtml('<span title="A&B">'), '&lt;span title=&quot;A&amp;B&quot;&gt;');
  assert.equal(slug('Pestaña / Negocios Ñº'),'Pestana-Negocios-No');
});
test('cuadrícula página larga con partes y límite',()=>{
  const grid=planGrid({width:1300,height:20150,viewportWidth:1300,viewportHeight:900,scale:1,maxTiles:30});
  assert.equal(grid.tiles,23);assert.ok(grid.chunks.length>1);
  assert.ok(grid.chunks.every(c=>c.height<=8192&&c.width<=8192));
  assert.throws(()=>planGrid({width:5000,height:30000,viewportWidth:1000,viewportHeight:1000,scale:1,maxTiles:60}),/necesita/);
});
