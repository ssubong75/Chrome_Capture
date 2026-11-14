import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {encodeWav} from '../chrome-extension/recorder/audio.js';

test('native WAV save preserves float32 PCM for 3 and 5 seconds',
 {skip:process.platform!=='darwin' && !process.env.CHROME_CAPTURE_TEST_HOST},async()=>{
 const temp=await mkdtemp(path.join(tmpdir(),'chrome-capture-wav-test-'));
 try {
  const config=path.join(temp,'config');await mkdir(config);
  await writeFile(path.join(config,'settings.json'),JSON.stringify({saveDirectory:path.join(temp,'output')}));
  function send(payload){
   const body=Buffer.from(JSON.stringify(payload));const header=Buffer.alloc(4);header.writeUInt32LE(body.length);
   const exe=process.env.CHROME_CAPTURE_TEST_HOST;
   const helper=fileURLToPath(new URL('../native-host-mac/host.cjs',import.meta.url));
   const r=spawnSync(exe || process.execPath,exe ? []:[helper],{input:Buffer.concat([header,body]),env:{...process.env,CHROME_CAPTURE_CONFIG_DIR:config},maxBuffer:4*1024*1024});
   assert.equal(r.status,0,r.stderr?.toString());return JSON.parse(r.stdout.subarray(4).toString());
  }
  for(const seconds of [3,5]){
   const samples=Float32Array.from({length:seconds*48000},(_,i)=>.25*Math.sin(i*.1));
   const wav=Buffer.from(encodeWav([[samples,samples]],samples.length,48000));
   assert.equal(wav.readUInt16LE(20),3);assert.equal(wav.readUInt16LE(34),32);
   const saved=send({action:'saveCapture',filename:`261114_00000${seconds}.wav`,dataUrl:'data:audio/wav;base64,'+wav.toString('base64')});
   assert.equal(saved.ok,true,JSON.stringify(saved));
   const {readFile}=await import('node:fs/promises');assert.deepEqual(await readFile(saved.path),wav);
  }
 } finally {await rm(temp,{recursive:true,force:true});}
});
