// 실사 세계 (출시판 3단계, docs/superpowers/plans/2026-11-05-launch-stage3-real.md)
// templeScene.build() 가 플래그(REAL_WORLD)가 켜졌을 때만 동적으로 불러온다 — 꺼지면 이 파일도 에셋도 받지 않는다.
// 절차적 세계는 그대로 두고, temple.js 가 userData.realSlot 을 단 물체를 정적 병합에서 빼 두었다가
// 실사 GLB 가 도착하면 바꿔 끼운다. 못 받으면 절차적 그대로. 저사양(q=low, 폰)은 스캔 GLB(석탑)만 빼고
// 사진 판(불상·후불벽)과 사진 재질은 그대로 받는다 — 사진 판 한 장이 조각 불상보다 가볍다 (사용자 2026-11-07 「불상이 다시 폴리곤」).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as THREE from 'three';
import { L, addBoxCollider } from '../layout.js';
import { mats } from '../materials.js';

const BASIS = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/';
const ASSETS = './assets/world/';

export const SLOTS = {
  pagoda: {
    // 국가유산청 「경주 고선사지 삼층석탑」 3D 스캔 (tools/blender/scan_bake.py). 스캔 실측: 하층기단 6.5×6.5m(축과 나란함),
    // 높이 10.84m, 맨 아래 0.15m 는 남은 지면 조각. 탑돌이 반경(L.pagoda.radius 4.5, 도반은 4.35m 까지 붙음) 안쪽에
    // 기단 반대각이 3.8m 로 들어가게 0.83배 — 설계값 (높이 약 8.9m).
    url: 'pagoda_1024.glb',
    scale: 0.83,
    sink: 0.15,
    rotY: 0,
    half: 6.5 / 2, // 충돌 상자 반폭 (스캔 m)
    at: () => [L.pagoda.x, L.courtyard.y, L.pagoda.z],
    loadWithin: 90 // 플레이어가 이 거리(m) 안이면 받기 시작 — 첫 입장(숲길) 예산 밖, 입장 뒤 뒤에서
  },
  // 불상은 3D 모델 대신 생성형 사진(배경을 뺀 컷아웃)을 세운 판 — 사용자 결정 2026-11-06 「불상만 이미지로」.
  // 판 높이·자리는 절차적 불상(대좌·광배 포함)의 경계 상자를 그대로 따른다. 사진은 정면(+z)을 본다.
  buddha: { card: 'buddha/sakyamuni.webp', at: () => [0, 0, L.altar.z], loadWithin: 60 },
  bodhiL: { card: 'buddha/bodhisattva_l.webp', at: () => [-6.5, 0, L.altar.z], loadWithin: 60 },
  bodhiR: { card: 'buddha/bodhisattva_r.webp', at: () => [6.5, 0, L.altar.z], loadWithin: 60 },
  // 후불벽: 생성형 벽면 사진 세 칸 (사용자 2026-11-06 「뒤 벽면도 더 디테일하게 생성형 이미지로」).
  // 기존 옻칠 판·탱화·액자(temple.js _hall)는 그대로 두고 바로 앞에 세운다 — 칸 이음매는 뒤 기둥(x ±2.8)이 가린다.
  // 사진은 칸 비율(폭 ÷ 벽 높이)에 맞춰 둔다 — tools/spike/wall_fit.py 가 그림은 그대로 두고 맨 아래 세로 널판 띠만 늘린다.
// 판 폭 = 칸 폭, 높이 = 폭 ÷ 비율(= 벽 높이, temple.js: 기둥 − 0.05), 위끝 = 후불벽 판 위끝.
  wallC: { wall: [L.hall.xs[2], L.hall.xs[3]], img: 'wall/hubul_center.webp', at: () => [0, 0, L.altar.z], loadWithin: 60 },
  // 대웅전 5×3칸 확장(2026-11-06, session-3): 그림 판은 가운데 세 칸(기둥 ±2.8·±7.4)에만 — 바깥 두 칸은 옻칠 판 그대로
  wallL: { wall: [L.hall.xs[1] + 0.15, L.hall.xs[2]], img: 'wall/hubul_left.webp', at: () => [L.hall.xs[1], 0, L.altar.z], loadWithin: 60 },
  wallR: { wall: [L.hall.xs[3], L.hall.xs[4] - 0.15], img: 'wall/hubul_right.webp', at: () => [L.hall.xs[4], 0, L.altar.z], loadWithin: 60 }
};
const WALL_H = L.hall.colH - 0.05; // 후불벽 판 위끝 = 기둥 높이 − 0.05 (temple.js)
const WALL_Z = 0.23; // L.hall.z0 에서 앞으로 (탱화 금테 앞면 0.185 보다 앞, 기둥 앞면 약 0.29 보다 뒤)

// 공용 재질(materials.js mats())의 그림 텍스처를 사진 PBR(Poly Haven CC0, tools/spike/textures.py 로 팔레트 맞춤)로.
// 기존 UV·반복(repeat)을 그대로 이어받으므로 형상·병합과 무관하다. 화강암·회벽은 상자 UV 에서 결이 늘어져(시험 화면) 빼 둔다.
export const MATERIALS = {
  floor: { map: 'floor_diff', normal: 'floor_nor', orm: 'floor_arm' },
  column: { map: 'column_diff', normal: 'wood_nor', orm: 'wood_arm' },
  wood: { map: 'wood_diff', normal: 'wood_nor', orm: 'wood_arm' },
  woodDark: { map: 'wood_diff', normal: 'wood_nor', orm: 'wood_arm' }
};

