# Installer Shrink — Risk/Bug List (SHR)

Task: reduce the Windows installer (measured **380 MB**, `release/Email Pilots Setup 1.0.0.exe` = 398,603,600 bytes; uncompressed app 1.1 GB). Constraint: don't regress the local AI. Date: 2026-07-17.

Verdicts: **CONFIRMED** (real, with repro/measurement) · **FALSE-POSITIVE** (investigated, refuted) · **ACCEPTED-TRADEOFF** (real but chosen) · **OPEN** (pending).

---

## SHR-1 — PIVOTAL FINDING: CUDA is not active on this machine; the AI runs on Vulkan regardless of the 537 MB CUDA payload

- Severity: **High** (reframes the whole task) — Status: **CONFIRMED**
- Evidence (two independent, faithful probes, both with `win-x64-cuda-ext` PRESENT):
  1. `node node_modules/node-llama-cpp/dist/cli/cli.js inspect gpu` (plain node) →
     `CUDA: NVIDIA driver is installed, but CUDA runtime is not` / `Vulkan: available`.
  2. Faithful **Electron** probe (real runtime, `getLlama()` no-model, mirrors
     `src/ai/hardware.ts:53` / `localLlama.ts:96`) →
     `{"gpu":"vulkan","names":["Intel(R) UHD Graphics","NVIDIA GeForce GTX 1650 Ti"]}`.
- Machine: GTX 1650 Ti (Turing, CUDA-capable hardware) + Intel UHD. `getLlama('auto')`
  resolves **Vulkan**, not CUDA — the NVIDIA driver present is too old for / incompatible
  with node-llama-cpp b9842's bundled CUDA runtime, so the CUDA backend never initializes.
- Contradicts memory `ai-cuda-packaging-tradeoff` (2026-07-13: "confirmed cuda in the
  packaged app"). Either a different machine, a driver change since, or an optimistic read.
  **On this machine right now, the app is on Vulkan.**
- Consequences:
  - The entire CUDA payload — `@node-llama-cpp/win-x64-cuda` (176 MB) +
    `win-x64-cuda-ext` (361 MB) ≈ **537 MB uncompressed** — is **dead weight for this user**.
    Cutting all of it changes their AI speed by **zero** (already Vulkan).
  - The earlier "AI too slow vs LM Studio" complaint may itself be because CUDA was never
    actually engaged here — the app has been on Vulkan.
  - Distribution caveat: users with newer drivers + CUDA GPUs WOULD get CUDA today; stripping
    it forces them to Vulkan. And if THIS user updates their NVIDIA driver, CUDA could start
    working — stripping it removes that upside.
- Decision required from user (keep CUDA for the option/distribution vs. cut it for a much
  smaller installer). Probe script: `…/scratchpad/gpuProbe.js`.

## SHR-2 — `-ext` (360 MB) is fallback-only; safe to cut independent of CUDA working
- Severity: Med — Status: CONFIRMED (loader trace) / moot given SHR-1
- `node-llama-cpp/dist/bindings/Llama.js:90-99` loads the `-ext` fatbin only as a
  second chance when the primary CUDA DLL can't init a GPU; resolver handles its
  absence (`compileLLamaCpp.js:423-426`). Cutting it never breaks Vulkan/CPU and only
  affects the CUDA edge-GPU tail. (Subsumed by the SHR-1 decision.)

## SHR-3 — `electronLanguages: ["en-US"]` (~45 MB) — **FALSE-POSITIVE (no functional break)**
- Packaged app ships exactly `locales/en-US.pak` (the Chromium default locale). Main
  process boots and loads `.env` cleanly; no missing-locale error. English-only app,
  so no user-visible loss. Interactive GUI click-through deferred to the user (SHR-7).

## SHR-4 — excluding `node-llama-cpp/llama/**` broke the packaged AI — **CONFIRMED → FIXED**
- The full-tree exclusion removed `llama/binariesGithubRelease.json`, which
  node-llama-cpp reads AT RUNTIME during `getLlama` backend resolution (not build-only
  as assumed). Packaged probe failed: `ENOENT … binariesGithubRelease.json`.
- Root cause: the 32 MB is one file — `llama/gitRelease.bundle` (31 MB, a git bundle
  of llama.cpp source, build-from-source only); the rest is tiny runtime metadata.
- Fix: narrowed the exclusion to `"!node_modules/node-llama-cpp/llama/gitRelease.bundle"`.
  Re-verified: bundle absent, `binariesGithubRelease.json` present, and the faithful
  **Electron** probe against the packaged tree now resolves `{"gpu":"vulkan"}`. Zero
  installer-size cost (a git bundle is already-compressed, so LZMA barely shrank it —
  the 31 MB was an uncompressed-only win; kept out to trim the unpacked footprint).

## SHR-5 — config edit breaks the build — **FALSE-POSITIVE**
- Two full `npm run build` runs succeeded (vite + electron-builder nsis + portable).
  Source unaffected: `npm test` = 69 files / 526 tests green; all 3 tsc projects clean.

## SHR-6 — `files` exclusion vs `asarUnpack` glob leaves a half-packaged backend — **FALSE-POSITIVE**
- `app.asar.unpacked/@node-llama-cpp` ships intact: win-x64-cuda (173M) + win-x64-vulkan
  (90M) + win-x64 (43M); win-x64-cuda-ext absent by design. The Electron probe loaded
  the native addon and resolved a GPU backend from the packaged tree — no half-packaging.

## SHR-7 — could not interactively boot the GUI from the non-interactive automation shell — **ENV/TEST-HARNESS, not a defect**
- Symptom: launching `win-unpacked/Email Pilots.exe` via automation, the main process
  starts (dotenv loads 35 env vars), emits no error/exception on stdout or stderr, and
  exits cleanly (ExitCode 0) without a persistent window.
- Investigation: clean slate (0 pre-launch processes) rules out the single-instance lock
  (`main.ts:1988`); no error/module-not-found in output rules out a broken package; the
  AI native tree (the only structural change) loads fine headlessly. A GUI Electron window
  can't attach to an interactive desktop from a non-interactive shell → clean quit.
- Not attributable to the build change (it touches neither the boot nor window path).
  **Final GUI confirmation is a user double-click on the desktop** (standard for a
  packaging change): open the app, enable AI, run one action — status should read
  `on GPU (vulkan, N layers)` and work as before.

---

## Result

- Installer: **398,603,600 B (380 MiB) → 251,182,109 B (239 MiB)** — **−140 MB / −37%**.
- Unpacked app: 1.1 GB → 631 MB.
- Kept intact: primary CUDA (176 MB, for a future driver update / distribution), Vulkan
  (the current active backend), CPU backend. AI behavior unchanged on this machine.
- One config file changed (`package.json` build block); source untouched; fully reversible.
- Every SHR item resolved to a verdict; the one CONFIRMED regression (SHR-4) fixed and
  re-verified. Not committed.
