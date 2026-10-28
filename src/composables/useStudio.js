import { computed, inject, reactive, watch, ref, markRaw } from "vue";
import { message } from "ant-design-vue";
import { designPresets, sampleText, modeInfo } from "../presets.js";
import { validateSpeech } from "../../shared/validation.js";
import { usePcmPlayer } from "./usePcmPlayer.js";
export const studioKey = Symbol("studio");
export const useStudio = () => inject(studioKey);
export async function api(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {}
    throw new Error(data?.error || `请求失败（HTTP ${response.status}）`);
  }
  return response.status === 204 ? null : response.json();
}
function stored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function createStudio() {
  const mode = ref("design"),
    view = ref("design"),
    theme = ref(stored("breeze-theme", "dark"));
  const settings = reactive({
    apiUrl: "http://127.0.0.1:7860",
    defaultCfg: 4,
    defaultSeed: 42,
    seedStrategy: "random",
    retention: 100,
    outputDir: "",
  });
  const draftDefaults = (key) => ({
    text: sampleText.zh,
    instruction:
      key === "clone"
        ? ""
        : key === "design"
          ? designPresets[0].zh
          : "使用轻松自然的日常交流语气。",
    language: "zh",
    cfg_scale: settings.defaultCfg,
    seed: settings.seedStrategy === "fixed" ? String(settings.defaultSeed) : "",
    ref_text: "",
    file: null,
    fileUrl: "",
    fileDuration: 0,
    authorized: false,
    selectedPreset: key === "design" ? "warm" : "",
  });
  const drafts = reactive(
    Object.fromEntries(
      ["design", "clone", "direction"].map((key) => [
        key,
        { ...draftDefaults(key), ...stored("breeze-draft-" + key, {}) },
      ]),
    ),
  );
  for (const key of Object.keys(drafts)) {
    drafts[key].file = null;
    drafts[key].fileUrl = "";
    drafts[key].authorized = false;
  }
  const draft = computed(() => drafts[mode.value]);
  const history = ref([]),
    presets = ref([]),
    health = ref(null),
    connectionLoading = ref(false);
  const busy = ref(false),
    taskStatus = ref("idle"),
    error = ref(""),
    selectedResult = ref(null),
    elapsed = ref(0),
    player = usePcmPlayer();
  let controller,
    ticker,
    healthTimer,
    startedAt,
    initialized = false,
    healthInFlight = false,
    disposed = false;
  const canGenerate = computed(() => !busy.value && !health.value?.activeTask);
  const latest = computed(() => history.value.slice(0, 4));
  watch(
    theme,
    (value) => {
      localStorage.setItem("breeze-theme", JSON.stringify(value));
      document.documentElement.dataset.theme = value;
    },
    { immediate: true },
  );
  for (const key of Object.keys(drafts))
    watch(
      () => drafts[key],
      (value) => {
        const { file, fileUrl, fileDuration, authorized, ...rest } = value;
        localStorage.setItem("breeze-draft-" + key, JSON.stringify(rest));
      },
      { deep: true },
    );
  async function refreshHealth(silent = false) {
    if (healthInFlight || disposed) return;
    healthInFlight = true;
    if (!silent) connectionLoading.value = true;
    clearTimeout(healthTimer);
    try {
      health.value = await api("/api/health");
      if (
        !health.value.activeTask &&
        !busy.value &&
        history.value.some((item) => item.status === "generating")
      )
        await refreshHistory();
    } catch {
      health.value = {
        inference: {
          status: "offline",
          message: "工作台 API 未连接，请启动 Node 服务",
        },
      };
    } finally {
      connectionLoading.value = false;
      healthInFlight = false;
      if (!disposed)
        healthTimer = setTimeout(
          () => void refreshHealth(true),
          health.value?.activeTask ? 2000 : 12000,
        );
    }
  }
  async function refreshHistory() {
    history.value = await api("/api/history");
  }
  async function init() {
    try {
      const [config, items, saved] = await Promise.all([
        api("/api/settings"),
        api("/api/history"),
        api("/api/presets"),
      ]);
      Object.assign(settings, config);
      history.value = items;
      presets.value = saved;
      for (const key of Object.keys(drafts)) {
        if (!localStorage.getItem("breeze-draft-" + key)) {
          drafts[key].cfg_scale = config.defaultCfg;
          drafts[key].seed =
            config.seedStrategy === "fixed" ? String(config.defaultSeed) : "";
        }
      }
      initialized = true;
    } catch (err) {
      error.value = err.message;
    }
    void refreshHealth();
  }
  function navigate(key) {
    const changed = view.value !== key;
    view.value = key;
    if (modeInfo[key]) mode.value = key;
    if (changed) window.scrollTo(0, 0);
  }
  function clearFile(target = draft.value) {
    if (target.fileUrl) URL.revokeObjectURL(target.fileUrl);
    target.file = null;
    target.fileUrl = "";
    target.fileDuration = 0;
    target.authorized = false;
  }
  async function setFile(file, target = draft.value) {
    if (!/\.wav$/i.test(file.name))
      throw new Error("请选择 WAV 格式的参考音频");
    if (file.size > 20 * 1024 * 1024) throw new Error("参考音频不能超过 20 MB");
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (
      new TextDecoder().decode(head.slice(0, 4)) !== "RIFF" ||
      new TextDecoder().decode(head.slice(8, 12)) !== "WAVE"
    )
      throw new Error("该文件不是有效的 WAV 音频");
    clearFile(target);
    target.file = markRaw(file);
    target.fileUrl = URL.createObjectURL(file);
    const audio = new Audio(target.fileUrl);
    audio.onloadedmetadata = () => {
      target.fileDuration = audio.duration;
      audio.src = "";
    };
  }
  function resetDraft() {
    clearFile();
    Object.assign(draft.value, draftDefaults(mode.value), {
      text: "",
      instruction: "",
      selectedPreset: "",
    });
    error.value = "";
    message.success("当前工作区已重置");
  }
  function selectTemplate(preset) {
    draft.value.instruction =
      draft.value.language === "en" ? preset.english : preset.zh;
    draft.value.selectedPreset = preset.id;
  }
  function makeForm(fields, selectedMode) {
    const form = new FormData();
    form.set("mode", selectedMode);
    for (const key of [
      "text",
      "instruction",
      "language",
      "cfg_scale",
      "seed",
      "ref_text",
      "authorized",
    ])
      form.set(key, String(fields[key] ?? ""));
    if (fields.file) form.set("ref_audio", fields.file, fields.file.name);
    return form;
  }
  async function generate() {
    if (busy.value) return;
    const selectedMode = mode.value,
      fields = { ...draft.value };
    const invalid = validateSpeech(
      { ...fields, mode: selectedMode },
      !!fields.file,
    );
    if (invalid) {
      error.value = invalid;
      message.warning(invalid);
      return;
    }
    error.value = "";
    busy.value = true;
    taskStatus.value = "connecting";
    elapsed.value = 0;
    selectedResult.value = null;
    startedAt = Date.now();
    controller = new AbortController();
    player.begin();
    ticker = setInterval(
      () => (elapsed.value = Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    let streamed = false,
      taskId;
    try {
      await player.unlock();
      const response = await fetch("/api/speech", {
        method: "POST",
        body: makeForm(fields, selectedMode),
        signal: controller.signal,
      });
      if (!response.ok) {
        let data;
        try {
          data = await response.json();
        } catch {}
        throw new Error(data?.error || `生成失败（HTTP ${response.status}）`);
      }
      taskId = response.headers.get("x-task-id");
      taskStatus.value = "streaming";
      selectedResult.value = {
        id: taskId,
        mode: selectedMode,
        text: fields.text,
        instruction: selectedMode === "clone" ? "" : fields.instruction,
        cfg_scale: selectedMode === "clone" ? null : fields.cfg_scale,
        seed: fields.seed,
        createdAt: new Date().toISOString(),
        status: "generating",
        live: true,
      };
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        player.append(value);
        if (!streamed && player.state.duration > 0.12) {
          streamed = true;
          void player.play();
        }
      }
      player.finish();
      await refreshHistory();
      const result = history.value.find((item) => item.id === taskId);
      if (!result || result.status !== "completed")
        throw new Error(result?.error || "音频任务未能正常完成");
      selectedResult.value = { ...result, live: true };
      taskStatus.value = "completed";
      if (!streamed) void player.play();
      message.success("语音已生成并保存到本地");
    } catch (err) {
      player.pause();
      if (err.name === "AbortError") {
        taskStatus.value = "cancelled";
        error.value =
          "已停止接收和播放。模型可能仍在计算，服务端会在上游结束后释放任务。";
      } else {
        taskStatus.value = "failed";
        error.value =
          err.message === "Failed to fetch"
            ? "连接中断，请检查工作台和模型服务"
            : err.message;
        message.error(error.value);
      }
      player.reset();
      selectedResult.value = null;
      await refreshHistory().catch(() => {});
    } finally {
      clearInterval(ticker);
      busy.value = false;
      controller = null;
      void refreshHealth(true);
    }
  }
  function cancel() {
    controller?.abort();
    player.pause();
  }
  function selectResult(item) {
    if (busy.value) {
      message.info("请先等待当前生成任务结束");
      return;
    }
    player.reset();
    selectedResult.value = { ...item, live: false };
  }
  async function deleteHistory(item) {
    await api("/api/history/" + item.id, { method: "DELETE" });
    if (selectedResult.value?.id === item.id) {
      player.reset();
      selectedResult.value = null;
    }
    await refreshHistory();
    message.success("生成记录已删除");
  }
  function reuse(item) {
    navigate(item.mode);
    const target = drafts[item.mode];
    Object.assign(target, {
      text: item.text,
      instruction: item.instruction || "",
      language: item.language || "zh",
      cfg_scale: item.cfg_scale || settings.defaultCfg,
      seed: item.seed === null ? "" : String(item.seed),
      ref_text: item.ref_text || "",
      selectedPreset: "",
    });
    if (item.mode !== "design") {
      clearFile(target);
      message.info("参数已填入，请重新上传参考音频并确认授权");
    } else message.success("历史参数已填入工作区");
  }
  async function savePreset(name, saveReference) {
    const fields = draft.value;
    const form = makeForm(fields, mode.value);
    form.set("name", name);
    form.set("save_reference", String(saveReference));
    const saved = await api("/api/presets", { method: "POST", body: form });
    presets.value.unshift(saved);
    message.success("声音预设已保存");
  }
  async function applyPreset(item) {
    navigate(item.mode);
    const target = draft.value;
    target.instruction = item.instruction;
    target.language = item.language || "zh";
    target.cfg_scale = item.cfg_scale || settings.defaultCfg;
    target.selectedPreset = "";
    target.ref_text = item.ref_text || "";
    if (item.mode !== "design") {
      clearFile(target);
      if (item.hasReference) {
        const response = await fetch(`/api/presets/${item.id}/reference`);
        if (!response.ok) throw new Error("参考音频读取失败");
        await setFile(
          new File(
            [await response.blob()],
            item.referenceName || "reference.wav",
            { type: "audio/wav" },
          ),
          target,
        );
        message.info("预设已应用，请确认声音使用授权");
      } else message.info("预设已应用，请上传参考音频");
    } else message.success("声音预设已应用");
  }
  async function deletePreset(item) {
    await api("/api/presets/" + item.id, { method: "DELETE" });
    presets.value = presets.value.filter((p) => p.id !== item.id);
    message.success("预设已删除");
  }
  async function saveSettings(values) {
    const data = await api("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    Object.assign(settings, data);
    await refreshHistory();
    void refreshHealth();
    message.success("设置已保存，将用于后续任务");
  }
  function dispose() {
    disposed = true;
    clearTimeout(healthTimer);
    clearInterval(ticker);
    controller?.abort();
    void player.dispose();
    Object.values(drafts).forEach(clearFile);
  }
  return {
    mode,
    view,
    theme,
    settings,
    drafts,
    draft,
    history,
    presets,
    health,
    connectionLoading,
    busy,
    taskStatus,
    error,
    selectedResult,
    elapsed,
    player,
    canGenerate,
    latest,
    init,
    navigate,
    refreshHealth,
    refreshHistory,
    clearFile,
    setFile,
    resetDraft,
    selectTemplate,
    generate,
    cancel,
    selectResult,
    deleteHistory,
    reuse,
    savePreset,
    applyPreset,
    deletePreset,
    saveSettings,
    dispose,
  };
}
