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
  // per-sprite rotation so the field never reads as stamped copies
  float ang = vSeed * 6.2831853;
  vec2 p = vUv - 0.5;
  p = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p;

  // domain-warped fbm: billowy cauliflower lobes instead of smoke blobs
  vec2 warp = 0.32 * vec2(
    snoise(vec3(p * 2.6, vSeed * 19.0)),
    snoise(vec3(p * 2.6 + 4.7, vSeed * 19.0))
  );
  vec2 q = p + warp;
  float n = fbm3(vec3(q * 2.4 + vSeed * 37.0, uTime * 0.015 + vSeed));

  // cumulus shaping: soft radial body, flatter base, billowy top
  float radial = 1.0 - smoothstep(0.12, 0.5, length(p * vec2(1.0, 1.25)));
  float base = smoothstep(-0.42, -0.12, p.y + n * 0.18);
  float density = radial * base * smoothstep(-0.2, 0.5, n);
  if (density < 0.015) discard;

  // lighting: sun gradient across the sprite + bright silver-lined rim
  vec2 sunDir2 = normalize(uSunScreenDir + 1e-5);
  float lit = clamp(dot(normalize(p + 1e-5), sunDir2) * 0.5 + 0.5, 0.0, 1.0);
  vec3 color = mix(uShadowColor, uSunColor, lit * lit * 0.9 + 0.1);
  float rim = pow(1.0 - radial, 1.8) * pow(lit, 2.0);
  color += uSunColor * rim * 0.9;

  float fog = smoothstep(uFogNear, uFogFar, vDepth);
  color = mix(color, uFogColor, fog);

  // fade out sprites the camera is about to fly through — a near sprite is a
  // fullscreen quad of fbm, the single biggest overdraw cost in the scene
  float near_ = smoothstep(2.5, 9.0, vDepth);

  gl_FragColor = vec4(color, min(density * 1.35, 1.0) * uOpacity * near_ * (1.0 - fog));
}
