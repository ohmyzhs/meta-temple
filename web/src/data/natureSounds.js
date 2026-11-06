/**
 * 자연의 소리 — tools/audio/build.py 가 manifest.json 대로 잘라 만든 web/assets/audio/nature/<f>.m4a (AAC 를 못 푸는 브라우저는 .mp3)
 * 출처·라이선스는 tools/audio/manifest.json 의 sources 와 credits.js 「자료 출처」.
 *
 * 배경(BEDS): 한 배경이 조각(40~60초) 여러 개를 번갈아 튼다 — 같은 조각을 연달아 고르지 않고 시작 위치도 달리해 1~2분 반복이 들리지 않게.
 *   layer: soundEngine 의 레이어(L.*) · level: 레이어 안 크기(-24 LUFS 로 맞춘 녹음을 합성음과 같은 크기로)
 *   조각의 time(시간대) · months(한국 시각의 달)가 지금과 맞는 것만 고른다. 고를 조각이 없으면 그 배경은 쉰다.
 *   필요할 때만 받고(첫 입장에 다 받지 않는다) 한동안 안 들리면 풀어 둔 소리를 놓는다.
 * 원샷(SHOTS): 짧은 소리 묶음 — 처음 쓸 때 받는다 (gust·bell·chime·moktak 은 입장할 때).
 */

const SUMMER_BIRDS = [4, 5, 6, 7, 8, 9]; // 산솔새·지빠귀는 여름 철새
const P = (names, tags) => names.map((f) => ({ f, ...tags }));
const N = (base, n, tags) => P(Array.from({ length: n }, (_, i) => `${base}-${i + 1}`), tags);

/**
 * 배경 이름 → { layer, level, replaces?, pieces } — level 은 tools/qa/levels.mjs 로 합성음과 같은 크기가 되게 실측한 값
 * (합성음이 없는 레이어는 -24 LUFS 녹음끼리 크기를 맞춰 둔 값)
 */
export const NATURE_BEDS = {
  stream: { layer: 'stream', replaces: 'stream', level: 2.7, /* 예전 3.5(-26.3 LUFS) → -24.1 */ pieces: [...N('stream-jiri', 2), ...N('stream-dobong', 2), ...N('stream-hwagae', 2)] },
  rain: { layer: 'rain', replaces: 'rain', level: 3.2, pieces: [...N('rain-baekryeon', 2), ...N('rain-garisan', 2), ...N('rain-guryong', 1)] },
  // 늘 깔리는 솔바람 (돌풍 녹음 gust 는 그 위에 가끔). 겨울엔 눈 내린 숲의 고요를 섞는다
  wind: { layer: 'wind', level: 2.4, /* 합성 바람과 같은 크기(3.43, levels.mjs · wind-pine-1)의 0.7 — 돌풍 녹음이 위에 얹힌다. 예전 4.0 은 경주남산 조각(5.77) 기준 */ pieces: [...N('wind-pine', 3), ...N('winter-appalachia', 2, { months: [12, 1, 2] })] }, // 경주남산 솔바람은 명상 내레이션이 섞여 뺐다
  bamboo: { layer: 'bamboo', level: 0.474, pieces: N('bamboo-juknok', 1) } /* 돗토리 대숲 녹음은 실개천이 섞여 뺐다 — 물 없는 대숲에서 물소리가 나지 않게 */,
  // 산새 둘을 겹친다 (예전 birds·birds2 처럼) — 시간대·달마다 그때 우는 새만
  birds: { layer: 'birds', replaces: 'birds', level: 0.95, pieces: birdPieces() },
  birds2: { layer: 'birds', replaces: 'birds2', level: 0.6, pieces: birdPieces() },
  crickets: { layer: 'crickets', replaces: 'insects', level: 3.3, /* 예전 4.9(스테레오 -24.3) → 모노 -24.0 은 두 채널로 퍼지며 3dB 커진다 */ pieces: N('crickets-baekryeon', 2, { months: [8, 9, 10, 11] }) },
  cicadas: { layer: 'cicadas', level: 1.43, /* 한낮 숲 산새(0.3×1.5×0.95)와 같은 크기 */ pieces: N('cicadas-jiri', 2, { months: [7, 8] }) } /* 영원사 매미는 계류 물소리가 커서 뺐다 */,
  frogs: { layer: 'frogs', level: 0.66, /* 밤 풀벌레(0.06×3.3)와 같은 크기 */ pieces: [...N('frogs-baekryeong', 1, { months: [5, 6, 7] }), ...N('frogs-pool', 3, { months: [4, 5, 6, 7] })] },
  chant: { layer: 'chant', replaces: 'chant', level: 0.98, pieces: N('chant-baekyang', 3) },
  spring: { layer: 'spring', replaces: 'spring', level: 0.98, pieces: N('spring-dogap', 3) },
  fire: { layer: 'brazier', level: 1.51, /* 모닥불 조각은 탁 소리 봉우리를 8dB 깎고(peakcut) -29 LUFS 로 맞췄다 — 예전 -37 LUFS·3.8 과 같은 크기(-8dB), 봉우리만 낮다 (headroom.mjs) */ pieces: N('fire-camp', 3) }
};

