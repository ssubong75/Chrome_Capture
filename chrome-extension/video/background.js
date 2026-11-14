import { offscreen } from '../recorder/background.js';
import { nativeMessage } from '../native.js';
let starting=false;
const state=value=>chrome.storage.session.set({videoState:value});
async function startVideo(tabId){
    if(starting)return {ok:false,error:'녹화 준비 중입니다.'};
    starting=true;
    try{
      await offscreen();
      for(const target of ['offscreen','video-offscreen']){
        if((await chrome.runtime.sendMessage({target,type:'status'}))?.busy)throw new Error('다른 녹음·녹화 또는 저장이 진행 중입니다.');
      }
      const tab=tabId ? await chrome.tabs.get(tabId) : (await chrome.tabs.query({active:true,currentWindow:true}))[0];
      if(!tab?.id || /^(chrome|edge|about|chrome-extension):/.test(tab.url || ''))throw new Error('녹화할 웹사이트 탭에서 실행하세요.');
      const {videoSeconds=5}=await chrome.storage.local.get('videoSeconds');
      const seconds=[5,8,10,12,15,20].includes(Number(videoSeconds))?Number(videoSeconds):5;
      await state({phase:'starting',message:'녹화 준비 중…'});
      const streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:tab.id});
      const result=await chrome.runtime.sendMessage({target:'video-offscreen',type:'start',streamId,seconds});
      if(!result?.ok)throw new Error(result?.error || '녹화 시작 실패');
      return result;
    }catch(error){await state({phase:'error',message:error.message});throw error;}
    finally{starting=false;}
}
chrome.commands.onCommand.addListener((name,tab)=>{
  if(name==='record-video')void startVideo(tab?.id).catch(()=>{});
});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id || message.target!=='video')return;
  (async()=>{
    if(message.type==='state'){await state(message.state);return {ok:true};}
    if(message.type==='save'){
      if(!/^data:video\/mp4;base64,/.test(message.url || '') || !/^\d{6}_\d{6}\.mp4$/.test(message.filename || ''))throw new Error('잘못된 영상 파일입니다.');
      if(!/^data:audio\/wav;base64,/.test(message.audioUrl || ''))throw new Error('PCM 오디오 데이터가 없습니다.');
      return nativeMessage({action:'saveVideoCapture',dataUrl:message.url,audioDataUrl:message.audioUrl,filename:message.filename});
    }
    if(message.type==='cancel')return chrome.runtime.sendMessage({target:'video-offscreen',type:'cancel'});
    if(message.type!=='start')throw new Error('알 수 없는 영상 요청입니다.');
    return startVideo();
  })().then(respond,error=>respond({ok:false,error:error.message}));
  return true;
});
