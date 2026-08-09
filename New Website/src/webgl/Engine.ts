import {
  Color,
  DirectionalLight,
  Fog,
  HalfFloatType,
  HemisphereLight,
  MathUtils,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, VignetteEffect } from 'postprocessing';
import {
  CONTRAIL_FROM,
  FOLD_WINDOW,
  TOUCHDOWN_T,
  UNFOLD_WINDOW,
  gradeBlendAt,
  type GradeParams,
} from '../story/chapters';
import { Beacon } from './actors/Beacon';
import { Biplane } from './actors/Biplane';
import { Birds } from './actors/Birds';
import { City } from './actors/City';
import { Clouds } from './actors/Clouds';
import { Copilot } from './actors/Copilot';
import { Desk } from './actors/Desk';
import { Envelopes } from './actors/Envelopes';
import { Landing } from './actors/Landing';
import { LaunchString } from './actors/LaunchString';
import { NoFly } from './actors/NoFly';
import { Panel } from './actors/Panel';
import { PaperBurst } from './actors/PaperBurst';
import { PaperPlane } from './actors/PaperPlane';
import { Rooftops } from './actors/Rooftops';
import { Storm } from './actors/Storm';
import { Trail } from './actors/Trail';
import { WindowFrame } from './actors/WindowFrame';
import { CameraRig } from './rig/CameraRig';
import { FlightPath } from './rig/FlightPath';
import { setCompiler } from './warm';
import { Raycast } from './interact/Raycast';
import { Tooltip } from './interact/Tooltip';
import { SkyDome } from './materials/SkyDome';
import { ScrollDirector } from './scroll/ScrollDirector';
import { detectQuality, gpuRendererString } from './quality';
import { mulberry32 } from './util';

interface EngineOptions {
  reducedMotion: boolean;
}

interface IdlePreset {
  t: number;
  orbitRadius: number;
  orbitHeight: number;
  orbitSpeed: number;
}

/** Non-home routes park the world at a story moment and orbit it slowly. */
const ROUTE_PRESETS: Record<string, IdlePreset> = {
  '/features': { t: 0.3, orbitRadius: 7, orbitHeight: 1.6, orbitSpeed: 0.12 },
  '/pricing': { t: 0.53, orbitRadius: 9, orbitHeight: 2.6, orbitSpeed: 0.08 },
  '/download': { t: 0.985, orbitRadius: 4.5, orbitHeight: 1.3, orbitSpeed: 0.05 },
};

/**
 * Phase-3 engine: CH1–5 art-complete (desk, panel, takeoff window, volumetric
 * cloud sea, storm) over the chapter grade system; CH6–10 remain blockout.
 */
export class Engine {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private composer: EffectComposer;
  private quality!: ReturnType<typeof detectQuality>;

  private path = new FlightPath();
  private plane = new PaperPlane();
  private trail = new Trail();
  private launchString = new LaunchString();
  private rig: CameraRig;
  private sky = new SkyDome();
  private sun = new DirectionalLight('#ffd9a0', 1);
  private hemi = new HemisphereLight('#8fa8cc', '#1a1e2e', 0.35);
  private desk: Desk;
  private panel: Panel;
  private windowFrame: WindowFrame;
  private rooftops!: Rooftops;
  private clouds: Clouds;
  private envelopes: Envelopes;
  private storm: Storm;
  private biplane: Biplane;
  private birds: Birds;
  private beacon: Beacon;
  private noFly: NoFly;
  private city: City;
  private copilot: Copilot;
  private landing: Landing;
  private burst: PaperBurst;
  private confetti: PaperBurst;
  private raycast = new Raycast();
  private tooltip = new Tooltip();
  private director: ScrollDirector | null = null;

  private fog: Fog;
  private scrollT = 0;
  /**
   * What the frame actually renders: scrollT chased with a frame-rate-
   * independent damp. Wheel detents, scrollbar drags, PageDown, and anchor
   * jumps all arrive as steps — the camera glides through them instead of
   * snapping, and seam beats still fire because renderT passes through
   * every value on the way.
   */
  private renderT = 0;
  private prevT = 0;
  private idlePreset: IdlePreset | null = null;
  private maneuverPulse = 0;
  private rafId = 0;
  private startTime = performance.now();
  private lastTime = this.startTime;
  private disposed = false;

