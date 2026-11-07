/**
 * 하늘 — 낮 그라데이션·해·구름 + 밤하늘 하나 (실제 별지도 + 달 하나).
 * 사용자 2026-11-07: 은하수가 이상한 띠·너무 밝다·하늘 화면이 엉키고 달이 둘 → 실제 밤하늘 사진처럼 은은하게, 하늘은 하나만.
 *  · 은하수·먼지 띠·희미한 별빛: NASA SVS Deep Star Maps 2020 (가이아·티코·히파르코스 17억 별) 등장방형 지도를 적경·적위로 읽는다.
 *    밝은 별 6000개는 지도에서 지우고(두 번 그리지 않게) 점으로 따로 그린다 — 화면 픽셀 크기라 어느 시야각·화면에서도 1~3px 로 또렷하다.
 *    지도·별 목록은 tools/sky/build.py 가 굽고, 밤이 처음 올 때 받는다 (낮에만 머무는 방문은 받지 않음).
 *  · 하늘은 서울 위도(37.5°N)에서 시각에 따라 돈다. 계절은 은하수 중심(궁수자리)이 저녁 남쪽 하늘에 서는 늦여름으로 고정 (SKY.LST_OFFSET).
 *  · 달: 화면 공간의 둥근 원반(가장자리 한 픽셀 부드럽게) — 넓은 시야 가장자리에서도 원근으로 길쭉해지지 않게. 가장자리 어두워짐·바다 무늬, 작은 달무리. 하나뿐.
 * 세기는 tools/qa/night.mjs·dusk.mjs 로 재서 맞춘 값.
 */
import * as THREE from 'three';
import { envUniforms } from './materials.js';

export const SKY = {
  LAT: 37.5, // 관측 위도 (°)
  LST_OFFSET: -2.5, // 지방 항성시 = 시각 + 이 값 (h) — 22시에 항성시 19.5h: 은하수 중심이 남남서 낮게, 백조자리가 천정에
  MAP_GAIN: 0.45, // 은하수 지도 밝기 (선형, 노출 전)
  STAR_GAIN: 0.15, // 가장 희미한 점 별의 봉우리 밝기 — 밝은 별은 별빛 양^0.6 배 (지도가 밝은 별을 1.0 에서 잘라 실제 등급 차보다 좁다)
  STAR_MAX: 0.9 // 점 별 봉우리 상한 (블룸 문턱 0.92 아래)
};
const MOON = { R: 0.0096, DISK: 1.0 }; // 달 반지름 (rad, 0.55° — 실제 0.26° 보다 조금 크게: 폰 화면에서도 원반으로 읽히게)
const STAR_F0 = 1.5e-6; // stars.bin 가장 희미한 별빛 양 (sr) 언저리
// J2000 은하 북극·은하 중심 (적경, 적위 °)
const GAL_POLE = [192.85948, 27.12825];

const eq = ([ra, dec]) => {
  const a = THREE.MathUtils.degToRad(ra), d = THREE.MathUtils.degToRad(dec);
  return new THREE.Vector3(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d));
};

/**
 * 천구(J2000: x→0h, y→6h, z→북극) → 세계(+x 동, +y 위, −z 북) 회전. 항성시 lst(h)·위도 lat(°).
 * 시간각 H = 항성시 − 적경 은 서쪽으로 늘어난다: 방향 = cosδ(cosH·Q + sinH·서) + sinδ·P (Q: 자오선 위 천구 적도, P: 천구 북극)
 */
export function celestialToWorld(lst, lat = SKY.LAT, out = new THREE.Matrix3()) {
  const th = (lst / 24) * Math.PI * 2, f = THREE.MathUtils.degToRad(lat);
  const Q = [0, Math.cos(f), Math.sin(f)], Wp = [-1, 0, 0], P = [0, Math.sin(f), -Math.cos(f)];
  const c = Math.cos(th), s = Math.sin(th);
  const ex = Q.map((q, i) => c * q + s * Wp[i]), ey = Q.map((q, i) => s * q - c * Wp[i]);
  return out.set(ex[0], ey[0], P[0], ex[1], ey[1], P[1], ex[2], ey[2], P[2]);
}

