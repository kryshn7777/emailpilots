/**
 * assetRegistry — parse-once, dispose-once, keyed by url (03-RESEARCH §Pattern 10).
 *
 * The fetch half already has exactly one owner (`AssetQueue`); this is the parse half.
 * Research is blunt about where the jank lives: fetching is not the hitch, **parsing,
 * PMREM generation and the first texture upload are** (§Pitfall 4). So the one-ahead
 * prefetch hands the bytes here at chapter N−1 and a chapter's `mount()` becomes a cache
 * read — that, and nothing else, is the "no pop-in at boundaries" mechanism (EXP-05).
 *
 * Consequences worth keeping:
 *
 * - **Chapters never fetch and never parse.** They `await registry.get(url)`. A chapter
 *   that calls a loader directly re-introduces the boundary hitch this module exists to
 *   remove, and duplicates the decode of an asset two chapters already hold.
 * - **The loaders are injected, never constructed here** (D2-02 dependency injection).
 *   `KTX2Loader` in particular has to be `detectSupport(renderer)`-ed against the ONE
 *   renderer Stage owns, and the transcoder path is a self-hosted `public/basis/` URL
 *   (STACK-DECISION A5 — never a CDN). Both are the island entry's business.
 * - **The cache stores promises, not values.** Two `prime()` calls that overlap on the
 *   same url therefore share one parse instead of racing two, and `prime` is idempotent
 *   for free — which it must be, because the prefetch decision re-runs on every scroll
 *   drive and `AssetQueue.load()` legitimately re-hands buffers it already resolved.
 *
 * Extensions are dispatched by suffix. `.glb` → the GLTF scene; `.ktx2` → the transcoded
 * `CompressedTexture`; `.png` → a data `Texture` (03-11's ink ramp — see the branch, which
 * is deliberately in the open rather than hidden behind a generic image path); `.hdr` → the
 * raw ArrayBuffer, deliberately unparsed: PMREM generation is `envCrossfade`'s and the Ch4
 * day-wheel's business (they own the render targets and the ≤2-actives budget line), and
 * this module has no renderer. Anything else rejects naming the url rather than caching a
 * buffer nobody can use.
 */

import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { LinearFilter, Mesh, NoColorSpace, Texture, type Material, type Object3D } from 'three';

export interface AssetRegistry {
  /** Parse fetched bytes once and cache by url. Safe to call repeatedly. */
  prime(buffers: Map<string, ArrayBuffer>): Promise<void>;
  /** Resolve a primed asset; rejects if the url was never primed. */
  get<T = unknown>(url: string): Promise<T>;
  has(url: string): boolean;
  dispose(): void;
}

export interface AssetRegistryDeps {
  /** Already `.setMeshoptDecoder()` + `.setKTX2Loader()`-configured by the island entry. */
  gltfLoader: GLTFLoader;
  /** Already `.setTranscoderPath(public/basis/)` + `.detectSupport(renderer)`-ed. */
  ktx2Loader: KTX2Loader;
}

export function createAssetRegistry(deps: AssetRegistryDeps): AssetRegistry {
  const cache = new Map<string, Promise<unknown>>();

  const parse = async (url: string, buffer: ArrayBuffer): Promise<unknown> => {
    if (url.endsWith('.glb')) return (await deps.gltfLoader.parseAsync(buffer, '')).scene;
    if (url.endsWith('.ktx2')) {
      return new Promise((resolve, reject) => {
        deps.ktx2Loader.parse(buffer, resolve, reject);
      });
    }
    if (url.endsWith('.png')) {
      // The one PNG this site ships is 03-08's ink ramp, and every decision here is about
      // it being DATA rather than a picture:
      //
      // - `NoColorSpace`, because R is stroke order, G a region mask and B nib coverage.
      //   An sRGB decode would bend the ramp and move both published boundaries.
      // - no mipmaps, because the shader THRESHOLDS the red channel: averaging ramp values
      //   between neighbouring strokes across a mip level is the speckled reveal edge
      //   research warned about, arriving by a different door.
      // - `imageOrientation: 'flipY'` with `flipY = false`, because r185 does not apply
      //   `UNPACK_FLIP_Y_WEBGL` to an ImageBitmap source at all (`WebGLTextures.uploadTexture`
      //   guards it behind `isImageBitmap === false`). Setting `texture.flipY = true` here
      //   would silently do nothing and the handwriting would arrive upside down, so the
      //   decode has to do the flip.
      const bitmap = await createImageBitmap(new Blob([buffer]), { imageOrientation: 'flipY' });
      const texture = new Texture(bitmap);
      texture.flipY = false;
      texture.colorSpace = NoColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.needsUpdate = true;
      return texture;
    }
    if (url.endsWith('.hdr')) return buffer;
    throw new Error(`assetRegistry: no parser for ${url}`);
  };

  return {
    async prime(buffers: Map<string, ArrayBuffer>): Promise<void> {
      const pending: Array<Promise<unknown>> = [];
      for (const [url, buffer] of buffers) {
        let entry = cache.get(url);
        if (entry === undefined) {
          entry = parse(url, buffer);
          cache.set(url, entry);
        }
        pending.push(entry);
      }
      // One rejection must not hide the others' outcome, but prime() still rejects so the
      // caller's catch (a prefetch warn, or the critical batch's own failure path) fires.
      await Promise.all(pending);
    },

    async get<T = unknown>(url: string): Promise<T> {
      const entry = cache.get(url);
      if (entry === undefined) throw new Error(`assetRegistry: ${url} was never primed`);
      return (await entry) as T;
    },

    has(url: string): boolean {
      return cache.has(url);
    },

    dispose(): void {
      for (const entry of cache.values()) {
        // Settled or still parsing — either way the value is released once it exists, and a
        // rejected entry has nothing to release. Never throws out of dispose().
        void entry.then(disposeAsset, () => undefined);
      }
      cache.clear();
    },
  };
}

/** Release whatever a cached entry turned out to be. ArrayBuffers need nothing. */
function disposeAsset(value: unknown): void {
  if (value instanceof Texture) {
    value.dispose();
    return;
  }
  if (isObject3D(value)) {
    value.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        disposeMaterial(o.material);
      }
    });
  }
}

function isObject3D(value: unknown): value is Object3D {
  return typeof value === 'object' && value !== null && 'traverse' in value;
}

/** The material AND every texture it references — the walk `Room.dispose()` mirrors for the
 * primitives it built itself, on the other side of the ownership split (T-03-12). */
function disposeMaterial(material: Material | Material[]): void {
  for (const m of Array.isArray(material) ? material : [material]) {
    for (const value of Object.values(m)) {
      if (value instanceof Texture) value.dispose();
    }
    m.dispose();
  }
}
