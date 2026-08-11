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
  // Driven rain, not drizzle: a steady lateral push with the whole sheet
  // gusting on top of it, so the fall is a slant rather than a vertical
  // curtain that happens to wobble. The frag shears its streak to match.
  float fall = (p.y - uBoxMin.y) / uBoxSize.y;
  p.x += sin(uTime * 0.9 + aPhase * 6.283) * 1.5 + (1.0 - fall) * 3.2;

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float depth = -mvPosition.z;
  vAlpha = smoothstep(70.0, 6.0, depth) * 0.95;
  // longer streaks, and they hold their length closer to the lens. The quad
  // is square and the streak only uses a sliver of its width, so the fill
  // cost of the extra size is small.
  gl_PointSize = 130.0 / depth;
  gl_Position = projectionMatrix * mvPosition;
}
