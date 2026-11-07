/**
 * 길가 돌탑 규칙(server/cairns.js roadsideOk·toRoadside)이 쓰는 길 자료를 trail.js 에서 뽑아 server/roadsideGeo.js 로 쓴다.
 * 서버는 web/ 을 받지 않으므로(deploy/live.sh 는 server/ 만 올린다) 자료를 복사해 두고, 화면은 같은 파일을 링크로 읽는다.
 *   node tools/roadside-geo.mjs        ← trail.js 를 고친 뒤 (server/cairns.test.js 가 어긋나면 이 명령을 알려 준다)
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PATHS, forestPathX, LANTERNS, PATH_LAMPS, REST_SPOTS, SIGNS, CROSSINGS, PAVILION } from '../web/src/world/trail.js';

const r2 = (v) => Math.round(v * 100) / 100;

/** 꺾은선을 1m 간격으로 솎는다 (굽은 곳 반지름 5m 에서도 어긋남 2.5cm) */
function thin(pts, step = 1) {
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (acc >= step || i === pts.length - 1) {
      out.push(pts[i]);
      acc = 0;
    }
  }
  return out.flatMap((p) => [r2(p.x), r2(p.z)]);
}

// layout.js streamZ 와 같은 식 (layout.js 는 three 를 읽어 node 에서 못 부른다)
const streamZ = (x) => 15 + 1.5 * Math.sin(x * 0.085) + 0.7 * Math.sin(x * 0.21 + 0.6);

export function buildGeo() {
  // 일주문 숲길: 마당 계단 위(z 6.6)부터 산문 앞(z 48)까지 (layout.js isOnPath·terrain.js 흙빛과 같은 구간)
  const forest = [];
  for (let z = 6.6; z <= 48.01; z += 0.5) forest.push({ x: forestPathX(z), z });
  const stream = [];
  for (let x = -70; x <= 70; x += 2) stream.push({ x, z: streamZ(x) });

  const discs = [];
  const disc = (x, z, r) => discs.push(r2(x), r2(z), r);
  // 숲길 석등 쌍·일주문·소원 돌탑 (temple.js _forest 와 같은 자리), 마당 계단 앞, 숲길 홍예 석교
  for (const z of [33, 20.5, 9.6]) for (const sx of [-1, 1]) disc(forestPathX(z) + sx * 2.5, z, 0.9);
  disc(forestPathX(27), 27, 3.4); // 일주문 기둥 ±2.0m(충돌 0.55) 앞뒤를 비운다
  disc(forestPathX(31) + 3.3, 31, 1.6);
  disc(0, 5.8, 3);
  disc(forestPathX(15), streamZ(forestPathX(15)), 4.6);
  // 산책로: 건너는 곳, 쉼터(정자는 지붕 아래·들어가는 앞까지), 석등, 길 등, 이정표
  for (const c of CROSSINGS) disc(c.x, (c.z0 + c.z1) / 2, r2((c.z1 - c.z0) / 2 + 1));
  for (const s of REST_SPOTS) disc(s.x, s.z, s.kind === 'pavilion' ? r2(PAVILION.half * Math.SQRT2 + 1.2) : 2.2);
  for (const l of LANTERNS) disc(l.x, l.z, 0.9);
  for (const l of PATH_LAMPS) disc(l.x, l.z, 0.6);
  for (const g of SIGNS) disc(g.x, g.z, 0.7);

  return { paths: [...PATHS.map((P) => thin(P.pts)), thin(forest)], stream: stream.flatMap((p) => [r2(p.x), r2(p.z)]), discs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const geo = buildGeo();
  const out = new URL('../server/roadsideGeo.js', import.meta.url);
  writeFileSync(
    out,
    `// 만든 파일 — 고치지 말고 \`node tools/roadside-geo.mjs\` 로 다시 만든다 (trail.js 의 길·석등·쉼터 자리).\n` +
      `// 길가 돌탑 규칙(cairns.js roadsideOk·toRoadside)이 서버와 화면에서 같은 자료를 쓰게 (web/src/core/roadsideGeo.js 는 이 파일로 가는 링크).\n` +
      `export const ROADSIDE_GEO = ${JSON.stringify(geo)};\n`
  );
  console.log(`server/roadsideGeo.js: 길 ${geo.paths.length}개 점 ${geo.paths.reduce((n, p) => n + p.length / 2, 0)}, 비울 자리 ${geo.discs.length / 3}`);
}
