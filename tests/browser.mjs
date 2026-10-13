import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const profile=await mkdtemp(path.join(tmpdir(),'chrome-capture-browser-'));
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><head><style>body{margin:0;background:#eee}.player{position:relative;width:400px;height:240px;margin:40px}video{width:400px;height:240px;background:#278e9e}.caption{position:absolute;bottom:20px;color:#fff;background:#222;padding:10px}</style></head><body><div class="player"><video controls></video><div class="caption">Synthetic test caption</div></div></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let context;
try{
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1000,height:720},args:[`--disable-extensions-except=${root}/chrome-extension`,`--load-extension=${root}/chrome-extension`]});
 let [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker',{timeout:30000});
 const id=worker.url().split('/')[2];
 await worker.evaluate(()=>{
  globalThis.testSaved=[];
  chrome.runtime.sendNativeMessage=(host,payload,callback)=>{
   if(payload.action==='saveCapture'){globalThis.testSaved.push(payload);callback({ok:true,path:'/synthetic/shared/'+payload.filename});}
   else callback({ok:true,path:'/synthetic/shared'});
  };
 });
 const popup=await context.newPage();const errors=[];popup.on('pageerror',e=>errors.push(e.message));
 await popup.goto(`chrome-extension://${id}/popup.html`);
 await popup.waitForFunction(()=>document.getElementById('audio-shortcut').textContent.length>0);
 assert.equal(await popup.locator('[name=seconds]').count(),2);
 assert.equal(await popup.locator('[name=seconds][value="5"]').isChecked(),true);
 assert.equal(await popup.locator('[name=format]').count(),0);
 await popup.locator('[name=seconds][value="3"]').check();
 assert.equal(await popup.evaluate(async()=> (await chrome.storage.local.get('seconds')).seconds),3);
 await popup.locator('#capture-tab').click();assert.equal(await popup.locator('#capture-panel').isVisible(),true);
 assert.equal(await popup.locator('#audio-panel').isVisible(),false);
 assert.equal(await popup.locator('#capture-format').count(),0);
 await popup.locator('#capture-delaySeconds').selectOption('0');
 await popup.locator('#capture-cropToVideo').check();await popup.locator('#capture-hideVideoOverlays').check();
 // Retired settings cannot change the fixed format or timestamp filename.
 await popup.evaluate(()=>chrome.storage.sync.set({format:'jpeg',filenamePrefix:'old-prefix',delaySeconds:0,cropToVideo:true,hideVideoOverlays:true}));
 const scene=await context.newPage();await scene.goto('http://127.0.0.1:'+server.address().port+'/');await scene.bringToFront();
 const capture=await popup.evaluate(()=>chrome.runtime.sendMessage({target:'capture',type:'CAPTURE_NOW'}));assert.equal(capture.ok,true,JSON.stringify(capture));
 const saved=await worker.evaluate(()=>globalThis.testSaved.at(-1));assert.match(saved.filename,/^\d{6}_\d{4}\.png$/);assert.match(saved.dataUrl,/^data:image\/png;base64,/);
 const png=Buffer.from(saved.dataUrl.split(',')[1],'base64');assert.equal(png.readUInt32BE(16),400);assert.equal(png.readUInt32BE(20),240);
 assert.equal(await scene.locator('video').evaluate(v=>v.controls),true);
 assert.equal(await scene.locator('[data-cvc-clean-hidden]').count(),0);
 // A still capture must not clear an ongoing recording badge.
 await popup.evaluate(()=>chrome.runtime.sendMessage({target:'audio',type:'state',state:{phase:'recording',seconds:5,startedAt:Date.now(),format:'mp3'}}));
 const concurrent=await popup.evaluate(()=>Promise.all([chrome.runtime.sendMessage({target:'capture',type:'CAPTURE_NOW',overrideSettings:{delaySeconds:1}}),chrome.runtime.sendMessage({target:'capture',type:'CAPTURE_NOW'})]));
 assert.equal(concurrent.filter(x=>x.ok).length,1);assert.match(concurrent.find(x=>!x.ok).error,/캡처 또는 저장 중/);
 assert.equal(await worker.evaluate(()=>chrome.action.getBadgeText({})), 'REC');
 await popup.evaluate(()=>chrome.runtime.sendMessage({target:'audio',type:'state',state:{phase:'idle'}}));
 const settings=await context.newPage();settings.on('pageerror',e=>errors.push(e.message));await settings.goto(`chrome-extension://${id}/settings.html`);
 await settings.waitForFunction(()=>document.getElementById('saveDirectory').textContent==='/synthetic/shared');
 assert.equal(await settings.locator('#chooseBtn').count(),1);assert.equal(await settings.locator('[name=seconds]').count(),2);
 await settings.locator('#chooseBtn').click();await settings.waitForFunction(()=>document.getElementById('status').textContent.includes('변경했습니다'));
 assert.equal(await settings.evaluate(async()=> (await chrome.storage.local.get('sharedFolderPath')).sharedFolderPath),'/synthetic/shared');
 await settings.locator('[name=seconds][value="5"]').check();
 await popup.reload();await popup.locator('#audio-tab').click();await popup.waitForFunction(()=>document.querySelector('[name=seconds][value="5"]').checked);
 await mkdir(path.join(root,'artifacts'),{recursive:true});
 await popup.screenshot({path:path.join(root,'artifacts/audio-popup.png')});
 await popup.locator('#capture-tab').click();await popup.screenshot({path:path.join(root,'artifacts/capture-popup.png')});
 assert.deepEqual(errors,[]);
 console.log('PASS: real MV3 load, 3/5-second UI, fixed MP3/PNG, common settings, date_time PNG, 400x240 crop, overlay restoration, concurrent capture lock, REC badge isolation.');
}finally{
 if(context)await context.close();await rm(profile,{recursive:true,force:true});await new Promise(resolve=>server.close(resolve));
}
