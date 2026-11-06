/**
 * 번뇌 소각: 적은 한지 쪽지가 손앞에서 화로로 날아 들어가, 불에 닿는 순간 가장자리부터 그을리고 말리며 불꽃이 되어 사라진다.
 * 글씨는 창(modalManager)이 그린 캔버스 한 장뿐 — 저장·전송하지 않고, 다 타면 캔버스 픽셀까지 지운다.
 */
import * as THREE from 'three';
import { makeEmitter } from './effects.js';
import { envUniforms } from './materials.js';

const FLY = 1.8; // 손앞 → 화로 (초)
export const BURN = 2.9; // 불이 붙어 다 타기까지 (초)
const PAPER = { w: 0.34, h: 0.24 }; // 쪽지 크기 (m) — 창의 한지 쪽지 비율
// 다 타 갈 무렵부터 불꽃·불똥이 하늘로: 불붙고 SKY.delay 초 뒤부터 SKY.spawn 초 동안 하나씩 솟아 끝까지 올라 사라진다
export const SKY = { delay: 1.2, spawn: 2.6, sparkLife: 3.8, sparkRise: 10, flameLife: 1.8, flameRise: 5 };
/** 불붙는 순간부터 하늘로 솟은 마지막 불똥이 사라지기까지 (초) — 소리·카메라가 이 길이에 맞춘다 */
export const SKY_TOTAL = SKY.delay + SKY.spawn + SKY.sparkLife;

const BURN_GLSL = `
uniform float uBurn, uCurl, uFly, uT;
uniform vec2 uOrigin;
float bHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bHash(i), bHash(i + vec2(1.0, 0.0)), f.x), mix(bHash(i + vec2(0.0, 1.0)), bHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// 탈 차례: 불이 닿은 모서리(uOrigin)에서 멀수록 늦게, 잡음으로 들쭉날쭉하게
float burnOrder(vec2 uv) { return distance(uv, uOrigin) * 0.8 + bNoise(uv * 7.0) * 0.38 + bNoise(uv * 19.0) * 0.12; }
`;

