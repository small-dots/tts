<script setup>
import { computed, ref } from "vue";
import { Popconfirm as APopconfirm, message } from "ant-design-vue";
import { useStudio } from "../composables/useStudio.js";
import {
  modeInfo,
  designPresets,
  directionPresets,
  formatDate,
} from "../presets.js";
import AppIcon from "./AppIcon.vue";
const { presets, navigate, selectTemplate, applyPreset, deletePreset } =
  useStudio();
const tab = ref("saved"),
  query = ref("");
const saved = computed(() =>
  presets.value.filter((item) =>
    [item.name, item.instruction].join(" ").includes(query.value),
  ),
);
const templates = computed(() =>
  tab.value === "direction" ? directionPresets : designPresets,
);
function useTemplate(item) {
  navigate(tab.value === "direction" ? "direction" : "design");
  selectTemplate(item);
  message.success("声音示例已填入工作区，可自由调整");
}
async function apply(item) {
  try {
    await applyPreset(item);
  } catch (err) {
    message.error(err.message);
  }
}
async function remove(item) {
  try {
    await deletePreset(item);
  } catch (err) {
    message.error(err.message);
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">
        <span class="eyebrow-line"></span>VOICE COLLECTION
      </div>
      <h1>收藏声音的无限可能。</h1>
      <p>把喜欢的声音留在手边，让下一次创作更轻松。</p>
    </div>
    <button class="secondary-button" @click="navigate('design')">
      <AppIcon name="Plus" :size="17" />设计新声音
    </button>
  </div>
  <div class="library-toolbar">
    <div class="filter-tabs">
      <button :class="{ active: tab === 'saved' }" @click="tab = 'saved'">
        我的预设<span>{{ presets.length }}</span></button
      ><button :class="{ active: tab === 'design' }" @click="tab = 'design'">
        声音设计示例</button
      ><button
        :class="{ active: tab === 'direction' }"
        @click="tab = 'direction'"
      >
        声音指导示例
      </button>
    </div>
    <label v-if="tab === 'saved'" class="search-box"
      ><AppIcon name="Search" :size="16" /><input
        v-model="query"
        placeholder="搜索我的预设…"
        aria-label="搜索声音预设"
    /></label>
  </div>
  <div v-if="tab === 'saved' && !saved.length" class="large-empty">
    <span class="empty-icon"><AppIcon name="BookOpen" :size="33" /></span>
    <h2>{{ query ? "没有找到匹配的预设" : "留住那个，刚刚好的声音。" }}</h2>
    <p>在工作区中点击「存为预设」，即可保存常用声音配置。</p>
    <button class="secondary-button" @click="tab = 'design'">
      <AppIcon name="Sparkles" :size="16" />浏览声音示例<AppIcon
        name="ArrowRight"
        :size="15"
      />
    </button>
  </div>
  <div v-else-if="tab === 'saved'" class="preset-grid">
    <article v-for="item in saved" :key="item.id" class="preset-card">
      <div class="preset-card-top">
        <span class="preset-art purple"
          ><AppIcon :name="modeInfo[item.mode]?.icon" :size="25" /></span
        ><APopconfirm
          title="删除声音预设及保存的参考音频？"
          ok-text="删除"
          cancel-text="取消"
          @confirm="remove(item)"
          ><button class="icon-button danger-hover" aria-label="删除预设">
            <AppIcon name="Trash2" :size="16" /></button
        ></APopconfirm>
      </div>
      <span class="card-eyebrow">{{ modeInfo[item.mode]?.en }}</span>
      <h2>{{ item.name }}</h2>
      <p>
        {{ item.instruction || "使用参考声音的音色与说话特征，生成新的内容。" }}
      </p>
      <div class="preset-meta">
        <span
          ><AppIcon name="AudioLines" :size="13" />{{
            item.hasReference ? "已保存参考音频" : "仅声音参数"
          }}</span
        ><span>{{ item.language === "en" ? "English" : "中文" }}</span>
      </div>
      <button class="preset-use-button" @click="apply(item)">
        使用这个声音<AppIcon name="ArrowRight" :size="16" />
      </button>
    </article>
  </div>
  <div v-else class="preset-grid">
    <article v-for="item in templates" :key="item.id" class="preset-card">
      <div class="preset-card-top">
        <span class="preset-art" :class="item.color"
          ><AppIcon :name="item.icon" :size="27" /></span
        ><span class="template-badge">内置示例</span>
      </div>
      <span class="card-eyebrow">{{ item.en }}</span>
      <h2>{{ item.name }}</h2>
      <p>{{ item.zh }}</p>
      <div class="preset-meta">
        <span>中文 / English</span><span>可自由编辑</span>
      </div>
      <button class="preset-use-button" @click="useTemplate(item)">
        应用到工作区<AppIcon name="ArrowRight" :size="16" />
      </button>
    </article>
  </div>
  <div class="library-footnote">
    <AppIcon
      name="Info"
      :size="14"
    />声音示例通过自然语言传递给模型，实际音色与情绪效果取决于模型输出。
  </div>
</template>
