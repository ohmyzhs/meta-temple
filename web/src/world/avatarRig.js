/**
 * 블렌더로 만든 스킨드 아바타 (web/assets/avatars/monk.glb — tools/blender/avatar_build.py → avatar_pack.sh).
 *  - 한 번 받아 두고 아바타마다 SkeletonUtils 로 복제, 아바타마다 AnimationMixer 하나.
 *  - 동작 고르기는 core/avatarMotion.js (상태·속도·구역 → 클립), 클립 사이는 크로스페이드.
 *  - 못 받으면(오프라인·404·디코더 실패) null 로 끝나고 아바타는 지금의 절차식 몸으로 남는다.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { fadeFor, transitionFor } from '../core/avatarMotion.js';

/** 모습 → 받을 GLB. 동자승·상주 스님·삿갓 행자는 한 파일(같은 뼈대·클립, 몸만 바꿔 낌), 연꽃 등불 정령은 따로 */
export const RIG_URLS = { monk: './assets/avatars/monk.glb', spirit: './assets/avatars/spirit.glb' };
const FILE_OF = { monk: 'monk', ink_wanderer: 'monk', lantern_spirit: 'spirit' };
/** 모습(variant 포함) → 보일 메시. 눈(eyes_open·eyes_closed)은 늘 함께 */
const BODY = {
  monk: ['monk_body'],
  resident: ['monk_body', 'necklace'], // 상주 스님: 목에 건 긴 염주
  ink_wanderer: ['wanderer_body', 'wanderer_hat'],
  lantern_spirit: ['spirit_body']
};
const ALL_BODIES = new Set(Object.values(BODY).flat());
/** 블렌더 몸이 있는 모습 */
export const RIG_STYLES = new Set(Object.keys(FILE_OF));

const libs = {};
let loading = null;
const BLINK = 0.12; // 사람 눈 깜빡임 0.1~0.15초
const EYES_SHUT = new Set(['sit', 'tea', 'meditate', 'serve_tea', 'prostrate', 'bow_half', 'sutra']);

/** 블렌더 좌표(Z 위, -Y 앞) → three (Y 위, +Z 앞) */
const fromBlender = ([x, y, z]) => new THREE.Vector3(x, z, -y);

function loadOne(key, url) {
  return new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(url)
    .then((g) => {
      const meta = typeof g.scene.userData.motion === 'string' ? JSON.parse(g.scene.userData.motion) : g.scene.userData.motion || {};
      g.scene.updateMatrixWorld(true);
      const head = g.scene.getObjectByName('head');
      if (!head || !g.animations.length) throw new Error(`${key}: head bone or clips missing`);
      // 쉬는 자세에서 눈 위치를 머리 뼈 좌표로 (1인칭 눈·3인칭 가림 검사 기준)
      const eyeLocal = head.worldToLocal(fromBlender(meta.eye || [0, -0.135, 1.205]));
      // 재질: 한 장 아틀라스 — 노멀은 three 가 화면 미분으로 접선을 만든다 (접선 없이 내보냄)
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.material.side = THREE.FrontSide;
        o.material.envMapIntensity = 0.9;
        if (o.material.name === 'wanderer') inkRim(o.material); // 삿갓 행자: 가장자리 먹빛 번짐
      });
      libs[key] = { scene: g.scene, clips: g.animations, meta, eyeLocal, bindWorld: bindPose(g.scene) };
      return libs[key];
    })
    .catch((e) => {
      console.warn(`[avatar] 블렌더 아바타(${key})를 못 불러와 절차식 몸을 씁니다:`, e?.message || e);
      return null;
    });
}

/** 두 파일을 함께 받는다. 하나라도 받으면 true (받은 모습만 블렌더 몸으로 바뀐다) */
export function loadRig() {
  loading ||= Promise.all(Object.entries(RIG_URLS).map(([k, u]) => loadOne(k, u))).then((r) => r.some(Boolean));
  return loading;
}

