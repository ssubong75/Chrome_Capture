import {test} from 'node:test';
import assert from 'node:assert/strict';
test('image capture and clearing its badge cannot erase ongoing REC badge',async()=> {
 const stored={};let displayed;
 globalThis.chrome={storage:{session:{get:async key=>({[key]:structuredClone(stored[key])}),set:async values=>Object.assign(stored,structuredClone(values))}},action:{setBadgeText:async v=>{displayed=v.text;},setBadgeBackgroundColor:async()=>{}}};
 const {setAudioBadge,setCaptureBadge}=await import('../chrome-extension/badge.js');
 await setAudioBadge({phase:'recording'});assert.equal(displayed,'REC');
 await setCaptureBadge('…');assert.equal(displayed,'REC');
 await setCaptureBadge('✓');assert.equal(displayed,'REC');
 await setCaptureBadge('');assert.equal(displayed,'REC');
 await setAudioBadge({phase:'done'});assert.equal(displayed,'');
});
