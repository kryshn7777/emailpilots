/**
 * FB-5's histogram, measured — the half of the LOOK gate that `node --test` cannot hold.
 *
 * ## Why this is a script and not a test
 *
 * REVIEWS.md §Ruling 10 FB-5 asks for three numbers off a rendered frame: **≥ 2% of pixels
 * under luma 0.06**, **≥ 0.5% over 0.94**, and a **mid-tone in 0.35–0.55**. A luma histogram
 * needs a GPU, a compositor and a scrolled page; `node --test` has none of them, and a version
 * of this check written in the suite would be a pixel gate that cannot see pixels. This phase
 * has shipped enough gates that could not fail. So FB-5's histogram is a **capture gate**: it
 * is enforced by running this, and by the numbers landing in the chapter plan's LOOK block.
 *
 * What the suite *does* hold is in `qa/lookGate.test.ts` (LOOK 3 / 3b / 3c — the exposure is
 * authored, written once, and read on both cuts) and `systems/grade.test.ts` (the pass
 * restores the two transfers three skips for a render target).
 *
 * ## Usage
 *
 *     npm run build && npx astro preview --port 4321
 *     node tools/fb5-capture.mjs                     # Ch1 at 0.10, 0.50, 0.98
 *     node tools/fb5-capture.mjs --ch 3 --p 0.02,0.45,0.98 --out ./frames
 *
 * Chrome is driven over CDP with Node's built-in `WebSocket` and `fetch`. **No dependency is
 * added**, and nothing here ships — `tools/` is outside the Astro build.
 *
 * ## The three ways this harness has produced confident wrong evidence, and the guards
 *
 * 1. **Scrolling by the wrong convention.** `progressMap.ts` is document-space with no
 *    viewport term (Ruling 11 §Q1): progress 0 is the box top meeting the viewport **top**, so
 *    `scrollY = top + p·(bottom − top)`. ScrollTrigger's `top bottom` default silently
 *    captures progress 0 while reporting whatever was asked for. Guard: the achieved progress
 *    is **recomputed from `window.scrollY` after the scroll settles and printed**, and a beat
 *    that misses by more than 0.005 is reported `OFF-BEAT` rather than measured.
 * 2. **A plateau read as a settle.** Ruling 10 §4a says poll until the draw-call count is
 *    unchanged across consecutive samples — but a streaming batch can hold draw calls flat
 *    while triangles are still arriving, and a frame captured there is a frame of a room that
 *    is not finished. Guard: **calls AND tris** must both hold across four samples.
 * 3. **Capturing the degraded path.** Below ladder rung 2 the composer is disposed and the
 *    frame is the *ungraded* one, which is a different picture. Guard: the HUD's `post` column
 *    must read bytes, never `-`, or the beat is refused.
 *
 * Plus Ruling 9's: a frame whose frame time reads in the thousands of ms is never accepted.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* ------------------------------------------------------------------ FB-5's thresholds --- */

const FB5 = {
  darkShare: 0.02, // >= 2% of pixels under luma 0.06 — a real shadow
  brightShare: 0.005, // >= 0.5% over luma 0.94 — a real highlight
  midLow: 0.35, // the desk's own mid-tone lands in [0.35, 0.55]
  midHigh: 0.55,
};

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------------ the driver --- */

async function launch(port) {
  if (CHROME === undefined) throw new Error('no Chrome found — edit CHROME in this file');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fb5-'));
  const proc = spawn(
    CHROME,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      // Without this Windows reports the window occluded, Chrome throttles rAF, and BOTH the
      // scroll driver and the island's demand-render loop stall — which reads as a page that
      // will not move and a draw time in the hundreds of ms. Cost of omitting it: one whole
      // capture cycle of nonsense numbers.
      '--disable-features=CalculateNativeWinOcclusion',
      '--window-size=1600,1100',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return { proc, version: await r.json() };
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  proc.kill();
  throw new Error('chrome devtools endpoint never came up');
}

async function attach(wsUrl, url) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('ws error'));
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    const p = pending.get(msg.id);
    if (p === undefined) return;
    pending.delete(msg.id);
    if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
    else p.res(msg.result);
  };
  const raw = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }));
    });

  const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
  const call = (m, p) => raw(m, p, sessionId);
  await call('Runtime.enable');
  await call('Page.enable');
  // The reporter's cut. Without the override the window chrome eats ~300 px of height and
  // every framing-dependent number describes a different frame.
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call('Page.navigate', { url });
  const evaluate = async (expression, awaitPromise = false) => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { call, evaluate, close: () => ws.close() };
}

