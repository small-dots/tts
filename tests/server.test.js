import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve(`http://127.0.0.1:${server.address().port}`),
    ),
  );
const close = (server) =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  });
function speech(extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    mode: "design",
    text: "测试语音",
    instruction: "温柔亲切",
    cfg_scale: "4",
    ...extra,
  }))
    data.set(key, value);
  return data;
}
const wav = new Uint8Array(48);
new DataView(wav.buffer).setUint32(4, 40, true);
wav.set(new TextEncoder().encode("RIFF"), 0);
wav.set(new TextEncoder().encode("WAVEfmt "), 8);
new DataView(wav.buffer).setUint32(16, 16, true);
new DataView(wav.buffer).setUint16(20, 1, true);
new DataView(wav.buffer).setUint16(22, 1, true);
new DataView(wav.buffer).setUint32(24, 24000, true);
new DataView(wav.buffer).setUint32(28, 48000, true);
new DataView(wav.buffer).setUint16(32, 2, true);
new DataView(wav.buffer).setUint16(34, 16, true);
wav.set(new TextEncoder().encode("data"), 36);
new DataView(wav.buffer).setUint32(40, 4, true);

test("local API streams, persists WAV, rejects concurrency, validates uploads and handles failure", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "breeze-test-"));
  let upstreamPayload = "";
  let upstreamFinished = true;
  let bad = false;
  const model = http.createServer(async (req, res) => {
    if (req.url === "/openapi.json") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ paths: { "/v1/audio/speech": { post: {} } } }));
      return;
    }
    for await (const chunk of req) upstreamPayload += chunk.toString();
    upstreamFinished = false;
    if (bad === "empty") {
      res.end();
      upstreamFinished = true;
      return;
    }
    if (bad === "slow-wav") {
      res.writeHead(200, { "content-type": "audio/wav" });
      res.write(Buffer.from("RIFF"));
      await sleep(160);
      res.end(Buffer.from("WAVE"));
      upstreamFinished = true;
      return;
    }
    if (bad === "wav") {
      res.writeHead(200, { "content-type": "audio/wav" });
      res.end(Buffer.from("RIFF"));
      upstreamFinished = true;
      return;
    }
    if (bad === "odd") {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(Buffer.from([0, 0, 0]));
      upstreamFinished = true;
      return;
    }
    if (bad) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end('{"detail":"model unavailable"}');
      upstreamFinished = true;
      return;
    }
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.write(Buffer.from([0, 0, 0]));
    await sleep(160);
    res.end(Buffer.from([128, 255, 127]));
    upstreamFinished = true;
  });
  const modelUrl = await listen(model);
  const app = await createApp({
    dataDir: dir,
    apiUrl: modelUrl,
    timeoutMs: 2000,
  });
  const server = http.createServer(app);
  const base = await listen(server);
  t.after(async () => {
    await close(server);
    await close(model);
    await rm(dir, { recursive: true, force: true });
  });
  const json = async (endpoint) => (await fetch(base + endpoint)).json();
  await t.test("health checks the actual service contract", async () => {
    const health = await json("/api/health");
    assert.equal(health.inference.status, "ready");
    assert.equal(health.activeTask, null);
  });
  let id;
  await t.test(
    "first bytes arrive before upstream completion and concurrent browsers get 409",
    async () => {
      const response = await fetch(base + "/api/speech", {
        method: "POST",
        body: speech(),
      });
      assert.equal(response.status, 200);
      id = response.headers.get("x-task-id");
      assert.ok(id);
      const reader = response.body.getReader();
      const first = await reader.read();
      assert.ok(first.value.length > 0);
      assert.equal(upstreamFinished, false);
      const second = await fetch(base + "/api/speech", {
        method: "POST",
        body: speech(),
      });
      assert.equal(second.status, 409);
      const chunks = [first.value];
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        chunks.push(part.value);
      }
      assert.deepEqual([...Buffer.concat(chunks)], [0, 0, 0, 128, 255, 127]);
      assert.match(upstreamPayload, /name="cfg_scale"\r\n\r\n4/);
      assert.doesNotMatch(upstreamPayload, /name="mode"/);
    },
  );
  await t.test(
    "completed history survives disk reload and downloads a valid WAV",
    async () => {
      const history = await json("/api/history");
      assert.equal(history[0].status, "completed");
      assert.equal(history[0].duration, 0.000125);
      const response = await fetch(base + `/api/audio/${id}/download`);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(bytes.readUInt32LE(24), 24000);
      assert.equal(bytes.readUInt32LE(40), 6);
      const app2 = await createApp({ dataDir: dir, apiUrl: modelUrl });
      const server2 = http.createServer(app2);
      const base2 = await listen(server2);
      assert.equal(
        (await (await fetch(base2 + "/api/history")).json())[0].id,
        id,
      );
      await close(server2);
    },
  );
  await t.test("invalid input is rejected before a model request", async () => {
    const invalid = await fetch(base + "/api/speech", {
      method: "POST",
      body: speech({ instruction: "" }),
    });
    assert.equal(invalid.status, 400);
    const data = speech({
      mode: "clone",
      ref_text: "原文",
      authorized: "true",
    });
    data.set(
      "ref_audio",
      new Blob(["not wave"], { type: "audio/wav" }),
      "bad.wav",
    );
    assert.equal(
      (await fetch(base + "/api/speech", { method: "POST", body: data }))
        .status,
      400,
    );
  });
  await t.test(
    "clone forwards reference but omits unrelated instruction and cfg fields",
    async () => {
      upstreamPayload = "";
      const data = speech({
        mode: "clone",
        ref_text: "准确原文",
        authorized: "true",
      });
      data.set(
        "ref_audio",
        new Blob([wav], { type: "audio/wav" }),
        "reference.wav",
      );
      const response = await fetch(base + "/api/speech", {
        method: "POST",
        body: data,
      });
      await response.arrayBuffer();
      assert.match(upstreamPayload, /name="ref_audio"/);
      assert.match(upstreamPayload, /准确原文/);
      assert.doesNotMatch(upstreamPayload, /name="instruction"/);
      assert.doesNotMatch(upstreamPayload, /name="cfg_scale"/);
      assert.deepEqual(await readdir(path.join(dir, "references")), []);
    },
  );
  await t.test(
    "disconnect keeps the task lock until inference finishes",
    async () => {
      const controller = new AbortController();
      const response = await fetch(base + "/api/speech", {
        method: "POST",
        body: speech(),
        signal: controller.signal,
      });
      await response.body.getReader().read();
      controller.abort();
      await sleep(25);
      assert.equal(
        (await fetch(base + "/api/speech", { method: "POST", body: speech() }))
          .status,
        409,
      );
      await sleep(200);
      assert.equal((await json("/api/health")).activeTask, null);
      assert.equal((await json("/api/history"))[0].status, "cancelled");
    },
  );
  await t.test(
    "model errors return actionable JSON and failed history without downloadable audio",
    async () => {
      bad = true;
      const response = await fetch(base + "/api/speech", {
        method: "POST",
        body: speech(),
      });
      assert.equal(response.status, 502);
      assert.match((await response.json()).error, /model unavailable/);
      const history = await json("/api/history");
      assert.equal(history[0].status, "failed");
      assert.equal(
        (await fetch(base + `/api/audio/${history[0].id}`)).status,
        404,
      );
      bad = false;
    },
  );
  await t.test(
    "empty, truncated and non-PCM model output never becomes successful audio",
    async () => {
      for (const kind of ["empty", "wav", "odd"]) {
        bad = kind;
        try {
          const response = await fetch(base + "/api/speech", {
            method: "POST",
            body: speech(),
          });
          await response.arrayBuffer();
        } catch {}
        await sleep(20);
        const item = (await json("/api/history"))[0];
        assert.equal(item.status, "failed");
        assert.equal(item.hasAudio, false);
      }
      bad = false;
    },
  );
  await t.test(
    "invalid response keeps the global lock until its upstream body is drained",
    async () => {
      bad = "slow-wav";
      const response = await fetch(base + "/api/speech", {
        method: "POST",
        body: speech(),
      });
      assert.equal(response.status, 502);
      await sleep(40);
      assert.equal(upstreamFinished, false);
      assert.equal(
        (await fetch(base + "/api/speech", { method: "POST", body: speech() }))
          .status,
        409,
      );
      await sleep(200);
      bad = false;
    },
  );
  await t.test(
    "references are saved only by explicit preset opt-in and removed with the preset",
    async () => {
      const data = speech({
        mode: "clone",
        name: "我的声音",
        ref_text: "原文",
        save_reference: "true",
      });
      data.set("ref_audio", new Blob([wav], { type: "audio/wav" }), "ref.wav");
      assert.equal(
        (await fetch(base + "/api/presets", { method: "POST", body: data }))
          .status,
        400,
      );
      data.set("authorized", "true");
      const response = await fetch(base + "/api/presets", {
        method: "POST",
        body: data,
      });
      assert.equal(response.status, 201);
      const preset = await response.json();
      assert.equal(preset.hasReference, true);
      assert.equal((await readdir(path.join(dir, "references"))).length, 1);
      assert.equal(
        (await fetch(base + `/api/presets/${preset.id}/reference`)).status,
        200,
      );
      assert.equal(
        (await fetch(base + `/api/presets/${preset.id}`, { method: "DELETE" }))
          .status,
        204,
      );
      assert.deepEqual(await readdir(path.join(dir, "references")), []);
    },
  );
  await t.test(
    "settings validate URL and numeric values, retention removes old audio",
    async () => {
      assert.equal(
        (
          await fetch(base + "/api/settings", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ apiUrl: "file:///tmp" }),
          })
        ).status,
        400,
      );
      const response = await fetch(base + "/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ retention: 1 }),
      });
      assert.equal(response.status, 200);
      assert.equal((await json("/api/history")).length, 1);
      assert.equal((await readdir(path.join(dir, "audio"))).length, 0);
    },
  );
  await t.test("failed tasks obey the configured retention limit", async () => {
    bad = true;
    for (let n = 0; n < 2; n++) {
      const response = await fetch(base + "/api/speech", {
        method: "POST",
        body: speech(),
      });
      assert.equal(response.status, 502);
      await response.json();
      await sleep(15);
    }
    assert.equal((await json("/api/history")).length, 1);
    bad = false;
  });
  await t.test(
    "deletion removes metadata and invalid IDs cannot access files",
    async () => {
      const history = await json("/api/history");
      assert.equal(
        (
          await fetch(base + `/api/history/${history[0].id}`, {
            method: "DELETE",
          })
        ).status,
        204,
      );
      assert.deepEqual(await json("/api/history"), []);
      assert.equal((await fetch(base + "/api/audio/not-a-record")).status, 404);
    },
  );
});
