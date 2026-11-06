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

/** 배경 이름 → { layer, level, pieces } */
export const NATURE_BEDS = {};

/** 원샷 이름 → 파일 이름들 */
export const NATURE_SHOTS = {};

/** 입장할 때 미리 받는 원샷 */
export const SHOTS_AT_ENTRY = [];

/**
 * 「자연의 소리 듣기」 장면 — 쉼터(또는 선 자리)에 앉아 길게 듣는다. 잠자기 타이머 15·30·60분.
 * time·month·weather: 이 장면의 시간대·달·날씨 (그에 맞는 조각을 고르고, 하늘도 그렇게 바꾼다)
 * mix: 들리는 레이어와 배율 (없는 레이어는 끈다) · chimes: 가끔 처마 풍경
 */
export const NATURE_PRESETS = [
  { id: 'valley', title: '계곡 물가', note: '여울 물소리와 한낮 산새', time: 'day', month: 6, weather: 'clear', mix: { stream: 1.6, birds: 0.8, wind: 0.6 } },
  { id: 'falls', title: '폭포 아래', note: '쏟아지는 물줄기', time: 'day', month: 7, weather: 'clear', mix: { falls: 1, birds: 0.5, wind: 0.4 } },
  { id: 'rain', title: '산사의 비', note: '처마 낙숫물과 먼 천둥', time: 'day', month: 6, weather: 'rain', mix: { rain: 1.3, stream: 0.5, wind: 0.7 }, chimes: true },
  { id: 'pines', title: '솔바람·대숲', note: '소나무와 대나무를 지나는 바람', time: 'day', month: 10, weather: 'clear', mix: { wind: 1.6, bamboo: 1.2, birds: 0.4 }, chimes: true },
  { id: 'dawn', title: '새벽 숲', note: '지빠귀가 깨우는 산', time: 'dawn', month: 5, weather: 'clear', mix: { birds: 1.2, stream: 0.4, wind: 0.4 } },
  { id: 'summer', title: '여름 한낮', note: '매미와 계류', time: 'day', month: 8, weather: 'clear', mix: { cicadas: 1, stream: 0.7, wind: 0.5 } },
  { id: 'springnight', title: '봄밤', note: '개구리와 소쩍새', time: 'night', month: 5, weather: 'clear', mix: { frogs: 1, wind: 0.3 } },
  { id: 'autumnnight', title: '가을밤', note: '풀벌레와 산바람', time: 'night', month: 10, weather: 'clear', mix: { crickets: 1.2, wind: 0.6 } },
  { id: 'winter', title: '겨울 산사', note: '눈 내린 고요와 풍경', time: 'night', month: 1, weather: 'snow', mix: { wind: 0.8 }, chimes: true },
  { id: 'tea', title: '다실 찻물', note: '물 끓는 소리와 연못 샘물', time: 'day', month: 11, weather: 'clear', mix: { kettle: 1.2, spring: 0.8, wind: 0.3 } },
  { id: 'fire', title: '화롯가', note: '장작 타는 소리와 겨울바람', time: 'night', month: 12, weather: 'snow', mix: { brazier: 1.3, wind: 0.7 } }
];

/** 잠자기 타이머(분) — 0 은 끔 */
export const SLEEP_MINUTES = [0, 15, 30, 60];
