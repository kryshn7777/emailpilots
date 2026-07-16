import { app, net } from 'electron';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import type { CatalogModel } from '../../src/ai/modelCatalog';

/**
 * Download a catalog model (audit M6).
 *
 * There was no downloader at all: `ai-select-model` opened a file picker and expected
 * the user to already own a .gguf, which is why almost nobody ever turned AI on.
 *
 * Design notes, in rough order of how much they'd hurt to get wrong:
 *
 *  - **Verify before use, always.** The file is streamed to `<name>.part`, hashed as it
 *    arrives, and only renamed into place once the sha256 matches the catalog. A
 *    mismatch deletes it. We never hand an unverified multi-GB blob to the model loader.
 *  - **`net.request`, not `https`.** Electron's net stack honours the system proxy and
 *    certificate store; bare `https` does not, and corporate proxies are exactly where a
 *    2.5 GB download goes wrong.
 *  - **Models live in `userData/models`, not `getBasePath()`.** getBasePath() is the repo
 *    cwd in dev, and dropping a 2.5 GB file there is nobody's idea of a good time.
 *    Models are re-downloadable cache, not user state, so they don't belong beside
 *    recipients.json regardless.
 *  - **Resume is real.** A dropped 2.5 GB download must not restart from zero, so we
 *    send `Range` and append. The hash can't be resumed, so the existing `.part` is
 *    re-read through the digest first — one extra pass over bytes already on disk, which
 *    beats re-downloading them.
 *  - **One at a time.** Two concurrent downloads would race on the same `.part`.
 */

/** Phases the UI distinguishes. `verifying` matters: hashing 2.5 GB is not instant,
 *  and a progress bar that sits at 100% doing nothing looks like a hang. */
export type DownloadPhase = 'checking' | 'resuming' | 'downloading' | 'verifying';

export interface DownloadProgress {
  modelId: string;
  phase: DownloadPhase;
  receivedBytes: number;
  totalBytes: number;
  /** 0..1 within the current phase. */
  fraction: number;
}

export interface DownloadResult {
  ok: boolean;
  path?: string;
  canceled?: boolean;
  error?: string;
}

/** Where models are cached. Created on demand. */
export function modelsDir(): string {
  return path.join(app.getPath('userData'), 'models');
}

function targetPath(model: CatalogModel): string {
  // The catalog's filename, not anything from the server: a redirect or a
  // Content-Disposition header must never choose our on-disk path.
  return path.join(modelsDir(), path.basename(model.file));
}

/** Hugging Face's stable download URL. `resolve` redirects to the CDN; Electron's net
 *  follows that for us. */
function downloadUrl(model: CatalogModel): string {
  return `https://huggingface.co/${model.repo}/resolve/main/${encodeURIComponent(model.file)}?download=true`;
}

/**
 * The single in-flight download. Reserved SYNCHRONOUSLY at the top of downloadModel,
 * before its first await — the guard and the assignment must not straddle one, or two
 * concurrent callers both pass the check and then append to the same `.part`.
 * `abort` is filled in later, once there's a request to abort.
 */
let active: { modelId: string; abort: (() => void) | null; cancelRequested: boolean } | null = null;

/** True while a download is running — the UI disables the button rather than racing. */
export function isDownloading(): boolean {
  return active !== null;
}

/**
 * Cancel the in-flight download. The `.part` survives so a later retry resumes.
 *
 * A cancel can arrive before there is anything to abort: the disk-space check and the
 * hash re-seed of an existing `.part` both run before the request exists, and re-seeding
 * gigabytes is not instant. Rather than reporting "couldn't cancel" and then starting
 * the download anyway — which is what the user just asked us not to do — the intent is
 * recorded and honoured the moment the request is created.
 *
 * False means only that no download is running at all.
 */
export function cancelDownload(): boolean {
  if (!active) return false;
  active.cancelRequested = true;
  active.abort?.();
  return true;
}

/** Already downloaded and verified? Cheap existence + size check; the full hash is
 *  only meaningful at download time, and re-hashing gigabytes on every UI paint is not
 *  something we're going to do. */
export function installedPath(model: CatalogModel): string | null {
  const p = targetPath(model);
  try {
    const st = fs.statSync(p);
    if (st.isFile() && st.size === model.sizeBytes) return p;
  } catch { /* not there */ }
  return null;
}

/** Free bytes on the models volume, or null when the platform won't say. */
async function freeSpace(dir: string): Promise<number | null> {
  try {
    const st = await fs.promises.statfs(dir);
    return Number(st.bavail) * Number(st.bsize);
  } catch {
    return null;
  }
}

/** Stream an existing `.part` through the digest so a resumed download still ends with
 *  the hash of the WHOLE file. */
