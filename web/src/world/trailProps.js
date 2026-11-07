/**
 * 순환 산책로의 소품 — 쉼터 6종(돌 쉼터·그루터기·돗자리·전망 바위·작은 다리·약수터), 건너는 곳(나무다리·징검다리),
 * 전나무숲 데크, 갈림목 석등.
 * 종류마다 빌더 하나(BUILDERS[kind])가 앉는 자리를 원점, 바라보는 쪽을 +z 로 둔 Group 을 돌려준다.
 * 실사 GLB 로 바꿀 때는 그 빌더만 갈아 끼우면 된다. 재질은 mats() 공용이라 batchStatic 이 기존 묶음에 합친다.
 */
import * as THREE from 'three';
import { terrainHeight, walkHeight, addCircleCollider, noise2, isWalkable, resolveCollisions } from './layout.js';
import { trail, REST_SPOTS, CROSSINGS, crossingY, DECK, deckRise, fenceRuns, LANTERNS, PATH_LAMPS, SIGNS } from './trail.js';
import { buildStoneLantern } from './architecture.js';
import { mats } from './materials.js';

export const mesh = (geo, mat, x = 0, y = 0, z = 0, cast = true) => {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = cast;
  o.receiveShadow = true;
  return o;
};

/** 울퉁불퉁한 돌 (윗면을 깎아 평평하게: flatTop 은 0..1 높이 비율) */
export function rockGeo(seed, flatTop = 1) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.22 * noise2(x * 1.6 + seed, z * 1.6 + y * 1.2) + 0.08 * noise2(x * 4 + seed, y * 4);
    x *= k;
    y *= k;
    z *= k;
    if (y > flatTop) y = flatTop + (y - flatTop) * 0.08;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** 돗자리 무늬: 짚 결 + 양끝 붉은·남색 띠 */
function matTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c9b27a';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 3) {
    g.fillStyle = y % 6 ? 'rgba(120,95,50,0.35)' : 'rgba(255,240,200,0.25)';
    g.fillRect(0, y, 128, 1);
  }
  for (let x = 0; x < 128; x += 16) {
    g.fillStyle = 'rgba(90,70,35,0.25)';
    g.fillRect(x, 0, 1, 128);
  }
  for (const [y, col] of [[6, '#8e2f1f'], [12, '#2b3d5c'], [110, '#2b3d5c'], [116, '#8e2f1f']]) {
    g.fillStyle = col;
    g.fillRect(0, y, 128, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BUILDERS = {
  /** 돌 쉼터: 받침돌 둘 + 긴 판석 (앉는 면 0.46m) */
  bench(m) {
    const g = new THREE.Group();
    for (const x of [-0.58, 0.58]) g.add(mesh(new THREE.BoxGeometry(0.3, 0.42, 0.36), m.granite, x, 0.19, 0));
    const top = new THREE.BoxGeometry(1.7, 0.1, 0.46, 1, 1, 1);
    g.add(mesh(top, m.granite, 0, 0.41, 0));
    const pebble = mesh(rockGeo(3, 0.3), m.stoneDark, 1.25, 0.05, -0.25);
    pebble.scale.set(0.28, 0.22, 0.24);
    g.add(pebble);
    return g;
  },
  /** 그루터기: 껍질 원기둥 + 나이테 윗면 + 뿌리 셋 */
  stump(m, spot) {
    const g = new THREE.Group();
    const h = spot.seatH;
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.38, h, 11), m.woodDark, 0, h / 2 - 0.02, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 11), m.woodLight, 0, h - 0.01, 0, false));
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.4;
      const root = new THREE.ConeGeometry(0.12, 0.5, 6);
      root.rotateZ(Math.PI / 2 - 0.35);
      root.rotateY(a);
      root.translate(Math.cos(a) * 0.36, 0.06, -Math.sin(a) * 0.36);
      g.add(mesh(root, m.woodDark));
    }
    return g;
  },
  /** 전망 바위: 위가 평평한 큰 바위 (앉는 면 seatH) — 비탈 아래쪽으로 몸통이 내려간다 */
  lookout(m, spot, ground) {
    const g = new THREE.Group();
    const r = mesh(rockGeo(11, 0.62), m.granite, 0, spot.seatH - 0.62 * 1.15, -0.55); // 앉는 자리는 바위 앞머리 (내려다볼 때 바위가 덜 가리게)
    r.scale.set(1.35, 1.15, 1.25);
    g.add(r);
    const r2 = mesh(rockGeo(5, 0.4), m.stoneDark, -1.5, ground(-1.5, 0.9) - 0.1, 0.9);
    r2.scale.set(0.7, 0.55, 0.6);
    g.add(r2);
    return g;
  },
  /** 돗자리 자리: 납작한 디딤돌 하나 (돗자리는 앉을 때 따로 펴진다) */
  mat(m) {
    const g = new THREE.Group();
    const st = mesh(rockGeo(21, 0.15), m.stoneDark, 0.9, -0.08, -0.55);
    st.scale.set(0.32, 0.3, 0.26);
    g.add(st);
    return g;
  },
  /** 약수터: 뒤편 돌무더기 + 대나무 홈통 + 돌확(물) + 표주박, 앉는 돌 */
  spring(m, spot, ground) {
    const g = new THREE.Group();
    // 앉는 자리 바로 앞(+z 1.35m)에 돌확, 그 뒤 비탈에 돌무더기와 대나무 홈통 (비탈 높이에 맞춰 세운다)
    const by = ground(0, 1.35), ky = ground(0, 2.3);
    const back = mesh(rockGeo(31, 0.8), m.stoneDark, 0, ky - 0.25, 2.55);
    back.scale.set(1.15, 1.05, 0.75);
    g.add(back);
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.5, 12, 1, true), m.granite, 0, by + 0.1, 1.35));
    g.add(mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 14).rotateX(Math.PI / 2), m.granite, 0, by + 0.35, 1.35));
    g.add(mesh(new THREE.CircleGeometry(0.4, 14).rotateX(-Math.PI / 2), SPRING_WATER, 0, by + 0.3, 1.35, false));
    const pipe = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6);
    pipe.rotateX(Math.PI / 2 - 0.25);
    g.add(mesh(pipe, m.woodLight, 0, Math.max(by + 0.62, ky + 0.55), 1.75));
    const gourd = mesh(new THREE.SphereGeometry(0.07, 8, 6), m.woodLight, 0.36, by + 0.39, 1.18);
    gourd.scale.set(1, 0.6, 1.3);
    g.add(gourd);
    const seat = mesh(rockGeo(8, 0.5), m.stoneDark, 0, spot.seatH - 0.5 * 0.4, 0);
    seat.scale.set(0.42, 0.4, 0.36);
    g.add(seat);
    return g;
  },
  /** 작은 나무다리: 판재 + 양옆 보 + 난간 (다리 자체가 쉼터). b: CROSSINGS 의 한 칸, 원점은 다리 중심선 x */
  bridge(m, b) {
    const smallBridgeY = (z) => crossingY(b, z);
    const g = new THREE.Group();
    const n = 18, len = b.z1 - b.z0;
    for (let i = 0; i < n; i++) {
      const z0 = b.z0 + (len * i) / n, z1 = b.z0 + (len * (i + 1)) / n;
      const y0 = smallBridgeY(z0), y1 = smallBridgeY(z1);
      const plank = mesh(new THREE.BoxGeometry(b.halfW * 2 + 0.1, 0.06, Math.hypot(z1 - z0, y1 - y0) - 0.03), m.woodLight, 0, (y0 + y1) / 2 - 0.03, (z0 + z1) / 2);
      plank.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
      g.add(plank);
    }
    for (const sx of [-1, 1]) {
      const beamPts = [], railPts = [];
      for (let i = 0; i <= 12; i++) {
        const z = b.z0 + (len * i) / 12, y = smallBridgeY(z);
        beamPts.push(new THREE.Vector3(sx * (b.halfW - 0.05), y - 0.14, z));
        railPts.push(new THREE.Vector3(sx * (b.halfW + 0.02), y + 0.5, z)); // 낮은 난간: 앉아서 내다보는 눈높이(0.8m)보다 아래
      }
      g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beamPts), 12, 0.09, 5), m.woodDark));
      g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 12, 0.04, 5), m.woodDark));
      for (let i = 0; i <= 4; i++) {
        const z = b.z0 + 0.15 + ((len - 0.3) * i) / 4, y = smallBridgeY(z);
        g.add(mesh(new THREE.BoxGeometry(0.09, 0.56, 0.09), m.woodDark, sx * (b.halfW + 0.02), y + 0.22, z));
      }
      // 물속 기둥 (가운데 둘)
      for (const z of [b.z0 + len * 0.36, b.z0 + len * 0.64]) g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6), m.woodDark, sx * (b.halfW - 0.1), smallBridgeY(z) - 0.82, z));
    }
    for (const z of [b.z0 - 0.15, b.z1 + 0.15]) {
      const st = mesh(rockGeo(z, 0.3), m.granite, 0, b.deckY - 0.35, z);
      st.scale.set(1.2, 0.45, 0.5);
      g.add(st);
    }
    return g;
  },
  /** 징검다리: 물 위로 납작한 돌을 한 줄로 (걷는 면 b.deckY) */
  stones(m, b) {
    const g = new THREE.Group();
    const n = Math.round((b.z1 - b.z0) / 0.62);
    for (let i = 0; i <= n; i++) {
      const z = b.z0 + ((b.z1 - b.z0) * i) / n;
      const st = mesh(rockGeo(i * 3.1 + 7, 0.25), m.granite, (i % 2 ? 0.12 : -0.12) + Math.sin(i * 2.3) * 0.05, b.deckY - 0.28, z);
      st.scale.set(0.34, 0.3, 0.27);
      st.rotation.y = i * 0.7;
      g.add(st);
    }
    return g;
  }
};

