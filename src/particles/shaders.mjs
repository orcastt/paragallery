export const vertexShader = /* glsl */`
  attribute vec3 aColor;
  attribute float aSeed;
  attribute vec3 aOffset;
  uniform float uTime;
  uniform float uAssembly;
  uniform float uBirth;
  uniform float uDepth;
  uniform float uViewScale;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uOpacity;
  uniform float uFormation;
  varying vec3 vColor;
  varying float vEnergy;
  varying float vAlpha;
  const float PI = 3.14159265;
  void main() {
    vec3 target = position;
    target.z *= uDepth;
    float assembled = min(uAssembly, uBirth);
    float progress = smoothstep(aSeed * 0.16, 0.84 + aSeed * 0.16, assembled);
    vec3 p = target;
    if (progress < .999) {
    float a = aSeed * PI * 2.0 * 9.0;
    vec3 scatter;
    if (uFormation < 0.5) {
      float radius = 8.0 + aSeed * 15.0;
      scatter = vec3(cos(a + uTime * 0.22) * radius, sin(a * 0.37) * 7.0, sin(a + uTime * 0.22) * radius);
    } else if (uFormation < 1.5) {
      scatter = normalize(vec3(sin(a * 7.0), cos(a * 3.0), sin(a * 11.0)) + 0.001) * (10.0 + aSeed * 22.0);
    } else if (uFormation < 2.5) {
      scatter = target + vec3(sin(a * 7.0) * 7.0, 14.0 + aSeed * 26.0, cos(a * 4.0) * 10.0);
    } else {
      scatter = target + vec3(sign(sin(a)) * (8.0 + aSeed * 10.0), sin(floor(aSeed * 18.0)) * 9.0, cos(a) * 14.0);
    }
    p = mix(scatter, target, progress);
    }
    // Per-particle displacement comes from bounded XYZ springs. Camera matrices
    // and original geometry are unchanged by contact; untouched points stay put.
    p += aOffset * progress;
    float energy = min(.35, length(aOffset) * 2.0);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // Subpixel circular sprites can vanish on a 1x display. Keep a stable
    // pixel footprint; opacity, rather than oversized dots, supplies fine wires.
    float viewDepth = -mvPosition.z * uViewScale;
    gl_PointSize = clamp(uSize * uPixelRatio * 23.0 / max(.6, viewDepth), 1.0, 13.0);
    if (mvPosition.z > -.07) gl_PointSize = 0.0;
    vColor = aColor;
    vEnergy = energy;
    vAlpha = uOpacity * mix(.13, 1.0, progress) * exp(-max(0.0, viewDepth - 24.0) * .022) * smoothstep(.15, 1.5, -mvPosition.z);
  }
`;
export const fragmentShader = /* glsl */`
  uniform float uPalette;
  varying vec3 vColor;
  varying float vEnergy;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - vec2(.5));
    if (r > .5) discard;
    float alpha = (1.0 - smoothstep(.05, .5, r)) * .64 * vAlpha;
    vec3 color = vColor;
    if (uPalette > .5 && uPalette < 1.5) color = vec3(.67, .49, .27);
    if (uPalette > 1.5) color = vec3(.55, .74, .88);
    color = mix(color, vec3(.8, .9, 1.0), min(.65, vEnergy * .4));
    gl_FragColor = vec4(color * (1.15 + vEnergy), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
