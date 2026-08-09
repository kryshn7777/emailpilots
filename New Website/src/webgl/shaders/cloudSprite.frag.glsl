#include ./chunks/noise.glsl;

uniform float uTime;
uniform vec3 uSunColor;
uniform vec3 uShadowColor;
uniform vec2 uSunScreenDir;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uOpacity;

varying vec2 vUv;
varying float vSeed;
varying float vDepth;

void main() {
  vec2 p = vUv - 0.5;
  float radial = 1.0 - smoothstep(0.15, 0.5, length(p));

  float n = fbm3(vec3(vUv * 3.0 + vSeed * 37.0, uTime * 0.02 + vSeed));
  float density = radial * smoothstep(-0.25, 0.45, n);
  if (density < 0.01) discard;

  // fake sun gradient across the sprite along the projected sun direction
  float lit = clamp(dot(normalize(p + 1e-5), uSunScreenDir) * 0.5 + 0.5, 0.0, 1.0);
  lit = mix(lit, 1.0, 0.15);
  vec3 color = mix(uShadowColor, uSunColor, lit * lit);

  float fog = smoothstep(uFogNear, uFogFar, vDepth);
  color = mix(color, uFogColor, fog);

  gl_FragColor = vec4(color, density * uOpacity * (1.0 - fog));
}
