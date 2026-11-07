/**
 * 연등탑 — 산책로·산문 숲길·경내 갈림길·서쪽 마당 둘레를 따라 일정 간격으로 세운 나무 기둥 연등, 그리고 일주문 들보 연등 (사용자 2026-11-07 「밤이 너무 어두컴컴」).
 * 자리는 길 데이터(trail.js PATHS·layout.js pathX)에서 런타임에 고른다 — 맵 작업이 길을 옮겨도 따라간다 (좌표를 박지 않음).
 * 모바일 성능: 탑마다 빛을 두지 않는다. 연등은 마당 연등과 같은 지오메트리·발광 재질(InstancedMesh 하나), 기둥 하나, 바닥 빛 웅덩이 판 하나 — 그리기 3번.
 * 실제 점광원은 TOWER.LIGHTS 개뿐: 플레이어에게 가장 가까운 자리(연등탑·일주문)로 옮겨 다니고, 멀어지면 먼저 흐려진다.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { L, pathX, pathY, terrainHeight, collidersNear, addCircleCollider, streamZ, inCourts } from './layout.js';
import { PATHS, trail, PATH_LAMPS, LANTERNS, REST_SPOTS, SIGNS, crossingAt, FENCE_OFF, DECK, deckRise } from './trail.js';
import { softDotTexture } from './textures.js';

export const TOWER = {
  SPACING: 20, // 길을 따라 탑 사이 (m) — 산책로 길 등(20m 마다)과 엇갈려 약 10m 마다 빛이 하나씩
  PHASE: 24, // 순환로 첫 탑 자리 (s, m) — 길 등(14 + 20k)의 한가운데
  FOREST_SPACING: 8, // 산문 숲길 탑 사이 (석등·일주문·다리를 비키고 탑끼리 7m 이상)
  POST_H: 2.7,
  LIGHTS: 2, // 실제 점광원 수 (재질 재컴파일이 없게 개수 고정) — 저사양(q=low)은 1
  LIGHT_I: 7, // 연등탑 점광원 세기 (밤 1 일 때)
  LIGHT_D: 13,
  GATE_I: 9, // 일주문 점광원 (현판·기둥을 비춘다)
  GLOW: 0.9, // 연등 발광 (밤 1 일 때 더하는 양 — 마당 연등은 1.6)
  FADE: [9, 16] // 플레이어에서 이 거리 사이에서 빛이 흐려진다 — 먼 자리로 옮길 때 깜빡이지 않게
};
const PASTEL = ['#f4a3b5', '#f3a24a', '#f6c6a0', '#79a9d9', '#e98a9a', '#e9b84a'];

/** 길 P 위 s 의 진행 방향 오른쪽 법선 */
function normalOn(P, s) {
  const a = P.at(s - 0.5), b = P.at(s + 0.5);
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: -(b.z - a.z) / l, z: (b.x - a.x) / l };
}