export function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    defines: { MOON_R: MOON.R.toFixed(4), MOON_DISK: MOON.DISK.toFixed(3) },
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uSunVis: { value: 1 },
      uMoonDir: { value: new THREE.Vector3(0.3, 0.6, -0.7).normalize() },
      uMoon: { value: 0 }, // 달 보임 (밤 깊이 × 맑음)
      uMoonPx: { value: new THREE.Vector3(0, 0, 1) }, // 달 중심 (그리는 화면 px) · 반지름 px — 하늘 돔 onBeforeRender 가 매 프레임
      uStars: { value: 0 }, // 별·은하수 (밤 깊이 × 맑음)
      uMilky: { value: 1 }, // 은하수 지도 켬 (QA 가 끄고 견준다)
      uMilkyPole: { value: new THREE.Vector3(0, 1, 0) }, // 세계 좌표 은하 북극 (QA 가 띠 자리를 잰다)
      uMilkyMap: { value: null },
      uMapGain: { value: 0 }, // 지도를 받기 전 0
      uWorldToCel: { value: new THREE.Matrix3() },
      uCloud: { value: new THREE.Color() },
      uCloudAmt: { value: 0.5 },
      uTime: envUniforms.uTime
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
        vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 uTop, uHorizon, uBottom, uSunColor, uCloud;
      uniform vec3 uSunDir, uMoonDir;
      uniform float uSunVis, uStars, uMoon, uCloudAmt, uTime, uMilky, uMapGain;
      uniform vec3 uMoonPx;
      uniform sampler2D uMilkyMap;
      uniform mat3 uWorldToCel;
      varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        float a = hash(vec3(i, 1.0)), b = hash(vec3(i + vec2(1, 0), 1.0)), c = hash(vec3(i + vec2(0, 1), 1.0)), d = hash(vec3(i + vec2(1, 1), 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // 별지도 좌표: 적경·적위 → 등장방형 (가운데 0h, 왼쪽으로 늘어남, 위가 +90°)
        vec3 cel = uWorldToCel * d;
        vec2 uv = vec2(0.5 - atan(cel.y, cel.x) / 6.2831853, 0.5 + asin(clamp(cel.z, -1.0, 1.0)) / 3.1415927);
        // 적경 0/24h 이음매에서 미분이 튀어 가장 작은 밉맵을 골라 선이 보이지 않게: 반 바퀴 돌린 좌표의 미분이 작으면 그것을 쓴다
        vec2 gx = dFdx(uv), gy = dFdy(uv);
        float u2 = fract(uv.x + 0.5);
        vec2 gx2 = vec2(dFdx(u2), gx.y), gy2 = vec2(dFdy(u2), gy.y);
        if (abs(gx2.x) + abs(gy2.x) < abs(gx.x) + abs(gy.x)) { gx = gx2; gy = gy2; }
        // 맑은 밤은 지평선 대기광이 중간 고도까지 남는다 — 지붕·산등성이가 하늘 앞에 실루엣으로 읽히게 (천정은 그대로 어둡게)
        vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55 + 0.3 * uStars));
        col = mix(col, uBottom, smoothstep(0.02, -0.12, h));
        // 태양 광륜
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(sd, 6.0) * 0.28 + pow(sd, 64.0) * 0.6) * uSunVis;
        col += uSunColor * smoothstep(0.9993, 0.9997, sd) * 6.0 * uSunVis * step(0.0, uSunDir.y + 0.02);
        vec3 M = normalize(uMoonDir);
        float md = dot(d, M);
        float mth = length(cross(d, M)); // 달에서 떨어진 각 (sin, 앞쪽 반구에서)
        float mvis = uMoon * step(-0.02, M.y) * step(0.0, md);
        // 은하수 지도 (지평선 쪽은 대기에 묻히고, 달 둘레는 달빛에 씻긴다)
        if (uStars > 0.01 && h > -0.05 && uMapGain > 0.0) {
          float hz = smoothstep(-0.02, 0.25, h) * uStars;
          float wash = 1.0 - 0.65 * mvis * exp(-mth * mth / 0.12);
          col += textureGrad(uMilkyMap, uv, gx, gy).rgb * uMapGain * uMilky * hz * wash;
        }
        // 달: 화면 공간 원반 + 가장자리 어두워짐 + 바다 무늬 + 둘레 2°·10° 번짐
        if (mvis > 0.0) {
          float above = smoothstep(-0.01, 0.015, h);
          vec2 p = (gl_FragCoord.xy - uMoonPx.xy) / uMoonPx.z; // 달 반지름 단위
          float rr = length(p), ang = rr * MOON_R;
          col += vec3(0.84, 0.88, 1.0) * (0.06 * exp(-ang * ang / 0.0016) + 0.012 * exp(-ang * ang / 0.03)) * mvis * above;
          if (rr < 1.5) {
            float aa = max(1.0 / uMoonPx.z, 0.02); // 한 픽셀 폭 (달 반지름 단위)
            float disk = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, rr);
            float mu = sqrt(max(1.0 - rr * rr, 0.0));
            float mare = smoothstep(0.45, 0.7, fbm(p * 1.25 + 4.7)); // 달의 바다
            float alb = (1.0 - 0.36 * mare) * (0.93 + 0.07 * n2(p * 6.0 + 2.0)) * (0.66 + 0.34 * mu);
            col = mix(col, vec3(0.96, 0.96, 0.93) * MOON_DISK * alb, disk * mvis * above);
          }
        }
        // 구름 (낮게 깔린 층운)
        if (h > -0.02) {
          vec2 cp = d.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.004, 0.0);
          float c = fbm(cp * 1.4);
          float m = smoothstep(0.55 - uCloudAmt * 0.25, 0.85, c) * smoothstep(-0.02, 0.18, h) * (1.0 - smoothstep(0.55, 0.95, h));
          vec3 cc = uCloud + uSunColor * pow(sd, 4.0) * 0.35 * uSunVis;
          col = mix(col, cc, m * 0.75);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

