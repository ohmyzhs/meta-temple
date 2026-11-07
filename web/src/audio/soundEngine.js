/**
 * 청연산사 (清蓮山寺) — Web Audio API 절차적 공간 ASMR 엔진
 * 오디오 파일 없이 노이즈 버퍼·오실레이터·모달 합성·컨볼루션 리버브·HRTF 패너로
 *  1) 자연음: 솔바람, 계곡물, 산새, 빗소리·낙숫물, 풀벌레, 소쩍새, 댓바람
 *  2) 사찰음: 풍경, 범종, 법당 독송 드론과 먼 목탁, 화로, 찻물 끓는 소리
 *  3) 수행 효과음: 목탁, 죽비, 염주, 조약돌, 발소리, 차 따르기, 한지, 붓, 연등
 * 을 실시간 합성합니다.
 *
 * 녹음 레이어: loadRecordings()가 web/assets/audio 의 실제 녹음(국립공원공단 「자연의소리」, 공공누리 제1유형)을
 * 받아 오면 같은 레이어 안에서 합성음 → 녹음으로 교차 페이드한다. 못 받으면 합성음이 그대로 남는다.
 *
 * 신호 흐름: 레이어 → (HRTF 패너) → nature/temple/sfx 버스 → master → 안전 리미터 → 출력
 *            각 버스 → send → 공용 ConvolverNode 리버브(절차 생성 IR, RT60 ≈ 3.2초) → master
 * 좌표: 미터, Y 위, -Z 북쪽.
 */

import { isAndroid, startTicker, applySession, setMediaActions, setNowPlaying, setPlaybackState } from './background.js';
import { kstMonth } from '../core/state.js';
import { NATURE_BEDS, NATURE_SHOTS, SHOTS_AT_ENTRY, NIGHT_CALLS, FOLEY_BY_ZONE } from '../data/natureSounds.js';

const TICK_MS = 200; // 스케줄러 주기 (워커 타이머 하나로 모든 간헐음 예약 — background.js)
const LOOKAHEAD = 0.6; // 선행 예약 시간(초) — 틱이 조금 늦어도 박자가 흔들리지 않게
const LOOKAHEAD_HIDDEN = 4; // 화면이 꺼져 계속 들을 때: 틱이 1초 넘게 늦어도 배경 녹음 이음새가 끊기지 않게
const ZONE_FADE = 2.5; // 구역·날씨·시간대 크로스페이드
// ───── 소리 전파: 자리에서 나는 소리는 모두 같은 법칙 (propagate) ─────
// 들리는 크기 = 레이어 크기 × 퍼짐 × 숲·지형 초과 감쇠 × 담 가림. 멀수록 고음이 먼저 줄어든다(airTone)
//  퍼짐: 점 음원(화로·종)은 거리가 두 배면 -6dB, 선 음원(물길)은 -3dB, 면 음원(대숲)은 가장자리부터 점처럼
//  초과 감쇠: FREE_M 을 넘으면 1m 마다 alpha dB (나무·덤불·골짜기 둔덕). 저음이 큰 소리(범종)는 숲이 덜 먹어 alpha 가 작다
//  담 가림: 음원과 듣는 이가 다른 곳(바깥·마당·다실·법당)이면 — 자리는 좌표로 정한다(roomAt), 경계는 BLEND_M 에 걸쳐 섞는다
//  새 자리 소리는 PLACED(배경) 또는 _spot(원샷)에 위치·모양·세기만 주면 같은 법칙을 받는다
const PROP = { FREE_M: 10, ALPHA_DB: 1.5, MUTE: 0.003 };
const WALL = { courts: 0.25, tea: 0.25, hall: 0.5 }; // 담 너머 소리 배율 (법당은 문을 열어 두어 덜 가린다)
const BLEND_M = 6; // 숲↔마당↔다실 경계: 이만큼에 걸쳐 섞는다 (계단 한 칸에서 툭 바뀌지 않게)
function propagate(d, ref, shape = 'point', alpha = PROP.ALPHA_DB) {
  const r = Math.max(ref, d);
  const g = (shape === 'line' ? Math.sqrt(ref / r) : ref / r) * 10 ** (-(Math.max(0, d - PROP.FREE_M) * alpha) / 20);
  return g < PROP.MUTE ? 0 : g;
}
const airTone = (d) => 16000 / (1 + Math.max(0, d - 3) / 9); // 3m 16kHz · 12m 8kHz · 24m 4.6kHz (근사)

// 레이어 크기: base × 같은 이름 칸의 시간대(t)·날씨(w)·구역(z) 배율 — 바람·비·산새·풀벌레·매미는 산 어디서나 (자리와 무관)
const LAYERS = {
  wind: { base: 0.06, w: 'wind', z: 'wind' }, // 돌풍만 싣는다 — 가장 센 돌풍도 나머지 소리보다 크지 않게 (사용자 2026-11-06 「바람이 너무 크다」, tools/qa/wind.mjs: 0.3 에서 산문 +12.1dB · 800Hz 걷은 돌풍 0.07 에서 -0.7dB)
  rain: { base: 0.3, w: 'rain' },
  birds: { base: 0.3, t: 'birds', w: 'birds', z: 'birds', max: 1.6, fade: 6 },
  crickets: { base: 0.06, t: 'crickets', w: 'crickets' },
  cicadas: { base: 0.3, t: 'cicadas', w: 'cicadas' },
  frogs: { base: 0.3, t: 'frogs', w: 'frogs' },
  stream: { base: 0.5, w: 'stream' },
  spring: { base: 0.5 },
  bamboo: { base: 0.35 },
  brazier: { base: 1.4, flare: true }, // 사용자 2026-11-06: 화로 곁(3~5m)에서 타닥 소리가 분명히 (tools/qa/brazier.mjs)
  kettle: { base: 0.45 },
  chant: { base: 0.6, duck: true } // 예불 듣는 동안은 내린다
};
// 자리 소리 레이어: 어디서(at: emit 키 · 'stream' 물길 선 · 'groves' 대숲 면 · 'water' 물길+연못) · 모양 · ref(이 거리까지 온전히 = 세기) · alpha
// preset: 장면 듣기 때 듣는 자리에서의 위치 (dx, dy, dz)
const PLACED = {
  stream: { at: 'stream', shape: 'line', ref: 3, preset: [3, -1.2, -2.5] },
  frogs: { at: 'water', shape: 'line', ref: 8, preset: [-6, -1, 5] }, // 개구리는 물가에서
  spring: { at: 'pond', shape: 'point', ref: 4, preset: [2.5, -1.2, -2] },
  bamboo: { at: 'groves', shape: 'area', ref: 5, preset: [-4, 2, -5] },
  brazier: { at: 'brazier', shape: 'point', ref: 4, alpha: 3, preset: [-1.4, -0.9, -0.6] }, // 4m 안은 온전히, 타닥(고음)은 10m 넘으면 숲이 빨리 먹는다
  kettle: { at: 'kettle', shape: 'point', ref: 1.5, preset: [1.2, -0.6, -1] },
  chant: { at: 'chant', shape: 'point', ref: 4, alpha: 1.0, preset: [0, 2, -14] }
};
// 범종 (사용자 2026-11-06: 더 크고 넓게 — 산책로 전역까지): 예전 -15.9 LUFS 녹음에 0.6 → 지금 -22 LUFS 녹음에 1.8 (+3.5dB 키움)
const BELL = { ref: 30, alpha: 0.05, gain: 1.8, wet: 0.12, wetFar: 0.3 };
const GATE_FADE = 1.5; // 걸으며 바뀌는 크기를 따라가는 시간
const MASTER_LEVEL = 0.9;
const BEAT = 1.1; // 법당 목탁 박 간격(초)

// 구역별 믹스 — outside: 바깥 자연음 버스 배율, tone: 자연음 로우패스(Hz), wet: 리버브 send 배율
const ZONE_MIX = {
  FOREST: { outside: 1, tone: 16000, wind: 1.0, stream: 1.0, birds: 1.5, chant: 0, kettle: 0.6, bamboo: 0.6, wet: 1 },
  COURTYARD: { outside: 1, tone: 16000, wind: 0.6, stream: 0.2, birds: 0.35, chant: 0.3, kettle: 0.6, bamboo: 0.6, wet: 1 }, // 담장 안: 계곡·숲 소리는 멀리
  DAEUNGJEON: { outside: 0.4, tone: 1800, wind: 1.0, stream: 1.0, birds: 0.6, chant: 1, kettle: 0, bamboo: 0, wet: 2.2 },
  TEAHOUSE: { outside: 1, tone: 16000, wind: 0.6, stream: 0.1, birds: 0.7, chant: 0, kettle: 1, bamboo: 1.3, wet: 1 },
};
// 자연의 소리 듣기(장면 프리셋): 구역 대신 이것 — 장면이 고른 레이어를 구역 배율 없이 그대로
const PRESET_ZONE = { outside: 1, tone: 16000, wind: 1, stream: 1, birds: 1, chant: 1, kettle: 1, bamboo: 1, wet: 1 };
const WEATHER_MIX = {
  clear: { rain: 0, wind: 1.0, stream: 1.0, birds: 1.0, crickets: 1.0, cicadas: 1, frogs: 1, tone: 16000 },
  rain: { rain: 1, wind: 1.1, stream: 1.0, birds: 0.35, crickets: 0.4, cicadas: 0, frogs: 1.2, tone: 16000 }, // 비 오면 매미는 그치고 개구리는 더 운다
  snow: { rain: 0, wind: 0.7, stream: 0.8, birds: 0.3, crickets: 0, cicadas: 0, frogs: 0, tone: 3200 }, // 눈: 먹먹하게
};
const TIME_MIX = {
  dawn: { birds: 1.6, crickets: 0.2, cicadas: 0.2, frogs: 0.4 },
  day: { birds: 1.0, crickets: 0, cicadas: 1, frogs: 0.1 },
  sunset: { birds: 0.5, crickets: 0.5, cicadas: 0.5, frogs: 0.7 },
  night: { birds: 0, crickets: 1.0, cicadas: 0, frogs: 1 },
};

// setEmitters()가 오기 전에도 동작하도록 설계 좌표를 기본값으로 둔다
const DEFAULT_EMITTERS = {
  stream: [
    { x: -45, y: 0.3, z: 14 }, { x: -15, y: 0.3, z: 16 }, { x: 0, y: 0.3, z: 15 },
    { x: 15, y: 0.3, z: 14 }, { x: 45, y: 0.3, z: 16 },
  ],
  chimes: [
    { x: 7.5, y: 5.5, z: -19.5 }, { x: -7.5, y: 5.5, z: -19.5 },
    { x: 13.5, y: 4.5, z: -0.5 }, { x: 8.5, y: 4.5, z: -5.5 },
  ],
  chant: { x: 0, y: 3.8, z: -27 },
  brazier: { x: -12, y: 1.5, z: -6 },
  kettle: { x: 22, y: 2, z: -12 },
  bamboo: { x: 31, y: 3, z: -12 },
  bell: { x: 11, y: 3.5, z: -3 },
  pond: { x: 23.6, y: 1.2, z: -3.7 },
  sweep: { x: -8, y: 0.6, z: -12 }, // 마당 서쪽에서 비질
};

// 예전 녹음 레이어 — web/assets/audio/<name>1..n.mp3 (목탁만 남았다. 나머지 자연의 소리는 data/natureSounds.js)
const REC_ORDER = [['moktak', 3]];
const BED_XFADE = 4; // 배경 녹음 이음새 교차 페이드(초)
// 자연의 소리 배경(data/natureSounds.js): 조각을 번갈아 틀며 필요할 때만 받고 풀어 둔다
const FLARE_BOOST = 0.8; // flareBrazier: 처음 배율 1.8 (+5dB) — 종이 불 소리와 겹쳐도 리미터가 누르지 않게 (headroom.mjs)
const BED_PREFETCH = 12; // 지금 조각이 끝나기 이만큼 전에 다음 조각을 받아 풀어 둔다(초) — 47초 조각 하나가 모바일에서 1~2초
const BED_AUDIBLE = 0.006; // 이보다 작게 들릴 배경(약 -44dB)은 받지도 틀지도 않는다
const ENTRY_FADE = 4.5; // 입장하면 소리를 이만큼에 걸쳐 올린다 — 그동안 첫 녹음을 받는다 (사용자: 5초 안 페이드인이면 괜찮다)
const BED_RELEASE = 40; // 이만큼 안 들리면 풀어 둔 소리를 놓는다(초) — 다시 들리면 받아 둔 압축본에서 다시 푼다
const DECODED_CAP = 150 * 1048576; // 풀어 둔 소리 상한(48kHz 스테레오는 초당 384KB). 넘으면 새 조각을 풀지 않고 지금 조각을 다시 쓴다
const PACKED_CAP = 48 * 1048576; // 받아 둔 압축본 상한 (자연의 소리 m4a 전부 약 39MB 가 들어간다) — 넘으면 오래 안 쓴 것부터 버린다
const SLEEP_FADE = 30; // 잠자기 타이머가 끝나기 전 이만큼에 걸쳐 소리를 줄인다(초)
// 녹음 발소리 재질별 크기 (stepBus 안에서) — 합성 발소리와 같은 크기로 실측해 맞춘다
const STEP_LEVEL = { gravel: 0.201, earth: 1.019, stone: 0.162, floor: 0.716, deck: 0.217, leaves: 0.13, snow: 0.055 }; // 낙엽·눈은 흙 합성, 마루·데크는 나무 합성과
// 행동 효과음 녹음 크기 (sfx 버스 안에서) — 합성음과 같은 크기로 실측해 맞춘다 (tools/qa/levels.mjs)
// 평균 크기로 맞춘 뒤, 봉우리가 합성음보다 3dB 넘게 큰 것(종이 불·찻물·도복·한지·조약돌·죽비)은 봉우리를 묶었다 (levels.mjs peak, headroom.mjs)
const FOLEY_LEVEL = { beads: 0.158, pebble: 0.253, chukbi: 0.433, paper: 0.2, brush: 0.07, robe: 0.112, paperfire: 1.04, pour: 0.535 };
const GUST_GAP = [18, 42]; // 산들바람 '솨아' 사이 간격(초) — 계속 불지 않고 가끔
const GUST_LEVEL = 2.0;