/** 정적 병합 전에 부른다: 교체 자리를 병합에서 빼 둔다 */
export function prepareReal(world) {
  const low = world.quality === 'low';
  const slots = new Map();
  world.scene.traverse((o) => {
    const k = o.userData.realSlot;
    if (k && SLOTS[k] && !slots.has(k) && !(low && SLOTS[k].url)) slots.set(k, o); // 저사양: GLB 자리는 병합에 그대로 둔다
  });
  for (const o of slots.values()) o.traverse((m) => m.isMesh && (m.userData.noBatch = true));
  for (const [k, s] of Object.entries(SLOTS)) if (s.wall) slots.set(k, null); // 덧대는 판 — 바꿀 절차적 물체가 없다
  const real = new RealWorld(world, slots);
  real.upgradeMaterials().catch((e) => console.warn('[real] 재질 교체 실패, 그림 텍스처 그대로:', e));
  return real;
}

class RealWorld {
  constructor(world, slots) {
    this.world = world;
    this.slots = slots;
    this.state = new Map(); // slot → 'loading' | 'failed' | Object3D
    this._t = 0;
  }

  _loader() {
    if (!this.gltf) {
      this.ktx2 = new KTX2Loader().setTranscoderPath(BASIS).detectSupport(this.world.renderer);
      this.gltf = new GLTFLoader().setKTX2Loader(this.ktx2).setMeshoptDecoder(MeshoptDecoder);
    }
    return this.gltf;
  }

  async upgradeMaterials() {
    this._loader();
    const cache = new Map();
    const tex = (name) => {
      if (!cache.has(name)) cache.set(name, this.ktx2.loadAsync(`${ASSETS}tex/${name}.ktx2`));
      return cache.get(name);
    };
    const m = mats();
    await Promise.all(Object.entries(MATERIALS).map(async ([key, spec]) => {
      const mat = m[key];
      const [map, normal, orm] = await Promise.all([tex(spec.map), tex(spec.normal), tex(spec.orm)]);
      const like = (t) => {
        const c = t.clone(); // 같은 이미지, 재질마다 반복만 다르게
        c.wrapS = c.wrapT = THREE.RepeatWrapping;
        if (mat.map) {
          c.repeat.copy(mat.map.repeat);
          c.offset.copy(mat.map.offset);
        }
        c.needsUpdate = true;
        return c;
      };
      mat.map = like(map);
      mat.normalMap = like(normal);
      mat.roughnessMap = like(orm); // G = 거칠기
      mat.aoMap = mat.roughnessMap; // R = 틈 그늘
      mat.aoMapIntensity = 0.8;
      mat.roughness = 1;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    }));
    this.materialsUpgraded = true;
  }

  update(dt, player) {
    if ((this._t += dt) < 0.5) return; // 거리 검사는 0.5초에 한 번
    this._t = 0;
    for (const [k, proc] of this.slots) {
      if (this.state.has(k)) continue;
      const s = SLOTS[k];
      const [x, , z] = s.at();
      if (Math.hypot(player.position.x - x, player.position.z - z) > s.loadWithin) continue;
      this.state.set(k, 'loading');
      this._swap(k, proc).catch((e) => {
        console.warn('[real] 실사 교체 실패, 절차적 그대로:', k, e);
        this.state.set(k, 'failed');
      });
    }
  }

  async _swap(k, proc) {
    const s = SLOTS[k];
    if (s.card) return this._card(k, proc);
    if (s.wall) return this._wall(k);
    const obj = (await this._loader().loadAsync(ASSETS + s.url)).scene;
    const [x, y, z] = s.at();
    obj.scale.setScalar(s.scale);
    obj.rotation.y = s.rotY;
    obj.position.set(x, y - s.sink * s.scale, z);
    obj.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      m.layers.enable(1); // 누르기(피킹) 대상 — 절차적 물체와 같게
    });
    this.world.scene.add(obj);
    proc.visible = false;
    if (s.half) {
      const h = s.half * s.scale;
      addBoxCollider(x - h, z - h, x + h, z + h, s.height ?? 9);
    }
    this.state.set(k, obj);
  }

  /** 후불벽 한 칸: 생성형 벽면 사진 판을 기존 벽 바로 앞에 */
  async _wall(k) {
    const s = SLOTS[k];
    const map = await new THREE.TextureLoader().loadAsync(ASSETS + s.img);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const [x0, x1] = s.wall;
    const w = x1 - x0, h = Math.min(WALL_H, (w * map.image.height) / map.image.width);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, roughness: 0.8, metalness: 0 }));
    plane.position.set((x0 + x1) / 2, L.hall.floorY + WALL_H - h / 2, L.hall.z0 + WALL_Z);
    plane.receiveShadow = true;
    plane.userData.noBatch = true;
    plane.layers.enable(1);
    this.world.scene.add(plane);
    this.state.set(k, plane);
  }

  /** 생성형 사진 판으로 바꿔 끼우기: 절차적 물체(조각이 끝난 뒤)의 경계 상자에 맞춘다 */
  async _card(k, proc) {
    const s = SLOTS[k];
    const [map] = await Promise.all([
      new THREE.TextureLoader().loadAsync(ASSETS + s.card),
      proc.userData.ready // 절차적 불상 조각(워커)이 끝나야 크기가 정해진다
    ]);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    proc.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(proc);
    const h = box.max.y - box.min.y;
    const w = (h * map.image.width) / map.image.height;
    const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.85, metalness: 0, side: THREE.FrontSide });
    const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    card.position.set((box.min.x + box.max.x) / 2, box.min.y + h / 2, (box.min.z + box.max.z) / 2);
    card.receiveShadow = true;
    card.userData.noBatch = true;
    card.layers.enable(1);
    this.world.scene.add(card);
    proc.visible = false; // 숨겨도 피킹(레이캐스트)은 그대로 받는다
    this.state.set(k, card);
  }
}
