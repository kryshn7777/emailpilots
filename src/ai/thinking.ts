/**
 * Reasoning ("thinking") model support — pure text helpers, no imports.
 *
 * Reasoning models (Qwen3-Thinking, DeepSeek-R1 distills, QwQ) emit a `<think>`
 * block before their answer. node-llama-cpp CAN filter that for us: when its chat
 * wrapper recognises the block it becomes a *segment*, and segments are excluded
 * from both `session.prompt()`'s return value and `onTextChunk`
 * (LlamaChatSession.js — `responseText` filters to `typeof item === "string"`).
 *
 * It does not always get the chance. Qwen3-4B-Thinking-2507's own chat template
 * ends with `<|im_start|>assistant\n<think>\n` — the OPENING tag is supplied by
 * the template, so the model is trained to emit only the closing one. Wrappers
 * that don't pre-fill it (QwenChatWrapper does not) never see a segment open, and
 * the reasoning arrives as ordinary response text: into `responseText`, into the
 * streaming callback, and into JSON.parse.
 *
 * Hence these three helpers. They are pure and live in their own file for one
 * reason: providers/localLlama.ts pulls the native runtime and cannot be imported
 * from a Vitest spec, so this is the only place the logic can leave a check behind.
 *
 * The JSON path needs none of this. A grammar is applied to every sampled token
 * (LlamaChat.js passes `grammarEvaluationState` to each evaluate, and the whole
 * segment/prefix-trigger machinery is skipped when a grammar is set), and `<` is
 * not a legal JSON start — so a grammar-constrained generation cannot open a
 * think block in the first place.
 */

/** Closing tags we recognise. Deliberately closing-only — see the docblock: the
 *  opening tag is often supplied by the template and never generated. */
const CLOSE_TAG = /<\/think(?:ing)?>/i;

/**
 * Drop a leaked reasoning block: everything up to and including the FIRST closing
 * tag. Text without one is returned unchanged, so this is safe to apply to every
 * generation — an Instruct model's output is never touched.
 *
 * First tag, not last: in the normal shape (reasoning, `</think>`, answer) the
 * first tag is the boundary, and cutting at the last one would eat the answer if
 * the model ever quoted the tag inside it.
 */
export function stripThinking(text: string): string {
  const m = CLOSE_TAG.exec(text);
  if (!m) return text;
  return text.slice(m.index + m[0].length).replace(/^\s+/, '');
}

/**
 * The answer a free-text generation produced, or null when it produced none.
 *
 * stripThinking alone is not enough for a reasoning model: when it runs out of tokens
 * before `</think>`, the raw text is pure reasoning with no tag to cut at, and it used
 * to come back as the suggestion. Untagged text from a reasoning model is only an
 * answer when node-llama-cpp itself recognised and removed the thought segment.
 * Not for JSON generations — a grammar keeps those from reasoning at all.
 */
export function finalAnswer(raw: string, opts: { thinkingModel: boolean; segmentsHandled: boolean }): string | null {
  if (CLOSE_TAG.test(raw)) return stripThinking(raw);
  return opts.thinkingModel && !opts.segmentsHandled ? null : raw;
}

/**
 * Does this model path look like a reasoning build? Used to gate the live stream and
 * to tell an unfinished reasoning block from an answer (finalAnswer). A miss costs
 * the old behaviour: streaming is ungated and truncated reasoning can leak through.
 */
export function looksLikeThinkingModel(modelPath: string | undefined): boolean {
  if (!modelPath) return false;
  return /thinking|deepseek-?r1|[-_]r1[-_.]|qwq/i.test(modelPath);
}

export interface ThinkingGate {
  /** Feed one streamed chunk. */
  chunk(text: string): void;
  /** node-llama-cpp reported a real thought segment — it is filtering for us, so
   *  stop holding text back and stream normally from here on. */
  segmentsHandled(): void;
  /** Generation ended. Anything still held back was never closed by a `</think>`,
   *  i.e. it is reasoning that ran out of tokens — drop it. Every caller sets the
   *  final text from the resolved promise anyway, so nothing is lost. */
  flush(): void;
}

/**
 * Withhold streamed output until the reasoning block closes, so the user watches a
 * "Thinking…" status line instead of the model's inner monologue.
 *
 * ponytail: no size cap on the buffer. A reasoning model that never emits a
 * closing tag streams nothing and the answer lands when the promise resolves —
 * strictly better than dumping raw reasoning into the composer.
 */
export function createThinkingGate(emit: (text: string) => void): ThinkingGate {
  let holding = true;
  let buf = '';
  return {
    chunk(text: string) {
      if (!holding) { emit(text); return; }
      buf += text;
      const m = CLOSE_TAG.exec(buf);
      if (!m) return;
      holding = false;
      const rest = buf.slice(m.index + m[0].length).replace(/^\s+/, '');
      buf = '';
      if (rest) emit(rest);
    },
    segmentsHandled() {
      if (!holding) return;
      holding = false;
      if (buf) { emit(buf); buf = ''; }
    },
    flush() {
      holding = false;
      buf = '';
    },
  };
}
