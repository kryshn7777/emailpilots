import {
  Color,
  IcosahedronGeometry,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, VignetteEffect } from 'postprocessing';
import { HalfFloatType } from 'three';
import { ScrollDirector } from './scroll/ScrollDirector';
import debugVert from './shaders/debug.vert.glsl';
import debugFrag from './shaders/debug.frag.glsl';

interface EngineOptions {
  reducedMotion: boolean;
}

/**
 * Phase-1 engine: proves renderer, post chain, glsl pipeline, scroll scrub,
 * resize/DPR handling, and context-loss safety on a debug scene. The flight
 * world replaces the debug scene in Phase 2+.
 */
export class Engine {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private composer: EffectComposer;
  private material: ShaderMaterial;
  private mesh: Mesh;
  private director: ScrollDirector | null = null;
  private rafId = 0;
  private startTime = performance.now();
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

    this.camera = new PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    this.material = new ShaderMaterial({
      vertexShader: debugVert,
      fragmentShader: debugFrag,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
      },
    });
    this.mesh = new Mesh(new IcosahedronGeometry(1.4, 32), this.material);
    this.scene.add(this.mesh);

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
        this.material.uniforms.uProgress!.value = t;
        this.mesh.rotation.y = t * Math.PI * 4;
        this.mesh.rotation.x = t * Math.PI;
      },
    });

    if (this.options.reducedMotion) {
      this.composer.render(); // static frame; scroll still updates via onProgress
      return;
    }
    this.loop();
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.material.uniforms.uTime!.value = (performance.now() - this.startTime) / 1000;
    this.composer.render();
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
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
