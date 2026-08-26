/**
 * AssetQueue — critical/soon/lazy priority loading with honest byte-weighted
 * progress events (D2-20). DI per D2-02: fetch is injected so node:test drives
 * it with fake byte streams — no module mocks. Leaf-enough for node --test:
 * no three/gsap imports, just the injected fetch and ArrayBuffers.
 *
 * Progress contract: monotonic non-decreasing 0→1 over the CRITICAL batch,
 * weighted by expectedBytes (honest — never an item-count fake). Zero-weight
 * items are excluded from the percent (this wave's benchmark warm-cache batch);
 * a batch of only zero-weight items snaps 0→1 on completion.
 */

export type Priority = 'critical' | 'soon' | 'lazy';

interface QueueItem {
  url: string;
  priority: Priority;
  expectedBytes: number;
  /** Clamped to expectedBytes while streaming; set to expectedBytes on completion. */
  loadedBytes: number;
  done: boolean;
  /**
   * The in-flight fetch, so a second load() of this priority JOINS it rather than
   * starting a second download. `done` alone cannot carry this: it only flips when a
   * fetch resolves, which leaves the whole download window unguarded.
   */
  inflight?: Promise<ArrayBuffer>;
}

export class AssetQueue {
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly items: QueueItem[] = [];
  private readonly listeners = new Set<(fraction: number) => void>();
  private lastEmitted = 0;

  constructor(deps: { fetchFn: typeof fetch; baseUrl: string }) {
    this.fetchFn = deps.fetchFn;
    // Base-safe joins (D2-06): every url is relative and joins here — never absolute.
    this.baseUrl = deps.baseUrl.endsWith('/') ? deps.baseUrl : `${deps.baseUrl}/`;
  }

  add(url: string, priority: Priority, expectedBytes: number): void {
    // One item per url. Two chapters may legitimately declare the same prop, and two
    // items for one url is two fetches whatever the timing does. First declaration wins
    // and keeps its priority: it is the earlier one, so it is the one the loader percent
    // was already weighted against, and re-weighting mid-load would move the visitor's bar.
    if (this.items.some((i) => i.url === url)) return;
    this.items.push({ url, priority, expectedBytes, loadedBytes: 0, done: false });
  }

  /** Subscribe to progress fractions; returns a disposer (conventions carry-over). */
  onProgress(fn: (fraction: number) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Fetch every not-yet-loaded item of the given priority; resolves url → bytes. */
  async load(priority: Priority): Promise<Map<string, ArrayBuffer>> {
    const batch = this.items.filter((i) => i.priority === priority && !i.done);
    const out = new Map<string, ArrayBuffer>();
    await Promise.all(
      batch.map(async (item) => {
        // Join an in-flight fetch instead of starting a second one. The island calls
        // load('soon') at EVERY chapter boundary — including boundaries whose manifest is
        // empty — so re-entry while a prefetch is still downloading is the normal case.
        // Measured before this guard: clipboard.glb fetched twice in a full-journey scrub
        // (03-07-T4 §C, "each asset fetched once").
        item.inflight ??= this.fetchOne(item);
        out.set(item.url, await item.inflight);
      })
    );
    return out;
  }

  /** One download, however many callers are waiting on it. */
  private async fetchOne(item: QueueItem): Promise<ArrayBuffer> {
    let buffer: ArrayBuffer;
    try {
      const res = await this.fetchFn(this.baseUrl + item.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buffer = await this.read(res, item);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      // A rejection must not be cached as this item's answer — a later load() retries.
      item.inflight = undefined;
      throw new Error(`AssetQueue: failed to load ${item.url}: ${reason}`);
    }
    item.done = true;
    item.loadedBytes = item.expectedBytes; // full weight on completion → exact 1 at batch end
    this.emit();
    return buffer;
  }

  /** Stream the body when available so progress is real bytes, not per-file steps. */
  private async read(res: Response, item: QueueItem): Promise<ArrayBuffer> {
    const body = res.body;
    if (body === null || body === undefined) {
      const buf = await res.arrayBuffer();
      item.loadedBytes = Math.min(item.expectedBytes, buf.byteLength);
      this.emit();
      return buf;
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done || value === undefined) break;
      chunks.push(value);
      received += value.byteLength;
      // Clamped per item: a lying expectedBytes cannot break monotonicity.
      item.loadedBytes = Math.min(item.expectedBytes, received);
      this.emit();
    }
    const buf = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      buf.set(c, offset);
      offset += c.byteLength;
    }
    return buf.buffer;
  }

  private emit(): void {
    const critical = this.items.filter((i) => i.priority === 'critical');
    if (critical.length === 0) return;
    const total = critical.reduce((sum, i) => sum + i.expectedBytes, 0);
    let fraction: number;
    if (critical.every((i) => i.done)) {
      fraction = 1; // exact end — completion is the truth, whatever the weights said
    } else if (total === 0) {
      fraction = 0; // all-zero-weight batch still pending
    } else {
      fraction = critical.reduce((sum, i) => sum + i.loadedBytes, 0) / total;
    }
    // Monotonic guard: never regress, never exceed 1, emit only on change.
    fraction = Math.min(1, Math.max(this.lastEmitted, fraction));
    if (fraction === this.lastEmitted) return;
    this.lastEmitted = fraction;
    for (const fn of this.listeners) fn(fraction);
  }
}
