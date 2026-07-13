import * as fs from 'fs';
import type { Config } from '../../config';
import type { AiProvider } from '../aiProvider';
import type { AiStatus, AiGenerateRequest, AiGenerateResult } from '../types';

/**
 * Bundler-opaque dynamic import.
 *
 * node-llama-cpp v3 is ESM-only, but the Electron main process is bundled to CJS
 * (no `"type":"module"`). A literal `import('node-llama-cpp')` would be rewritten
 * to `require()` by esbuild/tsc under CJS output and throw `ERR_REQUIRE_ESM`.
 * Hiding the specifier inside `new Function` keeps a genuine runtime ESM
 * `import()`, which Node's loader resolves from CJS.
 *
 * DO NOT "simplify" this back to a literal dynamic import — it will break the
 * packaged app. (See the plan's "ESM-from-CJS gotcha".)
 *
 * SECURITY: the function body is a fixed string literal with NO interpolation or
 * concatenation, and the sole caller passes the hardcoded constant
 * `'node-llama-cpp'` — no user/network/file input ever reaches it. It is therefore
 * not a code-injection vector. Do not extend it to accept caller-supplied bodies.
 */
const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>;

/** Generation cap when a request omits `maxTokens` (kept modest for latency). */
const DEFAULT_MAX_TOKENS = 512;

/**
 * Local GGUF provider backed by node-llama-cpp. Runs fully in-process and offline:
 * **zero network calls, no telemetry** (the privacy contract). The native runtime
 * and the (multi-GB) model load lazily on first use and are cached as singletons;
 * generations are serialised through a promise queue because a single context
 * sequence is not reentrant.
 *
 * Every "not available" condition (missing dep, missing model, load failure) is
 * reported through `status()` — construction and `status()` never throw.
 */
export class LocalLlamaProvider implements AiProvider {
  private nlc: any = null;               // the imported node-llama-cpp module
  private llama: any = null;
  private model: any = null;
  private context: any = null;
  private jsonGrammar: any = null;
  private loadPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve(); // generation mutex
  private lastError: string | undefined;
  private activeGpuType: string | undefined;   // resolved backend after load ('cpu' when GPU off)
  private activeGpuLayers: number | undefined;  // layers offloaded to the GPU (0 ⇒ CPU)
  private loadProgressCb: ((p: number) => void) | undefined; // set during preload()

  constructor(private config: Config) {}

  /** Import node-llama-cpp once. Returns null (never throws) when unavailable. */
  private async runtime(): Promise<any> {
    if (this.nlc) return this.nlc;
    try {
      this.nlc = await dynamicImport('node-llama-cpp');
      return this.nlc;
    } catch (e: any) {
      this.lastError = `AI runtime unavailable: ${e?.message || e}`;
      return null;
    }
  }

