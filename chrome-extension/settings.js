import {duration} from './recorder/audio.js';
const $=id=>document.getElementById(id);
let busy=false;
function setBusy(value){busy=value;for(const id of ['chooseBtn','openBtn','resetBtn'])$(id).disabled=value;}
async function action(type,success=''){
 if(busy)return;setBusy(true);$('status').textContent=type==='chooseSaveDirectory' ? '폴더 선택 창을 여는 중…':'확인 중…';
 try{
  const result=await chrome.runtime.sendMessage({target:'capture',type:'NATIVE_ACTION',action:type});
  if(result?.ok){$('saveDirectory').textContent=result.path;await chrome.storage.local.set({sharedFolderPath:result.path});$('status').textContent=success;}
  else if(result?.cancelled)$('status').textContent='폴더 선택을 취소했습니다.';
  else{$('saveDirectory').textContent='저장 도우미에 연결되지 않았습니다.';$('status').textContent=result?.error || '저장 도우미를 먼저 설치해 주세요.';}
 }catch(error){$('status').textContent=error.message;}finally{setBusy(false);}
}
$('chooseBtn').onclick=()=>action('chooseSaveDirectory','공통 저장 폴더를 변경했습니다.');
$('openBtn').onclick=()=>action('openSaveDirectory','공통 저장 폴더를 열었습니다.');
$('resetBtn').onclick=()=>action('resetSaveDirectory','기본 저장 폴더로 되돌렸습니다.');
$('shortcutBtn').onclick=()=>chrome.tabs.create({url:'chrome://extensions/shortcuts'});
for(const el of document.querySelectorAll('[name=seconds]'))el.onchange=()=>{if(el.checked)void chrome.storage.local.set({seconds:duration(el.value),format:'mp3'});};
async function init(){
 const {seconds}=await chrome.storage.local.get({seconds:5});document.querySelector(`[name=seconds][value="${duration(seconds)}"]`).checked=true;
 const commands=await chrome.commands.getAll();
 $('audioShortcut').textContent='녹음: '+(commands.find(c=>c.name==='record')?.shortcut || '미등록');
 $('captureShortcut').textContent='화면 캡처: '+(commands.find(c=>c.name==='capture-delayed')?.shortcut || '미등록');
 await action('getSaveDirectory');
}
void init();
