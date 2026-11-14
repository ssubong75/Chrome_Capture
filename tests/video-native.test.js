import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {encodeWav} from '../chrome-extension/recorder/audio.js';
const probe=process.env.CHROME_CAPTURE_FFPROBE;
const ffmpeg=probe ? path.join(path.dirname(probe),'ffmpeg.exe') : ['/opt/homebrew/bin/ffmpeg','/usr/local/bin/ffmpeg'].find(p=>fs.existsSync(p));
test('native PCM MP4 mux preserves audio samples and video codec', {skip:!ffmpeg},()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'chrome-capture-pcm-'));
 try {
  const config=path.join(temp,'config');fs.mkdirSync(config);fs.writeFileSync(path.join(config,'settings.json'),JSON.stringify({saveDirectory:temp}));
  const video=path.join(temp,'input.mp4');
  execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=black:s=16x16:r=30','-t','0.1','-c:v','mpeg4',video]);
  const samples=Float32Array.from({length:4800},(_,i)=>.2*Math.sin(i*.1));
  const wav=Buffer.from(encodeWav([[samples,samples]],samples.length,48000));
  const body=Buffer.from(JSON.stringify({action:'saveVideoCapture',filename:'261114_000001.mp4',dataUrl:'data:video/mp4;base64,'+fs.readFileSync(video).toString('base64'),audioDataUrl:'data:audio/wav;base64,'+wav.toString('base64')}));
  const header=Buffer.alloc(4);header.writeUInt32LE(body.length);
  const exe=process.env.CHROME_CAPTURE_TEST_HOST;
  const result=spawnSync(exe||process.execPath,exe?[]:[fileURLToPath(new URL('../native-host-mac/host.cjs',import.meta.url))],{input:Buffer.concat([header,body]),env:{...process.env,CHROME_CAPTURE_CONFIG_DIR:config}});
  assert.equal(result.status,0,result.stderr?.toString());const saved=JSON.parse(result.stdout.subarray(4).toString());assert(saved.ok,JSON.stringify(saved));
  const probeBinary=probe || path.join(path.dirname(ffmpeg),'ffprobe');
  const info=JSON.parse(execFileSync(probeBinary,['-v','error','-show_entries','stream=codec_type,codec_name,sample_rate,channels','-of','json',saved.path]));
  assert.equal(info.streams.find(s=>s.codec_type==='audio').codec_name,'pcm_f32le');
  assert.equal(info.streams.find(s=>s.codec_type==='video').codec_name,'mpeg4');
  const raw=execFileSync(ffmpeg,['-v','error','-i',saved.path,'-map','0:a:0','-f','f32le','-']);
  assert.deepEqual(raw.subarray(0,samples.length*8),wav.subarray(44));
 } finally {fs.rmSync(temp,{recursive:true,force:true});}
});