/** 탑 자리 [{ x, z, ry }] — ry: 팔이 길과 나란하게 (두 연등이 길을 따라 늘어선다) */
export function towerSites() {
  const out = [];
  const lamps = [...PATH_LAMPS, ...LANTERNS];
  const free = (x, z, court = false) => {
    if (REST_SPOTS.some((r) => Math.hypot(r.x - x, r.z - z) < 3.2)) return false;
    if (lamps.some((l) => Math.hypot(l.x - x, l.z - z) < 4)) return false;
    if (SIGNS.some((s) => Math.hypot(s.x - x, s.z - z) < 2)) return false;
    if (crossingAt(x, z, 3) || Math.abs(z - streamZ(x)) < 3.6 || (!court && inCourts(x, z, 1))) return false;
    if (Math.hypot(x - L.gate.x, z - L.gate.z) < 5) return false; // 일주문은 제 연등
    if (Math.hypot(x - L.spawn.x, z - L.spawn.z) < 4.5) return false; // 들어서는 자리 바로 옆은 비운다 (첫 화면 앞을 가리고 번진다)
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 7)) return false;
    for (const c of collidersNear(x, z)) {
      const d = c.type === 'c' ? Math.hypot(c.x - x, c.z - z) - c.r : Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1));
      if (d < 0.8) return false; // 나무·바위·석등에 붙지 않게
    }
    return true;
  };
  const place = (x, z, tx, tz) => out.push({ x, z, ry: Math.atan2(tx, tz) });
  // 자리마다 옆 거리(+0, +0.6, +1.2m)·길 방향(0, ±1.5, ±3m)·좌우를 조금씩 바꿔 첫 빈 곳에 (숲 가장자리는 나무·바위가 빽빽하다)
  const JIT = [0, 1.5, -1.5, 3, -3], OFF = [0, 0.6, 1.2];
  const tryAt = (side, at) => {
    for (const dj of JIT) for (const dOff of OFF) for (const sd of [side, -side]) if (at(dj, dOff, sd)) return true;
    return false;
  };
  // 순환로·마당 갈림길·다실 갈림길: 울타리 밖 (데크 구간은 난간 밖), 좌우 번갈아
  for (const P of PATHS) {
    let side = 1;
    for (let s0 = P === trail ? TOWER.PHASE : TOWER.SPACING / 2; s0 < P.length - 4; s0 += TOWER.SPACING) {
      side = -side;
      tryAt(side, (dj, dOff, sd) => {
        const s = Math.min(Math.max(s0 + dj, 1), P.length - 1);
        const c = P.at(s), n = normalOn(P, s);
        const off = (P === trail && deckRise(s) > 0 ? DECK.halfW + 0.55 : FENCE_OFF + 0.65) + 0.2 + dOff;
        const x = c.x + n.x * sd * off, z = c.z + n.z * sd * off;
        return free(x, z) && (place(x, z, n.z, -n.x), true);
      });
    }
  }
  // 산문 숲길: 산문 밖(스폰 쪽)에서 마당 계단 앞까지, 석등 줄(±2.5m) 바깥 좌우 번갈아
  let side = 1;
  for (let z0 = L.forest.zStart - 2; z0 > L.forest.zEnd + 2; z0 -= TOWER.FOREST_SPACING) {
    side = -side;
    tryAt(side, (dj, dOff, sd) => {
      const z = z0 + dj, x = pathX(z) + sd * (3.1 + dOff);
      return free(x, z) && (place(x, z, pathX(z - 1) - pathX(z + 1), -2), true);
    });
  }
  // 경내: 서쪽 마당 담 안쪽 둘레(서·북·남 담에서 1.2m)와 동쪽 줄(대웅전 옆마당 쪽) — 행사용 가운데 타원·협문 앞은 비운다
  const w = L.westCourt, r = L.westReserve, g = L.westGate, IN = 1.2;
  const courtFree = (x, z) =>
    Math.hypot((x - r.x) / (r.rx + 1), (z - r.z) / (r.rz + 1)) > 1 && !(x > w.x1 - 3 && z > g.z0 - 2 && z < g.z1 + 2) && free(x, z, true);
  const edges = [
    [w.x0 + IN, w.z1 - 4, w.x0 + IN, w.z0 + 4], // 서쪽 담
    [w.x0 + 4, w.z0 + IN, w.x1 - 3, w.z0 + IN], // 북쪽 담
    [w.x1 - 4, w.z1 - IN, w.x0 + 4, w.z1 - IN], // 남쪽 담
    [w.x1 - IN, w.z1 - 4, w.x1 - IN, w.z0 + 4] // 동쪽 (옆마당·협문 쪽)
  ];
  for (const [x0, z0, x1, z1] of edges) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 10));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      for (const dj of [0, 1.5, -1.5, 3, -3]) {
        const x = x0 + (x1 - x0) * u + ((x1 - x0) / len) * dj, z = z0 + (z1 - z0) * u + ((z1 - z0) / len) * dj;
        if (courtFree(x, z)) {
          place(x, z, x1 - x0, z1 - z0);
          break;
        }
      }
    }
  }
  return out;
}

