import {test} from 'node:test';
import assert from 'node:assert/strict';
import {duration,filename,recordingFormat} from '../chrome-extension/recorder/audio.js';
test('only 3/5 seconds; default and retired 10-second values resolve to 5',()=> {
 for(const value of [undefined,10,'10',99,0])assert.equal(duration(value),5);
 assert.equal(duration(3),3);assert.equal(duration('3'),3);assert.equal(duration('5'),5);
});
test('date_time WAV filename replaces legacy settings',()=> {
 const date=new Date(2026,9,5,19,39,51);
 for(const format of ['wav','mp3','m4a','mp4','webm',undefined]){
  assert.equal(recordingFormat(format),'wav');assert.equal(filename(date,format),'261005_193951.wav');
 }
});
