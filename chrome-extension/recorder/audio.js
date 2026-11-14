export function duration(value) { return [3,5].includes(Number(value)) ? Number(value) : 5; }
export function recordingFormat(value) { return 'wav'; }

export function filename(now = new Date(), format = 'wav') {
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${pad(now.getFullYear()%100)}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${stamp}.${recordingFormat(format)}`;
}

// Float32 PCM stereo, measured in samples rather than an approximate wall-clock timer.
export function encodeWav(chunks, frames, sampleRate) {
  const buffer = new ArrayBuffer(44 + frames * 8);
  const view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset+i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true);
  text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 8, true);
  view.setUint16(32, 8, true); view.setUint16(34, 32, true);
  text(36, 'data'); view.setUint32(40, frames * 8, true);
  let frame = 0;
  for (const [left, right = left] of chunks) {
    for (let i = 0; i < left.length && frame < frames; i++, frame++) {
      for (let ch = 0; ch < 2; ch++) {
        const value = ch ? right[i] : left[i];
        view.setFloat32(44 + frame * 8 + ch * 4, value, true);
      }
    }
    if (frame === frames) break;
  }
  if (frame !== frames) throw new Error('녹음 샘플이 부족합니다. 다시 녹음해 주세요.');
  return buffer;
}