/* --------------------------------------------------------------------- the page work --- */

/** The HUD line, which is the only instrument the island exposes to a capture. */
const HUD = `(()=>{const h=[...document.querySelectorAll('div')]
  .find(x=>x.style.zIndex==='9999');return h&&h.textContent})()`;

/** Document-space box for a chapter section — the two numbers progressMap actually uses. */
const BOX = (ch) => `(() => {
  const r = document.querySelector('#ch${ch}').getBoundingClientRect();
  return { top: r.top + window.scrollY, height: r.height };
})()`;

/**
 * Scroll to a document-space Y with real wheel events (the site listens through Lenis, so a
 * `scrollTo` would fight the smoothing), then hold until the browser agrees it arrived.
 */
async function scrollTo(page, target) {
  await page.evaluate(`(() => {
    const target = ${target};
    const step = () => {
      const dy = target - window.scrollY;
      if (Math.abs(dy) < 1) return;
      window.dispatchEvent(new WheelEvent('wheel', {
        deltaY: Math.sign(dy) * Math.min(160, Math.abs(dy)), deltaMode: 0,
        bubbles: true, cancelable: true }));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  })()`);
  let settled = 0;
  let y = await page.evaluate('window.scrollY');
  for (let i = 0; i < 150 && settled < 5; i++) {
    await sleep(200);
    const next = await page.evaluate('window.scrollY');
    // Re-arm rather than trust one dispatch: a throttled or interrupted rAF chain would
    // otherwise leave the page parked wherever it stopped, and the beat would be measured
    // at whatever progress that happens to be.
    if (next === y && Math.abs(next - target) > 2) await scrollTo(page, target);
    y = next;
    settled = Math.abs(y - target) <= 2 ? settled + 1 : 0;
  }
  return y;
}

/** Ruling 10 §4a, hardened: calls AND tris both unchanged across four consecutive samples. */
async function settle(page) {
  let prev = null;
  let stable = 0;
  let line = null;
  for (let i = 0; i < 100 && stable < 4; i++) {
    line = await page.evaluate(HUD);
    const key = /calls (\d+) \| tris (\d+)/.exec(line ?? '')?.[0] ?? null;
    stable = key !== null && key === prev ? stable + 1 : 0;
    prev = key;
    await sleep(400);
  }
  return { line, stable };
}

/**
 * Rec.709 luma over every pixel of the composited frame. The PNG is decoded **inside the
 * page** — the browser already owns a PNG decoder, so this needs no image library.
 *
 * `patch` samples FB-5's third clause: a 240×160 rectangle centred horizontally and 62% down
 * the frame, which is where the desktop sits in Ch1's authored end framing. Reported as a
 * median so one blown specular hit cannot carry it.
 */
async function histogram(page, base64) {
  return page.evaluate(
    `(async () => {
      const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,${base64}')).blob());
      const g = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
      const L = (a, i) => (0.2126 * a[i] + 0.7152 * a[i+1] + 0.0722 * a[i+2]) / 255;
      let dark = 0, bright = 0, sum = 0;
      const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        const l = L(d, i);
        sum += l;
        if (l < 0.06) dark++;
        if (l > 0.94) bright++;
      }
      const patch = g.getImageData(Math.round(bmp.width * 0.5 - 120),
                                   Math.round(bmp.height * 0.62 - 80), 240, 160).data;
      const vals = [];
      for (let i = 0; i < patch.length; i += 4) vals.push(L(patch, i));
      vals.sort((a, b) => a - b);
      const q = (f) => vals[Math.min(vals.length - 1, Math.round(f * vals.length))];
      // Canvas-only, because the composited frame also holds DOM: the HUD strip (top left),
      // the copy zone (left) and the chapter pill (bottom left) are all near-white furniture,
      // and a whole-frame max just reports the brightest of THOSE, identically at every beat.
      let max = 0;
      const x0 = Math.round(bmp.width * 0.35), x1 = Math.round(bmp.width * 0.95);
      const y0 = Math.round(bmp.height * 0.05), y1 = Math.round(bmp.height * 0.90);
      const box = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      for (let i = 0; i < box.length; i += 4) max = Math.max(max, L(box, i));
      return { w: bmp.width, h: bmp.height, dark: dark / n, bright: bright / n, mean: sum / n,
               patch: vals[vals.length >> 1], lit: q(0.9), shade: q(0.1), max };
    })()`,
    true,
  );
}

