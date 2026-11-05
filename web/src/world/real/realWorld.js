// 실사 세계 (출시판 3단계, docs/superpowers/plans/2026-11-05-launch-stage3-real.md)
// templeScene.build() 가 플래그(REAL_WORLD)가 켜졌을 때만 동적으로 불러온다 — 꺼지면 이 파일도 에셋도 받지 않는다.
// 절차적 세계는 그대로 두고, temple.js 가 userData.realSlot 을 단 물체를 정적 병합에서 빼 두었다가
// 실사 GLB 가 도착하면 바꿔 끼운다. 못 받거나 저사양(q=low)이면 절차적 그대로.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { L, addBoxCollider } from '../layout.js';

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
  }
};

/** 정적 병합 전에 부른다: 교체 자리를 병합에서 빼 둔다 */
export function prepareReal(world) {
  if (world.quality === 'low') return null;
  const slots = new Map();
  world.scene.traverse((o) => {
    const k = o.userData.realSlot;
    if (k && SLOTS[k] && !slots.has(k)) slots.set(k, o);
  });
  for (const o of slots.values()) o.traverse((m) => m.isMesh && (m.userData.noBatch = true));
  return new RealWorld(world, slots);
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
      const ktx2 = new KTX2Loader().setTranscoderPath(BASIS).detectSupport(this.world.renderer);
      this.gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
    }
    return this.gltf;
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
      addBoxCollider(x - h, z - h, x + h, z + h);
    }
    this.state.set(k, obj);
  }
}