/**
 * 밤하늘 지도·점 별을 받고(밤이 처음 올 때 한 번), 시각에 따라 하늘을 돌린다.
 * 점 별: 별 6000개를 THREE.Points 하나로 (그리기 1번). 하늘 돔처럼 카메라를 따라가고 맨 뒤 깊이(xyww)에 그려 무엇이든 앞을 가린다.
 */
export class NightSky {
  constructor(scene, sky, envSky, quality) {
    this.u = sky.material.uniforms;
    // 달은 화면 공간 원: 그리기 직전에 달 방향을 이 카메라 화면에 투영해 둔다. 환경맵(큐브 카메라)에는 달을 넣지 않는다
    const mp = new THREE.Vector3(), sz = new THREE.Vector2();
    sky.onBeforeRender = (r, s, cam) => {
      if (!cam.isPerspectiveCamera) return this.u.uMoonPx.value.set(-1e6, -1e6, 1); // 위에서 내려다보는 지도 카메라 등: 달 없음
      mp.copy(cam.position).addScaledVector(this.u.uMoonDir.value, 100).project(cam);
      r.getDrawingBufferSize(sz);
      const f = sz.y / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      this.u.uMoonPx.value.set((mp.x * 0.5 + 0.5) * sz.x, (mp.y * 0.5 + 0.5) * sz.y, MOON.R * f);
    };
    let keep = 0;
    envSky.onBeforeRender = () => ((keep = this.u.uMoon.value), (this.u.uMoon.value = 0));
    envSky.onAfterRender = () => (this.u.uMoon.value = keep);
    this.scene = scene;
    this.small = quality === 'low';
    this.celToWorld = new THREE.Matrix3();
    this.starU = {
      uCelToWorld: { value: this.celToWorld },
      uStars: this.u.uStars,
      uMoonDir: this.u.uMoonDir,
      uMoon: this.u.uMoon,
      uPx: { value: 1 }
    };
    this._galPole = eq(GAL_POLE);
  }

