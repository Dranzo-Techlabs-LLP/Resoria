// The waterfall, flowing: a cinemagraph over the still photo. Only the falls
// and the spray at their foot are drawn; everything else is left transparent,
// so the real <img> shows through untouched.
//
// The flow map (public/images/*-flow.png, made by brand/make_flow_map.py) says
// where the water is (R), where the spray rises (G) and where across the falls
// each pixel is (B: distance from the centre line, 0.5 = on it, 1 = 32px right),
// so the strands follow the curve of the falls.
//
// Three layers, back to front:
// 1. The photo's own water, carried down with the flow-map technique (two
//    copies slide downhill half a cycle apart and crossfade, so the loop never
//    shows) and blurred along the fall, as a camera sees falling water.
// 2. Strands: fine threads of water drawn at screen resolution, so the falls
//    stay crisp however large the photo is shown. They fall under gravity:
//    slow at the lip, faster lower down, stretching as they go. They waver,
//    and darker gaps open between them where the rock shows through.
// 3. Spray: mist billowing up where the water lands, with droplets catching
//    the light, and a faint veil drifting across the whole fall.
//
// Distances are in the photo's own pixels, so the motion looks the same in a
// crop of the picture as in the whole of it.

export const waterVertex = /* glsl */ `#version 300 es
void main() {
  // one triangle that covers the canvas
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const waterFragment = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uPhoto;
uniform sampler2D uFlow;
uniform vec2 uRes;   // canvas size in pixels
uniform vec4 uRect;  // the photo's box on the canvas in pixels: left, top, width, height (y down)
uniform vec2 uSize;  // the photo's own size in pixels
uniform float uLip;  // where the water goes over the edge, in photo pixels from the top
uniform float uTime; // seconds
out vec4 outColor;

const float CYCLE = 0.25;    // seconds for one slide of the photo's water
const float REACH = 5.0;     // how far (photo px) each copy slides in a cycle: short, or its curved edges ghost
const float GRAVITY = 15.0;  // strand speed: photo px per second = GRAVITY * sqrt(drop) (180px/s at 150px down)
const vec3 FOAM = vec3(0.94, 0.95, 0.93);
const vec3 SPRAY = vec3(0.85, 0.88, 0.86);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// The photo along the fall: three taps a few pixels apart (motion blur).
vec3 blurred(vec2 uv, vec2 step) {
  return (texture(uPhoto, uv - step).rgb + texture(uPhoto, uv).rgb + texture(uPhoto, uv + step).rgb) / 3.0;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = (px - uRect.xy) / uRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    outColor = vec4(0.0);
    return;
  }
  vec4 flow = texture(uFlow, uv);
  float water = flow.r;
  float spray = flow.g;
  if (water + spray < 0.004) {
    outColor = vec4(0.0);
    return;
  }

  vec2 P = uv * uSize;                                  // photo pixels
  vec2 dir = vec2(0.0, 1.0);                            // downhill
  float across = (flow.b - 0.5) * 64.0;                 // photo px from the centre line
  float drop = max(P.y - uLip, 0.0);                    // how far the water has fallen
  vec2 toUv = 1.0 / uSize;

  // 1. The photo's water, sliding down and blurred along the fall.
  float jitter = noise(vec2(across * 0.2, drop * 0.01)) * 0.8;
  float phaseA = fract(uTime / CYCLE + jitter);
  float phaseB = fract(uTime / CYCLE + jitter + 0.5);
  vec2 blur = dir * toUv * (2.0 + min(drop, 160.0) * 0.03); // longer blur where it falls faster
  vec3 a = blurred(uv - dir * toUv * phaseA * REACH, blur);
  vec3 b = blurred(uv - dir * toUv * phaseB * REACH, blur);
  vec3 col = mix(a, b, abs(1.0 - 2.0 * phaseA));
  float body = smoothstep(0.28, 0.6, luma(texture(uPhoto, uv).rgb)); // how much water the photo shows here

  // 2. Strands under gravity. In "fall time" g = 2 sqrt(drop), water moves at
  // a steady pace; back in pixels that is slow at the lip and quick below,
  // and the strands stretch as they speed up.
  // Each strand is many times longer than it is wide: about 1-3px across and,
  // in pixels, 12px long near the lip growing to 40px lower down.
  float g = 2.0 * sqrt(drop + 2.0);
  float fall = uTime * GRAVITY;
  // the strands sway a little: a slow side-to-side drift travelling down with the water
  float sway = (noise(vec2(across * 0.04, (g - fall) * 0.05)) - 0.5) * 1.6;
  float x = across + sway;
  float s1 = noise(vec2(x * 0.35, (g - fall) * 0.25));
  float s2 = noise(vec2(x * 0.7 + 3.1, (g - fall * 1.12) * 0.4));
  float s3 = noise(vec2(x * 1.2 + 8.7, (g - fall * 1.25) * 0.6));
  float strands = s1 * 0.5 + s2 * 0.3 + s3 * 0.2;
  // bright threads of foam, and the darker gaps between them
  float foam = smoothstep(0.55, 0.85, strands);
  float gap = smoothstep(0.4, 0.2, strands);
  float core = water * mix(0.35, 1.0, body);
  col = mix(col, FOAM, foam * 0.46 * core);
  col *= 1.0 - gap * 0.1 * core;
  // the lip: water pours over the edge as a smooth sheet before it breaks up
  float sheet = smoothstep(14.0, 0.0, drop) * water;
  col = mix(col, texture(uPhoto, uv).rgb, sheet * 0.6);

  // 3. Spray: billowing up and out where the water lands (in photo pixels,
  // rising), with droplets twinkling in it, and a faint veil over the fall.
  vec2 rise = vec2(P.x * 0.09 + sin(uTime * 0.3) * 0.5, P.y * 0.1 + uTime * 0.8);
  float cloud = fbm(rise) * 0.65 + fbm(rise * 2.3 - vec2(0.0, uTime * 0.6)) * 0.35;
  float mist = spray * smoothstep(0.42, 0.8, cloud) * 0.32;
  vec2 cell = floor(vec2(P.x * 0.5, P.y * 0.5 - uTime * 6.0));
  float drop1 = step(0.995, hash(cell)) * (0.5 + 0.5 * sin(uTime * 9.0 + hash(cell + 3.7) * 30.0));
  float sparkle = spray * drop1 * 0.3;
  float veil = (fbm(vec2(P.x * 0.03 - uTime * 0.12, P.y * 0.02)) - 0.5) * 0.12 * water;

  // premultiplied: water, then the spray and droplets over it
  col = clamp(col + veil, 0.0, 1.0);
  vec3 rgb = col * water;
  float alpha = water;
  float over = clamp(mist + sparkle, 0.0, 1.0);
  rgb = rgb * (1.0 - over) + SPRAY * mist + FOAM * sparkle;
  alpha = alpha * (1.0 - over) + over;
  outColor = vec4(rgb, alpha);
}
`;
