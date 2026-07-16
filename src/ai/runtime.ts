/**
 * The one place node-llama-cpp is imported.
 *
 * Bundler-opaque dynamic import. node-llama-cpp v3 is ESM-only, but the Electron
 * main process is bundled to CJS (no `"type":"module"`). A literal
 * `import('node-llama-cpp')` would be rewritten to `require()` by esbuild/tsc under
 * CJS output and throw `ERR_REQUIRE_ESM`. Hiding the specifier inside `new Function`
 * keeps a genuine runtime ESM `import()`, which Node's loader resolves from CJS.
 *
 * DO NOT "simplify" this back to a literal dynamic import — it will break the
 * packaged app. (See the plan's "ESM-from-CJS gotcha".)
 *
 * SECURITY: the function body is a fixed string literal with NO interpolation or
 * concatenation, and the only specifier ever passed is the hardcoded module-level
 * constant `MODULE` — no user, network or file input can reach it, so this is not a
 * code-injection vector. Do not export `dynamicImport`, and do not extend it to take
 * a caller-supplied body or specifier.
 *
 * This lived inside providers/localLlama.ts while it had exactly one caller. The
 * hardware probe needs the same runtime without loading a model, and a second
 * hand-rolled copy of a workaround whose own docblock says "do not simplify" is
 * precisely how the two drift apart — so it moved here. The mechanism is unchanged;
 * only its file is.
 */
const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>;

const MODULE = 'node-llama-cpp';

let cached: any = null;

/**
 * Import node-llama-cpp once and cache it.
 *
 * THROWS when the module or its native binary is unavailable — callers decide what
 * that means (the provider reports it through `AiStatus.error`; the hardware probe
 * reports `hasRuntime: false`), and each wants its own message, so this does not
 * swallow it into a null.
 *
 * Importing the module does NOT load a model, allocate VRAM, or touch the GPU. That
 * only happens on `getLlama()` / `loadModel()`.
 */
export async function loadAiRuntime(): Promise<any> {
  if (cached) return cached;
  cached = await dynamicImport(MODULE);
  return cached;
}
