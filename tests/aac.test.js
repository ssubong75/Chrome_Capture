import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {encodeWav} from '../chrome-extension/recorder/audio.js';

test('native AAC encoder produces AAC-LC / 48 kHz / stereo / 128 kbps for 3 and 5 seconds',
 {skip:process.platform!=='darwin' && !process.env.CHROME_CAPTURE_TEST_HOST},async()=>{
 const temp=await mkdtemp(path.join(tmpdir(),'chrome-capture-aac-test-'));
 try {
  const config=path.join(temp,'config');await mkdir(config);
  await writeFile(path.join(config,'settings.json'),JSON.stringify({saveDirectory:path.join(temp,'output')}));
  function send(payload){
   const body=Buffer.from(JSON.stringify(payload));const header=Buffer.alloc(4);header.writeUInt32LE(body.length);
   const exe=process.env.CHROME_CAPTURE_TEST_HOST;
   const helper=fileURLToPath(new URL('../native-host-mac/host.cjs',import.meta.url));
   const r=spawnSync(exe || process.execPath,exe ? []:[helper],{input:Buffer.concat([header,body]),env:{...process.env,CHROME_CAPTURE_CONFIG_DIR:config},timeout:40000,maxBuffer:2*1024*1024});
   assert.equal(r.status,0,r.stderr?.toString());
   assert.equal(r.stdout.readUInt32LE(),r.stdout.length-4);
   return JSON.parse(r.stdout.subarray(4).toString());
  }
  for(const seconds of [3,5]){
   const frames=seconds*48000;
   const left=Float32Array.from({length:frames},(_,i)=>.2*Math.sin(2*Math.PI*440*i/48000));
   const right=Float32Array.from({length:frames},(_,i)=>.2*Math.sin(2*Math.PI*660*i/48000));
   const wav=Buffer.from(encodeWav([[left,right]],frames,48000));
   const encoded=send({action:'encodeAudio',dataUrl:'data:audio/wav;base64,'+wav.toString('base64')});
   assert.equal(encoded.ok,true,encoded.error);assert.match(encoded.dataUrl,/^data:audio\/mp4;base64,/);
   const saved=send({action:'saveCapture',filename:'261014_1200.m4a',dataUrl:encoded.dataUrl});
   assert.equal(saved.ok,true,saved.error);
   const probe=process.env.CHROME_CAPTURE_FFPROBE || (process.platform==='darwin' ? '/opt/homebrew/bin/ffprobe':'ffprobe');
   const r=spawnSync(probe,['-v','error','-show_entries','stream=codec_name,profile,sample_rate,channels,bit_rate,duration','-of','json',saved.path],{encoding:'utf8'});
   if(r.error && process.platform==='darwin'){
    const info=spawnSync('/usr/bin/afinfo',[saved.path],{encoding:'utf8'});assert.equal(info.status,0,info.stderr);
    assert.match(info.stdout,/2 ch, 48000 Hz, '?aac/);
    const bitrate=Number(info.stdout.match(/bit rate:\s*(\d+)/i)?.[1]);assert.ok(bitrate>=120000 && bitrate<=136000,info.stdout);
   } else {
    assert.equal(r.status,0,r.stderr);const stream=JSON.parse(r.stdout).streams[0];
    assert.equal(stream.codec_name,'aac');assert.equal(stream.profile,'LC');
    assert.equal(stream.sample_rate,'48000');assert.equal(stream.channels,2);
    assert.ok(Number(stream.bit_rate)>=120000 && Number(stream.bit_rate)<=136000,JSON.stringify(stream));
    assert.ok(Math.abs(Number(stream.duration)-seconds)<.1);
   }
   console.log(`Verified ${seconds}s AAC-LC stereo, 48kHz, ~128kbps`);
  }
  assert.equal(send({action:'encodeAudio',dataUrl:'data:audio/wav;base64,AAAA'}).ok,false);
 } finally {await rm(temp,{recursive:true,force:true});}
});