/**
 * 전나무숲 데크: 순환로 DECK 구간에 판재(0.3m 간격) + 받침 기둥 + 양옆 낮은 난간. 판 높이 = 땅 + deckRise(s).
 * 모두 공용 재질의 정적 메쉬라 batchStatic 이 기존 나무 묶음에 합친다.
 */
function buildDeck(scene, m) {
  const d = DECK;
  const g = new THREE.Group();
  const top = (s) => {
    const p = trail.at(s);
    return { x: p.x, z: p.z, y: terrainHeight(p.x, p.z) + deckRise(s) };
  };
  const plankGeo = new THREE.BoxGeometry(d.halfW * 2 + 0.1, 0.05, 0.27);
  for (let s = d.s0 + 0.15; s < d.s1; s += 0.3) {
    const a = top(s - 0.15), b = top(s + 0.15), c = top(s);
    const pl = mesh(plankGeo, m.woodLight, c.x, c.y - 0.025, c.z);
    pl.rotation.order = 'YXZ';
    pl.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    pl.rotation.x = -Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
    g.add(pl);
  }
  const postGeo = new THREE.BoxGeometry(0.1, 1, 0.1);
  for (const side of [-1, 1]) {
    const rail = [], beam = [];
    for (let s = d.s0 + 1.2; s < d.s1 - 0.5; s += 2.4) {
      const a = trail.at(s - 0.5), b = trail.at(s + 0.5), c = top(s);
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
      const x = c.x + nx * side * (d.halfW + 0.02), z = c.z + nz * side * (d.halfW + 0.02);
      const ground = terrainHeight(x, z);
      const h = c.y + 0.5 - ground + 0.1;
      const post = mesh(postGeo, m.woodDark, x, ground - 0.1 + h / 2, z);
      post.scale.y = h;
      g.add(post);
      rail.push(new THREE.Vector3(x, c.y + 0.5, z));
      beam.push(new THREE.Vector3(x, c.y - 0.1, z));
    }
    for (const [pts, r] of [[rail, 0.035], [beam, 0.06]]) g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, r, 5), m.woodDark));
  }
  g.userData.trailProp = true;
  scene.add(g);
}

