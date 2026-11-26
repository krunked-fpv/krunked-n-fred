// ============================================================================
// Krunked & Fred — 480x270 Nearest-Neighbor WebGL2 Pixel Blitter
// Uploads the 480x270 logical offscreen framebuffer to a NEAREST-filtered
// WebGL2 texture with exact 16:9 letterboxing/pillarboxing in #13123a and
// automatic Canvas 2D fallback (imageSmoothingEnabled = false).
// ============================================================================

import { PALETTE, PHYSICS } from '../contracts';

const VERTEX_SHADER_SRC = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  const vec2 pos[4] = vec2[4](
    vec2(-1.0, -1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0,  1.0),
    vec2( 1.0,  1.0)
  );
  const vec2 uv[4] = vec2[4](
    vec2(0.0, 0.0),
    vec2(1.0, 0.0),
    vec2(0.0, 1.0),
    vec2(1.0, 1.0)
  );
  vUv = uv[gl_VertexID];
  gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 outColor;
void main() {
  outColor = texture(uTex, vUv);
}
`;

// #13123a in normalized float RGB
const CLEAR_R = 0x13 / 255;
const CLEAR_G = 0x12 / 255;
const CLEAR_B = 0x3a / 255;

export class WebGL2PixelBlitter {
  readonly logicalWidth = PHYSICS.LOGICAL_WIDTH;
  readonly logicalHeight = PHYSICS.LOGICAL_HEIGHT;

  private readonly offscreen: HTMLCanvasElement;
  private readonly offscreenCtx: CanvasRenderingContext2D;
  private readonly displayCanvas: HTMLCanvasElement;

  private gl: WebGL2RenderingContext | null = null;
  private glProgram: WebGLProgram | null = null;
  private glTexture: WebGLTexture | null = null;
  private glVao: WebGLVertexArrayObject | null = null;
  private fallbackCtx: CanvasRenderingContext2D | null = null;

  private cssWidth = PHYSICS.LOGICAL_WIDTH * 2;
  private cssHeight = PHYSICS.LOGICAL_HEIGHT * 2;
  private vpX = 0;
  private vpY = 0;
  private vpW = PHYSICS.LOGICAL_WIDTH * 2;
  private vpH = PHYSICS.LOGICAL_HEIGHT * 2;
  private disposed = false;

  private readonly handleContextLost = (ev: Event): void => {
    ev.preventDefault();
    this.teardownWebGL();
    this.initFallback2D();
  };

  constructor(container: HTMLElement) {
    // 1. Offscreen 480x270 logical framebuffer (allocated ONCE)
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = this.logicalWidth;
    this.offscreen.height = this.logicalHeight;
    const offCtx = this.offscreen.getContext('2d', { alpha: false });
    if (!offCtx) {
      throw new Error('Could not initialize 480x270 offscreen 2D context');
    }
    offCtx.imageSmoothingEnabled = false;
    this.offscreenCtx = offCtx;

    // 2. Display canvas mounted into container (position absolute so it never inflates flex container)
    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.id = 'game-canvas';
    this.displayCanvas.style.position = 'absolute';
    this.displayCanvas.style.inset = '0';
    this.displayCanvas.style.width = '100%';
    this.displayCanvas.style.height = '100%';
    this.displayCanvas.style.display = 'block';
    this.displayCanvas.style.background = PALETTE.SKY_DEEP;
    this.displayCanvas.style.imageRendering = 'pixelated';
    this.displayCanvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    container.appendChild(this.displayCanvas);

    // 3. Try WebGL2 nearest-neighbor pipeline; gracefully fall back to 2D
    if (!this.initWebGL2()) {
      this.initFallback2D();
    }

    const rect = container.getBoundingClientRect();
    const initialW = rect.width > 0 ? rect.width : window.innerWidth || PHYSICS.LOGICAL_WIDTH * 2;
    const initialH = rect.height > 0 ? rect.height : window.innerHeight || PHYSICS.LOGICAL_HEIGHT * 2;
    this.resize(initialW, initialH);
  }

  getCanvas(): HTMLCanvasElement {
    return this.displayCanvas;
  }

  getFramebufferCanvas(): HTMLCanvasElement {
    return this.offscreen;
  }

  getFramebufferContext(): CanvasRenderingContext2D {
    return this.offscreenCtx;
  }

  isWebGL2(): boolean {
    return this.gl !== null;
  }

  resize(width: number, height: number): void {
    if (this.disposed) return;
    const safeW = Math.max(1, Math.floor(width));
    const safeH = Math.max(1, Math.floor(height));
    const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    const physW = Math.max(1, Math.round(safeW * dpr));
    const physH = Math.max(1, Math.round(safeH * dpr));

    this.cssWidth = safeW;
    this.cssHeight = safeH;
    if (this.displayCanvas.width !== physW || this.displayCanvas.height !== physH) {
      this.displayCanvas.width = physW;
      this.displayCanvas.height = physH;
    }

    // Compute exact 16:9 fitted viewport with integer snap when within ~4% of an integer multiple
    let scale = Math.min(physW / this.logicalWidth, physH / this.logicalHeight);
    const nearestInt = Math.round(scale);
    if (
      nearestInt >= 1 &&
      Math.abs(scale - nearestInt) < 0.04 &&
      nearestInt * this.logicalWidth <= physW &&
      nearestInt * this.logicalHeight <= physH
    ) {
      scale = nearestInt;
    }

    this.vpW = Math.max(1, Math.round(this.logicalWidth * scale));
    this.vpH = Math.max(1, Math.round(this.logicalHeight * scale));
    this.vpX = Math.floor((physW - this.vpW) * 0.5);
    this.vpY = Math.floor((physH - this.vpH) * 0.5);

    if (this.fallbackCtx) {
      this.fallbackCtx.imageSmoothingEnabled = false;
    }
  }

  present(): void {
    if (this.disposed) return;

    if (this.gl && this.glProgram && this.glTexture && this.glVao) {
      const gl = this.gl;
      if (gl.isContextLost()) {
        this.teardownWebGL();
        this.initFallback2D();
      } else {
        gl.bindTexture(gl.TEXTURE_2D, this.glTexture);
        // Zero texture re-allocation: upload directly into pre-allocated 480x270 RGBA storage
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          this.offscreen
        );

        gl.viewport(0, 0, this.displayCanvas.width, this.displayCanvas.height);
        gl.clearColor(CLEAR_R, CLEAR_G, CLEAR_B, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.viewport(this.vpX, this.vpY, this.vpW, this.vpH);
        gl.useProgram(this.glProgram);
        gl.bindVertexArray(this.glVao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return;
      }
    }

    // Seamless Canvas 2D nearest-neighbor fallback
    const ctx = this.fallbackCtx;
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = PALETTE.SKY_DEEP;
    ctx.fillRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
    ctx.drawImage(
      this.offscreen,
      0,
      0,
      this.logicalWidth,
      this.logicalHeight,
      this.vpX,
      this.vpY,
      this.vpW,
      this.vpH
    );
  }

  getCssSize(): { width: number; height: number } {
    return { width: this.cssWidth, height: this.cssHeight };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.displayCanvas.removeEventListener('webglcontextlost', this.handleContextLost, false);
    this.teardownWebGL();
    this.fallbackCtx = null;
    if (this.displayCanvas.parentNode) {
      this.displayCanvas.parentNode.removeChild(this.displayCanvas);
    }
  }

  private initWebGL2(): boolean {
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = this.displayCanvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      });
    } catch {
      return false;
    }
    if (!gl) return false;

    const vs = this.compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return false;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return false;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return false;
    }

    const vao = gl.createVertexArray();
    const tex = gl.createTexture();
    if (!vao || !tex) {
      if (vao) gl.deleteVertexArray(vao);
      if (tex) gl.deleteTexture(tex);
      gl.deleteProgram(program);
      return false;
    }

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Pre-allocate exact 480x270 RGBA texture storage ONCE
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.logicalWidth,
      this.logicalHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );

    gl.useProgram(program);
    const uTex = gl.getUniformLocation(program, 'uTex');
    if (uTex) {
      gl.uniform1i(uTex, 0);
    }

    this.gl = gl;
    this.glProgram = program;
    this.glTexture = tex;
    this.glVao = vao;
    return true;
  }

  private compileShader(
    gl: WebGL2RenderingContext,
    type: number,
    src: string
  ): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private teardownWebGL(): void {
    if (!this.gl) return;
    try {
      if (this.glTexture) this.gl.deleteTexture(this.glTexture);
      if (this.glVao) this.gl.deleteVertexArray(this.glVao);
      if (this.glProgram) this.gl.deleteProgram(this.glProgram);
    } catch {
      // Ignore cleanup errors on lost context
    }
    this.glTexture = null;
    this.glVao = null;
    this.glProgram = null;
    this.gl = null;
  }

  private initFallback2D(): void {
    if (this.fallbackCtx) return;
    try {
      const ctx = this.displayCanvas.getContext('2d', { alpha: false });
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        this.fallbackCtx = ctx;
      }
    } catch {
      this.fallbackCtx = null;
    }
  }
}
