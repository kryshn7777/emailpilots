// Fetches CC0 GLTF models from Poly Haven and packs each into one optimized
// GLB under public/models/. Manual (`node scripts/fetch-models.mjs`) — never a
// postinstall. The desk renders fine without them (props are additive).
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { get } from 'node:https';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'models');
const tmpRoot = join(root, '.tmp-models');

const SLUGS = ['potted_plant_04', 'book_encyclopedia_set_01', 'ceramic_vase_01'];

function download(url, file, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft === 0) return reject(new Error('Too many redirects'));
        return resolve(download(res.headers.location, file, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      mkdirSync(dirname(file), { recursive: true });
      const out = createWriteStream(file);
      res.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    }).on('error', reject);
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

mkdirSync(outDir, { recursive: true });

for (const slug of SLUGS) {
  const target = join(outDir, `${slug}.glb`);
  if (existsSync(target)) {
    console.log('already present:', target);
    continue;
  }
  try {
    const files = await fetchJson(`https://api.polyhaven.com/files/${slug}`);
    const entry = files?.gltf?.['1k']?.gltf;
    if (!entry?.url) throw new Error('no 1k gltf entry');
    const tmp = join(tmpRoot, slug);
    const gltfFile = join(tmp, `${slug}.gltf`);
    await download(entry.url, gltfFile);
    for (const [rel, inc] of Object.entries(entry.include ?? {})) {
      await download(inc.url, join(tmp, rel));
    }
    // pack + optimize into a single GLB; no draco/meshopt so the runtime
    // needs no decoder — quantization alone roughly halves vertex data.
    // execSync is safe here: every interpolated value is a hardcoded constant
    // (SLUGS + repo paths); npx.cmd on Windows needs the shell regardless.
    execSync(
      `npx --yes @gltf-transform/cli optimize "${gltfFile}" "${target}" --compress quantize --texture-compress false`,
      { stdio: 'inherit' },
    );
    console.log('saved', target);
  } catch (err) {
    console.error(`[skip] ${slug}: ${err.message}`);
  }
}
rmSync(tmpRoot, { recursive: true, force: true });
