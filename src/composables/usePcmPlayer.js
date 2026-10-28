import { reactive, markRaw } from "vue";
import {
  PcmDecoder,
  PeakAccumulator,
  SAMPLE_RATE,
} from "../../shared/audio.js";

// Queue each decoded chunk once. Only schedule a small look-ahead window;
// pause/seek stop sources and restart from retained chunks without rebuilding PCM.
export function usePcmPlayer() {
  const state = reactive({
    playing: false,
    current: 0,
    duration: 0,
    volume: 0.8,
    streaming: false,
    peaks: [],
  });
  let context,
    gain,
    chunks = [],
    decoder = new PcmDecoder(),
    peaks = new PeakAccumulator(),
    sources = new Set(),
    timer,
    origin = 0,
    next = 0,
    finished = false;
  function ensure() {
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      gain = context.createGain();
      gain.connect(context.destination);
      gain.gain.value = state.volume;
    }
    return context;
  }
  async function unlock() {
    ensure();
    await context.resume();
  }
  function position() {
    return state.playing
      ? Math.min(state.duration, Math.max(0, context.currentTime - origin))
      : state.current;
  }
  function stopSources() {
    for (const source of sources) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    sources.clear();
  }
  function tick() {
    if (!state.playing || !context) return;
    state.current = position();
    if (finished && state.current >= state.duration && next >= state.duration) {
      state.current = state.duration;
      state.playing = false;
      clearInterval(timer);
      return;
    }
    const horizon = state.current + 0.6;
    for (const item of chunks) {
      const end = item.start + item.buffer.duration;
      if (end <= next + 0.00001) continue;
      if (item.start > horizon) break;
      const offset = Math.max(0, next - item.start),
        start = Math.max(
          context.currentTime + 0.01,
          origin + item.start + offset,
        );
      if (start > origin + item.start + offset + 0.02)
        origin = start - (item.start + offset);
      const source = context.createBufferSource();
      source.buffer = item.buffer;
      source.connect(gain);
      source.onended = () => {
        sources.delete(source);
        source.disconnect();
      };
      sources.add(source);
      source.start(start, offset);
      next = end;
    }
  }
  async function play() {
    await unlock();
    if (state.playing || !state.duration) return;
    if (state.current >= state.duration) state.current = 0;
    origin = context.currentTime + 0.035 - state.current;
    next = state.current;
    state.playing = true;
    tick();
    clearInterval(timer);
    timer = setInterval(tick, 35);
  }
  function pause() {
    state.current = position();
    state.playing = false;
    clearInterval(timer);
    stopSources();
  }
  function seek(seconds) {
    const resume = state.playing;
    pause();
    state.current = Math.max(0, Math.min(state.duration, seconds));
    next = state.current;
    if (resume) void play();
  }
  function setVolume(value) {
    state.volume = value;
    if (gain) gain.gain.value = value;
  }
  function reset() {
    pause();
    chunks = [];
    decoder = new PcmDecoder();
    peaks = new PeakAccumulator();
    state.current = 0;
    state.duration = 0;
    state.peaks = [];
    state.streaming = false;
    finished = false;
    next = 0;
  }
  function append(bytes) {
    const samples = decoder.push(bytes);
    if (!samples.length) return;
    ensure();
    const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
    chunks.push({ start: state.duration, buffer: markRaw(buffer) });
    state.duration += samples.length / SAMPLE_RATE;
    state.peaks = peaks.push(samples);
    if (state.playing) tick();
  }
  function begin() {
    reset();
    state.streaming = true;
  }
  function finish() {
    if (decoder.hasRemainder) throw new Error("模型返回的 PCM 数据不完整");
    state.streaming = false;
    finished = true;
  }
  async function dispose() {
    reset();
    if (context) {
      await context.close();
      context = null;
    }
  }
  return {
    state,
    unlock,
    play,
    pause,
    seek,
    setVolume,
    reset,
    append,
    begin,
    finish,
    dispose,
  };
}
