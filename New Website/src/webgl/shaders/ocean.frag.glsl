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

  // body color by crest height
  float ch = smoothstep(-0.7, 0.85, vCrest);
  vec3 color = mix(uDeep, uCrest, ch);

  // whitecaps on the sharpest crests
  float cap = smoothstep(0.55, 0.82, vCrest);
  color = mix(color, uFoam, cap * 0.8);

  // crash ring around the lighthouse islet: a surge that breathes
  float d = distance(vWorldPos.xz, uTowerXZ);
  float surge = 2.7 + sin(uTime * 1.15) * 0.7;
  float ring = smoothstep(0.9, 0.0, abs(d - surge)) * smoothstep(6.0, 2.0, d);
  float churn = smoothstep(2.4, 1.2, d); // permanent froth against the rocks
  color = mix(color, uFoam, clamp(ring * 0.8 + churn * 0.65, 0.0, 0.9));

  // moon/beam glint
  vec3 view = normalize(uCamPos - vWorldPos);
  vec3 halfDir = normalize(view + normalize(uMoonDir));
  float spec = pow(max(dot(n, halfDir), 0.0), 42.0);
  color += vec3(0.55, 0.85, 0.8) * spec * 0.5;

  // manual fog (ShaderMaterial skips the scene fog chunks)
  float depth = distance(uCamPos, vWorldPos);
  float fog = smoothstep(uFogNear, uFogFar, depth);
  color = mix(color, uFogColor, fog);

  gl_FragColor = vec4(color, uReveal);
}
