import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AssetQueue } from './AssetQueue.ts';

const settle = (ms = 5): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

const deferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const assertMonotonic = (fractions: readonly number[]): void => {
  for (let i = 1; i < fractions.length; i++) {
    assert.ok(fractions[i] >= fractions[i - 1], `regressed: ${fractions[i - 1]} -> ${fractions[i]}`);
  }
};

test('byte-weighted monotonic progress over the critical batch, ending exactly at 1', async () => {
  const sizes: Record<string, number> = { 'a.bin': 100, 'b.bin': 300, 'c.bin': 600 };
  const gates: Record<string, Deferred> = {
    'a.bin': deferred(),
    'b.bin': deferred(),
    'c.bin': deferred(),
  };
  const fetchFn = (async (input: RequestInfo | URL) => {
    const name = String(input).split('/').pop() ?? '';
    await gates[name].promise;
    return new Response(new Uint8Array(sizes[name]));
  }) as typeof fetch;

  const q = new AssetQueue({ fetchFn, baseUrl: '/base/' });
  for (const [url, bytes] of Object.entries(sizes)) q.add(url, 'critical', bytes);
  const fractions: number[] = [];
  q.onProgress((f) => fractions.push(f));
  const loading = q.load('critical');

  gates['a.bin'].resolve();
  await settle();
  assert.equal(fractions.at(-1), 0.1, 'a.bin alone = 100/1000 by weight, not 1/3 by count');
  gates['b.bin'].resolve();
  await settle();
  assert.equal(fractions.at(-1), 0.4);
  gates['c.bin'].resolve();
  const out = await loading;
  assert.equal(fractions.at(-1), 1, 'ends exactly at 1 when the critical batch completes');
  assertMonotonic(fractions);
  assert.equal(out.size, 3);
  assert.equal(out.get('a.bin')?.byteLength, 100);
});

test('monotonic under a randomized chunk interleave across streaming items (property)', async () => {
  const controllers = new Map<string, ReadableStreamDefaultController<Uint8Array>>();
  const fetchFn = (async (input: RequestInfo | URL) => {
    const name = String(input).split('/').pop() ?? '';
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controllers.set(name, c);
      },
    });
    return new Response(stream);
  }) as typeof fetch;

  const sizes: Record<string, number> = { 'x.bin': 400, 'y.bin': 250, 'z.bin': 350 };
  const q = new AssetQueue({ fetchFn, baseUrl: '/' });
  for (const [url, bytes] of Object.entries(sizes)) q.add(url, 'critical', bytes);
  const fractions: number[] = [];
  q.onProgress((f) => fractions.push(f));
  const loading = q.load('critical');
  await settle(); // all fetches issued, controllers registered

  // Full chunk schedule (50-byte chunks per item), delivered in a random interleave —
  // the monotonicity property must hold for ANY order.
  const schedule: Array<{ name: string; bytes: number }> = [];
  for (const [name, size] of Object.entries(sizes)) {
    for (let sent = 0; sent < size; sent += 50) {
      schedule.push({ name, bytes: Math.min(50, size - sent) });
    }
  }
  schedule.sort(() => Math.random() - 0.5);
  for (const { name, bytes } of schedule) {
    controllers.get(name)?.enqueue(new Uint8Array(bytes));
    await settle(1);
  }
  for (const c of controllers.values()) c.close();
  await loading;

  assert.equal(fractions.at(-1), 1);
  assertMonotonic(fractions);
  assert.ok(fractions.length >= 5, 'streaming emitted intermediate fractions, not one jump');
});

test('a failing fetch rejects load() with the url in the error; progress never regresses', async () => {
  const fetchFn = (async (input: RequestInfo | URL) => {
    if (String(input).includes('bad.bin')) throw new Error('network down');
    return new Response(new Uint8Array(100));
  }) as typeof fetch;

  const q = new AssetQueue({ fetchFn, baseUrl: '/' });
  q.add('ok.bin', 'critical', 100);
  q.add('bad.bin', 'critical', 100);
  const fractions: number[] = [];
  q.onProgress((f) => fractions.push(f));

  await assert.rejects(q.load('critical'), (e: unknown) => {
    assert.ok(e instanceof Error && e.message.includes('bad.bin'), 'error names the url');
    return true;
  });
  await settle();
  assertMonotonic(fractions);
  assert.ok((fractions.at(-1) ?? 0) < 1, 'a failed batch never reports complete');
});

test('onProgress returns a disposer; no further callbacks after disposal', async () => {
  const fetchFn = (async () => new Response(new Uint8Array(10))) as typeof fetch;
  const q = new AssetQueue({ fetchFn, baseUrl: '/' });
  q.add('one.bin', 'critical', 10);

  let disposedCalls = 0;
  let liveCalls = 0;
  const off = q.onProgress(() => {
    disposedCalls++;
  });
  q.onProgress(() => {
    liveCalls++;
  });
  off();
  await q.load('critical');

  assert.equal(disposedCalls, 0, 'disposed listener never fires');
  assert.ok(liveCalls > 0, 'live listener still fires');
});

test('load(critical) resolves without touching soon/lazy items, urls joined onto baseUrl', async () => {
  const calls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(new Uint8Array(10));
  }) as typeof fetch;

  const q = new AssetQueue({ fetchFn, baseUrl: '/base/' });
  q.add('c1.bin', 'critical', 10);
  q.add('c2.bin', 'critical', 10);
  q.add('s1.bin', 'soon', 10);
  q.add('l1.bin', 'lazy', 10);
  await q.load('critical');

  assert.equal(calls.length, 2, 'only the critical batch was fetched');
  assert.deepEqual([...calls].sort(), ['/base/c1.bin', '/base/c2.bin'], 'base-safe joins');
});