  /** Load the model + context exactly once. Clears itself on failure so a later
   *  retry (e.g. after the user picks a valid model) can try again. */
  private ensureLoaded(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    const p = (async () => {
      const nlc = await this.runtime();
      if (!nlc) throw new Error(this.lastError || 'AI runtime unavailable');
      const modelPath = this.config.ai?.modelPath;
      if (!modelPath) throw new Error('No model configured');
      if (!fs.existsSync(modelPath)) throw new Error(`Model file not found: ${modelPath}`);
      // Default to a modest context so the KV cache stays small. A model's native
      // context (often 32k-128k) can need multiple GB and fail to allocate —
      // especially on the Vulkan/GPU backend with limited VRAM.
      const configured = this.config.ai?.contextSize;
      const wanted = configured && configured > 0 ? configured : 4096;
      const smallCtx = Math.min(wanted, 2048);
      const forced = this.config.ai?.gpu || 'auto';
      const userLayers = this.config.ai?.gpuLayers;       // number | undefined; 0 ⇒ CPU
      const wantFlash = this.config.ai?.flashAttention !== false; // default on

      // Attempt ladder. The key to matching LM Studio/Ollama speed is to stay on the
      // GPU: offload as many layers as FIT the intended context (`fitContext` reserves
      // VRAM for the KV cache — the previous code let "auto" layers eat the VRAM, then
      // the context alloc OOM'd → CPU) and use flash attention to shrink that KV. Only
      // after the GPU options are exhausted do we fall back to CPU.
      type Attempt = { gpu: any; contextSize: number; gpuLayers?: any; label: string };
      const cpu = (ctx: number): Attempt => ({ gpu: { gpu: false }, contextSize: ctx, label: `cpu@${ctx}` });
      const attempts: Attempt[] = [];
      if (forced === 'cpu' || userLayers === 0) {
        attempts.push(cpu(smallCtx));
      } else {
        const gpuOpt = forced === 'auto' ? {} : { gpu: forced };
        // Explicit user layer count wins; otherwise auto-fit while reserving KV room.
        const fit = (ctx: number) => (typeof userLayers === 'number' && userLayers > 0)
          ? userLayers
          : { fitContext: { contextSize: ctx } };
        attempts.push({ gpu: gpuOpt, contextSize: wanted, gpuLayers: fit(wanted), label: `gpu@${wanted}` });
        if (smallCtx < wanted) attempts.push({ gpu: gpuOpt, contextSize: smallCtx, gpuLayers: fit(smallCtx), label: `gpu@${smallCtx}` });
        // Last GPU try: leave headroom (min 1 layer, fit the small context) before CPU.
        attempts.push({ gpu: gpuOpt, contextSize: smallCtx, gpuLayers: { min: 1, fitContext: { contextSize: smallCtx } }, label: `gpu@${smallCtx}/fit` });
        attempts.push(cpu(smallCtx));
      }

      let lastErr: any;
      for (const a of attempts) {
        try {
          this.llama = await nlc.getLlama(a.gpu);
          this.model = await this.llama.loadModel({
            modelPath,
            ...(a.gpuLayers !== undefined ? { gpuLayers: a.gpuLayers } : {}),
            // Forward llama.cpp's load progress (0..1) to any active preload() listener.
            onLoadProgress: (p: number) => { try { this.loadProgressCb?.(p); } catch { /* ignore */ } },
          });
          // Flash attention only when the model supports it; an explicit `false`
          // disables it, otherwise fall back to the model's 'auto' default.
          const flash: boolean | 'auto' = this.config.ai?.flashAttention === false
            ? false
            : (wantFlash && this.model.flashAttentionSupported ? true : 'auto');
          this.context = await this.model.createContext({ contextSize: a.contextSize, flashAttention: flash });
          // Trust the resolved backend + actual offload count, not what we requested:
          // getLlama('auto') may pick CPU when no GPU is present (llama.gpu === false),
          // and a GPU backend that offloads 0 layers is effectively CPU compute.
          const backend = this.llama?.gpu; // 'cuda' | 'vulkan' | 'metal' | false
          const layers = typeof this.model.gpuLayers === 'number' ? this.model.gpuLayers : undefined;
          this.activeGpuLayers = layers;
          this.activeGpuType = (backend && backend !== false && (layers === undefined || layers > 0)) ? String(backend) : 'cpu';
          return; // loaded
        } catch (e) {
          lastErr = e;
          // Free any partially-loaded handles before the next attempt.
          try { await this.context?.dispose?.(); } catch { /* best effort */ }
          try { await this.model?.dispose?.(); } catch { /* best effort */ }
          this.context = null;
          this.model = null;
          this.llama = null;
        }
      }
      throw new Error(`Failed to load model (tried GPU + CPU): ${lastErr?.message || lastErr}`);
    })();
    this.loadPromise = p;
    p.catch(() => { if (this.loadPromise === p) this.loadPromise = null; });
    return p;
  }

