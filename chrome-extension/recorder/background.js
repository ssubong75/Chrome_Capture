import { setAudioBadge } from '../badge.js';
import { nativeMessage } from '../native.js';
import { duration, recordingFormat } from './audio.js';
let creating;
let starting = false;

async function offscreen() {
  const contexts = await chrome.runtime.getContexts({contextTypes: ['OFFSCREEN_DOCUMENT']});
  if (contexts.length) return;
  if (!creating) creating = chrome.offscreen.createDocument({
    url: 'recorder/offscreen.html', reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    justification: '사용자가 요청한 탭 소리 녹음과 녹음 중 소리 재생'
  }).finally(() => { creating = null; });
  await creating;
}

async function setState(state) {
  await chrome.storage.session.set({audioState:state});
  await setAudioBadge(state);
}

async function start(tabId) {
  if (starting) return {ok:false, error:'녹음 준비 중입니다.'};
  starting = true;
  try {
    await offscreen();
    const current = await chrome.runtime.sendMessage({target:'offscreen', type:'status'});
    if (current?.busy) return {ok:false, error:'현재 녹음 또는 저장 중입니다.'};
    const settings = await chrome.storage.local.get({seconds:5,format:'m4a'});
    const seconds = duration(settings.seconds);
    const tab = tabId ? await chrome.tabs.get(tabId) : (await chrome.tabs.query({active:true, currentWindow:true}))[0];
    if (!tab?.id) throw new Error('녹음할 탭을 찾을 수 없습니다.');
    if (tab.url && /^(chrome|edge|about|chrome-extension):/.test(tab.url)) throw new Error('소리가 재생되는 웹사이트 탭에서 실행하세요.');
    const streamId = await chrome.tabCapture.getMediaStreamId({targetTabId:tab.id});
    await setState({phase:'starting', seconds});
    const result = await chrome.runtime.sendMessage({target:'offscreen',type:'start',streamId,seconds,format:recordingFormat(settings.format)});
    if (!result?.ok) throw new Error(result?.error || '녹음을 시작하지 못했습니다.');
    return {ok:true};
  } catch (error) {
    await setState({phase:'error',message:error.message});
    return {ok:false,error:error.message};
  } finally { starting = false; }
}

chrome.commands.onCommand.addListener((name, tab) => {
  if (name === 'record') void start(tab?.id);
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'audio') return;
  (async () => {
    if (message.type === 'start') return start();
    if (message.type === 'cancel') return chrome.runtime.sendMessage({target:'offscreen',type:'cancel'});
    if (message.type === 'state') { await setState(message.state); return {ok:true}; }
    if (message.type === 'encode-audio') {
      if (!/^data:audio\/wav;base64,/.test(message.url || '')) throw new Error('녹음 데이터 형식이 잘못되었습니다.');
      return nativeMessage({action:'encodeAudio',dataUrl:message.url});
    }
    if (message.type === 'save-audio') {
      if (!/^data:audio\/mp4;base64,/.test(message.url) || !/^\d{6}_\d{4}\.m4a$/.test(message.filename)) throw new Error('오디오 파일 형식이 잘못되었습니다.');
      const result = await nativeMessage({action:'saveCapture',dataUrl:message.url,filename:message.filename});
      if (!result.ok) throw new Error(result.error || '지정 폴더 저장 실패');
      return result;
    }
    if (message.type === 'download') {
      const id = await chrome.downloads.download({url:message.url,filename:`Chrome Capture/${message.filename}`,saveAs:false,conflictAction:'uniquify'});
      await setState({phase:'saving',message:'다운로드 폴더에 저장 중…',downloadId:id,filename:message.filename,notice:message.notice});
      const [item] = await chrome.downloads.search({id});
      if (item?.state === 'complete') await setState({phase:'done',message:'저장 완료',filename:item.filename,downloadId:id,notice:message.notice});
      return {ok:true,id};
    }
    if (message.type === 'show-file') {
      const {audioState:state} = await chrome.storage.session.get('audioState');
      if (state?.downloadId) chrome.downloads.show(state.downloadId);
      return {ok:true};
    }
    throw new Error('알 수 없는 요청입니다.');
  })().then(respond, error => respond({ok:false,error:error.message}));
  return true;
});

chrome.downloads.onChanged.addListener(async delta => {
  const {audioState:state} = await chrome.storage.session.get('audioState');
  if (state?.downloadId !== delta.id) return;
  if (delta.state?.current === 'complete') {
    const [item] = await chrome.downloads.search({id:delta.id});
    await setState({...state,phase:'done',message:'저장 완료',filename:item?.filename || state.filename});
  } else if (delta.state?.current === 'interrupted') {
    await setState({...state,phase:'error',message:`다운로드 실패: ${delta.error?.current || '중단됨'}`});
  }
});