function paperMaterial(map) {
  const u = { uBurn: { value: 0 }, uCurl: { value: 0 }, uFly: { value: 0 }, uT: { value: 0 }, uOrigin: { value: new THREE.Vector2(0.9, 0.15) } };
  const mat = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${BURN_GLSL}\nvarying vec2 vPUv;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPUv = uv;
        // 날 때: 종이가 바람에 살랑인다 / 탈 때: 탄 쪽부터 위로 말려 오른다 (종이 면의 법선 = +z)
        transformed.z += uFly * 0.028 * sin(uT * 9.0 + position.x * 17.0) * (0.4 + uv.y);
        float bCurlK = clamp(uBurn * 1.45 - burnOrder(uv) + 0.35, 0.0, 1.0);
        transformed.z += uCurl * bCurlK * bCurlK * 0.07;`
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${BURN_GLSL}\nvarying vec2 vPUv;`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float bo = burnOrder(vPUv), th = uBurn * 1.45;
        if (uBurn > 0.0 && bo < th) discard;
        float bGlow = uBurn > 0.0 ? 1.0 - smoothstep(th, th + 0.035, bo) : 0.0; // 타들어 가는 불 테
        float bChar = uBurn > 0.0 ? 1.0 - smoothstep(th + 0.02, th + 0.17, bo) : 0.0; // 그 바로 앞 그을음
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.05, 0.04), bChar * 0.9);`
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.42, 0.08) * bGlow * 5.0;');
  };
  mat.customProgramCacheKey = () => 'burn-paper';
  return { mat, u };
}

const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

export class PaperBurn {
  /**
   * @param scene THREE.Scene
   * @param bowl  THREE.Vector3 — 화로 숯불 위 (종이가 내려앉는 자리)
   * @param pxOf  () => 지금 입자 화면 배율 (기존 화로 입자와 같게)
   */
  constructor(scene, bowl, pxOf, { low = false } = {}) {
    this.low = low;
    this.scene = scene;
    this.bowl = bowl;
    this.pxOf = pxOf;
    this.cur = null;
    this.bursts = []; // [{ e, life, t, peak }]
    // 쪽지 한 벌을 계속 다시 쓴다 (재질 셰이더를 입장 때 미리 만들어 두려고 — warm). 쉬는 동안은 빈 한지색 1px
    this.blank = new THREE.DataTexture(new Uint8Array([246, 239, 222, 255]), 1, 1);
    this.blank.colorSpace = THREE.SRGBColorSpace;
    this.blank.needsUpdate = true;
    const { mat, u } = paperMaterial(this.blank);
    this.u = u;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(PAPER.w, PAPER.h, 18, 12), mat);
    this.mesh.userData.noPick = true;
  }

  /**
   * 처음 태울 때 셰이더를 만드느라 멈칫하지 않게 입장할 때 미리. scene: 빛 개수를 같게,
   * target: 실제로 그리는 곳(후처리 버퍼) — 화면에 바로 그릴 때와 출력 색공간·톤매핑이 달라 셰이더가 따로 생긴다
   */
  warm(renderer, camera, scene, target = null) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.compile(this.mesh, camera, scene);
    renderer.setRenderTarget(prev);
    // 셰이더가 있어도 처음 실제로 그릴 때 그래픽 드라이버가 그리기 상태를 만든다 (Metal·Vulkan) — 숯 밑(안 보이는 곳)에서 두 프레임만 그려 둔다
    this.mesh.position.set(this.bowl.x, this.bowl.y - 0.25, this.bowl.z);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this._warmFrames = 2;
  }

  get busy() {
    return !!this.cur;
  }

  /**
   * canvas: 글씨가 그려진 쪽지 / from: 손앞 (세계 좌표) / face: 처음에 쪽지 앞면이 볼 곳 (카메라)
   * onIgnite: 종이가 불에 닿는 순간 (소리·불꽃) / onDone: 다 타서 사라짐 / instant: 움직임 줄이기 설정 — 날지 않고 바로 탄다
   */
  start(canvas, from, face, { onIgnite, onDone, instant = false } = {}) {
    if (this.cur) this._finish();
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    const mesh = this.mesh, u = this.u;
    mesh.material.map = map;
    mesh.frustumCulled = true;
    u.uBurn.value = u.uCurl.value = u.uFly.value = 0;
    mesh.position.copy(instant ? this.bowl : from);
    mesh.lookAt(face);
    const q0 = mesh.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.7 + Math.random() * 0.6, 'YXZ'));
    if (instant) mesh.quaternion.copy(q1);
    mesh.userData.noPick = true;
    this.scene.add(mesh);
    const ctrl = from.clone().lerp(this.bowl, 0.5);
    ctrl.y = Math.max(from.y, this.bowl.y) + 0.65; // 손에서 살짝 떠올랐다가 화로로 떨어지는 포물선
    this.cur = { mesh, u, map, canvas, from: from.clone(), ctrl, q0, q1, t: instant ? FLY : 0, lit: false, onIgnite, onDone };
  }

  update(dt, t) {
    if (this._warmFrames > 0 && --this._warmFrames === 0 && !this.cur) {
      this.scene.remove(this.mesh);
      this.mesh.frustumCulled = true;
    }
    const c = this.cur;
    if (c) {
      c.t += dt;
      c.u.uT.value = t;
      if (c.t < FLY) {
        const k = ease(c.t / FLY), a = c.from, b = this.bowl, m = c.ctrl;
        // 2차 베지어: 손앞 → 위 → 화로
        c.mesh.position.set(
          (1 - k) * (1 - k) * a.x + 2 * (1 - k) * k * m.x + k * k * b.x,
          (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * m.y + k * k * b.y,
          (1 - k) * (1 - k) * a.z + 2 * (1 - k) * k * m.z + k * k * b.z
        );
        c.mesh.quaternion.slerpQuaternions(c.q0, c.q1, ease((c.t / FLY - 0.15) / 0.85));
        c.u.uFly.value = Math.sin(Math.min(1, c.t / FLY) * Math.PI); // 날 때만 살랑임
      } else {
        if (!c.lit) {
          c.lit = true;
          c.mesh.position.copy(this.bowl);
          c.mesh.quaternion.copy(c.q1);
          c.u.uFly.value = 0;
          this._ignite();
          c.onIgnite?.();
        }
        const p = Math.min(1, (c.t - FLY) / BURN);
        c.u.uBurn.value = 0.02 + p;
        c.u.uCurl.value = ease(p * 1.3);
        c.mesh.position.y = this.bowl.y + 0.03 * Math.sin(p * Math.PI); // 불기운에 살짝 들썩
        if (p >= 1) this._finish();
      }
    }
    // 불꽃·불티·재: 세기를 줄이다가 꺼지면 치운다
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      if (!b.once) {
        const k = b.t < 0.25 ? b.t / 0.25 : Math.max(0, 1 - (b.t - 0.25) / (b.life - 0.25));
        b.e.userData.uniforms.uIntensity.value = b.peak * k;
      }
      if (b.t >= b.life) {
        this.scene.remove(b.e);
        b.e.geometry.dispose();
        b.e.material.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  /** 종이가 숯불에 닿는 순간: 확 피어오르는 불길 + 불티 + 위로 흩어지는 재 */
  _ignite() {
    const at = this.bowl;
    const add = (opts, y, life, peak) => {
      const e = makeEmitter(opts);
      e.position.set(at.x, at.y + y, at.z);
      e.userData.uniforms.uPx.value = this.pxOf();
      e.userData.uniforms.uIntensity.value = 0;
      this.scene.add(e);
      this.bursts.push({ e, life, t: 0, peak });
    };
    add({ count: 34, spread: 0.12, rise: 1.0, life: 0.8, size: 0.85, grow: -0.6, color: '#fff0c4', color2: '#e8541c', opacity: 0.9, texture: 'tongue', upright: true, additive: true, drift: 0.12, seed: 61 }, 0.02, BURN * 0.9, 0.85);
    add({ count: 36, spread: 0.18, rise: 2.8, life: 1.6, size: 0.05, grow: -0.2, color: '#ffd890', opacity: 1, texture: 'dot', additive: true, drift: 0.8, seed: 62 }, 0.05, BURN + 0.8, 1.4);
    add({ count: 16, spread: 0.12, rise: 1.7, life: 2.4, size: 0.045, grow: 0.4, color: '#2b2520', opacity: 0.85, texture: 'dot', additive: false, drift: 0.5, seed: 63 }, 0.1, BURN + 1.6, 1);
    // 하늘로: 한 번만 태어나는 입자 (되풀이 없이 끝까지 올라 사라진다)
    const sky = (opts, y, life, peak) => {
      const e = makeEmitter({ ...opts, spawn: SKY.spawn });
      e.position.set(at.x, at.y + y, at.z);
      const u = e.userData.uniforms;
      u.uPx.value = this.pxOf();
      u.uIntensity.value = peak;
      u.uStart.value = envUniforms.uTime.value + SKY.delay;
      this.scene.add(e);
      this.bursts.push({ e, life: SKY.delay + SKY.spawn + life + 0.3, t: 0, peak, once: true });
    };
    // 불똥: 바람에 흩어지며 10m 위까지
    sky({ count: this.low ? 45 : 90, spread: 0.22, rise: SKY.sparkRise, life: SKY.sparkLife, size: 0.12, grow: -0.5, color: '#fff2b8', color2: '#ff4a12', opacity: 1, texture: 'dot', additive: true, drift: 1.7, seed: 64 }, 0.15, SKY.sparkLife, 1.6);
    // 불꽃 조각: 불길에서 떨어져 나와 5m 위로 솟으며 작아진다
    sky({ count: this.low ? 16 : 30, spread: 0.12, rise: SKY.flameRise, life: SKY.flameLife, size: 0.95, grow: -0.85, color: '#fff1c6', color2: '#b0280a', opacity: 0.85, texture: 'tongue', upright: true, additive: true, drift: 0.35, seed: 65 }, 0.25, SKY.flameLife, 1);
  }

  _finish() {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    this.scene.remove(c.mesh);
    c.mesh.material.map = this.blank;
    c.map.dispose();
    // 글씨 픽셀까지 지운다 (저장·전송하지 않는 약속)
    c.canvas.getContext('2d')?.clearRect(0, 0, c.canvas.width, c.canvas.height);
    c.canvas.width = c.canvas.height = 0;
    c.onDone?.();
  }
}