/**
 * 길과 바깥의 경계: 낮은 나무 울타리(기둥 + 가로대 둘) 와 낮은 돌담(돌 + 덮개돌). 자리는 trail.js fenceRuns().
 * 공용 재질이라 정적 병합에 합쳐지고, 바깥 실사(outdoor.js)에서는 나무·돌 사진 질감이 입혀진다.
 */
function buildFences(scene, m) {
  const g = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.1, 0.68, 0.1);
  const railGeo = new THREE.BoxGeometry(0.06, 0.07, 1);
  const wallGeo = new THREE.BoxGeometry(0.38, 1, 1);
  const capGeo = new THREE.BoxGeometry(0.44, 0.07, 1);
  let n = 0;
  for (const run of fenceRuns()) {
    const pts = run.pts.map((p) => ({ ...p, y: terrainHeight(p.x, p.z) }));
    pts.forEach((p, i) => {
      if (run.style === 'wood') g.add(mesh(postGeo, m.woodDark, p.x, p.y + 0.29, p.z));
      const q = pts[i + 1];
      if (!q) return;
      const len = Math.hypot(q.x - p.x, q.z - p.z), yaw = Math.atan2(q.x - p.x, q.z - p.z), pitch = -Math.atan2(q.y - p.y, len);
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, mz = (p.z + q.z) / 2;
      const put = (geo, mat, dy, h, extra = 0) => {
        const o = mesh(geo, mat, mx, my + dy, mz);
        o.rotation.order = 'YXZ';
        o.rotation.y = yaw;
        o.rotation.x = pitch;
        o.scale.set(1, h, len + extra);
        g.add(o);
        n++;
      };
      if (run.style === 'wood') {
        put(railGeo, m.woodDark, 0.28, 1, 0.08);
        put(railGeo, m.woodLight, 0.55, 1, 0.08);
      } else {
        const h = 0.4 + 0.08 * noise2(mx * 0.7, mz * 0.7);
        put(wallGeo, m.stoneDark, h / 2 - 0.06, h, 0.06);
        put(capGeo, m.granite, h - 0.02, 1, 0.1);
      }
    });
  }
  g.userData.trailProp = true;
  scene.add(g);
  return n;
}


/* ───── 나무 이정표 (자리·글은 trail.js SIGNS) ─────
 * 기둥 + 작은 지붕 + 화살 모양 판(1~3장). 판 글씨는 캔버스 한 장(256×64 칸 4×16)에 모아 재질 하나로 — 정적 병합 한 묶음.
 * 서체는 글자 구간별로 내려받으므로, 그 글자를 받은 뒤 다시 그린다.
 */
const SIGN_CELL = { w: 256, h: 64, cols: 4, rows: 16 };
const BOARD = { len: 1.42, h: 0.3, tip: 0.2, gap: 0.05, face: 0.45 }; // face: 판을 길 쪽으로 돌리는 각(rad) — 걸어오며 읽히게

