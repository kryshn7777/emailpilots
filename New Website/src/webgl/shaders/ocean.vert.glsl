// Night ocean under the beacon: three directional swells with sharpened
// crests. Normals via finite differences (cheap at this vertex density).
uniform float uTime;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;

float swell(vec2 p, float t) {
  float h = 0.0;
  // wavelength ↓, amplitude ↓, three directions
  h += 0.34 * sin(dot(p, vec2(0.14, 0.06)) + t * 0.9);
  h += 0.22 * sin(dot(p, vec2(-0.09, 0.17)) + t * 1.25);
  h += 0.12 * sin(dot(p, vec2(0.23, -0.19)) + t * 1.7);
  // sharpen crests, keep troughs broad
  return h + 0.10 * pow(abs(sin(dot(p, vec2(0.11, 0.13)) + t)), 4.0);
}

void main() {
  vec3 p = position; // plane is rotated -90° around X: local xy → world xz
  float t = uTime;
  vec2 xz = (modelMatrix * vec4(p, 1.0)).xz;

  float h = swell(xz, t);
  float hx = swell(xz + vec2(0.6, 0.0), t);
  float hz = swell(xz + vec2(0.0, 0.6), t);
  p.z += h; // local z = world y before the mesh rotation

  vNormal = normalize(vec3(h - hx, 0.6, h - hz));
  vCrest = h;

  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
