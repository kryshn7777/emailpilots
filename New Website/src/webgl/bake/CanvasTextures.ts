import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/**
 * Runtime "texture baking": every map the world needs is drawn once into a
 * canvas at boot (all < 16ms), replacing authored bitmap assets.
 */

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [canvas, ctx];
}

/** Subtle paper fiber grain — used by the plane and the letter. */
export function paperTexture(): CanvasTexture {
  const [canvas, ctx] = makeCanvas(256);
  ctx.fillStyle = '#f7f3ec';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2200; i++) {
    const shade = 238 + Math.floor(Math.random() * 14);
    ctx.fillStyle = `rgba(${shade}, ${shade - 3}, ${shade - 8}, 0.5)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

/** The letter: ruled handwriting strokes on paper — readable as "an email". */
export function letterTexture(): CanvasTexture {
  const [canvas, ctx] = makeCanvas(512);
  ctx.fillStyle = '#f7f3ec';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(40, 48, 70, 0.55)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const lines = [0.18, 0.26, 0.34, 0.42, 0.5, 0.58, 0.66, 0.8];
  for (const ly of lines) {
    const y = ly * 512;
    const width = (ly === 0.8 ? 0.3 : 0.55 + Math.random() * 0.3) * 512;
    ctx.beginPath();
    let x = 64;
    ctx.moveTo(x, y);
    while (x < 64 + width) {
      x += 8 + Math.random() * 14;
      ctx.lineTo(x, y + (Math.random() - 0.5) * 5);
    }
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Preflight panel face: dark plate, checklist rows, READY strip at top. */
export function panelTexture(): CanvasTexture {
  const [canvas, ctx] = makeCanvas(512);
  ctx.fillStyle = '#10141f';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(155, 232, 255, 0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, 488, 488);

  ctx.fillStyle = '#9be8ff';
  ctx.font = '600 34px monospace';
  ctx.fillText('PRE-FLIGHT', 36, 70);

  ctx.font = '400 22px monospace';
  const rows = ['INBOX CONNECTED', 'ACCOUNTS HEALTHY', 'SUBJECT WRITTEN', 'SCHEDULES SET', "TODAY'S ALLOWANCE"];
  rows.forEach((row, i) => {
    const y = 140 + i * 62;
    ctx.fillStyle = 'rgba(155, 232, 255, 0.75)';
    ctx.fillText(row, 90, y);
    ctx.strokeStyle = 'rgba(155, 232, 255, 0.4)';
    ctx.strokeRect(40, y - 24, 30, 30);
  });

  ctx.fillStyle = '#7fe8d8';
  ctx.font = '700 30px monospace';
  ctx.fillText('READY FOR TAKEOFF', 60, 480);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Soft radial spot — dust motes, rain caps, glows. */
export function glowTexture(): CanvasTexture {
  const [canvas, ctx] = makeCanvas(64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}
