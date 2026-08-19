/**
 * Proof-chapter material — an inline-GLSL template-literal ShaderMaterial.
 * This file is the second half of spike Q4's evidence (D2-14): GLSL as plain
 * template literals builds under Astro 7 / Vite 8 with zero bundler plugins
 * (STACK-DECISION rejected vite-plugin-glsl).
 *
 * A scroll-driven uniform sweeps a warm lamplight pool across the set —
 * token palette: nightblue #16213a, lamplight #e8a45c (ART-DIRECTION).
 */

import { ShaderMaterial } from 'three';

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uProgress;
  varying vec3 vWorldPos;

  void main() {
    vec3 night = vec3(0.086, 0.129, 0.227);   // --nightblue
    vec3 lamp  = vec3(0.910, 0.643, 0.361);   // --lamplight

    // The lamp pool tracks progress across the desk plane (x) and warms as it goes.
    vec2 poolCenter = vec2(mix(-2.5, 2.5, uProgress), 0.0);
    float dist = distance(vWorldPos.xz, poolCenter);
    float glow = smoothstep(2.6, 0.0, dist) * (0.35 + 0.65 * uProgress);

    gl_FragColor = vec4(mix(night, lamp, glow), 1.0);
  }
`;

export function makeProofMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uProgress: { value: 0 } },
    vertexShader,
    fragmentShader,
  });
}
