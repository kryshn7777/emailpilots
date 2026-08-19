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

export class AssetQueue {
  constructor(deps: { fetchFn: typeof fetch; baseUrl: string }) {
    void deps;
  }

  add(url: string, priority: Priority, expectedBytes: number): void {
    void url;
    void priority;
    void expectedBytes;
    throw new Error('not implemented');
  }

  /** Subscribe to progress fractions; returns a disposer (conventions carry-over). */
  onProgress(fn: (fraction: number) => void): () => void {
    void fn;
    throw new Error('not implemented');
  }

  /** Fetch every not-yet-loaded item of the given priority; resolves url → bytes. */
  async load(priority: Priority): Promise<Map<string, ArrayBuffer>> {
    void priority;
    throw new Error('not implemented');
  }
}
