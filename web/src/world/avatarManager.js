/**
 * 아바타 & 침묵의 동석 (docs/02 §3, docs/03 §2.3)
 *  - 외형 3종: monk(목각·백자 동자승) / ink_wanderer(삿갓 수묵 행자) / lantern_spirit(연꽃 등불 정령)
 *  - 동작 6종 상태 머신: bow_half, prostrate, meditate, incense, circumambulate, tea (+ walk, sit)
 *  - 동석 참배객: 숲길 산책, 탑돌이, 좌복 절, 다실·정자 명상, 연등 바라보기
 *  - syncRemotePeers(peers): 실시간 멀티플레이어(Supabase Presence) 주입 훅
 *  - 블렌더 몸(avatarRig.js): GLB 가 받아지면 monk 는 스킨드 몸·구운 동작으로 바뀐다 (useRig). 상태·동작 API 는 그대로.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { L, walkHeight, stepMove, zoneAt, pathX, clamp } from './layout.js';
import { crossingAt, nearestTrail, deckRiseAt } from './trail.js';
import { faceTexture, softDotTexture } from './textures.js';
import { generateDharmaName } from '../data/templeData.js';
import { RigBody, rigLib, RIG_STYLES } from './avatarRig.js';
import { pickMotion, MOVING, SEATED, PROSTRATE } from '../core/avatarMotion.js';

const TAU = Math.PI * 2;
/** 이동 빠르기 (m/s) — 경내·숲길·탑돌이·참배객 모두 같다. 천천히 걷고 뛰지 않는다 (2026-11-06 사용자 결정). */
export const WALK_SPEED = 1.1;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
function angleDamp(a, b, k, dt) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * (1 - Math.exp(-k * dt));
}

/* ───── 포즈 ───── */
// rootY, skirtY(세로 비율), skirtW(가로), torso(앞숙임), head, arm[L/R] = [x,y,z] 어깨 회전, elbow[L/R]
// 팔 각도는 손 위치를 수치로 맞춘 값 (합장: 두 손이 가슴 앞에서 만남)
const G_L = [-0.1, -1.1, 0.75], G_R = [-0.1, 1.1, -0.75], G_E = -1.9;
const LAP_L = [-0.6, -1.35, -0.05], LAP_R = [-0.6, 1.35, 0.05], LAP_E = -0.6;
const P = {
  stand: { rootY: 0, skirtY: 1, skirtW: 1, torso: 0, head: 0, aL: [0.08, 0, 0.12], aR: [0.08, 0, -0.12], eL: -0.2, eR: -0.2, sit: 0 },
  gassho: { rootY: 0, skirtY: 1, skirtW: 1, torso: 0.04, head: 0.05, aL: G_L, aR: G_R, eL: G_E, eR: G_E, sit: 0 },
  bow: { rootY: 0, skirtY: 1, skirtW: 1, torso: 0.62, head: 0.18, aL: G_L, aR: G_R, eL: G_E, eR: G_E, sit: 0 },
  kneel: { rootY: -0.3, skirtY: 0.52, skirtW: 1.12, torso: 0.12, head: 0.08, aL: G_L, aR: G_R, eL: G_E, eR: G_E, sit: 0 },
  prostrate: { rootY: -0.36, skirtY: 0.46, skirtW: 1.15, torso: 1.38, head: 0.25, aL: [-2.75, 0, 0.15], aR: [-2.75, 0, -0.15], eL: -0.3, eR: -0.3, sit: 0 },
  sit: { rootY: -0.42, skirtY: 0.32, skirtW: 1.42, torso: 0.02, head: 0.12, aL: LAP_L, aR: LAP_R, eL: LAP_E, eR: LAP_E, sit: 1 },
  offerUp: { rootY: 0, skirtY: 1, skirtW: 1, torso: 0.1, head: -0.08, aL: [-1.2, -0.6, 0], aR: [-1.2, 0.6, 0], eL: -1.25, eR: -1.25, sit: 0 },
  offerDown: { rootY: 0, skirtY: 1, skirtW: 1, torso: 0.35, head: 0.15, aL: [-0.9, -0.6, 0], aR: [-0.9, 0.6, 0], eL: -1.0, eR: -1.0, sit: 0 },
  sip: { rootY: -0.42, skirtY: 0.32, skirtW: 1.42, torso: 0.0, head: -0.05, aL: LAP_L, aR: [-1.6, 1.3, -0.85], eL: LAP_E, eR: -1.35, sit: 1 },
  lookUp: { rootY: 0, skirtY: 1, skirtW: 1, torso: -0.08, head: -0.45, aL: [0.05, 0, 0.12], aR: [0.05, 0, -0.12], eL: -0.2, eR: -0.2, sit: 0 }
};

