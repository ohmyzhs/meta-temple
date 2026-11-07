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
  tea_master: ['monk_body', 'necklace'], // 심검당 차담 스님 (중년) — 아래 LOOKS 로 질감·비율을 바꾼다
  ink_wanderer: ['wanderer_body', 'wanderer_hat'],
  lantern_spirit: ['spirit_body']
};
const ALL_BODIES = new Set(Object.values(BODY).flat());

/**
 * 같은 뼈대·동작을 쓰되 다른 사람으로 보이게 (동자승인 내 모습과 마주 앉았을 때 헷갈리지 않게).
 *  head·body: 머리 뼈·몸 전체 배율 — 머리를 줄이고 몸을 키우면 2.5등신 아이에서 어른 쪽으로.
 *  open: 이 동작들에서는 눈을 감지 않는다 (차를 건네며 마주 보는 스님).
 *  paint: 아틀라스(1024², glTF UV — 왼쪽 위 머리·얼굴, 오른쪽 위 장삼, 가운데 띠 가사, 아래 다리·소매, 오른쪽 아래 손·눈·염주)를 다시 칠한다.
 */
const LOOKS = {
  tea_master: { head: 0.8, body: 1.12, open: new Set(['sit', 'tea', 'serve_tea', 'incense', 'idle']), paint: paintTeaMaster }
};

function paintTeaMaster(ctx) {
  const tint = (op, color, x, y, w, h) => {
    ctx.globalCompositeOperation = op;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  // 장삼: 잿빛 → 짙은 먹빛 회갈색 (손때 묻은 오래 입은 옷)
  tint('multiply', '#8a7d6e', 512, 0, 512, 512);
  tint('multiply', '#8a7d6e', 0, 620, 256, 404);
  tint('multiply', '#8a7d6e', 256, 512, 256, 512);
  // 가사: 붉은빛 → 괴색(흙빛 갈색)
  tint('color', '#6e5236', 512, 512, 512, 128);
  tint('multiply', '#b8a48c', 512, 512, 512, 128);
  // 얼굴·손: 볕에 그은 살빛
  tint('multiply', '#ead6c4', 0, 0, 512, 512);
  tint('multiply', '#ead6c4', 512, 704, 128, 128);
  tint('multiply', '#ead6c4', 768, 704, 128, 128);
  // 깎은 머리의 푸른 기 (머리선 y≈200 위로 옅어지며)
  const g = ctx.createLinearGradient(0, 120, 0, 205);
  g.addColorStop(0, '#b9b8c2');
  g.addColorStop(1, '#ffffff');
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 205);
  ctx.globalCompositeOperation = 'source-over';
  // 눈: 눈동자 위쪽을 살빛 눈꺼풀로 덮어 지그시 뜬 눈 (큰 빛 반사는 가린다) — 눈동자 칸 (576..704, 832..960)
  ctx.fillStyle = '#d29d7c';
  ctx.fillRect(576, 832, 128, 50);
  ctx.fillStyle = 'rgba(52,36,28,0.95)';
  ctx.fillRect(576, 878, 128, 7);
  // 얼굴: 짙은 눈썹(원래 (228,235)·(284,235)), 팔자 주름(코 (256,305) 옆 → 입 (255,330) 양끝)
  ctx.lineCap = 'round';
  const stroke = (color, width, pts) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    ctx.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
    ctx.stroke();
  };
  for (const s of [-1, 1]) {
    const c = 256 + s * 28;
    stroke('rgba(58,48,42,0.92)', 7, [c - s * 17, 237, c - s * 2, 224, c + s * 15, 232]); // 눈썹
    stroke('rgba(128,82,60,0.42)', 2.5, [256 + s * 13, 306, 256 + s * 25, 322, 256 + s * 19, 343]); // 팔자 주름
  }
  stroke('rgba(140,95,72,0.32)', 2, [236, 212, 256, 207, 276, 212]); // 이마 주름 (눈썹과 머리선 사이)
}

const painted = new WeakMap(); // lib → { variant: material }
/** 변형 모습의 재질: 원본 재질을 복제하고 아틀라스를 캔버스에 다시 칠해 끼운다 (원본·다른 아바타는 그대로) */
function lookMaterial(lib, variant, src) {
  const byLib = painted.get(lib) || painted.set(lib, {}).get(lib);
  if (byLib[variant]) return byLib[variant];
  const img = src.map?.image;
  if (!img || typeof document === 'undefined') return (byLib[variant] = src);
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.save();
  ctx.scale(img.width / 1024, img.height / 1024); // 칠하는 좌표는 1024² 기준
  LOOKS[variant].paint(ctx);
  ctx.restore();
  const tex = new THREE.CanvasTexture(cv);
  for (const k of ['flipY', 'colorSpace', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'channel']) tex[k] = src.map[k];
  const mat = src.clone();
  mat.map = tex;
  return (byLib[variant] = mat);
}
/** 블렌더 몸이 있는 모습 */
export const RIG_STYLES = new Set(Object.keys(FILE_OF));

