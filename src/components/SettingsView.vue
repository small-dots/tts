<script setup>
import { reactive, ref, watch } from "vue";
import {
  InputNumber as AInputNumber,
  Select as ASelect,
  message,
} from "ant-design-vue";
import { useStudio } from "../composables/useStudio.js";
import AppIcon from "./AppIcon.vue";
const {
  settings,
  saveSettings,
  health,
  refreshHealth,
  connectionLoading,
  theme,
} = useStudio();
const form = reactive({ ...settings }),
  saving = ref(false),
  changed = ref(false);
watch(
  settings,
  (value) => {
    Object.assign(form, value);
  },
  { deep: true },
);
watch(
  form,
  () => {
    changed.value = JSON.stringify(form) !== JSON.stringify(settings);
  },
  { deep: true },
);
async function save() {
  saving.value = true;
  try {
    await saveSettings({ ...form });
    changed.value = false;
  } catch (err) {
    message.error(err.message);
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow"><span class="eyebrow-line"></span>MAKE IT YOURS</div>
      <h1>为创作，准备就绪。</h1>
      <p>连接本地模型，调整工作台，让声音创作更合心意。</p>
    </div>
  </div>
  <div class="settings-layout">
    <div class="settings-main">
      <section class="settings-card">
        <div class="settings-card-title">
          <span class="section-icon"><AppIcon name="Zap" :size="18" /></span>
          <div>
            <h2>模型服务</h2>
            <p>连接你本地运行的 Breeze TTS 2 推理服务</p>
          </div>
          <span
            class="settings-status"
            :class="{ online: health?.inference?.status === 'ready' }"
            ><span class="status-dot"></span
            >{{
              health?.inference?.status === "ready" ? "接口可访问" : "未连接"
            }}</span
          >
        </div>
        <div class="settings-fields">
          <label class="field-label" for="api-url">后端 API 地址</label
          ><input
            id="api-url"
            v-model="form.apiUrl"
            class="field-input"
            placeholder="http://127.0.0.1:7860"
          />
          <p class="field-hint">
            填写服务根地址，工作台将调用 /v1/audio/speech 接口。
          </p>
          <div class="connection-test">
            <button
              class="secondary-button"
              :disabled="connectionLoading"
              @click="refreshHealth()"
            >
              <AppIcon
                name="RefreshCw"
                :size="15"
                :class="{ spin: connectionLoading }"
              />检测已保存连接</button
            ><span>{{ health?.inference?.message || "等待检测" }}</span>
          </div>
          <div class="settings-notice">
            <AppIcon name="Info" :size="16" />
            <p>
              模型加载状态与 GPU
              指标暂无标准查询接口，工作台仅检测服务接口是否可访问。实际可用性以语音生成为准。
            </p>
          </div>
        </div>
      </section>
      <section class="settings-card">
        <div class="settings-card-title">
          <span class="section-icon"
            ><AppIcon name="SlidersHorizontal" :size="18"
          /></span>
          <div>
            <h2>生成默认值</h2>
            <p>用于新的工作区；现有草稿参数会保留</p>
          </div>
        </div>
        <div class="settings-fields">
          <div class="settings-row">
            <div>
              <label>默认 CFG Scale</label>
              <p>自然语言指令的遵循强度</p>
            </div>
            <AInputNumber
              v-model:value="form.defaultCfg"
              :min="0.5"
              :max="20"
              :step="0.5"
              aria-label="默认 CFG Scale"
            />
          </div>
          <div class="settings-row">
            <div>
              <label>默认 Seed 策略</label>
              <p>固定种子便于比较不同声音描述</p>
            </div>
            <ASelect
              v-model:value="form.seedStrategy"
              :options="[
                { value: 'random', label: '每次随机' },
                { value: 'fixed', label: '固定种子' },
              ]"
              style="width: 145px"
              aria-label="默认 Seed 策略"
            />
          </div>
          <div v-if="form.seedStrategy === 'fixed'" class="settings-row">
            <div>
              <label>固定 Seed</label>
              <p>0 到 2,147,483,647 的整数</p>
            </div>
            <AInputNumber
              v-model:value="form.defaultSeed"
              :min="0"
              :max="2147483647"
              :precision="0"
              style="width: 145px"
              aria-label="默认固定 Seed"
            />
          </div>
        </div>
      </section>
      <section class="settings-card">
        <div class="settings-card-title">
          <span class="section-icon"
            ><AppIcon name="FolderOpen" :size="18"
          /></span>
          <div>
            <h2>本地存储</h2>
            <p>管理音频输出和生成记录</p>
          </div>
        </div>
        <div class="settings-fields">
          <label class="field-label" for="output-dir">音频输出目录</label
          ><input
            id="output-dir"
            v-model="form.outputDir"
            class="field-input mono"
            placeholder="本地音频目录的绝对路径"
          />
          <p class="field-hint">
            更改仅影响之后生成的音频，历史音频仍从原目录读取。
          </p>
          <div class="settings-row retention-row">
            <div>
              <label>历史记录保留策略</label>
              <p>保存设置后自动清理超出数量的旧记录及音频</p>
            </div>
            <ASelect
              v-model:value="form.retention"
              :options="[
                { value: 20, label: '最近 20 条' },
                { value: 50, label: '最近 50 条' },
                { value: 100, label: '最近 100 条' },
                { value: 500, label: '最近 500 条' },
                { value: 0, label: '全部保留' },
              ]"
              style="width: 145px"
              aria-label="历史保留策略"
            />
          </div>
          <div class="settings-notice">
            <AppIcon name="ShieldCheck" :size="16" />
            <p>
              参考音频默认仅用于当前请求；只有在保存预设时明确勾选，才会将参考音频持久保存在本地。
            </p>
          </div>
        </div>
      </section>
      <section class="settings-card">
        <div class="settings-card-title">
          <span class="section-icon"><AppIcon name="Sun" :size="18" /></span>
          <div>
            <h2>界面外观</h2>
            <p>选择适合你的创作环境</p>
          </div>
        </div>
        <div class="theme-options">
          <button
            :class="{ selected: theme === 'dark' }"
            @click="theme = 'dark'"
          >
            <span class="theme-swatch dark-swatch"><i></i><i></i><i></i></span
            ><span><AppIcon name="Moon" :size="15" />深色模式</span
            ><AppIcon v-if="theme === 'dark'" name="Check" :size="15" /></button
          ><button
            :class="{ selected: theme === 'light' }"
            @click="theme = 'light'"
          >
            <span class="theme-swatch light-swatch"><i></i><i></i><i></i></span
            ><span><AppIcon name="Sun" :size="15" />浅色模式</span
            ><AppIcon v-if="theme === 'light'" name="Check" :size="15" />
          </button>
        </div>
      </section>
      <div class="settings-save">
        <span>{{ changed ? "有尚未保存的设置" : "设置已同步到本地" }}</span
        ><button
          class="generate-button"
          :disabled="saving || !changed"
          @click="save"
        >
          <AppIcon
            :name="saving ? 'LoaderCircle' : 'Check'"
            :size="17"
            :class="{ spin: saving }"
          />{{ saving ? "正在保存…" : "保存设置" }}
        </button>
      </div>
    </div>
    <aside class="settings-about">
      <span class="brand-mark"
        ><AppIcon name="AudioLines" :size="26" :stroke-width="2.3"
      /></span>
      <h3>Breeze TTS Studio</h3>
      <p>一个安静、专注的声音创作空间。</p>
      <dl>
        <div>
          <dt>工作台版本</dt>
          <dd>1.0.0</dd>
        </div>
        <div>
          <dt>推理模型</dt>
          <dd>Breeze TTS 2</dd>
        </div>
        <div>
          <dt>输出规格</dt>
          <dd>24 kHz · Mono</dd>
        </div>
        <div>
          <dt>音频格式</dt>
          <dd>PCM16 → WAV</dd>
        </div>
        <div>
          <dt>运行模式</dt>
          <dd>本地 · 单任务</dd>
        </div>
      </dl>
      <div class="settings-about-note">
        <AppIcon name="ShieldCheck" :size="18" />
        <p>
          为本地研究、测试与非商业用途设计。模型权重与输出的使用请遵循相应许可。
        </p>
      </div>
    </aside>
  </div>
</template>
