import { HEAT_WAVE_FRAGMENT, HEAT_WAVE_VERTEX } from './heatWaveShader.js';

export function createHeatWaveRenderer(canvas, defaultPass) {
  const gl = canvas.getContext('webgl2', {
    alpha: defaultPass === 0,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: defaultPass === 1,
  });
  if (!gl || gl.isContextLost()) throw new Error('WebGL2 unavailable');
  const shaders = [];
  const ripple = new Float32Array(16);
  let program = null;
  const dispose = () => {
    if (!gl.isContextLost()) {
      if (program) gl.deleteProgram(program);
      // Runs use fresh canvases; release contexts now instead of waiting for GC.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    canvas.width = canvas.height = 1;
  };
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, HEAT_WAVE_VERTEX], [gl.FRAGMENT_SHADER, HEAT_WAVE_FRAGMENT]]) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Unable to create heat-wave shader');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || 'Heat-wave shader compilation failed');
      }
    }
    program = gl.createProgram();
    if (!program) throw new Error('Unable to create heat-wave program');
    for (const shader of shaders) gl.attachShader(program, shader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Heat-wave program link failed');
    }
    const uniforms = {};
    for (const name of ['resolution', 'aspect', 'radius', 'time', 'amount', 'distortion', 'thickness', 'splash', 'ripple_count', 'pass']) {
      uniforms[name] = gl.getUniformLocation(program, `u_${name}`);
    }
    uniforms.ripples = gl.getUniformLocation(program, 'u_ripples[0]');
    return {
      dispose,
      draw(size, state, pass = defaultPass) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(program);
        gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
        gl.uniform2f(uniforms.aspect, size.w / size.short, size.h / size.short);
        gl.uniform1f(uniforms.radius, 0);
        gl.uniform1f(uniforms.time, state.shaderTime);
        gl.uniform1f(uniforms.amount, state.amount);
        gl.uniform1f(uniforms.distortion, state.motion);
        gl.uniform1f(uniforms.thickness, 1);
        gl.uniform1f(uniforms.splash, state.motion);
        ripple.set([0.5, 0.03, Math.max(0, state.waveAge), 1]);
        gl.uniform4fv(uniforms.ripples, ripple);
        gl.uniform1i(uniforms.ripple_count, state.wave ? 1 : 0);
        gl.uniform1i(uniforms.pass, pass);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  } catch (error) {
    dispose();
    throw error;
  } finally {
    if (!gl.isContextLost()) {
      for (const shader of shaders) {
        if (program) gl.detachShader(program, shader);
        gl.deleteShader(shader);
      }
    }
  }
}
