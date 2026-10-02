import * as fs from 'fs';
import type { Config } from '../../config';
import type { AiProvider } from '../aiProvider';
import type { AiStatus, AiGenerateRequest, AiGenerateResult } from '../types';
// The ESM-from-CJS escape hatch this file used to carry inline. It moved to ../runtime
// when the hardware probe needed the same import without loading a model — see that
// module's docblock before touching it; it is load-bearing for the packaged app.
import { loadAiRuntime } from '../runtime';
import { createThinkingGate, finalAnswer, looksLikeThinkingModel, stripThinking, type ThinkingGate } from '../thinking';

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
  private sequence: any = null;          // ONE context sequence, held for the provider's lifetime
  private jsonGrammar: any = null;
  private loadPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve(); // generation mutex
  private lastError: string | undefined;
  private activeGpuType: string | undefined;   // resolved backend after load ('cpu' when GPU off)
  private activeGpuLayers: number | undefined;  // layers offloaded to the GPU (0 ⇒ CPU)
  private loadProgressCb: ((p: number) => void) | undefined; // set during preload()

  constructor(private config: Config) {}

  /** Import node-llama-cpp once. Returns null (never throws) when unavailable —
   *  status() turns that into a reportable state rather than an error. */
  private async runtime(): Promise<any> {
    if (this.nlc) return this.nlc;
    try {
      this.nlc = await loadAiRuntime();
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

      // "AI always lands on GPU": the default path REQUIRES a real GPU backend and
      // never silently degrades to CPU compute. Only an explicit backend='cpu' (or
      // gpuLayers=0) opts out — a deliberate user choice in AI settings, not a
      // fallback. flashAttention is used only when the model supports it.
      const explicitCpu = forced === 'cpu' || userLayers === 0;
      const flashFor = (model: any): boolean | 'auto' =>
        this.config.ai?.flashAttention === false ? false
          : (wantFlash && model.flashAttentionSupported ? true : 'auto');
      const onLoadProgress = (p: number) => { try { this.loadProgressCb?.(p); } catch { /* ignore */ } };

      // --- Deliberate CPU opt-out ---------------------------------------------
      if (explicitCpu) {
        this.llama = await nlc.getLlama({ gpu: false });
        this.model = await this.llama.loadModel({ modelPath, onLoadProgress });
        this.context = await this.model.createContext({ contextSize: smallCtx, flashAttention: flashFor(this.model) });
        this.activeGpuLayers = 0;
        this.activeGpuType = 'cpu';
        return;
      }

      // --- GPU-forced path (default) ------------------------------------------
      // Resolve the runtime once and require an actual GPU backend UP FRONT, so a
      // GPU-less machine fails loudly instead of quietly loading a multi-GB model
      // onto the CPU. getLlama('auto') sets llama.gpu to the backend or false.
      const gpuOpt = forced === 'auto' ? {} : { gpu: forced };
      this.llama = await nlc.getLlama(gpuOpt);
      if (!this.llama.gpu) {
        this.llama = null;
        throw new Error('No GPU backend available (CUDA / Vulkan / Metal). AI is set to run on the GPU — install or enable GPU drivers, or choose the CPU backend in AI settings to run on CPU.');
      }

      // Offload as many layers as FIT the intended context (fitContext reserves KV-
      // cache VRAM so the context alloc can't OOM us onto the CPU), shrinking the
      // context before the offload. Every rung stays on the GPU — there is NO CPU rung.
      const fit = (ctx: number) => (typeof userLayers === 'number' && userLayers > 0)
        ? userLayers
        : { fitContext: { contextSize: ctx } };
      type Attempt = { contextSize: number; gpuLayers: any; label: string };
      const attempts: Attempt[] = [
        { contextSize: wanted, gpuLayers: fit(wanted), label: `gpu@${wanted}` },
      ];
      if (smallCtx < wanted) attempts.push({ contextSize: smallCtx, gpuLayers: fit(smallCtx), label: `gpu@${smallCtx}` });
      attempts.push({ contextSize: smallCtx, gpuLayers: { min: 1, fitContext: { contextSize: smallCtx } }, label: `gpu@${smallCtx}/fit` });

      let lastErr: any;
      for (const a of attempts) {
        try {
          this.model = await this.llama.loadModel({ modelPath, gpuLayers: a.gpuLayers, onLoadProgress });
          this.context = await this.model.createContext({ contextSize: a.contextSize, flashAttention: flashFor(this.model) });
          const layers = typeof this.model.gpuLayers === 'number' ? this.model.gpuLayers : undefined;
          // A GPU backend that offloaded 0 layers is CPU compute — reject it so we
          // never report a CPU load as "on GPU"; drop to the next (smaller) rung.
          if (layers === 0) throw new Error('model loaded with 0 GPU layers');
          this.activeGpuLayers = layers;
          this.activeGpuType = String(this.llama.gpu);
          return; // loaded on GPU
        } catch (e) {
          lastErr = e;
          // Free any partially-loaded handles before the next rung (keep the GPU runtime).
          try { await this.context?.dispose?.(); } catch { /* best effort */ }
          try { await this.model?.dispose?.(); } catch { /* best effort */ }
          this.context = null;
          this.model = null;
        }
      }
      this.llama = null; // re-probe the runtime on the next retry
      throw new Error(`Failed to load the model on the GPU: ${lastErr?.message || lastErr}. Try a smaller model or a smaller context size in AI settings.`);
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
    // ONE sequence, acquired once and held for the provider's lifetime. The
    // obvious getSequence()/dispose() per generation is WRONG: dispose()
    // reclaims the slot ASYNCHRONOUSLY (a `void withLock(...)` inside
    // LlamaContext), and the context has exactly one sequence — so the very
    // next generation races the reclaim and throws "No sequences left". A
    // reply-classifier sweep is precisely that back-to-back shape; the LFM2.5
    // load test hit it deterministically (AUDIT-freemium F21). Holding the
    // slot and wiping its KV state per generation also guarantees prompts
    // never leak into each other — the old pattern only got that by accident.
    // Serialisation is already guaranteed by the generation queue above.
    if (!this.sequence) this.sequence = this.context.getSequence();
    else await this.sequence.clearHistory();
    const session = new LlamaChatSession({
      contextSequence: this.sequence,
      ...(req.system ? { systemPrompt: req.system } : {}),
    });
    let gate: ThinkingGate | undefined;
    // Free text from a reasoning build. Tracked so a generation that never got past
    // its reasoning is reported as such rather than returned as the answer.
    const thinkingModel = !req.json && looksLikeThinkingModel(this.config.ai?.modelPath);
    let segmentsHandled = false;
    try {
      const opts: any = { maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS };
      if (typeof req.temperature === 'number') opts.temperature = req.temperature;
      // A reasoning model's `<think>` block is filtered out for us ONLY when the
      // chat wrapper sees the opening tag and turns it into a segment. Qwen3
      // Thinking's own template supplies that tag, so the model never emits it, no
      // segment opens, and the reasoning arrives as ordinary text. `onResponseChunk`
      // is only an observer: a real thought segment means node-llama-cpp is already
      // filtering, so the gate stands down and untagged text is a real answer.
      if (thinkingModel) {
        opts.onResponseChunk = (c: any) => {
          if (c?.segmentType === 'thought') { segmentsHandled = true; gate?.segmentsHandled(); }
        };
      }
      // Stream free-text output as it's produced. Skipped for JSON generations —
      // streaming raw JSON tokens to the UI would be noise. A reasoning model's
      // stream is held back until its block closes. See ../thinking.ts.
      if (onChunk && !req.json) {
        if (thinkingModel) {
          const g = createThinkingGate(onChunk);
          gate = g;
          opts.onTextChunk = (t: string) => g.chunk(t);
        } else {
          opts.onTextChunk = onChunk;
        }
      }
      if (req.json) {
        if (!this.jsonGrammar) this.jsonGrammar = await this.llama.getGrammarFor('json');
        opts.grammar = this.jsonGrammar;
        // Grammar-constrained output should be allowed to finish the JSON.
        opts.maxTokens = req.maxTokens ?? this.context.contextSize;
      }
      const raw: string = await session.prompt(req.prompt, opts);
      // An Instruct model's answer comes through byte-identical; a grammar-constrained
      // (json) generation can't emit a think tag at all.
      const text = req.json ? stripThinking(raw) : finalAnswer(raw, { thinkingModel, segmentsHandled });
      if (text === null) {
        throw new Error('The model ran out of room while thinking and gave no answer. Try again, or switch to a non-thinking model.');
      }
      let json: unknown;
      if (req.json) { try { json = JSON.parse(text); } catch { json = undefined; } }
      return { text, json, ms: Date.now() - started };
    } finally {
      // Anything the gate is still holding was never closed by a `</think>` — drop
      // it rather than flushing reasoning into the composer. Callers set the final
      // text from the resolved promise, which finalAnswer settled above.
      gate?.flush();
      // Dispose the session only — NOT the sequence (dispose() defaults to
      // leaving it alone). The held sequence's state is wiped by clearHistory()
      // at the top of the next generation.
      try { session.dispose(); } catch { /* best effort */ }
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
    try { this.sequence?.dispose?.(); } catch { /* best effort */ }
    this.sequence = null;
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