const CHIME_PITCH = [1174.7, 1318.5, 1046.5, 1568.0, 1760.0]; // 풍경마다 고정 음높이(오음음계)
const BLESSING_CHORDS = [[784, 1046.5, 1318.5], [587.33, 880, 1318.5], [659.25, 987.77, 1318.5]];
const VOWELS = [[750, 1150, 2600], [480, 820, 2600], [350, 700, 2500], [520, 1650, 2500], [620, 1000, 2600]]; // 아·오·우·에·어 포먼트

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** near 안에서는 1, far 밖에서는 0, 그 사이는 부드럽게 — 소리가 자리를 따라 켜지고 꺼지지 않고 서서히 */
const near = (d, nearM, farM) => 1 - smooth(nearM, farM, d);
/** 직사각형 { x0, x1, z0, z1 } 까지의 수평 거리 (안이면 0) */
const rectDist = (r, p) => Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.z0 - p.z, 0, p.z - r.z1));
const rectNearest = (r, p) => ({ x: Math.max(r.x0, Math.min(r.x1, p.x)), z: Math.max(r.z0, Math.min(r.z1, p.z)) });

// PannerNode/AudioListener 위치 — positionX가 없는 브라우저(Firefox 리스너 등)는 setPosition 폴백
function setPos(node, p) {
  if (node.positionX) {
    node.positionX.value = p.x;
    node.positionY.value = p.y;
    node.positionZ.value = p.z;
  } else node.setPosition(p.x, p.y, p.z);
}

// 계곡처럼 선으로 이어진 음원: 리스너에서 가장 가까운 선분 위 지점
function nearestOnPath(pts, p) {
  if (pts.length === 1) return pts[0];
  let best = pts[0];
  let bd = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len2 = dx * dx + dy * dy + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / len2));
    const q = { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t };
    const d = dist(q, p);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

function toBuffer(ctx, d, target, mode) {
  let s = 0;
  for (let i = 0; i < d.length; i++) s = mode === 'rms' ? s + d[i] * d[i] : Math.max(s, Math.abs(d[i]));
  const k = target / ((mode === 'rms' ? Math.sqrt(s / d.length) : s) || 1);
  const buf = ctx.createBuffer(1, d.length, ctx.sampleRate);
  const out = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) out[i] = d[i] * k;
  return buf;
}

// 루프용 노이즈 버퍼: 끝 50ms를 시작부와 등전력 크로스페이드해 이음새 클릭을 없애고 RMS 0.25로 정규화
function noiseBuffer(ctx, seconds, kind) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const fade = Math.floor(sr * 0.05);
  const d = new Float32Array(len + fade);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last;
    } else if (kind === 'pink') {
      // Paul Kellet 핑크 노이즈 필터
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else d[i] = w;
  }
  for (let i = 0; i < fade; i++) {
    const a = (i / fade) * (Math.PI / 2);
    d[i] = d[i] * Math.sin(a) + d[len + i] * Math.cos(a);
  }
  return toBuffer(ctx, d.subarray(0, len), 0.25, 'rms');
}

// 희소 이벤트 버퍼(타닥/기포/풀벌레): 이벤트를 버퍼 길이로 감싸 써서(wrap) 루프 이음새가 없다
function eventBuffer(ctx, seconds, write) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const d = new Float32Array(n);
  write(d, sr, n);
  return toBuffer(ctx, d, 0.9, 'peak');
}

// 장작·종이 타닥: 포아송 간격의 짧은 감쇠 노이즈 임펄스 (가끔 큰 '탁')
function writeCrackle(d, sr, n) {
  for (let i = 0; i < n; ) {
    i += Math.floor((sr * -Math.log(1 - Math.random())) / 16);
    const amp = 0.1 + 0.9 * Math.random() ** 3;
    const len = Math.floor(sr * rand(0.0008, 0.006));
    for (let k = 0; k < len; k++) d[(i + k) % n] += (Math.random() * 2 - 1) * amp * Math.exp((-4 * k) / len);
  }
}

// 물방울 기포(Minnaert 공명): 크기마다 다른 높이에서 위로 살짝 휘는 짧은 사인
function writeBubbles(d, sr, n) {
  for (let i = 0; i < n; ) {
    i += Math.floor((sr * -Math.log(1 - Math.random())) / 22);
    const f0 = 380 * 2 ** (Math.random() * 2.2);
    const len = Math.floor(sr * rand(0.012, 0.04));
    const amp = 0.2 + 0.8 * Math.random() ** 2;
    let ph = 0;
    for (let k = 0; k < len; k++) {
      const x = k / len;
      ph += (2 * Math.PI * f0 * (1 + 0.9 * x)) / sr;
      d[(i + k) % n] += Math.sin(ph) * amp * Math.exp(-5 * x) * Math.min(1, k / (sr * 0.0015));
    }
  }
}

// 귀뚜라미 처프: 4.4kHz 펄스 3~4개 묶음, 불규칙한 간격과 가끔 쉼
function writeCricket(d, sr, n) {
  for (let t = 0.05; t < n / sr; t += rand(0.38, 0.62) + (Math.random() < 0.12 ? rand(0.6, 1.4) : 0)) {
    const pulses = Math.random() < 0.5 ? 3 : 4;
    for (let p = 0; p < pulses; p++) {
      const s = Math.floor((t + p * 0.026) * sr);
      const len = Math.floor(0.016 * sr);
      for (let k = 0; k < len; k++) {
        d[(s + k) % n] += Math.sin((2 * Math.PI * 4400 * k) / sr) * Math.sin((Math.PI * k) / len) ** 2 * (1 - p * 0.12);
      }
    }
  }
}

// 방울벌레 트릴: 3.65kHz를 42Hz로 떨며 1~2초 울고 잠깐 쉰다
function writeTrill(d, sr, n) {
  let on = true;
  for (let t = 0; t < n / sr; on = !on) {
    const seg = on ? rand(1.0, 2.2) : rand(0.35, 0.9);
    if (on) {
      const s = Math.floor(t * sr);
      const len = Math.floor(seg * sr);
      const edge = 0.08 * sr;
      for (let k = 0; k < len; k++) {
        const env = Math.min(1, k / edge, (len - k) / edge);
        const am = 0.5 - 0.5 * Math.cos((2 * Math.PI * 42 * k) / sr);
        d[(s + k) % n] += Math.sin((2 * Math.PI * 3650 * k) / sr) * am * env;
      }
    }
    t += seg;
  }
}

// 리버브 IR: 18ms 프리딜레이 + 초기 반사 + 시간이 갈수록 고역이 먼저 사라지는 어두운 노이즈 꼬리
function impulseResponse(ctx, seconds = 3.2) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const pre = Math.floor(sr * 0.018);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      lp += (Math.random() * 2 - 1 - lp) * (0.85 * Math.exp(-t * 1.6) + 0.08);
      d[i] = lp * Math.exp((-6.9 * t) / seconds) * Math.min(1, t / 0.008);
    }
    for (let r = 0; r < 6; r++) d[pre + Math.floor(sr * rand(0.005, 0.07))] += rand(-0.5, 0.5);
  }
  return buf;
}

export class TempleSoundEngine {
  constructor() {
    this.ctx = null;
    this._enabled = false;
    this.volumes = { nature: 0.7, temple: 0.65, sfx: 0.8 };
    this.zone = 'FOREST';
    this.weather = 'clear';
    this.time = 'day';
    this.emit = { ...DEFAULT_EMITTERS };
    this._lp = { x: 0, y: 1.6, z: 34 }; // 리스너 위치 (일주문 앞)
    this._voices = {};
    this._queue = [];
    this._timer = null;
    this._suspendAt = 0;
    this._gustNext = 0;
    this._owlNext = 0;
    this._thunderNext = 0;
    this._sweepNext = 0;
    this.rec = {}; // 받아 둔 녹음: 원샷은 AudioBuffer 배열, 배경은 true
    this._gustRecNext = 0;
    // 화면이 꺼져도 계속 듣기 (background.js) — main.js 가 설정값으로 setBackground 를 부른다
    this.background = false;
    this._userPaused = false; // 잠금화면 단추로 멈춤
    this._interrupted = false; // 전화·다른 앱 소리에 양보 중
    this._selfUntil = 0; // 우리가 직접 멈추고 튼 직후 — 그때 오는 pause/play 이벤트는 양보 신호가 아니다
    this.onTrackEnd = null; // 긴 녹음(예불)이 끝나면 (화면이 꺼져 있어도 다음 곡으로 넘기게)
    this.month = kstMonth(); // 계절 소리(개구리·매미·풀벌레)는 한국 시각의 달을 따른다
    this._monthAt = 0;
    this._packed = new Map(); // 받아 둔 압축본: url → ArrayBuffer (넣은 순서 = 오래된 순)
    this._ext = null; // '.m4a' | '.mp3' — 처음 받을 때 정한다
    this.preset = null; // 자연의 소리 듣기 장면 (setPreset)
    this.areas = null; // 마당·다실·대숲 자리 (setAreas)
    this._sleep = null; // 잠자기 타이머 { left, t }
    this.onSleep = null; // 잠자기 타이머가 끝나 멈췄을 때
    this._scene = null; // 자연의 소리 장면 한 편 { left, t } (setSceneTimer)
    this.onSceneEnd = null;
  }

  /** 지금 화면이 꺼져도 소리를 살려 두는가 */
  get keepsPlaying() {
    return this.background && this._enabled && !this._userPaused;
  }

  /** 옵션 「화면 꺼져도 계속 듣기」. 사용자 동작(누름) 안에서 부르면 안드로이드 닻도 바로 튼다 */
  setBackground(on) {
    this.background = !!on;
    applySession(this.background);
    if (!this.ctx) return;
    if (this.background && this._enabled) this._anchorPlay();
    else this._anchorPause();
  }

  setNowPlaying(title, artist) {
    setNowPlaying(title, artist);
  }

  /** 예불 듣는 동안 잠금화면의 이전·다음 단추 (null 이면 뺀다) */
  setTrackActions(prev, next) {
    setMediaActions({ previoustrack: prev, nexttrack: next });
  }

  _self() {
    this._selfUntil = performance.now() + 600;
  }
  get _isSelf() {
    return performance.now() < this._selfUntil;
  }

  /* 안드로이드 닻: 소리 없는 반복 <audio> — 미디어 알림·오디오 포커스를 얻고, 크롬이 포커스를 빼앗아 멈추면 양보 신호가 된다 */
  _anchorPlay() {
    if (!isAndroid || !this.background) return;
    if (!this._anchor) {
      const a = (this._anchor = new Audio('./assets/audio/keepalive.mp3'));
      a.loop = true;
      a.preload = 'auto';
      a.addEventListener('pause', () => !this._isSelf && !this._userPaused && this._interrupt());
      a.addEventListener('play', () => {
        if (this._isSelf) return;
        if (this._userPaused) this.resumeAll();
        else if (this._interrupted) this._restore();
      });
    }
    if (!this._anchor.paused) return;
    this._self();
    this._anchor.play().catch((e) => console.warn('[soundEngine] 닻 재생 실패 (화면이 꺼지면 멈출 수 있음)', e));
  }
  _anchorPause() {
    if (!this._anchor || this._anchor.paused) return;
    this._self();
    this._anchor.pause();
  }

  /** 전화·다른 앱 소리: 우리 소리를 내리고 기다린다 */
  _interrupt() {
    if (this._interrupted || this._userPaused || !this._enabled || !this.master) return;
    this._interrupted = true;
    this._ramp(this.master.gain, 0, 0.25);
    setPlaybackState('paused');
  }
  /** 양보가 끝나면 (크롬이 다시 틀거나, iOS 세션이 돌아오거나, 화면으로 돌아오면) 그대로 이어서 */
  _restore() {
    if (!this._interrupted || this._userPaused || !this._enabled) return;
    this._interrupted = false;
    this.ctx.resume();
    this._ramp(this.master.gain, MASTER_LEVEL, 1.2);
    const tr = this._track;
    if (tr && tr.el.paused && !tr.el.ended && !tr.heldByUser) {
      this._self();
      tr.el.play().catch(() => {});
    }
    this._anchorPlay();
    setPlaybackState('playing');
  }

  /** 잠금화면의 멈춤: 자연음·예불 모두 */
  pauseAll() {
    if (!this.ctx || this._userPaused) return;
    this._userPaused = true;
    this._interrupted = false;
    this._ramp(this.master.gain, 0, 0.4);
    const tr = this._track;
    if (tr && !tr.el.paused) {
      this._self();
      tr.el.pause();
      tr.pausedByAll = true;
    }
    this._anchorPause();
    setPlaybackState('paused');
    setTimeout(() => this._userPaused && this.ctx.suspend(), 600);
  }
  resumeAll() {
    if (!this.ctx || !this._userPaused) return;
    this._userPaused = false;
    this.ctx.resume();
    this._ramp(this.master.gain, this._enabled ? MASTER_LEVEL : 0, 0.8);
    const tr = this._track;
    if (tr && tr.pausedByAll) {
      tr.pausedByAll = false;
      this._self();
      tr.el.play().catch(() => {});
    }
    if (this._enabled) this._anchorPlay();
    setPlaybackState('playing');
  }

  /** 예불 듣기 화면의 멈춤/이어 듣기 단추 (양보 신호와 헷갈리지 않게 표시해 둔다) */
  toggleTrack() {
    const tr = this._track;
    if (!tr) return;
    this._self();
    if (tr.el.paused) {
      tr.heldByUser = false;
      tr.el.play().catch(() => {});
    } else {
      tr.heldByUser = true;
      tr.el.pause();
    }
  }

  _onVisibility() {
    if (!this.ctx) return;
    if (document.hidden) {
      if (!this.keepsPlaying) this.ctx.suspend();
    } else if (this._userPaused) this.resumeAll();
    else if (this._interrupted) this._restore();
    else if (this._enabled) this.ctx.resume();
  }

  get isEnabled() {
    return !!this.ctx && this._enabled;
  }

