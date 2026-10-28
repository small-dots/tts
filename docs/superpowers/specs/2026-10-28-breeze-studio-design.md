# Breeze TTS Studio V1.0

Implement the supplied local research workstation spec. The user confirmed the model uses POST /v1/audio/speech, multipart input and 24kHz mono signed PCM16 LE output.

## Architecture and approach

Use the requested Vue 3 + Vite + JavaScript + Ant Design Vue + SCSS frontend and Express intermediary. A direct browser connection would omit global concurrency and durable history; a cloud-hosted app would not fit local model access. Implement the specified local intermediary architecture. Design choices made by the implementer: reject concurrent requests with 409 rather than maintain a queue; bind services to loopback; store metadata as JSON and output as WAV on disk. No model core changes.

## Experience

Default charcoal theme with violet accent, compact left navigation, generous central editor and persistent right result player; responsive stacked results. Chinese UI, English product branding. Three independently retained mode drafts. Six bilingual editable design and direction presets; cursor event insertion; WAV upload, transcript and authorization; advanced CFG/seed; real waveform, seek, pause, replay, volume and downloads. History supports search, mode filter, deletion and reuse. Presets support name, mode, instruction and explicitly opted-in reference storage. Settings configure model URL, defaults, output directory, retention and light/dark theme.

## Data and failures

Shared validation for text, instruction, seed, CFG and mode. Uploads <=20MiB and WAV RIFF validation. Node forwards only model-supported fields. Stream bytes are correctly reassembled across odd chunk boundaries. Web Audio schedules small buffers and pauses scheduled sources safely. Save complete PCM as proper WAV only after successful end, and retain failed/cancelled task metadata. On browser cancellation, continue draining the upstream while retaining the single-task lock, since cancellation does not guarantee model computation has stopped. Partial audio never appears as a completed download. Bound model timeout. Disk and upstream failures are actionable.

Settings/history/presets are persisted locally. Reference audio is stored only by an explicit save-reference preset choice; histories otherwise keep only its name. Retention removes old audio and metadata. Model/GPU metrics remain unknown rather than simulated. No fake generated histories or demo audio. No ASR, training, accounts, billing or P2 batching.

## Verification

Node built-in tests for WAV bytes, malformed inputs, validation, proxy field mapping, true streaming, concurrency, cancellation, failure and disk persistence. Production frontend build and browser walkthrough of all views, theme, upload and event insertion. Use a test-only PCM HTTP fixture for integration; actual model quality requires the user's running model service.