function signAtlas(texts) {
  const c = document.createElement('canvas');
  c.width = SIGN_CELL.w * SIGN_CELL.cols;
  c.height = SIGN_CELL.h * SIGN_CELL.rows;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    const g = c.getContext('2d');
    texts.forEach((text, i) => {
      const x0 = (i % SIGN_CELL.cols) * SIGN_CELL.w, y0 = Math.floor(i / SIGN_CELL.cols) * SIGN_CELL.h;
      // 결이 보이는 바랜 나무판
      const grd = g.createLinearGradient(0, y0, 0, y0 + SIGN_CELL.h);
      grd.addColorStop(0, '#b8915f');
      grd.addColorStop(0.5, '#a98352');
      grd.addColorStop(1, '#8f6c43');
      g.fillStyle = grd;
      g.fillRect(x0, y0, SIGN_CELL.w, SIGN_CELL.h);
      for (let k = 0; k < 9; k++) {
        g.strokeStyle = `rgba(${k % 2 ? '40,26,14' : '170,130,90'},${0.12 + (k % 3) * 0.04})`;
        g.lineWidth = 1;
        g.beginPath();
        const yy = y0 + 6 + k * 6.3 + Math.sin(i * 3.1 + k) * 1.5;
        g.moveTo(x0, yy);
        g.bezierCurveTo(x0 + 80, yy + 2, x0 + 170, yy - 2, x0 + SIGN_CELL.w, yy + 1);
        g.stroke();
      }
      // 새긴 글씨: 밝은 테두리 + 짙은 속
      const m = text.match(/^(.*) (\d+m)$/);
      const name = m ? m[1] : text, dist = m ? m[2] : '';
      g.textBaseline = 'middle';
      let size = 34;
      g.font = `600 ${size}px "Noto Serif KR", serif`;
      const dw = dist ? 58 : 0;
      while (g.measureText(name).width > SIGN_CELL.w - 40 - dw && size > 18) g.font = `600 ${--size}px "Noto Serif KR", serif`;
      const cy = y0 + SIGN_CELL.h / 2 + 1;
      g.fillStyle = 'rgba(245,225,185,0.6)';
      g.fillText(name, x0 + 13, cy + 1.4);
      g.fillStyle = '#20130a';
      g.fillText(name, x0 + 12, cy);
      if (dist) {
        g.font = '700 21px "Noto Sans KR", sans-serif';
        const dx = x0 + SIGN_CELL.w - 40 - g.measureText(dist).width;
        g.fillStyle = 'rgba(245,225,185,0.55)';
        g.fillText(dist, dx + 1, cy + 1.8);
        g.fillStyle = '#3a2412';
        g.fillText(dist, dx, cy + 0.8);
      }
    });
    tex.needsUpdate = true;
  };
  draw();
  const all = texts.join('') + '0123456789m';
  Promise.all([document.fonts.load('600 30px "Noto Serif KR"', all), document.fonts.load('500 20px "Noto Sans KR"', all)]).then(draw, () => {});
  return tex;
}

/** 화살 판 하나: 원점에서 +x 로 뻗고 끝이 뾰족하다. side +1 = 앞면(+z), -1 = 뒷면(-z, 뒤에서도 글이 바로 읽히게 u 를 뒤집음) */
function boardFace(cellIndex, side) {
  const { len, h, tip } = BOARD;
  const s = new THREE.Shape();
  s.moveTo(0.06, -h / 2);
  s.lineTo(len - tip, -h / 2);
  s.lineTo(len, 0);
  s.lineTo(len - tip, h / 2);
  s.lineTo(0.06, h / 2);
  s.closePath();
  const geo = new THREE.ShapeGeometry(s);
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  const u0 = (cellIndex % SIGN_CELL.cols) / SIGN_CELL.cols, du = 1 / SIGN_CELL.cols;
  const v1 = 1 - Math.floor(cellIndex / SIGN_CELL.cols) / SIGN_CELL.rows, dv = 1 / SIGN_CELL.rows;
  for (let i = 0; i < pos.count; i++) {
    const fx = (pos.getX(i) - 0.06) / (len - 0.06), fy = (pos.getY(i) + h / 2) / h;
    uv.setXY(i, u0 + (side > 0 ? fx : 1 - fx) * du, v1 - dv + fy * dv);
  }
  geo.translate(0, 0, side * 0.019);
  return geo;
}

