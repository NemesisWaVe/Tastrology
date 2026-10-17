/**
 * The mirror: one full-screen shader over two real sources.
 *  - sky: the ESO/S. Brunier Milky Way panorama (a crop around Scorpius and the galactic centre)
 *  - drop: real slow-motion footage of a drop hitting water, used only as a height map
 * Above the horizon you see the sky. Below it you see the same sky mirrored, bent by the drop's real ripples
 * and by the visitor's own touches. The "look up" just slides the horizon off the bottom.
 */

export type SkyView = { cx: number; vTop: number; ww: number; wh: number; hz: number };
export type Touch = { x: number; y: number; t: number; amp: number; name?: string; user?: boolean };

export const SKY_AR = 1500 / 1167; // sky.webp width / height

/** Screen point -> sky texture uv for a given view (shared with the star overlay). */
export function skyUV(v: SkyView, x: number, y: number, w: number, h: number): [number, number] {
  return [v.cx + (x / w - 0.5) * v.ww, v.vTop + (y / h) * v.wh];
}
/** Sky uv -> screen point (inverse of skyUV). */
export function skyToScreen(v: SkyView, u: number, t: number, w: number, h: number): [number, number] {
  return [((u - v.cx) / v.ww + 0.5) * w, ((t - v.vTop) / v.wh) * h];
}

const VS = `attribute vec2 p;varying vec2 q;void main(){q=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;

const FS = `precision highp float;
varying vec2 q;
uniform sampler2D sky, drop;
uniform vec2 res;           // css px
uniform vec4 view;          // cx, vTop, ww, wh
uniform float hz, t, fade, vid, dropAmt;
uniform vec4 touch[6];      // x, y (css px), age (s; <0 = off), strength
uniform vec3 imp;           // the drop's impact: x, y (css px), age (s; <0 = not yet)

vec3 skyAt(vec2 s){
  vec2 uv = vec2(view.x + (s.x / res.x - .5) * view.z, view.y + (s.y / res.y) * view.w);
  vec3 c = texture2D(sky, clamp(uv, vec2(.001), vec2(.999))).rgb;
  // fade the texture's own edge into black instead of clamping streaks
  float e = smoothstep(0., .04, uv.y) * smoothstep(1., .96, uv.y) * smoothstep(0., .03, uv.x) * smoothstep(1., .97, uv.x);
  return c * e;
}
float lum(vec2 uv){ return dot(texture2D(drop, uv).rgb, vec3(.333)); }

