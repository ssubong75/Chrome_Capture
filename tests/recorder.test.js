import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('worklet copies channels and keeps source playback unchanged',async()=> {
 let Processor,posted;const sandbox=vm.createContext({AudioWorkletProcessor:class{constructor(){this.port={postMessage:v=>{posted=v;}};}},registerProcessor:(_,klass)=>{Processor=klass;}});
 vm.runInContext(await readFile(new URL('../chrome-extension/recorder/capture-worklet.js',import.meta.url),'utf8'),sandbox);
 const original=new Float32Array([.2,-.4]);const p=new Processor();assert.equal(p.process([[original]]),true);
 assert.deepEqual([...posted[0]],[...original]);assert.deepEqual([...posted[1]],[...original]);assert.notEqual(posted[0].buffer,original.buffer);
});

test('MP3 lifecycle: exact target samples, duplicate prevention, cancel, shared native saving, download fallback',async()=> {
 let listener,processor;const messages=[],tracks=[],contexts=[];let nativeAvailable=true;
 globalThis.chrome={runtime:{id:'test',getURL:s=>s,onMessage:{addListener:f=>{listener=f;}},sendMessage:async msg=>{
  messages.push(msg);
  if(msg.type==='save-audio')return nativeAvailable ? {ok:true,path:'shared/'+msg.filename}:{ok:false,error:'test native unavailable'};
  return {ok:true};
 }}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{
  const t={stopped:false,stop(){this.stopped=true;}};tracks.push(t);return {getTracks:()=>[t]};
 }}}});
 globalThis.AudioContext=class{
  constructor(){this.sampleRate=32000;this.state='running';this.audioWorklet={addModule:async url=>{assert.equal(url,'recorder/capture-worklet.js');}};this.destination={};contexts.push(this);}
  createMediaStreamSource(){return {connect(){},disconnect(){}};}async resume(){}async close(){this.state='closed';}
 };
 globalThis.AudioWorkletNode=class{constructor(){this.port={onmessage:null};processor=this;}connect(){}disconnect(){}};
 globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result='data:'+blob.type+';base64,'+Buffer.from(bytes).toString('base64');this.onload();});}};
 await import('../chrome-extension/recorder/offscreen.js');
 const send=(type,extra={})=>new Promise(resolve=>listener({target:'offscreen',type,...extra},{id:'test'},resolve));
 const done=async()=>{for(let n=0;n<150 && (await send('status')).busy;n++)await new Promise(r=>setTimeout(r,5));assert.equal((await send('status')).busy,false);};
 for(const seconds of [3,5]){
  assert.equal((await send('start',{streamId:'test',seconds,format:'wav'})).ok,true);
  assert.equal((await send('start',{streamId:'duplicate',seconds})).ok,false);
  processor.port.onmessage({data:[new Float32Array(seconds*32000+128),new Float32Array(seconds*32000+128)]});await done();
  const saved=messages.filter(x=>x.type==='save-audio').at(-1);assert.match(saved.filename,/^\d{6}_\d{4}\.mp3$/);assert.match(saved.url,/^data:audio\/mpeg;base64,/);
  assert.equal(messages.at(-1).state.phase,'done');assert.match(messages.at(-1).state.filename,/^shared\//);
 }
 assert.equal(tracks.every(x=>x.stopped),true);assert.equal(contexts.every(x=>x.state==='closed'),true);
 let saves=messages.filter(x=>x.type==='save-audio').length;
 await send('start',{streamId:'cancel',seconds:5});assert.equal((await send('cancel')).ok,true);assert.equal(messages.filter(x=>x.type==='save-audio').length,saves);
 nativeAvailable=false;await send('start',{streamId:'fallback',seconds:3});processor.port.onmessage({data:[new Float32Array(96128),new Float32Array(96128)]});await done();
 assert.match(messages.filter(x=>x.type==='download').at(-1).notice,/폴더 저장 실패/);
 navigator.mediaDevices.getUserMedia=async()=>{throw new Error('capture denied');};assert.equal((await send('start',{streamId:'denied'})).ok,false);assert.equal((await send('status')).busy,false);
});
