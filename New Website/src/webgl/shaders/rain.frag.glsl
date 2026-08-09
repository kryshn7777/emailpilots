uniform vec3 uColor;
uniform float uOpacity;

varying float vAlpha;

void main() {
  // vertical streak inside the point sprite
  vec2 pc = gl_PointCoord - 0.5;
  float streak = smoothstep(0.5, 0.05, abs(pc.x)) * smoothstep(0.5, 0.35, abs(pc.y));
  float a = streak * vAlpha * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