  // 사용자 제스처에서 호출. 두 번째 호출부터는 (켜져 있을 때만) 정지된 컨텍스트를 깨우기만 한다 — 음소거를 풀지 않음
  init() {
    if (this.ctx) {
      if (this._enabled && this.ctx.state !== 'running' && !document.hidden) this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    try {
      this._build(ctx);
    } catch (err) {
      console.warn('[soundEngine] Web Audio 초기화 실패', err);
      this.ctx = null;
      ctx.close();
      return;
    }
    this._enabled = true;
    this._timer = startTicker(() => this._tick(), TICK_MS);
    document.addEventListener('visibilitychange', () => this._onVisibility());
    // iOS: 전화 등으로 'interrupted' 가 되었다가 끝나면 돌아온다
    ctx.onstatechange = () => {
      if (ctx.state === 'interrupted') this._interrupt();
      else if (this._interrupted && ctx.state !== 'closed') this._restore();
    };
    const sess = navigator.audioSession;
    if (sess && 'onstatechange' in sess)
      sess.onstatechange = () => (sess.state === 'interrupted' ? this._interrupt() : this._interrupted && this._restore());
    setMediaActions({ play: () => this.resumeAll(), pause: () => this.pauseAll(), stop: () => this.pauseAll() });
    setPlaybackState('playing');
    if (ctx.state !== 'running') ctx.resume();
    // 첫 입장: 소리를 0 에서 천천히 — 녹음을 받는 몇 초 동안 합성음이 갑자기 들렸다 바뀌지 않게
    const mg = this.master.gain;
    mg.setValueAtTime(0, ctx.currentTime);
    mg.linearRampToValueAtTime(MASTER_LEVEL, ctx.currentTime + ENTRY_FADE);
    mg._target = MASTER_LEVEL;
    if (this.background) this._anchorPlay(); // 사용자 동작 안 (입장·소리 켜기)
  }

  toggleAudio() {
    if (!this.ctx) {
      this.init();
      return this.isEnabled;
    }
    this._enabled = !this._enabled;
    this._userPaused = this._interrupted = false;
    if (this._enabled) {
      this.ctx.resume();
      this._ramp(this.master.gain, MASTER_LEVEL, 1.0);
      if (this.background) this._anchorPlay();
    } else {
      this._ramp(this.master.gain, 0, 0.6);
      this._suspendAt = this.ctx.currentTime + 0.8; // 페이드가 끝나면 틱에서 컨텍스트를 재운다
      this._anchorPause();
    }
    return this._enabled;
  }

  setChannelVolume(ch, v) {
    if (!(ch in this.volumes)) return;
    this.volumes[ch] = Math.max(0, Math.min(1, Number(v) || 0));
    if (this.ctx) this._ramp(this.bus[ch].gain, this.volumes[ch], 0.15);
  }

  setZone(zoneId) {
    if (!ZONE_MIX[zoneId]) return;
    this.zone = zoneId;
    this._mix(ZONE_FADE);
    this._prefetchFoley();
  }

  /** 이 구역에서 할 수 있는 동작의 효과음 녹음을 미리 (첫 동작부터 녹음으로 — data/natureSounds.js FOLEY_BY_ZONE) */
  _prefetchFoley() {
    if (!this._base) return;
    for (const name of FOLEY_BY_ZONE[this.zone] || []) this._shot(name);
    if (this.zone === 'DAEUNGJEON') this._loadLegacy();
  }

  /** 행동 효과음 녹음: 받아 두었으면 틀고 true, 아니면 받기 시작하고 false (그때는 합성음) */
  _foley(name, gain, dest = this.bus.sfx) {
    const rec = this._shot(name);
    if (!rec || !this._ready()) return false;
    this._playRec(rec, this.ctx.currentTime + 0.005, dest, gain * (FOLEY_LEVEL[name] ?? 1), rand(0.95, 1.05));
    return true;
  }

  setWeather(w) {
    if (!WEATHER_MIX[w]) return;
    this.weather = w;
    this._mix(ZONE_FADE);
  }

  setTimeOfDay(phase) {
    if (!TIME_MIX[phase]) return;
    this.time = phase;
    this._mix(ZONE_FADE);
  }

  /**
   * 자연의 소리 듣기: 장면 프리셋 { time, month, weather, mix: { 레이어: 배율 } } — 구역·거리·실제 날씨 대신 장면이 정한 소리만.
   * 물·화로·찻물 같은 공간음은 듣는 자리 가까이로 옮긴다. null 이면 원래대로
   */
  setPreset(p) {
    this.preset = p || null;
    if (this.L) this._placeSources(0); // 자리 소리를 듣는 자리 곁으로(장면) 또는 제자리로
    this._mix(ZONE_FADE);
  }

  /**
   * 점검용 (브라우저 콘솔): temple.sound.solo('birds') 처럼 한 레이어만 남겨 듣는다 — null 이면 원래대로.
   * 레이어: wind rain birds crickets cicadas frogs stream spring bamboo brazier kettle chant
   */
  solo(name = null) {
    this._solo = name || null;
    this._mix(0.3);
    return this.playing();
  }

  /** 점검용: 지금 들리는(목표 크기 > 0) 배경과 그 녹음 조각 이름 */
  playing() {
    return (this._nbeds || [])
      .filter((b) => b.on || b.pending)
      .map((b) => ({ bed: b.name, layer: Object.keys(LAYERS).find((k) => this.L[k] === b.layer), piece: b.buffer?._f, next: b.nextBuf?._f, level: +b.layer.level.gain._target.toFixed(3) }));
  }

  /**
   * 번뇌 소각: 쪽지가 화로에 닿은 순간 부른다 — 화로 타닥 소리가 dur 초 동안 세졌다가(+5dB) 처음 크기로 잦아든다.
   * 화면의 불(temple.brazier.flare 1→0)과 같은 모양. 화로 소리의 크기·거리는 전파 법칙 그대로
   */
  flareBrazier(dur = 3) {
    if (!this._ready() || !this.L) return;
    this._flare = { t0: this.ctx.currentTime, dur };
    this._mix(0.15);
  }

  /** 잠자기 타이머 (분, 0·null 이면 끔) — 재생 시간(AudioContext 시계)으로 잰다. 화면이 꺼져 그리기가 멈춰도, 멈춰 둔 동안은 세지 않는다 */
  setSleep(min) {
    this._sleep = min > 0 ? { left: min * 60, t: this.ctx?.currentTime ?? 0 } : null;
    if (this.ctx && this._enabled && !this._userPaused && !this._interrupted) this._ramp(this.master.gain, MASTER_LEVEL, 1); // 줄이던 중이었으면 되돌린다
  }

  /** 남은 잠자기 시간(초) 또는 null */
  get sleepLeft() {
    return this._sleep ? Math.max(0, this._sleep.left) : null;
  }

  /** 자연의 소리 장면 한 편의 길이 (초, 0 이면 끔) — 잠자기 타이머처럼 재생 시간으로 센다. 다 되면 onSceneEnd (화면이 꺼져 있어도) */
  setSceneTimer(sec) {
    this._scene = sec > 0 ? { left: sec, t: this.ctx?.currentTime ?? 0 } : null;
  }

  /** 장면 한 편의 남은 시간(초) 또는 null */
  get sceneLeft() {
    return this._scene ? Math.max(0, this._scene.left) : null;
  }

  /** 타이머 c 에서 지난 재생 시간을 덜어 낸다 — 잠들었던 컨텍스트가 깨어난 첫 틱·양보 중·내가 멈춰 둔 예불은 세지 않는다 */
  _spend(c, now) {
    const dt = now - c.t;
    c.t = now;
    if (dt > 0 && dt <= 5 && !this._interrupted && !this._track?.heldByUser) c.left -= dt;
  }

  _sleepTick(now) {
    const sc = this._scene;
    if (sc) {
      this._spend(sc, now);
      if (sc.left <= 0) {
        this._scene = null;
        this.onSceneEnd?.();
      }
    }
    const s = this._sleep;
    if (!s) return;
    this._spend(s, now);
    if (s.left <= SLEEP_FADE && !s.fading) {
      s.fading = true;
      this._ramp(this.master.gain, 0, Math.max(0.5, s.left));
    }
    if (s.left <= 0) {
      this._sleep = null;
      this.pauseAll();
      this.onSleep?.();
    }
  }

  // 매 프레임 호출. 리스너 파라미터는 .value로만 쓴다 (자동화 이벤트와 섞지 않음)
  updateListener(pos, forward) {
    this._lp.x = pos.x;
    this._lp.y = pos.y;
    this._lp.z = pos.z;
    if (!this.ctx) return;
    const l = this.ctx.listener;
    setPos(l, pos);
    if (l.forwardX) {
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
    } else l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
  }

  setEmitters(map = {}) {
    for (const k of Object.keys(DEFAULT_EMITTERS)) if (map[k]) this.emit[k] = map[k];
    if (this.L) this._placeSources(0);
  }

  /**
   * 소리가 자리를 따르게 하는 땅 모양 (main.js 가 layout 에서): { courts: [마당 사각형…], tea: 다실 마당, hall: 법당, groves: [대숲 사각형…] }
   * 마당·다실 안팎은 BLEND_M 에 걸쳐 섞고, 대숲 소리는 가장 가까운 대숲 가장자리에서 난다
   */
  setAreas(a) {
    this.areas = a;
  }

  /** 이 좌표는 어디인가: 'hall' 법당 · 'tea' 다실 마당 · 'courts' 경내 마당 · 'out' 바깥 (담 가림을 정한다) */
  _roomAt(p) {
    const A = this.areas;
    if (!A) return 'out';
    if (A.hall && rectDist(A.hall, p) === 0) return 'hall';
    if (rectDist(A.tea, p) === 0) return 'tea';
    return A.courts.some((r) => rectDist(r, p) === 0) ? 'courts' : 'out';
  }

  /** 듣는 자리가 어디에 얼마나 있는가 (경계 BLEND_M 에 걸쳐 섞음, 법당은 문턱에서) */
  _listenerRooms() {
    const A = this.areas;
    if (this.preset || !A) return { out: 1 };
    if (this.zone === 'DAEUNGJEON') return { hall: 1 };
    const w = (r) => near(rectDist(r, this._lp), 0, BLEND_M);
    const tea = w(A.tea);
    const courts = Math.max(...A.courts.map(w)) * (1 - tea);
    return { out: Math.max(0, 1 - tea - courts), courts, tea };
  }

  /** 담 가림: 음원이 있는 곳과 듣는 자리가 다르면 그 사이 담의 배율. 자연음 버스는 법당 안 먹먹함을 natureZone 이 따로 맡는다 */
  _occlusion(srcRoom, bus = 'temple') {
    let g = 0;
    for (const [room, w] of Object.entries(this._rooms || { out: 1 })) {
      const r = bus === 'nature' && room === 'hall' ? 'out' : room;
      g += w * (r === srcRoom ? 1 : Math.min(WALL[r] ?? 1, WALL[srcRoom] ?? 1));
    }
    return g;
  }

  /** 지금 자리의 구역 믹스: 법당 안은 그대로, 바깥은 숲·마당·다실을 경계 거리로 섞는다 */
  _zoneMix() {
    const R = (this._rooms = this._listenerRooms());
    if (this.preset) return PRESET_ZONE;
    if (this.zone === 'DAEUNGJEON' || !this.areas) return ZONE_MIX[this.zone];
    const wF = R.out, wC = R.courts, wT = R.tea;
    const out = {};
    for (const k of Object.keys(ZONE_MIX.FOREST)) out[k] = wF * ZONE_MIX.FOREST[k] + wC * ZONE_MIX.COURTYARD[k] + wT * ZONE_MIX.TEAHOUSE[k];
    return out;
  }

  /**
   * 실제 녹음을 차례로 받아 붙인다 (init() 뒤에 한 번). 모바일 회선을 생각해 한 번에 하나씩.
   * 실패한 항목은 합성음으로 남고 콘솔에 경고만 남긴다.
   */
  async loadRecordings(base = './assets/audio/') {
    if (!this.ctx || this._recLoading) return;
    this._recLoading = true;
    this._base = base;
    // 자연의 소리 배경은 여기서 받지 않는다 — 들려야 할 때 _natureTick 이 받는다 (첫 입장 전송량을 늘리지 않게)
    if (this.L) this._nbeds = Object.entries(NATURE_BEDS).map(([name, def]) => this._natureBed(name, def));
    // 산 어디서나 쓰는 원샷(돌풍·범종)은 산문에서 들리는 첫 배경이 켜진 뒤에 받는다 (_natureAttach). 풍경·효과음 등은 그 자리에서 필요할 때
  }

  /** 예전 녹음(목탁) — 법당에 들어설 때 (작아서 한 번에) */
  async _loadLegacy() {
    if (this._legacyLoading || !this._base) return;
    this._legacyLoading = true;
    for (const [name, n] of REC_ORDER) {
      const files = n ? Array.from({ length: n }, (_, i) => `${name}${i + 1}`) : [name];
      try {
        const bufs = [];
        for (const f of files) {
          const r = await fetch(`${this._base}${f}.mp3`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          bufs.push(await this.ctx.decodeAudioData(await r.arrayBuffer()));
        }
        this._attachRecording(name, bufs);
      } catch (err) {
        console.warn('[soundEngine] 녹음을 못 받아 합성음을 씁니다:', name, err);
      }
    }
  }

  get recordingsLoaded() {
    return Object.keys(this.rec);
  }

  /**
   * 법당 예불 듣기: 긴 녹음을 <audio> 로 스트리밍해 처음부터 끝까지 (사찰음 버스·볼륨을 따른다).
   * 재생 중에는 배경 독송을 내린다. 반환: 재생 중인 <audio> 요소
   */
  /**
   * 예불은 소리 요소 하나를 계속 다시 쓴다 — iOS 는 사용자가 한 번 누른 요소만 소리를 내게 하므로,
   * 연속 듣기에서 저절로 넘어가는 다음 예불도 같은 요소여야 재생된다. 곡을 바꿀 때는 앞 곡을 바로 끊는다.
   */
  playTrack(url) {
    this.init();
    if (!this.ctx) return null;
    const prev = this._track;
    if (prev) {
      this._track = null;
      [prev.g, prev.wet].forEach((n) => n.disconnect());
    }
    if (!this._trackEl) {
      const e = (this._trackEl = new Audio());
      // 전화·다른 앱이 예불을 멈추면 양보 (우리가 멈춘 것·끝난 것은 빼고)
      e.addEventListener('pause', () => {
        const tr = this._track;
        if (!this._isSelf && tr && tr.el === e && !e.ended && !tr.heldByUser && !this._userPaused) this._interrupt();
      });
      e.addEventListener('play', () => !this._isSelf && this._interrupted && this._restore());
    }
    const el = this._trackEl;
    const src = (this._trackSrc ||= this.ctx.createMediaElementSource(el));
    src.disconnect();
    el.preload = 'auto';
    this._self();
    el.src = url;
    const g = this._gain(0, this.bus.temple);
    const wet = this._gain(0.15, this.reverb);
    src.connect(g);
    g.connect(wet);
    const tr = (this._track = { url, el, src, g, wet });
    el.onended = () => {
      if (this._track !== tr) return;
      this.stopTrack(0.1);
      this.onTrackEnd?.(url);
    };
    el.play().catch((err) => console.warn('[soundEngine] 예불 재생 실패', err));
    this._ramp(g.gain, 1, 1.5);
    this._mix(2);
    return el;
  }

  stopTrack(fade = 1.2) {
    const tr = this._track;
    if (!tr) return;
    this._track = null;
    this._ramp(tr.g.gain, 0, fade);
    setTimeout(() => {
      if (!this._track) {
        this._self();
        tr.el.pause(); // 그새 다음 곡이 같은 요소로 시작했으면 두고, 이 곡의 소리 길만 거둔다
      }
      [tr.g, tr.wet].forEach((n) => n.disconnect());
    }, fade * 1000 + 100);
    this._mix(2);
  }

  /**
   * 차담 스님 목소리 (미리 녹음한 mp3, web/assets/audio/monk). 소리를 꺼 두었으면 내지 않는다.
   * Web Audio 로 튼다 — 입장 때 이미 깨운 컨텍스트라 iOS 에서도 사용자 동작 밖(답이 온 뒤)에 소리가 난다.
   * 새 대사가 오면 앞 대사는 끊는다. onEnd: 끝까지 들었을 때만 (끊기면 부르지 않는다). 반환: 멈추기 함수
   */
  playVoice(url, onEnd) {
    this._voiceStop?.();
    if (!this._ready()) return () => {};
    const bufs = (this._voiceBufs ||= new Map()); // 풀어 둔 소리는 하나에 수 MB — 최근 몇 개만
    let p = bufs.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((b) => this.ctx.decodeAudioData(b));
      p.catch(() => bufs.delete(url));
      bufs.set(url, p);
      if (bufs.size > 4) bufs.delete(bufs.keys().next().value);
    }
    const g = this._gain(1, this.master);
    const wet = this._gain(0.06, this.reverb); // 다실 안의 잔향 조금
    g.connect(wet);
    let src = null;
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      try {
        src?.stop();
      } catch {
        /* 이미 끝남 */
      }
      setTimeout(() => [g, wet].forEach((n) => n.disconnect()), 60);
      if (this._voiceStop === stop) this._voiceStop = null;
    };
    p.then((buf) => {
      if (stopped || !this._ready()) return stop();
      src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.onended = () => {
        const whole = !stopped;
        stop();
        if (whole) onEnd?.();
      };
      src.start();
    }).catch((err) => {
      console.warn('[soundEngine] 스님 목소리를 못 받았습니다', err?.message || err);
      stop();
    });
    this._voiceStop = stop;
    return stop;
  }

