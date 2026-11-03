const $=id=>document.getElementById('video-'+id);
let current={};let pending=false;
function render(){
  const active=pending || ['starting','recording','saving'].includes(current.phase);
  $('record').disabled=active;$('seconds').disabled=active;
  $('cancel').hidden=current.phase!=='recording';
  $('status').textContent=current.phase==='recording'
    ? `녹화 중 · ${Math.max(0,current.seconds-(Date.now()-current.startedAt)/1000).toFixed(1)}초 남음`
    : current.message || '준비됨';
  $('file').textContent=current.filename || '';
}
async function refresh(){
  const [local,session]=await Promise.all([chrome.storage.local.get({videoSeconds:5}),chrome.storage.session.get('videoState')]);
  $('seconds').value=String(local.videoSeconds);current=session.videoState || {};render();
}
$('seconds').onchange=()=>chrome.storage.local.set({videoSeconds:Number($('seconds').value)});
$('record').onclick=async()=>{
  pending=true;render();
  try{await chrome.storage.local.set({videoSeconds:Number($('seconds').value)});
    const result=await chrome.runtime.sendMessage({target:'video',type:'start'});
    if(!result?.ok){current={phase:'error',message:result?.error || '녹화 시작 실패'};}
  }catch(error){current={phase:'error',message:error.message};}
  finally{pending=false;render();}
};
$('cancel').onclick=()=>chrome.runtime.sendMessage({target:'video',type:'cancel'});
$('settings').onclick=()=>chrome.runtime.openOptionsPage();
chrome.storage.onChanged.addListener(()=>void refresh());setInterval(render,100);void refresh();