/** 연등탑을 세우고 { update(pos, night), sites } 를 돌려준다. temple: 마당 연등 지오메트리·재질을 빌린다 */
export function buildLanternTowers(scene, temple, quality) {
  const sites = towerSites();
  const H = TOWER.POST_H;
  // 기둥 + 들보 + 작은 갓 (한 지오메트리)
  const post = new THREE.CylinderGeometry(0.07, 0.09, H, 8).translate(0, H / 2, 0);
  const arm = new THREE.BoxGeometry(0.07, 0.07, 1.05).translate(0, H - 0.14, 0);
  const cap = new THREE.ConeGeometry(0.16, 0.2, 8).translate(0, H + 0.1, 0);
  const postGeo = mergeGeometries([post, arm, cap].map((g) => g.toNonIndexed()));
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.85 });
  const posts = new THREE.InstancedMesh(postGeo, wood, sites.length);
  const gateY = pathY(L.gate.z) - 0.05, gx = L.gate.x, gz = L.gate.z;
  // 연등 (탑마다 들보 양 끝에 둘 + 일주문 들보 앞뒤로 넷): 마당 연등 지오메트리를 빌리되 빛은 더 은은하게
  // (길가에서 눈앞에 와도 하얗게 번지지 않게) — 발광은 temple.js LanternSystem 과 같은 식
  const uGlow = { value: 0 };
  const lanMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  lanMat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = uGlow;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor * uGlow * smoothstep(0.5, 0.9, vColor.r + vColor.g + vColor.b - 0.6);');
  };
  lanMat.customProgramCacheKey = () => 'tower-lantern';
  const lan = new THREE.InstancedMesh(temple.lanterns.mesh.geometry, lanMat, sites.length * 2 + 4);
  const o = new THREE.Object3D(), col = new THREE.Color();
  let k = 0;
  const hang = (x, y, z, ry, s) => {
    o.position.set(x, y, z);
    o.rotation.set(0, ry + k * 1.7, 0);
    o.scale.setScalar(s);
    o.updateMatrix();
    lan.setMatrixAt(k, o.matrix);
    lan.setColorAt(k, col.set(PASTEL[k % PASTEL.length]));
    k++;
  };
  const glow = [];
  sites.forEach((t, i) => {
    t.y = terrainHeight(t.x, t.z);
    o.position.set(t.x, t.y, t.z);
    o.rotation.set(0, t.ry, 0);
    o.scale.setScalar(1);
    o.updateMatrix();
    posts.setMatrixAt(i, o.matrix);
    for (const e of [-0.45, 0.45]) hang(t.x + Math.sin(t.ry) * e, t.y + H - 0.14 - 0.55, t.z + Math.cos(t.ry) * e, t.ry, 0.9);
    glow.push({ x: t.x, z: t.z, y: t.y, r: 2.2 });
    addCircleCollider(t.x, t.z, 0.18, H); // 걷기·카메라 팔이 기둥을 뚫지 않게 (가늘어 비켜 걷는다)
  });
  // 일주문: 기둥(±2.0m, 반지름 0.33m) 바깥 들보 끝(±2.7m) 밑, 앞뒤로 — 현판·기둥을 가리지 않게 (architecture.js buildIljumun, 들보 아랫면 약 3.9m)
  for (const sz of [1, -1]) for (const sx of [-2.55, 2.55]) hang(gx + sx, gateY + 3.88 - 0.51 * 0.85, gz + sz * 0.45, 0, 0.85);
  glow.push({ x: gx, z: gz + 1.2, y: gateY, r: 3.4 }, { x: gx, z: gz - 1.2, y: gateY, r: 3.4 });
  lan.instanceMatrix.needsUpdate = true;
  if (lan.instanceColor) lan.instanceColor.needsUpdate = true;
  // 바닥 빛 웅덩이 (가산, 밤에만) — temple.js 석등 바닥 빛과 같은 방식
  const dg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const dm = new THREE.MeshBasicMaterial({ map: softDotTexture(), color: 0xffb870, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const decals = new THREE.InstancedMesh(dg, dm, glow.length);
  glow.forEach((d, i) => {
    o.position.set(d.x, d.y + 0.05, d.z);
    o.rotation.set(0, 0, 0);
    o.scale.set(d.r * 2, 1, d.r * 2);
    o.updateMatrix();
    decals.setMatrixAt(i, o.matrix);
  });
  for (const m of [posts, lan, decals]) {
    m.castShadow = false;
    m.userData.noPick = true;
    m.computeBoundingSphere();
    scene.add(m);
  }
  // 실제 빛: 자리 후보 = 연등탑(연등 높이) + 일주문 앞뒤
  const cands = sites.map((t) => ({ p: new THREE.Vector3(t.x, t.y + H - 0.7, t.z), i: TOWER.LIGHT_I }));
  for (const sz of [1, -1]) cands.push({ p: new THREE.Vector3(gx, gateY + 2.9, gz + sz * 1.3), i: TOWER.GATE_I });
  const lights = [], nLights = quality === 'low' ? 1 : TOWER.LIGHTS;
  for (let i = 0; i < nLights; i++) {
    const l = new THREE.PointLight(0xffc488, 0, TOWER.LIGHT_D, 1.8);
    scene.add(l);
    lights.push(l);
  }
  const best = new Array(nLights);
  return {
    sites,
    lights,
    update(pos, night) {
      uGlow.value = 0.25 + night * TOWER.GLOW;
      decals.material.opacity = night * 0.32;
      decals.visible = night > 0.02;
      best.fill(null);
      for (const c of cands) {
        c.d = Math.hypot(c.p.x - pos.x, c.p.z - pos.z);
        for (let j = 0; j < best.length; j++) {
          if (!best[j] || c.d < best[j].d) {
            best.splice(j, 0, c);
            best.length = nLights;
            break;
          }
        }
      }
      lights.forEach((l, j) => {
        const c = best[j];
        if (!c || night < 0.02) return void (l.intensity = 0);
        l.position.copy(c.p);
        l.intensity = c.i * night * (1 - THREE.MathUtils.smoothstep(c.d, TOWER.FADE[0], TOWER.FADE[1]));
      });
    }
  };
}