/* ------------------------------------------------------------------------------ main --- */

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const CH = Number(arg('--ch', '1'));
const BEATS = arg('--p', '0.10,0.50,0.98').split(',').map(Number);
const OUT = arg('--out', null);
const ORIGIN = arg('--url', 'http://localhost:4321');
const URL = `${ORIGIN}/?path=full&hud=1&tier=desktop`;

const pct = (x) => `${(100 * x).toFixed(2)}%`;
const mark = (ok) => (ok ? 'PASS' : 'FAIL');

const chrome = await launch(9444);
const page = await attach(chrome.version.webSocketDebuggerUrl, URL);
const rows = [];
try {
  for (let i = 0; i < 240; i++) {
    if (await page.evaluate(`[...document.querySelectorAll('div')].some(d=>d.style.zIndex==='9999')`)) break;
    await sleep(250);
  }
  await sleep(9000); // boot gate, first stream

  for (const beat of BEATS) {
    const box = await page.evaluate(BOX(CH));
    const target = box.top + beat * box.height;
    const y = await scrollTo(page, target);
    const achieved = (y - box.top) / box.height;
    const { line, stable } = await settle(page);
    const frameMs = Number(/frame ([\d.]+) ms/.exec(line)?.[1] ?? NaN);
    const post = /post (.*)$/.exec(line)?.[1].trim() ?? '-';

    const offBeat = Math.abs(achieved - beat) > 0.005;
    const shot = await page.call('Page.captureScreenshot', { format: 'png' });
    if (OUT !== null) {
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(
        path.join(OUT, `ch${CH}-p${String(Math.round(beat * 100)).padStart(2, '0')}.png`),
        Buffer.from(shot.data, 'base64'),
      );
    }
    const h = await histogram(page, shot.data);

    console.log(`\n=== ch${CH} p=${beat.toFixed(2)} ===`);
    console.log(`  scrollY ${Math.round(y)} of target ${Math.round(target)} ` +
      `(box top ${Math.round(box.top)}, height ${Math.round(box.height)})`);
    console.log(`  achieved progress ${achieved.toFixed(4)} -> ${offBeat ? '*** OFF-BEAT ***' : 'on beat'}`);
    console.log(`  HUD ${line}`);
    console.log(`  settled ${stable} samples (calls AND tris) | frame ${frameMs} ms -> ` +
      `${frameMs < 1000 ? 'accept' : '*** REJECT, Ruling 9 ***'}`);
    console.log(`  post ${post} -> ${post === '-' ? '*** DEGRADED PATH, refuse ***' : 'graded path alive'}`);
    console.log(`  FB-5 dark  < 0.06 : ${pct(h.dark)}  (>= 2%)    ${mark(h.dark >= FB5.darkShare)}`);
    console.log(`  FB-5 bright> 0.94 : ${pct(h.bright)}  (>= 0.5%)  ${mark(h.bright >= FB5.brightShare)}`);
    console.log(`  FB-5 mid-tone     : ${h.patch.toFixed(4)}  (0.35-0.55) ` +
      `${mark(h.patch >= FB5.midLow && h.patch <= FB5.midHigh)}`);
    console.log(`  frame mean luma   : ${h.mean.toFixed(4)}   (${h.w}x${h.h})`);
    // FB-3's ratio, on one material: the p90 and p10 of the same desk rect are a lit face and
    // a shaded face of the same wood, so their ratio is the key-to-fill the ruling asks for.
    console.log(`  FB-3 lit/shade    : ${h.lit.toFixed(4)} / ${h.shade.toFixed(4)} = ` +
      `${(h.lit / Math.max(1e-6, h.shade)).toFixed(2)}:1  (>= 3:1) ${mark(h.lit >= 3 * h.shade)}`);
    // The post cut's ceiling: grade.rt is RGBA8 holding LINEAR radiance, so the buffer clamps
    // at 1.0 and no pixel can exceed toe(sRGB(ACES(1.0 * exposure / 0.6))). Printed because
    // that number, not the scene, is what decides whether FB-5's highlight clause is reachable.
    console.log(`  brightest CANVAS px: ${h.max.toFixed(4)}`);
    rows.push({ beat, achieved: +achieved.toFixed(4), post, offBeat, mean: +h.mean.toFixed(4),
      dark: +(100 * h.dark).toFixed(2), bright: +(100 * h.bright).toFixed(2), mid: +h.patch.toFixed(4),
      ratio: +(h.lit / Math.max(1e-6, h.shade)).toFixed(2), max: +h.max.toFixed(4) });
  }
} finally {
  console.log('\nJSON ' + JSON.stringify(rows));
  page.close();
  chrome.proc.kill();
}
