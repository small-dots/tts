export const SAMPLE_RATE = 24000;
export function wavHeader(byteLength) {
  if (!byteLength || byteLength % 2 || byteLength > 0xffffffff - 36)
    throw new Error("PCM 音频为空或包含不完整的采样数据");
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const text = (offset, value) =>
    header.set(new TextEncoder().encode(value), offset);
  text(0, "RIFF");
  view.setUint32(4, byteLength + 36, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, byteLength, true);
  return header;
}
export function pcmToWav(pcm) {
  const result = new Uint8Array(44 + pcm.length);
  result.set(wavHeader(pcm.length));
  result.set(pcm, 44);
  return result;
}
export class PcmDecoder {
  remainder = null;
  get hasRemainder() {
    return this.remainder !== null;
  }
  push(bytes) {
    let input = bytes;
    if (this.hasRemainder) {
      input = new Uint8Array(bytes.length + 1);
      input[0] = this.remainder;
      input.set(bytes, 1);
      this.remainder = null;
    }
    if (input.length % 2) this.remainder = input[input.length - 1];
    const count = Math.floor(input.length / 2),
      samples = new Float32Array(count);
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    for (let i = 0; i < count; i++)
      samples[i] = view.getInt16(i * 2, true) / 32768;
    return samples;
  }
}

// All stored bins represent the same number of samples. Compact pairs only
// at a bin boundary, and double the width of every future bin as well.
export class PeakAccumulator {
  constructor() {
    this.bucketSize = 600;
    this.values = [];
    this.pendingCount = 0;
    this.pendingMax = 0;
  }
  push(samples) {
    for (const sample of samples) {
      this.pendingMax = Math.max(this.pendingMax, Math.abs(sample));
      this.pendingCount++;
      if (this.pendingCount === this.bucketSize) {
        this.values.push(this.pendingMax);
        this.pendingCount = 0;
        this.pendingMax = 0;
        if (this.values.length === 600) {
          const reduced = [];
          for (let i = 0; i < this.values.length; i += 2)
            reduced.push(Math.max(this.values[i], this.values[i + 1]));
          this.values = reduced;
          this.bucketSize *= 2;
        }
      }
    }
    return this.pendingCount
      ? [...this.values, this.pendingMax]
      : this.values.slice();
  }
}
