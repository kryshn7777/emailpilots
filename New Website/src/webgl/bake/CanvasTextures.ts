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

/**
 * The dart's sheet, UV-mapped to the flat crease pattern: paper grain, the
 * email's ruled handwriting, and the fold diagonals radiating from the nose
 * (u 0.5, v 1). Creases must match PaperPlane's panel layout: keel crease at
 * u 0.5±0.098, wing crease at u 0.5±0.415.
 */
export function paperSheetTexture(): CanvasTexture {
  const S = 512;
  const [canvas, ctx] = makeCanvas(S);
  ctx.fillStyle = '#f7f3ec';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const shade = 236 + Math.floor(Math.random() * 16);
    ctx.fillStyle = `rgba(${shade}, ${shade - 3}, ${shade - 8}, 0.5)`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1);
  }

  // the email itself, written across the sheet
  ctx.strokeStyle = 'rgba(40, 48, 70, 0.34)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (const ly of [0.2, 0.28, 0.36, 0.44, 0.52, 0.6, 0.72]) {
    const y = ly * S;
    const width = (ly === 0.72 ? 0.3 : 0.5 + Math.random() * 0.26) * S;
    ctx.beginPath();
    let x = S * 0.14;
    ctx.moveTo(x, y);
    while (x < S * 0.14 + width) {
      x += 7 + Math.random() * 12;
      ctx.lineTo(x, y + (Math.random() - 0.5) * 4);
    }
    ctx.stroke();
  }

  // fold creases: shadow + highlight pairs radiating from the nose
  const nose: [number, number] = [S * 0.5, S];
  const crease = (uTail: number): void => {
    ctx.strokeStyle = 'rgba(70, 66, 58, 0.28)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(...nose);
    ctx.lineTo(uTail * S, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(nose[0] + 2, nose[1]);
    ctx.lineTo(uTail * S + 2, 0);
    ctx.stroke();
  };
  crease(0.5 - 0.098);
  crease(0.5 + 0.098);
  crease(0.5 - 0.415);
  crease(0.5 + 0.415);
  // center spine
  ctx.strokeStyle = 'rgba(70, 66, 58, 0.35)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(S * 0.5, 0);
  ctx.lineTo(S * 0.5, S);
  ctx.stroke();

  // worn sheet edge
  ctx.strokeStyle = 'rgba(120, 112, 96, 0.35)';
  ctx.lineWidth = 4;
  ctx.strokeRect(1, 1, S - 2, S - 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The tow banner: EMAIL PILOTS on weathered cloth, edge stripes, stitching. */
export function bannerTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.fillStyle = '#efe5cf';
  ctx.fillRect(0, 0, 1024, 256);
  // cloth weave
  for (let i = 0; i < 2400; i++) {
    const v = 214 + Math.floor(Math.random() * 24);
    ctx.fillStyle = `rgba(${v}, ${v - 6}, ${v - 22}, 0.4)`;
    ctx.fillRect(Math.random() * 1024, Math.random() * 256, 2, 1);
  }
  // stripes + stitching at the tow edge
  ctx.fillStyle = '#a5352f';
  ctx.fillRect(0, 10, 1024, 12);
  ctx.fillRect(0, 234, 1024, 12);
  ctx.strokeStyle = 'rgba(90, 60, 40, 0.6)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(14, 24);
  ctx.lineTo(14, 232);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#8c2f28';
  ctx.font = '900 128px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EMAIL PILOTS', 512, 136, 940);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
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

/**
 * Runway asphalt, full markings: threshold piano keys both ends, "27"
 * designator, touchdown-zone bars, centerline dashes, edge stripes, tire
 * scuff near the touchdown zone, asphalt noise. Long axis = V (texture Y).
 */
export function runwayTexture(): CanvasTexture {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');

  ctx.fillStyle = '#23262e';
  ctx.fillRect(0, 0, S, S);
  // asphalt noise
  for (let i = 0; i < 9000; i++) {
    const v = 26 + Math.random() * 24;
    ctx.fillStyle = `rgba(${v}, ${v + 2}, ${v + 8}, 0.35)`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  // tire scuff bands near the near-end touchdown zone
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(12, 12, 14, ${0.05 + Math.random() * 0.1})`;
    const y = S * 0.6 + Math.random() * S * 0.25;
    ctx.fillRect(S * 0.3 + Math.random() * S * 0.4, y, 3 + Math.random() * 5, 26 + Math.random() * 60);
  }

  const paint = 'rgba(240, 236, 226, 0.92)';
  ctx.fillStyle = paint;
  // edge stripes
  ctx.fillRect(S * 0.045, 0, 10, S);
  ctx.fillRect(S * 0.955 - 10, 0, 10, S);
  // threshold piano keys, both ends
  const KEYS = 8;
  for (let i = 0; i < KEYS; i++) {
    const x = S * 0.09 + i * ((S * 0.82) / KEYS) + 8;
    const w = (S * 0.82) / KEYS - 16;
    ctx.fillRect(x, S - 78, w, 62);
    ctx.fillRect(x, 16, w, 62);
  }
  // touchdown-zone bars (two groups per side)
  for (const ty of [S * 0.78, S * 0.7]) {
    for (const tx of [S * 0.16, S * 0.72]) {
      ctx.fillRect(tx, ty, S * 0.12, 20);
    }
  }
  // centerline dashes
  for (let y = S * 0.12; y < S * 0.66; y += 84) {
    ctx.fillRect(S / 2 - 9, y, 18, 52);
  }
  // designator
  ctx.font = `700 ${S * 0.11}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('27', S / 2, S * 0.905);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The payoff sheet: "Re:" reply sliding out from under the landed letter. */
export function replyTexture(): CanvasTexture {
  const [canvas, ctx] = makeCanvas(512);
  ctx.fillStyle = '#fdfbf7';
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = 'rgba(30, 40, 66, 0.9)';
  ctx.font = '700 64px monospace';
  ctx.fillText('Re:', 56, 110);
  ctx.strokeStyle = 'rgba(40, 48, 70, 0.5)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const ly of [0.42, 0.52, 0.62]) {
    const y = ly * 512;
    ctx.beginPath();
    let x = 56;
    ctx.moveTo(x, y);
    const width = (ly === 0.62 ? 0.35 : 0.68) * 512;
    while (x < 56 + width) {
      x += 9 + Math.random() * 13;
      ctx.lineTo(x, y + (Math.random() - 0.5) * 5);
    }
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Laptop display: compose window mid-send — the shot the flight launches from. */
export function laptopScreenTexture(): CanvasTexture {
  const [canvas, ctx] = makeCanvas(512);
  ctx.fillStyle = '#0b101d';
  ctx.fillRect(0, 0, 512, 512);

  // title bar
  ctx.fillStyle = '#141c30';
  ctx.fillRect(0, 0, 512, 54);
  ctx.fillStyle = '#9be8ff';
  ctx.font = '700 24px monospace';
  ctx.fillText('EMAIL PILOTS', 24, 36);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = 'rgba(155, 232, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(452 + i * 20, 27, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // compose fields
  ctx.font = '400 22px monospace';
  ctx.fillStyle = 'rgba(200, 214, 240, 0.85)';
  ctx.fillText('To:      priya@northline.co', 24, 102);
  ctx.fillText('Subject: Quick follow-up', 24, 142);
  ctx.strokeStyle = 'rgba(155, 232, 255, 0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(24, 162);
  ctx.lineTo(488, 162);
  ctx.stroke();

  // body lines
  ctx.strokeStyle = 'rgba(200, 214, 240, 0.35)';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  const widths = [0.82, 0.9, 0.66, 0.0, 0.74, 0.38];
  widths.forEach((w, i) => {
    if (w === 0) return;
    const y = 200 + i * 34;
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(24 + w * 440, y);
    ctx.stroke();
  });

  // sending strip
  ctx.fillStyle = '#101a2e';
  ctx.fillRect(0, 408, 512, 104);
  ctx.fillStyle = '#7fe8d8';
  ctx.font = '700 30px monospace';
  ctx.fillText('SENDING EMAIL…', 24, 452);
  ctx.strokeStyle = 'rgba(127, 232, 216, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 468, 400, 18);
  ctx.fillRect(26, 470, 396 * 0.82, 14);
  // paper-dart glyph at the progress tip
  ctx.beginPath();
  ctx.moveTo(444, 462);
  ctx.lineTo(482, 477);
  ctx.lineTo(444, 492);
  ctx.lineTo(452, 477);
  ctx.closePath();
  ctx.fill();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Pre-dawn apartment facade: floor rows of windows — a few warm-lit, some
 * dim, most dark — with mullions, a parapet band, and grime streaks. Shared
 * by every instanced rooftop building (stretch across heights reads fine in
 * fog at night).
 */
export function facadeTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.fillStyle = '#151b29';
  ctx.fillRect(0, 0, 256, 512);
  // parapet band
  ctx.fillStyle = '#0e1420';
  ctx.fillRect(0, 0, 256, 26);
  // window grid: 8 floors × 6 bays
  const COLS = 6;
  const ROWS = 8;
  const cw = 256 / COLS;
  const rh = (512 - 40) / ROWS;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const roll = Math.random();
      let fill = '#0a0e18'; // dark glass
      if (roll < 0.22) fill = `rgba(255, 201, 138, ${0.55 + Math.random() * 0.4})`; // lamp on
      else if (roll < 0.38) fill = 'rgba(148, 168, 204, 0.16)'; // tv glow
      ctx.fillStyle = fill;
      ctx.fillRect(c * cw + 7, 40 + r * rh + 9, cw - 14, rh - 18);
    }
  }
  // grime streaks
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(6, 8, 14, ${0.05 + Math.random() * 0.1})`;
    ctx.fillRect(Math.random() * 256, 26, 1 + Math.random() * 3, 60 + Math.random() * 300);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Lighthouse hull: classic red/white bands with weather streaks. */
export function lighthouseTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.fillStyle = '#e8e2d6';
  ctx.fillRect(0, 0, 256, 512);
  ctx.fillStyle = '#a5352f';
  const BANDS = 4;
  for (let i = 0; i < BANDS; i++) {
    ctx.fillRect(0, (i * 2 + 0.5) * (512 / (BANDS * 2 + 1)), 256, 512 / (BANDS * 2 + 1));
  }
  // weather streaks running down
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(40, 44, 52, ${0.04 + Math.random() * 0.08})`;
    const x = Math.random() * 256;
    ctx.fillRect(x, Math.random() * 380, 1 + Math.random() * 2, 40 + Math.random() * 120);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  return texture;
}

/** Abstract neon storefront sign — bright bars/rings on black, no words. */
export function neonSignTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  // abstract glyphs: bars + a ring + a tick — reads as signage at distance
  ctx.beginPath();
  ctx.moveTo(14, 16);
  ctx.lineTo(14, 48);
  ctx.moveTo(30, 16);
  ctx.lineTo(30, 48);
  ctx.moveTo(22, 32);
  ctx.lineTo(38, 32);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(62, 32, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(88, 46);
  ctx.lineTo(100, 18);
  ctx.lineTo(112, 46);
  ctx.stroke();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** City road strip: asphalt, center dashes, edge lines. Dashes run along U. */
export function roadTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.fillStyle = '#191c24';
  ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 1600; i++) {
    const v = 20 + Math.random() * 18;
    ctx.fillStyle = `rgba(${v}, ${v + 2}, ${v + 7}, 0.4)`;
    ctx.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
  }
  ctx.fillStyle = 'rgba(214, 208, 190, 0.5)';
  ctx.fillRect(0, 10, 512, 5);
  ctx.fillRect(0, 241, 512, 5);
  ctx.fillStyle = 'rgba(226, 220, 200, 0.55)';
  for (let x = 0; x < 512; x += 86) ctx.fillRect(x, 125, 40, 6);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

/** Laptop deck: key grid + trackpad. */
export function laptopKeysTexture(): CanvasTexture {
  const [canvas, ctx] = makeCanvas(256);
  ctx.fillStyle = '#1a2030';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#232b40';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 13; col++) {
      ctx.fillRect(10 + col * 18.2, 14 + row * 21, 15, 16);
    }
  }
  // spacebar + trackpad
  ctx.fillRect(70, 119, 116, 16);
  ctx.fillStyle = '#151b2a';
  ctx.fillRect(78, 152, 100, 84);
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