// 동작 시퀀스 [포즈, 지속(초)]
const SEQ = {
  bow_half: [['gassho', 0.55], ['bow', 0.9], ['gassho', 0.6], ['stand', 0.4]],
  // 천천히 7.6초 (자동 108배는 8초에 한 번). 블렌더 몸의 큰절 클립과 길이가 같아야 한다 — core/avatarMotion.js PROSTRATE
  prostrate: [['gassho', 1.1], ['kneel', 1.5], ['prostrate', 2.3], ['kneel', 1.4], ['gassho', 0.9], ['stand', 0.4]],
  incense: [['gassho', 0.5], ['offerUp', 1.1], ['offerDown', 0.8], ['gassho', 0.7], ['stand', 0.3]],
  // 신행을 마칠 때의 몸짓 — 블렌더 클립과 같은 길이 (절차식 몸은 비슷한 자세로)
  offer_stone: [['gassho', 0.45], ['kneel', 0.65], ['offerDown', 0.7], ['kneel', 0.55], ['gassho', 0.65]],
  write_tile: [['offerDown', 2.0], ['offerUp', 0.45], ['gassho', 0.4], ['stand', 0.35]],
  hang_lantern: [['offerDown', 0.35], ['offerUp', 0.75], ['lookUp', 1.2], ['gassho', 0.7]]
};

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/* ───── 재질 ───── */
function rimMaterial(color, rimColor, rimPower = 2.2, rimStrength = 0.9, extra = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uRim = { value: new THREE.Color(rimColor) };
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), ${rimPower.toFixed(2)});
        totalEmissiveRadiance += uRim * rim * ${rimStrength.toFixed(2)};`
      );
  };
  mat.customProgramCacheKey = () => `rim-${rimColor}-${rimPower}-${rimStrength}`;
  return mat;
}

const STYLE = {
  monk: { robe: 0x6f6d68, kasa: 0x7a3b2b, skin: '#e9d4b2', sock: 0xf2efe6, shoe: 0x3a3a3a },
  resident: { robe: 0x6f6b62, kasa: 0x8a4a2a, skin: '#e9d5b5', sock: 0xf2efe6, shoe: 0x2a2a2a },
  ink_wanderer: { robe: 0x1e1e22, kasa: 0x3a3a40, skin: '#e8dcc6', sock: 0xd8d4ca, shoe: 0x1a1a1a }
};

/** 가사: 왼어깨에서 오른허리로 비스듬히 두른 띠 */
function kasaGeometry() {
  const g = new THREE.TorusGeometry(0.235, 0.02, 6, 32);
  g.scale(1, 1, 2.8); // 고리 축 방향으로 넓혀 납작한 띠로
  g.rotateY(Math.PI / 2); // 어깨 위로 넘어가는 세로 고리
  g.scale(1, 1, 0.92);
  g.rotateZ(-0.62); // 왼어깨 → 오른허리
  g.translate(0, 0.2, 0);
  // 몸통(앞뒤 0.17m) 바깥으로 살짝 띄운다
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const r = Math.hypot(x, z / 0.86);
    if (r < 0.205) {
      const k = 0.205 / Math.max(r, 1e-3);
      p.setXYZ(i, x * k, p.getY(i), z * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

/* ───── 아바타 ───── */
export class Avatar {
  constructor(style = 'monk', { name = '', isPlayer = false, variant = null } = {}) {
    this.style = style;
    this.name = name;
    this.isPlayer = isPlayer;
    this.root = new THREE.Group();
    this.root.userData.avatar = this;
    this.pose = { ...P.stand, aL: [...P.stand.aL], aR: [...P.stand.aR] };
    this.seq = null;
    this.state = 'idle';
    this.walkPhase = 0;
    this.speed = 0;
    this.items = { wooden_mala: false, jade_mala: false, hand_lantern: false };
    this.heading = 0;
    this.variant = variant;
    this.body = new THREE.Group(); // 절차식 몸 (블렌더 몸으로 바뀌면 통째로 뗀다)
    this.root.add(this.body);
    if (!this.useRig()) style === 'lantern_spirit' ? this._buildSpirit() : this._buildHuman(variant || style);
    this._buildLabel();
    this.root.userData.eyeHeight = style === 'lantern_spirit' ? 1.05 : 1.2;
    this.root.userData.focusHeight = style === 'lantern_spirit' ? 0.9 : 0.95;
  }

  _buildHuman(styleKey) {
    const st = STYLE[styleKey] || STYLE.monk;
    const ink = this.style === 'ink_wanderer';
    // 옷·손·발은 정점색 + 재질 하나로 묶어 드로우콜을 줄인다
    const bodyMat = ink
      ? rimMaterial(0xffffff, '#9aa3ad', 2.4, 0.55, { vertexColors: true })
      : new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9 });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(st.skin), roughness: 0.55, metalness: 0.05 });
    const C = (hex) => new THREE.Color(hex);
    const paintGeo = (geo, color) => {
      const c = C(color);
      const n = geo.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return geo.index ? geo.toNonIndexed() : geo;
    };
    const place = (geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) => {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
      return geo.applyMatrix4(m);
    };
    this.mats = { bodyMat };

    // 치마(장삼 아랫단) — 루트에 붙고 앉으면 납작해진다
    const skirtProf = ink
      ? [[0.3, 0], [0.29, 0.1], [0.24, 0.42], [0.2, 0.6], [0.0, 0.62]]
      : [[0.27, 0], [0.26, 0.08], [0.22, 0.38], [0.185, 0.58], [0.0, 0.6]];
    const skirt = new THREE.Mesh(paintGeo(new THREE.LatheGeometry(skirtProf.map(([r, y]) => new THREE.Vector2(r, y)), 18), st.robe), bodyMat);
    skirt.castShadow = true;
    this.skirt = skirt;
    this.body.add(skirt);
    // 발 (신)
    this.feet = [];
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(paintGeo(place(new THREE.SphereGeometry(1, 8, 6), { scale: [0.06, 0.04, 0.11] }), st.shoe), bodyMat);
      f.position.set(s * 0.09, 0.035, 0.06);
      this.body.add(f);
      this.feet.push(f);
    }
    // 가부좌 다리
    const legs = new THREE.Mesh(paintGeo(place(new THREE.SphereGeometry(1, 14, 8), { scale: [0.34, 0.1, 0.22] }), st.robe), bodyMat);
    legs.position.set(0, 0.06, 0.1);
    legs.visible = false;
    legs.castShadow = true;
    this.body.add(legs);
    this.sitLegs = legs;

    // 몸통 (허리 피벗): 장삼 + 가사 + 깃을 한 메쉬로
    const hips = new THREE.Group();
    hips.position.y = 0.55;
    this.body.add(hips);
    this.hips = hips;
    const torsoProf = [[0.19, 0], [0.2, 0.12], [0.185, 0.3], [0.13, 0.4], [0.06, 0.44], [0.0, 0.45]];
    const torsoGeo = mergeGeometries([
      paintGeo(place(new THREE.LatheGeometry(torsoProf.map(([r, y]) => new THREE.Vector2(r, y)), 18), { scale: [1, 1, 0.86] }), st.robe),
      paintGeo(kasaGeometry(), st.kasa),
      paintGeo(place(new THREE.TorusGeometry(0.1, 0.022, 6, 20, Math.PI * 1.1), { pos: [0, 0.4, 0.04], rot: [Math.PI / 2 + 0.3, 0, Math.PI * 0.95] }), '#f0ece2')
    ]);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.castShadow = true;
    hips.add(torso);

    // 머리 (얼굴 텍스처 + 귀)
    const head = new THREE.Group();
    head.position.y = 0.44;
    hips.add(head);
    this.head = head;
    const headGeo = mergeGeometries([
      place(new THREE.SphereGeometry(0.2, 26, 18), { pos: [0, 0.19, 0], scale: [1, 1.04, 0.98] }).toNonIndexed(),
      place(new THREE.SphereGeometry(1, 6, 5), { pos: [0.198, 0.18, 0], scale: [0.025, 0.05, 0.035] }).toNonIndexed(),
      place(new THREE.SphereGeometry(1, 6, 5), { pos: [-0.198, 0.18, 0], scale: [0.025, 0.05, 0.035] }).toNonIndexed()
    ]);
    const skull = new THREE.Mesh(headGeo, faceMat);
    skull.castShadow = true;
    head.add(skull);
    if (ink) {
      // 삿갓
      const hatGeo = mergeGeometries([
        place(new THREE.ConeGeometry(0.42, 0.24, 24, 1, false), { pos: [0, 0.42, 0] }).toNonIndexed(),
        place(new THREE.SphereGeometry(0.03, 6, 4), { pos: [0, 0.55, 0] }).toNonIndexed()
      ]);
      const hat = new THREE.Mesh(hatGeo, rimMaterial(0x6d5b3a, '#c9b48a', 2.0, 0.35, { roughness: 0.95 }));
      hat.castShadow = true;
      head.add(hat);
      // 수묵 번짐 오라
      const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color: 0x1a1d22, transparent: true, opacity: 0.22, depthWrite: false }));
      aura.scale.set(1.5, 1.8, 1);
      aura.position.y = 0.75;
      this.body.add(aura);
    }

    // 팔: 윗팔 / 소매+손
    this.arms = {};
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.185, 0.355, 0);
      hips.add(shoulder);
      const upper = new THREE.Mesh(paintGeo(place(new THREE.CylinderGeometry(0.055, 0.075, 0.22, 10), { pos: [0, -0.11, 0] }), st.robe), bodyMat);
      upper.castShadow = true;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.22;
      shoulder.add(elbow);
      const lower = new THREE.Mesh(
        mergeGeometries([
          paintGeo(place(new THREE.CylinderGeometry(0.07, 0.1, 0.2, 10), { pos: [0, -0.1, 0] }), st.robe),
          paintGeo(place(new THREE.SphereGeometry(0.048, 10, 8), { pos: [0, -0.235, 0], scale: [0.85, 1.25, 0.6] }), st.skin)
        ]),
        bodyMat
      );
      lower.castShadow = true;
      elbow.add(lower);
      this.arms[side] = { shoulder, elbow };
    }

    // 단주 (공덕 보상)
    this.malaWood = this._beadRing(0x6a2a1c);
    this.arms.L.elbow.add(this.malaWood);
    this.malaJade = this._beadRing(0xe9efe6);
    this.arms.R.elbow.add(this.malaJade);
    // 찻잔 (다선)
    this.cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.055, 12), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.3 }));
    this.cup.position.set(0, -0.27, 0.03);
    this.cup.visible = false;
    this.arms.R.elbow.add(this.cup);
    // 향
    this.stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, emissive: 0x401000 }));
    this.stick.position.set(0, -0.3, 0.05);
    this.stick.rotation.x = 1.4;
    this.stick.visible = false;
    this.arms.R.elbow.add(this.stick);
    this._buildHandLantern(this.root);
  }

  /** 블렌더 몸으로 바꾼다 (GLB 가 받아져 있고 이 모습이 지원될 때). 상태·자리·소지품은 그대로 이어진다. */
  useRig() {
    if (this.rig || !RIG_STYLES.has(this.style) || !rigLib(this.style)) return false;
    const rig = new RigBody(this.style, this.variant);
    this.body.removeFromParent();
    this.body.traverse((o) => o.geometry?.dispose());
    this.body = rig.model;
    this.root.add(rig.model);
    this.rig = rig;
    this.spirit = null;
    if (this.style === 'lantern_spirit') {
      // 등불 정령: 몸 둘레 후광 (밤에 짙어진다) — 등불 몸 뼈에 붙인다
      this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color: 0xffc58a, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.halo.scale.setScalar(1.3);
      rig.head.add(this.halo);
      rig.model.traverse((o) => o.isMesh && o.material.emissive && (this.glow = o.material));
    }
    // 소품: 손목 단주, 오른손 찻잔·향. 자리·방향은 쉬는 자세(블렌더 좌표)의 손목·손바닥 기준 — tools/blender/avatar_clips.J
    //  왼손목 (0.342, -0.016, 0.487), 손끝 방향 (0.722, -0.12, -0.682), 오른손 손바닥 방향 (0.707, 0, -0.707)
    this.malaWood = this._beadRing(0x6a2a1c, 0.75);
    rig.attach(this.malaWood, 'handL', [0.349, -0.017, 0.48], [0.722, -0.12, -0.682]);
    this.malaJade = this._beadRing(0xe9efe6, 0.75);
    rig.attach(this.malaJade, 'handR', [-0.349, -0.017, 0.48], [-0.722, -0.12, -0.682]);
    this.cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.026, 0.048, 12), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.3 }));
    rig.attach(this.cup, 'handR', [-0.35, -0.022, 0.431], [0.707, 0, -0.707]);
    this.stick = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.24, 4), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, emissive: 0x401000 }));
    rig.attach(this.stick, 'handR', [-0.393, -0.025, 0.439], [-0.722, -0.12, -0.682]);
    // 신행 소품 (클립 메타의 propFrom~propTo 동안만): 돌탑 조약돌·기와·붓·연등·좌선 손 염주
    const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
    this.pebble = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 7).scale(1.2, 0.7, 1), mat(0x8d8a84));
    rig.attach(this.pebble, 'handR', [-0.35, -0.022, 0.431], [0.707, 0, -0.707]);
    this.tile = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.014, 0.085), mat(0x4a4a4e, { roughness: 0.9 }));
    rig.attach(this.tile, 'handL', [0.35, -0.022, 0.431], [-0.707, 0, -0.707]);
    this.brush = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.13, 6), mat(0x6b4a2a));
    rig.attach(this.brush, 'handR', [-0.401, -0.026, 0.43], [-0.722, -0.12, -0.682]);
    this.lotus = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10).scale(1, 0.85, 1), mat(0xf4a3b5, { emissive: 0xff9a7a, emissiveIntensity: 0.8 }));
    rig.attach(this.lotus, 'handR', [-0.35, -0.03, 0.43], [0.707, 0, -0.707]);
    this.handMala = this._beadRing(0x4a2a1c, 0.55);
    rig.attach(this.handMala, 'handR', [-0.37, -0.024, 0.45], [-0.722, -0.12, -0.682]);
    for (const o of [this.cup, this.stick, this.pebble, this.tile, this.brush, this.lotus, this.handMala]) o.visible = false;
    if (!this.handLantern) this._buildHandLantern(this.root);
    this.malaWood.visible = !!this.items.wooden_mala;
    this.malaJade.visible = !!this.items.jade_mala;
    return true;
  }

  _beadRing(color, k = 1) {
    // 염주알 14개를 한 지오메트리로 (아바타당 드로우콜 절약)
    const beads = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const b = new THREE.SphereGeometry(0.014, 6, 4);
      b.translate(Math.cos(a) * 0.058 * k, 0, Math.sin(a) * 0.05 * k);
      beads.push(b);
    }
    const g = new THREE.Mesh(mergeGeometries(beads), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05 }));
    if (k === 1) g.position.y = -0.18;
    g.visible = false;
    return g;
  }

  _buildHandLantern(parent) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf4a3b5, emissive: 0xff9a7a, emissiveIntensity: 1.3, roughness: 0.7 }));
    body.scale.set(1, 0.85, 1);
    g.add(body);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color: 0xffb07a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(0.55);
    halo.material.opacity = 0.4;
    g.add(halo);
    g.position.set(0.55, 0.72, 0.2);
    g.visible = false;
    parent.add(g);
    this.handLantern = g;
  }

  _buildSpirit() {
    const g = new THREE.Group();
    g.position.y = 0.95;
    this.body.add(g);
    this.spirit = g;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc070, emissiveIntensity: 2.6, roughness: 0.4 }));
    g.add(core);
    this.spiritCore = core;
    const petalGeo = new THREE.SphereGeometry(0.1, 8, 6, 0, TAU, 0, Math.PI / 2);
    petalGeo.scale(0.75, 1.9, 0.35);
    const petalMat = new THREE.MeshStandardMaterial({ color: 0xf6b4c4, emissive: 0xe0708a, emissiveIntensity: 0.9, roughness: 0.6, side: THREE.DoubleSide });
    const petalGeos = [];
    for (let ring = 0; ring < 3; ring++) {
      const n = 8 + ring * 2;
      for (let i = 0; i < n; i++) {
        const pg = petalGeo.clone();
        pg.rotateX(0.35 + ring * 0.38);
        pg.translate(0, -0.12 + ring * 0.02, 0.1 + ring * 0.05);
        pg.rotateY((i / n) * TAU + ring * 0.3);
        petalGeos.push(pg.toNonIndexed());
      }
    }
    this.petalMesh = new THREE.Mesh(mergeGeometries(petalGeos), petalMat);
    g.add(this.petalMesh);
    // 연잎 받침
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24, 0.2, TAU - 0.4), new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x18301a }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -0.16;
    g.add(pad);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color: 0xffc58a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(1.5);
    g.add(halo);
    this.spiritHalo = halo;
    // 맴도는 빛 입자
    const n = 18;
    const pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({ map: softDotTexture(), color: 0xffd9a0, size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes.frustumCulled = false;
    g.add(this.motes);
    // 그림자용 작은 몸
    const shadowCaster = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    shadowCaster.castShadow = true;
    g.add(shadowCaster);
    this._buildHandLantern(this.root);
  }

  _buildLabel() {
    const div = document.createElement('div');
    div.className = 'name-label' + (this.isPlayer ? ' me' : '');
    div.textContent = this.name;
    this.labelEl = div;
    this.label = new CSS2DObject(div);
    this.label.position.set(0, this.style === 'lantern_spirit' ? 1.55 : 1.6, 0);
    this.root.add(this.label);
  }

  setName(n) {
    this.name = n;
    this.labelEl.textContent = n;
  }

  setItems(items) {
    Object.assign(this.items, items);
    if (this.malaWood) this.malaWood.visible = !!items.wooden_mala;
    if (this.malaJade) this.malaJade.visible = !!items.jade_mala;
  }

  /** 시퀀스 동작 시작. 반환: 총 길이(초) */
  play(name, { hold = null } = {}) {
    let seq = SEQ[name];
    if (!seq) return 0;
    // 블렌더 몸이 반가부좌로 앉아 있다 큰절하면: 먼저 일어선다 (그 시간만큼 동작이 길다)
    const up = name === 'prostrate' && this.rig && SEATED.has(this.rig.name) && this.rig.has('stand_up') ? this.rig.lib.meta.clips.stand_up.duration : 0;
    if (up) seq = [['stand', up], ...seq];
    this.seq = { name, steps: seq, i: 0, t: 0, el: 0 };
    this.state = name;
    return seq.reduce((s, [, d]) => s + d, 0);
  }

  setState(state) {
    this.seq = null;
    this.state = state;
  }

  get busy() {
    return !!this.seq;
  }

  _targetPose(dt, t) {
    if (this.seq) {
      const s = this.seq;
      s.t += dt;
      while (s.i < s.steps.length && s.t >= s.steps[s.i][1]) {
        s.t -= s.steps[s.i][1];
        s.i++;
      }
      if (s.i >= s.steps.length) {
        const done = s.name;
        this.seq = null;
        this.state = this.restState || (this.sitting ? 'sit' : 'idle');
        this.onSeqEnd?.(done);
        return this._targetPose(0, t);
      }
      return P[s.steps[s.i][0]];
    }
    switch (this.state) {
      case 'sit':
      case 'meditate':
      case 'sutra':
        return P.sit;
      case 'tea':
        return (t % 7) < 2.6 ? P.sip : P.sit;
      case 'circumambulate':
        return P.gassho;
      case 'lookUp':
        return P.lookUp;
      default:
        return P.stand;
    }
  }

  /** 1인칭 눈 위치(월드): 절하고 앉고 걷는 머리를 그대로 따라간다 */
  eyeWorld(out) {
    if (this.rig) return this.rig.eyeWorld(out);
    if (this.spirit) {
      this.spirit.getWorldPosition(out);
      out.y += 0.06;
      return out;
    }
    this.head.updateWorldMatrix(true, false);
    return this.head.localToWorld(out.set(0, 0.2, 0.06));
  }

  update(dt, t, night) {
    const target = this._targetPose(dt, t);
    const k = 9;
    const p = this.pose;
    for (const key of ['rootY', 'skirtY', 'skirtW', 'torso', 'head', 'eL', 'eR', 'sit']) p[key] = damp(p[key], target[key], k, dt);
    for (let i = 0; i < 3; i++) {
      p.aL[i] = damp(p.aL[i], target.aL[i], k, dt);
      p.aR[i] = damp(p.aR[i], target.aR[i], k, dt);
    }
    const moving = this.speed > 0.15;
    if (moving) this.walkPhase += dt * this.speed * 4.2;
    const sw = moving ? Math.sin(this.walkPhase) : 0;
    const bob = moving ? Math.abs(Math.cos(this.walkPhase)) * 0.035 : Math.sin(t * 1.4 + this.root.id) * 0.004;

    if (this.spirit) {
      const s = this.spirit;
      const sink = p.rootY * 1.6;
      s.position.y = 0.95 + Math.sin(t * 1.6) * 0.06 + sink + bob;
      s.rotation.y += dt * (0.25 + (this.state === 'meditate' || this.state === 'sit' ? 0.1 : 0));
      s.rotation.x = p.torso * 0.35 + sw * 0.05;
      const open = 1 - p.torso * 0.25 + p.sit * 0.1;
      this.petalMesh.scale.set(open, 1 + (1 - open) * 0.3, open);
      const pulse = 1 + (this.seq ? Math.sin(this.seq.t * 6) * 0.25 : 0) + Math.sin(t * 2.2) * 0.06;
      this.spiritCore.material.emissiveIntensity = 2.2 * pulse + night * 0.8;
      this.spiritHalo.material.opacity = 0.35 + night * 0.4;
      const mp = this.motes.geometry.attributes.position;
      for (let i = 0; i < mp.count; i++) {
        const a = t * (0.6 + (i % 5) * 0.12) + i * 2.1;
        const r = 0.32 + (i % 3) * 0.08;
        mp.setXYZ(i, Math.cos(a) * r, Math.sin(t * 1.3 + i) * 0.25, Math.sin(a) * r);
      }
      mp.needsUpdate = true;
    } else if (this.rig) {
      this._updateRig(dt, t, night);
    } else {
      this.skirt.scale.set(p.skirtW, p.skirtY, p.skirtW);
      this.skirt.rotation.z = sw * 0.04;
      this.hips.position.y = 0.55 * p.skirtY + p.rootY * 0.35 + bob - (p.sit > 0.5 ? 0.02 : 0);
      this.hips.position.z = p.torso > 1 ? -0.1 : 0;
      this.hips.rotation.x = p.torso;
      this.hips.rotation.y = sw * 0.06;
      this.head.rotation.x = p.head;
      const swing = moving && this.state !== 'circumambulate' ? sw * 0.45 : 0;
      const A = this.arms;
      A.L.shoulder.rotation.set(p.aL[0] + swing, p.aL[1], p.aL[2]);
      A.R.shoulder.rotation.set(p.aR[0] - swing, p.aR[1], p.aR[2]);
      A.L.elbow.rotation.x = p.eL;
      A.R.elbow.rotation.x = p.eR;
      // 염주 굴리기: 가부좌 중 오른손 미세 움직임
      if (this.state === 'meditate') A.R.elbow.rotation.z = Math.sin(t * 3) * 0.06;
      this.sitLegs.visible = p.sit > 0.5;
      this.feet.forEach((f, i) => {
        f.visible = p.sit < 0.5 && p.skirtY > 0.7;
        f.position.z = 0.06 + (moving ? (i ? sw : -sw) * 0.09 : 0);
        f.position.y = 0.035 + (moving ? Math.max(0, i ? sw : -sw) * 0.03 : 0);
      });
      this.cup.visible = this.state === 'tea';
      this.stick.visible = this.seq?.name === 'incense' && this.seq.i >= 1 && this.seq.i <= 2;
    }
    if (this.handLantern) {
      const on = this.items.hand_lantern && night > 0.4;
      this.handLantern.visible = on;
      if (on) {
        this.handLantern.position.set(0.55 + Math.sin(t * 0.9) * 0.05, 0.72 + Math.sin(t * 1.3) * 0.05 + p.rootY * 0.6, 0.2);
      }
    }
    // 절차식 몸의 큰절에도 같은 때 도복 소리 (블렌더 몸은 클립 시각으로 RigBody 가 낸다)
    if (!this.rig && this.seq?.name === 'prostrate' && this.onRustle) {
      const e0 = this.seq.el;
      this.seq.el += dt;
      for (const [at, len, s] of PROSTRATE.rustle) if (e0 < at && this.seq.el >= at) this.onRustle(s, len);
    }
    // 걸음 이벤트 (블렌더 몸은 발이 실제로 닿는 순간에 _updateRig 가 부른다)
    if (moving && !this.rig) {
      const step = Math.floor(this.walkPhase / Math.PI);
      if (step !== this._lastStep) {
        this._lastStep = step;
        this.onStep?.();
      }
    }
  }

  /** 블렌더 몸: 상태·속도·구역으로 클립을 고르고 섞는다 (한 번짜리 동작의 길이·끝은 _targetPose 가 그대로 잰다) */
  _updateRig(dt, t, night) {
    const r = this.rig;
    const p = this.root.position;
    const zone = zoneAt(p.x, p.z);
    const name = pickMotion({ seq: this.seq?.name, state: this.state, speed: this.speed, zone, seated: this.sitting, has: r.has });
    r.play(name, !!this.seq && this.seq !== this._rigSeq && r.name === name, this.speed > MOVING);
    this._rigSeq = this.seq;
    r.update(dt, this.speed, this.onStep, this.onRustle);
    this.cup.visible = r.name === 'tea' || r.name === 'serve_tea';
    this.stick.visible = r.propOn('incense');
    this.pebble.visible = r.propOn('offer_stone');
    this.tile.visible = r.propOn('write_tile');
    this.brush.visible = r.propOn('write_tile') || r.name === 'sutra';
    this.lotus.visible = r.propOn('hang_lantern');
    this.handMala.visible = r.name === 'meditate';
    // 삿갓은 법당 안에서, 큰절할 때 벗는다
    if (r.hat) r.hat.visible = zone !== 'DAEUNGJEON' && r.name !== 'prostrate';
    if (this.glow) {
      // 낮에는 은은하게(햇빛 아래 하얗게 뭉개지지 않게), 밤에는 등불처럼 — 게임 안 캡처로 맞춘 값
      this.glow.emissiveIntensity = 0.3 + 0.9 * night + 0.05 * Math.sin(t * 2.2);
      this.halo.material.opacity = 0.1 + night * 0.4;
    }
  }

  dispose() {
    this.rig?.dispose();
    this.label.element.remove();
    this.root.removeFromParent();
  }
}

const _prev = new THREE.Vector3();

/* ───── 동석 참배객 시나리오 ───── */
const VISITOR_PLANS = [
  { role: 'walker', style: 'monk' },
  { role: 'walker', style: 'ink_wanderer' },
  { role: 'circler', style: 'monk' },
  { role: 'circler', style: 'lantern_spirit' },
  // 좌복 번호 = 줄 × 13 + 칸 (temple.js: 5줄 × 13, 칸 6 이 가운데). 예불 듣기 자리(셋째 줄 가운데, 32)는 비워 둔다
  { role: 'bower', style: 'monk', cushion: 18 },
  { role: 'bower', style: 'ink_wanderer', cushion: 34 },
  { role: 'meditator', style: 'monk', cushion: 43 },
  { role: 'meditator', style: 'lantern_spirit', cushion: 7 },
  { role: 'gazer', style: 'monk' },
  { role: 'pavilion', style: 'ink_wanderer' },
  { role: 'walker', style: 'lantern_spirit' }
];

export class AvatarManager {
  /**
   * @param scene THREE.Scene
   * @param temple Temple (좌복·자리 정보)
   * @param hooks { onToast(msg), onBowReply(avatar), onStep(surface) }
   */
  constructor(scene, temple, hooks = {}) {
    this.scene = scene;
    this.temple = temple;
    this.hooks = hooks;
    this.visitors = [];
    this.remote = new Map();
    this.player = null;
    this.moveTarget = null;
    this.circling = null;
  }

  initPlayer(style, name, items, pos = L.spawn, ry = Math.PI) {
    const prev = this.player;
    const av = new Avatar(style, { name, isPlayer: true });
    av.setItems(items);
    if (prev) {
      av.root.position.copy(prev.root.position);
      av.heading = prev.heading;
      av.sitting = prev.sitting;
      av.seat = prev.seat;
      if (prev.sitting) av.setState(prev.state === 'tea' || prev.state === 'meditate' ? prev.state : 'sit');
      prev.dispose();
    } else {
      av.root.position.set(pos.x, walkHeight(pos.x, pos.z), pos.z);
      av.heading = ry;
    }
    av.root.rotation.y = av.heading;
    av.onStep = () => this.hooks.onStep?.(this.surfaceAt(av.root.position));
    av.onRustle = (s, len) => this.hooks.onRustle?.(s, len);
    this.scene.add(av.root);
    this.player = av;
    return av;
  }

  /** GLB 가 늦게 받아졌을 때: 지금 있는 아바타(나·참배객·도반)를 제자리에서 블렌더 몸으로 바꾼다 */
  upgradeRigs() {
    const all = [this.player, ...this.visitors.map((v) => v.av), ...[...this.remote.values()].map((r) => r.av)];
    let n = 0;
    for (const av of all) if (av?.useRig()) n++;
    return n;
  }

  surfaceAt(p) {
    const z = zoneAt(p.x, p.z);
    if (z === 'DAEUNGJEON') return 'wood';
    if (z === 'COURTYARD') return Math.abs(p.x) < 1.8 || Math.hypot(p.x - L.pagoda.x, p.z - L.pagoda.z) < 5.3 ? 'stone' : 'gravel';
    if (Math.abs(p.x - L.bridge.x) < 1.6 && Math.abs(p.z - 15) < 4) return 'stone';
    const cr = crossingAt(p.x, p.z);
    if (cr) return cr.kind === 'bridge' ? 'wood' : 'stone';
    if (deckRiseAt(nearestTrail(p.x, p.z)) > 0.2) return 'wood';
    return 'earth';
  }

  get playerPos() {
    return this.player.root.position;
  }

  /* ───── 이동 ───── */
  /** via: 먼저 지날 경유점들 [{x,z}] (산책로를 따라 걷기 — 경유점에서는 멈추지 않고 지나간다) */
  moveTo(x, z, onArrive, via = null) {
    this.standUp();
    this.circling = null;
    this.moveTarget = via?.length ? { x: via[0].x, z: via[0].z, via: via.slice(1), final: { x, z }, onArrive } : { x, z, onArrive };
  }

  teleport(x, z, ry) {
    this.standUp();
    this.circling = null;
    this.moveTarget = null;
    const p = this.player.root.position;
    p.set(x, walkHeight(x, z), z);
    this.player.heading = ry ?? this.player.heading;
    this.player.root.rotation.y = this.player.heading;
  }

  sitAt(seat, state = 'sit') {
    const pl = this.player;
    this.moveTarget = null;
    this.circling = null;
    if (pl.seat && pl.seat !== seat && pl.seat.occupant === pl) pl.seat.occupant = null;
    pl.sitting = true;
    pl.seat = seat;
    if (seat.occupant !== undefined) seat.occupant = pl;
    pl.returnPos = pl.returnPos || { x: pl.root.position.x, z: pl.root.position.z };
    pl.root.position.set(seat.x, seat.y, seat.z);
    pl.heading = seat.ry ?? Math.PI;
    pl.root.rotation.y = pl.heading;
    pl.setState(state);
    pl.root.userData.eyeHeight = pl.style === 'lantern_spirit' ? 0.8 : 0.82;
    pl.root.userData.focusHeight = 0.65;
  }

  standUp() {
    const pl = this.player;
    if (!pl || !pl.sitting) return;
    pl.sitting = false;
    if (pl.seat && pl.seat.occupant === pl) pl.seat.occupant = null;
    const back = pl.seat?.standAt || pl.returnPos;
    pl.seat = null;
    pl.returnPos = null;
    if (back) pl.root.position.set(back.x, walkHeight(back.x, back.z), back.z);
    pl.restState = null; // 앉아서 쉬던 몸짓(차·가부좌)이 다음 동작 뒤에 선 채로 되살아나지 않게
    pl.setState('idle');
    pl.root.userData.eyeHeight = pl.style === 'lantern_spirit' ? 1.05 : 1.2;
    pl.root.userData.focusHeight = pl.style === 'lantern_spirit' ? 0.9 : 0.95;
    this.hooks.onStandUp?.();
  }

  /** 빈 좌복 (타인이 앉은 좌복은 제외) */
  freeCushionNear(x, z) {
    let best = null, bd = Infinity;
    for (const c of this.temple.cushions) {
      if (c.occupant && c.occupant !== this.player) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  cushionSeat(c) {
    return { ...c, ry: Math.PI, standAt: { x: c.x, z: c.z + 0.7 }, _ref: c, get occupant() { return c.occupant; }, set occupant(v) { c.occupant = v; } };
  }

  /* ───── 동작 ───── */
  triggerAction(name) {
    const pl = this.player;
    switch (name) {
      case 'bow_half':
        if (pl.sitting) return 0;
        this.moveTarget = null;
        this._bowReplies();
        return pl.play('bow_half');
      case 'prostrate':
        this.moveTarget = null;
        if (pl.sitting && pl.seat?.kind !== 'cushion') this.standUp();
        pl.sitting = false;
        return pl.play('prostrate');
      case 'incense':
        if (pl.sitting) this.standUp();
        this.moveTarget = null;
        return pl.play('incense');
      case 'meditate':
        this.moveTarget = null;
        if (!pl.sitting) {
          pl.sitting = true;
          pl.returnPos = { x: pl.root.position.x, z: pl.root.position.z };
          pl.root.userData.eyeHeight = 0.82;
          pl.root.userData.focusHeight = 0.65;
        }
        pl.setState('meditate');
        return 0;
      case 'tea':
        this.moveTarget = null;
        if (!pl.sitting) {
          pl.sitting = true;
          pl.returnPos = { x: pl.root.position.x, z: pl.root.position.z };
          pl.root.userData.eyeHeight = 0.82;
          pl.root.userData.focusHeight = 0.65;
        }
        pl.setState('tea');
        return 0;
      case 'circumambulate':
        this.standUp();
        this.startCircling();
        return 0;
    }
    return 0;
  }

  startCircling() {
    const pl = this.player.root.position;
    const pg = L.pagoda;
    const a = Math.atan2(pl.z - pg.z, pl.x - pg.x);
    this.circling = { angle: a, loops: 0, start: a, travelled: 0 };
    // 원 위로 먼저 걸어간다
    const r = pg.radius;
    this.moveTarget = { x: pg.x + Math.cos(a) * r, z: pg.z + Math.sin(a) * r, keepCircling: true };
  }

  _bowReplies() {
    const p = this.player.root.position;
    const near = this.visitors
      .filter((v) => !v.hidden && !v.av.busy && v.av.root.position.distanceTo(p) < 6)
      .sort((a, b) => a.av.root.position.distanceTo(p) - b.av.root.position.distanceTo(p))
      .slice(0, 2);
    near.forEach((v, i) => {
      setTimeout(() => {
        const vp = v.av.root.position;
        v.faceTo = Math.atan2(p.x - vp.x, p.z - vp.z);
        v.pause = 3.2;
        const wasSitting = v.av.sitting;
        if (!wasSitting) v.av.play('bow_half');
        else v.av.play('bow_half'), (v.av.sitting = true);
        this.hooks.onBowReply?.(v.av);
      }, 700 + i * 900);
    });
    return near.length;
  }

  /* ───── 참배객 ───── */
  spawnAmbientVisitors() {
    const used = new Set();
    const names = new Set();
    VISITOR_PLANS.forEach((plan, i) => {
      let name = generateDharmaName();
      while (names.has(name)) name = generateDharmaName();
      names.add(name);
      const av = new Avatar(plan.style, { name });
      av.setItems({ wooden_mala: i % 3 === 0, jade_mala: i % 5 === 0, hand_lantern: i % 2 === 0 });
      const v = { av, plan, t: Math.random() * 10, pause: 0, wp: 0 };
      this._initVisitor(v, i, used);
      this.scene.add(av.root);
      this.visitors.push(v);
    });
    // 상주 스님 두 분
    const hallMonk = new Avatar('monk', { name: '청연 스님', variant: 'resident' });
    hallMonk.setItems({ wooden_mala: true });
    hallMonk.root.position.set(-4.6, L.hall.floorY + 0.02, L.altar.z + 0.9); // 불단 왼쪽 앞, 대중을 옆으로 보고
    hallMonk.heading = Math.PI / 2;
    hallMonk.sitting = true;
    hallMonk.setState('meditate');
    this.scene.add(hallMonk.root);
    this.visitors.push({ av: hallMonk, plan: { role: 'resident' }, t: 0, pause: 0 });
    const ms = this.temple.monkSeat;
    const teaMonk = new Avatar('monk', { name: '심검당 선사', variant: 'resident' });
    teaMonk.root.position.set(ms.x, ms.y, ms.z);
    teaMonk.heading = ms.ry;
    teaMonk.sitting = true;
    teaMonk.setState('sit');
    this.scene.add(teaMonk.root);
    this.teaMonk = teaMonk;
    this.visitors.push({ av: teaMonk, plan: { role: 'resident' }, t: 0, pause: 0 });
    this.visitors.forEach((v) => (v.av.root.rotation.y = v.av.heading));
  }

  _initVisitor(v, i, used) {
    const av = v.av;
    const role = v.plan.role;
    const set = (x, z, ry = 0) => {
      av.root.position.set(x, walkHeight(x, z), z);
      av.heading = ry;
    };
    if (role === 'walker') {
      const path = [];
      for (let z = 42; z > 8; z -= 4) path.push([pathX(z) + (i % 2 ? 0.7 : -0.7), z]);
      path.push([0.6, 3.6], [-4, -1], [-9, -9], [-3, -13], [6, -11], [9, -2], [3, 3]);
      v.path = path;
      v.wp = Math.floor(Math.random() * path.length);
      v.dir = i % 2 ? 1 : -1;
      const [x, z] = path[v.wp];
      set(x, z);
    } else if (role === 'circler') {
      v.angle = i * 2.1;
      v.r = L.pagoda.radius + (i % 2 ? 0.45 : -0.15);
      set(L.pagoda.x + Math.cos(v.angle) * v.r, L.pagoda.z + Math.sin(v.angle) * v.r);
      av.setState('circumambulate');
    } else if (role === 'bower' || role === 'meditator') {
      const c = this.temple.cushions[v.plan.cushion];
      c.occupant = av;
      used.add(c.index);
      av.root.position.set(c.x, c.y, c.z);
      av.heading = Math.PI;
      av.sitting = true;
      av.setState(role === 'meditator' ? 'meditate' : 'sit');
      v.next = 2 + Math.random() * 4;
    } else if (role === 'gazer') {
      set(-6.5 + Math.random(), -6, Math.PI * 0.9);
      av.setState('lookUp');
    } else if (role === 'pavilion') {
      const px = L.pond.x + L.pond.rx + 0.55, pz = L.pond.z + 0.6;
      av.root.position.set(px, L.teahouseTerrace.y + 0.36, pz);
      av.heading = Math.PI / 2 + Math.PI;
      av.sitting = true;
      av.setState('meditate');
    }
  }

  _updateVisitor(v, dt, t) {
    const av = v.av;
    const p = av.root.position;
    let speed = 0;
    if (v.pause > 0) {
      v.pause -= dt;
      if (v.faceTo != null) av.heading = angleDamp(av.heading, v.faceTo, 5, dt);
      if (v.pause <= 0) v.faceTo = null;
    } else if (v.plan.role === 'walker') {
      const [tx, tz] = v.path[v.wp];
      const dx = tx - p.x, dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4) {
        v.wp += v.dir;
        if (v.wp >= v.path.length || v.wp < 0) {
          v.dir *= -1;
          v.wp += v.dir * 2;
        }
        if (Math.random() < 0.18) {
          v.pause = 2 + Math.random() * 3;
          if (Math.random() < 0.5) av.play('bow_half');
        }
      } else {
        speed = WALK_SPEED;
        const nx = p.x + (dx / d) * speed * dt, nz = p.z + (dz / d) * speed * dt;
        const m = stepMove(p.x, p.z, nx, nz);
        p.x = m.x;
        p.z = m.z;
        av.heading = angleDamp(av.heading, Math.atan2(dx, dz), 4, dt);
      }
      p.y = damp(p.y, walkHeight(p.x, p.z), 12, dt);
    } else if (v.plan.role === 'circler') {
      const pg = L.pagoda;
      v.angle += dt * (WALK_SPEED / v.r); // 우요 — 탑을 오른쪽에 두고
      const nx = pg.x + Math.cos(v.angle) * v.r, nz = pg.z + Math.sin(v.angle) * v.r;
      av.heading = Math.atan2(nx - p.x, nz - p.z);
      p.set(nx, walkHeight(nx, nz), nz);
      speed = WALK_SPEED;
    } else if (v.plan.role === 'bower') {
      v.next -= dt;
      if (v.next <= 0 && !av.busy) {
        av.play('prostrate');
        av.sitting = true;
        v.next = 4.6 + Math.random() * 2.5;
      }
    } else if (v.plan.role === 'gazer') {
      v.next = (v.next ?? 6) - dt;
      if (v.next <= 0) {
        av.play('bow_half');
        v.next = 10 + Math.random() * 8;
      }
    }
    av.speed = damp(av.speed, speed, 6, dt);
    av.root.rotation.y = angleDamp(av.root.rotation.y, av.heading, 8, dt);
  }

  /**
   * docs/03 로드맵 Step 2: 실시간 동석 피어 주입.
   * peers: [{ id, dharmaName, avatarStyle, x, y, z, ry, actionState }]
   */
  syncRemotePeers(peers = []) {
    const seen = new Set();
    for (const peer of peers) {
      seen.add(peer.id);
      let r = this.remote.get(peer.id);
      if (!r || r.av.style !== peer.avatarStyle) {
        r?.av.dispose();
        const av = new Avatar(peer.avatarStyle || 'monk', { name: peer.dharmaName || '도반' });
        av.labelEl.classList.add('peer'); // 실제 접속한 도반은 이름 빛깔을 달리한다
        av.root.position.set(peer.x, peer.y, peer.z);
        this.scene.add(av.root);
        r = { av, target: new THREE.Vector3(), ry: 0, action: null, seq: null };
        this.remote.set(peer.id, r);
      }
      if (peer.dharmaName && r.av.name !== peer.dharmaName) r.av.setName(peer.dharmaName);
      r.target.set(peer.x, peer.y, peer.z);
      r.ry = peer.ry ?? 0;
      // 같은 동작을 거듭해도(큰절 연속) 순번(actionSeq)이 바뀌면 다시 재생
      // 사경 서안 자리에 앉은 도반은 사경 중 ('sit' 으로 오지만 붓으로 쓰는 모습으로 — avatarMotion.wireState)
      const ss = this.temple.sutraSeat;
      const state = peer.actionState === 'sit' && ss && Math.hypot(peer.x - ss.x, peer.z - ss.z) < 0.35 ? 'sutra' : peer.actionState;
      if (state && (state !== r.action || peer.actionSeq !== r.seq)) {
        r.action = state;
        r.seq = peer.actionSeq;
        r.av.sitting = ['sit', 'meditate', 'tea', 'sutra'].includes(state);
        r.av.restState = r.av.sitting ? state : null;
        if (SEQ[state]) r.av.play(state);
        else r.av.setState(state);
      }
    }
    for (const [id, r] of this.remote) {
      if (!seen.has(id)) {
        r.av.dispose();
        this.remote.delete(id);
      }
    }
    // 실제 도반이 앉은 좌복은 비어 있지 않다
    for (const c of this.temple.cushions) if (c.occupant?.remotePeer) c.occupant = null;
    for (const r of this.remote.values()) {
      if (!r.av.sitting) continue;
      const c = this.temple.cushions.find((k) => !k.occupant && Math.hypot(k.x - r.target.x, k.z - r.target.z) < 0.45);
      if (c) {
        r.av.remotePeer = true;
        c.occupant = r.av;
      }
    }
  }

  /** 실제 도반이 많아지면 NPC 참배객을 그만큼 줄인다 (상주 스님은 남긴다) */
  setNpcBudget(n) {
    let left = n;
    for (const v of this.visitors) {
      if (v.plan.role === 'resident') continue;
      const on = left-- > 0;
      v.hidden = !on;
      v.av.root.visible = on;
      if (!on) for (const c of this.temple.cushions) if (c.occupant === v.av) c.occupant = null;
    }
  }

  get npcCount() {
    return this.visitors.filter((v) => !v.hidden).length;
  }

  get remotePeers() {
    return [...this.remote.entries()].map(([id, r]) => ({ id, name: r.av.name, position: r.av.root.position }));
  }

  /** 지금 함께 머무는 도반 수 */
  get presenceCount() {
    return this.visitors.length + this.remote.size;
  }

  /**
   * @param input { x, z } 월드 이동 벡터(-1..1)
   */
  update(dt, t, input, night) {
    const pl = this.player;
    const p = pl.root.position;
    let speed = 0;
    const len = Math.hypot(input.x, input.z);
    if (len > 0.08) {
      if (pl.sitting) this.standUp();
      this.moveTarget = null;
      this.circling = null;
      if (pl.busy) pl.seq = null;
      const sp = WALK_SPEED * Math.min(len, 1);
      const nx = p.x + (input.x / len) * sp * dt * Math.min(len, 1), nz = p.z + (input.z / len) * sp * dt * Math.min(len, 1);
      const m = stepMove(p.x, p.z, nx, nz);
      speed = Math.hypot(m.x - p.x, m.z - p.z) / dt;
      p.x = m.x;
      p.z = m.z;
      pl.heading = input.face ?? Math.atan2(input.x, input.z); // 1인칭은 뒤로 걸어도 몸을 돌리지 않는다
    } else if (this.moveTarget && !pl.busy) {
      const mt = this.moveTarget;
      if (mt.via && Math.hypot(mt.x - p.x, mt.z - p.z) < 0.8) {
        const next = mt.via.length ? mt.via.shift() : mt.final;
        mt.x = next.x;
        mt.z = next.z;
        if (next === mt.final) mt.via = null;
      }
      const dx = mt.x - p.x, dz = mt.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.12) {
        this.moveTarget = null;
        if (mt.keepCircling && this.circling) this.circling.ready = true;
        mt.onArrive?.();
      } else {
        const sp = Math.min(WALK_SPEED, d * 3 + 0.4);
        const nx = p.x + (dx / d) * sp * dt, nz = p.z + (dz / d) * sp * dt;
        const m = stepMove(p.x, p.z, nx, nz);
        const moved = Math.hypot(m.x - p.x, m.z - p.z);
        speed = moved / dt;
        p.x = m.x;
        p.z = m.z;
        pl.heading = Math.atan2(dx, dz);
        // 막혀서 못 가면 포기
        mt.stuck = moved < sp * dt * 0.15 ? (mt.stuck || 0) + dt : 0;
        if (mt.stuck > 0.6) {
          this.moveTarget = null;
          mt.onArrive?.();
        }
      }
    } else if (this.circling?.ready && !pl.busy) {
      const c = this.circling;
      const pg = L.pagoda;
      const step = dt * (WALK_SPEED / pg.radius);
      c.angle += step; // 우요(右繞): 위에서 보아 시계 방향, 탑이 늘 오른쪽 (+x 동·-z 북 좌표에서는 각도가 늘어나는 쪽)
      c.travelled += step;
      if (c.travelled >= TAU) {
        c.travelled -= TAU;
        c.loops++;
        this.hooks.onCircleLoop?.(c.loops);
      }
      const nx = pg.x + Math.cos(c.angle) * pg.radius, nz = pg.z + Math.sin(c.angle) * pg.radius;
      pl.heading = Math.atan2(nx - p.x, nz - p.z);
      p.x = nx;
      p.z = nz;
      speed = WALK_SPEED;
      pl.state = 'circumambulate';
    }
    if (!pl.sitting) p.y = damp(p.y, walkHeight(p.x, p.z), 14, dt);
    pl.speed = damp(pl.speed, speed, 10, dt);
    if (pl.speed > 0.2 && pl.state === 'idle') pl.state = 'idle';
    pl.root.rotation.y = angleDamp(pl.root.rotation.y, pl.heading, 10, dt);
    pl.update(dt, t, night);

    // solo: 예불 듣기 — 나 말고는 아무도 보이지 않는다 (움직임·자리는 그대로 이어간다)
    for (const v of this.visitors) {
      v.av.root.visible = !v.hidden && !this.solo;
      if (v.hidden) continue;
      if (v.plan.role !== 'resident') this._updateVisitor(v, dt, t);
      v.av.update(dt, t, night);
      const dist = v.av.root.position.distanceTo(p);
      v.av.labelEl.style.opacity = dist < 9 ? String(clamp((9 - dist) / 3, 0, 0.85)) : '0';
    }
    for (const r of this.remote.values()) {
      r.av.root.visible = !this.solo;
      const before = _prev.copy(r.av.root.position);
      r.av.root.position.lerp(r.target, 1 - Math.exp(-dt * 6));
      const moved = dt > 0 ? r.av.root.position.distanceTo(before) / dt : 0;
      r.av.speed = damp(r.av.speed, r.av.root.position.distanceTo(r.target) > 0.05 ? moved : 0, 6, dt);
      r.av.root.rotation.y = angleDamp(r.av.root.rotation.y, r.ry, 8, dt);
      r.av.update(dt, t, night);
      const d = r.av.root.position.distanceTo(p);
      r.av.labelEl.style.opacity = d < 14 ? String(clamp((14 - d) / 4, 0, 0.95)) : '0';
    }
    pl.labelEl.style.opacity = pl.speed > 0.3 ? '0' : '0.75';
  }
}