  /** hour: 게임 시각 (h), want: 별이 보일 만큼 밤인가 */
  update(hour, want) {
    const lst = hour + SKY.LST_OFFSET;
    celestialToWorld(lst, SKY.LAT, this.celToWorld);
    this.u.uWorldToCel.value.copy(this.celToWorld).transpose();
    this.u.uMilkyPole.value.copy(this._galPole).applyMatrix3(this.celToWorld);
    if (want && !this._loading) this._load();
  }

  async _load() {
    this._loading = true;
    const base = './assets/world/sky/';
    try {
      const [tex, buf] = await Promise.all([
        new THREE.TextureLoader().loadAsync(base + (this.small ? 'milkyway_lo.webp' : 'milkyway.webp')),
        fetch(base + 'stars.bin').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      ]);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      this.u.uMilkyMap.value = tex;
      this.u.uMapGain.value = SKY.MAP_GAIN;
      this._stars(new Float32Array(buf));
    } catch (e) {
      console.warn('[nightSky] 별지도를 받지 못했습니다', e);
    }
  }

  _stars(a) {
    const n = a.length / 6, pos = new Float32Array(n * 3), flux = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set(a.subarray(i * 6, i * 6 + 3), i * 3);
      flux.set(a.subarray(i * 6 + 3, i * 6 + 6), i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('flux', new THREE.BufferAttribute(flux, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: this.starU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      defines: { F0: STAR_F0.toExponential(3), GAIN: SKY.STAR_GAIN.toFixed(3), PEAK_MAX: SKY.STAR_MAX.toFixed(3) },
      vertexShader: `
        attribute vec3 flux;
        uniform mat3 uCelToWorld;
        uniform vec3 uMoonDir;
        uniform float uStars, uMoon, uPx;
        varying vec3 vCol;
        varying float vSig;
        void main() {
          vec3 d = uCelToWorld * position;
          gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + d * 500.0, 1.0);
          gl_Position.z = gl_Position.w; // 맨 뒤 (하늘 돔과 같은 깊이) — 앞의 무엇이든 가린다
          float F = max(dot(flux, vec3(0.2126, 0.7152, 0.0722)), 1e-12);
          float k = pow(F / F0, 0.6); // 1(가장 희미) ~ 7(가장 밝음)
          float m = length(cross(d, normalize(uMoonDir)));
          float wash = 1.0 - 0.75 * uMoon * step(0.0, dot(d, uMoonDir)) * exp(-m * m / 0.05); // 달 둘레 희미한 별은 달빛에 묻힌다
          float a = smoothstep(-0.02, 0.25, d.y) * uStars * wash;
          vSig = (0.6 + 0.5 * clamp((k - 1.0) / 6.0, 0.0, 1.0)) * uPx; // 별 크기 (가우스 σ, 화면 px)
          vCol = flux / F * min(GAIN * k, PEAK_MAX) * a;
          gl_PointSize = a > 0.003 ? ceil(vSig * 6.0) + 1.0 : 0.0;
        }`,
      fragmentShader: `
        varying vec3 vCol;
        varying float vSig;
        void main() {
          vec2 q = (gl_PointCoord - 0.5) * (ceil(vSig * 6.0) + 1.0);
          float g = exp(-dot(q, q) / (2.0 * vSig * vSig));
          if (g < 0.01) discard;
          gl_FragColor = vec4(vCol * g, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = -9;
    pts.userData.noPick = true;
    pts.onBeforeRender = (r) => (this.starU.uPx.value = r.getPixelRatio()); // 화질 자동 전환으로 바뀌어도 별은 같은 크기
    this.points = pts;
    this.scene.add(pts);
  }
}
