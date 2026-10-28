import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, open, rename, writeFile, stat } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { Store } from "./store.js";
import { validateSpeech, MODES } from "../shared/validation.js";
import { wavHeader } from "../shared/audio.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1,
    fields: 20,
    fieldSize: 40000,
  },
});
const fail = (status, message) => Object.assign(new Error(message), { status });
function validateWav(file) {
  if (
    !file ||
    !/\.wav$/i.test(file.originalname) ||
    file.buffer.length < 44 ||
    file.buffer.toString("ascii", 0, 4) !== "RIFF" ||
    file.buffer.toString("ascii", 8, 12) !== "WAVE"
  )
    throw fail(400, "参考音频格式无效，请上传有效的 WAV 文件（最大 20 MB）");
  const buffer = file.buffer;
  let offset = 12;
  let format = false;
  let data = false;
  while (offset + 8 <= buffer.length) {
    const name = buffer.toString("ascii", offset, offset + 4),
      size = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + size > buffer.length)
      throw fail(400, "WAV 文件不完整或已损坏");
    if (name === "fmt ") {
      if (
        size < 16 ||
        ![1, 3, 0xfffe].includes(buffer.readUInt16LE(offset + 8)) ||
        !buffer.readUInt16LE(offset + 10) ||
        !buffer.readUInt32LE(offset + 12)
      )
        throw fail(400, "不支持此 WAV 编码，请使用标准 PCM WAV");
      format = true;
    }
    if (name === "data" && size > 0) data = true;
    offset += 8 + size + (size % 2);
  }
  if (!format || !data) throw fail(400, "WAV 文件缺少有效的格式或音频数据");
}
function normalizeSettings(current, input) {
  const result = { ...current };
  if (input.apiUrl !== undefined) {
    let parsed;
    try {
      parsed = new URL(input.apiUrl);
    } catch {
      throw fail(400, "请输入有效的模型服务 HTTP 地址");
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw fail(
        400,
        "模型服务地址需为 HTTP(S) 地址，且不包含账号、查询或片段",
      );
    result.apiUrl = parsed.href
      .replace(/\/$/, "")
      .replace(/\/v1\/audio\/speech$/, "");
  }
  if (input.defaultCfg !== undefined) {
    if (
      !Number.isFinite(Number(input.defaultCfg)) ||
      Number(input.defaultCfg) <= 0 ||
      Number(input.defaultCfg) > 20
    )
      throw fail(400, "默认 CFG 需要在 0 到 20 之间（不含 0）");
    result.defaultCfg = Number(input.defaultCfg);
  }
  if (input.seedStrategy !== undefined) {
    if (!["random", "fixed"].includes(input.seedStrategy))
      throw fail(400, "无效的 Seed 策略");
    result.seedStrategy = input.seedStrategy;
  }
  if (input.defaultSeed !== undefined) {
    if (
      !Number.isInteger(Number(input.defaultSeed)) ||
      Number(input.defaultSeed) < 0 ||
      Number(input.defaultSeed) > 2147483647
    )
      throw fail(400, "默认 Seed 需要是有效的非负整数");
    result.defaultSeed = Number(input.defaultSeed);
  }
  if (input.retention !== undefined) {
    if (
      !Number.isInteger(Number(input.retention)) ||
      Number(input.retention) < 0 ||
      Number(input.retention) > 10000
    )
      throw fail(400, "保留记录数需要在 0 到 10,000 之间");
    result.retention = Number(input.retention);
  }
  if (input.outputDir !== undefined) {
    if (typeof input.outputDir !== "string" || !input.outputDir.trim())
      throw fail(400, "请输入音频输出目录");
    result.outputDir = path.resolve(input.outputDir);
  }
  return result;
}
async function writeClient(res, chunk) {
  if (res.destroyed || res.writableEnded) return;
  if (res.write(chunk)) return;
  await new Promise((resolve) => {
    const done = () => {
      res.off("drain", done);
      res.off("close", done);
      resolve();
    };
    res.once("drain", done);
    res.once("close", done);
  });
}
async function checkInference(apiUrl) {
  try {
    const response = await fetch(apiUrl + "/openapi.json", {
      signal: AbortSignal.timeout(2500),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.paths?.["/v1/audio/speech"]?.post)
        return {
          status: "ready",
          message: "语音接口可访问，模型状态由实际推理确认",
        };
    }
    const probe = await fetch(apiUrl + "/v1/audio/speech", {
      method: "GET",
      signal: AbortSignal.timeout(2500),
    });
    await probe.body?.cancel();
    if (probe.status === 405)
      return {
        status: "ready",
        message: "语音接口可访问，模型状态由实际推理确认",
      };
    return {
      status: "unavailable",
      message: `服务可访问，但语音接口未就绪（HTTP ${probe.status}）`,
    };
  } catch {
    return {
      status: "offline",
      message: "无法连接模型服务，请检查服务是否启动及 API 地址",
    };
  }
}

export async function createApp({
  dataDir = path.resolve("data"),
  apiUrl,
  timeoutMs = 600000,
} = {}) {
  const store = await new Store(dataDir, apiUrl).init();
  const app = express();
  let activeTask = null;
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (
          !["localhost", "127.0.0.1", "[::1]"].includes(
            new URL(origin).hostname,
          )
        )
          throw new Error();
      } catch {
        return res.status(403).json({ error: "工作台仅允许本机来源访问" });
      }
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use(express.json({ limit: "100kb" }));
  app.get("/api/health", async (req, res) => {
    const inference = await checkInference(store.state.settings.apiUrl);
    res.json({
      status: "ok",
      inference,
      activeTask: activeTask
        ? {
            id: activeTask.id,
            startedAt: activeTask.createdAt,
            status: activeTask.cancelled ? "draining" : "generating",
          }
        : null,
      sampleRate: 24000,
      modelStatus: "unknown",
    });
  });
  app.get("/api/settings", (req, res) => res.json(store.state.settings));
  app.put("/api/settings", async (req, res) => {
    const settings = normalizeSettings(store.state.settings, req.body);
    await mkdir(settings.outputDir, { recursive: true });
    store.state.settings = settings;
    await store.save();
    await store.prune();
    res.json(settings);
  });
  app.get("/api/history", (req, res) =>
    res.json(store.state.history.map((item) => store.publicRecord(item))),
  );
  app.get("/api/history/:id", (req, res) => {
    const item = store.state.history.find((item) => item.id === req.params.id);
    if (!item) throw fail(404, "未找到这条生成记录");
    res.json(store.publicRecord(item));
  });
  app.delete("/api/history/:id", async (req, res) => {
    if (activeTask?.id === req.params.id)
      throw fail(409, "当前任务尚未结束，请稍后删除");
    const item = store.state.history.find((item) => item.id === req.params.id);
    if (!item) throw fail(404, "记录不存在");
    await store.removeFile(item.audioPath);
    store.state.history = store.state.history.filter((item) => item !== item);
    await store.save();
    res.status(204).end();
  });
  app.get(["/api/audio/:id", "/api/audio/:id/download"], async (req, res) => {
    const item = store.state.history.find((item) => item.id === req.params.id);
    if (!item?.audioPath || item.status !== "completed")
      throw fail(404, "音频不存在或任务未完成");
    try {
      await stat(item.audioPath);
    } catch {
      throw fail(404, "音频文件已被移动或删除");
    }
    if (req.path.endsWith("/download"))
      res.download(
        item.audioPath,
        `breeze-${item.mode}-${item.createdAt.replace(/[:.]/g, "-")}.wav`,
      );
    else res.sendFile(item.audioPath);
  });
  app.get("/api/presets", (req, res) =>
    res.json(store.state.presets.map((item) => store.publicRecord(item))),
  );
  app.post("/api/presets", upload.single("ref_audio"), async (req, res) => {
    const fields = req.body;
    if (!fields.name?.trim() || fields.name.length > 60)
      throw fail(400, "预设名称需要为 1 到 60 个字符");
    if (!MODES.includes(fields.mode)) throw fail(400, "请选择有效的预设模式");
    if (fields.mode !== "clone" && !fields.instruction?.trim())
      throw fail(400, "请先填写声音描述或指导");
    if (
      (fields.instruction?.length || 0) > 3000 ||
      (fields.ref_text?.length || 0) > 10000
    )
      throw fail(400, "预设内容超过长度限制");
    if (store.state.presets.length >= 100)
      throw fail(400, "最多保存 100 个预设，请先删除不需要的预设");
    const item = {
      id: randomUUID(),
      name: fields.name.trim(),
      mode: fields.mode,
      instruction: fields.instruction || "",
      language: fields.language === "en" ? "en" : "zh",
      cfg_scale: Number(fields.cfg_scale) || 4,
      ref_text: fields.ref_text || "",
      referenceName: fields.referenceName || "",
      createdAt: new Date().toISOString(),
    };
    if (fields.save_reference === "true") {
      if (fields.authorized !== "true")
        throw fail(400, "保存参考音频前请确认拥有声音使用授权");
      validateWav(req.file);
      item.referencePath = path.join(store.dir, "references", item.id + ".wav");
      item.referenceName = req.file.originalname;
      await writeFile(item.referencePath, req.file.buffer);
    }
    store.state.presets.unshift(item);
    await store.save();
    res.status(201).json(store.publicRecord(item));
  });
  app.get("/api/presets/:id/reference", (req, res) => {
    const item = store.state.presets.find((item) => item.id === req.params.id);
    if (!item?.referencePath) throw fail(404, "此预设没有保存参考音频");
    res.sendFile(item.referencePath);
  });
  app.delete("/api/presets/:id", async (req, res) => {
    const item = store.state.presets.find((item) => item.id === req.params.id);
    if (!item) throw fail(404, "预设不存在");
    await store.removeFile(item.referencePath);
    store.state.presets = store.state.presets.filter((item) => item !== item);
    await store.save();
    res.status(204).end();
  });
  app.post(
    "/api/speech",
    (req, res, next) =>
      activeTask
        ? next(fail(409, "推理服务正忙，请等待当前任务结束后重试"))
        : next(),
    upload.single("ref_audio"),
    async (req, res) => {
      if (activeTask) throw fail(409, "推理服务正忙，请等待当前任务结束后重试");
      const fields = req.body;
      const invalid = validateSpeech(fields, !!req.file);
      if (invalid) throw fail(400, invalid);
      if (fields.mode !== "design") validateWav(req.file);
      const settings = { ...store.state.settings };
      const item = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        mode: fields.mode,
        text: fields.text,
        instruction: fields.mode === "clone" ? "" : fields.instruction,
        language: fields.language === "en" ? "en" : "zh",
        cfg_scale:
          fields.mode === "clone"
            ? null
            : Number(fields.cfg_scale || settings.defaultCfg),
        seed:
          fields.seed === "" || fields.seed === undefined
            ? null
            : Number(fields.seed),
        ref_text: fields.mode === "design" ? "" : fields.ref_text,
        referenceName: fields.mode === "design" ? "" : req.file.originalname,
        status: "generating",
        duration: 0,
      };
      activeTask = { ...item, cancelled: false };
      store.state.history.unshift(item);
      let pcmFile;
      const pcmPath = path.join(settings.outputDir, item.id + ".pcm.tmp");
      item.temporaryPath = pcmPath;
      let wavPath;
      let bytes = 0;
      let completed = false;
      let upstreamReader;
      let upstreamDone = false;
      const closed = () => {
        if (!completed && activeTask?.id === item.id)
          activeTask.cancelled = true;
      };
      res.on("close", closed);
      const timer = AbortSignal.timeout(timeoutMs);
      try {
        await store.save();
        await mkdir(settings.outputDir, { recursive: true });
        pcmFile = await open(pcmPath, "w");
        if (activeTask.cancelled) throw new Error("请求已停止");
        const form = new FormData();
        form.set("text", fields.text);
        if (fields.mode !== "clone") {
          form.set("instruction", fields.instruction);
          form.set("cfg_scale", String(item.cfg_scale));
        }
        if (item.seed !== null) form.set("seed", String(item.seed));
        if (fields.mode !== "design") {
          form.set("ref_text", fields.ref_text);
          form.set(
            "ref_audio",
            new Blob([req.file.buffer], { type: "audio/wav" }),
            req.file.originalname,
          );
        }
        const response = await fetch(settings.apiUrl + "/v1/audio/speech", {
          method: "POST",
          body: form,
          signal: timer,
        });
        if (!response.ok) {
          const body = (await response.text()).slice(0, 500);
          throw new Error(
            `模型服务返回 HTTP ${response.status}：${body || response.statusText}`,
          );
        }
        // Retain the reader even when format/disk validation fails. A rejected
        // response does not mean the single-concurrency model stopped working.
        if (response.body) upstreamReader = response.body.getReader();
        const contentType = response.headers.get("content-type") || "";
        if (
          contentType &&
          !/application\/octet-stream|audio\/(x-)?pcm|application\/binary/i.test(
            contentType,
          )
        )
          throw new Error(
            `模型返回了 ${contentType}，需要 24kHz 单声道 PCM16 音频流`,
          );
        if (!response.body) throw new Error("模型服务未返回音频流");
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Task-Id", item.id);
        res.setHeader("X-Sample-Rate", "24000");
        for (;;) {
          const { done, value: chunk } = await upstreamReader.read();
          if (done) {
            upstreamDone = true;
            break;
          }
          bytes += chunk.length;
          if (bytes > 256 * 1024 * 1024)
            throw new Error("音频输出超过 256 MB 限制，请缩短文本");
          await pcmFile.writeFile(chunk);
          if (!activeTask.cancelled) await writeClient(res, chunk);
        }
        await pcmFile.close();
        pcmFile = null;
        if (activeTask.cancelled) {
          item.status = "cancelled";
          item.error = "已停止接收和播放；上游推理已结束";
        } else {
          const header = wavHeader(bytes);
          wavPath = path.join(settings.outputDir, item.id + ".wav");
          const tempWav = wavPath + ".tmp";
          await writeFile(tempWav, header);
          await pipeline(
            createReadStream(pcmPath),
            createWriteStream(tempWav, { flags: "a" }),
          );
          await rename(tempWav, wavPath);
          if (activeTask.cancelled) {
            await store.removeFile(wavPath);
            item.status = "cancelled";
            item.error = "已停止接收和播放；上游推理已结束";
          } else {
            item.status = "completed";
            item.audioPath = wavPath;
            item.duration = bytes / 48000;
            item.bytes = bytes;
          }
        }
        delete item.temporaryPath;
        await store.save();
        await store.prune();
        completed = true;
        if (!res.destroyed) res.end();
      } catch (error) {
        item.status = activeTask?.cancelled ? "cancelled" : "failed";
        item.error = timer.aborted
          ? "模型响应超时，请检查服务状态后重试"
          : error.cause?.code === "ECONNREFUSED" ||
              error.message === "fetch failed"
            ? "无法连接模型服务，请检查 API 地址和服务状态"
            : error.message;
        if (wavPath) {
          await store.removeFile(wavPath);
          await store.removeFile(wavPath + ".tmp");
        }
        delete item.audioPath;
        delete item.temporaryPath;
        await store
          .save()
          .catch((err) => console.error("保存任务失败:", err.message));
        await store
          .prune()
          .catch((err) => console.error("清理历史失败:", err.message));
        completed = true;
        if (!res.destroyed) {
          if (!res.headersSent)
            res.status(502).json({ error: item.error, taskId: item.id });
          else res.destroy();
        }
      } finally {
        res.off("close", closed);
        // Keep the global lock while draining, including errors returned before
        // the first audio byte. The fetch timeout also bounds this cleanup.
        if (upstreamReader && !upstreamDone) {
          try {
            while (!(await upstreamReader.read()).done) {}
          } catch {
            // A broken connection or timeout already ended this upstream body.
          }
        }
        upstreamReader?.releaseLock();
        if (pcmFile) await pcmFile.close().catch(() => {});
        if (pcmPath) await store.removeFile(pcmPath).catch(() => {});
        activeTask = null;
      }
    },
  );
  app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
  const dist = path.resolve("dist");
  if (existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist));
    app.get("/{*path}", (req, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error instanceof multer.MulterError ? 400 : error.status || 500;
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "参考音频不能超过 20 MB"
        : error instanceof multer.MulterError
          ? "上传内容无效，请检查文件大小和字段"
          : error.message;
    if (status === 500) console.error(error);
    res.status(status).json({ error: message || "服务发生错误，请重试" });
  });
  return app;
}