  // scratch for grade lerps
  private colorA = new Color();
  private colorB = new Color();
  private sunDirWorld = new Vector3(0.6, 0.25, 0.1);
  private sunScreenDir = new Vector2(0.7, 0.3);
  private tmpV = new Vector3();

  constructor(
    private canvas: HTMLCanvasElement,
    private options: EngineOptions,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false, // post chain handles AA later (SMAA); MSAA fights the composer
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(new Color('#05070f'));
    // shader-error introspection synchronously stalls every program link;
    // keep it for dev, drop it in production builds
    if (import.meta.env.PROD) this.renderer.debug.checkShaderErrors = false;
    this.quality = detectQuality(gpuRendererString(this.renderer.getContext()));

    this.fog = new Fog('#05070f', 10, 90);
    this.scene.fog = this.fog;
    this.camera = new PerspectiveCamera(45, 1, 0.1, 400);

    // instant fallback env, upgraded to the real night-sky HDRI when it
    // streams in — first frame never waits on the network
    const pmrem = new PMREMGenerator(this.renderer);
    const roomEnv = pmrem.fromScene(new RoomEnvironment());
    this.scene.environment = roomEnv.texture;
    this.scene.environmentIntensity = 0.3;
    new HDRLoader().load(
      '/hdri/sky_1k.hdr',
      (hdr) => {
        this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();
        roomEnv.dispose();
        pmrem.dispose();
      },
      undefined,
      () => pmrem.dispose(), // offline: keep the RoomEnvironment look
    );

    const rand = mulberry32(919);
    this.desk = new Desk(new Vector3(0.4, 1.29, 0), this.quality.dustCount, rand);
    this.panel = new Panel(this.path.chapterAnchor(1));
    this.windowFrame = new WindowFrame(new Vector3(7, 2, 0.8));
    this.rooftops = new Rooftops(rand);
    this.clouds = new Clouds(this.path.chapterAnchor(3), this.quality, rand, this.renderer);
    this.envelopes = new Envelopes(this.raycast, this.tooltip);
    this.storm = new Storm(this.path, this.quality.rainCount, rand);
    this.biplane = new Biplane(this.path);
    this.birds = new Birds(rand);
    this.beacon = new Beacon(this.path.chapterAnchor(5), this.raycast, this.tooltip, this.quality);
    this.noFly = new NoFly(this.path.chapterAnchor(6));
    this.city = new City(this.path.chapterAnchor(7), this.path);
    this.copilot = new Copilot(this.path.chapterAnchor(8));
    this.landing = new Landing(this.path.storyPoint(0.985));
    this.burst = new PaperBurst(rand);
    this.confetti = new PaperBurst(rand);

    this.scene.add(
      this.plane.group,
      this.trail.line,
      this.launchString.line,
      this.sky.mesh,
      this.sun,
      this.sun.target,
      this.hemi,
      this.desk.group,
      this.panel.group,
      this.windowFrame.group,
      this.rooftops.group,
      this.clouds.sprites,
      this.envelopes.group,
      this.storm.group,
      this.biplane.group,
      this.birds.group,
      this.beacon.group,
      this.noFly.group,
      this.city.group,
      this.copilot.group,
      this.landing.group,
      this.burst.points,
      this.confetti.points,
    );
    if (this.clouds.volume) this.scene.add(this.clouds.volume);

    this.rig = new CameraRig(this.path, this.camera, this.plane);

    this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new EffectPass(
        this.camera,
        new BloomEffect({ luminanceThreshold: 0.85, intensity: 1.1, mipmapBlur: true }),
        new VignetteEffect({ darkness: 0.55 }),
      ),
    );

