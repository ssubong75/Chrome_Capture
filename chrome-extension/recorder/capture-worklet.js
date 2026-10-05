class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0];
    if (channels?.length) {
      const left = channels[0].slice();
      const right = (channels[1] || channels[0]).slice();
      this.port.postMessage([left, right], [left.buffer, right.buffer]);
    }
    return true;
  }
}
registerProcessor('recoder-capture', RecorderProcessor);
