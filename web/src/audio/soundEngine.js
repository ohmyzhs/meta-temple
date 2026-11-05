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

const TICK_MS = 200; // 스케줄러 주기 (setInterval 하나로 모든 간헐음 예약)
const LOOKAHEAD = 0.6; // 선행 예약 시간(초) — 틱이 조금 늦어도 박자가 흔들리지 않게
const ZONE_FADE = 2.5; // 구역·날씨·시간대 크로스페이드
const GATE_FADE = 1.5; // 거리 게이트(멀어지면 음원을 완전히 꺼 CPU 절약)
const MASTER_LEVEL = 0.9;
const BEAT = 1.1; // 법당 목탁 박 간격(초)

// 구역별 믹스 — outside: 바깥 자연음 버스 배율, tone: 자연음 로우패스(Hz), wet: 리버브 send 배율
const ZONE_MIX = {
  FOREST: { outside: 1, tone: 16000, wind: 1.0, stream: 1.0, birds: 1.5, chant: 0, kettle: 0.6, bamboo: 0.6, wet: 1 },
  COURTYARD: { outside: 1, tone: 16000, wind: 0.85, stream: 0.55, birds: 0.8, chant: 0.22, kettle: 0.6, bamboo: 0.6, wet: 1 },
  DAEUNGJEON: { outside: 0.4, tone: 1800, wind: 1.0, stream: 1.0, birds: 0.6, chant: 1, kettle: 0, bamboo: 0, wet: 2.2 },
  TEAHOUSE: { outside: 1, tone: 16000, wind: 0.7, stream: 0.5, birds: 1.0, chant: 0, kettle: 1, bamboo: 1.3, wet: 1 },
};
const WEATHER_MIX = {
  clear: { rain: 0, wind: 1.0, stream: 1.0, birds: 1.0, crickets: 1.0, tone: 16000 },
  rain: { rain: 1, wind: 1.1, stream: 1.0, birds: 0.35, crickets: 0.4, tone: 16000 },
  snow: { rain: 0, wind: 0.7, stream: 0.8, birds: 0.3, crickets: 0, tone: 3200 }, // 눈: 먹먹하게
};
const TIME_MIX = {
  dawn: { birds: 1.6, crickets: 0.2 },
  day: { birds: 1.0, crickets: 0 },
  sunset: { birds: 0.5, crickets: 0.5 },
  night: { birds: 0, crickets: 1.0 },
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
};

// 녹음 레이어 — 파일명은 web/assets/audio/<name>.mp3, 원샷은 <name>1..n.mp3
// 받는 순서 = 첫 구역(숲길)에서 먼저 들리는 것부터
const REC_ORDER = [
  ['wind'], ['stream'], ['birds'], ['moktak', 3], ['bell'], ['chime', 4],
  ['chant'], ['rain'], ['insects'], ['birds2'], ['spring'],
];
// 배경 녹음(-24 LUFS 로 맞춰 둠)의 레이어 내 크기
// 같은 레이어의 합성음과 RMS 가 같도록 브라우저에서 40초 평균으로 실측해 맞춘 값
// (바람은 돌풍 때문에 짧게 재면 ±10dB 흔들린다)
const REC_BED = { wind: 3.9, stream: 3.5, rain: 3.3, insects: 4.9, chant: 1.2, birds: 1.0, birds2: 0.6, spring: 1.0 };
const BED_XFADE = 4; // 배경 녹음 이음새 교차 페이드(초)

