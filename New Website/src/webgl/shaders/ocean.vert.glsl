// Night ocean under the beacon: three directional swells with sharpened
// crests. Normals via finite differences (cheap at this vertex density).
uniform float uTime;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;

float swell(vec2 p, float t) {
  float h = 0.0;
  // four directions: long storm swells + shorter wind chop
  h += 0.46 * sin(dot(p, vec2(0.14, 0.06)) + t * 1.0);
  h += 0.30 * sin(dot(p, vec2(-0.09, 0.17)) + t * 1.4);
  h += 0.18 * sin(dot(p, vec2(0.23, -0.19)) + t * 1.9);
  h += 0.09 * sin(dot(p, vec2(0.4, 0.33)) + t * 2.6);
  // high-frequency chop rides on the swells — the surface reads as water,
  // not as a slow rubber sheet
  h += 0.05 * sin(dot(p, vec2(0.9, 0.63)) + t * 3.4);
  h += 0.035 * sin(dot(p, vec2(-0.71, 1.02)) + t * 4.1);
  // sharpen crests, keep troughs broad
  return h + 0.16 * pow(abs(sin(dot(p, vec2(0.11, 0.13)) + t)), 4.0);
}

void main() {
  vec3 p = position; // plane is rotated -90° around X: local xy → world xz
  float t = uTime;
  vec2 xz = (modelMatrix * vec4(p, 1.0)).xz;

  float h = swell(xz, t);
  float hx = swell(xz + vec2(0.35, 0.0), t);
  float hz = swell(xz + vec2(0.0, 0.35), t);
  p.z += h; // local z = world y before the mesh rotation

  vNormal = normalize(vec3(h - hx, 0.6, h - hz));
  vCrest = h;

  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