  async status(): Promise<AiStatus> {
    const enabled = this.config.ai?.enabled === true;
    const modelPath = this.config.ai?.modelPath;
    let modelConfigured = false;
    try { modelConfigured = !!modelPath && fs.existsSync(modelPath); } catch { modelConfigured = false; }

    const nlc = await this.runtime();
    const runtimeAvailable = !!nlc;

    let ready = false;
    let error: string | undefined = runtimeAvailable ? undefined : this.lastError;
    // Only load the (multi-GB) model when the user has actually enabled AI — a
    // disabled-but-configured install must stay completely inert.
    if (enabled && runtimeAvailable && modelConfigured) {
      try { await this.ensureLoaded(); ready = true; error = undefined; }
      catch (e: any) { error = e?.message || String(e); }
    } else if (!runtimeAvailable) {
      error = error || 'AI runtime not installed';
    } else if (!modelConfigured) {
      error = modelPath ? `Model file not found: ${modelPath}` : 'No model selected';
    }

    return {
      enabled,
      runtimeAvailable,
      modelConfigured,
      ready,
      modelPath,
      contextSize: this.context?.contextSize ?? this.config.ai?.contextSize,
      gpuType: ready ? this.activeGpuType : undefined,
      gpuLayers: ready ? this.activeGpuLayers : undefined,
      error,
    };
  }

  async generate(req: AiGenerateRequest, onChunk?: (text: string) => void): Promise<AiGenerateResult> {
    // Serialise: chain onto the queue so only one generation runs at a time. Keep
    // the queue alive even if this run rejects (swallow on the tail, not the result).
    const run = this.queue.then(() => this.doGenerate(req, onChunk));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async doGenerate(req: AiGenerateRequest, onChunk?: (text: string) => void): Promise<AiGenerateResult> {
    await this.ensureLoaded();
    const { LlamaChatSession } = this.nlc;
    const started = Date.now();
    const sequence = this.context.getSequence();
    const session = new LlamaChatSession({
      contextSequence: sequence,
      ...(req.system ? { systemPrompt: req.system } : {}),
    });
    try {
      const opts: any = { maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS };
      if (typeof req.temperature === 'number') opts.temperature = req.temperature;
      // Stream free-text output as it's produced. Skipped for JSON generations —
      // streaming raw JSON tokens to the UI would be noise.
      if (onChunk && !req.json) opts.onTextChunk = onChunk;
      if (req.json) {
        if (!this.jsonGrammar) this.jsonGrammar = await this.llama.getGrammarFor('json');
        opts.grammar = this.jsonGrammar;
        // Grammar-constrained output should be allowed to finish the JSON.
        opts.maxTokens = req.maxTokens ?? this.context.contextSize;
      }
      const text: string = await session.prompt(req.prompt, opts);
      let json: unknown;
      if (req.json) { try { json = JSON.parse(text); } catch { json = undefined; } }
      return { text, json, ms: Date.now() - started };
    } finally {
      // Return the sequence to the context pool for the next queued generation.
      try { sequence.dispose?.(); } catch { /* best effort */ }
    }
  }

  /** Load the model now (if not already), forwarding llama.cpp's load progress
   *  (0..1) to `onProgress`. Idempotent — a second call once loaded resolves
   *  immediately (the caller then completes its bar). Rejects if the load fails. */
  async preload(onProgress?: (loadProgress: number) => void): Promise<void> {
    this.loadProgressCb = onProgress;
    try { await this.ensureLoaded(); }
    finally { this.loadProgressCb = undefined; }
  }

  async close(): Promise<void> {
    try { await this.context?.dispose?.(); } catch { /* best effort */ }
    try { await this.model?.dispose?.(); } catch { /* best effort */ }
    this.context = null;
    this.model = null;
    this.llama = null;
    this.jsonGrammar = null;
    this.loadPromise = null;
    this.activeGpuType = undefined;
    this.activeGpuLayers = undefined;
  }
}
