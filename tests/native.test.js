import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile,rm,readdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {encodeMp3} from '../chrome-extension/recorder/mp3.js';
const helper=fileURLToPath(new URL('../native-host-mac/host.cjs',import.meta.url));

test('native protocol saves PNG and real MP3 into one selected folder; collision preserves files',async()=> {
 const temp=await mkdtemp(path.join(tmpdir(),'chrome-capture-save-'));
 try{
  const config=path.join(temp,'config');const folder=path.join(temp,'공통 폴더');await mkdir(config);await mkdir(folder);
  await writeFile(path.join(config,'settings.json'),JSON.stringify({saveDirectory:folder}));
  function send(payload){
   const body=Buffer.from(JSON.stringify(payload));const header=Buffer.alloc(4);header.writeUInt32LE(body.length);
   const exe=process.env.CHROME_CAPTURE_TEST_HOST;
   const result=spawnSync(exe || process.execPath,exe ? []:[helper],{input:Buffer.concat([header,body]),env:{...process.env,CHROME_CAPTURE_CONFIG_DIR:config},timeout:10000});
   assert.equal(result.status,0,result.stderr?.toString());
   const count=result.stdout.readUInt32LE();assert.equal(count,result.stdout.length-4);
   return JSON.parse(result.stdout.subarray(4).toString());
  }
  assert.equal(await realpath(send({action:'getSaveDirectory'}).path),await realpath(folder));
  const samples=Float32Array.from({length:3*32000},(_,i)=>.2*Math.sin(i*2*Math.PI*440/32000));
  const mp3=Buffer.from(await encodeMp3([[samples,samples]],samples.length,32000).arrayBuffer());
  // Generated one-pixel PNG fixture; no personal images.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1V8AAAAASUVORK5CYII=','base64');
  for(const [ext,mime,bytes] of [['mp3','audio/mpeg',mp3],['png','image/png',png]]){
   const result=send({action:'saveCapture',filename:'261005_1939.'+ext,dataUrl:'data:'+mime+';base64,'+bytes.toString('base64')});
   assert.equal(result.ok,true);assert.equal(await realpath(path.dirname(result.path)),await realpath(folder));
   assert.equal(path.basename(result.path),'261005_1939.'+ext);assert.deepEqual(await readFile(result.path),bytes);
   const second=send({action:'saveCapture',filename:'261005_1939.'+ext,dataUrl:'data:'+mime+';base64,'+bytes.toString('base64')});
   assert.equal(path.basename(second.path),'261005_1939_1.'+ext);
  }
  assert.equal((await readdir(folder)).length,4);
  assert.equal(send({action:'saveCapture',dataUrl:'data:audio/wav;base64,AAAA',filename:'bad.wav'}).ok,false);
 }finally{await rm(temp,{recursive:true,force:true});}
});
