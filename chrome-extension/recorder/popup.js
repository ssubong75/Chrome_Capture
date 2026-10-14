import { duration, recordingFormat } from './audio.js';
const $ = id => document.getElementById('audio-'+id);
const send = type => chrome.runtime.sendMessage({target:'audio',type});
let state = {};
let pending = false;
function render() {
  const active = pending || ['starting','recording','saving'].includes(state.phase);
  $('record').disabled = active;
  $('cancel').hidden = state.phase !== 'recording';
  document.querySelectorAll('[name=seconds]').forEach(el => { el.disabled=active; });
  let text = state.message || '준비됨';
  if (state.phase === 'starting' || pending) text='녹음 준비 중…';
  if (state.phase === 'recording') {
    const left=Math.max(0,state.seconds-(Date.now()-state.startedAt)/1000);
    text=`${(state.format || 'm4a').toUpperCase()} 녹음 중 · ${left.toFixed(1)}초 남음`;
  }
  $('status').textContent=text;
  $('file').textContent=state.filename || '';
  $('notice').textContent=state.notice || '';
}
async function refresh() {
  const [local,session,commands]=await Promise.all([
    chrome.storage.local.get({seconds:5,format:'m4a',sharedFolderPath:''}),chrome.storage.session.get('audioState'),chrome.commands.getAll()
  ]);
  document.querySelector(`[name=seconds][value="${duration(local.seconds)}"]`).checked=true;
  $('folder').textContent=local.sharedFolderPath ? `공통 저장 폴더: ${local.sharedFolderPath}` : '공통 저장 폴더: 설정에서 확인';
  const key=commands.find(c=>c.name==='record')?.shortcut;
  $('shortcut').textContent=key ? `녹음 단축키: ${key}` : '단축키 미등록 · 설정에서 지정해 주세요.';
  state=session.audioState || {};render();
}
document.querySelectorAll('[name=seconds]').forEach(el=>el.addEventListener('change',async()=> {
  if(el.checked) await chrome.storage.local.set({seconds:Number(el.value)});
}));
$('record').onclick=async()=> {
  pending=true;render();
  try {
    const checked=document.querySelector('[name=seconds]:checked');
    await chrome.storage.local.set({seconds:Number(checked.value),format:'m4a'});
    const result=await send('start');if(!result?.ok) state={phase:'error',message:result?.error || '녹음 시작 실패'};
  } catch(error) { state={phase:'error',message:error.message}; }
  finally {pending=false;await refresh();}
};
$('cancel').onclick=async()=> {await send('cancel');await refresh();};
$('settings').onclick=()=>chrome.runtime.openOptionsPage();
chrome.storage.onChanged.addListener(()=>void refresh());
setInterval(render,100);
void refresh();