  stopVoice() {
    this._voiceStop?.();
  }

  get currentTrack() {
    return this._track ? { url: this._track.url, el: this._track.el } : null;
  }

  // ───────────── 원샷 (초기화 전·음소거 중에는 무시) ─────────────

  playMoktak(v = 1) {
    if (this._ready()) this._moktak(this.ctx.currentTime + 0.01, v, this.bus.sfx);
  }

  playBell(strength = 1) {
    if (this._ready()) this._bell(this.ctx.currentTime + 0.02, strength);
  }

  // 가까이서 울리는 풍경 (UI·제스처용, 비공간). 바람에 흔들리는 처마 풍경은 _chimeAt이 공간음으로 낸다
  playWindChime(gain = 1) {
    if (!this._ready()) return;
    const p = this.ctx.createStereoPanner();
    p.pan.value = rand(-0.5, 0.5);
    p.connect(this.bus.temple);
    this._chime(this.ctx.currentTime + 0.01, pick(CHIME_PITCH), gain, p);
  }

  // 염주: 나무 알끼리 '딱-딱' (두 번째는 작게)
  playBeadClick() {
    if (!this._ready()) return;
    if (this._foley('beads', 1)) return; // 녹음이 있으면 녹음으로
    const t = this.ctx.currentTime + 0.005;
    const f = rand(2300, 2800);
    const hits = [[0, 1], [rand(0.028, 0.045), 0.5]];
    this._modal(t, [{ f, a: 0.14, tau: 0.011 }, { f: f * 1.58, a: 0.06, tau: 0.007 }], this.bus.sfx, 0.12, hits);
    this._noise(t, { f: 4200, Q: 0.8, a: 0.05, tau: 0.003, len: 0.08, hits }, this.bus.sfx);
  }

  // 돌탑 조약돌: 돌끼리 '딱' + 자리 잡는 작은 '딱' + 낮은 둔탁함
  playStoneDrop() {
    if (!this._ready()) return;
    if (this._foley('pebble', 1)) return; // 녹음이 있으면 녹음으로
    const t = this.ctx.currentTime + 0.005;
    const f = rand(1900, 2400);
    const d = rand(0.06, 0.1);
    this._modal(t, [
      { f, a: 0.2, tau: 0.016 },
      { f: f * 1.62, a: 0.1, tau: 0.011 },
      { f: f * 2.45, a: 0.05, tau: 0.007 },
      { f: rand(160, 200), a: 0.12, tau: 0.03 },
    ], this.bus.sfx, 0.25, [[0, 1], [d, 0.35]]);
    this._noise(t, { type: 'highpass', f: 3000, Q: 0.6, a: 0.12, tau: 0.004, len: 0.15, hits: [[0, 1], [d, 0.3]] }, this.bus.sfx);
  }

  // 번뇌 소각: 종이에 불붙는 '화르륵' + 낮은 '훅' + 타닥타닥 꼬리 (~2.6초)
  playFireWhoosh() {
    if (!this._ready() || !this._claim('fire', 2, this.ctx.currentTime + 2.8)) return;
    if (this._foley('paperfire', 1)) return; // 녹음이 있으면 녹음으로
    const t = this.ctx.currentTime + 0.01;
    const out = this.bus.sfx;
    const f = this._noise(t, { buf: 'pink', f: 260, f2: 1100, sweep: 0.35, Q: 0.9, len: 2.2, env: [[0.3, 0.32], [0.6, 0.22], [1.4, 0.08], [2.2, 0]] }, out);
    f.frequency.exponentialRampToValueAtTime(480, t + 1.8);
    this._noise(t, { buf: 'brown', type: 'lowpass', f: 230, Q: 0.5, len: 1.2, env: [[0.12, 0.35], [0.5, 0.12], [1.2, 0]] }, out);
    this._noise(t + 0.15, { buf: 'crackle', type: 'highpass', f: 1200, Q: 0.5, len: 2.5, env: [[0.25, 0.5], [1.2, 0.3], [2.5, 0]] }, out);
  }

  // 발소리: 표면마다 다른 결, 매번 세기·높이를 조금씩 다르게 (내 발소리라 비공간)
  // 녹음(재질별 걸음 묶음)이 있으면 그중 하나를 — 같은 걸음을 연달아 고르지 않는다. 받기 전·없으면 합성
  playFootstep(surface = 'earth') {
    if (!this._ready()) return;
    const t = this.ctx.currentTime + 0.005;
    if (!this._claim('step', 4, t + 0.3)) return;
    const kind = this._stepKind(surface);
    const rec = this._shot(`step-${kind}`);
    if (rec) return this._playSlot(rec, t, this.stepBus, rand(0.8, 1.1) * (STEP_LEVEL[kind] ?? 1), rand(0.93, 1.07));
    if (kind === 'leaves' || kind === 'snow') surface = 'earth';
    const v = rand(0.75, 1.1) * (surface === 'earth' ? 0.35 : 1);
    const k = rand(0.88, 1.12);
    const out = this.stepBus;
    if (surface === 'gravel') {
      this._noise(t, { buf: 'brown', type: 'lowpass', f: 420 * k, a: 0.16 * v, tau: 0.03, len: 0.15 }, out);
      const env = [];
      for (let dt = 0.008; dt < 0.13; dt += rand(0.012, 0.025)) env.push([dt, rand(0.02, 0.12) * v]);
      env.push([0.16, 0]);
      this._noise(t, { f: 2600 * k, Q: 0.6, len: 0.16, env }, out);
    } else if (surface === 'wood') {
      this._modal(t, [
        { f: 118 * k, a: 0.1 * v, tau: 0.05 },
        { f: 305 * k, a: 0.05 * v, tau: 0.03 },
        { f: 720 * k, a: 0.025 * v, tau: 0.015 },
      ], out, 0.25);
      this._noise(t, { buf: 'brown', type: 'lowpass', f: 600 * k, a: 0.08 * v, tau: 0.02, len: 0.1 }, out);
    } else if (surface === 'stone') {
      this._noise(t, { buf: 'brown', type: 'lowpass', f: 650 * k, a: 0.2 * v, tau: 0.02, len: 0.1 }, out);
      this._noise(t, { f: 1700 * k, Q: 1, a: 0.09 * v, tau: 0.012, len: 0.08 }, out);
    } else {
      this._noise(t, { buf: 'brown', type: 'lowpass', f: 330 * k, a: 0.3 * v, tau: 0.035, len: 0.18 }, out);
      this._noise(t + 0.01, { buf: 'pink', f: 1900 * k, Q: 0.7, a: 0.05 * v, tau: 0.03, len: 0.1 }, out);
    }
  }

  /** 걸음 재질: 법당 마루와 바깥 나무 데크를 가르고, 가을 숲길은 낙엽, 눈 오는 날 바깥은 눈 */
  _stepKind(surface) {
    if (surface === 'wood') return this.zone === 'DAEUNGJEON' ? 'floor' : 'deck';
    if (this.weather === 'snow' && this.zone !== 'DAEUNGJEON') return 'snow';
    if (surface === 'earth' && this.zone === 'FOREST' && (this.month === 10 || this.month === 11)) return 'leaves';
    return surface;
  }

  // 죽비: 쪼갠 대나무 두 쪽이 맞부딪는 '착-' (겹친 두 번의 슬랩), 날카롭되 부드럽게
  playChukbi() {
    if (!this._ready()) return;
    if (this._foley('chukbi', 1)) return; // 녹음이 있으면 녹음으로
    const t = this.ctx.currentTime + 0.005;
    const hits = [[0, 1], [rand(0.022, 0.034), 0.65]];
    this._noise(t, { f: 2100, Q: 0.9, a: 0.32, tau: 0.014, len: 0.2, hits }, this.bus.sfx);
    this._modal(t, [{ f: rand(880, 980), a: 0.1, tau: 0.035 }, { f: 2350, a: 0.05, tau: 0.018 }], this.bus.sfx, 0.25, hits);
  }

  // 차 따르기: 잔이 차오를수록 공명이 올라가는 물줄기 + 찰랑임 + 끝 방울 (~1.8초)
  playTeaPour() {
    if (!this._ready() || !this._claim('pour', 1, this.ctx.currentTime + 2.4)) return;
    if (this._foley('pour', 1)) return; // 녹음이 있으면 녹음으로
    const t = this.ctx.currentTime + 0.01;
    const out = this.bus.sfx;
    const flutter = (lvl) => {
      const e = [[0.1, lvl]];
      for (let dt = 0.14; dt < 1.6; dt += 0.04) e.push([dt, lvl * rand(0.7, 1)]);
      e.push([1.8, 0]);
      return e;
    };
    this._noise(t, { buf: 'pink', f: 480, f2: 1500, sweep: 1.7, Q: 7, len: 1.8, env: flutter(0.5) }, out);
    this._noise(t, { buf: 'white', f: 3200, Q: 0.7, len: 1.8, env: flutter(0.04) }, out);
    this._noise(t, { buf: 'bubble', type: 'lowpass', f: 2500, rate: 1.4, Q: 0.5, len: 1.8, env: flutter(0.12) }, out);
    for (const dt of [1.9, 2.15]) {
      this._modal(t + dt, [{ f: rand(1200, 1800), a: 0.05, tau: 0.012, glide: 1.5, glideT: 0.02 }], out, 0.1);
    }
  }

  // 한지 사각거림
  playPaperRustle() {
    if (!this._ready()) return;
    if (this._foley('paper', 1)) return; // 녹음이 있으면 녹음으로
    const t = this.ctx.currentTime + 0.005;
    const len = rand(0.45, 0.75);
    const env = [];
    for (let dt = 0.02; dt < len - 0.05; dt += rand(0.015, 0.05)) env.push([dt, rand(0.015, 0.12) * (Math.random() < 0.2 ? 1.6 : 1)]);
    env.push([len, 0]);
    this._noise(t, { buf: 'pink', f: 3600, Q: 0.5, len, env }, this.bus.sfx);
    this._noise(t, { buf: 'crackle', type: 'highpass', f: 2500, Q: 0.5, len, env: env.map(([d, v]) => [d, v * 0.8]) }, this.bus.sfx);
  }

