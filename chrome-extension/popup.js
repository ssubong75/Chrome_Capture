const tabs=['audio','capture','video'];
async function select(name,focus=false) {
  for(const id of tabs){
    const active=id===name;const button=document.getElementById(id+'-tab');
    button.setAttribute('aria-selected',String(active));button.tabIndex=active ? 0 : -1;
    document.getElementById(id+'-panel').hidden=!active;
  }
  if(focus)document.getElementById(name+'-tab').focus();
  await chrome.storage.local.set({selectedMode:name});
}
for(const name of tabs){
 const button=document.getElementById(name+'-tab');button.onclick=()=>select(name);
 button.onkeydown=event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();void select(tabs[(tabs.indexOf(name)+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length],true);}};
}
chrome.storage.local.get('selectedMode').then(data=>{if(tabs.includes(data.selectedMode))void select(data.selectedMode);});