function buildSigns(scene, m) {
  const texts = [...new Set(SIGNS.flatMap((g) => g.boards.map((b) => b.text)))].slice(0, SIGN_CELL.cols * SIGN_CELL.rows);
  const boardMat = new THREE.MeshStandardMaterial({ map: signAtlas(texts), roughness: 0.86, side: THREE.DoubleSide });
  const slabGeo = new THREE.ExtrudeGeometry(
    new THREE.Shape([new THREE.Vector2(0.06, -BOARD.h / 2), new THREE.Vector2(BOARD.len - BOARD.tip, -BOARD.h / 2), new THREE.Vector2(BOARD.len, 0), new THREE.Vector2(BOARD.len - BOARD.tip, BOARD.h / 2), new THREE.Vector2(0.06, BOARD.h / 2)]),
    { depth: 0.034, bevelEnabled: false }
  );
  slabGeo.translate(0, 0, -0.017);
  const postGeo = new THREE.BoxGeometry(0.13, 2.02, 0.13);
  const capGeo = new THREE.ConeGeometry(0.15, 0.16, 4);
  capGeo.rotateY(Math.PI / 4);
  const g = new THREE.Group();
  for (const sg of SIGNS) {
    const y = terrainHeight(sg.x, sg.z);
    g.add(mesh(postGeo, m.woodDark, sg.x, y + 0.96, sg.z));
    g.add(mesh(capGeo, m.woodDark, sg.x, y + 2.05, sg.z));
    // 길 쪽 (판을 이만큼 돌려 다가오는 사람에게 앞면이 보이게)
    const tr = trail.nearest(sg.x, sg.z);
    const ix = (tr.x - sg.x) / (tr.d || 1), iz = (tr.z - sg.z) / (tr.d || 1);
    sg.boards.forEach((b, i) => {
      const k = texts.indexOf(b.text);
      const by = y + 1.74 - i * (BOARD.h + BOARD.gap);
      const c = Math.cos(BOARD.face), sn = Math.sin(BOARD.face);
      const dx = b.dx * c + ix * sn, dz = b.dz * c + iz * sn;
      // 판의 +x 가 (dx, dz) 를 가리키게: y 축으로 θ 돌리면 x → (cos θ, 0, −sin θ)
      const rot = Math.atan2(-dz, dx);
      for (const geo of [slabGeo, boardFace(k, 1), boardFace(k, -1)]) {
        const o = mesh(geo, geo === slabGeo ? m.woodDark : boardMat, sg.x, by, sg.z, geo === slabGeo);
        o.rotation.y = rot;
        g.add(o);
      }
    });
    addCircleCollider(sg.x, sg.z, 0.16);
  }
  g.userData.trailProp = true; // 기둥·판 몸통은 바깥 실사에서 나무 사진 질감으로 (글씨 판은 그대로)
  scene.add(g);
}


let SPRING_WATER;

/* ───── 쉼터의 앉는 칸: 한 쉼터에 여럿이 나란히 (다 차면 곁의 땅에 자리를 편다) ───── */
/** 종류별 칸 [옆 lx, 앞 lz] (쉼터 기준, +z 가 바라보는 쪽). 첫 칸이 원래 자리 */
const SLOT_LAYOUT = {
  bench: [[0, 0], [-0.6, 0], [0.6, 0]],
  woodbench: [[0, 0], [-0.62, 0], [0.62, 0]],
  platform: [[0, 0], [-0.72, 0], [0.72, 0]],
  lookout: [[0, 0], [-0.62, -0.12], [0.62, -0.12]],
  bridge: [[0, 0], [-0.85, 0], [0.85, 0]],
  mat: [[0, 0], [0, -0.62]]
};
/** 칸이 다 찼을 때 앉을 곁의 땅 후보 (쉼터 양옆·앞) */
const GROUND_RING = [[1.0, 0.35], [-1.0, 0.35], [1.4, -0.05], [-1.4, -0.05], [0.55, 0.9], [-0.55, 0.9], [0, 1.15], [1.05, 1.05], [-1.05, 1.05]];
const toWorld = (s, lx, lz) => ({ x: s.x + Math.cos(s.ry) * lx + Math.sin(s.ry) * lz, z: s.z - Math.sin(s.ry) * lx + Math.cos(s.ry) * lz });

