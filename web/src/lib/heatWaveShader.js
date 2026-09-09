// Shader coefficients and default wave shape from the accepted standalone demo/index.html.
export const HEAT_DURATION = 0.85;
export const MAP_RANGE = 0.12;

export const HEAT_WAVE_VERTEX = `#version 300 es
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }
`;

export const HEAT_WAVE_FRAGMENT = `#version 300 es
  precision highp float;
  uniform vec2 u_resolution;
  uniform vec2 u_aspect;
  uniform float u_radius;
  uniform float u_time;
  uniform float u_amount;
  uniform float u_distortion;
  uniform float u_thickness;
  uniform float u_splash;
  uniform vec4 u_ripples[4];
  uniform int u_ripple_count;
  uniform int u_pass;
  out vec4 outColor;

  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    vec4 k = vec4(dot(i, vec2(127.1, 311.7)), dot(i + vec2(1, 0), vec2(127.1, 311.7)),
      dot(i + vec2(0, 1), vec2(127.1, 311.7)), dot(i + vec2(1, 1), vec2(127.1, 311.7)));
    vec4 h = fract(sin(k) * 43758.5453);
    return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
  }
  vec3 spectrum(float phase) {
    float x = fract(phase) * 6.0;
    vec3 a, b;
    if (x < 1.0) { a = vec3(1.0, 0.08, 0.52); b = vec3(0.77, 0.14, 1.0); }
    else if (x < 2.0) { a = vec3(0.77, 0.14, 1.0); b = vec3(0.10, 0.30, 1.0); }
    else if (x < 3.0) { a = vec3(0.10, 0.30, 1.0); b = vec3(0.12, 0.86, 1.0); }
    else if (x < 4.0) { a = vec3(0.12, 0.86, 1.0); b = vec3(1.0, 0.79, 0.47); }
    else if (x < 5.0) { a = vec3(1.0, 0.79, 0.47); b = vec3(1.0, 0.28, 0.25); }
    else { a = vec3(1.0, 0.28, 0.25); b = vec3(1.0, 0.08, 0.52); }
    return mix(a, b, smoothstep(0.0, 1.0, fract(x)));
  }

  float gaussian(float x) { return exp(-x * x); }
  vec4 heatWave(vec2 uv, vec4 ripple) {
    float phase = clamp(ripple.z * ripple.w / ${HEAT_DURATION.toFixed(2)}, 0.0, 1.0);
    if (phase <= 0.0 || phase >= 1.0) return vec4(0.0);
    vec2 delta = (uv - ripple.xy) * u_aspect;
    float distance = length(delta);
    float reach = length(max(ripple.xy, 1.0 - ripple.xy) * u_aspect);
    float band = 0.34 * u_thickness;
    float travel = 1.0 - pow(1.0 - phase, 1.2);
    float radius = mix(-0.55 * band, reach + 2.0 * band, travel);
    float front = (distance - radius) / band;
    float fade = smoothstep(0.0, 0.065, ripple.z * ripple.w)
      * (1.0 - smoothstep(0.60, 1.0, phase));
    // One broad compression/release; the continuous direction field avoids tearing.
    vec2 direction = delta / sqrt(dot(delta, delta) + band * band * 0.09);
    vec2 bend = direction * (-front * gaussian(front)) * 0.024 * fade;
    float light = (0.66 * gaussian(front) + 0.28 * gaussian((front + 0.75) / 1.6)) * fade;
    return vec4(bend, light, front);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 displacement = vec2(0.0);
    vec3 radiance = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      if (i >= u_ripple_count) break;
      vec4 wave = heatWave(uv, u_ripples[i]);
      displacement += wave.xy;
      if (u_pass == 2) {
        vec3 color = spectrum(0.06 - wave.w * 0.13 + uv.y * 0.035);
        radiance += color * wave.z;
      }
    }
    if (u_pass == 1) {
      // Byte 128 is neutral; the narrow encoding range preserves gentle displacement.
      vec2 offset = displacement * vec2(1.0, -1.0) * u_distortion;
      outColor = vec4(clamp(vec2(128.0 / 255.0) + offset / ${MAP_RANGE.toFixed(2)}, 0.0, 1.0), 0.0, 1.0);
      return;
    }
    if (u_pass == 2) {
      // Screen-blended black is neutral; colored emission preserves bright text.
      outColor = vec4(clamp(radiance * u_splash * 1.10, 0.0, 0.94) * u_amount, 1.0);
      return;
    }
    vec2 p = (uv - 0.5) * u_aspect;
    vec2 halfSize = u_aspect * 0.5;
    vec2 q = abs(p) - halfSize + u_radius;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_radius;
    float d = max(-sd, 0.0);
    vec2 corner = max(q, 0.0);
    vec2 normal = length(corner) > 0.0001 ? normalize(corner) * sign(p)
      : (q.x > q.y ? vec2(sign(p.x), 0.0) : vec2(0.0, sign(p.y)));
    vec2 boundary = uv + normal * d / u_aspect;
    float impact = 0.0;
    if (d < 0.42) {
      for (int i = 0; i < 4; i++) {
        if (i >= u_ripple_count) break;
        // Each edge responds when the shared wave reaches it.
        impact += heatWave(boundary, u_ripples[i]).z * 0.65;
      }
    }
    impact = min(impact * u_splash, 1.5) * (1.0 - smoothstep(0.20, 0.42, d));
    float perimeter = atan(p.y / halfSize.y, p.x / halfSize.x) / 6.2831853 + 0.5;
    float wander = noise(p * 3.1 + vec2(u_time * 0.29, -u_time * 0.23));
    float breathing = smoothstep(0.05, 0.95,
      0.5 + 0.5 * sin(perimeter * 18.85 - u_time * 2.35 + wander * 3.0));
    float accent = pow(0.5 + 0.5 * sin(perimeter * 6.2831853 + u_time * 1.8), 3.0);
    float lift = impact * (0.075 + 0.070 * noise(boundary * u_aspect * 8.0 + u_time * 0.7));
    d = max(d - dot(displacement, normal) * u_splash, 0.0);
    float width = 0.004 + 0.026 * breathing + 0.010 * accent + 0.004 * wander + lift * 0.36;
    vec3 edgeColor = spectrum(perimeter + u_time * 0.065 + wander * 0.18
      + 0.035 * sin(perimeter * 12.5663706 + u_time * 1.4) - d * impact * 1.5);
    edgeColor *= 0.72 + 0.28 * breathing;
    float core = 1.0 - smoothstep(width * 0.20, width * 1.20, d);
    float glow = exp(-d / (width * 3.8 + 0.004 + lift * 0.45));
    float hairline = gaussian((d - 0.0025) / 0.004);
    float splash = gaussian((d - lift * 0.80) / (0.012 + impact * 0.024)) * impact * 0.32;
    float alpha = clamp(core * 0.84 + glow * 0.36 + hairline * 0.14 + splash, 0.0, 0.97) * u_amount;
    outColor = vec4(edgeColor * alpha, alpha);
  }
`;
