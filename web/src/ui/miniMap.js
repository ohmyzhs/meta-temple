/**
 * 장소 시트의 작은 지도 — 위에서 본 산사(북쪽 위)에 지금 내 자리, 가람 네 곳, 산책길 쉼터를 찍고 누르면 그리로 간다.
 * 단추가 아닌 그림이라 손가락이 닿은 자리에서 가장 가까운 점(지도 위 8m 안)을 고른다 — 이름 있는 단추 목록은 지도 아래에 따로.
 * three 없이 돈다 (geo 로 지형 함수를 받는다).
 */
import { PATHS, trail, DECK, CROSSINGS, REST_SPOTS } from '../world/trail.js';

export const VIEW = { x0: -58, z0: -56, w: 116, h: 116 };
const PICK_R = 8; // m

/** 지도에 찍을 점: 가람 네 곳 + 쉼터(6m 안 쉼터는 하나로 — 그루터기 둘) */
export function mapMarkers(zones) {
  const out = zones.map((z) => ({ kind: 'zone', id: z.id, name: z.short, x: z.mapAt?.x ?? z.spawn.x, z: z.mapAt?.z ?? z.spawn.z }));
  for (const s of REST_SPOTS) {
    if (out.some((m) => m.kind === 'rest' && Math.hypot(m.x - s.x, m.z - s.z) < 6)) continue;
    out.push({ kind: 'rest', id: s.id, name: s.name, x: s.x, z: s.z, spot: s.kind });
  }
  return out;
}

/** 지도 좌표(x,z)에서 PICK_R 안의 가장 가까운 점 */
export function pickMarker(markers, x, z, r = PICK_R) {
  let best = null, bd = r;
  for (const m of markers) {
    const d = Math.hypot(m.x - x, m.z - z);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

const line = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.z.toFixed(1)}`).join('');

/** 산책길 쉼터 표시 (작은 그림) */
const GLYPH = {
  bench: 'M-1.4 0.2h2.8M-1 0.2v1M1 0.2v1',
  stump: 'M-0.9 -0.4h1.8v1.4h-1.8z',
  mat: 'M-1.3 -0.6h2.6v1.2h-2.6z',
  lookout: 'M-1.4 1l1.4-2.2 1.4 2.2z',
  bridge: 'M-1.5 0.6q1.5-1.6 3 0',
  spring: 'M0 -1.2q1.2 1.4 0 2.4q-1.2-1 0-2.4z'
};

/**
 * root 안에 지도를 그린다. onPick(marker) — 점을 누르면.
 * 돌려주는 것: { markers, setPlayer(x, z, heading), setHere(zoneId) }
 */
export function createMiniMap(root, { zones, geo, onPick }) {
  const { streamZ, pathX, L } = geo;
  const markers = mapMarkers(zones);
  const V = VIEW;
  const stream = [];
  for (let x = -48; x <= 48; x += 2) stream.push({ x, z: streamZ(x) });
  const gate = [];
  for (let z = 6; z <= 48; z += 2) gate.push({ x: pathX(z), z });
  const deck = [];
  for (let s = DECK.s0; s <= DECK.s1; s += 2) deck.push(trail.at(s));
  const rect = (r, cls) => `<rect class="${cls}" x="${r.x0}" y="${r.z0}" width="${r.x1 - r.x0}" height="${r.z1 - r.z0}" rx="0.8"/>`;
  const c = L.courtyard, h = L.hall, t = L.teahouse, tt = L.teahouseTerrace, p = L.pond;
  root.innerHTML = `<svg class="minimap-svg" viewBox="${V.x0} ${V.z0} ${V.w} ${V.h}" aria-hidden="true" focusable="false">
    <rect class="mm-ground" x="${V.x0}" y="${V.z0}" width="${V.w}" height="${V.h}" rx="5"/>
    ${[L.bamboo, L.bambooEast].map((b) => rect(b, 'mm-bamboo')).join('')}
    <path class="mm-stream" d="${line(stream)}"/>
    ${rect(tt, 'mm-lawn')}
    <ellipse class="mm-pond" cx="${p.x}" cy="${p.z}" rx="${p.rx}" ry="${p.rz}"/>
    ${rect(c, 'mm-court')}
    ${rect({ x0: h.x0, x1: h.x1, z0: h.z0, z1: h.z1 }, 'mm-hall')}
    ${rect({ x0: t.x - t.halfW, x1: t.x + t.halfW, z0: t.z - t.halfD, z1: t.z + t.halfD }, 'mm-hall')}
    <path class="mm-path" d="${line(gate)}"/>
    ${PATHS.map((P) => `<path class="mm-trail" d="${line(P.pts.filter((_, i) => i % 3 === 0 || i === P.pts.length - 1))}"/>`).join('')}
    <path class="mm-deck" d="${line(deck)}"/>
    ${CROSSINGS.map((k) => `<path class="mm-cross" d="M${k.x} ${k.z0}V${k.z1}"/>`).join('')}
    ${markers
      .map((m) =>
        m.kind === 'zone'
          ? `<g class="mm-zone" data-id="${m.id}" transform="translate(${m.x.toFixed(1)} ${m.z.toFixed(1)})"><circle r="3.1"/><text y="7.6">${m.name}</text></g>`
          : `<g class="mm-rest" data-id="${m.id}" transform="translate(${m.x.toFixed(1)} ${m.z.toFixed(1)})"><circle r="2.3"/><path d="${GLYPH[m.spot] || ''}"/></g>`
      )
      .join('')}
    <g class="mm-me" transform="translate(0 0)"><circle class="mm-me-halo" r="3.6"/><path d="M0 -2.6L1.8 1.8L0 0.9L-1.8 1.8Z"/></g>
  </svg>`;
  const svg = root.querySelector('svg');
  const me = svg.querySelector('.mm-me');
  svg.addEventListener('click', (e) => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const w = pt.matrixTransform(svg.getScreenCTM().inverse());
    const m = pickMarker(markers, w.x, w.y);
    if (m) onPick(m);
  });
  return {
    markers,
    setPlayer(x, z, heading) {
      // heading: +z 쪽이 0 (atan2(dx, dz)) → 지도에서 위(−z)가 0° 인 화살표를 돌린다
      const deg = 180 - (heading * 180) / Math.PI;
      me.setAttribute('transform', `translate(${x.toFixed(1)} ${z.toFixed(1)}) rotate(${deg.toFixed(0)})`);
    },
    setHere(zoneId) {
      svg.querySelectorAll('.mm-zone').forEach((g) => g.classList.toggle('here', g.dataset.id === zoneId));
    }
  };
}
