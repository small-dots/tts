import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Store } from "../server/store.js";
test("restart marks interrupted tasks failed and removes their partial audio without exposing disk paths", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "breeze-restart-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await new Store(dir).init();
  const temporaryPath = path.join(dir, "audio", "interrupted.pcm.tmp");
  await writeFile(temporaryPath, "partial");
  await writeFile(temporaryPath.replace(".pcm.tmp", ".wav.tmp"), "partial");
  store.state.history = [
    { id: "interrupted", status: "generating", temporaryPath },
  ];
  await store.save();
  const restored = await new Store(dir).init();
  assert.equal(restored.state.history[0].status, "failed");
  await assert.rejects(readFile(temporaryPath), { code: "ENOENT" });
  await assert.rejects(
    readFile(temporaryPath.replace(".pcm.tmp", ".wav.tmp")),
    { code: "ENOENT" },
  );
  assert.equal(
    "temporaryPath" in restored.publicRecord(restored.state.history[0]),
    false,
  );
});