void main(){
  vec2 s = vec2(q.x, 1. - q.y) * res;      // css px, y down
  float H = hz * res.y;
  vec3 col;
  if (s.y < H) {
    col = skyAt(s);
    col += vec3(.10, .12, .20) * exp(-(H - s.y) / (res.y * .05)) * step(0., 1.2 - hz); // horizon airglow
  } else {
    float d = s.y - H, wh = max(1., res.y - H);
    // the drop footage lies on the water in perspective: a flattened footprint centred in front of us,
    // narrowing with distance, soft at its edges so the clip's own frame never shows
    float d0 = wh * .42;
    float footW = res.x < 768. ? res.x * 1.15 : res.x * .62;
    float footH = footW * .5625 * .8;
    vec2 vu = vec2(.5 + (s.x - res.x * .5) / (footW * pow(max(d, 1.) / d0, .65)), .5 + (d - d0) / footH);
    float fm = smoothstep(.12, .32, vu.x) * smoothstep(.88, .68, vu.x) * smoothstep(.08, .26, vu.y) * smoothstep(.92, .74, vu.y);
    vec2 e = vec2(5. / 1280., 5. / 720.);
    vec2 n = vec2(lum(vu + vec2(e.x, 0.)) - lum(vu - vec2(e.x, 0.)), lum(vu + vec2(0., e.y)) - lum(vu - vec2(0., e.y)));
    float hi = smoothstep(.55, 1., lum(vu)) * vid * dropAmt * fm * .45;
    vec2 off = n * vec2(90., 45.) * vid * dropAmt * fm;
    // touches: expanding rings that bend the reflection
    for (int i = 0; i < 6; i++) {
      vec4 k = touch[i];
      if (k.z < 0.) continue;
      vec2 r = s - k.xy; r.y *= 2.6;             // flattened by perspective
      float dist = length(r), front = k.z * 260.;
      float env = exp(-k.z * 1.3) * smoothstep(front + 40., front, dist) * smoothstep(0., 30., dist);
      float wv = sin((dist - front) * .09) * env;
      off += normalize(r + .001) * wv * 10. * k.w;
      hi += max(0., wv) * .12 * k.w;
    }
    // the impact: a train of wavefronts spreading from where the drop lands
    if (imp.z >= 0.) {
      vec2 r = s - imp.xy; r.y *= 3.2;
      float dist = length(r);
      for (int j = 0; j < 4; j++) {
        float age = imp.z - float(j) * .32;
        if (age < 0.) continue;
        float front = age * 210.;
        float env = exp(-age * .55) * smoothstep(front + 70., front, dist) * smoothstep(front - 220., front - 60., dist);
        float wv = sin((dist - front) * .075) * env * (1. - float(j) * .2);
        off += normalize(r + .001) * wv * 16.;
        hi += max(0., wv) * .1;
      }
    }
    off += vec2(sin(s.y * .08 + t * 1.3), 0.) * 1.2 * (1. - smoothstep(0., wh, d)) ; // faint swell near the horizon
    vec2 m = vec2(s.x, H - d * .92) + off;      // mirror, slightly compressed
    col = skyAt(m) * (.58 + .3 * exp(-d / (res.y * .12)));   // fresnel: brighter towards the horizon
    col = mix(col, col * vec3(.82, .92, 1.05), .5);
    col += vec3(.75, .85, 1.) * hi * .55;
    col += vec3(.06, .08, .12) * exp(-d / (res.y * .02)) * step(0., 1.2 - hz);   // the waterline
  }
  float v = 1. - .55 * pow(length((q - .5) * vec2(1., .9)), 2.2);
  gl_FragColor = vec4(col * v * fade, 1.);
}`;

export type Mirror = {
  resize: (w: number, h: number, dpr: number) => void;
  draw: (o: { view: SkyView; t: number; fade: number; dropAmt: number; touches: Touch[]; now: number; impact: number }) => void;
  ready: () => boolean;
  dispose: () => void;
};

export function createMirror(canvas: HTMLCanvasElement, skySrc: string, video: HTMLVideoElement): Mirror | null {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const x = gl.createShader(type)!;
    gl.shaderSource(x, src);
    gl.compileShader(x);
    return x;
  };
  const pr = gl.createProgram()!;
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
    console.warn("intro shader:", gl.getProgramInfoLog(pr));
    return null;
  }
  gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n: string) => gl.getUniformLocation(pr, n);
  const u = { sky: U("sky"), drop: U("drop"), res: U("res"), view: U("view"), hz: U("hz"), t: U("t"), fade: U("fade"), vid: U("vid"), dropAmt: U("dropAmt"), touch: U("touch"), imp: U("imp") };

  const tex = (unit: number) => {
    const x = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, x);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));
    return x;
  };
  const tSky = tex(0), tDrop = tex(1);
  gl.uniform1i(u.sky, 0);
  gl.uniform1i(u.drop, 1);

  let skyOk = false;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tSky);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    skyOk = true;
  };
  img.src = skySrc;

  let w = 1, h = 1;
  const touchBuf = new Float32Array(24);
  let lastVT = -1, hasVid = 0;
  return {
    ready: () => skyOk,
    resize(cw, ch, dpr) {
      w = cw;
      h = ch;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    draw({ view, t, fade, dropAmt, touches, now, impact }) {
      // upload a video frame only when the clip has actually moved on (uploads are the expensive part on phones)
      if (video.readyState >= 2 && video.currentTime !== lastVT) {
        lastVT = video.currentTime;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tDrop);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
          hasVid = 1;
        } catch {
          hasVid = 0;
        }
      }
      const vid = hasVid;
      for (let i = 0; i < 6; i++) {
        const k = touches[i];
        touchBuf[i * 4] = k ? k.x : 0;
        touchBuf[i * 4 + 1] = k ? k.y : 0;
        touchBuf[i * 4 + 2] = k ? now - k.t : -1;
        touchBuf[i * 4 + 3] = k ? k.amp : 0;
      }
      gl.uniform2f(u.res, w, h);
      gl.uniform4f(u.view, view.cx, view.vTop, view.ww, view.wh);
      gl.uniform1f(u.hz, view.hz);
      gl.uniform1f(u.t, t);
      gl.uniform1f(u.fade, skyOk ? fade : 0);
      gl.uniform1f(u.vid, vid);
      gl.uniform1f(u.dropAmt, dropAmt);
      gl.uniform4fv(u.touch, touchBuf);
      const H = view.hz * h;
      gl.uniform3f(u.imp, w / 2, H + Math.max(1, h - H) * 0.42, impact);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
