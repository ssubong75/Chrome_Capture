import { filename } from '../recorder/audio.js';
let current=null;
const report=state=>chrome.runtime.sendMessage({target:'video',type:'state',state});
async function cleanup(rec){
  clearTimeout(rec.timer);clearTimeout(rec.watchdog);
  rec.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});
  rec.source?.disconnect();rec.output?.stream.getTracks().forEach(t=>t.stop());
  if(rec.context && rec.context.state!=='closed')await rec.context.close();
}
async function finish(rec){
  if(rec.cancelled)return;
  try{
    await cleanup(rec);
    await report({phase:'saving',message:'MP4 저장 중…'});
    const blob=new Blob(rec.parts,{type:'video/mp4'});
    if(!blob.size)throw new Error('녹화 데이터가 비어 있습니다.');
    if(blob.size>40*1024*1024)throw new Error('녹화 파일이 저장 한도를 초과했습니다.');
    const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
    const name=filename().replace(/\.m4a$/,'.mp4');
    const saved=await chrome.runtime.sendMessage({target:'video',type:'save',url,filename:name});
    if(!saved?.ok)throw new Error(saved?.error || '공통 폴더 저장 실패. 저장 도우미를 설치해 주세요.');
    await report({phase:'done',message:'공통 폴더에 MP4 저장 완료',filename:saved.path || name});
  }catch(error){await report({phase:'error',message:error.message});}
  finally{if(current===rec)current=null;}
}
async function abort(rec,message){
  rec.cancelled=true;
  if(rec.recorder?.state==='recording')rec.recorder.stop();
  await cleanup(rec);if(current===rec)current=null;
  await report({phase:message?'error':'idle',message:message || '녹화 취소됨'});
}
async function start(message){
  if(current)return {ok:false,error:'녹화 또는 저장 중입니다.'};
  const rec={parts:[],cancelled:false};current=rec;
  try{
    const mimeType='video/mp4;codecs=avc1.42001f,mp4a.40.2';
    if(!MediaRecorder.isTypeSupported(mimeType))throw new Error('현재 Chrome은 H.264/AAC MP4 녹화를 지원하지 않습니다. Chrome을 업데이트해 주세요.');
    rec.stream=await navigator.mediaDevices.getUserMedia({
      audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:message.streamId}},
      video:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:message.streamId,maxFrameRate:30}}
    });
    rec.context=new AudioContext({sampleRate:48000});
    rec.source=rec.context.createMediaStreamSource(rec.stream);
    rec.output=rec.context.createMediaStreamDestination();rec.output.channelCount=2;rec.output.channelCountMode='explicit';
    rec.source.connect(rec.context.destination);rec.source.connect(rec.output);await rec.context.resume();
    const stream=new MediaStream([...rec.stream.getVideoTracks(),...rec.output.stream.getAudioTracks()]);
    rec.recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:8000000,audioBitsPerSecond:128000});
    rec.recorder.ondataavailable=e=>{if(e.data.size)rec.parts.push(e.data);};
    rec.recorder.onstop=()=>void finish(rec);
    rec.recorder.onerror=e=>void abort(rec,e.error?.message || '영상 녹화 오류');
    rec.stream.getTracks().forEach(t=>t.onended=()=>void abort(rec,'녹화 중 탭 연결이 종료됐습니다.'));
    rec.recorder.start(1000);
    rec.timer=setTimeout(()=>{if(rec.recorder.state==='recording')rec.recorder.stop();},message.seconds*1000);
    rec.watchdog=setTimeout(()=>void abort(rec,'영상 녹화 시간이 초과됐습니다.'),(message.seconds+15)*1000);
    await report({phase:'recording',seconds:message.seconds,startedAt:Date.now()});return {ok:true};
  }catch(error){await abort(rec,error.message);return {ok:false,error:error.message};}
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id || message.target!=='video-offscreen')return;
  (async()=>{
    if(message.type==='status')return {busy:!!current};
    if(message.type==='start')return start(message);
    if(message.type==='cancel'){
      if(current?.recorder?.state==='inactive')return {ok:false,error:'파일 저장 중입니다.'};
      if(current)await abort(current);return {ok:true};
    }
  })().then(respond,error=>respond({ok:false,error:error.message}));return true;
});
