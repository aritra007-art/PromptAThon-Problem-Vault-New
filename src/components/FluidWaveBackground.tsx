import React, { useEffect, useRef } from 'react';

interface FluidWaveBackgroundProps {
  className?: string;
  intensity?: number;
  speed?: number;
}

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_motion_scale;
uniform float u_intensity;

varying vec2 v_uv;

// Simplex 3D Noise implementation
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857; // 1.0 / 7.0
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;

  // Aspect ratio correction for organic isotropic waves
  float aspect = u_resolution.x / u_resolution.y;
  vec2 aspectUv = vec2(uv.x * aspect, uv.y);

  // Slow, cinematic 12-18s cycle
  float t = u_time * 0.08 * u_motion_scale;

  // Deep midnight navy base background (slate-950 inspired)
  vec3 color = mix(
    vec3(0.007, 0.012, 0.024), // deep slate-950 black at top
    vec3(0.012, 0.022, 0.048), // midnight navy mid
    smoothstep(0.9, 0.1, uv.y)
  );

  // Palette definition
  vec3 colIndigo = vec3(0.14, 0.08, 0.36);   // Deep glowing indigo
  vec3 colViolet = vec3(0.42, 0.14, 0.82);   // Violet luminous edge
  vec3 colBlue   = vec3(0.02, 0.38, 0.95);   // Electric blue
  vec3 colCyan   = vec3(0.04, 0.88, 0.98);   // Vibrant electric cyan
  vec3 colCrest  = vec3(0.72, 0.95, 1.0);    // Specular highlight

  // Wave 1: Distant background fluid mass (indigo / deep violet glow)
  float n1 = snoise(vec3(aspectUv.x * 0.9 + t * 0.35, uv.y * 1.2, t * 0.22));
  float wave1Y = 0.44 + 0.13 * sin(uv.x * 2.8 + t * 0.8) + 0.08 * cos(uv.x * 4.6 - t * 0.5) + n1 * 0.11;
  float dist1 = uv.y - wave1Y;
  float body1 = smoothstep(0.22, -0.28, dist1);
  float edge1 = exp(-abs(dist1) * 7.5);
  color += (colIndigo * 0.85 + colViolet * 0.45) * (body1 * 0.45 + edge1 * 0.6) * u_intensity;

  // Wave 2: Mid-depth electric blue body
  float n2 = snoise(vec3(aspectUv.x * 1.4 - t * 0.45, uv.y * 1.8 + t * 0.25, t * 0.38));
  float wave2Y = 0.33 + 0.15 * sin(uv.x * 3.4 - t * 1.05 + 1.8) + 0.07 * sin(uv.x * 5.8 + t * 0.7) + n2 * 0.09;
  float dist2 = uv.y - wave2Y;
  float body2 = smoothstep(0.18, -0.32, dist2);
  float edge2 = exp(-abs(dist2) * 9.0);
  vec3 wave2Col = mix(colBlue, colCyan, 0.5 + 0.5 * sin(t * 1.2 + uv.x * 2.0));
  color += (wave2Col * body2 * 0.55 + colCyan * edge2 * 0.8) * u_intensity;

  // Wave 3: Foreground electric cyan / crest light streaks
  float n3 = snoise(vec3(aspectUv.x * 2.1 + t * 0.6, uv.y * 2.6 - t * 0.3, t * 0.48));
  float wave3Y = 0.22 + 0.16 * sin(uv.x * 2.5 + t * 1.25 + 3.6) + 0.08 * cos(uv.x * 4.2 - t * 0.85) + n3 * 0.08;
  float dist3 = uv.y - wave3Y;
  float body3 = smoothstep(0.12, -0.35, dist3);
  float edge3 = exp(-abs(dist3) * 13.0);
  float specular = exp(-abs(dist3) * 32.0) * (0.65 + 0.35 * sin(uv.x * 12.0 + t * 2.2));
  color += (colBlue * body3 * 0.4 + colCyan * edge3 * 0.95 + colCrest * specular * 0.85) * u_intensity;

  // Wave 4: Low-lying subtle undulating reflection
  float wave4Y = 0.12 + 0.11 * sin(uv.x * 1.9 - t * 0.6 + 0.8) + 0.06 * n1;
  float dist4 = uv.y - wave4Y;
  float body4 = smoothstep(0.1, -0.2, dist4);
  color += (colCyan * 0.25 + colViolet * 0.2) * body4 * u_intensity;

  // Horizontal fluid light streak highlights (holographic sheen)
  float streak = sin(uv.x * 6.0 + uv.y * 4.0 + t * 1.5) * 0.5 + 0.5;
  streak = pow(streak, 6.0) * (1.0 - uv.y) * 0.25;
  color += colCyan * streak * u_intensity;

  // Atmospheric haze and soft bloom in lower half
  float bloom = smoothstep(0.65, 0.05, uv.y) * 0.18;
  color += (colBlue * 0.6 + colIndigo * 0.4) * bloom * u_intensity;

  // Clean upper fade: Keep top 35-40% dark and clear for pristine text contrast
  // Top 35% is strictly faded to pure dark slate
  float topDarkener = smoothstep(0.68, 0.40, uv.y);
  color *= (0.05 + 0.95 * topDarkener);

  // Soft subtle vignette at canvas edges
  float vignette = uv.x * (1.0 - uv.x) * uv.y * (1.0 - uv.y) * 16.0;
  vignette = clamp(pow(vignette, 0.25), 0.0, 1.0);
  color *= (0.7 + 0.3 * vignette);

  gl_FragColor = vec4(color, 1.0);
}
`;

export const FluidWaveBackground: React.FC<FluidWaveBackgroundProps> = ({
  className = '',
  intensity = 1.0,
  speed = 1.0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Detect user preference for reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let motionScale = prefersReducedMotion.matches ? 0.08 : 1.0;

    const handleMotionChange = (e: MediaQueryListEvent) => {
      motionScale = e.matches ? 0.08 : 1.0;
    };
    prefersReducedMotion.addEventListener('change', handleMotionChange);

    // Initialize WebGL context
    const gl =
      canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      }) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) {
      console.warn('[FluidWaveBackground] WebGL not supported, falling back to CSS background.');
      return;
    }

    // Helper: compile shader
    const compileShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('[FluidWaveBackground] Shader error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertShader = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragShader = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    if (!program) return;

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[FluidWaveBackground] Program error:', gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    // Setup full-screen quad geometry
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const aPositionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPositionLoc);
    gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const uResolutionLoc = gl.getUniformLocation(program, 'u_resolution');
    const uTimeLoc = gl.getUniformLocation(program, 'u_time');
    const uMotionScaleLoc = gl.getUniformLocation(program, 'u_motion_scale');
    const uIntensityLoc = gl.getUniformLocation(program, 'u_intensity');

    let animationFrameId: number;
    let startTime = performance.now();
    let width = 0;
    let height = 0;

    // Handle high DPI and resizing
    const updateSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const displayWidth = Math.floor(canvas.clientWidth * dpr);
      const displayHeight = Math.floor(canvas.clientHeight * dpr);

      if (width !== displayWidth || height !== displayHeight) {
        width = displayWidth;
        height = displayHeight;
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, displayWidth, displayHeight);
        gl.uniform2f(uResolutionLoc, displayWidth, displayHeight);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    resizeObserver.observe(canvas);
    updateSize();

    // Render loop
    const render = (now: number) => {
      const elapsedTime = (now - startTime) * 0.001 * speed;

      gl.uniform1f(uTimeLoc, elapsedTime);
      gl.uniform1f(uMotionScaleLoc, motionScale);
      gl.uniform1f(uIntensityLoc, intensity);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    // Proper cleanup on unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      prefersReducedMotion.removeEventListener('change', handleMotionChange);

      if (gl) {
        if (positionBuffer) gl.deleteBuffer(positionBuffer);
        if (vertShader) gl.deleteShader(vertShader);
        if (fragShader) gl.deleteShader(fragShader);
        if (program) gl.deleteProgram(program);
      }
    };
  }, [intensity, speed]);

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden select-none ${className}`}
      aria-hidden="true"
      style={{ zIndex: 0 }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};
