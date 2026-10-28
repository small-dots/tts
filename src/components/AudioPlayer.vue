<script setup>
import { computed, onUnmounted, ref, watch } from "vue";
import { useStudio } from "../composables/useStudio.js";
import { formatTime } from "../presets.js";
import AppIcon from "./AppIcon.vue";
const props = defineProps({ record: { type: Object, default: null } });
const { player, busy } = useStudio();
const audio = ref(),
  playing = ref(false),
  current = ref(0),
  duration = ref(0),
  volume = ref(0.8),
  peaks = ref([]),
  loading = ref(false),
  audioError = ref("");
let loadController;
const live = computed(() => !!props.record?.live);
const active = computed(
  () =>
    !!props.record &&
    (live.value ? player.state.duration > 0 : props.record.hasAudio),
);
const isPlaying = computed(() =>
  live.value ? player.state.playing : playing.value,
);
const time = computed(() =>
  live.value ? player.state.current : current.value,
);
const total = computed(() =>
  live.value
    ? player.state.duration
    : duration.value || props.record?.duration || 0,
);
const progress = computed(() => (total.value ? time.value / total.value : 0));
const bars = computed(() => {
  const source = live.value ? player.state.peaks : peaks.value;
  return Array.from({ length: 72 }, (_, i) => {
    if (!source.length) return 0;
    const from = Math.floor((i * source.length) / 72),
      to = Math.max(from + 1, Math.floor(((i + 1) * source.length) / 72));
    let peak = 0;
    for (let k = from; k < to; k++) peak = Math.max(peak, source[k] || 0);
    return Math.max(0.035, peak);
  });
});
async function toggle() {
  if (!active.value) return;
  try {
    if (live.value) {
      if (isPlaying.value) player.pause();
      else await player.play();
    } else if (audio.value) {
      if (playing.value) audio.value.pause();
      else await audio.value.play();
    }
  } catch {
    audioError.value = "音频暂时无法播放，请重试或下载后播放";
  }
}
function seek(value) {
  if (!active.value) return;
  const seconds = Number(value);
  if (live.value) player.seek(seconds);
  else if (audio.value) {
    audio.value.currentTime = seconds;
    current.value = seconds;
  }
}
function replay() {
  seek(0);
  if (!isPlaying.value) void toggle();
}
function changeVolume(event) {
  volume.value = Number(event.target.value);
  player.setVolume(volume.value);
  if (audio.value) audio.value.volume = volume.value;
}
function waveSeek(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  seek(
    Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) *
      total.value,
  );
}
watch(
  () => [props.record?.id, !!props.record?.live],
  () => {
    audio.value?.pause();
    playing.value = false;
    current.value = 0;
    duration.value = 0;
    peaks.value = [];
    loading.value = false;
    audioError.value = "";
    loadController?.abort();
    if (props.record?.hasAudio && !props.record.live) {
      loadController = new AbortController();
      void loadWaveform(props.record.id, loadController.signal);
    }
  },
  { immediate: true },
);
async function loadWaveform(id, signal) {
  loading.value = true;
  let context;
  try {
    const response = await fetch(`/api/audio/${id}`, { signal });
    if (!response.ok) throw new Error();
    const bytes = await response.arrayBuffer();
    if (signal.aborted) return;
    context = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = await context.decodeAudioData(bytes);
    if (signal.aborted) return;
    const data = buffer.getChannelData(0);
    const result = [];
    for (let i = 0; i < 240; i++) {
      const from = Math.floor((i * data.length) / 240),
        to = Math.floor(((i + 1) * data.length) / 240);
      let peak = 0;
      for (let j = from; j < to; j++) peak = Math.max(peak, Math.abs(data[j]));
      result.push(peak);
    }
    peaks.value = result;
  } catch (err) {
    if (err.name !== "AbortError")
      audioError.value = "波形加载失败，仍可尝试播放或下载";
  } finally {
    if (context) void context.close();
    if (!signal.aborted) loading.value = false;
  }
}
onUnmounted(() => {
  loadController?.abort();
  audio.value?.pause();
});
</script>
<template>
  <div class="audio-player" :class="{ empty: !record }">
    <div class="player-topline">
      <span class="audio-format"
        ><span
          class="status-dot"
          :class="{ connected: record?.status === 'completed', pulse: busy }"
        ></span
        >{{
          record?.status === "generating"
            ? "流式生成中"
            : record
              ? "WAV AUDIO"
              : "等待生成"
        }}</span
      ><span class="audio-quality">24 kHz <span>·</span> Mono</span>
    </div>
    <div class="waveform" :class="{ playable: active }" @click="waveSeek">
      <svg
        viewBox="0 0 360 100"
        preserveAspectRatio="none"
        aria-label="音频波形"
      >
        <line x1="0" y1="50" x2="360" y2="50" class="wave-axis" />
        <rect
          v-for="(bar, index) in bars"
          :key="index"
          :x="index * 5 + 1"
          :y="50 - (record ? bar * 43 : 3)"
          width="2.4"
          :height="record ? Math.max(3, bar * 86) : 6"
          rx="1.2"
          :class="{
            played: record && index / 72 <= progress,
            placeholder: !record,
          }"
        />
        <line
          v-if="active && progress > 0"
          :x1="progress * 360"
          y1="5"
          :x2="progress * 360"
          y2="95"
          class="playhead"
        />
      </svg>
      <div v-if="!record" class="waveform-empty">
        <AppIcon name="AudioLines" :size="30" /><span>好声音，即将发生</span>
      </div>
      <div v-if="loading" class="waveform-loading">
        <AppIcon name="LoaderCircle" :size="20" class="spin" />
      </div>
    </div>
    <input
      class="playback-range"
      type="range"
      min="0"
      :max="total || 1"
      step="0.01"
      :value="time"
      :disabled="!active"
      :style="{ '--progress': `${progress * 100}%` }"
      aria-label="播放进度"
      @input="seek($event.target.value)"
    />
    <div class="player-times">
      <span>{{ formatTime(time) }}</span
      ><span>{{ formatTime(total) }}</span>
    </div>
    <div class="player-controls">
      <button
        class="icon-button replay-button"
        :disabled="!active"
        aria-label="重新播放"
        @click="replay"
      >
        <AppIcon name="RotateCcw" :size="17" /></button
      ><button
        class="main-play-button"
        :disabled="!active"
        :aria-label="isPlaying ? '暂停' : '播放'"
        @click="toggle"
      >
        <AppIcon
          :name="isPlaying ? 'Pause' : 'Play'"
          :size="21"
          :fill="isPlaying ? 'none' : 'currentColor'"
        />
      </button>
      <div class="volume-control">
        <AppIcon name="Volume2" :size="16" /><input
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="volume"
          aria-label="音量"
          @input="changeVolume"
        />
      </div>
    </div>
    <p v-if="audioError" class="field-hint">{{ audioError }}</p>
    <audio
      v-if="record?.hasAudio && !live"
      ref="audio"
      :src="`/api/audio/${record.id}`"
      preload="metadata"
      @timeupdate="current = $event.target.currentTime"
      @loadedmetadata="
        duration = $event.target.duration;
        $event.target.volume = volume;
      "
      @play="playing = true"
      @pause="playing = false"
      @ended="playing = false"
      @error="audioError = '音频文件不可用，请检查本地文件是否存在'"
    ></audio>
  </div>
</template>
