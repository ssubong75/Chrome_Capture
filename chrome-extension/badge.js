// A still capture must never clear the badge of an ongoing audio recording.
let queue = Promise.resolve();
function update(kind,text) {
  queue=queue.catch(()=>{}).then(async()=> {
    const {captureBadges={audio:'',image:''}}=await chrome.storage.session.get('captureBadges');
    captureBadges[kind]=text;
    await chrome.storage.session.set({captureBadges});
    const badge=captureBadges.audio==='REC' ? 'REC' : captureBadges.image || captureBadges.audio;
    await chrome.action.setBadgeText({text:badge});
    await chrome.action.setBadgeBackgroundColor({color:badge==='REC' ? '#df4560':'#2478ba'});
  });
  return queue;
}
export const setAudioBadge = state => update('audio',state.phase==='recording' ? 'REC' : state.phase==='error' ? '!' : '');
export const setCaptureBadge = text => update('image',text);
