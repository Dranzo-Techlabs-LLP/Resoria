"use client";

// Sets the waterfall in a photo flowing (waterShader.ts). Place it right after
// the <img> it animates, in the same parent: it lies exactly over the picture,
// follows the transforms the scroll effects put on it, and draws only the water
// and the spray, so the rest of the photo is the real image underneath.
//
// - Draws only while on screen, and only the box around the falls.
// - Reduced motion, or no WebGL2: renders nothing; the still photo stays.
import { useEffect, useRef, useState } from "react";
import { waterFragment, waterVertex } from "./waterShader";

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Shader did not compile");
  }
  return shader;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function whenLoaded(img: HTMLImageElement): Promise<HTMLImageElement> {
  if (img.complete && img.naturalWidth) return Promise.resolve(img);
  return new Promise((resolve, reject) => {
    img.addEventListener("load", () => resolve(img), { once: true });
    img.addEventListener("error", reject, { once: true });
  });
}

/** The part of the photo (0..1, y down) where the flow map has anything (the only part worth
 *  drawing), and the top of the water itself: the lip, where it goes over the edge. */
function flowBounds(map: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = map.naturalWidth;
  c.height = map.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { x0: 0, y0: 0, x1: 1, y1: 1, lip: 0 };
  ctx.drawImage(map, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = 0, y1 = 0, lip = height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] > 8 && y < lip) lip = y;
      if (data[i] > 1 || data[i + 1] > 1) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0) return { x0: 0, y0: 0, x1: 0, y1: 0, lip: 0 };
  return { x0: x0 / width, y0: y0 / height, x1: (x1 + 1) / width, y1: (y1 + 1) / height, lip: lip / height };
}

/** "60% 45%" -> [0.6, 0.45]; keywords and anything else fall back to the centre. */
function objectPosition(img: HTMLImageElement): [number, number] {
  const parts = getComputedStyle(img).objectPosition.split(" ");
  const pct = (s: string | undefined) => (s && s.endsWith("%") ? parseFloat(s) / 100 : 0.5);
  return [pct(parts[0]), pct(parts[1])];
}

export default function FlowingWater({ flow }: { flow: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const sync = () => setEnabled(motion.matches);
    sync();
    motion.addEventListener("change", sync);
    return () => motion.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const photoEl = canvas?.parentElement?.querySelector("img");
    const gl = canvas?.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!canvas || !photoEl || !gl) return;

    let program: WebGLProgram;
    try {
      program = gl.createProgram() as WebGLProgram;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, waterVertex));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, waterFragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Link failed");
    } catch (error) {
      console.warn("Waterfall left still:", error);
      return;
    }
    gl.useProgram(program);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const u = {
      res: gl.getUniformLocation(program, "uRes"),
      rect: gl.getUniformLocation(program, "uRect"),
      size: gl.getUniformLocation(program, "uSize"),
      lip: gl.getUniformLocation(program, "uLip"),
      time: gl.getUniformLocation(program, "uTime"),
    };
    gl.uniform1i(gl.getUniformLocation(program, "uPhoto"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uFlow"), 1);
    gl.enable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);

    const textures: WebGLTexture[] = [];
    const upload = (unit: number, source: HTMLImageElement) => {
      const t = gl.createTexture() as WebGLTexture;
      textures.push(t);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    };

    let raf = 0;
    let disposed = false;
    let visible = false;
    let ready = false;
    let bounds = { x0: 0, y0: 0, x1: 1, y1: 1, lip: 0 };
    let pos: [number, number] = [0.5, 0.5];
    let start = 0;
    let lastTransform = "";
    let lastOrigin = "";

    // Lie exactly over the photo, transforms included (the scroll effects move it).
    const follow = () => {
      const box = `${photoEl.offsetLeft}px,${photoEl.offsetTop}px,${photoEl.offsetWidth}px,${photoEl.offsetHeight}px`;
      if (canvas.dataset.box !== box) {
        canvas.dataset.box = box;
        canvas.style.left = `${photoEl.offsetLeft}px`;
        canvas.style.top = `${photoEl.offsetTop}px`;
        canvas.style.width = `${photoEl.offsetWidth}px`;
        canvas.style.height = `${photoEl.offsetHeight}px`;
        pos = objectPosition(photoEl);
      }
      if (photoEl.style.transform !== lastTransform) {
        lastTransform = photoEl.style.transform;
        canvas.style.transform = lastTransform;
      }
      if (photoEl.style.transformOrigin !== lastOrigin) {
        lastOrigin = photoEl.style.transformOrigin;
        canvas.style.transformOrigin = lastOrigin;
      }
    };

    const draw = (now: number) => {
      follow();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = photoEl.offsetWidth;
      const cssH = photoEl.offsetHeight;
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      // the photo's box on the canvas, as object-fit: cover places it
      const iw = photoEl.naturalWidth;
      const ih = photoEl.naturalHeight;
      const s = Math.max(w / iw, h / ih);
      const rw = iw * s;
      const rh = ih * s;
      const rx = (w - rw) * pos[0];
      const ry = (h - rh) * pos[1];
      gl.viewport(0, 0, w, h);
      // only the box around the falls (y up for the scissor), plus a margin for the waver
      const sx = Math.floor(rx + bounds.x0 * rw) - 2;
      const sy = Math.floor(ry + bounds.y0 * rh) - 2;
      const sw = Math.ceil((bounds.x1 - bounds.x0) * rw) + 4;
      const sh = Math.ceil((bounds.y1 - bounds.y0) * rh) + 4;
      gl.scissor(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.scissor(Math.max(0, sx), Math.max(0, h - (sy + sh)), Math.max(0, sw), Math.max(0, sh));
      gl.uniform2f(u.res, w, h);
      gl.uniform4f(u.rect, rx, ry, rw, rh);
      gl.uniform2f(u.size, iw, ih);
      gl.uniform1f(u.lip, bounds.lip * ih);
      gl.uniform1f(u.time, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = (now: number) => {
      if (disposed || !visible || !ready) return;
      draw(now);
      raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      cancelAnimationFrame(raf);
      if (visible && ready && !disposed) raf = requestAnimationFrame(frame);
    };

    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      wake();
    });
    seen.observe(canvas.parentElement as Element);

    Promise.all([whenLoaded(photoEl), loadImage(flow)])
      .then(([photo, map]) => {
        if (disposed) return;
        bounds = flowBounds(map);
        upload(0, photo);
        upload(1, map);
        start = performance.now();
        ready = true;
        canvas.classList.add("is-flowing");
        wake();
      })
      .catch((error) => console.warn("Waterfall left still:", error));

    const lost = (e: Event) => {
      e.preventDefault();
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.classList.remove("is-flowing");
    };
    canvas.addEventListener("webglcontextlost", lost);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      seen.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.classList.remove("is-flowing");
      for (const t of textures) gl.deleteTexture(t);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    };
  }, [enabled, flow]);

  if (!enabled) return null;
  return <canvas ref={canvasRef} className="water-flow" aria-hidden="true" />;
}
