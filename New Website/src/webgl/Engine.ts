import { Color, Fog, HalfFloatType, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, VignetteEffect } from 'postprocessing';
import { CONTRAIL_FROM, FOLD_WINDOW } from '../story/chapters';
import { PaperPlane } from './actors/PaperPlane';
import { Trail } from './actors/Trail';
import { CameraRig } from './rig/CameraRig';
import { FlightPath } from './rig/FlightPath';
import { ScrollDirector } from './scroll/ScrollDirector';
import { World } from './World';

interface EngineOptions {
  reducedMotion: boolean;
}

/**
 * Phase-2 engine: the full flight, scrubbable end to end over the blockout
 * world. Scroll owns t; the RAF loop owns time-based motion (turbulence,
 * camera damping, contrail).
 */
export class Engine {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private composer: EffectComposer;
  private path = new FlightPath();
  private world: World;
  private plane = new PaperPlane();
  private trail = new Trail();
  private rig: CameraRig;
  private director: ScrollDirector | null = null;
  private scrollT = 0;
  private rafId = 0;
  private startTime = performance.now();
  private lastTime = this.startTime;
  private disposed = false;

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

    this.scene.fog = new Fog('#05070f', 10, 90);
    this.camera = new PerspectiveCamera(45, 1, 0.1, 300);

    this.world = new World(this.path);
    this.scene.add(this.world.group, this.plane.group, this.trail.line);
    this.rig = new CameraRig(this.path, this.camera, this.plane);

    this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new EffectPass(
        this.camera,
        new BloomEffect({ luminanceThreshold: 0.7, intensity: 1.2, mipmapBlur: true }),
        new VignetteEffect({ darkness: 0.55 }),
      ),
    );

    this.resize();
    window.addEventListener('resize', this.resize);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
  }

  start(): void {
    this.director = new ScrollDirector({
      reducedMotion: this.options.reducedMotion,
      onProgress: (t) => {
        this.scrollT = t;
        if (this.options.reducedMotion) this.renderFrame();
      },
    });

    if (this.options.reducedMotion) {
      this.renderFrame();
      return;
    }
    this.loop();
  }

  private renderFrame(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    const time = (now - this.startTime) / 1000;
    const t = this.scrollT;

    // fold beat: flat letter on the desk becomes the dart inside CH1
    const { start, end } = FOLD_WINDOW;
    const foldU = Math.min(Math.max((t - start) / (end - start), 0), 1);
    this.plane.setFold(foldU * foldU * (3 - 2 * foldU));

    this.rig.update(t, time, dt);

    if (t > CONTRAIL_FROM) {
      this.trail.visible = true;
      this.trail.push(this.plane.group.position);
    } else {
      this.trail.visible = false;
    }

    this.composer.render();
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.renderFrame();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio, 2);
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
    this.composer.dispose();
    this.world.dispose();
    this.plane.dispose();
    this.trail.dispose();
    this.renderer.dispose();
  }
}
