import { Mp3Encoder } from './vendor/lamejs.js';
import { encodeWav } from './audio.js';

export function encodeMp3(chunks, frames, sampleRate) {
  const pcm = new DataView(encodeWav(chunks, frames, sampleRate));
  const encoder = new Mp3Encoder(2, sampleRate, 192);
  const parts = [];
  for (let offset = 0; offset < frames; offset += 1152) {
    const length = Math.min(1152, frames - offset);
    const left = new Int16Array(length), right = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      left[i] = pcm.getInt16(44 + (offset + i) * 4, true);
      right[i] = pcm.getInt16(46 + (offset + i) * 4, true);
    }
    const bytes = encoder.encodeBuffer(left, right);
    if (bytes.length) parts.push(new Uint8Array(bytes));
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  return new Blob(parts, {type:'audio/mpeg'});
}
