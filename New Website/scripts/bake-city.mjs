// Bakes the procedural city into public/models/city.glb (geometry + vertex-
// color AO). Node-only: no DCC tool in the pipeline. Re-run after editing
// src/webgl/bake/cityGen.ts, then commit the GLB.
//   npm run bake:city
import { mkdirSync, writeFileSync } from 'node:fs';

// GLTFExporter assumes a browser FileReader; give Node a minimal one.
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result =
        'data:application/octet-stream;base64,' + Buffer.from(buffer).toString('base64');
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
};
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mesh, MeshStandardMaterial } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import { cityLayout, cityGeometry } from '../src/webgl/bake/cityGen.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'models');
mkdirSync(outDir, { recursive: true });

const geometry = cityGeometry(cityLayout(0));
const mesh = new Mesh(
  geometry,
  new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
);
mesh.name = 'city';

const exporter = new GLTFExporter();
exporter.parse(
  mesh,
  (result) => {
    const file = join(outDir, 'city.glb');
    writeFileSync(file, Buffer.from(result));
    console.log('baked', file, `${(result.byteLength / 1024).toFixed(0)} KB`);
  },
  (err) => {
    console.error('bake failed:', err);
    process.exit(1);
  },
  { binary: true },
);
