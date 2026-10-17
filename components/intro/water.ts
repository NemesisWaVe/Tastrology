/**
 * Raw-WebGL pond: one full-screen quad, one fragment shader. Dark water reflecting a procedural
 * starfield and two galaxy smears; ring sources perturb the normals; `pitch` tilts the camera up.
 * The camera math matches scene.ts (camera at height 1, looking down +z, pitched by `pitch`).
 */

export const MAX_RINGS = 8;

export type WaterUniforms = {
  t: number;
  pitch: number;
  tanH: number; // tan(vertical fov / 2)
  fade: number; // cold-open fade from black
  calm: number; // 0 rippling .. 1 glassy
  gal: number; // galaxy bloom 0..1
  look: number; // 0 reflection .. 1 looking up (sky gets sharper/brighter)
  rings: Float32Array; // MAX_RINGS * (x, z, radius, amp)
  g1: [number, number]; // galaxy centres (az, el) in radians
  g2: [number, number];
};

export type Water = {
  resize: (w: number, h: number) => void;
  draw: (u: WaterUniforms) => void;
  dispose: () => void;
};

const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;uniform float uT,uPitch,uTan,uFade,uCalm,uGal,uLook;
uniform vec4 uR[${MAX_RINGS}];uniform vec2 uG1,uG2;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+1.),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*n2(p);p*=2.03;a*=.5;}return s;}
vec3 sky(vec3 d,float sharp,float boost){
  float el=asin(clamp(d.y,0.,1.));float az=atan(d.x,d.z);
  vec3 col=mix(vec3(.012,.014,.03),vec3(.12,.1,.21),exp(-el*7.))+vec3(.03,.06,.06)*exp(-el*22.);
  vec2 q=vec2(az*cos(el),el)*70.;vec2 c=floor(q),f=fract(q)-.5;float h=h21(c);
  vec2 o=vec2(h21(c+7.1),h21(c+3.3))-.5;float dd=length(f-o*.6);
  float st=step(.9,h)*pow(max(0.,1.-dd*sharp),3.)*(.25+.75*fract(h*37.));
  st*=.65+.35*sin(uT*(1.3+h*3.)+h*40.);
  col+=vec3(.85,.88,1.)*st*boost;
  vec2 s=vec2(az,el);
  vec2 a=s-uG1;a=mat2(.8,-.6,.6,.8)*a;float g1=exp(-a.y*a.y*60.-a.x*a.x*4.);
  vec2 b=s-uG2;b=mat2(.6,.8,-.8,.6)*b;float g2=exp(-b.y*b.y*45.-b.x*b.x*5.);
  float n=fbm(s*7.+vec2(uT*.01,0.));
  col+=(vec3(.776,1.,.239)*g1+vec3(.847,.49,1.)*g2)*(.2+.8*n*n)*uGal*.5;
  return col;
}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;float asp=uRes.x/uRes.y;
  vec2 q=(uv*2.-1.)*vec2(asp,1.)*uTan;
  float cp=cos(uPitch),sp=sin(uPitch);
  vec3 d=normalize(vec3(q.x,q.y*cp+sp,-q.y*sp+cp));
  vec3 col;
  if(d.y>0.){
    col=sky(d,mix(3.2,5.5,uLook),mix(.55,1.25,uLook));
  }else{
    float t=1./max(-d.y,1e-3);vec2 P=d.xz*t;
    vec2 sl=vec2(0.);float sum=0.,mx=0.,hi=0.,tr=0.,lm=0.;
    for(int i=0;i<${MAX_RINGS};i++){
      vec4 r=uR[i];if(r.w<=0.)continue;
      vec2 dv=P-r.xy;float dl=length(dv)+1e-4;float x=dl-r.z;
      float env=exp(-x*x*9.);float w=r.w*env;float s=cos(x*30.);
      sl+=dv/dl*sin(x*30.)*w;
      float c=pow(max(s,0.),14.)*w;hi+=c;tr+=max(-s,0.)*w;lm+=c*exp(-r.z*1.4);
      float b=env*r.w;sum+=b;mx=max(mx,b);
    }
    float aa=1./(1.+t*t*.03);
    vec2 amb=vec2(n2(P*.9+uT*.15)-.5,n2(P*1.1-uT*.12+7.)-.5)*.012*(1.-uCalm);
    vec2 g=sl*.22*aa+amb;
    vec3 n=normalize(vec3(-g.x,1.,-g.y));
    vec3 r=reflect(d,n);r.y=abs(r.y);
    float ov=clamp(sum-mx,0.,1.);
    float fr=mix(.4,.95,pow(1.+d.y,5.));
    vec3 wc=mix(vec3(.04,.095,.11),vec3(.022,.03,.075),clamp(-d.y*2.5,0.,1.));
    col=wc*(1.-fr*.45)+sky(r,4.6,1.+ov*4.)*fr;
    col+=vec3(.11,.1,.22)*exp(d.y*22.)*.7;
    col+=mix(vec3(.72,.82,.95),vec3(.776,1.,.239),clamp(lm/(hi+1e-3),0.,1.))*min(hi,1.)*.6*aa;
    col*=1.-clamp(tr*.5*aa,0.,.55);
  }
  gl_FragColor=vec4(col*uFade,1.);
}`;

export function createWater(canvas: HTMLCanvasElement): Water | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" }) as WebGLRenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl!.createShader(type)!;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    return gl!.getShaderParameter(s, gl!.COMPILE_STATUS) ? s : null;
  };
  const vs = sh(gl.VERTEX_SHADER, VS);
  const fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const pr = gl.createProgram()!;
  gl.attachShader(pr, vs);
  gl.attachShader(pr, fs);
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n: string) => gl!.getUniformLocation(pr, n);
  const u = {
    res: U("uRes"), t: U("uT"), pitch: U("uPitch"), tan: U("uTan"), fade: U("uFade"), calm: U("uCalm"),
    gal: U("uGal"), look: U("uLook"), r: U("uR"), g1: U("uG1"), g2: U("uG2"),
  };

  return {
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      gl!.viewport(0, 0, w, h);
      gl!.uniform2f(u.res, w, h);
    },
    draw(v) {
      const g = gl!;
      g.uniform1f(u.t, v.t);
      g.uniform1f(u.pitch, v.pitch);
      g.uniform1f(u.tan, v.tanH);
      g.uniform1f(u.fade, v.fade);
      g.uniform1f(u.calm, v.calm);
      g.uniform1f(u.gal, v.gal);
      g.uniform1f(u.look, v.look);
      g.uniform4fv(u.r, v.rings);
      g.uniform2f(u.g1, v.g1[0], v.g1[1]);
      g.uniform2f(u.g2, v.g2[0], v.g2[1]);
      g.drawArrays(g.TRIANGLES, 0, 3);
    },
    dispose() {
      gl!.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
