import { createApp } from "./app.js";
const port = Number(process.env.PORT || 3001);
const app = await createApp({
  dataDir: process.env.STUDIO_DATA_DIR || "./data",
  apiUrl: process.env.BREEZE_API_URL,
  timeoutMs: Number(process.env.BREEZE_TIMEOUT_MS || 600000),
});
app.listen(port, "127.0.0.1", () =>
  console.log(`Breeze TTS Studio API: http://127.0.0.1:${port}`),
);
