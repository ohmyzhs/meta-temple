/**
 * 아바타 행동 상태 → 블렌더로 구운 동작 클립 (순수 함수, 브라우저·three 없이 시험할 수 있다).
 *
 * 동기화 규약은 그대로다: 다른 도반에게는 지금처럼 동작 이름(actionState: idle·bow_half·prostrate·meditate·incense·
 * circumambulate·tea·sit·lookUp)만 보낸다. 차수 걷기·합장 걷기처럼 새로 생긴 모습은 받는 쪽이 위치(구역)와 상태로
 * 스스로 고른다 — 서버(ACTIONS 허용 목록)와 이전 클라이언트를 바꾸지 않아도 섞여서 깨지지 않는다.
 */

/** 경내: 마당·법당·다실에서는 두 손을 모으고(차수) 다닌다. 숲길은 팔을 흔들며 걷는다. */
export const PRECINCT = new Set(['COURTYARD', 'DAEUNGJEON', 'TEAHOUSE']);

/** 한 번 하고 끝나는 동작 (seq) → 클립 */
const ONCE = { bow_half: 'bow_half', prostrate: 'prostrate', incense: 'incense' };

/** 클립이 아직 없을 때 대신 쓸 것 (앞에서부터 있는 것) */
const FALLBACK = {
  incense: ['incense', 'bow_half'],
  tea: ['tea', 'sit'],
  look_up: ['look_up', 'idle'],
  gassho: ['gassho', 'idle_chasu', 'idle'],
  idle_chasu: ['idle_chasu', 'idle'],
  walk_chasu: ['walk_chasu', 'walk'],
  walk_gassho: ['walk_gassho', 'walk_chasu', 'walk']
};

export const MOVING = 0.15; // m/s — 이보다 빠르면 걷는 동작 (절차식 아바타와 같은 기준)

/**
 * @param o.seq      진행 중인 한 번짜리 동작 이름 (없으면 null)
 * @param o.state    상태 (idle·sit·meditate·tea·circumambulate·lookUp·알 수 없는 값)
 * @param o.speed    지금 움직이는 속도 m/s
 * @param o.zone     지금 구역 (layout.zoneAt)
 * @param o.has      (클립 이름) => 있는지
 * @returns 클립 이름
 */
export function pickMotion({ seq = null, state = 'idle', speed = 0, zone = null, has }) {
  const ok = (name) => (FALLBACK[name] || [name]).find((n) => has(n)) || (has('idle') ? 'idle' : null);
  if (seq && ONCE[seq]) return ok(ONCE[seq]);
  const precinct = PRECINCT.has(zone);
  if (speed > MOVING) {
    if (state === 'circumambulate') return ok('walk_gassho');
    return ok(precinct ? 'walk_chasu' : 'walk');
  }
  switch (state) {
    case 'sit':
    case 'meditate':
      return ok('sit');
    case 'tea':
      return ok('tea');
    case 'lookUp':
      return ok('look_up');
    case 'circumambulate':
      return ok('gassho');
    default:
      return ok(precinct ? 'idle_chasu' : 'idle');
  }
}

/** 앉은 자세 (큰절은 서서 시작해 서서 끝나므로 선 자세로 본다) */
export const SEATED = new Set(['sit', 'tea']);
const VIA = new Set(['stand_up', 'sit_down']);

/**
 * 반가부좌 ↔ 선 자세는 그냥 섞으면 발바닥이 위↔아래로 돌며 다리가 꼬여 보인다 → 일어서기·앉기 클립을 사이에 넣는다.
 * 걷기 시작으로 일어설 때(moving)는 넣지 않는다 (미끄러지며 일어서지 않게, 바로 섞는다).
 */
export function transitionFor(from, to, moving, has) {
  if (!from || moving || VIA.has(from) || VIA.has(to)) return null;
  const a = SEATED.has(from), b = SEATED.has(to);
  if (a && !b && has('stand_up')) return 'stand_up';
  if (!a && b && has('sit_down')) return 'sit_down';
  return null;
}

/** 큰절 한 번 — tools/blender/avatar_clips.py 의 PROSTRATE_* 와 같아야 한다 (avatarMotion.test.js 가 monk.json 과 견준다) */
export const PROSTRATE = {
  length: 7.6, // 초 — 자동 108배는 8초에 한 번
  forehead: 3.6, // 이마가 바닥에 닿는 때
  // 도복이 스치는 '사락' [시작 s, 길이 s, 세기]: 꿇어앉기 · 손 짚고 발 포개기 · 접족례 올림·내림 · 밀고 일어나 합장 · 일어서기
  rustle: [[1.25, 0.9, 1.0], [2.85, 0.6, 0.7], [4.15, 0.45, 0.35], [5.05, 0.45, 0.35], [5.45, 0.8, 0.8], [6.3, 0.9, 0.9]]
};

/**
 * 클립 사이 크로스페이드(초) — tools/qa/avatar-fade.mjs 로 잰 값 (2026-11-06, 1.1m/s 걷기·7.6초 큰절 monk.glb):
 * 섞는 동안 뼈 회전 속도·골반 이동 속도의 최댓값이 '두 클립 자체의 최댓값, 반배의 회전 최댓값(352°/s),
 * 큰절의 골반 최댓값(0.43m/s)' 가운데 큰 것을 넘지 않는 가장 짧은 길이 (쌍마다 잰 값 중 가장 긴 것으로 묶음).
 *   서기↔걷기 0.25(0.2~0.25) · 걷기↔차수걷기↔합장걷기 0.4 · 반배 시작 0.5 / 끝 0.25 · 큰절 시작 0.5 / 끝 0.1
 *   일어서기·앉기 클립 앞뒤 0.15(0.1~0.15) · 그 클립 없이 앉고 설 때(걸어 나갈 때) 0.8
 */
export const FADE = { move: 0.25, walkSwap: 0.4, bowIn: 0.5, bowOut: 0.25, prostrateIn: 0.5, prostrateOut: 0.1, via: 0.15, seat: 0.8 };

export function fadeFor(from, to) {
  if (!from) return 0;
  if (VIA.has(from) || VIA.has(to)) return FADE.via;
  if (SEATED.has(from) !== SEATED.has(to)) return FADE.seat;
  if (to === 'bow_half') return FADE.bowIn;
  if (from === 'bow_half') return FADE.bowOut;
  if (to === 'prostrate') return FADE.prostrateIn;
  if (from === 'prostrate') return FADE.prostrateOut;
  if (from.startsWith('walk') && to.startsWith('walk')) return FADE.walkSwap;
  return FADE.move;
}
