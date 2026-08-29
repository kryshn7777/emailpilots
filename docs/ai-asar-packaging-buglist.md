# AI asar Packaging — Bug List (AAP)

Task: packaged app throws `The AI engine isn't available on this computer. (AI runtime
unavailable: Cannot find package '…\resources\app.asar\node_modules\node-llama-cpp\index.js'
imported from …\app.asar\dist-electron\main.js)`. Reported from a **portable** build
(temp-extracted). Date: 2026-07-21.

Verdicts: **CONFIRMED** · **FALSE-POSITIVE** · **ACCEPTED-TRADEOFF** · **OPEN**.

---

## AAP-1 — `asarUnpack` unpacked node-llama-cpp's **own JS**, breaking ESM resolution — **CONFIRMED → FIXED**

- Severity: **High** (AI totally dead in the packaged app) — Status: **CONFIRMED → FIXED**
- Root cause: `asarUnpack: ["node_modules/node-llama-cpp/**", …]`. The `/**` yanked
  node-llama-cpp's JS entry (`dist/index.js`) OUT of the asar into `app.asar.unpacked`
  (confirmed: `release/win-unpacked/resources/app.asar.unpacked/…/node-llama-cpp/dist/index.js`
  present pre-fix).
- Why it fails: the bundled **CJS** main does a genuine bare ESM `import("node-llama-cpp")`
  (the `new Function('s','return import(s)')` escape hatch in `src/ai/runtime.ts`). ESM
  resolution walks to the `app.asar` header path, but the bytes live in `app.asar.unpacked`.
  **Electron's ESM loader does not honor the asar→unpacked redirect that CJS `require` does**
  — so it can't load the JS and reports the fallback `node-llama-cpp/index.js` as missing.
- Reference: node-llama-cpp's official electron template
  (`templates/electron-typescript-react/electron-builder.ts`) unpacks **native binaries
  only** — `node-llama-cpp/bins`, `node-llama-cpp/llama/localBuilds`, `@node-llama-cpp/*` —
  and keeps the JS **packed**, where ESM-in-asar resolution works. The library has custom
  Electron adaptations that locate the unpacked binaries from inside the asar.
- Why the earlier SHR audit missed it: SHR-6/SHR-7 (2026-07-17) verified the files *ship*
  (`app.asar.unpacked` intact) and a mirror probe loaded the native addon, but the probe ran
  from loose files (real `node_modules`), never from **inside** the asar — so the packaged
  ESM-import path was never exercised until a user double-clicked.
- Fix: narrow `asarUnpack` to the native-binary paths, keeping `node-llama-cpp/dist` packed:
  ```
  "asarUnpack": [
    "node_modules/node-llama-cpp/bins/**",
    "node_modules/node-llama-cpp/llama/localBuilds/**",
    "node_modules/@node-llama-cpp/**"
  ]
  ```
- Verification: (structural) rebuilt — `node-llama-cpp/dist/index.js` no longer in
  `app.asar.unpacked`; `@node-llama-cpp/win-x64*` native binaries still unpacked.
  (functional) user boots packaged app → enable AI → status loads (no "runtime unavailable").

## AAP-2 — "defaults to VULKAN, too slow" is driver-bound, NOT this bug — **separate (see SHR-1)**

- Once AAP-1 is fixed the AI runs, but on this machine (GTX 1650 Ti + Intel UHD)
  `getLlama('auto')` resolves **Vulkan**, not CUDA: the installed NVIDIA driver is too old
  for node-llama-cpp b9842's bundled CUDA runtime (SHR-1, 2026-07-17, re-confirmed with the
  CUDA payload present). The primary CUDA backend (`@node-llama-cpp/win-x64-cuda`, 176 MB)
  still ships, so **updating the NVIDIA driver** is the lever to get CUDA (faster). No code
  change moves Vulkan→CUDA here.