  // 도복(무명 승복)이 스치는 '사락': 한지보다 낮고 부드럽게, 잘게 일렁이며 부풀었다 잦아든다.
  // 큰절에서 꿇고·엎드리고·일어설 때 (strength 0~1, len 초) — 숨소리처럼 들리던 108배 목탁을 대신한다
  playRobeRustle(strength = 1, len = 0.6) {
    if (!this._ready()) return;
    if (this._foley('robe', Math.max(0.1, Math.min(1, strength)))) return; // 녹음이 있으면 녹음으로
    const t = this.ctx.currentTime + 0.01;
    const s = Math.max(0.1, Math.min(1, strength));
    const env = [];
    const n = Math.max(4, Math.round(len / 0.045));
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      env.push([len * u, s * (0.02 + 0.075 * Math.sin(Math.PI * Math.min(1, u * 1.08)) ** 0.8) * rand(0.55, 1.25)]);
    }
    env.push([len + 0.06, 0]);
    this._noise(t, { buf: 'pink', f: 2300, f2: 1500, Q: 0.6, len: len + 0.06, env }, this.bus.sfx);
    this._noise(t, { buf: 'pink', type: 'lowpass', f: 650, Q: 0.4, len: len + 0.06, env: env.map(([d, v]) => [d, v * 0.55]) }, this.bus.sfx);
  }

  // 붓끝이 한지를 스치는 짧은 '스윽'
  playBrushStroke() {
    if (!this._ready()) return;
    if (this._foley('brush', 1)) return; // 녹음이 있으면 녹음으로
    const len = rand(0.22, 0.38);
    this._noise(this.ctx.currentTime + 0.005, {
      buf: 'pink', f: 2800, f2: 1700, Q: 0.8, len, env: [[len * 0.25, 0.14], [len * 0.6, 0.1], [len, 0]],
    }, this.bus.sfx);
  }

  // 다른 방문객이 합장으로 답례할 때: 맑은 2~3음 화음 (살짝 펼쳐서)
  playBlessing() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime + 0.02;
    const notes = pick(BLESSING_CHORDS).slice(0, Math.random() < 0.5 ? 2 : 3);
    notes.forEach((f, i) => this._modal(t + i * rand(0.07, 0.12), [
      { f, a: 0.04, tau: 1.4, beat: 0.6 },
      { f: f * 2, a: 0.022, tau: 0.6 },
      { f: f * 3.01, a: 0.008, tau: 0.3 },
    ], this.bus.sfx, 4));
  }

  // 연등이 떠오를 때: 위로 번지는 바람결 + 점점 높아지는 반짝임
  playLanternRise() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime + 0.02;
    const out = this.bus.sfx;
    this._noise(t, { buf: 'pink', f: 600, f2: 2800, sweep: 2.4, Q: 3, len: 2.6, env: [[0.9, 0.16], [1.8, 0.1], [2.6, 0]] }, out);
    [0.3, 0.75, 1.2, 1.7].forEach((dt, i) => {
      const f = 1800 * 2 ** (i * 0.2) * rand(0.98, 1.02);
      this._modal(t + dt, [{ f, a: 0.03, tau: 0.35, beat: 1.2 }, { f: f * 2.01, a: 0.008, tau: 0.15 }], out, 1.5);
    });
  }

  // 아주 작은 나무 '톡'
  playUIClick() {
    if (!this._ready()) return;
    this._modal(this.ctx.currentTime + 0.003, [{ f: rand(1650, 1850), a: 0.045, tau: 0.01 }, { f: 3900, a: 0.012, tau: 0.005 }], this.bus.sfx, 0.06);
  }

  // 예불 타종: interval초 간격 count번 — 스케줄러 큐에 넣어 정확한 시각에 예약
  ringYebul(count = 5, interval = 9) {
    if (!this._ready()) return;
    this._queue = this._queue.filter((ev) => ev.tag !== 'yebul');
    const t0 = this.ctx.currentTime + 0.1;
    for (let i = 0; i < count; i++) {
      const s = i === count - 1 ? 0.8 : rand(0.9, 1.05); // 마지막 타종은 여리게
      this._queue.push({ tag: 'yebul', t: t0 + i * interval, fn: (t) => this._bell(t, s) });
    }
  }

  // ───────────── 그래프 구성 ─────────────

  // ambience=false는 오프라인 렌더 측정용(원샷만)
  _build(ctx, ambience = true) {
    this.ctx = ctx;
    const gain = (v, dest) => {
      const n = ctx.createGain();
      n.gain.value = v;
      if (dest) n.connect(dest);
      return n;
    };
    this._gain = gain;

    // 안전 리미터: 여러 소리가 겹친 순간에만 개입
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -6;
    lim.knee.value = 6;
    lim.ratio.value = 12;
    lim.attack.value = 0.003;
    lim.release.value = 0.25;
    lim.connect(ctx.destination);
    this._lim = lim; // QA: tools/qa/headroom.mjs 가 reduction 을 읽는다
    this.master = gain(MASTER_LEVEL, lim);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulseResponse(ctx);
    this.reverb.connect(this.master);

    // 자연음 버스: 채널 볼륨 → 바깥 비율(법당 안 40%) → 로우패스(법당 안·눈 오는 날 먹먹하게) → master
    this.natureTone = ctx.createBiquadFilter();
    this.natureTone.type = 'lowpass';
    this.natureTone.frequency.value = 16000;
    this.natureTone.Q.value = 0.5;
    this.natureTone.connect(this.master);
    this.natureZone = gain(1, this.natureTone);
    this.bus = {
      nature: gain(this.volumes.nature, this.natureZone),
      temple: gain(this.volumes.temple, this.master),
      sfx: gain(this.volumes.sfx, this.master),
    };
    this.send = { nature: gain(0.12, this.reverb), temple: gain(0.3, this.reverb), sfx: gain(0.2, this.reverb) };
    this.stepBus = gain(0.3, this.bus.sfx); // 발걸음은 들릴 듯 말 듯
    this.natureTone.connect(this.send.nature);
    this.bus.temple.connect(this.send.temple);
    this.bus.sfx.connect(this.send.sfx);

    // 공용 버퍼 — 한 번만 만들어 모든 소리가 재사용
    this.buf = {
      white: noiseBuffer(ctx, 2, 'white'),
      pink: noiseBuffer(ctx, 4, 'pink'),
      brown: noiseBuffer(ctx, 4, 'brown'),
      crackle: eventBuffer(ctx, 5, writeCrackle),
      bubble: eventBuffer(ctx, 4, writeBubbles),
    };

    const l = ctx.listener;
    setPos(l, this._lp);
    if (l.forwardX) {
      l.forwardX.value = 0;
      l.forwardY.value = 0;
      l.forwardZ.value = -1;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else l.setOrientation(0, 0, -1, 0, 1, 0);

    if (ambience) this._buildAmbience();
    this._mix(0);
  }

  _buildAmbience() {
    const ctx = this.ctx;
    const B = this.buf;
    const gain = this._gain;
    const L = (this.L = {});
    // 루프 소스 → 필터 → 게인 → dest (버퍼 내 임의 위치에서 시작해 레이어끼리 겹치지 않게)
    const loop = (buf, dest, type, f, Q, g, rate = 1) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = rate;
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = Q;
      s.connect(fl).connect(gain(g, dest));
      s.start(0, Math.random() * buf.duration);
      return fl;
    };

    // 돌풍 신호(0.3~1.2): 솔바람·댓바람 볼륨과 솔바람 밝기를 함께 민다
    this.gust = ctx.createConstantSource();
    this.gust.offset.value = 0.5;
    this.gust.start();

    // 1) 솔바람: 낮은 바람 몸통(brown) + 솔잎 스치는 '쏴아'(pink, 좌우 따로) — 무지향 배경
    // 녹음이 오면 synth → rec 로 교차 페이드하는 이중 레이어
    const dual = (layer) => Object.assign(layer, { synth: gain(1, layer.level), rec: gain(0, layer.level) });
    L.wind = dual({ level: gain(0, this.bus.nature) });
    L.wind.synth.gain.value = 0; // 바람은 늘 깔지 않는다 — 돌풍 녹음만 가끔 (합성 바람은 녹음을 못 받을 때의 대역으로도 쓰지 않는다)
    const windGust = gain(0, L.wind.synth);
    this.gust.connect(windGust.gain);
    loop(B.brown, windGust, 'lowpass', 320, 0.4, 0.8);
    const gustHz = gain(900);
    this.gust.connect(gustHz);
    for (const pan of [-0.7, 0.7]) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(windGust);
      gustHz.connect(loop(B.pink, p, 'bandpass', 700, 0.6, 0.45).frequency);
    }

    // 2) 계곡물: 낮은 물살 + 틱마다 흔들리는 여울 대역 + 기포 — 물길 위 가장 가까운 지점의 HRTF 음원
    L.stream = dual(this._spatialLoop(3, 1.1, this.bus.nature));
    loop(B.brown, L.stream.synth, 'lowpass', 650, 0.5, 0.55);
    L.stream.wob = [ // [필터, 기준 주파수] — 틱마다 기준 근처로 흔들어 물 흐름의 일렁임을 만든다
      [loop(B.pink, L.stream.synth, 'bandpass', 1800, 1.4, 0.35), 1800],
      [loop(B.pink, L.stream.synth, 'bandpass', 3000, 2, 0.15), 3000],
    ];
    loop(B.bubble, L.stream.synth, 'bandpass', 1600, 0.6, 0.35, 1.3);

    // 3) 빗소리: 빗줄기 '쏴아' + 잎에 맞는 잔 빗방울(crackle 고속) + 낮은 울림
    L.rain = dual({ level: gain(0, this.bus.nature) });
    loop(B.pink, L.rain.synth, 'bandpass', 2400, 0.35, 0.5);
    loop(B.crackle, L.rain.synth, 'highpass', 2500, 0.5, 0.35, 2.2);
    loop(B.brown, L.rain.synth, 'lowpass', 220, 0.5, 0.3);

    // 4) 풀벌레: 귀뚜라미 둘(속도·위치 다르게) + 방울벌레 트릴
    L.crickets = dual({ level: gain(0, this.bus.nature) });
    const chirp = eventBuffer(ctx, 3.3, writeCricket);
    const trill = eventBuffer(ctx, 4.1, writeTrill);
    for (const [b, rate, pan, g] of [[chirp, 1, -0.6, 0.5], [chirp, 0.93, 0.55, 0.4], [trill, 1, 0.15, 0.25]]) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(L.crickets.synth);
      loop(b, p, 'lowpass', 7000, 0.5, g, rate);
    }

    // 5) 법당 독송: 디튠 톱니파 3 + 한 옥타브 아래 삼각파 → 모음 포먼트 대역통과 3개 → 음절 포락선 → HRTF
    L.chant = dual(this._spatialLoop(4, 1.0, this.bus.temple));
    const c = (this._chant = { next: 0, beat: 0, len: 10 });
    c.syl = gain(0, L.chant.synth);
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 2400;
    soften.connect(c.syl);
    const voice = gain(0.22);
    c.formants = [[1, 5], [0.45, 7], [0.16, 9]].map(([amp, Q], i) => {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = VOWELS[1][i];
      f.Q.value = Q;
      voice.connect(f).connect(gain(amp, soften));
      return f;
    });
    const chest = ctx.createBiquadFilter(); // 가슴 울림 (허밍 같은 따뜻함)
    chest.type = 'lowpass';
    chest.frequency.value = 320;
    voice.connect(chest).connect(gain(0.3, soften));
    c.pitch = ctx.createConstantSource(); // 음높이 굴곡(센트) — 구절 끝에서 한 음 내려앉음
    c.pitch.offset.value = 0;
    c.pitch.start();
    const vib = ctx.createOscillator();
    vib.frequency.value = 4.6;
    const vibAmt = gain(7);
    vib.connect(vibAmt);
    vib.start();
    for (const [type, f, g] of [['sawtooth', 110, 1], ['sawtooth', 110.6, 0.8], ['sawtooth', 109.5, 0.8], ['triangle', 55, 0.9]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      c.pitch.connect(o.detune);
      vibAmt.connect(o.detune);
      o.connect(gain(g, voice));
      o.start();
    }
    // 먼 목탁: 독송과 같은 패너로, 고역을 깎아 멀리서 들리게
    c.moktak = ctx.createBiquadFilter();
    c.moktak.type = 'lowpass';
    c.moktak.frequency.value = 2000;
    c.moktak.connect(L.chant.synth);

    // 6) 화로: 장작 타닥 + 낮은 불꽃 숨소리 (가까이서만)
    L.brazier = dual(this._spatialLoop(1.5, 2.0, this.bus.temple));
    loop(B.crackle, L.brazier.synth, 'highpass', 900, 0.5, 0.55);
    loop(B.brown, L.brazier.synth, 'lowpass', 260, 0.5, 0.3);

    // 7) 무쇠 주전자: 낮은 보글거림(기포 저속) + 끓는 웅웅 + 김 새는 쉬익
    L.kettle = this._spatialLoop(1.5, 1.4, this.bus.temple);
    loop(B.bubble, L.kettle.level, 'lowpass', 1400, 0.5, 0.6, 0.55);
    loop(B.brown, L.kettle.level, 'lowpass', 180, 0.5, 0.35);
    loop(B.pink, L.kettle.level, 'bandpass', 3800, 0.6, 0.05);

    // 8) 댓바람: 대나무 잎 사각거림 + 잎끼리 부딪는 잔소리 — 돌풍에 함께 일렁인다
    L.bamboo = dual(this._spatialLoop(5, 1.0, this.bus.nature));
    const bambooGust = gain(0, L.bamboo.synth);
    this.gust.connect(bambooGust.gain);
    loop(B.pink, bambooGust, 'bandpass', 3400, 0.5, 0.4);
    loop(B.crackle, bambooGust, 'bandpass', 4200, 0.6, 0.25, 1.7);

    // 9) 녹음 전용: 산새(무지향 배경), 다실 연못 샘물(공간음), 계절 배경(여름 한낮 매미 · 봄밤 개구리)
    L.birds = { level: gain(0, this.bus.nature) };
    L.spring = this._spatialLoop(4, 1.0, this.bus.nature);
    L.cicadas = { level: gain(0, this.bus.nature) };
    L.frogs = this._spatialLoop(8, 1, this.bus.nature); // 물가에서 (PLACED.frogs)

    this.setEmitters();
  }

  // 자리 소리 레이어: 크기는 _mix 가 전파 법칙으로 정하고, 패너는 방향만(거리 감쇠 없음), 그 사이에 멀수록 어두워지는 필터
  _spatialLoop(ref, rolloff, dest) {
    const panner = this._panner({ x: 0, y: 0, z: 0 }, 1, 0, dest);
    panner._bus = dest === this.bus.nature ? 'nature' : 'temple';
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 0.5;
    tone.frequency.value = 16000;
    tone.connect(panner);
    return { panner, tone, level: this._gain(0, tone) };
  }

  _panner(pos, ref, rolloff, dest) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = 10000;
    setPos(p, pos);
    p.connect(dest);
    return p;
  }

  // ───────────── 믹스 & 스케줄러 ─────────────

  _ready() {
    return !!this.ctx && this._enabled;
  }

  // 목표값이 바뀔 때만 현재값에서 선형 램프 (0까지 정확히 내려가야 무음 최적화가 걸린다)
  _ramp(p, v, dur) {
    if (p._target === v) return;
    p._target = v;
    const t = this.ctx.currentTime;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    if (dur > 0) p.linearRampToValueAtTime(v, t + dur);
    else p.setValueAtTime(v, t);
  }

  _mix(dur) {
    if (!this.ctx) return;
    const P = this.preset; // 자연의 소리 듣기: 구역 대신 장면이 정한 레이어만
    const Z = this._zoneMix();
    const W = WEATHER_MIX[this._weather()];
    const T = TIME_MIX[this._time()];
    this._ramp(this.natureZone.gain, Z.outside, dur);
    this._ramp(this.natureTone.frequency, Math.min(Z.tone, W.tone), dur);
    this._ramp(this.send.temple.gain, 0.3 * Z.wet, dur);
    this._ramp(this.send.sfx.gain, 0.2 * Z.wet, dur);
    const L = this.L;
    if (!L) return;
    for (const [name, def] of Object.entries(LAYERS)) {
      const layer = L[name];
      let f = (def.t ? T[def.t] : 1) * (def.w ? W[def.w] : 1) * (def.z ? Z[def.z] : 1);
      if (def.max) f = Math.min(def.max, f);
      let g = def.base * f * (P ? P.mix[name] ?? 0 : 1);
      // 녹음 배경이 있는 레이어는 지금(계절·시간대) 쓸 조각이 있을 때만 — 겨울엔 풀벌레 합성음도 쉰다
      if (!this._avail(name) && this._nbeds?.some((b) => b.layer === layer)) g = 0;
      const src = PLACED[name] && this._src?.[name];
      if (PLACED[name]) {
        g *= src ? src.gain : 0; // 자리 소리: 전파 (propagate × 담 가림)
        if (src && layer.tone) this._ramp(layer.tone.frequency, airTone(src.d), dur);
      }
      if (def.duck && this._track) g = 0;
      if (this._solo && this._solo !== name) g = 0; // 점검: 한 레이어만 (solo)
      if (def.flare && this._flare) {
        // 번뇌 소각: 쪽지가 숯불에 닿은 뒤 불이 세졌다가 잦아든다 (flareBrazier)
        const left = 1 - (this.ctx.currentTime - this._flare.t0) / this._flare.dur;
        if (left <= 0) this._flare = null;
        else g *= 1 + FLARE_BOOST * left;
      }
      this._ramp(layer.level.gain, g, def.fade ? Math.max(dur, def.fade) : dur);
    }
  }

  _tick() {
    const ctx = this.ctx;
    if (!this._enabled) {
      if (ctx.state === 'running' && ctx.currentTime > this._suspendAt) ctx.suspend();
      return;
    }
    if (ctx.state !== 'running' || (document.hidden && !this.keepsPlaying)) return;
    this._schedule(ctx.currentTime);
  }

  _schedule(now) {
    const end = now + (document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD);
    // 예약 이벤트: 음소거·백그라운드로 1초 넘게 밀린 것은 몰아서 울리지 않고 버린다
    this._queue = this._queue.filter((ev) => {
      if (ev.t > end) return true;
      if (ev.t > now - 1) ev.fn(Math.max(ev.t, now));
      return false;
    });
    if (!this.L) return;
    if (now > this._monthAt) {
      this.month = kstMonth();
      this._monthAt = now + 60;
    }
    this._sleepTick(now);
    this._placeSources(0.3);
    this._mix(GATE_FADE);
    for (const [f, base] of this.L.stream.wob) f.frequency.setTargetAtTime(base * rand(0.75, 1.35), now, 0.15);
    this._gusts(now);
    this._natureTick(now, end);
    this._chantTick(now, end);
    this._wildlife(now);
  }

  /**
   * 자리 소리(PLACED)마다 듣는 자리에서 가장 가까운 음원 지점을 찾아 패너를 옮기고(방향), 전파 크기를 잰다 → this._src[name] = { d, gain }
   * 선(물길)은 가장 가까운 선분 위, 면(대숲)은 가장 가까운 가장자리, 점은 그 자리. 장면 듣기 중에는 듣는 자리 곁(preset)
   */
  _placeSources(tau) {
    const lp = this._lp;
    const out = (this._src ||= {});
    const nearestRect = (rects) => {
      let best = null;
      for (const r of rects || []) {
        const q = rectNearest(r, lp);
        const d = Math.hypot(q.x - lp.x, q.z - lp.z);
        if (!best || d < best.d) best = { x: q.x, y: lp.y + 2, z: q.z, d };
      }
      return best;
    };
    const line = () => (this.emit.stream?.length ? nearestOnPath(this.emit.stream, lp) : null);
    for (const [name, def] of Object.entries(PLACED)) {
      let pos;
      if (this.preset) pos = { x: lp.x + def.preset[0], y: lp.y + def.preset[1], z: lp.z + def.preset[2] };
      else if (def.at === 'stream') pos = line();
      else if (def.at === 'groves') pos = nearestRect(this.areas?.groves);
      else if (def.at === 'water') {
        const a = line(), b = this.emit.pond;
        pos = !a ? b : !b ? a : dist(a, lp) < dist(b, lp) ? a : b;
      } else pos = this.emit[def.at];
      if (!pos) {
        out[name] = null;
        continue;
      }
      const d = dist(pos, lp);
      const layer = this.L[name];
      const bus = layer.panner._bus;
      out[name] = { d, gain: propagate(d, def.ref, def.shape, def.alpha) * (this.preset ? 1 : this._occlusion(this._roomAt(pos), bus)) };
      const p = layer.panner;
      if (!p.positionX) p.setPosition(pos.x, pos.y, pos.z);
      else {
        const t = this.ctx.currentTime;
        for (const [param, v] of [[p.positionX, pos.x], [p.positionY, pos.y], [p.positionZ, pos.z]]) {
          if (tau) param.setTargetAtTime(v, t, tau);
          else param.setValueAtTime(v, t);
        }
      }
    }
    this._streamDist = out.stream?.d ?? Infinity;
  }

  /**
   * 자리에서 나는 원샷(범종·풍경·비질·낙숫물…)의 입구: 그 자리까지 같은 전파 법칙(퍼짐·초과 감쇠·담 가림·공기 흡수)을 걸어
   * HRTF 패너(방향만)로 보낸다. 너무 멀어 들리지 않으면 null (그 소리는 울리지 않는다)
   */
  _spot(pos, ref, dest, { alpha, shape = 'point', elevated = false } = {}) {
    const d = dist(pos, this._lp);
    // elevated: 담보다 높이 달린 음원(범종각 종)은 담에 가리지 않는다
    const g = propagate(d, ref, shape, alpha) * (elevated ? 1 : this._occlusion(this._roomAt(pos), dest === this.bus.nature ? 'nature' : 'temple'));
    if (!g) return null;
    const p = this._panner(pos, 1, 0, dest);
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = airTone(d);
    tone.Q.value = 0.5;
    tone.connect(p);
    const input = this._gain(g, tone);
    input._chain = [input, tone, p];
    input._g = g;
    return input;
  }

  // 돌풍: 몇 초마다 새 세기로 천천히 옮겨간다. 센 바람이면 근처 풍경이 흔들리고 대나무가 부딪힌다
  _gusts(now) {
    // 녹음 돌풍: 18~42초에 한 번, 높낮이·좌우·세기를 조금씩 바꿔 같은 소리로 들리지 않게
    if (this.rec.gust && now > this._gustRecNext) {
      const first = !this._gustRecNext;
      if (!first) this._playGust(now + 0.1);
      this._gustRecNext = now + (first ? rand(5, 12) : rand(...GUST_GAP) * (this._weather() === 'rain' ? 0.75 : 1));
    }
    if (now < this._gustNext) return;
    const target = (0.3 + 0.9 * Math.random() ** 2.2) * (this._weather() === 'snow' ? 0.7 : 1);
    this.gust.offset.setTargetAtTime(target, now, rand(1.2, 2.5));
    this._gustNext = now + rand(3, 8);
    const strong = target > 0.85;
    this.emit.chimes.forEach((p, i) => {
      if (dist(p, this._lp) < 40 && Math.random() < (strong ? 0.6 : 0.08)) {
        this._chimeAt(i, now + rand(0.6, 2.2), rand(0.4, 0.9) * (strong ? 1 : 0.6));
      }
    });
    if (this.preset?.chimes && Math.random() < (strong ? 0.5 : 0.06)) this._chimeNear(now + rand(0.6, 2.2), rand(0.4, 0.9) * (strong ? 1 : 0.6));
    if (target > 0.9 && this._src?.bamboo?.gain > 0.05 && Math.random() < 0.5) this._bambooKnock(now + rand(0.8, 2)); // 대숲이 들리는 곳에서만 (크기는 대숲 레이어의 전파를 따른다)
  }

  _playGust(t) {
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = rand(-0.6, 0.6);
    pan.connect(this.L.wind.rec);
    const g = rand(0.55, 1) * GUST_LEVEL * (this._weather() === 'snow' ? 0.6 : 1);
    this._playRec(this.rec.gust, t, pan, g, rand(0.86, 1.08), [pan]);
    // 바람이 지나가면 가까운 처마 풍경이 가끔 따라 운다
    this.emit.chimes.forEach((p, i) => {
      if (dist(p, this._lp) < 30 && Math.random() < 0.35) this._chimeAt(i, t + rand(1.5, 3.5), rand(0.4, 0.8));
    });
    if (this.preset?.chimes && Math.random() < 0.35) this._chimeNear(t + rand(1.5, 3.5), rand(0.4, 0.8));
  }

  /** 장면 듣기의 처마 풍경: 듣는 자리 위 앞쪽 처마 어딘가 */
  _chimeNear(t, gain) {
    const L = this._lp;
    const a = rand(-1, 1);
    const p = this._spot({ x: L.x + Math.sin(a) * 6, y: L.y + 3, z: L.z - Math.cos(a) * 6 }, 3, this.bus.temple, { alpha: 0.6 });
    if (p) this._chime(t, pick(CHIME_PITCH), gain, p);
  }

  // 독송: 1.1초 박(목탁)마다 음절 둘. 8~12박 한 구절 + 2박 숨 고르기, 목탁은 구절마다 커졌다 잦아든다
  _chantTick(now, end) {
    const c = this._chant;
    if (this.rec.chant || !(this.L.chant.level.gain._target > 0)) {
      c.next = 0;
      return;
    }
    if (c.next < now) {
      c.next = now + 0.1;
      c.beat = 0;
    }
    while (c.next < end) {
      const t = c.next;
      const b = c.beat;
      if (b === 0) c.len = 8 + ((Math.random() * 5) | 0);
      const inPhrase = b < c.len;
      this._moktak(t, inPhrase ? 0.3 + 0.4 * Math.sin((Math.PI * (b + 0.5)) / c.len) : 0.2, c.moktak);
      if (inPhrase) {
        const last = b === c.len - 1;
        this._syllable(t, b === 0, last ? -200 : 0);
        if (!last || Math.random() < 0.5) this._syllable(t + BEAT / 2, false, last ? -200 : 0);
        if (last) c.syl.gain.setTargetAtTime(0, t + BEAT * 0.9, 0.25);
      }
      c.beat = b + 1 >= c.len + 2 ? 0 : b + 1;
      c.next += BEAT;
    }
  }

  _syllable(t, first, cents) {
    const c = this._chant;
    const v = pick(VOWELS);
    c.formants.forEach((f, i) => f.frequency.setTargetAtTime(v[i], t, 0.05));
    c.pitch.offset.setTargetAtTime(cents, t, 0.08);
    const g = c.syl.gain;
    if (first) g.setTargetAtTime(1, t, 0.12);
    else {
      g.setTargetAtTime(0.5, t, 0.015); // 자음처럼 살짝 끊겼다가
      g.setTargetAtTime(1, t + 0.06, 0.05); // 모음으로 이어진다
    }
  }

  _wildlife(now) {
    const Z = this.preset ? PRESET_ZONE : ZONE_MIX[this.zone];
    const weather = this._weather();
    const W = WEATHER_MIX[weather];
    const T = TIME_MIX[this._time()];
    const m = this._month();
    const dt = TICK_MS / 1000;
    const k = (name) => (this.preset ? this.preset.mix[name] ?? 0 : 1);
    // 산새: 기준 5초에 한 번 × 시간대·날씨·구역 배율 (녹음 산새가 없을 때만 합성)
    if (!this.rec.birds && k('birds') && Math.random() < ((T.birds * W.birds * Z.birds) / 5) * dt) this._bird(now + rand(0, 0.3));
    // 밤새: 그달에 우는 새 중 하나 (소쩍새·솔부엉이는 여름, 수리부엉이는 겨울 — NIGHT_CALLS) — 밤에 가끔, 비 오면 쉼
    // 처음 한 번은 받기만 하고, 녹음이 아직 없으면 소쩍새 철에만 합성 소쩍새
    if (this._time() === 'night' && weather !== 'rain' && now > this._owlNext) {
      const kind = pick(Object.keys(NIGHT_CALLS).filter((n) => NIGHT_CALLS[n].includes(m)));
      const recs = kind && this._shot(kind);
      if (this._owlNext > 0) {
        if (recs) this._farCall(recs, now + 0.1, kind === 'eagleowl' ? 0.43 : 0.34); // 합성 소쩍새와 같은 크기(levels.mjs 0.374×0.9), 수리부엉이는 -26 LUFS
        else if (kind === 'scops') this._owl(now + 0.1);
      }
      this._owlNext = now + rand(30, 80);
    }
    // 아침 마당 쓰는 소리: 맑은 새벽·낮에 4~9분에 한 번, 마당 서쪽에서 스님이 대빗자루로 — 어디서 들리는지는 전파 법칙(_spot)이 정한다
    if (!this.preset && weather === 'clear' && this._time() !== 'night' && this._time() !== 'sunset' && now > this._sweepNext) {
      const p = this._sweepNext > 0 && this._spot(this.emit.sweep, 4, this.bus.temple);
      const recs = p && this._shot('sweep'); // 들릴 자리에서만 받는다
      if (recs) this._playRec(recs, now + 0.1, p, 0.8, 1, p._chain);
      else if (p) p._chain.forEach((n) => n.disconnect());
      this._sweepNext = now + rand(240, 540);
    }
    if (weather === 'rain') {
      // 처마 낙숫물: 초당 ~0.9회 (녹음 방울이 있으면 그것으로)
      if (Math.random() < 0.9 * dt * Z.outside) this._drip(now + rand(0, 0.2));
      // 먼 천둥: 1~3분에 한 번
      if (now > this._thunderNext) {
        const recs = this._shot('thunder'); // 처음엔 받기만
        if (recs && this._thunderNext > 0) this._farCall(recs, now + 0.1, rand(0.5, 1), 0.3);
        this._thunderNext = now + rand(60, 180);
      }
    }
  }

  /** 멀리서 들리는 녹음 한 소리: 사방 어딘가 먼 곳, 리버브를 조금 더 */
  _farCall(recs, t, gain, wet = 0.15) {
    const L = this._lp;
    const a = rand(0, 2 * Math.PI);
    const p = this._panner({ x: L.x + Math.cos(a) * 30, y: L.y + 10, z: L.z + Math.sin(a) * 30 }, 30, 1, this.bus.nature);
    const w = this._gain(wet, this.reverb);
    p.connect(w);
    this._playRec(recs, t, p, gain, rand(0.98, 1.02), [p, w]);
  }

  // 동시 발음 수 제한 (모바일 CPU 보호): 같은 종류가 max개 울리는 중이면 새 소리를 건너뛴다
  _claim(kind, max, end) {
    const now = this.ctx.currentTime;
    const v = (this._voices[kind] = (this._voices[kind] || []).filter((e) => e > now));
    if (v.length >= max) return false;
    v.push(end);
    return true;
  }

  // ───────────── 합성 기본 단위 ─────────────

  // 타격 포락선: 여러 번 맞으면 남은 울림 위에 새 에너지를 더한다 (해석적으로 이어 붙여 끊김 없음)
  _env(p, t, hits, amp, tau, atk, end) {
    let peak = 0;
    let from = t;
    p.setValueAtTime(0, t);
    for (const [dt, v] of hits) {
      const s = t + dt;
      const cur = peak * Math.exp(-Math.max(0, s - from) / tau);
      peak = cur + amp * v;
      if (dt > 0) p.setValueAtTime(cur, s);
      p.linearRampToValueAtTime(peak, s + atk);
      p.setTargetAtTime(0, s + atk, tau);
      from = s + atk;
    }
    const fs = end - Math.min((end - t) * 0.15, end - from); // 마지막 15%는 0까지 선형으로 닫는다
    p.setValueAtTime(peak * Math.exp(-(fs - from) / tau), fs);
    p.linearRampToValueAtTime(0, end);
  }

  // 모달 합성: 모드마다 사인 + 지수 감쇠. beat가 있으면 미세하게 어긋난 쌍으로 맥놀이
  _modal(t, modes, dest, len, hits = [[0, 1]], extra = []) {
    const ctx = this.ctx;
    const end = t + len;
    const nodes = [...extra];
    let last;
    for (const m of modes) {
      const g = ctx.createGain();
      g.connect(dest);
      nodes.push(g);
      const pair = m.beat ? [m.f - m.beat / 2, m.f + m.beat / 2] : [m.f];
      this._env(g.gain, t, hits, m.a / pair.length, m.tau, m.atk ?? 0.0015, end);
      for (const f of pair) {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(f, t);
        if (m.glide) o.frequency.exponentialRampToValueAtTime(f * m.glide, t + (m.glideT ?? 0.05));
        o.connect(g);
        o.start(t);
        o.stop(end);
        nodes.push(o);
        last = o;
      }
    }
    last.onended = () => nodes.forEach((n) => n.disconnect());
    return end;
  }

  // 필터 노이즈 한 방: env가 있으면 [시간, 값] 꺾은선, 없으면 타격 포락선
  _noise(t, o, dest, extra = []) {
    const ctx = this.ctx;
    const buf = this.buf[o.buf || 'white'];
    const rate = o.rate || 1;
    const s = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    s.buffer = buf;
    s.playbackRate.value = rate;
    f.type = o.type || 'bandpass';
    f.Q.value = o.Q ?? 0.7;
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.sweep ?? o.len));
    if (o.env) {
      g.gain.setValueAtTime(0, t);
      for (const [dt, v] of o.env) g.gain.linearRampToValueAtTime(v, t + dt);
    } else this._env(g.gain, t, o.hits || [[0, 1]], o.a, o.tau, o.atk ?? 0.001, t + o.len);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * Math.max(0, buf.duration - o.len * rate - 0.05));
    s.stop(t + o.len + 0.02);
    s.onended = () => [s, f, g, ...extra].forEach((n) => n.disconnect());
    return f;
  }

  // ───────────── 녹음 재생 ─────────────

  _attachRecording(name, bufs) {
    this.rec[name] = bufs; // 원샷
    if (name === 'gust') {
      // 바람 레이어는 가끔 지나가는 돌풍 녹음만 싣는다
      this._ramp(this.L.wind.rec.gain, 1, BED_XFADE);
    }
  }

  // 효과음 묶음(tools/audio sprite): 한 파일의 칸 하나를 골라 튼다 — 같은 칸을 연달아 고르지 않는다
  _playSlot(rec, t, dest, gain, rate = 1, cleanup = []) {
    let i = (Math.random() * rec.n) | 0;
    if (rec.n > 1 && i === rec.last) i = (i + 1 + ((Math.random() * (rec.n - 1)) | 0)) % rec.n;
    rec.last = i;
    const s = this.ctx.createBufferSource();
    s.buffer = rec.buf;
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(dest);
    s.start(t, i * rec.slot, rec.len);
    s.onended = () => [s, g, ...cleanup].forEach((n) => n.disconnect());
    return t + rec.len / rate;
  }

  // 원샷 녹음: 여러 벌 중 하나를 골라 재생, 끝나면 노드 정리
  _playRec(bufs, t, dest, gain, rate = 1, cleanup = []) {
    if (bufs.buf) return this._playSlot(bufs, t, dest, gain, rate, cleanup); // 효과음 묶음
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = pick(bufs);
    s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(dest);
    s.start(t);
    s.onended = () => [s, g, ...cleanup].forEach((n) => n.disconnect());
    return t + s.buffer.duration / rate;
  }

  // 배경 녹음 조각: 앞뒤를 등전력 곡선으로 페이드하고 다음 조각을 겹쳐 시작한다 (MP3·AAC 앞뒤 패딩이나 이음새가 들리지 않는다)
  _bedChunk(bed, t, offset = 0) {
    const ctx = this.ctx;
    const d = bed.buffer.duration - offset;
    const s = ctx.createBufferSource();
    s.buffer = bed.buffer;
    const g = ctx.createGain();
    const n = 64;
    const up = new Float32Array(n), down = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      up[i] = Math.sin(((i / (n - 1)) * Math.PI) / 2);
      down[i] = Math.cos(((i / (n - 1)) * Math.PI) / 2);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.setValueCurveAtTime(up, t, BED_XFADE);
    g.gain.setValueCurveAtTime(down, t + d - BED_XFADE, BED_XFADE);
    s.connect(g).connect(bed.out);
    s.start(t, offset);
    s.stop(t + d + 0.05);
    s.onended = () => {
      s.disconnect();
      g.disconnect();
    };
    bed.next = t + d - BED_XFADE;
  }


  // ───────────── 자연의 소리 배경 (data/natureSounds.js) ─────────────
  // 조각을 번갈아 튼다: 지금 조각(buffer)과 미리 풀어 둔 다음 조각(nextBuf) 둘만 메모리에 둔다

  _natureBed(name, def) {
    const layer = this.L[def.layer];
    return { name, def, layer, out: this._gain(def.level, layer.rec || layer.level), buffer: null, nextBuf: null, pending: null, next: 0, on: false, quietAt: 0, last: null, gen: 0 };
  }

  /** 지금(시간대·달) 쓸 수 있는 조각들. 장면을 듣는 중이면 장면의 시간대·달 */
  _pool(def) {
    const t = this._time(), m = this._month();
    return def.pieces.filter((p) => (!p.time || p.time.includes(t)) && (!p.months || p.months.includes(m)));
  }

  /** 이 레이어에 지금 쓸 조각이 있는가 (계절이 아니면 개구리·매미가 쉰다) */
  _avail(layer) {
    return Object.values(NATURE_BEDS).some((d) => d.layer === layer && this._pool(d).length);
  }

  /**
   * 산문(지금 자리) 소리가 다 켜지고 받는 줄이 비면, 걷는 동안 뒤에서 나머지 녹음을 전부 받아 둔다 (사용자 2026-11-06) —
   * 압축본만(풀지 않는다), 한 번에 하나씩: 배경마다 첫 조각 → 원샷·발소리·효과음 → 나머지 조각. 재생은 자리(전파 법칙)를 따른다
   */
  _idlePrefetch() {
    if (this._idleDone || !this._shotsQueued || this._inflight?.size || (this._nbeds || []).some((b) => b.pending)) return;
    this._idleDone = true;
    const beds = Object.values(NATURE_BEDS);
    const files = [
      ...beds.filter((d) => d.pieces.length).map((d) => d.pieces[0].f),
      ...Object.values(NATURE_SHOTS).flatMap((v) => (Array.isArray(v) ? v : [v.sprite])),
      ...beds.flatMap((d) => d.pieces.map((p) => p.f))
    ];
    for (const f of new Set(files)) this._packedBytes(f).catch(() => {});
  }

  _natureTick(now, end) {
    this._idlePrefetch();
    // 들리는 크기가 큰 배경부터 받는다 (받기는 한 번에 하나씩이라 먼저 부른 것이 먼저 온다)
    const loud = (b) => b.layer.level.gain._target * (b.layer.panner?._bus === 'temple' ? 1 : this.natureZone.gain._target);
    const beds = [...(this._nbeds || [])].sort((a, b) => loud(b) - loud(a));
    for (const bed of beds) {
      const want = loud(bed) > BED_AUDIBLE && this._pool(bed.def).length > 0;
      if (want) bed.quietAt = 0;
      else if (!bed.quietAt) bed.quietAt = now;
      if (!want && bed.on && now - bed.quietAt > BED_RELEASE) this._natureRelease(bed);
      if (!bed.on) {
        if (!want || bed.pending) continue;
        if (bed.buffer) {
          // 첫 조각: 처음부터가 아니라 조각 안 아무 데서나
          this._bedChunk(bed, now + 0.05, Math.random() * bed.buffer.duration * 0.5); // 앞쪽 절반 — 첫 조각이 너무 짧으면 다음 조각을 일찍 받는다
          bed.on = true;
          this._natureAttach(bed);
        } else this._natureLoad(bed, 'buffer');
        continue;
      }
      if (!bed.nextBuf && !bed.pending && want && bed.next - now < BED_PREFETCH) this._natureLoad(bed, 'nextBuf');
      if (bed.next < end || bed.next < now - 1) {
        let offset = 0;
        if (bed.nextBuf) {
          bed.buffer = bed.nextBuf;
          bed.nextBuf = null;
        } else offset = rand(0, bed.buffer.duration * 0.5); // 다음 조각이 아직 없으면 같은 조각을 다른 자리에서
        this._bedChunk(bed, bed.next < now - 1 ? now + 0.05 : bed.next, offset); // 오래 밀렸으면(백그라운드) 지금부터
      }
    }
  }

  _time() {
    return this.preset?.time || this.time;
  }
  _month() {
    return this.preset?.month || this.month;
  }
  _weather() {
    return this.preset?.weather || this.weather;
  }

  /** 다음 조각을 골라 받아 푼다 (같은 조각을 연달아 고르지 않는다). 메모리 상한을 넘으면 받지 않고 지금 조각을 다시 쓴다 */
  _natureLoad(bed, slot) {
    if (slot === 'nextBuf' && this.decodedBytes > DECODED_CAP) return;
    const pool = this._pool(bed.def);
    if (!pool.length) return;
    // 같은 조각을 연달아 고르지 않고, 같은 레이어의 다른 층(산새 두 겹)이 지금 쓰는 조각도 피한다
    const busy = new Set([bed.last, ...this._nbeds.filter((b) => b !== bed && b.layer === bed.layer).map((b) => b.last)]);
    const free = pool.filter((p) => !busy.has(p.f));
    let choices = free.length ? free : pool.length > 1 ? pool.filter((p) => p.f !== bed.last) : pool;
    const ready = choices.filter((p) => this._packed.has(this._url(p.f))); // 미리 받아 둔 조각이 있으면 그것부터 (바로 들린다)
    if (ready.length && !bed.on) choices = ready;
    const p = pick(choices);
    bed.last = p.f;
    const gen = bed.gen;
    bed.pending = this._decode(p.f)
      .then((buf) => {
        buf._f = p.f; // 점검용: 지금 어떤 조각인지 (playing)
        if (bed.gen === gen) bed[slot] = buf;
      })
      .catch((err) => console.warn('[soundEngine] 자연의 소리를 못 받았습니다:', p.f, err?.message || err))
      .finally(() => {
        if (bed.gen === gen) bed.pending = null;
      });
  }

  /** 한동안 안 들린 배경: 풀어 둔 소리를 놓는다 (울리던 조각은 제 버퍼를 쥐고 끝까지 간다) */
  _natureRelease(bed) {
    bed.on = false;
    bed.buffer = bed.nextBuf = bed.pending = null;
    bed.next = 0;
    bed.gen++;
  }

  /** 처음 들릴 때 같은 레이어의 합성음을 걷는다 */
  _natureAttach(bed) {
    this.rec[bed.def.replaces || bed.name] = true;
    if (!this._shotsQueued) {
      // 첫 배경이 켜졌다: 이제 산 어디서나 쓰는 원샷과 지금 구역의 효과음을 줄 세운다 (받기는 한 번에 하나씩)
      this._shotsQueued = true;
      for (const name of SHOTS_AT_ENTRY) this._loadShot(name);
      this._prefetchFoley();
    }
    const layer = bed.layer;
    if (layer.synth) {
      this._ramp(layer.synth.gain, 0, BED_XFADE);
      this._ramp(layer.rec.gain, 1, BED_XFADE);
    }
  }

  /** 원샷 묶음: 이미 받았으면 버퍼 배열, 아니면 받기 시작하고 null */
  _shot(name) {
    const r = this.rec[name];
    if (r || !NATURE_SHOTS[name] || !this._base) return r || null;
    this._loadShot(name);
    return null;
  }

  _loadShot(name) {
    const loading = (this._shotLoading ||= {});
    if (loading[name]) return loading[name];
    const def = NATURE_SHOTS[name];
    const load = def.sprite // 효과음 묶음: 파일 하나에 n 칸
      ? this._decode(def.sprite).then((buf) => (this.rec[name] = { buf, n: def.n, slot: def.slot, len: def.len, last: -1 }))
      : Promise.all(def.map((f) => this._decode(f))).then((bufs) => this._attachRecording(name, bufs));
    return (loading[name] = load.catch((err) => console.warn('[soundEngine] 원샷을 못 받았습니다:', name, err?.message || err)));
  }

  /** 자연의 소리 파일 하나를 받아 푼다. 압축본은 넣어 두어 다시 풀 때 또 받지 않는다 */
  _url(f) {
    this._ext ||= new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"') ? '.m4a' : '.mp3';
    return `${this._base}nature/${f}${this._ext}`;
  }

  /** 압축본 받기 (줄 서서 한 번에 하나, 같은 파일은 한 번만, 받은 것은 넣어 둔다) */
  async _packedBytes(f) {
    const url = this._url(f);
    let packed = this._packed.get(url);
    if (packed) this._packed.delete(url); // 최근에 쓴 것으로 옮긴다
    else {
      // 받기는 한 번에 하나씩 (첫 입장 때 여러 녹음이 회선을 나눠 쓰며 다 같이 늦어지지 않게). 같은 파일은 한 번만
      const fly = (this._inflight ||= new Map());
      let job = fly.get(url);
      if (!job) {
        job = (this._net || Promise.resolve()).then(async () => {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        });
        fly.set(url, job);
        this._net = job.catch(() => {});
        job.finally(() => fly.delete(url)).catch(() => {});
      }
      packed = await job;
    }
    this._packed.set(url, packed);
    let total = 0;
    for (const b of this._packed.values()) total += b.byteLength;
    for (const [k, b] of this._packed) {
      if (total <= PACKED_CAP) break;
      this._packed.delete(k);
      total -= b.byteLength;
    }
    return packed;
  }

  async _decode(f) {
    const packed = await this._packedBytes(f);
    try {
      return await this.ctx.decodeAudioData(packed.slice(0));
    } catch (err) {
      if (this._ext !== '.m4a') throw err;
      this._ext = '.mp3'; // AAC 를 된다고 하고 못 푸는 브라우저
      return this._decode(f);
    }
  }

  /** 지금 풀어 둔 녹음의 크기(바이트) — 배경은 지금·다음 조각, 원샷은 전부 */
  get decodedBytes() {
    let n = 0;
    const add = (b) => b && b.length && (n += b.length * b.numberOfChannels * 4);
    for (const b of this._nbeds || []) {
      add(b.buffer);
      add(b.nextBuf);
    }
    for (const v of Object.values(this.rec)) if (Array.isArray(v)) v.forEach(add);
    else if (v?.buf) add(v.buf);
    return n;
  }

  // ───────────── 소리별 합성 ─────────────

  // 목탁: 속 빈 나무통 '똑' — 몸체 모드(살짝 내려앉는 음) + 통 안 공기 공명 + 채 끝 딸깍
  _moktak(t, v, dest) {
    if (!this._claim('moktak', 4, t + 0.4)) return;
    if (this.rec.moktak) return this._playRec(this.rec.moktak, t, dest, 0.5 * v, rand(0.97, 1.03));
    const f = rand(395, 415);
    this._modal(t, [
      { f, a: 0.34 * v, tau: 0.07, glide: 0.94, glideT: 0.08 },
      { f: f * 0.52, a: 0.16 * v, tau: 0.05 },
      { f: f * 2.62, a: 0.1 * v, tau: 0.025 },
      { f: f * 4.3, a: 0.035 * v, tau: 0.012 },
    ], dest, 0.4);
    this._noise(t, { f: 2200, Q: 0.9, a: 0.12 * v, tau: 0.004, len: 0.03 }, dest);
  }

  // 범종: 당목의 묵직한 '둥' + 64Hz 허밍과 비조화 배음(성덕대왕신종 비율 근사).
  // 각 배음을 미세하게 어긋난 쌍으로 울려 맥놀이(웅~ 웅~)를 만들고, 24초에 걸쳐 리버브 속으로 사라진다
  _bell(t, strength = 1) {
    const len = 24;
    if (!this._claim('bell', 3, t + len)) return;
    const s = Math.max(0.2, Math.min(1.5, strength));
    // 범종: 크고 멀리 — 30m 까지 온전히, 저음이 커서 숲이 거의 먹지 않고(0.05dB/m), 범종각 높이라 담에 가리지 않는다.
    // 산책로 끝(약 90m)에서도 -14dB 쯤. 멀어질수록 직접음은 줄고 산 울림(잔향)은 남아 넓게 퍼진다
    const p = this._spot(this.emit.bell, BELL.ref, this.bus.temple, { alpha: BELL.alpha, elevated: true });
    if (!p) return;
    const feed = this._gain(1, p);
    if (this.rec.bell) {
      // 녹음에는 산사의 자연 잔향이 이미 있어 가까이선 리버브를 조금만, 멀수록 더
      const wetRec = this._gain(BELL.wet + BELL.wetFar * (1 - Math.min(1, p._g)), this.reverb);
      feed.connect(wetRec);
      return this._playRec(this.rec.bell, t, feed, BELL.gain * s, 1, [feed, ...p._chain, wetRec]);
    }
    const wet = this._gain(0.35 + BELL.wetFar * (1 - Math.min(1, p._g)), this.reverb); // 합성 종소리는 리버브를 더 많이
    feed.connect(wet);
    const f0 = 64.2;
    const modes = [
      { f: f0, a: 0.26, tau: 8.5, beat: 0.33, atk: 0.25 }, // 허밍 — 맥놀이 약 3초 주기, 천천히 피어남
      { f: f0 * 2.63, a: 0.24, tau: 6.5, beat: 0.47, atk: 0.04 },
      { f: f0 * 4.23, a: 0.15, tau: 4.2, beat: 0.8, atk: 0.02 },
      { f: f0 * 5.81, a: 0.09, tau: 3.0, beat: 1.1 },
      { f: f0 * 7.44, a: 0.05, tau: 2.0, beat: 1.4 },
      { f: f0 * 9.12, a: 0.03, tau: 1.3 },
      { f: f0 * 12.7, a: 0.015, tau: 0.6 },
    ].map((m, i) => ({ ...m, a: m.a * s * (i > 2 ? Math.min(1, s) : 1) })); // 세게 칠수록 고역이 밝아짐
    this._modal(t, modes, feed, len, [[0, 1]], [feed, ...p._chain, wet]);
    this._modal(t, [{ f: 92, a: 0.3 * s, tau: 0.09, glide: 0.5, glideT: 0.12 }], p, 0.6);
    this._noise(t, { buf: 'brown', type: 'lowpass', f: 380, Q: 0.6, a: 0.35 * s, tau: 0.05, len: 0.3 }, p);
  }

  // 바람에 흔들리는 처마 풍경 (공간음)
  _chimeAt(i, t, gain) {
    const p = this._spot(this.emit.chimes[i], 3, this.bus.temple, { alpha: 0.6 }); // 법당 안에서는 담 가림이 줄인다
    if (p) this._chime(t, CHIME_PITCH[i % CHIME_PITCH.length], gain, p);
  }

  // 풍경: 작은 청동종을 물고기 추가 1~3번 건드린다 — 비조화 배음 + 미세 맥놀이 + 금속 딸깍
  _chime(t, f, gain, dest) {
    const chain = dest._chain || [dest];
    if (!this._claim('chime', 4, t + 5)) return chain.forEach((n) => n.disconnect());
    if (this.rec.chime) {
      const rate = rand(0.96, 1.04) * (f / CHIME_PITCH[0]) ** 0.15; // 풍경마다 살짝 다른 높이
      return this._playRec(this.rec.chime, t, dest, 0.4 * Math.max(0, Math.min(1.5, gain)), rate, chain); // 예전 -18.1 LUFS 에 0.18 → 지금 -25
    }
    const hits = [[0, 1]];
    for (let k = 0, n = (Math.random() * 3) | 0, dt = 0; k < n; k++) hits.push([(dt += rand(0.25, 0.7)), rand(0.25, 0.55)]);
    const a = 0.12 * Math.max(0, Math.min(1.5, gain));
    this._modal(t, [
      { f, a, tau: 1.2, beat: 1.9 },
      { f: f * 2.405, a: a * 0.4, tau: 0.6, beat: 3.1 },
      { f: f * 4.36, a: a * 0.16, tau: 0.3 },
      { f: f * 6.81, a: a * 0.07, tau: 0.16 },
    ], dest, 5, hits, chain);
    this._noise(t, { type: 'highpass', f: 5000, Q: 0.5, a: a * 0.25, tau: 0.002, len: 0.02 + hits[hits.length - 1][0], hits }, dest);
  }

  // 대나무 줄기끼리 '톡 톡' (센 바람일 때, 댓바람 패너로)
  _bambooKnock(t) {
    const f = rand(300, 420);
    this._modal(t, [{ f, a: 0.09, tau: 0.045 }, { f: f * 2.7, a: 0.035, tau: 0.02 }], this.L.bamboo.level, 0.4, [[0, 1], [rand(0.09, 0.16), 0.6]]);
  }

  // 처마 낙숫물: 위로 휘는 짧은 '똑' (리스너 주변 1.5~5m)
  _drip(t) {
    if (!this._claim('drip', 3, t + 0.12)) return;
    const a = rand(0, 2 * Math.PI);
    const d = rand(1.5, 5);
    const L = this._lp;
    const p = this._spot({ x: L.x + Math.cos(a) * d, y: L.y + rand(1, 3), z: L.z + Math.sin(a) * d }, 2, this.bus.nature);
    if (!p) return;
    const recs = this._shot('drip');
    if (recs) return this._playRec(recs, t, p, rand(0.04, 0.095), rand(0.9, 1.1), p._chain); // 합성 낙숫물과 같은 크기 (levels.mjs 0.105)
    this._modal(t, [{ f: rand(900, 2200), a: rand(0.04, 0.1), tau: 0.012, glide: 1.6, glideT: 0.02 }], p, 0.12, [[0, 1]], p._chain);
  }

  // 새 울음 한 소절: 오실레이터 하나에 음표들(주파수 글라이드 + 부드러운 포락선)을 예약
  // notes: [시작(초), 길이, [주파수...], 세기]
  _call(t, notes, pos, amp, ref = 6) {
    const lastNote = notes[notes.length - 1];
    const end = t + lastNote[0] + lastNote[1] + 0.05;
    if (!this._claim('bird', 3, end)) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const p = this._panner(pos, ref, 1, this.bus.nature);
    g.gain.setValueAtTime(0, t);
    for (const [dt, dur, fs, k = 1] of notes) {
      const s = t + dt;
      const e = s + dur;
      const att = Math.min(0.04, dur * 0.35);
      o.frequency.setValueAtTime(fs[0], s);
      for (let i = 1; i < fs.length; i++) o.frequency.exponentialRampToValueAtTime(fs[i], s + (dur * i) / (fs.length - 1));
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(amp * k, s + att);
      g.gain.linearRampToValueAtTime(amp * k * 0.8, e - att);
      g.gain.linearRampToValueAtTime(0, e);
    }
    o.connect(g).connect(p);
    o.start(t);
    o.stop(end);
    o.onended = () => [o, g, p].forEach((n) => n.disconnect());
  }

  _bird(t) {
    const L = this._lp;
    const kind = pick(this.time === 'dawn' ? ['warbler', 'warbler', 'tit', 'finch'] : ['warbler', 'tit', 'finch', 'finch', 'dove']);
    const a = rand(0, 2 * Math.PI);
    const d = kind === 'dove' ? rand(22, 35) : rand(9, 28);
    const pos = { x: L.x + Math.cos(a) * d, y: L.y + rand(4, 12), z: L.z + Math.sin(a) * d };
    const notes = [];
    let amp = 0.18;
    if (kind === 'tit') {
      // 박새 "쯔삐- 쯔삐-"
      const hi = rand(4600, 5400);
      const lo = hi * rand(0.68, 0.75);
      for (let i = 0, n = 2 + ((Math.random() * 3) | 0); i < n; i++) {
        notes.push([i * 0.32, 0.07, [hi, hi * 0.93]], [i * 0.32 + 0.1, 0.13, [lo, lo * 0.98]]);
      }
    } else if (kind === 'warbler') {
      // 휘파람새 "호-- 호케쿄"
      const f = rand(1050, 1250);
      notes.push([0, 0.95, [f, f * 1.04, f * 1.06], 0.8], [1.12, 0.08, [f * 1.6, f * 2.1]], [1.24, 0.07, [f * 2.3, f * 1.8]], [1.36, 0.3, [f * 1.95, f * 1.85, f * 1.6]]);
      amp = 0.28;
    } else if (kind === 'finch') {
      // 작은 새 재잘거림
      for (let i = 0, n = 5 + ((Math.random() * 7) | 0), dt = 0; i < n; i++) {
        const f = rand(3000, 5800);
        const dur = rand(0.03, 0.07);
        notes.push([dt, dur, [f, f * rand(0.75, 1.3)], rand(0.5, 1)]);
        dt += dur + rand(0.03, 0.09);
      }
    } else {
      // 멧비둘기 "구구- 구구-" (멀리서 낮게)
      const f = rand(470, 540);
      for (const [dt, dur] of [[0, 0.32], [0.45, 0.22], [0.72, 0.42], [1.5, 0.32], [1.95, 0.22], [2.22, 0.42]]) notes.push([dt, dur, [f, f * 0.94]]);
      amp = 0.3;
    }
    this._call(t, notes, pos, amp);
  }

  // 소쩍새 "소쩍- 소쩍-" (먼 산에서)
  _owl(t) {
    const L = this._lp;
    const a = rand(0, 2 * Math.PI);
    const pos = { x: L.x + Math.cos(a) * 45, y: L.y + 15, z: L.z + Math.sin(a) * 45 };
    const f = rand(1080, 1200);
    const notes = [];
    for (let i = 0, n = 3 + ((Math.random() * 4) | 0); i < n; i++) {
      notes.push([i * 1.9, 0.11, [f, f * 0.98]], [i * 1.9 + 0.2, 0.2, [f * 0.92, f * 0.86]]);
    }
    this._call(t, notes, pos, 0.35, 10);
  }
}