/** 이 모습의 GLB (아직 없으면 null) */
export const rigLib = (style = 'monk') => libs[FILE_OF[style]] || null;

/** 수묵 림라이트: 시선과 비스듬한 가장자리에 먹빛이 번진다 (절차식 행자와 같은 값) */
function inkRim(mat, rim = '#9aa3ad', power = 2.4, strength = 0.55) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: new THREE.Color(rim) };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim;').replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), ${power.toFixed(2)});
      totalEmissiveRadiance += uRim * rim * ${strength.toFixed(2)};`
    );
  };
  mat.customProgramCacheKey = () => 'ink-rim';
}

/** 쉬는 자세의 뼈 월드 행렬 (소품을 쉬는 자세 기준 자리로 붙일 때) */
function bindPose(scene) {
  const m = new Map();
  scene.traverse((o) => o.isBone && m.set(o.name, o.matrixWorld.clone()));
  return m;
}

export class RigBody {
  /** @param style monk·ink_wanderer·lantern_spirit  @param variant resident(상주 스님) 등 */
  constructor(style = 'monk', variant = null) {
    const lib = (this.lib = rigLib(style));
    this.model = cloneSkinned(lib.scene);
    const show = new Set(BODY[variant] || BODY[style] || BODY.monk);
    const drop = [];
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      if (ALL_BODIES.has(o.name) && !show.has(o.name)) return drop.push(o); // 다른 모습의 몸은 뗀다
      o.castShadow = true;
      o.frustumCulled = false; // 절·좌선으로 몸이 쉬는 자세의 경계 밖으로 나간다 (아바타 수십 명이라 그냥 그린다)
    });
    drop.forEach((o) => o.removeFromParent());
    this.hat = this.model.getObjectByName('wanderer_hat');
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = new Map();
    this.spare = new Map(); // 같은 한 번짜리 동작을 이어서 할 때(108배) 번갈아 쓸 두 번째 액션
    for (const clip of lib.clips) {
      const loop = !!lib.meta.clips?.[clip.name]?.loop;
      const mk = (c) => {
        const a = this.mixer.clipAction(c);
        if (!loop) {
          a.setLoop(THREE.LoopOnce, 1);
          a.clampWhenFinished = true;
        }
        return a;
      };
      this.actions.set(clip.name, mk(clip));
      if (!loop) this.spare.set(clip.name, mk(clip.clone()));
    }
    this.bones = {};
    this.model.traverse((o) => o.isBone && (this.bones[o.name] = o));
    this.head = this.bones.head;
    // 눈: 뜬 눈·감은 눈 조각을 번갈아 보인다 (깜빡임, 좌선·절할 때 감음)
    this.eyesOpen = this.model.getObjectByName('eyes_open');
    this.eyesClosed = this.model.getObjectByName('eyes_closed');
    for (const e of [this.eyesOpen, this.eyesClosed]) if (e) e.castShadow = false;
    this._blinkIn = 1 + Math.random() * 3;
    this._blink = 0;
    this.name = null;
    this.current = null;
    this._step = -1;
  }

  has = (n) => this.actions.has(n);

  /** 지금 클립의 소품 구간 안인가 (클립 메타 propFrom~propTo) */
  propOn(name) {
    const m = this.lib.meta.clips?.[name];
    return this.name === name && !!this.current && !!m && this.current.time >= (m.propFrom ?? 0) && this.current.time <= (m.propTo ?? 1e9);
  }

  /**
   * 클립으로 바꾼다. restart: 같은 한 번짜리 동작을 처음부터 다시 (번갈아 쓰는 액션으로 섞는다).
   * 앉은 자세 ↔ 선 자세면 일어서기·앉기 클립을 먼저 하고 이어서 (moving 이면 건너뛴다).
   */
  play(name, restart = false, moving = false) {
    if (!name) return;
    if (this._then) {
      if (name === this._then) return; // 일어서는(앉는) 중 — 끝나면 그리로
      this._then = null; // 마음이 바뀌었다: 바로 간다
    }
    if (name === this.name && !restart) return;
    const via = transitionFor(this.name, name, moving, this.has);
    if (via) {
      this._start(via, false);
      this._then = name;
      this._thenRestart = restart;
      return;
    }
    this._start(name, restart);
  }

  _start(name, restart) {
    let next = this.actions.get(name);
    if (!next) return;
    if (next === this.current && restart) next = this.spare.get(name) || next;
    else if (this.current === this.spare.get(name)) next = this.actions.get(name);
    const prev = this.current;
    const fade = fadeFor(this.name, name);
    next.reset();
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    // 걷기끼리 바뀔 때는 발 위상을 이어 받는다
    if (prev && this.name?.startsWith('walk') && name.startsWith('walk')) next.time = (prev.time / prev.getClip().duration) * next.getClip().duration;
    next.play();
    if (prev && prev !== next) {
      if (fade > 0) next.crossFadeFrom(prev, fade, false);
      else prev.stop();
    }
    this.name = name;
    this.current = next;
  }

  /** speed: 실제 이동 속도(m/s) — 걷기 클립은 1.1m/s 로 구웠고, 그보다 느리면(조이스틱 반쯤) 그만큼 느리게 (발이 미끄러지지 않게) */
  update(dt, speed, onStep, onRustle) {
    if (this._then && this.current && this.current.time >= this.current.getClip().duration - 1e-3) {
      const n = this._then;
      this._then = null;
      this._start(n, this._thenRestart);
    }
    const c = this.current;
    const t0 = c ? c.time : 0;
    if (c && this.name.startsWith('walk')) {
      const ref = this.lib.meta.clips?.[this.name]?.speed || 1;
      c.setEffectiveTimeScale(Math.max(0.35, speed / ref));
    }
    this.mixer.update(dt);
    this._eyes(dt);
    // 도복 스치는 소리: 클립에 적힌 시각을 지날 때 (큰절·일어서기·앉기)
    const R = c && onRustle && this.lib.meta.clips?.[this.name]?.rustle;
    if (R) for (const [at, len, s] of R) if (t0 < at && c.time >= at) onRustle(s, len);
    if (c && this.name.startsWith('walk')) {
      const s = Math.floor((c.time / c.getClip().duration) * 2); // 한 주기 두 걸음
      if (s !== this._step) {
        this._step = s;
        onStep?.();
      }
    } else this._step = -1;
  }

  /** 눈: 2.5~5.5초마다 0.12초 깜빡이고, 좌선·큰절·반배 동안은 감는다 */
  _eyes(dt) {
    if (!this.eyesOpen || !this.eyesClosed) return;
    this._blinkIn -= dt;
    if (this._blinkIn <= 0) {
      this._blink = BLINK;
      this._blinkIn = 2.5 + Math.random() * 3;
    }
    this._blink = Math.max(0, this._blink - dt);
    const shut = EYES_SHUT.has(this.name) || this._blink > 0;
    this.eyesOpen.visible = !shut;
    this.eyesClosed.visible = shut;
  }

  eyeWorld(out) {
    this.head.updateWorldMatrix(true, false);
    return this.head.localToWorld(out.copy(this.lib.eyeLocal));
  }

  /**
   * 소품을 뼈에 붙인다. 자리·방향은 쉬는 자세 월드 좌표(블렌더 좌표)로 적는다.
   * @param up 소품의 +Y 가 향할 방향 (블렌더 좌표)
   */
  attach(obj, bone, posB, upB = [0, 0, 1]) {
    const b = this.bones[bone];
    const bw = this.lib.bindWorld.get(bone);
    if (!b || !bw) return;
    const inv = bw.clone().invert();
    obj.position.copy(fromBlender(posB).applyMatrix4(inv));
    const upW = fromBlender(upB).normalize();
    const qb = new THREE.Quaternion().setFromRotationMatrix(bw);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), upW);
    obj.quaternion.copy(qb.invert().multiply(q));
    b.add(obj);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.model.removeFromParent();
  }
}
