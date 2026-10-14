import { filename, duration, recordingFormat, encodeWav } from './audio.js';
let recording = null;
let busy = false;
const report = state => chrome.runtime.sendMessage({target:'audio',type:'state',state});

async function cleanup(rec) {
  clearTimeout(rec.watchdog);
  if (rec.processor) { rec.processor.port.onmessage = null; rec.processor.disconnect(); }
  rec.source?.disconnect();
  rec.stream?.getTracks().forEach(track => track.stop());
  if (rec.context && rec.context.state !== 'closed') await rec.context.close();
}

async function fail(rec, error) {
  if (recording !== rec || rec.finishing) return;
  rec.finishing = true;
  await cleanup(rec);
  recording = null; busy = false;
  await report({phase:'error',message:error.message});
}

async function save(rec) {
  if (rec.finishing || recording !== rec) return;
  rec.finishing = true;
  try {
    const blob = new Blob([encodeWav(rec.chunks, rec.targetFrames, rec.context.sampleRate)], {type:'audio/wav'});
    if (!blob.size) throw new Error('녹음 데이터가 비어 있습니다.');
    await cleanup(rec);
    const name = filename(new Date(), rec.format);
    await report({phase:'saving',message:`${rec.format.toUpperCase()} 저장 중…`});
    const pcmUrl = await new Promise((resolve,reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
    });
    const encoded = await chrome.runtime.sendMessage({target:'audio',type:'encode-audio',url:pcmUrl});
    if (!encoded?.ok || !/^data:audio\/mp4;base64,/.test(encoded.dataUrl || '')) {
      throw new Error(encoded?.error || 'AAC 인코딩 실패. 저장 도우미를 다시 설치해 주세요.');
    }
    const url = encoded.dataUrl;
    let notice;
    const saved = await chrome.runtime.sendMessage({target:'audio',type:'save-audio',url,filename:name});
    if (saved?.ok) {
      await report({phase:'done',message:'지정 폴더에 저장 완료',filename:saved.path || name});
      return;
    }
    notice = `지정 폴더 저장 실패: ${saved?.error || '저장 도우미 연결 실패'} 다운로드 폴더에 대신 저장했습니다.`;
    const result = await chrome.runtime.sendMessage({target:'audio',type:'download',url,filename:name,notice});
    if (!result?.ok) throw new Error(result?.error || '파일 저장 실패');
  } catch (error) {
    await cleanup(rec);
    await report({phase:'error',message:error.message});
  } finally { recording = null; busy = false; }
}

async function start(message) {
  if (busy) return {ok:false,error:'녹음 또는 저장 중입니다.'};
  busy = true;
  const rec = {seconds:duration(message.seconds),format:recordingFormat(message.format),chunks:[],frames:0,finishing:false};
  recording = rec;
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({
      audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:message.streamId}},video:false
    });
    if (recording !== rec) { await cleanup(rec); return {ok:false,error:'취소되었습니다.'}; }
    rec.context = new AudioContext({sampleRate:48000});
    await rec.context.audioWorklet.addModule(chrome.runtime.getURL('recorder/capture-worklet.js'));
    if (recording !== rec) { await cleanup(rec); return {ok:false,error:'취소되었습니다.'}; }
    rec.targetFrames = Math.round(rec.seconds * rec.context.sampleRate);
    rec.source = rec.context.createMediaStreamSource(rec.stream);
    rec.processor = new AudioWorkletNode(rec.context,'recoder-capture');
    rec.processor.port.onmessage = ({data}) => {
      if (rec.finishing || recording !== rec) return;
      rec.chunks.push(data);
      rec.frames += data[0].length;
      if (rec.frames >= rec.targetFrames) void save(rec);
    };
    rec.source.connect(rec.context.destination); // Keep the original tab audible.
    rec.source.connect(rec.processor); rec.processor.connect(rec.context.destination); // Worklet output stays silent.
    for (const track of rec.stream.getTracks()) track.onended = () => void fail(rec,new Error('탭의 녹음이 중단되었습니다.'));
    await rec.context.resume();
    if (rec.context.state !== 'running') throw new Error('오디오 처리를 시작하지 못했습니다.');
    rec.watchdog = setTimeout(() => void fail(rec,new Error('녹음 시간이 초과되었습니다. 탭의 소리를 확인해 주세요.')), (rec.seconds+15)*1000);
    await report({phase:'recording',seconds:rec.seconds,format:rec.format,startedAt:Date.now()});
    return {ok:true};
  } catch (error) {
    if (recording === rec) await fail(rec,error);
    else await cleanup(rec);
    return {ok:false,error:error.message};
  }
}

chrome.runtime.onMessage.addListener((message,sender,respond) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'offscreen') return;
  (async () => {
    if (message.type === 'status') return {busy};
    if (message.type === 'start') return start(message);
    if (message.type === 'cancel') {
      if (recording?.finishing) return {ok:false,error:'파일을 저장 중입니다.'};
      const rec = recording; recording = null;
      if (rec) { rec.finishing=true; await cleanup(rec); }
      busy=false; await report({phase:'idle',message:'녹음 취소됨'}); return {ok:true};
    }
    return {ok:false,error:'알 수 없는 요청입니다.'};
  })().then(respond,error => respond({ok:false,error:error.message}));
  return true;
});