function seedHash(partPath: string, hash: ReturnType<typeof createHash>, onBytes: (n: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const rs = fs.createReadStream(partPath);
    rs.on('data', (c) => { hash.update(c); onBytes(c.length); });
    rs.on('end', () => resolve());
    rs.on('error', reject);
  });
}

/**
 * Download + verify `model`. Resolves with the final path on success.
 *
 * Never throws — every failure is a `{ok:false, error}` the UI can show, because the
 * caller is a button, not a batch job.
 */
export async function downloadModel(
  model: CatalogModel,
  onProgress: (p: DownloadProgress) => void,
  /** Internal. Bounds the restart-from-scratch retry: every restart deletes the `.part`
   *  so the next attempt sends no Range and cannot restart again — but a server that
   *  returns 416 unconditionally would otherwise spin here forever. */
  attempt = 0,
): Promise<DownloadResult> {
  // Reserve the slot HERE, before the first await. The guard and the assignment cannot
  // straddle one: mkdir/statfs/seedHash all yield, so two clicks would otherwise both
  // get past this and append to the same .part. A recursive restart passes attempt>0
  // and inherits the slot its caller already holds.
  if (attempt === 0) {
    if (active) return { ok: false, error: 'A model download is already running.' };
    active = { modelId: model.id, abort: null, cancelRequested: false };
  }
  if (attempt > 1) {
    active = null;
    return { ok: false, error: 'The download server kept rejecting the request. Please try again later.' };
  }

  const dir = modelsDir();
  const finalPath = targetPath(model);
  const partPath = `${finalPath}.part`;
  const total = model.sizeBytes;

  const emit = (phase: DownloadPhase, received: number) => {
    onProgress({
      modelId: model.id,
      phase,
      receivedBytes: received,
      totalBytes: total,
      fraction: total > 0 ? Math.min(1, received / total) : 0,
    });
  };

  try {
    emit('checking', 0);
    await fs.promises.mkdir(dir, { recursive: true });

    // Already have it, verified previously and unchanged in size.
    const already = installedPath(model);
    if (already) return { ok: true, path: already };

    // How much of a previous attempt can we keep?
    let start = 0;
    try {
      const st = await fs.promises.stat(partPath);
      // A .part at or past the expected size is not a resumable prefix — it's junk
      // from a changed upstream file or a bug. Start over rather than reason about it.
      start = st.size < total ? st.size : 0;
      if (start === 0) await fs.promises.unlink(partPath).catch(() => {});
    } catch { /* no .part — fresh download */ }

    // Space for what's LEFT, plus headroom for the rename (same volume, so the rename
    // itself is free, but a disk that's 100% full fails in uglier ways).
    const free = await freeSpace(dir);
    const need = total - start;
    if (free !== null && free < need + 128 * 1024 * 1024) {
      return {
        ok: false,
        error: `Not enough disk space: this needs about ${Math.ceil(need / (1024 ** 3))} GB free, and there is ${(free / (1024 ** 3)).toFixed(1)} GB.`,
      };
    }

    const hash = createHash('sha256');
    let received = 0;

    if (start > 0) {
      emit('resuming', 0);
      let lastSeedEmit = 0;
      try {
        await seedHash(partPath, hash, (n) => {
          received += n;
          // Local disk, but gigabytes of it — report progress so a long seed doesn't
          // look like a hang.
          const now = Date.now();
          if (now - lastSeedEmit > 200) { lastSeedEmit = now; emit('resuming', received); }
        });
      } catch {
        // Unreadable .part: drop it and start clean rather than resume onto garbage.
        await fs.promises.unlink(partPath).catch(() => {});
        return await downloadModel(model, onProgress, attempt + 1); // `await` — see RESTART below
      }
      if (received !== start) {
        // The file changed under us mid-seed. Restart clean.
        await fs.promises.unlink(partPath).catch(() => {});
        return await downloadModel(model, onProgress, attempt + 1); // `await` — see RESTART below
      }
    }

    const result = await new Promise<DownloadResult>((resolve) => {
      const request = net.request({ method: 'GET', url: downloadUrl(model) });
      if (start > 0) request.setHeader('Range', `bytes=${start}-`);

      let out: fs.WriteStream | null = null;
      let settled = false;
      let canceled = false;
      // pipeline() owns stream teardown on both success and failure, so this must not
      // also end `out` — ending an already-finished stream raises
      // ERR_STREAM_ALREADY_FINISHED, turning a clean cancel into a spurious error.
      const finish = (r: DownloadResult) => {
        if (settled) return;
        settled = true;
        resolve(r);
      };

      // Fill in the abort now that there's a request to abort. The slot itself was
      // reserved at the top of downloadModel, not here.
      if (active) {
        active.abort = () => { canceled = true; try { request.abort(); } catch { /* already gone */ } };
        // Honour a cancel that arrived while we were checking disk space or re-hashing
        // the existing .part — otherwise we'd start downloading the very thing the user
        // just cancelled. Resolve explicitly rather than leaning on the 'abort' event:
        // aborting a request that was never .end()ed may not emit one, and a promise
        // that never settles hangs the caller forever.
        if (active.cancelRequested) {
          canceled = true;
          try { request.abort(); } catch { /* never started */ }
          finish({ ok: false, canceled: true });
          return;
        }
      }

      request.on('response', (response) => {
        const status = response.statusCode;

        // 206 = our Range was honoured. 200 = server ignored it and is sending the whole
        // file, so the seeded hash and the .part are both wrong — reset and take it from
        // the top of the stream.
        if (start > 0 && status === 200) {
          finish({ ok: false, error: 'RESTART' });
          return;
        }
        if (status === 416) {
          // Range not satisfiable: our .part is bogus. Delete and retry fresh.
          finish({ ok: false, error: 'RESTART' });
          return;
        }
        if (status !== 200 && status !== 206) {
          finish({ ok: false, error: `Download failed (HTTP ${status}). Check your connection and try again.` });
          return;
        }

        out = fs.createWriteStream(partPath, { flags: start > 0 ? 'a' : 'w' });

        // Hash in a Transform and let pipeline() carry the bytes, rather than hand-rolling
        // pause/resume around out.write(). Backpressure matters here: the network can
        // outrun the disk over gigabytes, and an unbounded buffer is how you OOM on a
        // file this size. pipeline also tears every stream down on failure.
        let lastEmit = 0;
        const hasher = new Transform({
          transform(chunk: Buffer, _enc, cb) {
            hash.update(chunk);
            received += chunk.length;
            // Throttle: a 2.5 GB download fires this tens of thousands of times, and each
            // emit crosses the IPC boundary and repaints the renderer.
            const now = Date.now();
            if (now - lastEmit > 200) { lastEmit = now; emit('downloading', received); }
            cb(null, chunk);
          },
        });

        // Electron's IncomingMessage implements the Readable interface at runtime but is
        // typed as a bare EventEmitter, so the shape has to be asserted.
        pipeline(response as unknown as NodeJS.ReadableStream, hasher, out)
          .then(async () => {
            if (canceled) { finish({ ok: false, canceled: true }); return; }

            emit('verifying', received);
            const digest = hash.digest('hex');
            if (digest !== model.sha256) {
              // Wrong bytes: a corrupted transfer, or the upstream file was replaced.
              // This is exactly what the checksum is for — bin it. Keeping it would mean
              // feeding unverified gigabytes to the model loader.
              await fs.promises.unlink(partPath).catch(() => {});
              finish({
                ok: false,
                error: 'The downloaded file failed its integrity check and was deleted. Please try again.',
              });
              return;
            }
            if (received !== total) {
              await fs.promises.unlink(partPath).catch(() => {});
              finish({ ok: false, error: `The download was incomplete (${received} of ${total} bytes).` });
              return;
            }
            try {
              await fs.promises.rename(partPath, finalPath);
              finish({ ok: true, path: finalPath });
            } catch (e: any) {
              finish({ ok: false, error: `Couldn't finish saving the model: ${e.message}` });
            }
          })
          .catch((e: any) => {
            // The .part is deliberately left on disk: a dropped connection is the case
            // resume exists for.
            finish(canceled
              ? { ok: false, canceled: true }
              : { ok: false, error: e?.message || 'The download was interrupted.' });
          });
      });

      request.on('error', (e: any) => {
        finish(canceled ? { ok: false, canceled: true } : { ok: false, error: e?.message || 'Could not reach the download server.' });
      });

      request.on('abort', () => finish({ ok: false, canceled: true }));

      request.end();
    });

    if (result.error === 'RESTART') {
      await fs.promises.unlink(partPath).catch(() => {});
      // Keep holding the slot across the restart — clearing it here would open a window
      // for a second caller to start a competing download onto the same .part.
      //
      // `return await`, not a bare `return` — here and at the two seed-restart sites
      // above. This sits inside a try whose finally releases the slot, and in an async
      // function a bare `return somePromise` runs that finally the instant the call is
      // MADE, not when it settles. A bare return therefore freed the reservation while
      // gigabytes were still streaming: cancelDownload() went dead for the rest of the
      // download, and a second click sailed past the guard onto the same .part — the
      // exact race the reservation exists to prevent. The await is what makes it mean
      // anything.
      return await downloadModel(model, onProgress, attempt + 1);
    }
    return result;
  } catch (e: any) {
    return { ok: false, error: e?.message || 'The download failed.' };
  } finally {
    active = null;
  }
}
