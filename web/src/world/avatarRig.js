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

export const RIG_URL = './assets/avatars/monk.glb';
/** 블렌더 몸이 있는 모습 (나머지는 아직 절차식) */
export const RIG_STYLES = new Set(['monk']);

let lib = null;
let loading = null;
const BLINK = 0.12; // 사람 눈 깜빡임 0.1~0.15초
const EYES_SHUT = new Set(['sit', 'tea', 'prostrate', 'bow_half']);

/** 블렌더 좌표(Z 위, -Y 앞) → three (Y 위, +Z 앞) */
const fromBlender = ([x, y, z]) => new THREE.Vector3(x, z, -y);

export function loadRig(url = RIG_URL) {
  loading ||= new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(url)
    .then((g) => {
      const meta = typeof g.scene.userData.motion === 'string' ? JSON.parse(g.scene.userData.motion) : g.scene.userData.motion || {};
      g.scene.updateMatrixWorld(true);
      const head = g.scene.getObjectByName('head');
      if (!head || !g.animations.length) throw new Error('rig: head bone or clips missing');
      // 쉬는 자세에서 눈 위치를 머리 뼈 좌표로 (1인칭 눈·3인칭 가림 검사 기준)
      const eyeLocal = head.worldToLocal(fromBlender(meta.eye || [0, -0.135, 1.205]));
      // 재질: 한 장 아틀라스 — 노멀은 three 가 화면 미분으로 접선을 만든다 (접선 없이 내보냄)
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.material.side = THREE.FrontSide;
        o.material.envMapIntensity = 0.9;
      });
      lib = { scene: g.scene, clips: g.animations, meta, eyeLocal, bindWorld: bindPose(g.scene) };
      return lib;
    })
    .catch((e) => {
      console.warn('[avatar] 블렌더 아바타를 못 불러와 절차식 몸을 씁니다:', e?.message || e);
      return null;
    });
  return loading;
}

export const rigLib = () => lib;

/** 쉬는 자세의 뼈 월드 행렬 (소품을 쉬는 자세 기준 자리로 붙일 때) */
function bindPose(scene) {
  const m = new Map();
  scene.traverse((o) => o.isBone && m.set(o.name, o.matrixWorld.clone()));
  return m;
}

export class RigBody {
  constructor() {
    this.model = cloneSkinned(lib.scene);
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false; // 절·좌선으로 몸이 쉬는 자세의 경계 밖으로 나간다 (아바타 수십 명이라 그냥 그린다)
    });
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
      const ref = lib.meta.clips?.[this.name]?.speed || 1;
      c.setEffectiveTimeScale(Math.max(0.35, speed / ref));
    }
    this.mixer.update(dt);
    this._eyes(dt);
    // 도복 스치는 소리: 클립에 적힌 시각을 지날 때 (큰절·일어서기·앉기)
    const R = c && onRustle && lib.meta.clips?.[this.name]?.rustle;
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
    return this.head.localToWorld(out.copy(lib.eyeLocal));
  }

  /**
   * 소품을 뼈에 붙인다. 자리·방향은 쉬는 자세 월드 좌표(블렌더 좌표)로 적는다.
   * @param up 소품의 +Y 가 향할 방향 (블렌더 좌표)
   */
  attach(obj, bone, posB, upB = [0, 0, 1]) {
    const b = this.bones[bone];
    const bw = lib.bindWorld.get(bone);
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
