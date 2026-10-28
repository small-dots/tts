import test from "node:test";
import assert from "node:assert/strict";
import { pcmToWav, PcmDecoder, PeakAccumulator } from "../shared/audio.js";
import { validateSpeech } from "../shared/validation.js";

test("WAV header encodes mono 24kHz PCM16 with correct length and unchanged samples", () => {
  const wav = pcmToWav(new Uint8Array([0, 128, 0, 0, 255, 127]));
  const view = new DataView(wav.buffer);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), "RIFF");
  assert.equal(view.getUint32(4, true), 42);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint32(28, true), 48000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 6);
  assert.deepEqual([...wav.slice(44)], [0, 128, 0, 0, 255, 127]);
});
test("PCM decoder retains an odd byte between stream chunks", () => {
  const decoder = new PcmDecoder();
  assert.deepEqual([...decoder.push(Uint8Array.of(0))], []);
  assert.deepEqual([...decoder.push(Uint8Array.of(128, 0, 0, 255))], [-1, 0]);
  assert.equal(decoder.push(Uint8Array.of(127))[0], 32767 / 32768);
  assert.equal(decoder.hasRemainder, false);
});
test("WAV export rejects partial samples and empty audio", () => {
  assert.throws(() => pcmToWav(Uint8Array.of(1)), /PCM/);
  assert.throws(() => pcmToWav(new Uint8Array()), /PCM/);
});
test("mode validation requires instruction, reference transcript and authorization correctly", () => {
  assert.equal(
    validateSpeech(
      { mode: "design", text: "你好", instruction: "亲切", cfg_scale: "4" },
      false,
    ),
    null,
  );
  assert.ok(validateSpeech({ mode: "design", text: "你好" }, false));
  assert.ok(
    validateSpeech(
      { mode: "clone", text: "你好", ref_text: "原文", authorized: "true" },
      false,
    ),
  );
  assert.ok(
    validateSpeech({ mode: "clone", text: "你好", ref_text: "原文" }, true),
  );
  assert.equal(
    validateSpeech(
      { mode: "clone", text: "你好", ref_text: "原文", authorized: "true" },
      true,
    ),
    null,
  );
  assert.ok(
    validateSpeech(
      { mode: "direction", text: "你好", ref_text: "原文", authorized: "true" },
      true,
    ),
  );
});
test("invalid numeric values and unsupported modes never reach inference", () => {
  const fields = { mode: "design", text: "hello", instruction: "warm" };
  for (const extra of [
    { seed: "1.2" },
    { seed: "abc" },
    { seed: "-1" },
    { cfg_scale: "NaN" },
    { cfg_scale: "0" },
    { mode: "unknown" },
    { text: " ".repeat(10) },
  ]) {
    assert.ok(validateSpeech({ ...fields, ...extra }, false));
  }
  assert.equal(validateSpeech({ ...fields, seed: "0" }, false), null);
});

test("waveform peak positions remain aligned to time after compaction and arbitrary chunk splits", () => {
  const samples = new Float32Array(540000);
  samples[240000] = 1;
  const whole = new PeakAccumulator();
  const a = whole.push(samples);
  const split = new PeakAccumulator();
  let b;
  for (let offset = 0; offset < samples.length; offset += 3333)
    b = split.push(samples.subarray(offset, offset + 3333));
  assert.deepEqual(a, b);
  assert.equal(a.length, 450);
  assert.equal(a.indexOf(1), 200);
  assert.ok(Math.abs((a.indexOf(1) / a.length) * 22.5 - 10) < 0.05);
});