/** 쉼터 s 의 앉는 칸들 { x, y, z, ry, state, stand, occupant } (처음 부를 때 만들어 둔다) */
export function restSlots(s) {
  if (s._slots) return s._slots;
  s._slots = (SLOT_LAYOUT[s.kind] || [[0, 0]]).map(([lx, lz], i) => {
    const p = i ? toWorld(s, lx, lz) : { x: s.x, z: s.z };
    const st = { x: s.stand.x + (p.x - s.x), z: s.stand.z + (p.z - s.z) }; // 일어설 자리도 같은 만큼 옆으로 (걸을 수 없으면 원래 자리)
    return {
      index: i,
      x: p.x,
      y: s.kind === 'bridge' ? crossingY(CROSSINGS[0], p.z) : s.y,
      z: p.z,
      ry: s.ry,
      state: 'sit',
      stand: i && isWalkable(st.x, st.z) ? st : s.stand,
      occupant: null
    };
  });
  return s._slots;
}

/** 칸이 다 찼을 때 곁의 땅 자리: 걸을 수 있고 부딪히지 않으며 앉은 이(taken)·칸에서 0.6m 넘게 떨어진 곳 중 (px,pz) 에 가장 가까운 곳 */
export function restGroundSlot(s, px, pz, taken) {
  const near = [...taken, ...restSlots(s)];
  let best = null, bd = Infinity;
  for (const [lx, lz] of GROUND_RING) {
    const p = toWorld(s, lx, lz);
    if (!isWalkable(p.x, p.z)) continue;
    const q = resolveCollisions(p.x, p.z, 0.28);
    if (Math.hypot(q.x - p.x, q.z - p.z) > 1e-3) continue;
    if (near.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < 0.6)) continue;
    const d = Math.hypot(p.x - px, p.z - pz);
    if (d < bd) {
      bd = d;
      best = { index: -1, ground: true, x: p.x, y: walkHeight(p.x, p.z), z: p.z, ry: s.ry, state: 'meditate', stand: p, occupant: null };
    }
  }
  return best;
}

/**
 * 산책로 소품을 세운다. 돌려주는 것: { spots, seat(spot), showMat(spot), hideMat(), dynamic: [움직이는 루트], lanterns: [[x,z,y]] }
 */
