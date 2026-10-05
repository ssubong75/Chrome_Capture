export const HOST_NAME = 'com.ssubong.chrome_capture';
export function nativeMessage(payload) {
  return new Promise((resolve,reject)=> {
    chrome.runtime.sendNativeMessage(HOST_NAME,payload,response=> {
      const error=chrome.runtime.lastError;
      if(error)reject(new Error(error.message));
      else resolve(response || {ok:false,error:'저장 도우미의 응답이 없습니다.'});
    });
  });
}