function birdPieces() {
  return [
    ...N('birds-gonjul', 3, { time: ['dawn', 'day'] }), // 곤줄박이 — 텃새
    ...N('birds-sansol', 2, { time: ['dawn', 'day'], months: SUMMER_BIRDS }),
    ...N('birds-thrush', 3, { time: ['dawn', 'sunset'], months: [4, 5, 6, 7, 8, 9, 10] }), // 흰배지빠귀 — 새벽·해질녘
    ...N('birds-thrush2', 2, { time: ['dawn', 'sunset'], months: [5, 6, 7, 8, 9] }), // 되지빠귀
    ...N('birds-cuckoo', 2, { time: ['day'], months: [5, 6, 7] }) // 뻐꾸기 — 초여름 낮
  ];
}

const S = (base, n) => Array.from({ length: n }, (_, i) => `${base}-${i + 1}`);
/** 원샷 이름 → 파일 이름들, 또는 { sprite, n, slot, len } (한 파일에 n 칸 — tools/audio sprite) */
export const NATURE_SHOTS = {
  gust: S('gust-pine', 5), // 솔숲 바람이 부풀었다 가라앉는 곳 (예전 gust-1~6 은 내레이션이 섞여 뺐다 — 이름을 바꿔 캐시와 섞이지 않게)
  bell: ['bell-hwaeom-1', 'bell-hwaeom-2', 'bell-manbong-1'],
  chime: { sprite: 'chime', n: 8, slot: 4, len: 3.8 },
  scops: S('scops', 4),
  owl: S('owl', 3),
  eagleowl: S('eagleowl', 4),
  thunder: ['thunder-1', 'thunder-2', ...S('thunder-far', 4)],
  drip: { sprite: 'drip', n: 12, slot: 0.5, len: 0.35 },
  sweep: ['sweep-1'],
  // 발소리 (재질별)
  'step-gravel': { sprite: 'step-gravel', n: 12, slot: 0.6, len: 0.45 },
  'step-earth': { sprite: 'step-earth', n: 10, slot: 0.6, len: 0.45 },
  'step-leaves': { sprite: 'step-leaves', n: 14, slot: 0.7, len: 0.55 },
  'step-floor': { sprite: 'step-floor', n: 12, slot: 0.6, len: 0.45 },
  'step-deck': { sprite: 'step-deck', n: 14, slot: 0.7, len: 0.55 },
  'step-stone': { sprite: 'step-stone', n: 8, slot: 0.5, len: 0.4 },
  'step-snow': { sprite: 'step-snow', n: 12, slot: 0.7, len: 0.55 },
  // 행동 효과음
  chukbi: { sprite: 'chukbi', n: 6, slot: 0.6, len: 0.35 },
  beads: { sprite: 'beads', n: 12, slot: 0.4, len: 0.25 },
  pebble: { sprite: 'pebble', n: 6, slot: 0.8, len: 0.6 },
  paper: { sprite: 'paper', n: 3, slot: 0.9, len: 0.8 },
  robe: { sprite: 'robe', n: 10, slot: 1.0, len: 0.9 },
  brush: { sprite: 'brush', n: 10, slot: 0.5, len: 0.4 },
  paperfire: ['paperfire-1'],
  pour: ['pour-1']
};