    this.resize();
    window.addEventListener('resize', this.resize);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);

    // streamed-in content (city GLB, desk props) compiles off the scroll path
    setCompiler((subtree) => {
      void this.renderer.compileAsync(subtree, this.camera, this.scene).catch(() => {});
    });

    if (new URLSearchParams(location.search).has('probe')) {
      // dev-only scene handle for automated inspection
      Object.assign(window as object, { __scene: this.scene, __camera: this.camera, __engine: this });
    }
  }

  /** Route change: home scrubs; other pages park at a preset and orbit. */
  setRoute(path: string): void {
    const clean = path.replace(/\/+$/, '') || '/';
    this.idlePreset = ROUTE_PRESETS[clean] ?? null;
    const t = this.idlePreset ? this.idlePreset.t : this.scrollT;
    // jumping t across chapters must not fire seam beats or drag the trail
    this.prevT = t;
    this.trail.reset();
    if (this.options.reducedMotion) this.renderFrame();
  }

  /** Page-transition flourish: the plane banks hard while the DOM swaps. */
  maneuver(): void {
    this.maneuverPulse = 1;
  }

  scrollTopForSwap(): void {
    this.director?.scrollTop();
  }

  refreshAfterSwap(): void {
    this.director?.refresh();
  }

  start(): void {
    this.director = new ScrollDirector({
      reducedMotion: this.options.reducedMotion,
      onProgress: (t) => {
        this.scrollT = t;
        if (this.options.reducedMotion) this.renderFrame();
      },
    });

    // first paint compiles the opening chapter synchronously and gives the
    // preloader a real frame to reveal
    this.renderFrame();
    this.warming = false;

    if (this.options.reducedMotion) {
      this.renderFrame();
    } else {
      this.loop();
    }

    // link every other chapter's programs in the background, in STORY ORDER,
    // so a user scrolling the flight stays behind the compile wave. compile()
    // gathers materials with a plain traverse (visibility ignored), and
    // KHR_parallel_shader_compile keeps links off the render thread. Without
    // this, the first frame entering each chapter stalls 0.6–2.2s.
    const wave = [
      this.rooftops.group,
      this.clouds.sprites,
      ...(this.clouds.volume ? [this.clouds.volume] : []),
      this.envelopes.group,
      this.storm.group,
      this.biplane.group,
      this.birds.group,
      this.beacon.group,
      this.noFly.group,
      this.city.group,
      this.copilot.group,
      this.landing.group,
      this.burst.points,
      this.confetti.points,
    ];
    void (async () => {
      for (const subtree of wave) {
        try {
          await this.renderer.compileAsync(subtree, this.camera, this.scene);
        } catch {
          // a failed link must never break the wave
        }
      }
    })();
  }

  private warming = true;

  private applyGrade(t: number): void {
    const { from, to, u } = gradeBlendAt(t);
    const num = (pick: (g: GradeParams) => number): number =>
      MathUtils.lerp(pick(from), pick(to), u);

    this.colorA.set(from.zenith).lerp(this.colorB.set(to.zenith), u);
    this.sky.zenith.copy(this.colorA);
    this.colorA.set(from.horizon).lerp(this.colorB.set(to.horizon), u);
    this.sky.horizon.copy(this.colorA);

    const sunLevel = num((g) => g.sunIntensity);
    // clouds dim with the sun so the storm reads dark, not milky
    const cloudBrightness = MathUtils.clamp(0.3 + (sunLevel / 1.6) * 0.7, 0.3, 1);

    this.colorA.set(from.sunColor).lerp(this.colorB.set(to.sunColor), u);
    this.sky.sunColor.copy(this.colorA);
    this.sun.color.copy(this.colorA);
    this.clouds.sunColor.copy(this.colorA).multiplyScalar(cloudBrightness);

    this.colorA.set(from.fogColor).lerp(this.colorB.set(to.fogColor), u);
    this.fog.color.copy(this.colorA);
    this.clouds.fogColor.copy(this.colorA);
    this.renderer.setClearColor(this.colorA);

    // cloud shadow side follows the fog/ambient mood
    this.clouds.shadowColor
      .copy(this.colorA)
      .lerp(this.colorB.set('#ffffff'), 0.3 * cloudBrightness)
      .multiplyScalar(0.55 + 0.45 * cloudBrightness);

    this.sunDirWorld
      .set(
        num((g) => g.sunDir[0]),
        num((g) => g.sunDir[1]),
        num((g) => g.sunDir[2]),
      )
      .normalize();
    this.sky.sunDir.copy(this.sunDirWorld);
    this.sky.sunIntensity = sunLevel;
    this.sun.intensity = sunLevel * 2.2;
    this.fog.near = num((g) => g.fogNear);
    this.fog.far = num((g) => g.fogFar);
    this.scene.environmentIntensity = num((g) => g.envIntensity);
  }

  private renderFrame(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    const time = (now - this.startTime) / 1000;
    const target = this.idlePreset ? this.idlePreset.t : this.scrollT;
    this.renderT = this.options.reducedMotion
      ? target
      : MathUtils.damp(this.renderT, target, 6, dt);
    if (Math.abs(target - this.renderT) < 0.0004) this.renderT = target;
    const t = this.renderT;

    this.applyGrade(t);

    // fold beat: letter → dart in CH1; dart → letter again after touchdown
    const foldIn = MathUtils.smoothstep(t, FOLD_WINDOW.start, FOLD_WINDOW.end);
    const unfold = MathUtils.smoothstep(t, UNFOLD_WINDOW.start, UNFOLD_WINDOW.end);
    this.plane.setFold(foldIn * (1 - unfold));
    if (this.prevT < FOLD_WINDOW.end && t >= FOLD_WINDOW.end) {
      this.burst.trigger(this.rig.planeWorldPos, time);
    }
    if (this.prevT < TOUCHDOWN_T && t >= TOUCHDOWN_T) {
      this.confetti.trigger(this.rig.planeWorldPos, time);
    }
    this.prevT = t;

    this.rig.update(t, time, dt);
    // the plane "comes out of the screen": hidden until the launch thread
    // has drawn a little way out of the laptop (sub-pages always show it)
    this.plane.group.visible = this.idlePreset !== null || t > 0.012;
    this.launchString.update(this.idlePreset ? 1 : t, this.path);
    this.plane.flex(time, t > CONTRAIL_FROM || this.idlePreset ? 1 : 0);

    // idle orbit for sub-pages: slow crane shot around the parked plane
    if (this.idlePreset) {
      const { orbitRadius, orbitHeight, orbitSpeed } = this.idlePreset;
      const angle = time * orbitSpeed;
      this.plane.group.position.y += Math.sin(time * 0.9) * 0.15;
      this.camera.position.set(
        this.rig.planeWorldPos.x + Math.cos(angle) * orbitRadius,
        this.rig.planeWorldPos.y + orbitHeight,
        this.rig.planeWorldPos.z + Math.sin(angle) * orbitRadius,
      );
      this.camera.lookAt(this.plane.group.position);
    }

    // maneuver flourish: hard bank + camera slide while the DOM swaps
    if (this.maneuverPulse > 0.01) {
      const pulse = this.maneuverPulse;
      this.plane.group.rotateZ(Math.sin((1 - pulse) * Math.PI) * 1.1 * pulse);
      this.camera.position.addScaledVector(this.rig.currentSide, Math.sin((1 - pulse) * Math.PI) * 1.6);
      this.maneuverPulse *= Math.exp(-3.5 * dt);
    } else {
      this.maneuverPulse = 0;
    }

    // sun follows the plane so the directional light never runs out of range
    this.sun.position.copy(this.rig.planeWorldPos).addScaledVector(this.sunDirWorld, 60);
    this.sun.target.position.copy(this.rig.planeWorldPos);

    this.sky.followCamera(this.camera.position);
    this.sky.flash = this.storm.flash;

    // sun direction in view space for the sprite lighting gradient
    this.tmpV.copy(this.sunDirWorld).transformDirection(this.camera.matrixWorldInverse);
    if (Math.abs(this.tmpV.x) + Math.abs(this.tmpV.y) > 1e-4) {
      this.sunScreenDir.set(this.tmpV.x, this.tmpV.y).normalize();
    }

    // Chapter actors only exist near their window. "Fully fogged" is NOT
    // invisible — fog-colored silhouettes still read against the brighter
    // sky gradient — so distant chapters are hidden outright.
    if (this.clouds.volume) this.clouds.volume.visible = t > 0.14 && t < 0.56;
    this.clouds.sprites.visible = t > 0.14 && t < 0.58;
    this.storm.group.visible = t > 0.3 && t < 0.58;
    this.biplane.group.visible = t > 0.32 && t < 0.49;
    this.birds.group.visible = t > 0.055 && t < 0.3;
    this.beacon.group.visible = t > 0.44 && t < 0.615;
    // waits for the sea to fade — overlapped, its red zones floated on water
    this.noFly.group.visible = t > 0.6 && t < 0.7;
    // city waits until the camera reaches it — its westmost massing stands
    // on the no-fly map's ground and read as floating gray blocks at t≈0.6;
    // the city grade's near fog covers the entry
    this.city.group.visible = t > 0.655 && t < 0.83;
    this.copilot.group.visible = t > 0.75 && t < 0.9;
    this.landing.group.visible = t > 0.85;
    const nearDesk = t < 0.32;
    this.desk.group.visible = nearDesk;
    this.panel.group.visible = nearDesk;
    this.windowFrame.group.visible = nearDesk;
    // gone before the cloud sea: at t≈0.2+ the tallest roofs poked through
    // the cloud floor as floating slabs
    this.rooftops.group.visible = t > 0.06 && t < 0.24;

    if (nearDesk) this.desk.update(time); // 250-mote dust loop, pointless offscreen
    this.panel.update(t);
    this.clouds.update(time, this.sunScreenDir, this.fog.near, this.fog.far);
    this.envelopes.update(
      this.rig.planeWorldPos,
      this.rig.currentSide,
      this.rig.currentTangent,
      t,
      time,
      this.camera,
    );
    const stormness =
      MathUtils.smoothstep(t, 0.34, 0.38) * (1 - MathUtils.smoothstep(t, 0.46, 0.52));
    this.storm.update(time, dt, stormness, Math.random);
    this.biplane.update(t, time);
    this.birds.update(time);
    this.plane.setBeamHit(this.beacon.update(time, this.camera, t, this.rig.planeWorldPos));
    this.noFly.update(time, t);
    this.city.update(t, time);
    this.copilot.update(
      this.rig.planeWorldPos,
      this.plane.group.quaternion,
      this.rig.currentSide,
      t,
      time,
    );
    this.landing.update(t, time);
    this.burst.update(time);
    this.confetti.update(time);
    this.raycast.update(this.camera);

    if (t > CONTRAIL_FROM) {
      this.trail.visible = true;
      this.trail.update(t, this.path, this.plane.group.position);
    } else {
      this.trail.visible = false;
    }

    this.composer.render();

    if (this.warming) return; // silent warm-up frames: no chrome events
    if (!this.firstFrameDone) {
      this.firstFrameDone = true;
      window.dispatchEvent(new CustomEvent('flight:ready'));
    }
    window.dispatchEvent(new CustomEvent('flight:t', { detail: t }));
  }

  private firstFrameDone = false;

  private loop = (): void => {
    if (this.disposed) return;
    this.renderFrame();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio, this.quality.maxDpr);
    const { clientWidth, clientHeight } = this.canvas;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.composer.setSize(clientWidth, clientHeight);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    if (this.options.reducedMotion) this.composer.render();
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    // Recovery lands with the poster overlay in the polish phase.
    console.warn('[engine] WebGL context lost');
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.director?.dispose();
    this.raycast.dispose();
    this.tooltip.dispose();
    this.composer.dispose();
    this.plane.dispose();
    this.trail.dispose();
    this.launchString.dispose();
    this.sky.dispose();
    this.desk.dispose();
    this.panel.dispose();
    this.windowFrame.dispose();
    this.rooftops.dispose();
    this.clouds.dispose();
    this.envelopes.dispose();
    this.storm.dispose();
    this.biplane.dispose();
    this.birds.dispose();
    this.beacon.dispose();
    this.noFly.dispose();
    this.city.dispose();
    this.copilot.dispose();
    this.landing.dispose();
    this.burst.dispose();
    this.confetti.dispose();
    this.renderer.dispose();
  }
}
