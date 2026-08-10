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
import {
  BlendFunction,
  BloomEffect,
  type Effect,
  EffectComposer,
  EffectPass,
  NormalPass,
  RenderPass,
  SSAOEffect,
  VignetteEffect,
} from 'postprocessing';
import { ZoomBlurEffect } from './post/ZoomBlur';
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
import { Traffic } from './actors/Traffic';
import { Trail } from './actors/Trail';
import { WindowFrame } from './actors/WindowFrame';
import { WingPlanes } from './actors/WingPlanes';
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
  private pmrem!: PMREMGenerator;
  private envScene = new Scene();
  private envProbeGrade = new Vector3(-1, -1, -1);
  private envProbeAge = 0;
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
  private wingPlanes = new WingPlanes();
  private traffic!: Traffic;
  private zoomBlur = new ZoomBlurEffect();
  private blurLevel = 0;
  private scrubVel = 0;
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

    // Lighting probe: instead of one fixed HDRI for the whole flight, the
    // chapter's own sky is PMREM-baked into scene.environment and rebuilt
    // whenever the grade has drifted enough to matter. Every rough metal,
    // every glossy floor and every lit facade then reflects and picks up
    // ambient from the sky it is ACTUALLY standing under — storm violet in
    // the storm, dawn gold on the approach — which is the bounce light a
    // static environment map can never give you.
    this.pmrem = new PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();
    this.envScene.add(this.sky.probeMesh);
    this.scene.environment = this.pmrem.fromScene(this.envScene).texture;
    this.scene.environmentIntensity = 0.3;

    const rand = mulberry32(919);
    this.desk = new Desk(new Vector3(0.4, 1.29, 0), this.quality.dustCount, rand);
    this.panel = new Panel(this.path.chapterAnchor(1));
    this.windowFrame = new WindowFrame(new Vector3(7, 2, 0.8));
    this.rooftops = new Rooftops(rand, this.quality);
    this.clouds = new Clouds(this.path.chapterAnchor(3), this.quality, rand, this.renderer);
    this.envelopes = new Envelopes(this.raycast, this.tooltip);
    this.storm = new Storm(this.path, this.quality.rainCount, rand);
    this.biplane = new Biplane(this.path);
    this.birds = new Birds(rand);
    this.beacon = new Beacon(this.path.chapterAnchor(5), this.raycast, this.tooltip, this.quality);
    this.noFly = new NoFly(this.path.chapterAnchor(6));
    this.city = new City(this.path.chapterAnchor(7), this.path, this.quality);
    this.copilot = new Copilot(this.path.chapterAnchor(8));
    // fixed roll-out point, not a story-t sample: the flight now turns off
    // the runway into the arrival office, so sampling near t=1 would drag the
    // whole airfield along with the turn
    this.landing = new Landing(new Vector3(270, 0.5, 0));
    this.burst = new PaperBurst(rand);
    this.confetti = new PaperBurst(rand);
    this.traffic = new Traffic(this.path);

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
      this.wingPlanes.group,
      this.traffic.group,
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

    // Ambient occlusion: the other half of "global illumination" — light
    // that CANNOT reach a crease. The probe supplies the bounce; this takes
    // it away again where geometry occludes itself, which is what makes
    // objects sit in a room instead of floating in front of it. HIGH only:
    // it costs a normal buffer plus a screen pass.
    const effects: Effect[] = [];
    if (this.quality.tier === 'high') {
      const normalPass = new NormalPass(this.scene, this.camera);
      this.composer.addPass(normalPass);
      effects.push(
        new SSAOEffect(this.camera, normalPass.texture, {
          blendFunction: BlendFunction.MULTIPLY,
          worldDistanceThreshold: 60,
          worldDistanceFalloff: 20,
          worldProximityThreshold: 0.4,
          worldProximityFalloff: 0.1,
          luminanceInfluence: 0.55,
          samples: 16,
          rings: 5,
          radius: 0.06,
          intensity: 2.1,
          resolutionScale: 0.5,
          fade: 0.02,
        }),
      );
    }
    effects.push(
      new BloomEffect({ luminanceThreshold: 0.85, intensity: 1.1, mipmapBlur: true }),
      this.zoomBlur,
      new VignetteEffect({ darkness: 0.55 }),
    );
    this.composer.addPass(new EffectPass(this.camera, ...effects));

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
    this.refreshEnvProbe(sunLevel);
  }

  /**
   * Re-bakes the sky probe when the grade has moved far enough to be worth
   * it. Rebuilding every frame is a needless few ms; never rebuilding leaves
   * the storm lit by dawn. The age counter forces a refresh during long slow
   * drifts that never trip the delta on any single frame.
   */
  private refreshEnvProbe(sunLevel: number): void {
    const now = new Vector3(
      this.sky.zenith.r + this.sky.horizon.g * 2,
      this.sky.horizon.b + this.sky.sunColor.r,
      sunLevel,
    );
    this.envProbeAge++;
    const stale = this.envProbeAge > (this.quality.tier === 'high' ? 90 : 220);
    if (!stale && now.distanceToSquared(this.envProbeGrade) < 0.0009) return;
    this.envProbeGrade.copy(now);
    this.envProbeAge = 0;
    const next = this.pmrem.fromScene(this.envScene);
    this.scene.environment?.dispose();
    this.scene.environment = next.texture;
  }

  private renderFrame(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    const time = (now - this.startTime) / 1000;
    const target = this.idlePreset ? this.idlePreset.t : this.scrollT;
    // mass-spring scrub: the world has WEIGHT — it leans into motion,
    // carries momentum, and settles with a breath of overshoot (ζ≈0.85).
    // A plain exponential chase tracked fine but felt weightless.
    const err = Math.abs(target - this.renderT);
    if (this.options.reducedMotion) {
      this.renderT = target;
      this.scrubVel = 0;
    } else {
      const K = 170; // stiffness: response ≈ fifth of a second
      const C = 25; // damping: ζ≈0.96 — weight without jelly
      this.scrubVel += (target - this.renderT) * K * dt;
      this.scrubVel *= Math.exp(-C * dt);
      this.renderT = MathUtils.clamp(this.renderT + this.scrubVel * dt, 0, 1);
    }
    if (err < 0.0004 && Math.abs(this.scrubVel) < 0.004) {
      this.renderT = target;
      this.scrubVel = 0;
    }

    // speed blur: fast scrubbing streaks the frame along the flight line,
    // easing off as the world catches up (never under reduced motion)
    const blurTarget = this.options.reducedMotion
      ? 0
      : MathUtils.smoothstep(err, 0.006, 0.05) * 0.17;
    this.blurLevel = MathUtils.damp(this.blurLevel, blurTarget, 9, dt);
    this.zoomBlur.strength = this.blurLevel < 0.004 ? 0 : this.blurLevel;
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
    // the dart is swallowed by the arrival screen it flies into
    const absorbed = this.idlePreset ? 0 : MathUtils.smoothstep(t, 0.982, 0.998);
    this.plane.group.scale.setScalar(1 - absorbed);
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
    // the raymarched slab hands weather over to the beacon's own sea/rain at
    // CH6 — overlapping them stacked two fullscreen shaders on iGPUs
    if (this.clouds.volume) this.clouds.volume.visible = t > 0.14 && t < 0.44;
    this.clouds.sprites.visible = t > 0.14 && t < 0.58;
    // storm rain is fully faded by 0.52 (stormness ends there) — the group
    // lingering to 0.58 double-paid rain over the beacon's local shower
    this.storm.group.visible = t > 0.3 && t < 0.52;
    this.biplane.group.visible = t > 0.32 && t < 0.49;
    this.birds.group.visible = t > 0.055 && t < 0.3;
    // ends with the sea reveal (0.605) — the extra tail let the camera catch
    // radar rings and ship lights hanging in the no-fly sky during the bend
    this.beacon.group.visible = t > 0.44 && t < 0.605;
    // overlaps the sea fade-out so the ground never drops to void; red zones
    // fade 0.59–0.652 (gone before the city), the map floor lingers to 0.69
    this.noFly.group.visible = t > 0.585 && t < 0.695;
    // city arrives while the camera is still short of the first lots (it
    // crosses x≈170 near t 0.66) so it builds at a distance instead of
    // materializing around the lens; the red map is already out by then
    this.city.group.visible = t > 0.65 && t < 0.83;
    this.copilot.group.visible = t > 0.75 && t < 0.9;
    this.landing.group.visible = t > 0.85;
    const nearDesk = t < 0.32;
    this.desk.group.visible = nearDesk;
    this.panel.group.visible = nearDesk;
    this.windowFrame.group.visible = nearDesk;
    // gone before the cloud sea: at t≈0.2+ the tallest roofs poked through
    // the cloud floor as floating slabs
    this.rooftops.group.visible = t > 0.06 && t < 0.24;
    this.rooftops.update(time);

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
    this.birds.update(time, t);
    this.wingPlanes.update(
      this.rig.planeWorldPos,
      this.rig.currentSide,
      this.rig.currentTangent,
      this.plane.group.quaternion,
      t,
      time,
    );
    this.traffic.update(t, time);
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
    const dpr =
      Math.min(window.devicePixelRatio, this.quality.maxDpr) * this.quality.renderScale;
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
    this.wingPlanes.dispose();
    this.traffic.dispose();
    this.city.dispose();
    this.copilot.dispose();
    this.landing.dispose();
    this.burst.dispose();
    this.confetti.dispose();
    this.renderer.dispose();
  }
}
