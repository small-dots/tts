// Test-only model fixture. Produces a quiet synthetic tone, never speech.
// Run with `node tests/fixture-server.js`; not used by the normal application.
import http from "node:http";
const port = Number(process.env.FIXTURE_PORT || 7861);
http
  .createServer(async (req, res) => {
    if (req.url === "/openapi.json") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ paths: { "/v1/audio/speech": { post: {} } } }));
      return;
    }
    if (req.url !== "/v1/audio/speech" || req.method !== "POST") {
      res.writeHead(404);
      res.end();
      return;
    }
    for await (const chunk of req) {
    }
    const pcm = Buffer.alloc(96000);
    for (let i = 0; i < 48000; i++)
      pcm.writeInt16LE(
        Math.round(
          Math.sin((i * 2 * Math.PI * 220) / 24000) *
            1500 *
            Math.min(1, i / 1200, (48000 - i) / 1200),
        ),
        i * 2,
      );
    res.writeHead(200, { "content-type": "application/octet-stream" });
    for (let offset = 0; offset < pcm.length; offset += 3333) {
      res.write(pcm.subarray(offset, offset + 3333));
      await new Promise((resolve) => setTimeout(resolve, 65));
    }
    res.end();
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`TEST PCM FIXTURE ONLY: http://127.0.0.1:${port}`),
  );
