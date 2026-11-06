/**
 * 청연산사 — 신행 모달 매니저
 *
 * 한지 패널 하나(#modal-overlay > .modal-window)를 열 가지 화면이 번갈아 쓴다.
 *  - 기본: 가운데 대화창 + 어두운 배경
 *  - side: 배경 없이 오른쪽(모바일은 아래)에 붙는 패널. 뒤의 아바타가 절하고 앉는 모습이 보인다.
 *  - wide: 사경처럼 넓은 화면
 * 게임 로직은 main.js 콜백이 맡고, 여기서는 보여 주고 콜백을 부르기만 한다.
 * 번뇌 소각 글은 어디에도 저장·기록·전송하지 않는다.
 */
import { nameFeedback, NAME_PLACEHOLDER } from './nameField.js';
import { NAME_MAX, checkText } from '../core/moderation.js';
import { CREDITS, CREDIT_GROUPS, CREDIT_SOURCES, LICENSE_URLS, YEBUL_TRACKS, creditSource } from '../data/credits.js';
import { NATURE_PRESETS, SLEEP_MINUTES } from '../data/natureSounds.js';
import { SUTRA_VERSES, DHARMA_CARDS, localMonkResponse, isCrisisText, OPENING_SUGGESTIONS, BLOCKED_REPLIES, COOLED_LINE, REST_SUGGESTIONS, TEA_LINES, voiceKey, cardVoiceText } from '../data/dharmaTexts.js';
import { LIVE_API } from '../core/live.js';
import { icon } from './icons.js';
import { LANTERN_COLORS, ZONES, RITUALS } from '../data/templeData.js';
import { kstDateString } from '../core/state.js';

const VIEWS = {
  wish_lantern: { title: '소원 연등', hanja: '燃燈', sub: '마당 하늘에 작은 빛 하나를 걸어 둡니다.', render: '_lantern' },
  wish_tile: { title: '기와 불사', hanja: '瓦', sub: '검은 기와에 흰 붓으로, 오래 지킬 마음을 새깁니다.', render: '_tile' },
  stone_pagoda: { title: '소원 돌탑', hanja: '石塔', sub: '먼저 지나간 이들의 돌 위에 조약돌 하나를 얹습니다.', render: '_stone' },
  burn_worry: { title: '번뇌 소각', hanja: '燒', sub: '마음을 무겁게 하는 것을 적고, 불에 맡겨 보냅니다.', render: '_burn' },
  practice_108: { title: '108배', hanja: '百八拜', sub: '숨에 맞추어, 천천히.', render: '_practice', variant: 'side', fold: true },
  mala: { title: '염주', hanja: '念珠', sub: '한 알에 한 숨.', render: '_mala', variant: 'side' },
  sutra_copy: { title: '사경', hanja: '寫經', sub: '한 글자씩 따라 쓰며 흩어진 마음을 고릅니다.', render: '_sutra', variant: 'wide' },
  tea_chat: { title: '심검당 차담', hanja: '茶談', sub: '차 한 잔 사이에 두고, 편히 이야기하세요.', render: '_tea', variant: 'side' },
  yebul: { title: '예불 듣기', hanja: '禮佛', sub: '산사에서 실제로 올린 예불을 처음부터 끝까지.', render: '_yebul', variant: 'side' },
  nature: { title: '자연의 소리 듣기', hanja: '自然', sub: '장면 하나를 골라 그 자리에 앉아 오래 듣습니다.', render: '_nature', variant: 'side' },
  dharma_card: { title: '오늘의 죽비', hanja: '竹篦', sub: '지금 내 걸음에 닿는 경전 한 구절.', render: '_card' },
  profile: { title: '수행 기록', hanja: '修行', sub: '견주지 않는, 나만의 조용한 흔적.', render: '_profile' },
  help: { title: '산사 안내', hanja: '案內', sub: '천천히 둘러보세요. 서두를 곳이 없습니다.', render: '_help' },
  credits: { title: '자료 출처', hanja: '出處', sub: '산사를 빚는 데 쓴 자료와 그 출처입니다.', render: '_credits' }
};

const STAT_LABELS = [
  ['bowCount', '절', '배'],
  ['malaCount', '염주', '알'],
  ['lanternCount', '연등', '개'],
  ['tileCount', '기와', '장'],
  ['stoneCount', '돌탑', '개'],
  ['sutraCopiedCount', '사경', '구절'],
  ['circumambulationLoops', '탑돌이', '바퀴'],
  ['incenseCount', '헌향', '번'],
  ['bellStrikes', '범종', '번'],
  ['teaChats', '차담', '번']
];

const CARD_IDS = new Set(DHARMA_CARDS.map((c) => c.id));
const BOW_CYCLE_MS = 8000; // 108배 연속 모드: 8초에 한 번 천천히 (큰절 한 번 7.6초 — core/avatarMotion.js PROSTRATE)
const MALA_BEADS = 27; // 27주 단주 네 바퀴 = 108
const AUTO_FOLD_MS = 3000; // 자동 108배를 시작하고 이만큼 뒤 창을 작은 막대로 접는다 (사용자 요청: 몇 초 뒤 자동으로)
const TEA_MAX = 300; // 한 번에 건넬 수 있는 말 (server/monk.js MONK_LIMITS 와 같게)
const TYPE_MS = 42; // 대사가 한 자씩 나오는 간격 — 누르면 바로 다 보인다
// 스님 목소리: 미리 녹음한 문장 목록 (tools/tts/monk_voice.py). 한 번만 받는다
const VOICE_DIR = './assets/audio/monk/';
let voiceIndex = null;
const voiceKeys = () =>
  (voiceIndex ||= fetch(`${VOICE_DIR}index.json`)
    .then((r) => (r.ok ? r.json() : { keys: [] }))
    .then((j) => new Set(j.keys || []))
    .catch(() => ((voiceIndex = null), new Set())));
// 차담 스님 초상 (먹선 한 장, 3D 의 중년 스님과 같은 옷빛·짙은 눈썹·지그시 뜬 눈 — 생성형 초상이 생기면 바꾼다)
const MONK_FACE = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="#2b2722"/><circle cx="32" cy="32" r="29" fill="none" stroke="#c9a35a" stroke-opacity=".55"/><path d="M11 60c2-12 10-17 21-17s19 5 21 17" fill="#4d453c"/><path d="M21 46l11 9 11-9" fill="none" stroke="#8a6a44" stroke-width="2.4"/><path d="M38 47l6 12" stroke="#6e5236" stroke-width="5"/><ellipse cx="32" cy="29" rx="10" ry="11.5" fill="#dcc3a6"/><path d="M24.5 25.6q3-2.4 6 -.8M33.5 24.8q3-1.6 6 .8" fill="none" stroke="#3a302a" stroke-width="1.9" stroke-linecap="round"/><path d="M26 29.8h4.4M33.6 29.8h4.4" stroke="#3a2a22" stroke-width="1.5" stroke-linecap="round"/><path d="M28.4 33.2q-1.4 2.6 .2 4.6M35.6 33.2q1.4 2.6-.2 4.6" fill="none" stroke="#9a6a50" stroke-width=".9" stroke-linecap="round"/><path d="M29.6 37q2.4 1.4 4.8 0" fill="none" stroke="#8a5a3e" stroke-width="1.2" stroke-linecap="round"/></svg>`;

/* ───────── 작은 도구들 ───────── */
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
const mq = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;
const reduceMotion = () => mq('(prefers-reduced-motion: reduce)');
const isTextField = (el) => !!el?.closest?.('input, textarea, select, [contenteditable="true"]');

export function relTime(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!t) return '';
  const m = Math.floor((now - t) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(t);
}

/** 최신순 (createdAt 이 같으면 나중에 들어온 것이 먼저) */
const byNewest = (list) =>
  list
    .map((x, i) => [x, i])
    .sort((a, b) => (Date.parse(b[0].createdAt) || 0) - (Date.parse(a[0].createdAt) || 0) || b[1] - a[1])
    .map(([x]) => x);

const mineFirst = (list) => {
  const sorted = byNewest(list);
  return [...sorted.filter((x) => x.mine), ...sorted.filter((x) => !x.mine)];
};

/* ───────── 사경 비교 (DOM 없음 — 단위 확인용으로 내보낸다) ─────────
 * 글자·숫자만 센다(띄어쓰기·문장부호는 서로 달라도 상관없다).
 * 끝에 남은 낱자모(ㄱ, ㅏ…)는 아직 조합 중인 글자로 보고 틀림으로 세지 않는다. */
const isSig = (ch) => /[\p{L}\p{N}]/u.test(ch);
const isJamo = (ch) => /[ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/.test(ch);

export function traceCompare(target, committed) {
  const t = [...String(target).normalize('NFC')].filter(isSig);
  const u = [...String(committed).normalize('NFC')].filter(isSig);
  let tail = '';
  while (u.length && isJamo(u[u.length - 1])) tail = u.pop() + tail;
  const typed = u.slice(0, t.length);
  const marks = t.map((ch, i) => (i < typed.length ? (typed[i] === ch ? 'ok' : 'bad') : 'todo'));
  const ok = marks.filter((m) => m === 'ok').length;
  return { marks, typed, tail, ok, total: t.length, complete: ok === t.length && t.length > 0 };
}

/** 조합 중인 글자를 뺀 확정 텍스트. data 는 compositionupdate/input 의 e.data */
export function splitComposition(value, data, caret) {
  if (!data) return { committed: value, pending: '' };
  const end = caret ?? value.length;
  const start = end - data.length;
  if (start >= 0 && value.slice(start, end) === data) {
    return { committed: value.slice(0, start) + value.slice(end), pending: data };
  }
  return { committed: value, pending: '' };
}

/* ───────── 그림 ───────── */
const PETAL = 'M24 12 C31 20 31 31 24 38 C17 31 17 20 24 12Z';
function lotusSvg(hex, size = 40) {
  if (!/^#[0-9a-f]{3,8}$/i.test(String(hex))) hex = '#f3a24a';
  const petal = (deg, op) =>
    `<path d="${PETAL}" transform="rotate(${deg} 24 38)" fill="${hex}" fill-opacity="${op}" stroke="rgba(70,40,25,.28)" stroke-width=".6"/>`;
  return `<svg class="lotus" viewBox="0 0 48 60" width="${size}" height="${Math.round(size * 1.25)}" aria-hidden="true" focusable="false">
    <circle cx="24" cy="30" r="21" fill="${hex}" opacity=".16"/>
    <line x1="24" y1="0" x2="24" y2="12" stroke="rgba(90,65,35,.55)" stroke-width=".8"/>
    ${petal(-62, 0.7)}${petal(62, 0.7)}${petal(-34, 0.82)}${petal(34, 0.82)}
    ${petal(-14, 0.95)}${petal(14, 0.95)}${petal(0, 1)}
    <path d="M24 16 C27 22 27 29 24 34" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1"/>
    <path d="M7 39 Q24 50 41 39 Q24 44 7 39Z" fill="#5f8a5c" stroke="rgba(30,50,30,.35)" stroke-width=".5"/>
    <line x1="24" y1="44" x2="24" y2="55" stroke="${hex}" stroke-width="1.4"/>
    <rect x="22.4" y="53" width="3.2" height="6" rx="1" fill="${hex}"/>
  </svg>`;
}

function malaSvg() {
  const C = 120;
  const R = 92;
  // 단주 27알 — 알마다 나뭇결 빛이 조금씩 다르고, 맨 위 모주(母珠)에는 붉은 술을 단다.
  // 알은 [data-bead] 로 감싸 두고 돌릴 때 반대로 돌려(_mala render) 빛이 늘 왼쪽 위에 남게 한다.
  const tones = ['#a8693b', '#97582f', '#b07440', '#8d5330', '#a36236', '#b9804b'];
  let beads = '';
  for (let i = 0; i < MALA_BEADS; i++) {
    const deg = -90 + (i * 360) / MALA_BEADS;
    const a = (deg * Math.PI) / 180;
    const x = (C + R * Math.cos(a)).toFixed(2);
    const y = (C + R * Math.sin(a)).toFixed(2);
    const o = `transform-origin:${x}px ${y}px`;
    if (i === 0) {
      beads += `<g transform="translate(${x} ${y}) rotate(${deg + 90})"><path class="mala-cord" d="M0 -12v-5"/><circle class="mala-tassel" cx="0" cy="-18.5" r="2.6"/><path class="mala-tassel" d="M-2.2 -20.5C-2.6 -26 -4.4 -33 -5.6 -38.5h11.2C4.4 -33 2.6 -26 2.2 -20.5z"/><path class="mala-tassel-line" d="M-2.6 -24l-1.4 13.5M0 -23v14.5M2.6 -24l1.4 13.5" transform="translate(0 -15)"/></g>`;
      beads += `<g data-bead style="${o}"><circle cx="${x}" cy="${y}" r="13.2" fill="url(#mala-guru)"/><circle cx="${x}" cy="${y}" r="13.2" fill="url(#mala-shade)"/><ellipse cx="${(+x - 4.2).toFixed(2)}" cy="${(+y - 4.6).toFixed(2)}" rx="4.2" ry="2.8" fill="#fff" opacity=".42"/></g>`;
    } else {
      beads += `<g data-bead style="${o}"><circle cx="${x}" cy="${y}" r="9.8" fill="${tones[(i * 7) % tones.length]}"/><circle cx="${x}" cy="${y}" r="9.8" fill="url(#mala-shade)"/><ellipse cx="${(+x - 3.1).toFixed(2)}" cy="${(+y - 3.5).toFixed(2)}" rx="3.1" ry="2" fill="#fff" opacity=".38"/></g>`;
    }
  }
  return `<svg viewBox="0 0 240 240" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="mala-shade" cx="38%" cy="32%" r="72%"><stop offset="0" stop-color="#fff2dc" stop-opacity=".28"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#2a1208" stop-opacity=".55"/></radialGradient>
      <radialGradient id="mala-guru" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#d0866a"/><stop offset=".5" stop-color="#8a3a25"/><stop offset="1" stop-color="#3f1a10"/></radialGradient>
      <radialGradient id="mala-halo"><stop offset="0" stop-color="#e2a640" stop-opacity=".95"/><stop offset=".55" stop-color="#e8b85a" stop-opacity=".45"/><stop offset="1" stop-color="#f0cf86" stop-opacity="0"/></radialGradient>
      <radialGradient id="mala-glow"><stop offset=".72" stop-color="#e8c070" stop-opacity="0"/><stop offset=".86" stop-color="#e8c070" stop-opacity=".55"/><stop offset="1" stop-color="#e8c070" stop-opacity="0"/></radialGradient>
    </defs>
    <circle class="mala-glow" cx="${C}" cy="${C}" r="118" fill="url(#mala-glow)"/>
    <ellipse class="mala-ground" cx="${C}" cy="${C + 8}" rx="${R + 6}" ry="${R + 4}" fill="none" stroke="rgba(60,35,20,.12)" stroke-width="16"/>
    <circle class="mala-halo" cx="${C}" cy="${C - R}" r="24" fill="url(#mala-halo)"/>
    <path class="mala-tick" d="M114 50 L126 50 L120 43 Z"/>
    <g class="mala-beads" data-beads>
      <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#8c2f22" stroke-width="1.6" opacity=".8"/>
      ${beads}
    </g>
  </svg>`;
}

const CAIRN = [
  [80, 128, 52, 14, '#8b857a'],
  [76, 105, 41, 12, '#a39d91'],
  [84, 85, 33, 10.5, '#7d776d'],
  [78, 68, 26, 9, '#b0a99b'],
  [82, 53, 20, 8, '#918a7e'],
  [79, 40, 15, 6.8, '#a8a194']
];
function cairnSvg() {
  const stone = ([cx, cy, rx, ry, fill]) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/><ellipse cx="${cx - rx * 0.25}" cy="${cy - ry * 0.35}" rx="${rx * 0.5}" ry="${ry * 0.35}" fill="#fff" opacity=".13"/>`;
  return `<svg class="cairn-svg" viewBox="0 0 160 150" aria-hidden="true" focusable="false">
    <ellipse cx="80" cy="141" rx="64" ry="6" fill="rgba(60,45,30,.16)"/>
    ${CAIRN.map(stone).join('')}
    <g class="cairn-new" data-new>${stone([80, 29.5, 11, 5.4, '#9c9588'])}</g>
  </svg>`;
}

