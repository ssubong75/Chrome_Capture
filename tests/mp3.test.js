import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeMp3} from '../chrome-extension/recorder/mp3.js';

test('bundled encoder produces MPEG Layer III for 3 and 5 seconds',async()=>{
  for (const seconds of [3,5]) {
    const samples=Float32Array.from({length:seconds*32000+128},(_,i)=>.2*Math.sin(2*Math.PI*440*i/32000));
    const blob=encodeMp3([[samples,samples]],seconds*32000,32000);
    const bytes=new Uint8Array(await blob.arrayBuffer());
    assert.equal(blob.type,'audio/mpeg');
    assert.equal(bytes[0],255);assert.equal(bytes[1]&224,224);
    assert.equal((bytes[1]>>1)&3,1); // MPEG Layer III.
    assert.equal((bytes[2]>>2)&3,2); // 32kHz in MPEG-1.
    assert.ok(bytes.length>seconds*20000);
  }
  assert.throws(()=>encodeMp3([[new Float32Array(10)]],100,32000),/부족/);
});
