<script setup>
import { computed, onMounted, onUnmounted, provide, ref } from "vue";
import {
  ConfigProvider as AConfigProvider,
  theme as antTheme,
  message,
  Tooltip as ATooltip,
} from "ant-design-vue";
import { createStudio, studioKey } from "./composables/useStudio.js";
import { modeInfo } from "./presets.js";
import AppIcon from "./components/AppIcon.vue";
import StudioEditor from "./components/StudioEditor.vue";
import ResultPanel from "./components/ResultPanel.vue";
import HistoryView from "./components/HistoryView.vue";
import PresetsView from "./components/PresetsView.vue";
import SettingsView from "./components/SettingsView.vue";
const studio = createStudio();
provide(studioKey, studio);
const {
  view,
  mode,
  theme,
  health,
  connectionLoading,
  navigate,
  refreshHealth,
  busy,
  history,
  presets,
} = studio;
const mobileNav = ref(false),
  help = ref(false);
const isStudio = computed(() => !!modeInfo[view.value]);
const pageName = computed(
  () =>
    modeInfo[view.value]?.name ||
    { history: "生成历史", presets: "声音预设", settings: "系统设置" }[
      view.value
    ],
);
const connected = computed(() => health.value?.inference?.status === "ready");
const config = computed(() => ({
  algorithm:
    theme.value === "dark" ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
  token: {
    colorPrimary: "#a493ed",
    colorBgBase: theme.value === "dark" ? "#19191f" : "#ffffff",
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
    borderRadius: 8,
    controlHeight: 34,
  },
}));
function go(key) {
  navigate(key);
  mobileNav.value = false;
}
function keydown(event) {
  if (
    (event.metaKey || event.ctrlKey) &&
    event.key === "Enter" &&
    isStudio.value
  ) {
    event.preventDefault();
    if (studio.canGenerate.value) void studio.generate();
  }
}
onMounted(() => {
  void studio.init();
  window.addEventListener("keydown", keydown);
});
onUnmounted(() => {
  studio.dispose();
  window.removeEventListener("keydown", keydown);
});
</script>
<template>
  <AConfigProvider :theme="config">
    <div class="app-shell">
      <div v-if="mobileNav" class="nav-scrim" @click="mobileNav = false"></div>
      <aside class="sidebar" :class="{ open: mobileNav }">
        <a class="brand" href="#" @click.prevent="go('design')"
          ><span class="brand-mark"
            ><AppIcon name="AudioLines" :size="25" :stroke-width="2.3" /></span
          ><span class="brand-name"
            >breeze<span>TTS STUDIO <small>2</small></span></span
          ></a
        >
        <div class="workspace-label">
          <span class="workspace-dot"></span>个人工作空间<span
            class="local-badge"
            >LOCAL</span
          >
        </div>
        <div class="nav-caption">创作工作台</div>
        <nav class="main-nav" aria-label="功能导航">
          <button
            v-for="(info, key) in modeInfo"
            :key="key"
            class="nav-item"
            :class="{ active: view === key }"
            @click="go(key)"
          >
            <AppIcon :name="info.icon" :size="19" /><span>{{ info.name }}</span
            ><span v-if="view === key" class="active-dot"></span>
          </button>
          <div class="nav-separator"></div>
          <div class="nav-caption">我的资源</div>
          <button
            class="nav-item"
            :class="{ active: view === 'history' }"
            @click="go('history')"
          >
            <AppIcon name="History" :size="19" /><span>生成历史</span
            ><span v-if="history.length" class="nav-count">{{
              history.length
            }}</span>
          </button>
          <button
            class="nav-item"
            :class="{ active: view === 'presets' }"
            @click="go('presets')"
          >
            <AppIcon name="BookOpen" :size="19" /><span>声音预设</span
            ><span v-if="presets.length" class="nav-count">{{
              presets.length
            }}</span>
          </button>
        </nav>
        <div class="sidebar-bottom">
          <div class="local-info">
            <span class="local-info-icon"
              ><AppIcon name="ShieldCheck" :size="18"
            /></span>
            <div>
              <strong>安心创作，自在表达</strong>
              <p>数据与音频仅保存在本地</p>
            </div>
          </div>
          <button
            class="nav-item"
            :class="{ active: view === 'settings' }"
            @click="go('settings')"
          >
            <AppIcon name="Settings2" :size="19" /><span>系统设置</span>
          </button>
          <div class="sidebar-footer">
            <span class="avatar">B</span>
            <div><strong>本地创作者</strong><span>研究与非商业用途</span></div>
            <ATooltip
              :title="theme === 'dark' ? '切换浅色模式' : '切换深色模式'"
              ><button
                class="icon-button"
                aria-label="切换主题"
                @click="theme = theme === 'dark' ? 'light' : 'dark'"
              >
                <AppIcon
                  :name="theme === 'dark' ? 'Sun' : 'Moon'"
                  :size="17"
                /></button
            ></ATooltip>
          </div>
        </div>
      </aside>
      <div class="main-shell">
        <header class="topbar">
          <div class="breadcrumb">
            <button
              class="icon-button mobile-menu"
              aria-label="打开导航"
              @click="mobileNav = true"
            >
              <AppIcon name="Menu" /></button
            ><AppIcon name="FolderOpen" :size="17" /><span>工作空间</span
            ><span class="breadcrumb-slash">/</span
            ><strong>{{ pageName }}</strong>
          </div>
          <div class="topbar-actions">
            <button
              class="connection-pill"
              :class="{ online: connected, busy: health?.activeTask }"
              @click="refreshHealth()"
              :title="health?.inference?.message || '检查服务连接'"
            >
              <span
                class="status-dot"
                :class="{ pulse: connectionLoading }"
              ></span
              >{{
                connectionLoading
                  ? "检测连接中"
                  : health?.activeTask
                    ? "推理任务进行中"
                    : connected
                      ? "模型服务已连接"
                      : "模型服务未连接"
              }}<AppIcon
                v-if="connectionLoading"
                name="LoaderCircle"
                :size="12"
                class="spin"
              /></button
            ><span class="topbar-divider"></span
            ><button
              class="icon-button"
              aria-label="使用帮助"
              @click="help = !help"
            >
              <AppIcon name="CircleHelp" :size="18" />
            </button>
          </div>
        </header>
        <div v-if="help" class="help-banner">
          <AppIcon name="Info" /><span
            >启动本地模型后，在系统设置中配置 API
            地址。填写文本和声音配置，点击「生成语音」即可。快捷键：⌘ / Ctrl +
            Enter。</span
          ><button
            class="icon-button"
            aria-label="关闭帮助"
            @click="help = false"
          >
            <AppIcon name="X" :size="16" />
          </button>
        </div>
        <div v-if="isStudio" class="studio-layout">
          <main class="editor-column"><StudioEditor :key="mode" /></main>
          <ResultPanel />
        </div>
        <main v-else class="page-content">
          <HistoryView v-if="view === 'history'" /><PresetsView
            v-else-if="view === 'presets'"
          /><SettingsView v-else />
        </main>
        <div class="app-statusbar">
          <span
            ><span class="status-dot" :class="{ connected }"></span>Breeze TTS
            2<span class="statusbar-divider">·</span>24 kHz / Mono / PCM16</span
          ><span
            ><AppIcon name="ShieldCheck" :size="12" />本地运行<span
              class="statusbar-divider"
              >·</span
            >v1.0.0</span
          >
        </div>
      </div>
    </div>
  </AConfigProvider>
</template>