export function buildTrailProps(scene) {
  const m = mats();
  SPRING_WATER ||= new THREE.MeshStandardMaterial({ color: 0x2e4a48, roughness: 0.06, metalness: 0.35 });
  const spots = REST_SPOTS.map((s) => ({ ...s, y: s.kind === 'bridge' ? crossingY(CROSSINGS[0], s.z) : walkHeight(s.x, s.z) + s.seatH, occupant: null }));

  for (const c of CROSSINGS) {
    const g = BUILDERS[c.kind](m, c);
    g.position.set(c.x, 0, 0);
    g.userData.trailProp = true; // 바깥 실사(world/real/outdoor.js)가 재질을 바꿔 끼우는 묶음
    scene.add(g);
  }
  buildDeck(scene, m);
  buildFences(scene, m);
  buildSigns(scene, m);

  for (const s of spots) {
    if (s.kind === 'bridge') continue; // 다리 자체가 쉼터
    const gy = walkHeight(s.x, s.z); // 데크 위 벤치는 판 높이에
    // 빌더가 쓰는 땅 높이: 쉼터 기준 (앞 lz, 옆 lx) 자리의 지형 높이 − 쉼터 땅 높이
    const ground = (lx, lz) => terrainHeight(s.x + Math.cos(s.ry) * lx + Math.sin(s.ry) * lz, s.z - Math.sin(s.ry) * lx + Math.cos(s.ry) * lz) - gy;
    const g = BUILDERS[s.kind](m, s, ground);
    g.position.set(s.x, gy, s.z);
    g.rotation.y = s.ry;
    g.userData.trailProp = true;
    scene.add(g);
    if (s.kind === 'bench') addCircleCollider(s.x + Math.sin(s.ry) * 0.05, s.z + Math.cos(s.ry) * 0.05, s.onDeck ? 0.32 : 0.5);
    else if (s.kind === 'stump') addCircleCollider(s.x, s.z, 0.38);
    else if (s.kind === 'lookout') addCircleCollider(s.x - Math.sin(s.ry) * 0.45, s.z - Math.cos(s.ry) * 0.45, 0.95);
    else if (s.kind === 'spring') addCircleCollider(s.x + Math.sin(s.ry) * 1.6, s.z + Math.cos(s.ry) * 1.6, 0.9);
  }

  // 돗자리: 말아 둔 것(쉴 때) ↔ 편 것(앉았을 때)
  const matSpots = spots.filter((s) => s.kind === 'mat');
  const matMat = new THREE.MeshStandardMaterial({ map: matTexture(), roughness: 0.92 });
  const rollGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.95, 10);
  rollGeo.rotateZ(Math.PI / 2);
  const rolls = new THREE.InstancedMesh(rollGeo, matMat, matSpots.length);
  rolls.castShadow = true;
  rolls.receiveShadow = true;
  const o = new THREE.Object3D();
  const setRoll = (i, shown) => {
    const s = matSpots[i];
    o.position.set(s.x + Math.cos(s.ry) * 0.9, terrainHeight(s.x, s.z) + 0.09, s.z - Math.sin(s.ry) * 0.9);
    o.rotation.set(0, s.ry, 0);
    o.scale.setScalar(shown ? 1 : 0);
    o.updateMatrix();
    rolls.setMatrixAt(i, o.matrix);
    rolls.instanceMatrix.needsUpdate = true;
  };
  matSpots.forEach((_, i) => setRoll(i, true));
  scene.add(rolls);
  const flatGeo = new THREE.PlaneGeometry(1.0, 1.5, 1, 1);
  flatGeo.rotateX(-Math.PI / 2);
  const flat = mesh(flatGeo, matMat, 0, 0, 0, false);
  flat.visible = false;
  scene.add(flat);
  let shownMat = -1;

  // 갈림목·다리·전망 바위 석등과, 길을 따라 20m 마다 낮은 길 등 (밤에 바닥에 빛 웅덩이가 이어져 길이 보인다)
  const lanterns = [];
  const lamps = new THREE.Group();
  for (const [list, scale, r, i] of [[LANTERNS, 0.7, 2.4, 0.5], [PATH_LAMPS, 0.42, 1.9, 0.55]]) {
    for (const { x, z } of list) {
      const lan = buildStoneLantern(scale);
      const y = terrainHeight(x, z);
      lan.position.set(x, y, z);
      lamps.add(lan);
      if (scale > 0.5) addCircleCollider(x, z, 0.4); // 길 등은 걷는 띠 밖이라 충돌 없음
      lanterns.push({ x, z, y, r, i });
    }
  }
  lamps.userData.trailProp = true;
  scene.add(lamps);

  return {
    spots,
    lanterns,
    dynamic: [rolls, flat],
    /** 이 쉼터의 한 칸에 앉는 자리 (cushionSeat 와 같은 꼴: occupant getter/setter, standAt). 칸을 안 주면 원래 자리 */
    seat(s, slot = restSlots(s)[0]) {
      return {
        x: slot.x,
        y: slot.y,
        z: slot.z,
        ry: slot.ry,
        kind: 'rest',
        spotId: s.id,
        standAt: { x: slot.stand.x, z: slot.stand.z },
        _ref: s,
        _slot: slot,
        get occupant() {
          return slot.occupant;
        },
        set occupant(v) {
          slot.occupant = v;
        }
      };
    },
    /** 돗자리를 편다: 산책로 돗자리 쉼터면 말아 둔 것을 거두고, 휴식(아무 데서나)이면 그 자리에 — tilt: [앞뒤, 좌우] 기울기(땅을 따라) */
    showMat(s) {
      const i = matSpots.findIndex((q) => q.id === s.id);
      this.hideMat();
      if (i >= 0) setRoll(i, false);
      flat.position.set(s.x, walkHeight(s.x, s.z) + 0.015, s.z);
      flat.rotation.set(s.tilt?.[0] || 0, s.ry, s.tilt?.[1] || 0, 'YXZ');
      flat.visible = true;
      shownMat = i;
    },
    hideMat() {
      if (shownMat >= 0) setRoll(shownMat, true);
      flat.visible = false;
      shownMat = -1;
    }
  };
}