const CHIME_PITCH = [1174.7, 1318.5, 1046.5, 1568.0, 1760.0]; // 풍경마다 고정 음높이(오음음계)
const BLESSING_CHORDS = [[784, 1046.5, 1318.5], [587.33, 880, 1318.5], [659.25, 987.77, 1318.5]];
const VOWELS = [[750, 1150, 2600], [480, 820, 2600], [350, 700, 2500], [520, 1650, 2500], [620, 1000, 2600]]; // 아·오·우·에·어 포먼트

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

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
    this.rec = {}; // 받아 둔 녹음: 원샷은 AudioBuffer 배열, 배경은 true
    this._beds = [];
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
    this._timer = setInterval(() => this._tick(), TICK_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.ctx.suspend();
      else if (this._enabled) this.ctx.resume();
    });
    if (ctx.state !== 'running') ctx.resume();
  }

  toggleAudio() {
    if (!this.ctx) {
      this.init();
      return this.isEnabled;
    }
    this._enabled = !this._enabled;
    if (this._enabled) {
      this.ctx.resume();
      this._ramp(this.master.gain, MASTER_LEVEL, 1.0);
    } else {
      this._ramp(this.master.gain, 0, 0.6);
      this._suspendAt = this.ctx.currentTime + 0.8; // 페이드가 끝나면 틱에서 컨텍스트를 재운다
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
    if (this.L) {
      for (const k of ['chant', 'brazier', 'kettle', 'bamboo']) setPos(this.L[k].panner, this.emit[k]);
      setPos(this.L.spring.panner, this.emit.pond);
    }
  }

  /**
   * 실제 녹음을 차례로 받아 붙인다 (init() 뒤에 한 번). 모바일 회선을 생각해 한 번에 하나씩.
   * 실패한 항목은 합성음으로 남고 콘솔에 경고만 남긴다.
   */
  async loadRecordings(base = './assets/audio/') {
    if (!this.ctx || this._recLoading) return;
    this._recLoading = true;
    for (const [name, n] of REC_ORDER) {
      const files = n ? Array.from({ length: n }, (_, i) => `${name}${i + 1}`) : [name];
      try {
        const bufs = [];
        for (const f of files) {
          const r = await fetch(`${base}${f}.mp3`);
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
  playTrack(url) {
    this.init();
    if (!this.ctx) return null;
    this.stopTrack(0.4);
    const el = new Audio(url);
    el.preload = 'auto';
    const src = this.ctx.createMediaElementSource(el);
    const g = this._gain(0, this.bus.temple);
    const wet = this._gain(0.15, this.reverb);
    src.connect(g);
    g.connect(wet);
    const tr = (this._track = { url, el, src, g, wet });
    el.addEventListener('ended', () => this._track === tr && this.stopTrack(0.1));
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
      tr.el.pause();
      [tr.src, tr.g, tr.wet].forEach((n) => n.disconnect());
    }, fade * 1000 + 100);
    this._mix(2);
  }

  get currentTrack() {
    return this._track ? { url: this._track.url, el: this._track.el } : null;
  }

  // ───────────── 원샷 (초기화 전·음소거 중에는 무시) ─────────────

  playMoktak() {
    if (this._ready()) this._moktak(this.ctx.currentTime + 0.01, 1, this.bus.sfx);
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
    const t = this.ctx.currentTime + 0.005;
    const f = rand(2300, 2800);
    const hits = [[0, 1], [rand(0.028, 0.045), 0.5]];
    this._modal(t, [{ f, a: 0.14, tau: 0.011 }, { f: f * 1.58, a: 0.06, tau: 0.007 }], this.bus.sfx, 0.12, hits);
    this._noise(t, { f: 4200, Q: 0.8, a: 0.05, tau: 0.003, len: 0.08, hits }, this.bus.sfx);
  }

  // 돌탑 조약돌: 돌끼리 '딱' + 자리 잡는 작은 '딱' + 낮은 둔탁함
  playStoneDrop() {
    if (!this._ready()) return;
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
    const t = this.ctx.currentTime + 0.01;
    const out = this.bus.sfx;
    const f = this._noise(t, { buf: 'pink', f: 260, f2: 1100, sweep: 0.35, Q: 0.9, len: 2.2, env: [[0.3, 0.32], [0.6, 0.22], [1.4, 0.08], [2.2, 0]] }, out);
    f.frequency.exponentialRampToValueAtTime(480, t + 1.8);
    this._noise(t, { buf: 'brown', type: 'lowpass', f: 230, Q: 0.5, len: 1.2, env: [[0.12, 0.35], [0.5, 0.12], [1.2, 0]] }, out);
    this._noise(t + 0.15, { buf: 'crackle', type: 'highpass', f: 1200, Q: 0.5, len: 2.5, env: [[0.25, 0.5], [1.2, 0.3], [2.5, 0]] }, out);
  }

  // 발소리: 표면마다 다른 결, 매번 세기·높이를 조금씩 다르게 (내 발소리라 비공간)
  playFootstep(surface = 'earth') {
    if (!this._ready()) return;
    const t = this.ctx.currentTime + 0.005;
    if (!this._claim('step', 4, t + 0.3)) return;
    const v = rand(0.75, 1.1);
    const k = rand(0.88, 1.12);
    const out = this.bus.sfx;
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

  // 죽비: 쪼갠 대나무 두 쪽이 맞부딪는 '착-' (겹친 두 번의 슬랩), 날카롭되 부드럽게
  playChukbi() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime + 0.005;
    const hits = [[0, 1], [rand(0.022, 0.034), 0.65]];
    this._noise(t, { f: 2100, Q: 0.9, a: 0.32, tau: 0.014, len: 0.2, hits }, this.bus.sfx);
    this._modal(t, [{ f: rand(880, 980), a: 0.1, tau: 0.035 }, { f: 2350, a: 0.05, tau: 0.018 }], this.bus.sfx, 0.25, hits);
  }

  // 차 따르기: 잔이 차오를수록 공명이 올라가는 물줄기 + 찰랑임 + 끝 방울 (~1.8초)
  playTeaPour() {
    if (!this._ready() || !this._claim('pour', 1, this.ctx.currentTime + 2.4)) return;
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
    const t = this.ctx.currentTime + 0.005;
    const len = rand(0.45, 0.75);
    const env = [];
    for (let dt = 0.02; dt < len - 0.05; dt += rand(0.015, 0.05)) env.push([dt, rand(0.015, 0.12) * (Math.random() < 0.2 ? 1.6 : 1)]);
    env.push([len, 0]);
    this._noise(t, { buf: 'pink', f: 3600, Q: 0.5, len, env }, this.bus.sfx);
    this._noise(t, { buf: 'crackle', type: 'highpass', f: 2500, Q: 0.5, len, env: env.map(([d, v]) => [d, v * 0.8]) }, this.bus.sfx);
  }

  // 붓끝이 한지를 스치는 짧은 '스윽'
  playBrushStroke() {
    if (!this._ready()) return;
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
      { f, a: 0.085, tau: 1.4, beat: 0.6 },
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
    L.brazier = this._spatialLoop(1.5, 2.0, this.bus.temple);
    loop(B.crackle, L.brazier.level, 'highpass', 900, 0.5, 0.55);
    loop(B.brown, L.brazier.level, 'lowpass', 260, 0.5, 0.3);

    // 7) 무쇠 주전자: 낮은 보글거림(기포 저속) + 끓는 웅웅 + 김 새는 쉬익
    L.kettle = this._spatialLoop(1.5, 1.4, this.bus.temple);
    loop(B.bubble, L.kettle.level, 'lowpass', 1400, 0.5, 0.6, 0.55);
    loop(B.brown, L.kettle.level, 'lowpass', 180, 0.5, 0.35);
    loop(B.pink, L.kettle.level, 'bandpass', 3800, 0.6, 0.05);

    // 8) 댓바람: 대나무 잎 사각거림 + 잎끼리 부딪는 잔소리 — 돌풍에 함께 일렁인다
    L.bamboo = this._spatialLoop(5, 1.0, this.bus.nature);
    const bambooGust = gain(0, L.bamboo.level);
    this.gust.connect(bambooGust.gain);
    loop(B.pink, bambooGust, 'bandpass', 3400, 0.5, 0.4);
    loop(B.crackle, bambooGust, 'bandpass', 4200, 0.6, 0.25, 1.7);

    // 9) 녹음 전용: 산새(무지향 배경), 다실 연못 샘물(공간음)
    L.birds = { level: gain(0, this.bus.nature) };
    L.spring = this._spatialLoop(4, 1.0, this.bus.nature);

    this.setEmitters();
    this._moveStream(0);
  }

  _spatialLoop(ref, rolloff, dest) {
    const panner = this._panner({ x: 0, y: 0, z: 0 }, ref, rolloff, dest);
    return { panner, level: this._gain(0, panner) };
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
    const Z = ZONE_MIX[this.zone];
    const W = WEATHER_MIX[this.weather];
    const T = TIME_MIX[this.time];
    this._ramp(this.natureZone.gain, Z.outside, dur);
    this._ramp(this.natureTone.frequency, Math.min(Z.tone, W.tone), dur);
    this._ramp(this.send.temple.gain, 0.3 * Z.wet, dur);
    this._ramp(this.send.sfx.gain, 0.2 * Z.wet, dur);
    const L = this.L;
    if (!L) return;
    const near = (pos, r) => (dist(this._lp, pos) < r ? 1 : 0); // 거리 게이트
    this._ramp(L.wind.level.gain, 0.3 * Z.wind * W.wind, dur);
    this._ramp(L.stream.level.gain, 0.5 * Z.stream * W.stream * (this._streamDist < 70 ? 1 : 0), dur);
    this._ramp(L.rain.level.gain, 0.3 * W.rain, dur);
    this._ramp(L.crickets.level.gain, 0.06 * T.crickets * W.crickets, dur);
    this._ramp(L.chant.level.gain, 0.6 * Z.chant * near(this.emit.chant, 45) * (this._track ? 0 : 1), dur);
    this._ramp(L.brazier.level.gain, 0.5 * near(this.emit.brazier, 20), dur);
    this._ramp(L.kettle.level.gain, 0.45 * Z.kettle * near(this.emit.kettle, 22), dur);
    this._ramp(L.bamboo.level.gain, 0.35 * Z.bamboo * near(this.emit.bamboo, 40), dur);
    this._ramp(L.birds.level.gain, 0.3 * Math.min(1.6, T.birds * W.birds * Z.birds), dur);
    this._ramp(L.spring.level.gain, 0.5 * (this.zone === 'TEAHOUSE' ? 1 : 0.4) * near(this.emit.pond, 30), dur);
  }

  _tick() {
    const ctx = this.ctx;
    if (!this._enabled) {
      if (ctx.state === 'running' && ctx.currentTime > this._suspendAt) ctx.suspend();
      return;
    }
    if (ctx.state !== 'running' || document.hidden) return;
    this._schedule(ctx.currentTime);
  }

  _schedule(now) {
    const end = now + LOOKAHEAD;
    // 예약 이벤트: 음소거·백그라운드로 1초 넘게 밀린 것은 몰아서 울리지 않고 버린다
    this._queue = this._queue.filter((ev) => {
      if (ev.t > end) return true;
      if (ev.t > now - 1) ev.fn(Math.max(ev.t, now));
      return false;
    });
    if (!this.L) return;
    this._moveStream(0.3);
    this._mix(GATE_FADE);
    for (const [f, base] of this.L.stream.wob) f.frequency.setTargetAtTime(base * rand(0.75, 1.35), now, 0.15);
    this._gusts(now);
    this._bedTick(now, end);
    this._chantTick(now, end);
    this._wildlife(now);
  }

  _moveStream(tau) {
    const pts = this.emit.stream;
    const q = pts && pts.length ? nearestOnPath(pts, this._lp) : null;
    this._streamDist = q ? dist(q, this._lp) : Infinity;
    if (!q) return;
    const p = this.L.stream.panner;
    const t = this.ctx.currentTime;
    if (!p.positionX) return p.setPosition(q.x, q.y, q.z);
    for (const [param, v] of [[p.positionX, q.x], [p.positionY, q.y], [p.positionZ, q.z]]) {
      if (tau) param.setTargetAtTime(v, t, tau);
      else param.setValueAtTime(v, t);
    }
  }

  // 돌풍: 몇 초마다 새 세기로 천천히 옮겨간다. 센 바람이면 근처 풍경이 흔들리고 대나무가 부딪힌다
  _gusts(now) {
    if (now < this._gustNext) return;
    const target = (0.3 + 0.9 * Math.random() ** 2.2) * (this.weather === 'snow' ? 0.7 : 1);
    this.gust.offset.setTargetAtTime(target, now, rand(1.2, 2.5));
    this._gustNext = now + rand(3, 8);
    const strong = target > 0.85;
    this.emit.chimes.forEach((p, i) => {
      if (dist(p, this._lp) < 40 && Math.random() < (strong ? 0.6 : 0.08)) {
        this._chimeAt(i, now + rand(0.6, 2.2), rand(0.4, 0.9) * (strong ? 1 : 0.6));
      }
    });
    if (target > 0.9 && dist(this.emit.bamboo, this._lp) < 30 && Math.random() < 0.5) this._bambooKnock(now + rand(0.8, 2));
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
    const Z = ZONE_MIX[this.zone];
    const W = WEATHER_MIX[this.weather];
    const T = TIME_MIX[this.time];
    const dt = TICK_MS / 1000;
    // 산새: 기준 5초에 한 번 × 시간대·날씨·구역 배율
    if (!this.rec.birds && Math.random() < ((T.birds * W.birds * Z.birds) / 5) * dt) this._bird(now + rand(0, 0.3));
    // 소쩍새: 밤에 가끔 (비 오면 쉼)
    if (this.time === 'night' && this.weather !== 'rain' && now > this._owlNext) {
      if (this._owlNext > 0) this._owl(now + 0.1);
      this._owlNext = now + rand(30, 80);
    }
    // 처마 낙숫물: 비 올 때 초당 ~0.9회
    if (this.weather === 'rain' && Math.random() < 0.9 * dt * Z.outside) this._drip(now + rand(0, 0.2));
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
    const L = this.L;
    const bedDest = { wind: L.wind.rec, stream: L.stream.rec, rain: L.rain.rec, insects: L.crickets.rec, chant: L.chant.rec, birds: L.birds.level, birds2: L.birds.level, spring: L.spring.level };
    if (!(name in bedDest)) {
      this.rec[name] = bufs; // 원샷
      return;
    }
    this._bed(bufs[0], bedDest[name], REC_BED[name]);
    this.rec[name] = true;
    const layer = { wind: L.wind, stream: L.stream, rain: L.rain, insects: L.crickets, chant: L.chant }[name];
    if (layer) {
      this._ramp(layer.synth.gain, 0, BED_XFADE);
      this._ramp(layer.rec.gain, 1, BED_XFADE);
    }
  }

  // 원샷 녹음: 여러 벌 중 하나를 골라 재생, 끝나면 노드 정리
  _playRec(bufs, t, dest, gain, rate = 1, cleanup = []) {
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

  // 배경 녹음 루프: 조각마다 앞뒤를 등전력 곡선으로 페이드하고 다음 조각을 겹쳐 시작한다
  // (MP3 앞뒤 패딩이나 녹음 끝의 이음새가 들리지 않는다)
  _bed(buffer, dest, level) {
    const bed = { buffer, out: this._gain(level, dest), next: 0 };
    this._beds.push(bed);
    this._bedChunk(bed, this.ctx.currentTime + 0.05, Math.random() * Math.max(0, buffer.duration - BED_XFADE * 3));
  }

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

  _bedTick(now, end) {
    for (const bed of this._beds) {
      if (bed.next < now - 1) this._bedChunk(bed, now + 0.05); // 오래 밀렸으면(백그라운드 등) 지금부터 다시
      else if (bed.next < end) this._bedChunk(bed, bed.next);
    }
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
    const p = this._panner(this.emit.bell, 14, 0.7, this.bus.temple);
    if (this.rec.bell) {
      // 녹음에는 산사의 자연 잔향이 이미 있어 리버브는 조금만
      const wetRec = this._gain(0.12, this.reverb);
      p.connect(wetRec);
      return this._playRec(this.rec.bell, t, p, 0.6 * s, 1, [p, wetRec]);
    }
    const wet = this._gain(0.35, this.reverb); // 종소리는 리버브를 더 많이
    p.connect(wet);
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
    this._modal(t, modes, p, len, [[0, 1]], [p, wet]);
    this._modal(t, [{ f: 92, a: 0.3 * s, tau: 0.09, glide: 0.5, glideT: 0.12 }], p, 0.6);
    this._noise(t, { buf: 'brown', type: 'lowpass', f: 380, Q: 0.6, a: 0.35 * s, tau: 0.05, len: 0.3 }, p);
  }

  // 바람에 흔들리는 처마 풍경 (공간음)
  _chimeAt(i, t, gain) {
    const p = this._panner(this.emit.chimes[i], 3, 1.2, this.bus.temple);
    this._chime(t, CHIME_PITCH[i % CHIME_PITCH.length], gain * (this.zone === 'DAEUNGJEON' ? 0.5 : 1), p);
  }

  // 풍경: 작은 청동종을 물고기 추가 1~3번 건드린다 — 비조화 배음 + 미세 맥놀이 + 금속 딸깍
  _chime(t, f, gain, dest) {
    if (!this._claim('chime', 4, t + 5)) return dest.disconnect();
    if (this.rec.chime) {
      const rate = rand(0.96, 1.04) * (f / CHIME_PITCH[0]) ** 0.15; // 풍경마다 살짝 다른 높이
      return this._playRec(this.rec.chime, t, dest, 0.18 * Math.max(0, Math.min(1.5, gain)), rate, [dest]);
    }
    const hits = [[0, 1]];
    for (let k = 0, n = (Math.random() * 3) | 0, dt = 0; k < n; k++) hits.push([(dt += rand(0.25, 0.7)), rand(0.25, 0.55)]);
    const a = 0.12 * Math.max(0, Math.min(1.5, gain));
    this._modal(t, [
      { f, a, tau: 1.2, beat: 1.9 },
      { f: f * 2.405, a: a * 0.4, tau: 0.6, beat: 3.1 },
      { f: f * 4.36, a: a * 0.16, tau: 0.3 },
      { f: f * 6.81, a: a * 0.07, tau: 0.16 },
    ], dest, 5, hits, [dest]);
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
    const p = this._panner({ x: L.x + Math.cos(a) * d, y: L.y + rand(1, 3), z: L.z + Math.sin(a) * d }, 2, 1, this.bus.nature);
    this._modal(t, [{ f: rand(900, 2200), a: rand(0.04, 0.1), tau: 0.012, glide: 1.6, glideT: 0.02 }], p, 0.12, [[0, 1]], [p]);
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
