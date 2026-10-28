import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

export class Store {
  constructor(dataDir, apiUrl) {
    this.dir = path.resolve(dataDir);
    this.state = {
      settings: {
        apiUrl: apiUrl || "http://127.0.0.1:7860",
        defaultCfg: 4,
        seedStrategy: "random",
        defaultSeed: 42,
        outputDir: path.join(this.dir, "audio"),
        retention: 100,
      },
      history: [],
      presets: [],
    };
    this.writes = Promise.resolve();
  }
  async init() {
    await mkdir(this.dir, { recursive: true });
    await mkdir(path.join(this.dir, "references"), { recursive: true });
    try {
      const saved = JSON.parse(
        await readFile(path.join(this.dir, "studio.json"), "utf8"),
      );
      this.state = {
        ...this.state,
        ...saved,
        settings: { ...this.state.settings, ...saved.settings },
      };
    } catch (error) {
      if (error.code !== "ENOENT")
        throw new Error(
          `无法读取本地记录，请检查 ${path.join(this.dir, "studio.json")}：${error.message}`,
        );
    }
    await mkdir(this.state.settings.outputDir, { recursive: true });
    for (const item of this.state.history)
      if (item.status === "generating") {
        item.status = "failed";
        item.error = "工作台服务已重启，上一任务未完成";
        if (item.temporaryPath) {
          await this.removeFile(item.temporaryPath);
          await this.removeFile(
            item.temporaryPath.replace(".pcm.tmp", ".wav.tmp"),
          );
          delete item.temporaryPath;
        }
      }
    await this.save();
    return this;
  }
  save() {
    const snapshot = JSON.stringify(this.state, null, 2);
    const operation = this.writes
      .catch(() => {})
      .then(async () => {
        const destination = path.join(this.dir, "studio.json");
        await writeFile(destination + ".tmp", snapshot);
        await rename(destination + ".tmp", destination);
      });
    this.writes = operation;
    return operation;
  }
  async removeFile(file) {
    if (file)
      await unlink(file).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
  }
  async prune() {
    const limit = this.state.settings.retention;
    if (!limit) return;
    const finished = this.state.history.filter(
      (item) => item.status !== "generating",
    );
    const remove = finished.slice(limit);
    for (const item of remove) await this.removeFile(item.audioPath);
    const ids = new Set(remove.map((item) => item.id));
    this.state.history = this.state.history.filter((item) => !ids.has(item.id));
    await this.save();
  }
  publicRecord(item) {
    if (!item) return null;
    const { audioPath, referencePath, temporaryPath, ...publicItem } = item;
    return {
      ...publicItem,
      hasAudio: !!audioPath,
      hasReference: !!referencePath,
    };
  }
}