const libs = {};
let loading = null;
const BLINK = 0.12; // 사람 눈 깜빡임 0.1~0.15초
const EYES_SHUT = new Set(['sit', 'tea', 'meditate', 'serve_tea', 'prostrate', 'bow_half', 'sutra']);

const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _u = new THREE.Vector3();

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
      const bindWorld = bindPose(g.scene);
      // 이름표 자리: 머리(삿갓)를 감싸는 수평 타원 고리들 [가운데, 좌우·앞뒤 반지름] — 쉬는 자세 좌표 (블렌더 → three)
      const label = {};
      for (const [k, rings] of Object.entries(meta.label || {})) label[k] = rings.map((v) => ({ c: fromBlender(v), rx: v[3], rz: v[4] }));
      libs[key] = { scene: g.scene, clips: g.animations, meta, eyeLocal, bindWorld, label, headBindInv: bindWorld.get('head').clone().invert() };
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
    const look = LOOKS[variant];
    const drop = [];
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      if (ALL_BODIES.has(o.name) && !show.has(o.name)) return drop.push(o); // 다른 모습의 몸은 뗀다
      if (look && o.material?.name === 'monk') o.material = lookMaterial(lib, variant, o.material); // 복제본 — 내 모습은 그대로
      o.castShadow = true;
      o.frustumCulled = false; // 절·좌선으로 몸이 쉬는 자세의 경계 밖으로 나간다 (아바타 수십 명이라 그냥 그린다)
    });
    drop.forEach((o) => o.removeFromParent());
    if (look) this.model.scale.setScalar(look.body); // 동작이 손대지 않는 맨 위 — 앉은 엉덩이는 자리(루트)에 그대로 붙는다
    this.look = look || null;
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
    // 걷기끼리 바뀔 때는 발 위상을 이어 받고, 섞이는 동안 나가는 쪽도 같은 위상으로 돈다 (걷기 ↔ 빠르게 걷기는 한 주기 길이가 다르다)
    const walkSwap = prev && this.name?.startsWith('walk') && name.startsWith('walk');
    if (walkSwap) next.time = (prev.time / prev.getClip().duration) * next.getClip().duration;
    this._walkOut = walkSwap ? prev : null;
    next.play();
    if (prev && prev !== next) {
      if (fade > 0) next.crossFadeFrom(prev, fade, false);
      else prev.stop();
    }
    this.name = name;
    this.current = next;
  }

  /** speed: 실제 이동 속도(m/s) — 걷기 클립은 제 빠르기(meta speed: 걷기 1.5·빠르게 3.75m/s)로 구웠고, 다르면 그만큼 배속을 바꾼다 (발이 미끄러지지 않게) */
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
      const ts = Math.max(0.35, speed / ref);
      c.setEffectiveTimeScale(ts);
      const o = this._walkOut;
      if (o && o !== c && o.isRunning()) o.setEffectiveTimeScale((ts * o.getClip().duration) / c.getClip().duration);
    }
    // 동작이 뼈 크기를 쓰는 프레임도, 안 쓰는 프레임(한 번짜리 동작이 끝나 멈춘 뒤)도 있다 — 1 로 되돌린 뒤 갱신하고 곱해야 누적되지 않는다
    if (this.look) this.head.scale.setScalar(1);
    this.mixer.update(dt);
    if (this.look) this.head.scale.multiplyScalar(this.look.head);
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
    const shut = (EYES_SHUT.has(this.name) && !this.look?.open.has(this.name)) || this._blink > 0;
    this.eyesOpen.visible = !shut;
    this.eyesClosed.visible = shut;
  }

  /**
   * 이름표가 붙을 점(월드): 머리(삿갓을 썼으면 삿갓) 겉모양 — 수평 타원 고리들의 볼록 껍질 — 에서 화면 위쪽(카메라 위 방향 up) 끝.
   * 카메라를 숙이든 당기든 머리 바로 위 — 예전엔 발밑에서 1.6m 고정이라 가까이·낮게 보면 한 뼘 넘게 떠 보였다.
   * @returns 없으면(옛 GLB) false
   */
  labelAnchor(out, up) {
    const L = (this.hat?.visible && this.lib.label.hat) || this.lib.label.head;
    if (!L) return false;
    this.head.updateWorldMatrix(true, false);
    _m.multiplyMatrices(this.head.matrixWorld, this.lib.headBindInv); // 쉬는 자세 → 지금 (몸·머리 돌림, 크기까지)
    _u.copy(up).applyMatrix3(_n.setFromMatrix4(_m).transpose()).normalize(); // 지금 화면 위쪽으로 가장 먼 점을 쉬는 자세에서 찾는 방향 (Mᵀ·up)
    let best = -Infinity;
    for (const { c, rx, rz } of L) {
      const ex = rx * rx * _u.x, ez = rz * rz * _u.z, h = Math.sqrt(_u.x * ex + _u.z * ez); // 타원 고리의 그 방향 끝
      const s = c.x * _u.x + c.y * _u.y + c.z * _u.z + h;
      if (s > best) {
        best = s;
        out.set(c.x + (h ? ex / h : 0), c.y, c.z + (h ? ez / h : 0));
      }
    }
    out.applyMatrix4(_m);
    return true;
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
