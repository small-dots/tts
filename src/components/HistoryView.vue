<script setup>
import { computed, ref } from "vue";
import { Popconfirm as APopconfirm, message } from "ant-design-vue";
import { useStudio } from "../composables/useStudio.js";
import { modeInfo, formatTime, formatDate } from "../presets.js";
import AppIcon from "./AppIcon.vue";
import AudioPlayer from "./AudioPlayer.vue";
const {
  history,
  selectedResult,
  selectResult,
  deleteHistory,
  reuse,
  navigate,
  refreshHistory,
  busy,
} = useStudio();
const query = ref(""),
  filter = ref("all"),
  refreshing = ref(false);
const filtered = computed(() =>
  history.value.filter(
    (item) =>
      (filter.value === "all" || item.mode === filter.value) &&
      [item.text, item.instruction, item.referenceName]
        .join(" ")
        .toLowerCase()
        .includes(query.value.toLowerCase()),
  ),
);
const statusNames = {
  completed: "已完成",
  failed: "生成失败",
  cancelled: "已停止",
  generating: "生成中",
};
async function remove(item) {
  try {
    await deleteHistory(item);
  } catch (err) {
    message.error(err.message);
  }
}
async function refresh() {
  refreshing.value = true;
  try {
    await refreshHistory();
  } catch (err) {
    message.error(err.message);
  } finally {
    refreshing.value = false;
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">
        <span class="eyebrow-line"></span>YOUR CREATIONS
      </div>
      <h1>每一次发声，都有迹可循。</h1>
      <p>回听、下载，或从之前的灵感继续创作。</p>
    </div>
    <button class="secondary-button" @click="refresh">
      <AppIcon
        name="RefreshCw"
        :size="16"
        :class="{ spin: refreshing }"
      />刷新记录
    </button>
  </div>
  <div class="library-toolbar">
    <div class="filter-tabs">
      <button :class="{ active: filter === 'all' }" @click="filter = 'all'">
        全部记录<span>{{ history.length }}</span></button
      ><button
        v-for="(info, key) in modeInfo"
        :key="key"
        :class="{ active: filter === key }"
        @click="filter = key"
      >
        {{ info.name }}
      </button>
    </div>
    <label class="search-box"
      ><AppIcon name="Search" :size="16" /><input
        v-model="query"
        placeholder="搜索文本、声音描述…"
        aria-label="搜索生成历史"
    /></label>
  </div>
  <div v-if="!filtered.length" class="large-empty">
    <span class="empty-icon"><AppIcon name="History" :size="33" /></span>
    <h2>{{ query ? "没有找到匹配的记录" : "故事，等待第一声。" }}</h2>
    <p>
      {{
        query
          ? "换一个关键词，再试试看。"
          : "生成的声音将自动保存在这里，随时回听每一次创作。"
      }}
    </p>
    <button v-if="!query" class="generate-button" @click="navigate('design')">
      <AppIcon name="Plus" :size="17" />开始创作
    </button>
  </div>
  <div v-else class="history-layout">
    <div class="history-list">
      <article
        v-for="item in filtered"
        :key="item.id"
        class="history-card"
        :class="{ selected: selectedResult?.id === item.id }"
      >
        <div class="history-card-top">
          <span class="mode-tag"
            ><AppIcon :name="modeInfo[item.mode]?.icon" :size="14" />{{
              modeInfo[item.mode]?.name
            }}</span
          ><span class="history-status" :class="item.status"
            ><span class="status-dot"></span
            >{{ statusNames[item.status] }}</span
          ><span class="history-date">{{ formatDate(item.createdAt) }}</span>
        </div>
        <p class="history-text">{{ item.text }}</p>
        <p v-if="item.instruction" class="history-instruction">
          {{ item.instruction }}
        </p>
        <p v-if="item.error" class="history-error">
          <AppIcon name="Info" :size="13" />{{ item.error }}
        </p>
        <div class="history-card-bottom">
          <span class="history-duration"
            ><AppIcon name="AudioLines" :size="14" />{{
              item.hasAudio ? formatTime(item.duration) : "无完整音频"
            }}<span v-if="item.cfg_scale"
              >· CFG {{ item.cfg_scale }}</span
            ></span
          >
          <div class="row-actions">
            <button
              v-if="item.hasAudio"
              class="text-button"
              :disabled="busy"
              @click="selectResult(item)"
            >
              <AppIcon name="Play" :size="14" />试听</button
            ><a
              v-if="item.hasAudio"
              :href="`/api/audio/${item.id}/download`"
              class="icon-button"
              aria-label="下载此音频"
              download
              ><AppIcon name="ArrowDownToLine" :size="16" /></a
            ><button class="text-button" @click="reuse(item)">
              <AppIcon name="RotateCcw" :size="14" />复用参数</button
            ><APopconfirm
              title="删除这条记录及其本地音频？"
              ok-text="删除"
              cancel-text="取消"
              @confirm="remove(item)"
              ><button
                class="icon-button danger-hover"
                :disabled="item.status === 'generating'"
                aria-label="删除生成记录"
              >
                <AppIcon name="Trash2" :size="15" /></button
            ></APopconfirm>
          </div>
        </div>
      </article>
    </div>
    <aside class="history-preview">
      <div class="result-heading">
        <h2><AppIcon name="Headphones" :size="18" />回听创作</h2>
      </div>
      <div class="result-card">
        <AudioPlayer :record="selectedResult" />
        <div class="result-details">
          <p class="history-preview-text">
            {{ selectedResult?.text || "选择一条生成记录，回听你的声音作品。" }}
          </p>
          <div v-if="selectedResult" class="result-params">
            <span>{{ modeInfo[selectedResult.mode]?.name }}</span
            ><span>{{ formatDate(selectedResult.createdAt) }}</span>
          </div>
        </div>
      </div>
      <p class="field-hint">
        <AppIcon name="ShieldCheck" :size="14" />历史记录保存在本地文件系统。
      </p>
    </aside>
  </div>
</template>
