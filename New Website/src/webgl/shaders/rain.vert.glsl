attribute float aPhase;

uniform float uTime;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform float uSpeed;

varying float vAlpha;

void main() {
  vec3 p = position;
  // wrap fall inside the box
  p.y = uBoxMin.y + mod(position.y - uBoxMin.y - uTime * uSpeed * (0.8 + aPhase * 0.4), uBoxSize.y);
  // slight wind shear
  p.x += sin(uTime * 0.7 + aPhase * 6.283) * 0.6;

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float depth = -mvPosition.z;
  vAlpha = smoothstep(60.0, 10.0, depth) * 0.7;
  gl_PointSize = 90.0 / depth;
  gl_Position = projectionMatrix * mvPosition;
}
