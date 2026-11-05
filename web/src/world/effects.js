/**
 * GPU 파티클 — 향 연기, 불꽃, 찻김, 반딧불, 빗줄기(1,500), 눈송이(1,200), 물안개, 금빛 파동.
 * 입자 위치는 정점 셰이더에서 (시간 + 씨앗)으로 계산하므로 CPU 갱신이 없다.
 */
import * as THREE from 'three';
import { envUniforms } from './materials.js';
import { ROOF_COVER_GLSL } from './layout.js';
import { softDotTexture, smokeTexture, flameTexture } from './textures.js';

function rand(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * 고리형 수명의 상승 입자 (연기·불꽃·찻김)
 */
export function makeEmitter({
  count = 40,
  spread = 0.1,
  rise = 1.5,
  life = 3,
  size = 0.4,
  grow = 2,
  color = '#ffffff',
  opacity = 0.5,
  texture = 'smoke',
  additive = false,
  drift = 0.3,
  seed = 1
}) {
  const r = rand(seed);
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4] = r();
    seeds[i * 4 + 1] = (r() - 0.5) * 2;
    seeds[i * 4 + 2] = (r() - 0.5) * 2;
    seeds[i * 4 + 3] = r();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const map = texture === 'flame' ? flameTexture() : texture === 'dot' ? softDotTexture() : smokeTexture();
  const uniforms = {
    uTime: envUniforms.uTime,
    uWind: envUniforms.uWind,
    uIntensity: { value: 1 },
    uMap: { value: map },
    uColor: { value: new THREE.Color(color) },
    uSpread: { value: spread },
    uRise: { value: rise },
    uLife: { value: life },
    uSize: { value: size },
    uGrow: { value: grow },
    uOpacity: { value: opacity },
    uDrift: { value: drift },
    uPx: { value: 1 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `
      attribute vec4 seed;
      uniform float uTime, uWind, uIntensity, uSpread, uRise, uLife, uSize, uGrow, uDrift, uPx;
      varying float vAge; varying float vSeed;
      void main() {
        float age = fract(uTime / uLife + seed.x);
        vAge = age; vSeed = seed.w;
        float spd = mix(0.6, 1.0, uIntensity);
        vec3 p = position;
        p.x += seed.y * uSpread * (1.0 + age * 2.0) + sin(uTime * 0.7 + seed.w * 6.28) * uDrift * age + uWind * age * age * 0.6;
        p.z += seed.z * uSpread * (1.0 + age * 2.0) + cos(uTime * 0.5 + seed.w * 6.28) * uDrift * age;
        p.y += age * uRise * spd;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float s = uSize * (1.0 + age * uGrow) * mix(0.5, 1.2, uIntensity);
        gl_PointSize = s * uPx * 300.0 / -mv.z;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity; uniform float uIntensity;
      varying float vAge; varying float vSeed;
      void main() {
        vec2 uv = gl_PointCoord;
        float a = sin(vSeed * 6.28);
        uv = (mat2(cos(a), -sin(a), sin(a), cos(a)) * (uv - 0.5)) + 0.5;
        vec4 t = texture2D(uMap, uv);
        float fade = smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge));
        gl_FragColor = vec4(uColor * t.rgb, t.a * uOpacity * fade * uIntensity);
        #include <colorspace_fragment>
      }`
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.userData.uniforms = uniforms;
  return pts;
}

/**
 * 날씨 입자: 카메라 주변 상자 안에서 반복 낙하 (빗줄기는 선분, 눈은 점)
 */
export class Weather {
  constructor(scene, quality) {
    this.scene = scene;
    const low = quality === 'low';
    this.rainCount = low ? 900 : 1500;
    this.snowCount = low ? 700 : 1200;
    this.box = 28;
    this.uniforms = {
      uTime: envUniforms.uTime,
      uWind: envUniforms.uWind,
      uCenter: { value: new THREE.Vector3() },
      uBox: { value: this.box },
      uAmount: { value: 0 },
      uColor: { value: new THREE.Color('#c8d2dc') },
      uPx: { value: 1 }
    };
    this.rain = this._rain();
    this.snow = this._snow();
    this.snowU = this.snow.material.uniforms;
    this.rainU = this.rain.material.uniforms;
    scene.add(this.rain, this.snow);
    this.leaves = this._leaves(low ? 90 : 160);
    scene.add(this.leaves);
    this.fireflies = this._fireflies(low ? 50 : 90);
    scene.add(this.fireflies);
    this.rainTarget = 0;
    this.snowTarget = 0;
  }

  _rain() {
    const n = this.rainCount;
    const r = rand(5);
    const pos = new Float32Array(n * 2 * 3);
    const seed = new Float32Array(n * 2 * 4);
    for (let i = 0; i < n; i++) {
      const s = [r(), r(), r(), 0.6 + r() * 0.4];
      for (let k = 0; k < 2; k++) {
        seed.set([s[0], s[1], s[2], k], (i * 2 + k) * 4);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    const u = { ...this.uniforms, uAmount: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec4 seed; uniform float uTime, uBox, uAmount, uWind; uniform vec3 uCenter;
        varying float vA;
        ${ROOF_COVER_GLSL}
        void main() {
          float fall = 15.0;
          vec3 p;
          p.x = uCenter.x + (seed.x - 0.5) * uBox * 2.0;
          p.z = uCenter.z + (seed.y - 0.5) * uBox * 2.0;
          p.y = uCenter.y + 18.0 - mod(uTime * fall + seed.z * 30.0, 30.0);
          p.x += (uCenter.y + 18.0 - p.y) * 0.08 * uWind;
          p.y += seed.w * 0.55;
          p.x += seed.w * 0.04 * uWind;
          vA = uAmount * step(fract(seed.z * 17.0), uAmount + 0.001) * (1.0 - roofCover(p));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying float vA;
        void main() { if (vA < 0.01) discard; gl_FragColor = vec4(uColor, 0.32 * vA);
          #include <colorspace_fragment>
        }`
    });
    const lines = new THREE.LineSegments(g, mat);
    lines.frustumCulled = false;
    return lines;
  }

  _snow() {
    const n = this.snowCount;
    const r = rand(9);
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) seed.set([r(), r(), r(), r()], i * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    const u = { ...this.uniforms, uAmount: { value: 0 }, uMap: { value: softDotTexture() } };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec4 seed; uniform float uTime, uBox, uAmount, uWind, uPx; uniform vec3 uCenter;
        varying float vA;
        ${ROOF_COVER_GLSL}
        void main() {
          vec3 p;
          float t = uTime * (0.9 + seed.w * 0.6);
          p.x = uCenter.x + (seed.x - 0.5) * uBox * 2.0 + sin(t * 0.8 + seed.z * 20.0) * 0.8 + uWind * 1.2;
          p.z = uCenter.z + (seed.y - 0.5) * uBox * 2.0 + cos(t * 0.6 + seed.x * 20.0) * 0.6;
          p.y = uCenter.y + 16.0 - mod(t * 1.3 + seed.z * 26.0, 26.0);
          vA = uAmount * step(fract(seed.w * 13.0), uAmount + 0.001) * (1.0 - roofCover(p));
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.0 + seed.w * 3.0) * uPx * 14.0 / -mv.z;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; varying float vA;
        void main() { if (vA < 0.01) discard; vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vec3(1.0), t.a * 0.9 * vA);
          #include <colorspace_fragment>
        }`
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    return pts;
  }

  /** 맑은 날 바람에 날리는 단풍잎·솔잎 (11월 산사) */
  _leaves(n) {
    const r = rand(71);
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 4);
    const col = new Float32Array(n * 3);
    const palette = ['#c8461f', '#d9781f', '#e0a12a', '#9c2a1e', '#7a8a3a'].map((h) => new THREE.Color(h));
    for (let i = 0; i < n; i++) {
      seed.set([r(), r(), r(), r()], i * 4);
      const c = palette[Math.floor(r() * palette.length)];
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const u = { ...this.uniforms, uAmount: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec4 seed; attribute vec3 color; uniform float uTime, uBox, uAmount, uWind, uPx; uniform vec3 uCenter;
        varying float vA; varying vec3 vCol; varying float vRot;
        ${ROOF_COVER_GLSL}
        void main() {
          vec3 p;
          float t = uTime * (0.35 + seed.w * 0.25);
          p.x = uCenter.x + (seed.x - 0.5) * uBox * 1.6 + sin(t * 1.3 + seed.z * 20.0) * 1.2 + uWind * 2.0 * fract(t * 0.07 + seed.y);
          p.z = uCenter.z + (seed.y - 0.5) * uBox * 1.6 + cos(t * 0.9 + seed.x * 20.0) * 0.9;
          p.y = uCenter.y + 9.0 - mod(t * 1.1 + seed.z * 14.0, 14.0);
          vA = uAmount * step(fract(seed.w * 7.0), uAmount + 0.001) * (1.0 - roofCover(p));
          vCol = color; vRot = t * 3.0 + seed.x * 6.28;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (3.0 + seed.w * 3.0) * uPx * 16.0 / -mv.z;
        }`,
      fragmentShader: `
        varying float vA; varying vec3 vCol; varying float vRot;
        void main() {
          if (vA < 0.01) discard;
          vec2 q = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          q = mat2(c, -s, s, c) * q;
          float leaf = 1.0 - smoothstep(0.0, 0.04, abs(q.x) * 2.6 + q.y * q.y * 1.6 - 0.18);
          if (leaf < 0.05) discard;
          gl_FragColor = vec4(vCol, leaf * 0.95 * vA);
          #include <colorspace_fragment>
        }`
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    return pts;
  }

  _fireflies(n) {
    const r = rand(33);
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 4);
    // 숲길 계곡 근처와 연못 주변
    for (let i = 0; i < n; i++) {
      const pond = i % 3 === 0;
      const x = pond ? 21.5 + (r() - 0.5) * 12 : (r() - 0.5) * 22;
      const z = pond ? -5 + (r() - 0.5) * 9 : 10 + r() * 30;
      pos.set([x, 0.6 + r() * 2.2, z], i * 3);
      seed.set([r(), r(), r(), r()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    const u = { uTime: envUniforms.uTime, uAmount: { value: 0 }, uMap: { value: softDotTexture() }, uPx: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec4 seed; uniform float uTime, uAmount, uPx; varying float vA;
        void main() {
          vec3 p = position;
          float t = uTime * (0.25 + seed.w * 0.2);
          p.x += sin(t + seed.x * 30.0) * 1.4;
          p.z += cos(t * 0.8 + seed.y * 30.0) * 1.4;
          p.y += sin(t * 1.7 + seed.z * 20.0) * 0.4;
          float blink = smoothstep(0.3, 1.0, sin(uTime * (1.2 + seed.z) + seed.x * 40.0));
          vA = uAmount * blink;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 5.0 * uPx * 20.0 / -mv.z;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; varying float vA;
        void main() { vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vec3(1.0, 0.86, 0.45) * 2.4, t.a * vA);
          #include <colorspace_fragment>
        }`
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    return pts;
  }

  set(weather) {
    this.weatherName = weather;
    this.rainTarget = weather === 'rain' ? 1 : 0;
    this.snowTarget = weather === 'snow' ? 1 : 0;
  }

  setPixelRatio(px) {
    this.snowU.uPx.value = px;
    this.leaves.material.uniforms.uPx.value = px;
    this.fireflies.material.uniforms.uPx.value = px;
  }

  update(dt, camPos, fireflyAmount) {
    const k = 1 - Math.exp(-dt * 0.6);
    this.rainU.uAmount.value += (this.rainTarget - this.rainU.uAmount.value) * k;
    this.snowU.uAmount.value += (this.snowTarget - this.snowU.uAmount.value) * k;
    this.rainU.uCenter.value.copy(camPos);
    this.snowU.uCenter.value.copy(camPos);
    this.rain.visible = this.rainU.uAmount.value > 0.01;
    this.snow.visible = this.snowU.uAmount.value > 0.01;
    const lu = this.leaves.material.uniforms;
    lu.uCenter.value.copy(camPos);
    const leafTarget = this.weatherName === 'clear' || !this.weatherName ? (fireflyAmount > 0.5 ? 0 : 1) : 0;
    lu.uAmount.value += (leafTarget - lu.uAmount.value) * k;
    this.leaves.visible = lu.uAmount.value > 0.01;
    const ff = this.fireflies.material.uniforms.uAmount;
    ff.value += (fireflyAmount - ff.value) * k;
    this.fireflies.visible = ff.value > 0.01;
    return { rain: this.rainU.uAmount.value, snow: this.snowU.uAmount.value };
  }
}

/** 바닥에 퍼지는 금빛 원형 파동 (합장 반배, 범종) */
export class Ripples {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.RingGeometry(0.8, 1, 64);
    this.geo.rotateX(-Math.PI / 2);
  }
  spawn(pos, { color = '#f2c46d', maxR = 6, life = 2.2, delay = 0 } = {}) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.geo, mat);
    m.position.copy(pos);
    m.position.y += 0.06;
    m.scale.setScalar(0.01);
    this.scene.add(m);
    this.items.push({ m, t: -delay, life, maxR });
  }
  update(dt) {
    this.items = this.items.filter((it) => {
      it.t += dt;
      if (it.t < 0) return true;
      const p = it.t / it.life;
      if (p >= 1) {
        this.scene.remove(it.m);
        it.m.material.dispose();
        return false;
      }
      const e = 1 - Math.pow(1 - p, 3);
      it.m.scale.setScalar(0.2 + e * it.maxR);
      it.m.material.opacity = (1 - p) * 0.8;
      return true;
    });
  }
}
