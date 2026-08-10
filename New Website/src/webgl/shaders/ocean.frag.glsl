uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uCrest;
uniform vec3 uFoam;
uniform vec3 uMoonDir;
uniform vec2 uTowerXZ;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uCamPos;
uniform float uReveal;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;

void main() {
  vec3 n = normalize(vNormal);

  // micro-ripples perturb the normal per fragment — vertex waves alone left
  // the surface reading as a smooth rubber sheet up close
  vec2 rp = vWorldPos.xz;
  float r1 = sin(dot(rp, vec2(2.1, 1.4)) + uTime * 2.8);
  float r2 = sin(dot(rp, vec2(-1.6, 2.5)) + uTime * 3.6);
  float r3 = sin(dot(rp, vec2(3.3, -2.2)) + uTime * 4.4);
  n = normalize(n + vec3(r1 + r3 * 0.5, 0.0, r2 - r3 * 0.5) * 0.045);

  // body color by crest height
  float ch = smoothstep(-0.7, 0.85, vCrest);
  vec3 color = mix(uDeep, uCrest, ch);

  // whitecaps on the sharpest crests, broken up by the ripple field
  float cap = smoothstep(0.55, 0.82, vCrest + r1 * 0.06);
  color = mix(color, uFoam, cap * 0.8);
  // faint streaked foam trails in the troughs between crests
  float streak = smoothstep(0.75, 1.0, r2 * r3) * smoothstep(0.2, -0.4, vCrest);
  color = mix(color, uFoam, streak * 0.12);

  // crash ring around the lighthouse islet: a surge that breathes
  float d = distance(vWorldPos.xz, uTowerXZ);
  float surge = 2.7 + sin(uTime * 1.15) * 0.7;
  float ring = smoothstep(0.9, 0.0, abs(d - surge)) * smoothstep(6.0, 2.0, d);
  float churn = smoothstep(2.4, 1.2, d); // permanent froth against the rocks
  color = mix(color, uFoam, clamp(ring * 0.8 + churn * 0.65, 0.0, 0.9));

  // moon/beam glint — tight sparkles over a broad sheen
  vec3 view = normalize(uCamPos - vWorldPos);
  vec3 halfDir = normalize(view + normalize(uMoonDir));
  float ndh = max(dot(n, halfDir), 0.0);
  float spec = pow(ndh, 42.0);
  float sparkle = pow(ndh, 240.0);
  color += vec3(0.55, 0.85, 0.8) * (spec * 0.45 + sparkle * 0.9);

  // manual fog (ShaderMaterial skips the scene fog chunks)
  float depth = distance(uCamPos, vWorldPos);
  float fog = smoothstep(uFogNear, uFogFar, depth);
  color = mix(color, uFogColor, fog);

  gl_FragColor = vec4(color, uReveal);
}