/** 밤새가 우는 달 — 소쩍새·솔부엉이는 여름 철새, 수리부엉이는 겨울에 운다 */
export const NIGHT_CALLS = { scops: [4, 5, 6, 7, 8], owl: [5, 6, 7, 8, 9], eagleowl: [10, 11, 12, 1, 2, 3] };

/** 산 어디서나 쓰는 원샷 — 산문에서 들리는 첫 배경이 켜진 뒤 받는다 (돌풍은 어디서나 불고, 범종은 산책로 전역에 들린다). 풍경 등 자리 소리는 들릴 자리에서 처음 울릴 때 */
export const SHOTS_AT_ENTRY = ['gust', 'bell'];

/** 구역에 들어서면 미리 받아 둘 행동 효과음 (첫 동작부터 녹음으로) */
export const FOLEY_BY_ZONE = {
  FOREST: ['pebble'],
  COURTYARD: ['paperfire', 'paper', 'brush', 'sweep'],
  DAEUNGJEON: ['beads', 'robe', 'paper', 'brush'],
  TEAHOUSE: ['pour', 'chukbi', 'paper']
};

/**
 * 「자연의 소리 듣기」 장면 — 쉼터(또는 선 자리)에 앉아 길게 듣는다. 잠자기 타이머 15·30·60분.
 * time·month·weather: 이 장면의 시간대·달·날씨 (그에 맞는 조각을 고르고, 하늘도 그렇게 바꾼다)
 * mix: 들리는 레이어와 배율 (없는 레이어는 끈다) · chimes: 가끔 처마 풍경
 */
export const NATURE_PRESETS = [
  { id: 'valley', title: '계곡 물가', note: '여울 물소리와 한낮 산새', time: 'day', month: 6, weather: 'clear', mix: { stream: 1.6, birds: 0.8, wind: 0.6 } },
  { id: 'rain', title: '산사의 비', note: '처마 낙숫물과 먼 천둥', time: 'day', month: 6, weather: 'rain', mix: { rain: 1.3, stream: 0.5, wind: 0.7 }, chimes: true },
  { id: 'pines', title: '솔바람·대숲', note: '소나무와 대나무를 지나는 바람', time: 'day', month: 10, weather: 'clear', mix: { wind: 1.6, bamboo: 1.2, birds: 0.4 }, chimes: true },
  { id: 'dawn', title: '새벽 숲', note: '지빠귀가 깨우는 산', time: 'dawn', month: 5, weather: 'clear', mix: { birds: 1.2, stream: 0.4, wind: 0.4 } },
  { id: 'summer', title: '여름 한낮', note: '매미와 계류', time: 'day', month: 8, weather: 'clear', mix: { cicadas: 1, stream: 0.7, wind: 0.5 } },
  { id: 'springnight', title: '봄밤', note: '개구리와 소쩍새', time: 'night', month: 5, weather: 'clear', mix: { frogs: 1, wind: 0.3 } },
  { id: 'autumnnight', title: '가을밤', note: '풀벌레와 산바람', time: 'night', month: 10, weather: 'clear', mix: { crickets: 1.2, wind: 0.6 } },
  { id: 'winter', title: '겨울 산사', note: '눈 내린 고요와 풍경', time: 'night', month: 1, weather: 'snow', mix: { wind: 0.8 }, chimes: true },
  { id: 'tea', title: '다실 찻물', note: '물 끓는 소리와 연못 샘물', time: 'day', month: 11, weather: 'clear', mix: { kettle: 1.2, spring: 0.8, wind: 0.3 } },
  { id: 'fire', title: '화롯가', note: '장작 타는 소리와 겨울바람', time: 'night', month: 12, weather: 'snow', mix: { brazier: 0.46, wind: 0.7 } } // 화로 레이어 크기를 2.8배로 올린 만큼 (headroom.mjs 그대로)
];

/** 잠자기 타이머(분) — 0 은 끔 */
export const SLEEP_MINUTES = [0, 15, 30, 60];
