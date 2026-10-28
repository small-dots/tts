<script setup>
import { computed } from "vue";
import { useStudio } from "../composables/useStudio.js";
import { modeInfo, formatDate, formatTime } from "../presets.js";
import AudioPlayer from "./AudioPlayer.vue";
import AppIcon from "./AppIcon.vue";
const { selectedResult, latest, busy, navigate, selectResult, taskStatus } =
  useStudio();
const completed = computed(() => selectedResult.value?.status === "completed");
</script>
<template>
  <aside class="result-panel">
    <div class="result-heading">
      <h2><AppIcon name="Headphones" :size="18" />声音预览</h2>
      <span class="live-pill"><span></span>LIVE</span>
    </div>
    <div class="result-card">
      <AudioPlayer :record="selectedResult" />
      <div class="result-details">
        <template v-if="selectedResult"
          ><div class="result-title">
            <span class="result-mode-label">{{
              modeInfo[selectedResult.mode]?.name
            }}</span
            ><span class="completion-label" :class="{ generating: busy }"
              ><AppIcon
                :name="busy ? 'LoaderCircle' : 'CheckCheck'"
                :size="13"
                :class="{ spin: busy }"
              />{{ busy ? "生成中" : "已完成" }}</span
            >
          </div>
          <p class="result-text">{{ selectedResult.text }}</p>
          <div class="result-params">
            <span v-if="selectedResult.cfg_scale"
              >CFG {{ selectedResult.cfg_scale }}</span
            ><span
              >Seed
              {{
                selectedResult.seed === "" || selectedResult.seed === null
                  ? "随机"
                  : selectedResult.seed
              }}</span
            ><span>{{ formatDate(selectedResult.createdAt) }}</span>
          </div></template
        >
        <div v-else class="result-empty-copy">
          <strong>你的下一段好声音，从这里开始</strong>
          <p>完成左侧设置，点击「生成语音」<br />即可在这里实时聆听与下载</p>
        </div>
        <a
          v-if="completed"
          class="download-button"
          :href="`/api/audio/${selectedResult.id}/download`"
          download
          ><AppIcon name="ArrowDownToLine" :size="16" />下载音频<span
            >WAV</span
          ></a
        ><button v-else class="download-button" disabled>
          <AppIcon name="ArrowDownToLine" :size="16" />下载音频<span>WAV</span>
        </button>
      </div>
    </div>
    <div class="recent-heading">
      <h3>
        最近生成<span v-if="latest.length">{{ latest.length }}</span>
      </h3>
      <button class="text-button" @click="navigate('history')">
        查看全部<AppIcon name="ArrowRight" :size="13" />
      </button>
    </div>
    <div v-if="!latest.length" class="recent-empty">
      <span><AppIcon name="History" :size="24" /></span
      ><strong>还没有生成记录</strong>
      <p>每一次灵感，都会被好好保存</p>
    </div>
    <div v-else class="recent-list">
      <button
        v-for="item in latest"
        :key="item.id"
        class="recent-item"
        :class="{ selected: selectedResult?.id === item.id }"
        @click="item.hasAudio ? selectResult(item) : navigate('history')"
      >
        <span class="recent-play"
          ><AppIcon
            :name="
              item.hasAudio
                ? 'Play'
                : item.status === 'generating'
                  ? 'LoaderCircle'
                  : 'FileAudio'
            "
            :size="15"
            :class="{ spin: item.status === 'generating' }" /></span
        ><span class="recent-content"
          ><strong>{{ item.text }}</strong
          ><small
            >{{ modeInfo[item.mode]?.name }}<span>·</span
            >{{ formatDate(item.createdAt) }}</small
          ></span
        ><span class="recent-duration">{{
          item.hasAudio
            ? formatTime(item.duration)
            : item.status === "failed"
              ? "失败"
              : item.status === "cancelled"
                ? "已停止"
                : "生成中"
        }}</span>
      </button>
    </div>
    <div class="inspiration-card">
      <div class="inspiration-art" aria-hidden="true">
        <span v-for="n in 24" :key="n" :style="{ '--n': n }"></span>
      </div>
      <span class="inspiration-icon"
        ><AppIcon name="Sparkles" :size="17"
      /></span>
      <h3>让灵感，听得见。</h3>
      <p>
        从一句描述，到一种独特的声音。<br />为你的下一个故事找到合适的表达。
      </p>
      <button class="text-button" @click="navigate('presets')">
        探索声音预设<AppIcon name="ArrowRight" :size="14" />
      </button>
    </div>
    <div class="result-footer">
      <AppIcon name="ShieldCheck" :size="14" /><span
        >音频保存在本地，灵感由你掌控。</span
      >
    </div>
  </aside>
</template>