/* ───────── 매니저 ───────── */
export class ModalManager {
  constructor(store, callbacks = {}, sound = null) {
    this.store = store;
    this.cb = callbacks || {};
    this.sound = sound;

    this.overlay = document.getElementById('modal-overlay');
    this.win = this.overlay?.querySelector('.modal-window');
    this.titleEl = document.getElementById('modal-title');
    this.subEl = document.getElementById('modal-subtitle');
    this.body = document.getElementById('modal-body');
    this.closeBtn = document.getElementById('modal-close-btn');
    this.foldBtn = document.getElementById('modal-fold-btn'); // 창을 작은 막대로 접기 (VIEWS.fold 인 창만)
    this.win?.setAttribute('tabindex', '-1');

    this._type = null;
    this._view = null;
    this._ac = null;
    this._token = 0;
    this._timers = new Set();
    this._rafs = new Set();
    this._returnFocus = null;
    this._today = { date: kstDateString(), bows: 0, mala: 0, done108: false };
    this._teaHistory = []; // 메모리에만. 새로고침하면 사라진다.
    this._sutraDone = new Set();
    this._sutraIdx = 0;

    this.closeBtn?.addEventListener('click', () => this.close());
    this.foldBtn?.addEventListener('click', () => this._view?.fold?.(true));

    // 배경을 눌러 닫기 — 창 안에서 시작한 드래그가 밖에서 끝나도 닫히지 않게
    let downOnOverlay = false;
    this.overlay?.addEventListener('pointerdown', (e) => (downOnOverlay = e.target === this.overlay));
    this.overlay?.addEventListener('click', (e) => {
      if (e.target === this.overlay && downOnOverlay && !this.overlay.classList.contains('is-side')) this.close();
    });

    // 모달 안 입력이 산사 단축키(WASD·1–6·E·V)로 새지 않게
    this.overlay?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!e.isComposing) {
          e.preventDefault();
          this.back();
        }
        e.stopPropagation();
        return;
      }
      if (isTextField(e.target)) e.stopPropagation();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.isComposing && this.isOpen && !isTextField(e.target)) this.back();
    });
  }

  get isOpen() {
    return !!this._type && !!this.overlay && !this.overlay.classList.contains('hidden');
  }

  get current() {
    return this._type;
  }

  open(type, payload = {}) {
    const spec = VIEWS[type];
    if (!spec || !this.overlay) {
      console.warn('[modal] unknown type', type);
      return;
    }
    payload = payload || {};
    if (type === this._type && this._view?.reopen) {
      this._view.reopen(payload);
      return;
    }
    const wasOpen = this.isOpen;
    this._teardown(type);
    if (!wasOpen) this._returnFocus = document.activeElement;

    this._type = type;
    this._token += 1;
    this._ac = new AbortController();
    const side = spec.variant === 'side';
    this.win.className = `modal-window ${spec.variant || ''} m-${type.replace(/_/g, '-')}`;
    this.win.setAttribute('aria-modal', side ? 'false' : 'true');
    this.overlay.classList.toggle('is-side', side);
    this.overlay.classList.remove('is-mini');
    if (this.foldBtn) this.foldBtn.hidden = !spec.fold;
    this.titleEl.innerHTML = `${esc(spec.title)}${spec.hanja ? `<span class="m-hanja" lang="zh-Hant" aria-hidden="true">${spec.hanja}</span>` : ''}`;
    this.subEl.textContent = spec.sub;
    this.body.replaceChildren();
    this.body.scrollTop = 0;
    this.overlay.classList.remove('hidden');
    this.win.classList.remove('is-in');
    void this.win.offsetWidth; // 등장 애니메이션 다시 시작
    this.win.classList.add('is-in');
    if (!side && !wasOpen) this._sfx('playPaperRustle');

    this._view = this[spec.render](payload) || {};
    this._focusFirst();
  }

  close() {
    if (!this._type) return;
    this._teardown();
    this.overlay.classList.add('hidden');
    this.overlay.classList.remove('is-side', 'is-mini');
    this.win.className = 'modal-window';
    const back = this._returnFocus;
    this._returnFocus = null;
    if (back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
  }

  refresh() {
    if (this.isOpen) this._view?.refresh?.();
  }

  /** Esc·뒤로가기: 창 안에 겹쳐 연 것(차담의 죽비 층)이 있으면 그것부터, 없으면 창을 닫는다 */
  back() {
    if (this._view?.back?.()) return;
    this.close();
  }

  /* ───── 생명주기 ───── */
  /** next: 이어서 열릴 종류. side 에서 side 로 넘어갈 때는 onPracticeEnd 를 부르지 않는다 (main.js 가 이미 새로 앉혔다). */
  _teardown(next = null) {
    const prev = this._type;
    this._voice(''); // 창을 닫으면 읽던 말은 멈춘다 (차담은 destroy 에서 끝인사를 한다)
    try {
      this._view?.destroy?.();
    } catch (e) {
      console.warn('[modal] destroy failed', e);
    }
    this._ac?.abort();
    this._ac = null;
    this._timers.forEach((id) => clearTimeout(id));
    this._timers.clear();
    this._rafs.forEach((id) => cancelAnimationFrame(id));
    this._rafs.clear();
    this._view = null;
    this._type = null;
    this.body?.replaceChildren();
    const isSide = (t) => !!t && VIEWS[t]?.variant === 'side';
    if (isSide(prev) && !isSide(next)) this.cb.onPracticeEnd?.();
  }

  _later(fn, ms) {
    const id = setTimeout(() => {
      this._timers.delete(id);
      fn();
    }, ms);
    this._timers.add(id);
    return id;
  }

  _raf(fn) {
    const id = requestAnimationFrame((t) => {
      this._rafs.delete(id);
      fn(t);
    });
    this._rafs.add(id);
  }

  _wait(ms) {
    return new Promise((resolve) => this._later(resolve, ms));
  }

  _on(el, type, fn, opts) {
    el.addEventListener(type, fn, { ...(opts || {}), signal: this._ac.signal });
  }

  _sfx(name) {
    try {
      this.sound?.[name]?.();
    } catch (e) {
      /* 소리는 없어도 된다 */
    }
  }

  /**
   * 스님 목소리 — 미리 녹음해 둔 고정 대사만 (첫인사·끝인사·대화 나무·죽비. AI 가 지은 답은 소리 내지 않는다).
   * 새 말이 오면 앞의 것은 받는 중이든 나오는 중이든 버린다. 빈 글이면 멈추기만.
   * force: 「들려주기」처럼 직접 누른 것 — 차담의 목소리 끄기 설정과 상관없이 (사이트 소리를 끈 것은 따른다)
   */
  _voice(text, { onEnd, force = false } = {}) {
    const n = (this._voiceN = (this._voiceN || 0) + 1);
    this.sound?.stopVoice?.();
    if (!text || (!force && this.store.state.settings.teaVoice === false)) return;
    const key = voiceKey(text);
    voiceKeys().then((keys) => n === this._voiceN && keys.has(key) && this.sound?.playVoice?.(`${VOICE_DIR}${key}.mp3`, onEnd));
  }

  _root(html) {
    const root = document.createElement('div');
    root.className = 'm-view';
    root.innerHTML = html;
    this.body.appendChild(root);
    return root;
  }

  _focusFirst() {
    const token = this._token;
    requestAnimationFrame(() => {
      if (token !== this._token || !this.isOpen) return;
      const visible = (x) => x && x.offsetParent !== null;
      const pick = (sel) => [...this.body.querySelectorAll(sel)].find(visible);
      const el = pick('[data-autofocus]') || pick('textarea:not([readonly]), input');
      // 입력란이 없으면 창 자체에. 휴대폰에서는 자판이 시트를 가리지 않도록 역시 창에.
      const target = el && !(isTextField(el) && mq('(pointer: coarse)')) ? el : this.win;
      target?.focus({ preventScroll: true });
    });
  }

  _tabs(root, onChange) {
    const set = (name) => {
      root.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
      root.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== name));
      onChange?.(name);
    };
    return set;
  }

  _todayCounts() {
    const d = kstDateString();
    if (this._today.date !== d) this._today = { date: d, bows: 0, mala: 0, done108: false };
    return this._today;
  }

  _flash(el, text) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('is-shown');
    void el.offsetWidth;
    el.classList.add('is-shown');
  }

  /* ═════════ 1. 소원 연등 ═════════ */
  _lantern(payload) {
    let color = LANTERN_COLORS[0].hex;
    let detailId = payload.lanternId || null;
    let newId = null;
    let banner = '';
    const root = this._root(`
      <div class="m-tabs" role="tablist" aria-label="소원 연등">
        <button type="button" role="tab" data-tab="write">연등 달기</button>
        <button type="button" role="tab" data-tab="view">달린 연등 보기 <span class="m-tab-count" data-count></span></button>
      </div>
      <section class="m-pane lantern-write" data-pane="write" role="tabpanel">
        <div class="lantern-stage" aria-hidden="true"><div class="lantern-sway" data-preview>${lotusSvg(color, 84)}</div></div>
        <div class="lantern-colors" role="group" aria-label="연등 빛깔">
          ${LANTERN_COLORS.map(
            (c) => `<button type="button" class="lantern-swatch" data-color="${c.hex}" aria-pressed="${c.hex === color}">${lotusSvg(c.hex, 30)}<span>${esc(c.label)}</span></button>`
          ).join('')}
        </div>
        <label class="m-label" for="lantern-wish">마음에 품은 소원</label>
        <div class="m-field">
          <textarea id="lantern-wish" rows="3" maxlength="80" placeholder="가족의 건강, 마음의 평안… 품고 있는 바람을 적어 보세요"></textarea>
          <span class="m-counter" data-counter>0 / 80</span>
        </div>
        <p class="m-sign"><span data-name></span> 합장</p>
        <label class="m-share"><input type="checkbox" data-share checked /> 다른 도반에게도 보이기 <small>법명과 이 글만 함께 보입니다</small></label>
        <div class="m-actions"><button type="button" class="m-btn primary" data-act="add">연등 밝히기</button></div>
        <p class="m-live" data-live aria-live="polite"></p>
      </section>
      <section class="m-pane" data-pane="view" role="tabpanel"></section>`);

    const ta = root.querySelector('#lantern-wish');
    const counter = root.querySelector('[data-counter]');
    const live = root.querySelector('[data-live]');
    const pane = root.querySelector('[data-pane="view"]');
    const nameEl = root.querySelector('[data-name]');

    const empathized = () => this.store.state.empathized || [];
    const empBtn = (l) => {
      const done = empathized().includes(l.id);
      return `<button type="button" class="m-empathy${done ? ' is-done' : ''}" data-emp="${esc(l.id)}" ${done ? 'disabled' : ''}
        aria-label="${done ? '합장 공감을 건넸습니다' : '합장 공감 건네기'}, ${l.empathy || 0}">
        <span>${done ? '공감함' : '합장'}</span><b>${l.empathy || 0}</b></button>`;
    };
    const item = (l) => `
      <li class="lantern-item${l.mine ? ' is-mine' : ''}${l.id === newId ? ' is-new' : ''}">
        <button type="button" class="lantern-open" data-open="${esc(l.id)}">
          <span class="lantern-dot">${lotusSvg(l.color, 26)}</span>
          <span class="lantern-text">
            <span class="lantern-wish">${esc(l.wish)}</span>
            <span class="lantern-meta">${esc(l.author)}${l.mine ? ' · <em>나의 연등</em>' : ''} · ${relTime(l.createdAt)}</span>
          </span>
        </button>
        ${empBtn(l)}
        ${reportBtn('lanterns', l)}
      </li>`;

    const renderView = () => {
      const lanterns = this.store.state.lanterns;
      root.querySelector('[data-count]').textContent = lanterns.length;
      nameEl.textContent = this.store.profile.dharmaName;
      const l = detailId && lanterns.find((x) => x.id === detailId);
      if (l) {
        const done = empathized().includes(l.id);
        pane.innerHTML = `
          <div class="lantern-detail">
            <button type="button" class="m-link m-back" data-back>← 모든 연등</button>
            <div class="lantern-stage is-large" aria-hidden="true"><div class="lantern-sway">${lotusSvg(l.color, 110)}</div></div>
            <blockquote class="lantern-quote">${esc(l.wish)}</blockquote>
            <p class="lantern-meta">${esc(l.author)} 합장 · ${relTime(l.createdAt)}${l.mine ? ' · <em>나의 연등</em>' : ''}</p>
            <div class="m-actions">
              <button type="button" class="m-btn ${done ? 'is-done' : 'primary'}" data-emp="${esc(l.id)}" ${done ? 'disabled' : ''}>
                ${done ? '합장 공감을 건넸습니다' : '합장 공감'} · <b>${l.empathy || 0}</b></button>
            </div>
            <p class="m-hint">공감은 연등 하나에 한 번, 말없이 건네는 마음입니다.</p>
            ${reportBtn('lanterns', l)}
          </div>`;
        return;
      }
      detailId = null;
      const list = byNewest(lanterns);
      const shown = list.slice(0, 80);
      pane.innerHTML = `
        ${banner ? `<p class="m-live is-shown">${esc(banner)}</p>` : ''}
        <ul class="lantern-list">${shown.map(item).join('')}</ul>
        ${list.length > shown.length ? `<p class="m-hint">그 밖에도 ${list.length - shown.length}개의 연등이 마당을 밝히고 있습니다.</p>` : ''}`;
    };

    const setTab = this._tabs(root, (t) => {
      if (t === 'view') renderView();
    });

    const pickColor = (hex) => {
      color = hex;
      root.querySelectorAll('[data-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === hex)));
      root.querySelector('[data-preview]').innerHTML = lotusSvg(hex, 84);
      this._sfx('playUIClick');
    };

    const add = () => {
      const wish = ta.value.trim();
      if (!wish) {
        this._flash(live, '한 줄이라도 좋습니다. 마음을 적어 주세요.');
        ta.focus();
        return;
      }
      if (!this._shareCheck(root, wish, 80, live, ta)) return;
      const res = this.cb.onAddLantern?.(wish, color, root.querySelector('[data-share]')?.checked !== false);
      ta.value = '';
      counter.textContent = '0 / 80';
      newId = res?.lantern?.id || null;
      banner = '연등 하나가 마당 하늘에 올랐습니다. 밤이 깊을수록 더 환히 빛납니다.';
      detailId = null;
      setTab('view');
      this.body.scrollTop = 0;
    };

    const empathize = (id) => {
      const ok = this.cb.onEmpathize?.(id);
      banner = ok ? '말없이 합장 공감을 건넸습니다.' : banner;
      renderView();
    };

    this._on(ta, 'input', () => (counter.textContent = `${ta.value.length} / 80`));
    this._on(root, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tab) {
        if (b.dataset.tab === 'view') detailId = null;
        setTab(b.dataset.tab);
      } else if (b.dataset.color) pickColor(b.dataset.color);
      else if (b.dataset.act === 'add') add();
      else if (b.dataset.open) {
        detailId = b.dataset.open;
        renderView();
        this.body.scrollTop = 0;
      } else if (b.hasAttribute('data-back')) {
        detailId = null;
        renderView();
      } else if (b.dataset.emp) empathize(b.dataset.emp);
      else if (b.dataset.report) {
        if (this._report(b.dataset.report, b.dataset.id)) {
          detailId = null;
          renderView();
        }
      }
    });

    nameEl.textContent = this.store.profile.dharmaName;
    setTab(detailId ? 'view' : 'write');
    return {
      refresh: renderView,
      reopen: (p) => {
        detailId = p.lanternId || null;
        setTab(detailId ? 'view' : 'write');
      }
    };
  }

  /* ═════════ 2. 기와 불사 ═════════ */
  _tile() {
    const year = Number(kstDateString().slice(0, 4)) + 544; // 불기
    const placeholder = '가족 건강 발원';
    const root = this._root(`
      <div class="giwa-stage">
        <div class="giwa is-preview" aria-hidden="true">
          <p class="giwa-text is-empty" data-preview>${placeholder}</p>
          <p class="giwa-sign">불기 ${year}년 · <span data-name></span></p>
        </div>
      </div>
      <label class="m-label" for="tile-wish">기와에 새길 서원 <small>스물네 자 안으로</small></label>
      <div class="m-field">
        <input id="tile-wish" type="text" maxlength="24" autocomplete="off" placeholder="예) 부모님 무병장수 발원" />
        <span class="m-counter" data-counter>0 / 24</span>
      </div>
      <label class="m-share"><input type="checkbox" data-share checked /> 다른 도반에게도 보이기 <small>법명과 이 글만 함께 보입니다</small></label>
      <div class="m-actions"><button type="button" class="m-btn primary" data-act="add">기와 올리기</button></div>
      <p class="m-live" data-live aria-live="polite"></p>
      <h3 class="m-sub">봉안된 기와</h3>
      <ul class="giwa-grid" data-gallery></ul>`);

    const input = root.querySelector('#tile-wish');
    const preview = root.querySelector('[data-preview]');
    const counter = root.querySelector('[data-counter]');
    const live = root.querySelector('[data-live]');
    const nameEl = root.querySelector('[data-name]');

    const renderGallery = () => {
      nameEl.textContent = this.store.profile.dharmaName;
      const tiles = mineFirst(this.store.state.tiles).slice(0, 12);
      root.querySelector('[data-gallery]').innerHTML = tiles
        .map(
          (t) => `<li class="giwa-item${t.mine ? ' is-mine' : ''}">
            <div class="giwa is-small"><p class="giwa-text">${esc(t.wish)}</p></div>
            <p class="giwa-meta">${esc(t.author)}${t.mine ? ' · <em>나의 기와</em>' : ''}</p>${reportBtn('tiles', t)}</li>`
        )
        .join('');
    };

    const sync = () => {
      const v = input.value.trim();
      preview.textContent = v || placeholder;
      preview.classList.toggle('is-empty', !v);
      counter.textContent = `${input.value.length} / 24`;
    };

    const add = () => {
      const wish = input.value.trim();
      if (!wish) {
        this._flash(live, '기와에 새길 한 줄을 적어 주세요.');
        input.focus();
        return;
      }
      if (!this._shareCheck(root, wish, 24, live, input)) return;
      this.cb.onAddTile?.(wish, root.querySelector('[data-share]')?.checked !== false);
      this._sfx('playBrushStroke');
      const giwa = root.querySelector('.giwa.is-preview');
      giwa.classList.remove('is-offered');
      void giwa.offsetWidth;
      giwa.classList.add('is-offered');
      input.value = '';
      this._later(sync, 900);
      this._flash(live, '기와 한 장이 불사대에 봉안되었습니다. 오래도록 지붕을 지킬 마음입니다.');
      renderGallery();
    };

    this._on(input, 'input', sync);
    this._on(input, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        add();
      }
    });
    this._on(root, 'click', (e) => {
      if (e.target.closest('[data-act="add"]')) return add();
      const r = e.target.closest('[data-report]');
      if (r && this._report(r.dataset.report, r.dataset.id)) renderGallery();
    });
    renderGallery();
    return { refresh: renderGallery };
  }

  /** 「다른 도반에게도 보이기」가 켜져 있으면 올리기 전에 거름을 먼저 보여 준다 (서버가 최종 판정) */
  _shareCheck(root, wish, max, live, field) {
    if (root.querySelector('[data-share]')?.checked === false) return true;
    const r = checkText(wish, { kind: 'wish', max });
    if (r.ok) return true;
    this._flash(live, `${r.message}. 고쳐 쓰거나 「다른 도반에게도 보이기」를 끄면 나만 보도록 둘 수 있습니다.`);
    field?.focus();
    return false;
  }

  /** 남의 공유 글 신고 — 내 화면에서는 바로 치우고 서버에 알린다. 반환: 신고했는지 */
  _report(kind, id) {
    if (!window.confirm('이 글을 신고할까요?\n내 화면에서는 바로 사라지고, 서로 다른 세 분이 신고하면 모두에게서 가려집니다.')) return false;
    this.cb.onReport?.(kind, id);
    return true;
  }

  /* ═════════ 3. 소원 돌탑 ═════════ */
  _stone() {
    const root = this._root(`
      <div class="cairn">
        ${cairnSvg()}
        <p class="cairn-count" data-count>지금까지 <b data-total>0</b>개의 돌이 쌓였습니다</p>
      </div>
      <label class="m-label" for="stone-wish">한 줄 다짐 <small>서른 자 안으로</small></label>
      <div class="m-field">
        <input id="stone-wish" type="text" maxlength="30" autocomplete="off" placeholder="예) 천천히, 그러나 멈추지 않기" />
        <span class="m-counter" data-counter>0 / 30</span>
      </div>
      <label class="m-share"><input type="checkbox" data-share checked /> 다른 도반에게도 보이기 <small>법명과 이 글만 함께 보입니다</small></label>
      <div class="m-actions"><button type="button" class="m-btn primary" data-act="add">조약돌 얹기</button></div>
      <p class="m-live" data-live aria-live="polite"></p>
      <h3 class="m-sub" data-list-title>최근에 얹은 돌</h3>
      <ul class="stone-list" data-list></ul>
      <div data-mine-wrap hidden>
        <h3 class="m-sub">내가 돌을 얹은 돌탑 <small>누르면 걸어서 찾아갑니다</small></h3>
        <ul class="stone-list my-cairns" data-mine></ul>
      </div>`);

    const input = root.querySelector('#stone-wish');
    const counter = root.querySelector('[data-counter]');
    const live = root.querySelector('[data-live]');

    const render = () => {
      // 이 자리의 탑에 남긴 글만 (main 이 탑을 정해 준다). 옛 콜백이면 전체
      const sc = this.cb.stoneScope?.();
      const stones = sc ? sc.stones : this.store.state.stones;
      if (sc) {
        const count = root.querySelector('[data-count]');
        count.innerHTML = sc.isNew
          ? `<span class="cairn-name">${esc(sc.name)}</span>아직 돌이 없는 자리입니다 · 첫 돌을 얹으면 여기에 새 돌탑이 섭니다`
          : `<span class="cairn-name">${esc(sc.name)}</span>지금까지 <b data-total>${sc.total.toLocaleString('ko-KR')}</b>개의 돌이 쌓였습니다`;
        root.querySelector('[data-list-title]').textContent = '이 돌탑에 남긴 글';
        const mine = (sc.mine || []).slice(0, 6);
        root.querySelector('[data-mine-wrap]').hidden = !mine.length;
        root.querySelector('[data-mine]').innerHTML = mine
          .map((c) =>
            c.id === sc.id
              ? `<li class="stone-item is-mine"><span class="stone-text"><span class="stone-wish">${esc(c.name)}</span><span class="stone-meta">지금 여기 · 내 돌 ${c.mine}개</span></span></li>`
              : `<li class="stone-item"><span class="stone-text"><span class="stone-wish">${esc(c.name)}</span><span class="stone-meta">내 돌 ${c.mine}개 · 여기서 ${c.d}m</span></span><button type="button" class="m-btn small" data-walk="${esc(c.id)}">걸어서 가기</button></li>`
          )
          .join('');
      } else root.querySelector('[data-total]').textContent = (this.store.stoneTotal ?? stones.length).toLocaleString('ko-KR');
      const empty = sc && !stones.length ? `<li class="stone-item"><span class="stone-text"><span class="stone-meta">${sc.loading ? '남긴 글을 불러오는 중…' : sc.offline ? '지금은 서버에 닿지 않아 다른 도반의 글을 불러오지 못했습니다' : '아직 이 돌탑에 남긴 글이 없습니다'}</span></span></li>` : '';
      root.querySelector('[data-list]').innerHTML = empty + byNewest(stones)
        .slice(0, 12)
        .map(
          (s) => `<li class="stone-item${s.mine ? ' is-mine' : ''}">
            <span class="stone-pebble" aria-hidden="true"></span>
            <span class="stone-text"><span class="stone-wish">${esc(s.wish)}</span>
            <span class="stone-meta">${esc(s.author)}${s.mine ? ' · <em>나의 돌</em>' : ''} · ${relTime(s.createdAt)}</span></span>${reportBtn('stones', s)}</li>`
        )
        .join('');
    };

    const add = () => {
      const wish = input.value.trim();
      if (!wish) {
        this._flash(live, '돌 위에 얹을 한 줄을 적어 주세요.');
        input.focus();
        return;
      }
      if (!this._shareCheck(root, wish, 30, live, input)) return;
      this.cb.onAddStone?.(wish, root.querySelector('[data-share]')?.checked !== false);
      const g = root.querySelector('[data-new]');
      g.classList.remove('is-drop');
      void g.getBoundingClientRect();
      g.classList.add('is-drop');
      input.value = '';
      counter.textContent = '0 / 30';
      this._flash(live, '조약돌 하나를 얹었습니다. 무너지지 않는 것은 쌓아 온 마음들 덕분입니다.');
      render();
    };

    this._on(input, 'input', () => (counter.textContent = `${input.value.length} / 30`));
    this._on(input, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        add();
      }
    });
    this._on(root, 'click', (e) => {
      if (e.target.closest('[data-act="add"]')) return add();
      const w = e.target.closest('[data-walk]');
      if (w) return this.cb.onWalkCairn?.(w.dataset.walk);
      const r = e.target.closest('[data-report]');
      if (r && this._report(r.dataset.report, r.dataset.id)) render();
    });
    render();
    this.cb.onStoneView?.();
    return { refresh: render };
  }

  /* ═════════ 4. 번뇌 소각 ═════════ */
  _burn() {
    const root = this._root(`
      <p class="burn-intro">마음을 무겁게 하는 생각을 적어 보세요. 이 글은 <b>저장되지도, 어디로 보내지지도 않습니다.</b>
        태우는 순간 이 화면에서도 흔적 없이 사라집니다.</p>
      <div class="burn-stage" data-stage>
        <div class="burn-paper" data-paper>
          <label class="sr-only" for="burn-text">태워 보낼 마음</label>
          <textarea id="burn-text" rows="5" maxlength="400" autocomplete="off" autocorrect="off" spellcheck="false"
            placeholder="후회, 미움, 불안… 아무도 보지 않으니 솔직하게 적어도 괜찮습니다"></textarea>
        </div>
      </div>
      <div class="m-actions" data-actions><button type="button" class="m-btn fire" data-act="burn">화로에 태워 보내기</button></div>
      <p class="m-live" data-live aria-live="polite"></p>
      <div class="burn-after" data-after hidden>
        <p class="burn-done">흔적 없이 사라졌습니다.</p>
        <p class="m-hint">깊게 한 번 내쉬어 보세요. 가벼워진 만큼, 그 자리에 바람이 듭니다.</p>
        <div class="m-actions"><button type="button" class="m-btn" data-act="again">다시 적기</button></div>
      </div>`);

    const stage = root.querySelector('[data-stage]');
    const paper = root.querySelector('[data-paper]');
    const ta = root.querySelector('#burn-text');
    const actions = root.querySelector('[data-actions]');
    const after = root.querySelector('[data-after]');
    const live = root.querySelector('[data-live]');
    let burning = false;

    const finish = () => {
      actions.hidden = true;
      actions.style.visibility = '';
      stage.classList.add('is-empty');
      after.hidden = false;
      after.querySelector('button')?.focus({ preventScroll: true });
      burning = false;
    };

    const burn = () => {
      if (burning) return;
      let text = ta.value;
      if (!text.trim()) {
        this._flash(live, '한 단어라도 괜찮습니다.');
        ta.focus();
        return;
      }
      burning = true;
      live.textContent = '';
      ta.value = ''; // 입력란에서 바로 지운다
      ta.blur();
      // 3D 화로가 받으면: 쪽지가 손앞에서 화로로 날아 들어가 탄다 (main.js 가 창을 닫는다). 캔버스는 다 타면 거기서 지운다
      const paperCanvas = this._paperCanvas(text);
      if (this.cb.onBurnWorry?.(paperCanvas) === true) {
        text = null;
        burning = false;
        return;
      }
      paperCanvas.width = paperCanvas.height = 0;
      actions.style.visibility = 'hidden'; // 자리를 지켜 창이 출렁이지 않게
      const rect = paper.getBoundingClientRect();
      paper.classList.add('is-gone');
      if (reduceMotion()) {
        text = null;
        this._later(finish, 300);
        return;
      }
      this._burnCanvas(stage, rect, text, finish);
      text = null;
    };

    this._on(root, 'click', (e) => {
      const b = e.target.closest('button');
      if (b?.dataset.act === 'burn') burn();
      if (b?.dataset.act === 'again') {
        after.hidden = true;
        stage.classList.remove('is-empty');
        paper.classList.remove('is-gone');
        actions.hidden = false;
        ta.value = '';
        ta.focus();
      }
    });
    return {
      destroy: () => {
        ta.value = '';
      }
    };
  }

  /** 화로로 날아갈 한지 쪽지 한 장 (512×362, 3D 쪽지 0.34×0.24m 비율): 섬유결 + 붓글씨. 받는 쪽이 다 태운 뒤 지운다 */
  _paperCanvas(text) {
    const W = 512, H = 362;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const o = c.getContext('2d');
    o.fillStyle = '#f6efde';
    o.fillRect(0, 0, W, H);
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * W, y = Math.random() * H, a = Math.random() * Math.PI, l = 8 + Math.random() * 26;
      o.strokeStyle = `rgba(150,120,80,${0.05 + Math.random() * 0.09})`;
      o.lineWidth = 0.8;
      o.beginPath();
      o.moveTo(x, y);
      o.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (Math.random() - 0.5) * 6, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      o.stroke();
    }
    const fs = 34, lh = fs * 1.38;
    o.font = `${fs}px "Nanum Brush Script", "Noto Serif KR", serif`;
    o.fillStyle = '#2b2722';
    o.textBaseline = 'top';
    const lines = wrapText(o, text, W - 56);
    const max = Math.max(1, Math.floor((H - 48) / lh));
    lines.slice(0, max).forEach((ln, i) => o.fillText(i === max - 1 && lines.length > max ? `${ln}…` : ln, 28, 26 + i * lh));
    return c;
  }

  /** 한지 쪽지가 모서리부터 그을리며 타들어 가는 캔버스 연출. 끝나면 픽셀까지 비운다. (3D 화로를 못 쓸 때) */
  _burnCanvas(stage, rect, text, done) {
    const W = Math.max(200, Math.round(rect.width));
    const H = Math.max(120, Math.round(rect.height));
    const PAD = 80; // 연기가 피어오를 위쪽 여백
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(W * dpr);
    const ph = Math.round(H * dpr);
    const canvas = document.createElement('canvas');
    canvas.className = 'burn-canvas';
    canvas.width = cw;
    canvas.height = Math.round((H + PAD) * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H + PAD}px`;
    canvas.style.top = `${-PAD}px`;
    canvas.setAttribute('aria-hidden', 'true');
    stage.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // 1) 한지 쪽지 그리기
    const off = document.createElement('canvas');
    off.width = cw;
    off.height = ph;
    const o = off.getContext('2d');
    o.fillStyle = '#f6efde';
    o.fillRect(0, 0, cw, ph);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * cw;
      const y = Math.random() * ph;
      const a = Math.random() * Math.PI;
      const l = (6 + Math.random() * 20) * dpr;
      o.strokeStyle = `rgba(150,120,80,${0.05 + Math.random() * 0.09})`;
      o.lineWidth = 0.6 * dpr;
      o.beginPath();
      o.moveTo(x, y);
      o.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (Math.random() - 0.5) * 5 * dpr, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      o.stroke();
    }
    const fs = 25 * dpr;
    const lh = fs * 1.42;
    o.font = `${fs}px "Nanum Brush Script", "Noto Serif KR", serif`;
    o.fillStyle = '#2b2722';
    o.textBaseline = 'top';
    const lines = wrapText(o, text, cw - 40 * dpr);
    const maxLines = Math.max(1, Math.floor((ph - 36 * dpr) / lh));
    lines.slice(0, maxLines).forEach((ln, i) => o.fillText(i === maxLines - 1 && lines.length > maxLines ? `${ln}…` : ln, 20 * dpr, 18 * dpr + i * lh));
    text = null;
    const base = o.getImageData(0, 0, cw, ph);
    o.clearRect(0, 0, cw, ph);

    // 2) 타들어 갈 순서 — 오른쪽 아래 모서리에서 번지는 불 + 값 잡음으로 들쭉날쭉한 가장자리
    const grid = (gx, gy) => Array.from({ length: (gx + 1) * (gy + 1) }, Math.random);
    const coarse = grid(9, 5);
    const fine = grid(28, 14);
    const sample = (g, gx, gy, nx, ny) => {
      const x = nx * gx;
      const y = ny * gy;
      const x0 = Math.min(gx - 1, x | 0);
      const y0 = Math.min(gy - 1, y | 0);
      const fx = x - x0;
      const fy = y - y0;
      const s = (fx * fx * (3 - 2 * fx));
      const t = (fy * fy * (3 - 2 * fy));
      const r = gx + 1;
      const a = g[y0 * r + x0] + (g[y0 * r + x0 + 1] - g[y0 * r + x0]) * s;
      const b = g[(y0 + 1) * r + x0] + (g[(y0 + 1) * r + x0 + 1] - g[(y0 + 1) * r + x0]) * s;
      return a + (b - a) * t;
    };
    const field = new Float32Array(cw * ph);
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = 0; y < ph; y++) {
      const ny = y / ph;
      for (let x = 0; x < cw; x++) {
        const nx = x / cw;
        const n = sample(coarse, 9, 5, nx, ny) * 0.7 + sample(fine, 28, 14, nx, ny) * 0.3;
        const d = Math.hypot(1 - nx, (1 - ny) * 0.75) / 1.25;
        const v = d * 0.7 + n * 0.3;
        field[y * cw + x] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const span = hi - lo || 1;
    for (let i = 0; i < field.length; i++) field[i] = (field[i] - lo) / span;

    // 3) 태우기
    const out = ctx.createImageData(cw, ph);
    const src = base.data;
    const dst = out.data;
    const parts = [];
    const DUR = 3400;
    const t0 = performance.now();
    const top = PAD * dpr;
    canvas.classList.add('is-curling');

    const frame = (now) => {
      const p = (now - t0) / DUR;
      const th = p * 1.12 - 0.04;
      for (let i = 0, j = 0; i < field.length; i++, j += 4) {
        const v = field[i] - th;
        if (v < 0) {
          dst[j + 3] = 0;
        } else if (v < 0.016) {
          const k = v / 0.016;
          dst[j] = 255;
          dst[j + 1] = 115 + 110 * k;
          dst[j + 2] = 30 + 50 * k;
          dst[j + 3] = 255;
        } else if (v < 0.075) {
          const c = 1 - (v - 0.016) / 0.059;
          const dark = c * c * 0.92;
          dst[j] = src[j] * (1 - dark) + 40 * dark;
          dst[j + 1] = src[j + 1] * (1 - dark) + 24 * dark;
          dst[j + 2] = src[j + 2] * (1 - dark) + 14 * dark;
          dst[j + 3] = 255;
        } else {
          dst[j] = src[j];
          dst[j + 1] = src[j + 1];
          dst[j + 2] = src[j + 2];
          dst[j + 3] = 255;
        }
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(out, 0, top);

      if (th < 1.0) {
        for (let s = 0; s < 60 && parts.length < 280; s++) {
          const i = (Math.random() * field.length) | 0;
          const v = field[i] - th;
          if (v < 0 || v > 0.03) continue;
          const x = i % cw;
          const y = ((i / cw) | 0) + top;
          const r = Math.random();
          if (r < 0.75) parts.push({ e: 1, x, y, vx: (Math.random() - 0.5) * 0.7 * dpr, vy: -(0.5 + Math.random() * 1.5) * dpr, life: 1, dec: 0.012 + Math.random() * 0.02, r: (0.7 + Math.random() * 1.5) * dpr, ph: Math.random() * 6 });
          else if (r < 0.9) parts.push({ e: 0, x, y, vx: (Math.random() - 0.5) * 0.3 * dpr, vy: -(0.25 + Math.random() * 0.5) * dpr, life: 1, dec: 0.006 + Math.random() * 0.006, r: (5 + Math.random() * 8) * dpr, ph: 0 });
        }
      }
      for (let k = parts.length - 1; k >= 0; k--) {
        const q = parts[k];
        q.ph += 0.08;
        q.x += q.vx + Math.sin(q.ph) * 0.25 * dpr;
        q.y += q.vy;
        q.life -= q.dec;
        if (q.life <= 0) {
          parts.splice(k, 1);
          continue;
        }
        if (q.e) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `rgba(255,${(150 + 80 * q.life) | 0},70,${q.life})`;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.r * (0.6 + q.life * 0.4), 0, Math.PI * 2);
          ctx.fill();
        } else {
          q.r += 0.22 * dpr;
          ctx.globalCompositeOperation = 'source-over';
          const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r);
          g.addColorStop(0, `rgba(105,96,86,${0.17 * q.life})`);
          g.addColorStop(1, 'rgba(105,96,86,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      if (th < 1.02 || parts.length) {
        this._raf(frame);
        return;
      }
      // 끝 — 픽셀까지 비우고 캔버스를 없앤다
      src.fill(0);
      dst.fill(0);
      field.fill(0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.remove();
      done();
    };
    this._raf(frame);
  }

  /* ═════════ 5. 108배 (side) — 자동으로 돌리면 몇 초 뒤 작은 막대로 접혀 화면을 비운다 ═════════ */
  _practice() {
    const C = 2 * Math.PI * 60;
    const c = 2 * Math.PI * 19;
    const pauseSvg = '<svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
    const playSvg = '<svg class="i-play" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
    const root = this._root(`
      <section class="practice" data-full>
        <div class="practice-visual">
          <div class="bow-ring" data-ring>
            <svg viewBox="0 0 140 140" aria-hidden="true" focusable="false">
              <circle class="ring-bg" cx="70" cy="70" r="60"/>
              <circle class="ring-fg" cx="70" cy="70" r="60" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}" data-arc/>
            </svg>
            <div class="bow-center"><b data-bows>0</b><small>/ 108</small></div>
          </div>
        </div>
        <div class="practice-side">
          <p class="breath" data-breath aria-live="polite">숨을 고르고, 준비되면 시작하세요</p>
          <div class="m-actions practice-actions">
            <button type="button" class="m-btn primary" data-act="bow">절 올리기</button>
            <button type="button" class="m-btn" data-act="auto" aria-pressed="false">자동 108배 <small>8초에 한 번</small></button>
          </div>
          <p class="practice-stat">오늘 <b data-today-bows>0</b>배 · 누적 <b data-life-bows>0</b>배</p>
        </div>
      </section>
      <div class="practice-mini" data-mini hidden>
        <button type="button" class="pm-count" data-act="unfold" aria-label="108배 창 펼치기">
          <svg viewBox="0 0 44 44" aria-hidden="true" focusable="false"><circle class="ring-bg" cx="22" cy="22" r="19"/><circle class="ring-fg" cx="22" cy="22" r="19" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}" data-mini-arc/></svg>
          <b data-mini-bows>0</b>
        </button>
        <span class="pm-text"><b data-mini-breath>자동 108배</b><small>오늘 <span data-mini-today>0</span> / 108배</small></span>
        <button type="button" class="pm-btn" data-act="auto" aria-label="멈추기">${pauseSvg}${playSvg}</button>
        <button type="button" class="pm-btn" data-act="unfold" aria-label="108배 창 펼치기"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 14l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>`);

    const $ = (s) => root.querySelector(s);
    const breath = $('[data-breath]');
    const autoBtn = $('[data-full] [data-act="auto"]');
    const bowBtn = $('[data-act="bow"]');
    const ring = $('[data-ring]');
    const mini = $('[data-mini]');
    let auto = false;
    let gen = 0;
    let folded = false;

    const setBreath = (text) => {
      breath.classList.remove('is-shift');
      void breath.offsetWidth;
      breath.textContent = text;
      breath.classList.add('is-shift');
      $('[data-mini-breath]').textContent = text;
    };

    const render = () => {
      const t = this._todayCounts();
      const s = this.store.stats;
      const done = Math.min(t.bows, 108) / 108;
      $('[data-bows]').textContent = t.bows;
      $('[data-arc]').setAttribute('stroke-dashoffset', (C * (1 - done)).toFixed(2));
      $('[data-mini-arc]').setAttribute('stroke-dashoffset', (c * (1 - done)).toFixed(2));
      $('[data-mini-bows]').textContent = t.bows;
      $('[data-mini-today]').textContent = t.bows;
      $('[data-today-bows]').textContent = t.bows;
      $('[data-life-bows]').textContent = (s.bowCount || 0).toLocaleString('ko-KR');
      mini.dataset.auto = String(auto);
      mini.querySelector('[data-act="auto"]').setAttribute('aria-label', auto ? '멈추기' : '자동 108배 이어 하기');
    };

    /** 접으면 횟수 고리·숨·멈춤·펼치기만 남은 작은 막대 (창 머리의 ﹀ 또는 자동 시작 몇 초 뒤) */
    const fold = (on) => {
      if (folded === on) return;
      folded = on;
      this.win.classList.toggle('is-mini', on);
      this.overlay.classList.toggle('is-mini', on);
      mini.hidden = !on;
      $('[data-full]').hidden = on;
      render();
    };

    const stopAuto = () => {
      gen += 1;
      auto = false;
      autoBtn.setAttribute('aria-pressed', 'false');
      autoBtn.innerHTML = '자동 108배 <small>8초에 한 번</small>';
      bowBtn.disabled = false;
      ring.classList.remove('is-breathing');
      render();
    };

    // 소리는 아바타가 낸다: 꿇고 엎드리고 일어설 때 도복 스치는 소리 (main.js onRustle).
    // onBow 가 false 면 아바타가 아직 앞 절을 마치는 중 — 세지 않는다.
    const bow = () => {
      if (this.cb.onBow?.() === false) return false;
      const t = this._todayCounts();
      t.bows += 1;
      render();
      if (t.bows === 108 && !t.done108) {
        t.done108 = true;
        stopAuto();
        this._sfx('playChukbi');
        ring.classList.add('is-complete');
        setBreath('백팔 배를 모두 올렸습니다. 잠시 그대로 앉아 숨을 고르세요.');
      }
      return true;
    };

    const startAuto = () => {
      gen += 1;
      const my = gen;
      autoBtn.setAttribute('aria-pressed', 'true');
      autoBtn.textContent = '멈추기';
      bowBtn.disabled = true;
      auto = true;
      render();
      // 시작하고 잠시 뒤 창을 접어 절하는 모습이 보이게 (펼치기는 막대에서)
      this._later(() => my === gen && fold(true), AUTO_FOLD_MS);
      // 들숨 4초 → 날숨에 절 → 절이 받아들여진 때부터 다시 4초. 아바타 동작이 8초보다 길어도 절을 건너뛰지 않는다.
      const inhale = () => {
        if (my !== gen) return;
        setBreath('들이쉬며 합장');
        ring.classList.remove('is-breathing');
        void ring.offsetWidth;
        ring.classList.add('is-breathing');
        this._later(exhale, BOW_CYCLE_MS / 2);
      };
      const exhale = () => {
        if (my !== gen) return;
        setBreath('내쉬며 오체투지');
        tryBow();
      };
      const tryBow = () => {
        if (my !== gen) return;
        if (bow()) {
          if (my === gen) this._later(inhale, BOW_CYCLE_MS / 2);
        } else this._later(tryBow, 150);
      };
      inhale();
    };

    const manualBow = () => {
      setBreath('내쉬며 오체투지');
      bow();
      const my = gen;
      this._later(() => my === gen && !auto && this._todayCounts().bows < 108 && setBreath('들이쉬며 합장'), BOW_CYCLE_MS / 2);
    };

    this._on(root, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'bow') manualBow();
      else if (b.dataset.act === 'auto') (auto ? stopAuto() : startAuto());
      else if (b.dataset.act === 'unfold') fold(false);
    });

    render();
    bowBtn.setAttribute('data-autofocus', '');
    return {
      refresh: render,
      fold,
      reopen: () => fold(false),
      destroy: stopAuto
    };
  }

  /* ═════════ 5-2. 염주 (side) — 누르기·쓸어 넘기기·스페이스바, 한 알에 한 숨 ═════════ */
  _mala() {
    const root = this._root(`
      <section class="practice mala-pane">
        <div class="practice-visual">
          <button type="button" class="mala" data-act="bead" aria-label="염주 한 알 넘기기">
            ${malaSvg()}
            <span class="mala-center" aria-hidden="true"><b data-mala>0</b><small>/ 108</small></span>
          </button>
        </div>
        <div class="practice-side">
          <p class="breath is-still" data-mala-breath>한 알에 한 숨</p>
          <p class="practice-stat">오늘 <b data-today-mala>0</b>알 · 누적 <b data-life-mala>0</b>알</p>
          <p class="m-hint">염주를 누르거나 아래로 쓸어 넘기세요. 스물일곱 알을 네 바퀴 돌리면 백팔입니다.</p>
          <p class="m-live" data-mala-live aria-live="polite"></p>
        </div>
      </section>`);
    const $ = (s) => root.querySelector(s);
    const mala = $('.mala');
    const beads = $('[data-beads]');
    const each = [...root.querySelectorAll('[data-bead]')];
    const breath = $('[data-mala-breath]');
    let rot = -(this._todayCounts().mala % MALA_BEADS) * (360 / MALA_BEADS);

    // 알마다 반대로 돌려 빛(왼쪽 위)이 늘 같은 쪽에 남게 — 줄과 술은 함께 돈다
    const render = () => {
      const t = this._todayCounts();
      const s = this.store.stats;
      beads.style.transform = `rotate(${rot}deg)`;
      for (const el of each) el.style.transform = `rotate(${-rot}deg)`;
      $('[data-mala]').textContent = t.mala % 108 === 0 && t.mala > 0 ? 108 : t.mala % 108;
      $('[data-today-mala]').textContent = t.mala;
      $('[data-life-mala]').textContent = (s.malaCount || 0).toLocaleString('ko-KR');
    };
    const pulse = (cls) => {
      mala.classList.remove(cls);
      void mala.offsetWidth;
      mala.classList.add(cls);
    };
    let calmT = 0;
    const bead = () => {
      // 너무 빠르면 main.js 가 세지 않는다 (광클릭으로 염주가 돌지 않게)
      if (this.cb.onMala?.() === false) {
        pulse('is-resist');
        breath.textContent = '천천히, 한 알에 한 숨';
        clearTimeout(calmT);
        calmT = this._later(() => (breath.textContent = '한 알에 한 숨'), 1600);
        return;
      }
      const t = this._todayCounts();
      t.mala += 1;
      rot -= 360 / MALA_BEADS;
      render();
      pulse('is-tick');
      if (t.mala % MALA_BEADS === 0) pulse('is-loop');
      if (t.mala % 108 === 0) {
        pulse('is-complete');
        this._sfx('playChukbi');
        this._flash($('[data-mala-live]'), '백팔 염주 한 바퀴를 마쳤습니다.');
      }
    };

    let sx = 0;
    let sy = 0;
    let swiped = false;
    this._on(mala, 'pointerdown', (e) => {
      sx = e.clientX;
      sy = e.clientY;
      swiped = false;
    });
    this._on(mala, 'pointerup', (e) => {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 28) {
        swiped = true;
        bead();
      }
    });
    this._on(mala, 'click', () => {
      if (swiped) swiped = false;
      else bead();
    });
    this._on(document, 'keydown', (e) => {
      if ((e.code !== 'Space' && e.key !== '3') || e.repeat) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.code === 'Space' && e.target.closest?.('button')) return; // 단추 위 스페이스는 그 단추가 누른다 (두 번 세지 않게)
      e.preventDefault();
      e.stopPropagation();
      bead();
    });

    render();
    mala.setAttribute('data-autofocus', '');
    return { refresh: render };
  }

  /* ═════════ 6. 사경 (wide) ═════════ */
  _sutra(payload) {
    const found = SUTRA_VERSES.findIndex((v) => v.id === payload.verseId);
    let idx = found >= 0 ? found : this._sutraIdx;
    const groups = [...new Set(SUTRA_VERSES.map((v) => v.group))];
    const chipLabel = (v, i) => (v.group === '반야심경' ? `${i + 1} · ${v.title}` : v.title.split(' · ').pop());
    const root = this._root(`
      <div class="sutra-picker">
        ${groups
          .map(
            (g) => `<div class="sutra-group"><span class="sutra-group-label">${esc(g)}</span><div class="sutra-chips" role="tablist" aria-label="${esc(g)}">
              ${SUTRA_VERSES.map((v, i) => [v, i])
                .filter(([v]) => v.group === g)
                .map(([v], k) => `<button type="button" role="tab" class="m-chip" data-verse="${SUTRA_VERSES.indexOf(v)}">${esc(chipLabel(v, k))}</button>`)
                .join('')}
            </div></div>`
          )
          .join('')}
      </div>
      <article class="sutra-sheet" data-sheet></article>
      <div class="sutra-write">
        <label class="sr-only" for="sutra-input">따라 쓰기</label>
        <textarea id="sutra-input" class="sutra-input" rows="1" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
          placeholder="여기에 한 글자씩 따라 적어 보세요"></textarea>
        <div class="sutra-status"><span class="sutra-progress" data-progress></span><span class="sutra-msg" data-msg aria-live="polite"></span>
          <button type="button" class="m-btn primary small" data-act="next" hidden>다음 구절</button></div>
      </div>`);

    const sheet = root.querySelector('[data-sheet]');
    const ta = root.querySelector('#sutra-input');
    const progress = root.querySelector('[data-progress]');
    const msg = root.querySelector('[data-msg]');
    const nextBtn = root.querySelector('[data-act="next"]');
    let verse;
    let cells = [];
    let target = [];
    let composing = false;
    let compData = '';
    let done = false;
    let lastOk = 0;
    let lastBrush = 0;

    const load = (i) => {
      idx = (i + SUTRA_VERSES.length) % SUTRA_VERSES.length;
      this._sutraIdx = idx;
      verse = SUTRA_VERSES[idx];
      done = false;
      lastOk = 0;
      composing = false;
      compData = '';
      root.querySelectorAll('[data-verse]').forEach((b) => {
        b.setAttribute('aria-selected', String(Number(b.dataset.verse) === idx));
        b.classList.toggle('is-done', this._sutraDone.has(SUTRA_VERSES[b.dataset.verse].id));
      });
      const heartNo = verse.group === '반야심경' ? SUTRA_VERSES.filter((v) => v.group === '반야심경').indexOf(verse) + 1 : 0;
      let k = 0;
      const grid = [...verse.text.normalize('NFC')]
        .map((ch) => {
          if (/\s/.test(ch)) return '<span class="wg-cell is-space"></span>';
          if (!isSig(ch)) return `<span class="wg-cell is-punct"><span class="wg-ghost">${esc(ch)}</span></span>`;
          return `<span class="wg-cell" data-k="${k++}"><span class="wg-ghost">${esc(ch)}</span><span class="wg-ink"></span></span>`;
        })
        .join('');
      sheet.innerHTML = `
        <header class="sutra-head">
          <p class="sutra-source">${heartNo ? `마하반야바라밀다심경 · ${heartNo} / 9` : esc(verse.group)}</p>
          <h3 class="sutra-title">${esc(verse.title.split(' · ').pop())}</h3>
          <p class="sutra-hanja${verse.script === 'pali' ? ' is-pali' : ''}" ${verse.script === 'pali' ? 'lang="pi"' : 'lang="zh-Hant"'}>
            <span class="sutra-hanja-label">${verse.script === 'pali' ? '빠알리 원문' : '한문'}</span>${esc(verse.hanja)}</p>
        </header>
        <div class="wongoji" aria-hidden="true">${grid}</div>
        <p class="sr-only">따라 쓸 구절: ${esc(verse.text)}</p>
        <p class="sutra-meaning">${esc(verse.meaning)}</p>
        <div class="sutra-seal" data-seal hidden aria-hidden="true"><span>清蓮<br>寫經</span></div>`;
      cells = [...sheet.querySelectorAll('[data-k]')];
      target = [...verse.text.normalize('NFC')].filter(isSig);
      ta.value = '';
      ta.readOnly = false;
      nextBtn.hidden = true;
      msg.textContent = '';
      update();
    };

    const read = () => {
      if (!composing) return { committed: ta.value, pending: '' };
      return splitComposition(ta.value, compData, ta.selectionEnd);
    };

    const update = () => {
      const { committed, pending } = read();
      const r = traceCompare(verse.text, committed);
      const pend = [...(pending || r.tail)].pop() || '';
      const at = r.typed.length;
      cells.forEach((cell, k) => {
        const m = r.marks[k];
        let state = m === 'ok' ? 'ok' : m === 'bad' ? 'bad' : '';
        let ink = m === 'ok' ? target[k] : m === 'bad' ? r.typed[k] : '';
        if (!state && k === at) {
          state = pend ? 'pending' : 'next';
          ink = pend;
        }
        if (cell.dataset.state === state && cell.lastChild.textContent === ink) return;
        cell.dataset.state = state;
        cell.className = `wg-cell${state ? ` is-${state}` : ''}`;
        cell.lastChild.textContent = ink;
      });
      progress.textContent = `${r.ok} / ${r.total}`;
      if (r.ok > lastOk) {
        const now = performance.now();
        if (now - lastBrush > 140) {
          this._sfx('playBrushStroke');
          lastBrush = now;
        }
      }
      lastOk = r.ok;
      if (r.complete && !done) complete();
    };

    const complete = () => {
      done = true;
      ta.readOnly = true;
      this._sutraDone.add(verse.id);
      root.querySelector(`[data-verse="${idx}"]`)?.classList.add('is-done');
      const seal = sheet.querySelector('[data-seal]');
      seal.hidden = false;
      seal.classList.add('is-stamped');
      // 낙관이 입력란 뒤에 가려지지 않게 끝까지 내린다
      this.body.scrollTo({ top: this.body.scrollHeight, behavior: reduceMotion() ? 'auto' : 'smooth' });
      this.cb.onSutraComplete?.(verse.id);
      msg.textContent = '한 구절을 마쳤습니다. 이 공덕을 모두에게 회향합니다.';
      nextBtn.textContent = idx === SUTRA_VERSES.length - 1 ? '처음 구절로' : '다음 구절';
      nextBtn.hidden = false;
      nextBtn.focus({ preventScroll: true });
    };

    this._on(ta, 'compositionstart', () => {
      composing = true;
      compData = '';
    });
    this._on(ta, 'compositionupdate', (e) => (compData = e.data || ''));
    this._on(ta, 'compositionend', () => {
      composing = false;
      compData = '';
      update();
    });
    this._on(ta, 'input', (e) => {
      if (e.isComposing) {
        composing = true;
        if (typeof e.data === 'string') compData = e.data;
      } else if (!composing) compData = '';
      update();
    });
    this._on(ta, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) e.preventDefault();
    });
    this._on(root, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.verse != null) {
        load(Number(b.dataset.verse));
        this._sfx('playPaperRustle');
        ta.focus({ preventScroll: true });
      } else if (b.dataset.act === 'next') {
        load(idx + 1);
        this._sfx('playPaperRustle');
        ta.focus({ preventScroll: true });
      }
    });

    load(idx);
    root.querySelector(`[data-verse="${idx}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    return {
      reopen: (p) => {
        const j = SUTRA_VERSES.findIndex((v) => v.id === p.verseId);
        if (j >= 0) load(j);
      }
    };
  }

  /* ═════════ 7. 심검당 차담 — 찻상을 사이에 두고 스님과 마주 앉은 장면 ═════════
   * main.js 가 HUD 를 거두고 카메라를 내 어깨 너머 스님 쪽으로 고정한다 (body.tea-scene).
   * 아래쪽 대사 상자: 초상 + 이름 + 한 자씩 나오는 말(누르면 다 보임) + 스님 목소리(Web Speech).
   * 내 차례: 예상 응답 셋(데스크톱은 1·2·3) 또는 「직접 말하기」(입력칸이 자판 바로 위에 붙는다). */
  _tea() {
    const token = this._token;
    const hist = this._teaHistory;
    let voiceOn = this.store.state.settings.teaVoice !== false;
    let deck = null; // 죽비 층의 카드 한 벌 (한 번 만들어 다시 뽑기에 쓴다)
    const root = this._root(`
      <div class="tea-box" data-box>
        <div class="tea-face" aria-hidden="true">${MONK_FACE}</div>
        <div class="tea-main">
          <div class="tea-head">
            <span class="tea-name">청연 선사</span>
            <span class="tea-tools">
              <button type="button" class="tea-tool" data-act="voice" aria-pressed="${voiceOn}" aria-label="스님 목소리">${icon('sound')}</button>
              <button type="button" class="tea-tool" data-act="card" aria-label="오늘의 죽비 뽑기">${icon('dharma_card')}</button>
              <button type="button" class="tea-tool" data-act="leave" aria-label="찻자리에서 일어나기">${icon('close')}</button>
            </span>
          </div>
          <!-- 위기일 때는 대사보다 먼저, 스크롤 없이 보이게 -->
          <div class="tea-help" data-help hidden>
            <a href="tel:109">자살예방상담전화 <b>109</b></a><span>24시간, 언제든 전화할 수 있습니다</span>
            <span class="tea-help-sub">지금 위험한 상황이라면 <a href="tel:119">119</a></span>
          </div>
          <p class="tea-you" data-you hidden></p>
          <button type="button" class="tea-say" data-say aria-label="스님 말 끝까지 보기"><span class="tea-line" data-line aria-hidden="true"></span></button>
          <p class="sr-only" data-live aria-live="polite"></p>
          <p class="tea-verse" data-verse hidden></p>
          <p class="tea-ai" data-ai></p>
        </div>
      </div>
      <div class="tea-replies" data-replies role="group" aria-label="스님께 건넬 말"></div>
      <form class="tea-compose" data-compose hidden>
        <label class="sr-only" for="tea-input">스님께 건넬 말</label>
        <input id="tea-input" type="text" maxlength="${TEA_MAX}" autocomplete="off" enterkeyhint="send" placeholder="스님께 건넬 말을 적어 보세요" />
        <button type="submit" class="m-btn primary">건네기</button>
        <button type="button" class="tea-tool" data-act="cancel" aria-label="직접 말하기 닫기">${icon('close')}</button>
      </form>
      <div class="tea-jukbi" data-jukbi hidden role="dialog" aria-modal="true" aria-label="스님이 건넨 죽비">
        <div class="tea-jukbi-panel">
          <div class="tea-jukbi-head">
            <span class="tea-jukbi-face" aria-hidden="true">${MONK_FACE}</span>
            <p class="tea-jukbi-line"><b>청연 선사</b>${esc(TEA_LINES.card)}</p>
            <button type="button" class="tea-jukbi-x" data-act="jukbi-close" aria-label="찻자리로 돌아가기">${icon('close')}</button>
          </div>
          <div class="tea-jukbi-deck" data-jukbi-deck></div>
          <button type="button" class="m-link tea-jukbi-back" data-act="jukbi-close">찻자리로 돌아가기</button>
        </div>
      </div>`);
    root.classList.add('tea');
    const $ = (sel) => root.querySelector(sel);
    const lineEl = $('[data-line]');
    const boxEl = $('[data-box]');
    const repliesEl = $('[data-replies]');
    const compose = $('[data-compose]');
    const input = $('#tea-input');
    const alive = () => token === this._token && this._type === 'tea_chat';
    let typing = null; // { chars, i, opt }
    let busy = false;
    let suggestions = [];
    let aiShown = null;

    // 다음 차담을 위한 스님의 짧은 메모 — 이 브라우저에만 (설정에 함께 저장, 기록 내보내기에도 담긴다)
    const memory = () => this.store.state.settings.teaMemory || '';
    let leftShown;
    const setAi = (ai, left) => {
      aiShown = !!ai;
      leftShown = left;
      const el = $('[data-ai]');
      const head = ai ? `차담 스님은 AI 입니다${Number.isFinite(left) && left <= 3 ? ` · 오늘 ${left}번 남음` : ''}` : '미리 적어 둔 말로 답합니다';
      el.innerHTML = `<span>${esc(head)}</span>${memory() ? '<span class="tea-mem"> · 지난 이야기를 기억합니다 <button type="button" class="tea-forget" data-act="forget">잊게 하기</button></span>' : ''}`;
      el.classList.toggle('is-ai', !!ai);
    };

    /* 스님 목소리 — 미리 녹음해 둔 문장만 (Typecast 권일). AI 가 그때 지은 답은 글로만 (브라우저 음성 합성은 쓰지 않는다) */
    const speak = (text, onEnd) => this._voice(alive() ? text : '', { onEnd });

    const renderReplies = (list) => {
      suggestions = (list || []).slice(0, 3);
      const pad = mq('(hover: hover) and (pointer: fine)');
      repliesEl.innerHTML =
        suggestions.map((t, i) => `<button type="button" class="tea-reply" data-pick="${i}">${pad ? `<kbd>${i + 1}</kbd>` : ''}<span>${esc(t)}</span></button>`).join('') +
        `<button type="button" class="tea-reply is-own" data-act="own"><span>직접 말하기</span></button>`;
      repliesEl.hidden = false;
    };

    const finish = () => {
      if (!typing) return;
      const { chars, opt } = typing;
      typing = null;
      lineEl.textContent = chars.join('');
      root.classList.remove('is-typing');
      const verse = $('[data-verse]');
      verse.textContent = opt.verse || '';
      verse.hidden = !opt.verse;
      if (opt.card) opt.card();
      renderReplies(opt.suggestions);
    };
    const tick = () => {
      if (!typing || !alive()) return;
      typing.i += 1;
      lineEl.textContent = typing.chars.slice(0, typing.i).join('');
      if (!typing.opt.crisis) boxEl.scrollTop = boxEl.scrollHeight; // 긴 말은 쓰이는 줄을 따라간다 (위기면 109 가 위에 남게 두고)
      if (typing.i >= typing.chars.length) return finish();
      this._later(tick, TYPE_MS);
    };
    /** 스님이 말한다: 한 자씩, 다 나오면 구절·109·예상 응답 */
    const say = (line, opt = {}) => {
      root.classList.remove('is-thinking');
      root.classList.add('is-typing');
      $('[data-verse]').hidden = true;
      $('[data-help]').hidden = !opt.crisis;
      repliesEl.hidden = true;
      boxEl.scrollTop = 0;
      $('[data-live]').textContent = line;
      speak(line, opt.onVoiceEnd);
      typing = { chars: [...line], i: 0, opt };
      if (reduceMotion()) finish();
      else tick();
    };
    const showYou = (text) => {
      const you = $('[data-you]');
      you.textContent = text || '';
      you.hidden = !text;
    };

    const send = async (raw) => {
      const text = String(raw || '').trim();
      if (!text || busy) return;
      busy = true;
      closeCompose(false);
      speak('');
      showYou(text);
      root.classList.add('is-thinking');
      lineEl.textContent = '';
      repliesEl.hidden = true;
      $('[data-verse]').hidden = true;
      $('[data-help]').hidden = true;
      const prior = hist.slice();
      hist.push({ role: 'user', text });
      const started = performance.now();
      const res = await generateMonkResponse(text, prior, { name: this.store.profile.dharmaName, clientId: this.store.profileId, memory: memory() });
      if (res.memory) this.store.setSetting('teaMemory', res.memory);
      const cooled = res.limited && this._teaCooled !== kstDateString();
      if (cooled) this._teaCooled = kstDateString();
      const reply = cooled ? COOLED_LINE : res.reply;
      // 창을 닫아도 대화가 끊기지 않게 기록 먼저 (메모리에만)
      hist.push({ role: 'monk', text: reply, verse: cooled ? '' : res.verse, crisis: !!res.crisis, suggestions: res.suggestions });
      if (hist.length > 60) hist.splice(0, hist.length - 60);
      if (!res.blocked) this.cb.onTeaTurn?.();
      // 미리 적어 둔 답은 곧바로 나오니, 말을 고르는 짧은 틈을 둔다 (AI 는 이미 기다렸다)
      const think = res.ai ? 0 : Math.min(900 + reply.length * 6, 1800) - (performance.now() - started);
      if (think > 0) await this._wait(think);
      if (!alive()) return;
      busy = false;
      if (res.ai || aiShown !== null) setAi(res.ai, res.left);
      say(reply, { verse: cooled ? '' : res.verse, crisis: res.crisis, suggestions: res.suggestions });
    };

    /* 직접 말하기: 입력칸을 자판 바로 위에 (visualViewport 가 자판 높이만큼 줄어든 것을 본다) */
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const fitKeyboard = () => {
      if (!vv) return;
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty('--kb', `${kb}px`);
      root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    };
    if (vv) {
      this._on(vv, 'resize', fitKeyboard);
      this._on(vv, 'scroll', fitKeyboard);
    }
    const openCompose = () => {
      if (busy) return;
      compose.hidden = false;
      repliesEl.hidden = true;
      root.classList.add('is-composing');
      fitKeyboard();
      input.focus({ preventScroll: true });
    };
    function closeCompose(showReplies = true) {
      compose.hidden = true;
      root.classList.remove('is-composing');
      input.value = '';
      input.blur();
      root.style.removeProperty('--kb');
      if (showReplies && !typing && !busy) repliesEl.hidden = false;
    }

    /* 죽비: 대사 상자를 잠시 거두고 가운데 큰 카드 층으로 (차담 창은 그대로 — 닫으면 일어서고 끝인사까지 하므로).
     * 뒤집히면 스님이 구절을 읽는다. Esc·뒤로가기·「찻자리로 돌아가기」로 대화로 돌아온다 */
    // 창(.modal-window)에는 등장 애니메이션의 변환이 남아 있어 그 안의 fixed 는 창에 갇힌다 → 덮개 바로 아래로 옮긴다
    const jukbi = $('[data-jukbi]');
    this.overlay.appendChild(jukbi);
    this._on(jukbi, 'click', (e) => e.target.closest('[data-act="jukbi-close"]') && closeJukbi());
    const openJukbi = () => {
      if (busy || !jukbi.hidden) return;
      if (typing) finish();
      if (!compose.hidden) closeCompose();
      speak('');
      jukbi.hidden = false;
      root.classList.add('is-jukbi');
      deck ||= this._deck(jukbi.querySelector('[data-jukbi-deck]'), false);
      this._later(() => alive() && !jukbi.hidden && deck.draw(), reduceMotion() ? 0 : 350);
      jukbi.querySelector('.tea-jukbi-x').focus({ preventScroll: true });
    };
    const closeJukbi = () => {
      if (jukbi.hidden) return false;
      jukbi.hidden = true;
      root.classList.remove('is-jukbi');
      this._voice('');
      root.querySelector('[data-act="card"]')?.focus({ preventScroll: true });
      return true;
    };

    this._on(compose, 'submit', (e) => {
      e.preventDefault();
      send(input.value);
    });
    this._on(root, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.pick) return send(suggestions[Number(b.dataset.pick)]);
      const act = b.dataset.act;
      if (b.matches('[data-say]')) finish();
      else if (act === 'own') openCompose();
      else if (act === 'cancel') closeCompose();
      else if (act === 'card') openJukbi();
      else if (act === 'leave') this.close();
      else if (act === 'forget') {
        this.store.setSetting('teaMemory', '');
        setAi(aiShown, leftShown);
      } else if (act === 'voice') {
        voiceOn = !voiceOn;
        b.setAttribute('aria-pressed', String(voiceOn));
        this.store.setSetting?.('teaVoice', voiceOn);
        speak(voiceOn ? (typing ? typing.chars.join('') : lineEl.textContent) : '');
      }
    });
    // 데스크톱: 1·2·3 으로 고르고, Enter·Space 로 말 끝까지 (산사 몸짓 단축키는 main.js 가 차담 중 쉬게 한다)
    this._on(document, 'keydown', (e) => {
      if (!alive() || !jukbi.hidden || isTextField(e.target) || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[1-3]$/.test(e.key)) {
        e.preventDefault();
        if (typing) finish();
        else if (!busy && compose.hidden && suggestions[e.key - 1]) send(suggestions[e.key - 1]);
      } else if ((e.key === 'Enter' || e.key === ' ') && typing && !e.target.closest?.('button')) {
        e.preventDefault();
        finish();
      }
    });

    // 맞이하기
    monkStatus().then((st) => alive() && aiShown === null && setAi(st.ai));
    const last = [...hist].reverse().find((h) => h.role === 'monk');
    if (!hist.length) {
      const hello = TEA_LINES.hello; // 이름은 넣지 않는다 — 미리 녹음한 목소리와 같은 문장
      hist.push({ role: 'monk', text: hello, suggestions: OPENING_SUGGESTIONS });
      this._later(() => alive() && say(hello, { suggestions: OPENING_SUGGESTIONS }), 500);
    } else {
      this._later(() => alive() && say(TEA_LINES.back, { suggestions: last?.suggestions || OPENING_SUGGESTIONS }), 400);
    }
    return {
      reopen: () => (compose.hidden ? root.querySelector('.tea-reply')?.focus({ preventScroll: true }) : input.focus({ preventScroll: true })),
      back: closeJukbi,
      destroy: () => {
        jukbi.remove();
        this._voice(TEA_LINES.bye); // 끝인사 — 창이 닫혀도 소리는 산사에 남는다
        this.cb.onTeaLeave?.();
      }
    };
  }

  /* ═════════ 8. 오늘의 죽비 ═════════ */
  /* ───── 예불 듣기 ───── */
  _yebul() {
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const root = this._root(`
      <ul class="yebul-list">${YEBUL_TRACKS.map((t) => `
        <li>
          <button type="button" class="yebul-item" data-id="${esc(t.id)}" aria-label="${esc(t.title)} 듣기">
            <span class="yebul-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg></span>
            <span class="yebul-meta">
              <b>${esc(t.title)}</b>
              <small>${esc(t.place)} · ${esc(t.note)}</small>
            </span>
            <span class="yebul-time">${fmt(t.sec)}</span>
          </button>
        </li>`).join('')}
      </ul>
      <p class="m-hint">고르면 화면이 바뀌어 좌복에 홀로 앉아 처음부터 끝까지 듣습니다. Esc 나 「일어나기」로 돌아옵니다.</p>
      <p class="m-hint"><button type="button" class="m-link" data-nature>자연의 소리 듣기 →</button></p>`);
    this._on(root, 'click', (e) => {
      if (e.target.closest('[data-nature]')) return this.open('nature');
      const b = e.target.closest('.yebul-item');
      if (b) this.cb.onYebul?.(YEBUL_TRACKS.find((x) => x.id === b.dataset.id));
    });
    return {};
  }

  /* ───── 자연의 소리 듣기: 장면 고르기 + 잠자기 타이머 ───── */
  _nature() {
    const cur = () => this.store.state.settings.natureSleep ?? 30;
    const label = (m) => (m ? `${m}분` : '끄기');
    const root = this._root(`
      <div class="sutra-group nature-sleep"><span class="sutra-group-label">잠자기 타이머</span>
        <div class="sutra-chips" role="tablist" aria-label="잠자기 타이머">${SLEEP_MINUTES.map((m) => `<button type="button" role="tab" class="m-chip" data-sleep="${m}" aria-selected="${m === cur()}">${label(m)}</button>`).join('')}</div>
      </div>
      <ul class="yebul-list">${NATURE_PRESETS.map((p) => `
        <li>
          <button type="button" class="yebul-item" data-id="${esc(p.id)}" aria-label="${esc(p.title)} 듣기">
            <span class="yebul-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg></span>
            <span class="yebul-meta"><b>${esc(p.title)}</b><small>${esc(p.note)}</small></span>
          </button>
        </li>`).join('')}
      </ul>
      <p class="m-hint">고르면 그 자리에 앉아 듣습니다. 타이머가 다 되면 소리가 천천히 잦아들며 멈춥니다. Esc 나 「일어나기」로 돌아옵니다.</p>
      <p class="m-hint"><button type="button" class="m-link" data-yebul>예불 듣기 →</button></p>`);
    this._on(root, 'click', (e) => {
      const s = e.target.closest('[data-sleep]');
      if (s) {
        this.store.setSetting('natureSleep', Number(s.dataset.sleep));
        root.querySelectorAll('[data-sleep]').forEach((b) => b.setAttribute('aria-selected', String(b === s)));
        return;
      }
      if (e.target.closest('[data-yebul]')) return this.open('yebul');
      const b = e.target.closest('.yebul-item');
      if (b) this.cb.onYebul?.(NATURE_PRESETS.find((x) => x.id === b.dataset.id));
    });
    return {};
  }

  _card() {
    const root = this._root('<div data-deck></div>');
    const deck = this._deck(root.querySelector('[data-deck]'), false);
    return { refresh: deck.syncKept };
  }

  /** 죽비 카드 한 벌 — 모달과 차담에서 함께 쓴다 */
  /** autoVoice: 구절이 뒤집히면 스님이 바로 읽는다 (차담에서는 건네는 말을 마친 뒤 차담 쪽이 부른다) */
  _deck(host, compact, { autoVoice = true } = {}) {
    const wrap = document.createElement('div');
    wrap.className = `jukbi${compact ? ' is-compact' : ''}`;
    wrap.innerHTML = `
      <div class="jukbi-stage">
        <button type="button" class="jukbi-card" data-card aria-label="죽비 뽑기">
          <span class="jukbi-face jukbi-back" aria-hidden="true"><span class="jukbi-mark">竹篦</span><span class="jukbi-tap">눌러서 한 구절 뽑기</span></span>
          <span class="jukbi-face jukbi-front" data-front></span>
        </button>
      </div>
      <div class="m-actions">
        <button type="button" class="m-btn primary" data-act="draw">${compact ? '다른 구절' : '죽비 뽑기'}</button>
        <button type="button" class="m-btn" data-act="keep" hidden>간직하기</button>
        <button type="button" class="m-btn jk-listen" data-act="listen" hidden aria-label="스님 목소리로 듣기">${icon('sound')}<span>듣기</span></button>
      </div>
      <p class="m-hint jukbi-kept" data-kept aria-live="polite"></p>`;
    host.appendChild(wrap);
    const card = wrap.querySelector('[data-card]');
    const front = wrap.querySelector('[data-front]');
    const drawBtn = wrap.querySelector('[data-act="draw"]');
    const keepBtn = wrap.querySelector('[data-act="keep"]');
    const listenBtn = wrap.querySelector('[data-act="listen"]');
    const keptEl = wrap.querySelector('[data-kept]');
    let cur = null;
    let flipped = false;
    let busy = false;

    const keptIds = () => new Set((this.store.profile.dharmaCards || []).map((c) => c.id).filter((id) => CARD_IDS.has(id)));
    const syncKept = () => {
      const n = keptIds().size;
      keptEl.textContent = n ? `간직한 죽비 ${n}장` : '마음에 닿는 구절은 간직해 둘 수 있습니다.';
      if (!cur) return;
      const has = keptIds().has(cur.id);
      keepBtn.disabled = has;
      keepBtn.textContent = has ? '간직했습니다' : '간직하기';
    };
    const reveal = (c) => {
      cur = c;
      front.innerHTML = `
        <span class="jk-source">${esc(c.source)}</span>
        ${c.original ? `<span class="jk-original" lang="zh-Hant">${esc(c.original)}</span>` : ''}
        <span class="jk-quote">${esc(c.quote)}</span>
        <span class="jk-reflection">${esc(c.reflection)}</span>
        <span class="jk-seal" aria-hidden="true">竹篦</span>`;
      card.classList.add('is-flipped');
      card.setAttribute('aria-label', `${c.source}. ${c.quote}`);
      flipped = true;
      this._sfx('playChukbi');
      drawBtn.textContent = '다시 뽑기';
      keepBtn.hidden = false;
      listenBtn.hidden = false;
      if (autoVoice) this._voice(cardVoiceText(c));
      syncKept();
      this._later(() => (busy = false), reduceMotion() ? 0 : 650);
    };
    const draw = () => {
      if (busy) return;
      busy = true;
      const pool = DHARMA_CARDS.filter((c) => c.id !== cur?.id);
      const next = pool[Math.floor(Math.random() * pool.length)];
      if (flipped) {
        this._voice(''); // 앞 구절을 읽던 중이면 멈춘다
        card.classList.remove('is-flipped');
        flipped = false;
        this._later(() => reveal(next), reduceMotion() ? 0 : 560);
      } else reveal(next);
    };
    const keep = () => {
      if (!cur) return;
      this.cb.onDharmaCard?.(cur);
      syncKept();
      if (keptIds().has(cur.id)) keptEl.textContent = `마음에 간직했습니다 · 간직한 죽비 ${keptIds().size}장`;
    };
    this._on(wrap, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b === card) !flipped && draw();
      else if (b.dataset.act === 'draw') draw();
      else if (b.dataset.act === 'keep') keep();
      else if (b.dataset.act === 'listen' && cur) this._voice(cardVoiceText(cur), { force: true });
    });
    syncKept();
    return { draw, syncKept, speak: () => cur && this._voice(cardVoiceText(cur)) };
  }

  /* ═════════ 9. 수행 기록 ═════════ */
  _profile() {
    const root = this._root('');
    const render = () => {
      const p = this.store.profile;
      const s = this.store.stats;
      const att = p.attendance || { streak: 0, totalDays: 0 };
      const has = (id) => (p.unlockedItems || []).includes(id);
      const bar = (v, max) => `<span class="pf-bar"><span style="width:${Math.min(100, (v / max) * 100).toFixed(1)}%"></span></span>`;
      const rewards = [
        {
          id: 'wooden_mala',
          name: '자단목 단주',
          desc: '손목에 채워지는 붉은 나무 단주',
          how: '큰절 21배, 또는 염주 108알',
          progress: `절 ${Math.min(s.bowCount, 21)} / 21 · 염주 ${Math.min(s.malaCount, 108)} / 108`,
          ratio: Math.max(s.bowCount / 21, s.malaCount / 108)
        },
        {
          id: 'hand_lantern',
          name: '연꽃 손연등',
          desc: '밤 산책길에 곁을 비추는 작은 손연등',
          how: '소원 연등 하나, 또는 사경 한 구절',
          progress: `연등 ${Math.min(s.lanternCount, 1)} / 1 · 사경 ${Math.min(s.sutraCopiedCount, 1)} / 1`,
          ratio: Math.max(s.lanternCount, s.sutraCopiedCount)
        },
        {
          id: 'jade_mala',
          name: '백옥 단주',
          desc: '꾸준히 찾아온 걸음에 채워지는 흰 옥 단주',
          how: '일곱 날 이어서 산사에 들르기',
          progress: `${Math.min(att.streak, 7)} / 7일`,
          ratio: att.streak / 7
        }
      ];
      const kept = (p.dharmaCards || []).map((k) => DHARMA_CARDS.find((c) => c.id === k.id)).filter(Boolean);
      root.innerHTML = `
        <section class="pf-name">
          <p class="m-label">나의 법명</p>
          <p class="pf-dharma" data-name>${esc(p.dharmaName)}</p>
          <div class="pf-name-acts">
            <button type="button" class="m-link" data-act="rename">법명 다시 받기</button>
            <button type="button" class="m-link" data-act="custom-name" aria-expanded="false">직접 짓기</button>
          </div>
          <form class="name-form pf-name-form hidden" data-name-form autocomplete="off">
            <input type="text" data-name-input maxlength="${NAME_MAX + 4}" placeholder="${esc(NAME_PLACEHOLDER)}" aria-label="법명 직접 짓기" enterkeyhint="done" />
            <button type="submit" class="name-ok">정하기</button>
            <p class="name-hint" data-hint aria-live="polite"></p>
          </form>
        </section>
        <section class="pf-att">
          <div><b>${att.streak || 0}</b><span>일째 이어 오는 걸음</span></div>
          <div><b>${att.totalDays || 0}</b><span>일 산사에 머묾</span></div>
        </section>
        <h3 class="m-sub">쌓인 수행</h3>
        <dl class="pf-stats">
          ${STAT_LABELS.map(([k, label, unit]) => `<div><dt>${label}</dt><dd><b>${(s[k] || 0).toLocaleString('ko-KR')}</b>${unit}</dd></div>`).join('')}
        </dl>
        <h3 class="m-sub">조용한 흔적</h3>
        <p class="m-hint pf-note">순위도 경쟁도 없습니다. 수행이 쌓이면 아바타에 조용히 나타납니다.</p>
        <ul class="pf-rewards">
          ${rewards
            .map(
              (r) => `<li class="pf-reward${has(r.id) ? ' is-on' : ''}">
                <span class="pf-reward-icon pf-${r.id}" aria-hidden="true"></span>
                <span class="pf-reward-body">
                  <span class="pf-reward-name">${r.name}${has(r.id) ? '<em>지니고 있습니다</em>' : ''}</span>
                  <span class="pf-reward-desc">${r.desc}</span>
                  ${has(r.id) ? '' : `<span class="pf-reward-how">${r.how}</span>${bar(r.ratio, 1)}<span class="pf-reward-progress">${r.progress}</span>`}
                </span></li>`
            )
            .join('')}
        </ul>
        <h3 class="m-sub">간직한 죽비 <small>${kept.length}장</small></h3>
        ${
          kept.length
            ? `<ul class="pf-cards">${kept
                .map(
                  (c) => `<li><span class="jk-quote">${esc(c.quote)}</span><span class="jk-source">${esc(c.source)}</span>
                    <button type="button" class="pf-listen" data-listen="${esc(c.id)}" aria-label="${esc(c.source)} — 스님 목소리로 듣기">${icon('sound')}</button></li>`
                )
                .join('')}</ul>`
            : '<p class="m-hint">후원 다실의 죽비에서 마음에 닿는 구절을 간직해 보세요.</p>'
        }
        <p class="m-hint pf-privacy">이 기록은 이 브라우저에만 남습니다. 다른 기기로 옮기거나 지켜 두려면 백업 파일로 내려받으세요.</p>
        <div class="pf-backup">
          <button type="button" class="m-btn" data-act="export">기록 내보내기</button>
          <button type="button" class="m-btn" data-act="import">기록 가져오기</button>
          <input type="file" accept="application/json,.json" data-import-file hidden />
        </div>
        <p class="m-live" data-backup-live aria-live="polite"></p>`;
    };
    const flash = (msg) => {
      const el = root.querySelector('[data-backup-live]');
      if (el) el.textContent = msg;
    };
    this._on(root, 'input', (e) => {
      if (!e.target.matches('[data-name-input]')) return;
      const f = e.target.closest('[data-name-form]');
      const r = nameFeedback(e.target.value);
      f.querySelector('[data-hint]').textContent = r ? r.message : '';
      f.classList.toggle('is-bad', !!r && !r.ok);
    });
    this._on(root, 'submit', (e) => {
      const f = e.target.closest('[data-name-form]');
      if (!f) return;
      e.preventDefault();
      const input = f.querySelector('[data-name-input]');
      const r = nameFeedback(input.value);
      const res = r?.ok ? this.cb.onSetName?.(r.text) : r;
      if (!res || !res.ok) {
        f.querySelector('[data-hint]').textContent = res?.message || '';
        f.classList.add('is-bad');
        return input.focus();
      }
      this._sfx('playUIClick');
      render();
      root.querySelector('[data-name]')?.classList.add('is-new');
    });
    this._on(root, 'change', async (e) => {
      if (!e.target.matches('[data-import-file]')) return;
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!window.confirm('백업 파일의 기록으로 바꿉니다. 지금 이 브라우저의 기록은 백업 파일 내용으로 덮어씁니다. 계속할까요?')) return;
      const res = this.cb.onImport?.(await file.text());
      if (!res?.ok) return flash(res?.message || '가져오지 못했습니다');
      flash('기록을 가져왔습니다. 산문을 다시 엽니다…');
      setTimeout(() => location.reload(), 900);
    });
    this._on(root, 'click', (e) => {
      const listen = e.target.closest('[data-listen]');
      if (listen) {
        const c = DHARMA_CARDS.find((x) => x.id === listen.dataset.listen);
        if (c) this._voice(cardVoiceText(c), { force: true });
        return;
      }
      if (e.target.closest('[data-act="custom-name"]')) {
        const b = e.target.closest('[data-act="custom-name"]');
        const f = root.querySelector('[data-name-form]');
        const open = f.classList.toggle('hidden') === false;
        b.setAttribute('aria-expanded', String(open));
        if (open) f.querySelector('input').focus({ preventScroll: true });
        return;
      }
      if (e.target.closest('[data-act="export"]')) {
        const json = this.cb.onExport?.();
        if (!json) return;
        const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        a.download = `사운드템플-수행기록-${day}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        return flash('기록 파일을 내려받았습니다');
      }
      if (e.target.closest('[data-act="import"]')) return root.querySelector('[data-import-file]').click();
      if (!e.target.closest('[data-act="rename"]')) return;
      const name = this.cb.onRename?.();
      this._sfx('playUIClick');
      render();
      const el = root.querySelector('[data-name]');
      if (name && el) el.textContent = name;
      el?.classList.add('is-new');
      root.querySelector('[data-act="rename"]')?.focus({ preventScroll: true });
    });
    render();
    return { refresh: render };
  }

  /* ═════════ 10. 산사 안내 ═════════ */
  _help() {
    const keys = [
      ['1', '합장 반배'],
      ['2', '큰절'],
      ['3', '가부좌 · 염주'],
      ['4', '헌향 · 헌촉'],
      ['5', '탑돌이'],
      ['6', '차 마시기'],
      ['V', '3인칭 ↔ 1인칭 시점'],
      ['E', '가까이 있는 것과 마주하기']
    ];
    const zones = Object.values(ZONES)
      .map(
        (z) => `<li class="help-zone"><span class="help-zone-no">${z.index}</span><span>
          <b>${esc(z.name)}</b><span class="help-zone-sub">${esc(z.subtitle)}</span>
          <span class="help-zone-acts">${z.rituals.map((r) => esc(RITUALS[r]?.label || r)).join(' · ')}</span></span></li>`
      )
      .join('');
    this._root(`
      <section class="help-sec">
        <h3 class="m-sub">걷고 둘러보기</h3>
        <ul class="help-list">
          <li><span class="help-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd></span>걷기</li>
          <li><span class="help-keys">땅 누르기</span>그 자리까지 천천히 걸어갑니다</li>
          <li><span class="help-keys">좌복 누르기</span>고른 좌복에 가서 그냥 앉습니다 · 108배·염주는 서 있는 그 자리에서</li>
          <li><span class="help-keys">끌기</span>고개를 돌려 둘러보기</li>
          <li><span class="help-keys">휠 · 두 손가락</span>가까이, 멀리</li>
          <li><span class="help-keys">휴대폰</span>왼쪽 아래 조이스틱으로 걷기</li>
        </ul>
      </section>
      <section class="help-sec">
        <h3 class="m-sub">말없는 몸짓</h3>
        <ul class="help-keygrid">${keys.map(([k, v]) => `<li><kbd>${k}</kbd><span>${v}</span></li>`).join('')}</ul>
      </section>
      <section class="help-sec">
        <h3 class="m-sub">네 구역</h3>
        <ol class="help-zones">${zones}</ol>
      </section>
      <section class="help-sec">
        <h3 class="m-sub">산사의 예절</h3>
        <p class="help-p"><b>말을 걸지 않는 따뜻한 동석.</b> 이곳에는 채팅이 없습니다. 같은 시간에 머무는 도반들과는 합장 반배로 인사를 나누고,
          옆 방석에 나란히 앉아 각자의 수행을 지켜 줍니다. 대웅전 안은 온전한 침묵의 자리입니다.</p>
      </section>
      <section class="help-sec">
        <h3 class="m-sub">기록과 비밀</h3>
        <p class="help-p">법명, 쌓인 수행, 연등·기와·돌탑, 간직한 죽비는 <b>이 브라우저에만</b> 저장됩니다. 회원가입도, 서버 계정도 없습니다.</p>
        <p class="help-p"><b>번뇌 소각</b>에 적은 글은 어디에도 저장되거나 보내지지 않으며, 태우는 순간 화면에서도 사라집니다.</p>
        <p class="help-p"><b>차담</b>의 말은 AI 스님의 답을 받으려고 서버를 거쳐 AI 회사(OpenRouter 를 통해 Anthropic 등)에 전해집니다. 산사의 서버는 대화를 저장하지 않습니다. 다음 차담에서 이어 갈 수 있게 스님이 짧게 적은 메모 하나만 <b>이 브라우저에</b> 남고(기록 내보내기에도 담깁니다), 차담 창의 「잊게 하기」로 언제든 지울 수 있습니다. 기도와 고민은 광고에 쓰이지 않습니다.</p>
      </section>
      <p class="help-foot"><button type="button" class="m-link" data-act="credits">자료 출처</button></p>`);
    this._on(this.body, 'click', (e) => e.target.closest('[data-act="credits"]') && this.open('credits'));
    return {};
  }

  /* ═════════ 11. 자료 출처 ═════════ */
  /** 자료 출처: 분류(소리·3D 스캔…) 안에서 출처별 카드로 묶는다 — 머리에 라이선스·원본 사이트를 한 번, 안에는 쓰는 곳마다 원본 이름 */
  _credits() {
    const link = (url, text, title) => `<a href="${esc(url)}" target="_blank" rel="noopener"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</a>`;
    const card = (key, list) => {
      const s = CREDIT_SOURCES[key] || { name: key };
      const licenses = [...new Set(list.map((c) => c.license).filter(Boolean))];
      const rows = new Map(); // 쓰는 곳 → 원본들 (처음 나온 차례대로)
      for (const c of list) {
        const { author } = creditSource(c);
        // 화면에서만 읽기 쉽게: 묶음 이름에 있는 말을 떼고 밑줄은 띄어쓰기로 (원본 이름 그대로는 링크의 title 에)
        const shown = (s.strip && c.title.startsWith(s.strip) ? c.title.slice(s.strip.length) : c.title).replace(/_/g, ' ');
        const item = `<span class="cr-item">${link(c.url, shown, c.title)}${author ? ` <small>${esc(author)}</small>` : ''}</span>`;
        if (!rows.has(c.use)) rows.set(c.use, []);
        rows.get(c.use).push(item);
      }
      const site = [s.url ? link(s.url, s.site || s.url) : '', s.note ? esc(s.note) : '', `${list.length}건`].filter(Boolean).join(' · ');
      return `<article class="cr-src">
        <header class="cr-head">
          <b>${esc(s.name)}</b>
          ${licenses.map((l) => `<span class="cr-lic">${LICENSE_URLS[l] ? link(LICENSE_URLS[l], l) : esc(l)}</span>`).join('')}
        </header>
        <p class="cr-site">${site}</p>
        <dl class="cr-rows">${[...rows].map(([use, items]) => `<dt>${esc(use)}</dt><dd>${items.join('')}</dd>`).join('')}</dl>
      </article>`;
    };
    const groups = Object.entries(CREDITS)
      .filter(([, list]) => list.length)
      .map(([key, list]) => {
        const g = CREDIT_GROUPS[key] || { title: key };
        const bySource = new Map();
        for (const c of list) {
          const k = creditSource(c).key;
          if (!bySource.has(k)) bySource.set(k, []);
          bySource.get(k).push(c);
        }
        return `<section class="help-sec">
          <h3 class="m-sub">${esc(g.title)}</h3>
          ${g.note ? `<p class="help-p">${esc(g.note)}</p>` : ''}
          <div class="cr-list">${[...bySource].map(([k, l]) => card(k, l)).join('')}</div>
        </section>`;
      })
      .join('');
    this._root(groups);
    return {};
  }
}

/** 붓글씨 쪽지 줄바꿈 — 띄어쓰기에서 먼저 끊고, 긴 낱말은 글자 단위로 */
function wrapText(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue;
      if (ctx.measureText(line + word).width <= maxW) {
        line += word;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      line = '';
      if (/^\s+$/.test(word)) continue;
      for (const ch of word) {
        if (line && ctx.measureText(line + ch).width > maxW) {
          lines.push(line);
          line = ch;
        } else line += ch;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** 남이 공개한 글에만 붙는 작은 신고 단추 */
function reportBtn(kind, x) {
  return x.shared && !x.mine ? `<button type="button" class="m-report" data-report="${kind}" data-id="${esc(x.id)}" aria-label="이 글 신고하기">신고</button>` : '';
}

/* ───────── 선사 응답 ─────────
 * 서버 /api/monk (server/monk.js) 가 AI 로 답한다. API 키는 서버에만 있다.
 * 위기 신호는 서버에 묻기 전에 여기서 먼저 109 를 안내하고, 거름에 걸린 말은 보내지 않는다.
 * 서버가 없거나 끊기거나 오늘 몫을 다 쓰면 미리 적어 둔 대화 나무(localMonkResponse)로 잇는다.
 * memory: 지난 차담 메모 (이 브라우저에만 둔 것) — 보내면 스님이 이어서 기억한다.
 * 반환 { reply, suggestions[3], verse, crisis, ai, memory?, left?, limited?, blocked? } */
const MONK_WAIT_MS = 9000; // 서버가 7초(MONK_TIMEOUT_MS)에 끊고 알려 주니 그보다 조금 길게 — 실측 전 임시값
const monkEndpoint = () => (typeof window === 'undefined' ? null : window.TEMPLE_CONFIG?.monkChatEndpoint ?? `${LIVE_API}/monk`);

async function monkFetch(url, init, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    return { res, data: await res.json().catch(() => null) };
  } finally {
    clearTimeout(timer);
  }
}

/** 차담을 열 때: AI 스님이 지금 깨어 있는가 */
export async function monkStatus() {
  const url = monkEndpoint();
  if (!url) return { ai: false };
  try {
    const { res, data } = await monkFetch(url, {}, 4000);
    return res.ok && data ? { ai: !!data.ai } : { ai: false };
  } catch {
    return { ai: false };
  }
}

export async function generateMonkResponse(userMessage, history = [], { name, clientId, memory = '' } = {}) {
  const text = String(userMessage ?? '').replace(/\s+/g, ' ').trim().slice(0, TEA_MAX);
  const local = (extra) => ({ ...localMonkResponse(text, history), ai: false, ...extra });
  const blocked = (reason) => ({ reply: BLOCKED_REPLIES[reason] || BLOCKED_REPLIES.abuse, verse: '', suggestions: REST_SUGGESTIONS, crisis: false, ai: false, blocked: reason });
  if (isCrisisText(text)) return local();
  const v = checkText(text, { kind: 'chat', max: TEA_MAX });
  if (!v.ok) return blocked(v.reason);
  const url = monkEndpoint();
  if (url) {
    try {
      const body = { message: v.text, history: history.slice(-6).map((h) => ({ role: h.role, text: String(h.text || '').slice(0, 240) })), name, clientId, memory: String(memory || '').slice(0, 200) };
      const { res, data } = await monkFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, MONK_WAIT_MS);
      if (res.ok && typeof data?.reply === 'string' && data.reply.trim()) {
        const sug = Array.isArray(data.suggestions) ? data.suggestions.filter((x) => typeof x === 'string' && x.trim()).slice(0, 3) : [];
        return {
          reply: data.reply.trim().slice(0, 800),
          verse: typeof data.verse === 'string' ? data.verse.trim().slice(0, 300) : '',
          suggestions: sug.length === 3 ? sug : localMonkResponse(text, history).suggestions,
          crisis: !!data.crisis,
          ai: !!data.ai,
          memory: typeof data.memory === 'string' ? data.memory.trim().slice(0, 200) : '', // 빈 문자열 = 지난 메모 그대로
          left: Number.isFinite(data.left) ? data.left : undefined
        };
      }
      if (res.status === 422 && BLOCKED_REPLIES[data?.reason]) return blocked(data.reason);
      if (res.status === 429 && data?.reason === 'quota') return local({ limited: true });
    } catch (e) {
      console.warn('[tea] 차담 서버에 닿지 않아 미리 적어 둔 말로 이어갑니다');
    }
  }
  return local();
}
