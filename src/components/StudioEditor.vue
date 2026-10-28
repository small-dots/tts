<script setup>
import { computed, ref } from "vue";
import {
  Select as ASelect,
  Slider as ASlider,
  InputNumber as AInputNumber,
  Modal as AModal,
  Checkbox as ACheckbox,
  Tooltip as ATooltip,
  message,
} from "ant-design-vue";
import { useStudio } from "../composables/useStudio.js";
import {
  modeInfo,
  designPresets,
  directionPresets,
  eventTags,
  sampleText,
  formatTime,
} from "../presets.js";
import AppIcon from "./AppIcon.vue";
const {
  mode,
  draft,
  busy,
  taskStatus,
  elapsed,
  error,
  health,
  canGenerate,
  selectTemplate,
  generate,
  cancel,
  resetDraft,
  setFile,
  clearFile,
  savePreset,
} = useStudio();
const info = computed(() => modeInfo[mode.value]),
  templates = computed(() =>
    mode.value === "direction" ? directionPresets : designPresets,
  );
const advanced = ref(false),
  textArea = ref(),
  fileInput = ref(),
  dragging = ref(false),
  saving = ref(false),
  saveModal = ref(false),
  presetName = ref(""),
  saveReference = ref(false);
const eventsOpen = ref(false);
function insertEvent(tag) {
  const target = textArea.value;
  const start = target.selectionStart ?? draft.value.text.length;
  const end = target.selectionEnd ?? start;
  const value = draft.value.language === "en" ? `(${tag.en})` : `[${tag.zh}]`;
  draft.value.text =
    draft.value.text.slice(0, start) + value + draft.value.text.slice(end);
  eventsOpen.value = false;
  requestAnimationFrame(() => {
    target.focus();
    target.setSelectionRange(start + value.length, start + value.length);
  });
}
function languageChange(language) {
  const old = draft.value.language;
  draft.value.language = language;
  if (draft.value.text === sampleText[old])
    draft.value.text = sampleText[language];
  const selected = templates.value.find(
    (item) => item.id === draft.value.selectedPreset,
  );
  if (
    selected &&
    [selected.zh, selected.english].includes(draft.value.instruction)
  )
    selectTemplate(selected);
}
async function uploadFile(file) {
  if (!file) return;
  try {
    await setFile(file);
  } catch (err) {
    message.error(err.message);
  }
  if (fileInput.value) fileInput.value.value = "";
}
function drop(event) {
  dragging.value = false;
  void uploadFile(event.dataTransfer.files[0]);
}
async function save() {
  if (!presetName.value.trim()) {
    message.warning("请为声音预设起一个名字");
    return;
  }
  saving.value = true;
  try {
    await savePreset(presetName.value, saveReference.value);
    saveModal.value = false;
    presetName.value = "";
    saveReference.value = false;
  } catch (err) {
    message.error(err.message);
  } finally {
    saving.value = false;
  }
}
const taskLabel = computed(
  () =>
    ({
      connecting: "正在连接模型…",
      streaming: "正在生成声音…",
      completed: "生成完成",
      cancelled: "已停止",
      failed: "生成失败",
    })[taskStatus.value] || "",
);
</script>
<template>
  <div class="editor-heading">
    <div class="eyebrow">
      <span class="eyebrow-line"></span>{{ info.en.toUpperCase() }}
    </div>
    <h1>
      {{
        mode === "design"
          ? "让文字，拥有声音。"
          : mode === "clone"
            ? "熟悉的声音，新的故事。"
            : "同一个声音，更多种表达。"
      }}
    </h1>
    <p>{{ info.description }}</p>
  </div>
  <div class="editor-section text-section">
    <div class="section-heading">
      <h2>
        <span class="section-icon"><AppIcon name="BookOpen" :size="17" /></span
        >语音文本<span class="required">*</span>
      </h2>
      <ASelect
        :value="draft.language"
        class="language-select"
        :options="[
          { value: 'zh', label: '简体中文' },
          { value: 'en', label: 'English' },
        ]"
        @change="languageChange"
        aria-label="文本语言"
      />
    </div>
    <div class="text-editor-box">
      <textarea
        ref="textArea"
        v-model="draft.text"
        aria-label="语音文本"
        maxlength="10000"
        placeholder="写下你想听见的文字，让灵感在这里发声…"
        spellcheck="false"
      ></textarea>
      <div class="text-editor-footer">
        <div class="event-controls">
          <button
            class="subtle-button"
            @click="eventsOpen = !eventsOpen"
            :aria-expanded="eventsOpen"
          >
            <AppIcon name="Smile" :size="15" />插入事件<AppIcon
              name="ChevronDown"
              :size="12"
            />
          </button>
          <div v-if="eventsOpen" class="events-popover">
            <button
              v-for="event in eventTags"
              :key="event.en"
              @mousedown.prevent="insertEvent(event)"
            >
              <AppIcon :name="event.icon" :size="15" />{{
                draft.language === "en" ? `(${event.en})` : `[${event.zh}]`
              }}
            </button>
          </div>
          <span class="text-divider"></span
          ><button
            class="text-button sample-button"
            @click="draft.text = sampleText[draft.language]"
          >
            试试示例
          </button>
        </div>
        <span class="char-count"
          >{{ draft.text.length.toLocaleString() }} <span>/ 10,000</span></span
        >
      </div>
    </div>
    <p class="field-hint">
      <AppIcon
        name="Info"
        :size="13"
      />用语音事件为表达增加细节，支持笑、咳嗽、清嗓子和叹气。
    </p>
  </div>
  <div v-if="mode !== 'design'" class="editor-section reference-section">
    <div class="section-heading">
      <h2>
        <span class="section-icon"><AppIcon name="Mic2" :size="17" /></span
        >参考音频<span class="required">*</span>
      </h2>
      <span class="section-meta">WAV · 最大 20 MB</span>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept=".wav,audio/wav,audio/x-wav"
      class="hidden-input"
      @change="uploadFile($event.target.files[0])"
    />
    <div
      v-if="!draft.file"
      class="upload-zone"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="drop"
      role="button"
      tabindex="0"
      @click="fileInput.click()"
      @keydown.enter="fileInput.click()"
    >
      <span class="upload-icon"><AppIcon name="Upload" :size="22" /></span
      ><strong>点击上传，或将音频拖到这里</strong
      ><span>建议使用干净、清晰且背景噪声较少的参考音频</span>
    </div>
    <div v-else class="uploaded-file">
      <div class="uploaded-file-info">
        <span class="file-icon"><AppIcon name="FileAudio" :size="23" /></span>
        <div>
          <strong>{{ draft.file.name }}</strong>
          <p>
            {{ (draft.file.size / 1024 / 1024).toFixed(2) }} MB <span>·</span>
            {{ formatTime(draft.fileDuration) }}
          </p>
        </div>
        <button
          class="icon-button"
          aria-label="删除参考音频"
          @click="clearFile()"
        >
          <AppIcon name="X" :size="17" />
        </button>
      </div>
      <audio
        :src="draft.fileUrl"
        controls
        preload="metadata"
        class="reference-audio"
      ></audio
      ><button class="text-button" @click="fileInput.click()">替换音频</button>
    </div>
    <label class="field-label" for="ref-text"
      >参考音频文字稿<span class="required">*</span></label
    ><textarea
      id="ref-text"
      v-model="draft.ref_text"
      class="field-textarea transcript"
      maxlength="10000"
      placeholder="请输入参考音频中实际说出的完整内容…"
    ></textarea>
    <p class="field-hint">
      <AppIcon
        name="Info"
        :size="13"
      />文字稿必须与音频实际说话内容一致，这会影响克隆效果。
    </p>
    <ACheckbox v-model:checked="draft.authorized" class="authorization"
      >我确认拥有该声音的使用授权</ACheckbox
    >
  </div>
  <div v-if="mode !== 'clone'" class="editor-section voice-section">
    <div class="section-heading">
      <h2>
        <span class="section-icon"
          ><AppIcon
            :name="mode === 'design' ? 'Sparkles' : 'SlidersHorizontal'"
            :size="17" /></span
        >{{ mode === "design" ? "声音描述" : "声音指导"
        }}<span class="required">*</span>
      </h2>
      <span class="section-meta"
        >用自然语言定义{{ mode === "design" ? "声音" : "表达" }}</span
      >
    </div>
    <div class="voice-templates">
      <button
        v-for="preset in templates"
        :key="preset.id"
        class="voice-template"
        :class="{ selected: draft.selectedPreset === preset.id }"
        @click="selectTemplate(preset)"
      >
        <span class="template-icon" :class="preset.color"
          ><AppIcon :name="preset.icon" :size="18" /></span
        ><span
          ><strong>{{ preset.name }}</strong
          ><small>{{ preset.en }}</small></span
        ><AppIcon
          v-if="draft.selectedPreset === preset.id"
          name="Check"
          :size="13"
          class="template-check"
        />
      </button>
    </div>
    <div class="instruction-wrap">
      <textarea
        v-model="draft.instruction"
        class="field-textarea instruction"
        :aria-label="mode === 'design' ? '声音描述' : '声音指导'"
        maxlength="3000"
        :placeholder="
          mode === 'design'
            ? '描述声音的性别、年龄、音色、语气与表达方式…'
            : '描述你希望声音传递的情绪、语气和节奏…'
        "
        @input="draft.selectedPreset = ''"
      ></textarea
      ><AppIcon name="Sparkles" :size="15" class="instruction-spark" />
    </div>
    <p class="field-hint">
      <AppIcon name="Info" :size="13" />{{
        mode === "design" ? "声音描述" : "声音指导"
      }}与语音文本请使用相同语言。以上示例可自由编辑。
    </p>
  </div>
  <div class="advanced-panel">
    <button
      class="advanced-toggle"
      :aria-expanded="advanced"
      @click="advanced = !advanced"
    >
      <AppIcon name="SlidersHorizontal" :size="16" /><strong>高级参数</strong
      ><span
        >{{ mode === "clone" ? "Seed" : `CFG ${draft.cfg_scale} · Seed` }}
        {{ draft.seed === "" ? "随机" : draft.seed }}</span
      ><AppIcon :name="advanced ? 'ChevronDown' : 'ChevronRight'" :size="15" />
    </button>
    <div v-if="advanced" class="advanced-content">
      <div v-if="mode !== 'clone'" class="parameter-row">
        <div>
          <label
            >CFG Scale
            <ATooltip
              title="自然语言指令的遵循强度；最终有效范围以你的模型服务为准。"
              ><AppIcon name="CircleHelp" :size="13" /></ATooltip
          ></label>
          <p>控制声音对描述的遵循程度</p>
        </div>
        <ASlider
          v-model:value="draft.cfg_scale"
          :min="0.5"
          :max="20"
          :step="0.5"
          class="cfg-slider"
        /><AInputNumber
          v-model:value="draft.cfg_scale"
          :min="0.5"
          :max="20"
          :step="0.5"
          aria-label="CFG Scale"
        />
      </div>
      <div class="parameter-row">
        <div>
          <label>随机种子 Seed</label>
          <p>留空使用模型随机种子；固定数值便于对比</p>
        </div>
        <input
          v-model="draft.seed"
          type="number"
          min="0"
          max="2147483647"
          class="seed-input"
          placeholder="随机"
          aria-label="随机种子"
        /><button
          class="icon-button"
          title="生成随机 Seed"
          aria-label="生成随机 Seed"
          @click="draft.seed = String(Math.floor(Math.random() * 2147483648))"
        >
          <AppIcon name="RefreshCw" :size="16" />
        </button>
      </div>
    </div>
  </div>
  <div v-if="error" class="error-banner" role="alert">
    <AppIcon name="Info" :size="17" /><span>{{ error }}</span
    ><button class="icon-button" aria-label="关闭提示" @click="error = ''">
      <AppIcon name="X" :size="14" />
    </button>
  </div>
  <div class="generation-actions">
    <div class="action-left">
      <button class="secondary-button" @click="saveModal = true">
        <AppIcon name="BookOpen" :size="16" />存为预设</button
      ><ATooltip title="重置当前模式输入"
        ><button
          class="icon-button reset-button"
          aria-label="重置工作区"
          :disabled="busy"
          @click="resetDraft"
        >
          <AppIcon name="RotateCcw" :size="17" /></button
      ></ATooltip>
    </div>
    <button v-if="busy" class="generate-button stop-button" @click="cancel">
      <AppIcon name="Square" :size="15" />停止生成<span>{{
        formatTime(elapsed)
      }}</span></button
    ><button
      v-else
      class="generate-button"
      :disabled="!canGenerate"
      @click="generate"
    >
      <AppIcon name="Sparkles" :size="18" />{{
        health?.activeTask ? "等待上游任务结束" : "生成语音"
      }}<kbd v-if="!health?.activeTask">⌘ ↵</kbd>
    </button>
  </div>
  <div class="generation-note">
    <span v-if="busy" class="generating-text"
      ><AppIcon name="LoaderCircle" :size="13" class="spin" />{{ taskLabel }} ·
      {{ formatTime(elapsed) }}</span
    ><span v-else><AppIcon name="Zap" :size="12" />流式生成，即刻聆听</span
    ><span>由 Breeze TTS 2 驱动</span>
  </div>
  <AModal
    v-model:open="saveModal"
    title="保存声音预设"
    ok-text="保存预设"
    cancel-text="取消"
    :confirm-loading="saving"
    @ok="save"
    ><div class="modal-form">
      <label class="field-label" for="preset-name">预设名称</label
      ><input
        id="preset-name"
        v-model="presetName"
        class="field-input"
        maxlength="60"
        placeholder="例如：我的播客旁白"
        @keydown.enter="save"
      />
      <p class="field-hint">
        保存当前声音描述、语言和 CFG 参数，方便下次继续创作。
      </p>
      <ACheckbox
        v-if="mode !== 'design'"
        v-model:checked="saveReference"
        :disabled="!draft.file"
        >同时将当前参考音频保存到本地预设</ACheckbox
      >
      <p v-if="mode !== 'design'" class="field-hint">
        参考音频仅在勾选后持久保存，使用时仍需确认声音授权。
      </p>
    </div></AModal
  >
</template>
