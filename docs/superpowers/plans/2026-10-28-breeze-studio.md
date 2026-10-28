# Breeze TTS Studio Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task in this session.

**Goal:** Deliver the local V1.0 workstation from the supplied requirements.
**Architecture:** Vue browser -> Express filesystem/streaming adapter -> existing model API. Server-wide reject-on-busy task control. Complete audio stored as WAV.
**Tech Stack:** Vue 3, Vite, JavaScript, Ant Design Vue, SCSS, Web Audio, Express, Node >=22.
**Spec:** docs/superpowers/specs/2026-10-28-breeze-studio-design.md

## Global Constraints

- PCM: 24,000 Hz, mono, signed little-endian 16-bit.
- POST /v1/audio/speech multipart fields from supplied spec.
- Default model URL http://127.0.0.1:7860. Localhost only; do not change inference code.
- No persistent reference audio without explicit consent. No invented model/GPU status.

## Review Focus

- Odd PCM chunk boundary and truncated bytes must not corrupt WAV or playback.
- A second browser must get 409 while the upstream request is still running, including after cancellation.
- Missing/invalid reference and required instructions must be rejected before inference.
- Failed/empty/non-PCM upstream output must not produce successful history.
- History and explicit presets must survive restart; deletion and retention clean audio.

### Task 1: Audio and validation contract
Files: shared/audio.js, shared/validation.js, tests/audio.test.js.
Interfaces: pcmToWav(Uint8Array) -> Uint8Array; PcmDecoder.push(Uint8Array) -> Float32Array; validateSpeech(fields, hasAudio) -> string|null.
- [x] Write byte-level WAV, odd chunk and mode validation tests and confirm failure.
- [x] Implement shared utilities and run npm test.

### Task 2: Local API
Files: server/store.js, server/app.js, server/index.js, tests/server.test.js.
Interfaces: createApp({dataDir, apiUrl, timeoutMs}) -> Express app. /api/health, /api/settings, /api/speech, /api/history, /api/audio, /api/presets.
- [x] Write local HTTP-fixture integration tests; verify initial failure.
- [x] Implement durable JSON store, streamed proxy, WAV finalization, validation, global task lock, presets and settings.
- [x] Run suite for multipart forwarding, early bytes, concurrency after disconnect, errors, persistence, reference opt-in and cleanup.

### Task 3: Vue workstation
Files: src/App.vue, src/style.scss, src/components/{StudioEditor,ResultPanel,AudioPlayer,HistoryView,PresetsView,SettingsView,AppIcon}.vue, src/composables/{useStudio,usePcmPlayer}.js, src/main.js, src/presets.js, vite.config.js, index.html.
Interfaces: reactive studio state centralizes independent drafts, request lifecycle, health, settings, persistence, result selection. AudioPlayer accepts PCM streaming engine or stored WAV.
- [x] Build three-column UI and all views against the local API.
- [x] Implement streaming Web Audio with bounded scheduled buffers and pause/resume/seek/cleanup.
- [x] Run production build, start local preview and inspect browser on desktop and narrow widths.

### Task 4: Delivery
Files: README.md.
- [x] Document development/production startup, model contract, storage, cancellation and verification limits.
- [x] Complete npm test and npm run build; exercise UI and model fixture.
- [x] Deliver local URL and explicit real-model verification status.

## Verification record — 2026-10-28

- 21 automated tests passed (`npm test`); production build passed (`npm run build`).
- Browser verified all three generation modes through a synthetic PCM fixture, streamed playback, reference upload metadata/authorization, opt-in reference presets, WAV download (96044 bytes, 24000 Hz mono PCM16), cancellation/draining, history search, same-ID history waveform reload, settings save, dark/light themes, 1440px desktop and 390px narrow layouts.
- Production bundle served by Express and browser console checked without errors.
- Review findings fixed with reproducing tests: rejected upstream bodies retain task lock until drained; failed tasks are pruned; compacted waveform buckets keep uniform time spans.
- Fixture stopped; test records/presets removed; API address restored to http://127.0.0.1:7860.
- Actual model inference quality remains unverified because the model service was not running.
- Workspace began empty without Git; no existing work was modified and no commit/PR was created.
