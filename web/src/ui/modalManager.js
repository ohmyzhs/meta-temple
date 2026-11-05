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
import { SUTRA_VERSES, DHARMA_CARDS, localMonkResponse, isCrisisText } from '../data/dharmaTexts.js';
import { LANTERN_COLORS, ZONES, RITUALS } from '../data/templeData.js';
import { kstDateString } from '../core/state.js';

const VIEWS = {
  wish_lantern: { title: '소원 연등', hanja: '燃燈', sub: '마당 하늘에 작은 빛 하나를 걸어 둡니다.', render: '_lantern' },
  wish_tile: { title: '기와 불사', hanja: '瓦', sub: '검은 기와에 흰 붓으로, 오래 지킬 마음을 새깁니다.', render: '_tile' },
  stone_pagoda: { title: '소원 돌탑', hanja: '石塔', sub: '먼저 지나간 이들의 돌 위에 조약돌 하나를 얹습니다.', render: '_stone' },
  burn_worry: { title: '번뇌 소각', hanja: '燒', sub: '마음을 무겁게 하는 것을 적고, 불에 맡겨 보냅니다.', render: '_burn' },
  practice_108: { title: '108배 · 염주', hanja: '百八', sub: '숨에 맞추어, 천천히.', render: '_practice', variant: 'side' },
  sutra_copy: { title: '사경', hanja: '寫經', sub: '한 글자씩 따라 쓰며 흩어진 마음을 고릅니다.', render: '_sutra', variant: 'wide' },
  tea_chat: { title: '심검당 차담', hanja: '茶談', sub: '차 한 잔 사이에 두고, 편히 이야기하세요.', render: '_tea', variant: 'side' },
  dharma_card: { title: '오늘의 죽비', hanja: '竹篦', sub: '지금 내 걸음에 닿는 경전 한 구절.', render: '_card' },
  profile: { title: '수행 기록', hanja: '修行', sub: '견주지 않는, 나만의 조용한 흔적.', render: '_profile' },
  help: { title: '산사 안내', hanja: '案內', sub: '천천히 둘러보세요. 서두를 곳이 없습니다.', render: '_help' }
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
const BOW_CYCLE_MS = 4000; // docs/02 §3.3 — 108배 연속 모드 4초 주기
const MALA_BEADS = 27; // 27주 단주 네 바퀴 = 108

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
  let beads = '';
  for (let i = 0; i < MALA_BEADS; i++) {
    const a = ((-90 + (i * 360) / MALA_BEADS) * Math.PI) / 180;
    const x = (C + R * Math.cos(a)).toFixed(2);
    const y = (C + R * Math.sin(a)).toFixed(2);
    beads +=
      i === 0
        ? `<circle cx="${x}" cy="${y}" r="12.6" fill="url(#mala-guru)"/><circle cx="${x}" cy="${y}" r="3" fill="#8c2f22"/>`
        : `<circle cx="${x}" cy="${y}" r="9.6" fill="url(#mala-wood)"/>`;
  }
  return `<svg viewBox="0 0 240 240" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="mala-wood" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#d8a676"/><stop offset=".45" stop-color="#9a6136"/><stop offset="1" stop-color="#55301a"/></radialGradient>
      <radialGradient id="mala-guru" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#c98a6a"/><stop offset=".5" stop-color="#7c3a24"/><stop offset="1" stop-color="#3f1a10"/></radialGradient>
      <radialGradient id="mala-halo"><stop offset="0" stop-color="#e6c27a" stop-opacity=".75"/><stop offset="1" stop-color="#e6c27a" stop-opacity="0"/></radialGradient>
    </defs>
    <circle cx="${C}" cy="${C - R}" r="22" fill="url(#mala-halo)" class="mala-halo"/>
    <path class="mala-tick" d="M113 4 L127 4 L120 12 Z"/>
    <g class="mala-beads" data-beads>
      <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#8c2f22" stroke-width="1.3" opacity=".7"/>
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
          this.close();
        }
        e.stopPropagation();
        return;
      }
      if (isTextField(e.target)) e.stopPropagation();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.isComposing && this.isOpen && !isTextField(e.target)) this.close();
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
    this.overlay.classList.remove('is-side');
    this.win.className = 'modal-window';
    const back = this._returnFocus;
    this._returnFocus = null;
    if (back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
  }

  refresh() {
    if (this.isOpen) this._view?.refresh?.();
  }

  /* ───── 생명주기 ───── */
  /** next: 이어서 열릴 종류. side 에서 side 로 넘어갈 때는 onPracticeEnd 를 부르지 않는다 (main.js 가 이미 새로 앉혔다). */
  _teardown(next = null) {
    const prev = this._type;
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
      const res = this.cb.onAddLantern?.(wish, color);
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
            <p class="giwa-meta">${esc(t.author)}${t.mine ? ' · <em>나의 기와</em>' : ''}</p></li>`
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
      this.cb.onAddTile?.(wish);
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
    this._on(root, 'click', (e) => e.target.closest('[data-act="add"]') && add());
    renderGallery();
    return { refresh: renderGallery };
  }

  /* ═════════ 3. 소원 돌탑 ═════════ */
  _stone() {
    const root = this._root(`
      <div class="cairn">
        ${cairnSvg()}
        <p class="cairn-count">지금까지 <b data-total>0</b>개의 돌이 쌓였습니다</p>
      </div>
      <label class="m-label" for="stone-wish">한 줄 다짐 <small>서른 자 안으로</small></label>
      <div class="m-field">
        <input id="stone-wish" type="text" maxlength="30" autocomplete="off" placeholder="예) 천천히, 그러나 멈추지 않기" />
        <span class="m-counter" data-counter>0 / 30</span>
      </div>
      <div class="m-actions"><button type="button" class="m-btn primary" data-act="add">조약돌 얹기</button></div>
      <p class="m-live" data-live aria-live="polite"></p>
      <h3 class="m-sub">최근에 얹은 돌</h3>
      <ul class="stone-list" data-list></ul>`);

    const input = root.querySelector('#stone-wish');
    const counter = root.querySelector('[data-counter]');
    const live = root.querySelector('[data-live]');

    const render = () => {
      const stones = this.store.state.stones;
      root.querySelector('[data-total]').textContent = stones.length.toLocaleString('ko-KR');
      root.querySelector('[data-list]').innerHTML = byNewest(stones)
        .slice(0, 12)
        .map(
          (s) => `<li class="stone-item${s.mine ? ' is-mine' : ''}">
            <span class="stone-pebble" aria-hidden="true"></span>
            <span class="stone-text"><span class="stone-wish">${esc(s.wish)}</span>
            <span class="stone-meta">${esc(s.author)}${s.mine ? ' · <em>나의 돌</em>' : ''} · ${relTime(s.createdAt)}</span></span></li>`
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
      this.cb.onAddStone?.(wish);
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
    this._on(root, 'click', (e) => e.target.closest('[data-act="add"]') && add());
    render();
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
      actions.style.visibility = 'hidden'; // 자리를 지켜 창이 출렁이지 않게
      this.cb.onBurnWorry?.();
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

  /** 한지 쪽지가 모서리부터 그을리며 타들어 가는 캔버스 연출. 끝나면 픽셀까지 비운다. */
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

  /* ═════════ 5. 108배 · 염주 (side) ═════════ */
  _practice(payload) {
    const C = 2 * Math.PI * 60;
    const root = this._root(`
      <div class="m-tabs" role="tablist" aria-label="수행 방식">
        <button type="button" role="tab" data-tab="prostrate">큰절 108배</button>
        <button type="button" role="tab" data-tab="mala">염주</button>
      </div>
      <section class="m-pane practice" data-pane="prostrate" role="tabpanel">
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
            <button type="button" class="m-btn" data-act="auto" aria-pressed="false">자동 108배 <small>4초에 한 번</small></button>
          </div>
          <p class="practice-stat">오늘 <b data-today-bows>0</b>배 · 누적 <b data-life-bows>0</b>배</p>
        </div>
      </section>
      <section class="m-pane practice" data-pane="mala" role="tabpanel">
        <div class="practice-visual">
          <button type="button" class="mala" data-act="bead" aria-label="염주 한 알 넘기기">
            ${malaSvg()}
            <span class="mala-center" aria-hidden="true"><b data-mala>0</b><small>/ 108</small></span>
          </button>
        </div>
        <div class="practice-side">
          <p class="breath is-still">한 알에 한 숨</p>
          <p class="practice-stat">오늘 <b data-today-mala>0</b>알 · 누적 <b data-life-mala>0</b>알</p>
          <p class="m-hint">염주를 누르거나, 스페이스바를 누르거나, 아래로 쓸어 넘기세요. 스물일곱 알 단주를 네 바퀴 돌리면 백팔입니다.</p>
          <p class="m-live" data-mala-live aria-live="polite"></p>
        </div>
      </section>`);

    const $ = (s) => root.querySelector(s);
    const breath = $('[data-breath]');
    const autoBtn = $('[data-act="auto"]');
    const bowBtn = $('[data-act="bow"]');
    const ring = $('[data-ring]');
    const beads = $('[data-beads]');
    let tab = payload.mode === 'mala' ? 'mala' : 'prostrate';
    let auto = false;
    let gen = 0;
    let rot = -(this._todayCounts().mala % MALA_BEADS) * (360 / MALA_BEADS);

    const setBreath = (text) => {
      breath.classList.remove('is-shift');
      void breath.offsetWidth;
      breath.textContent = text;
      breath.classList.add('is-shift');
    };

    const render = () => {
      const t = this._todayCounts();
      const s = this.store.stats;
      $('[data-bows]').textContent = t.bows;
      $('[data-arc]').setAttribute('stroke-dashoffset', (C * (1 - Math.min(t.bows, 108) / 108)).toFixed(2));
      $('[data-today-bows]').textContent = t.bows;
      $('[data-life-bows]').textContent = (s.bowCount || 0).toLocaleString('ko-KR');
      $('[data-mala]').textContent = t.mala % 108 === 0 && t.mala > 0 ? 108 : t.mala % 108;
      $('[data-today-mala]').textContent = t.mala;
      $('[data-life-mala]').textContent = (s.malaCount || 0).toLocaleString('ko-KR');
      beads.style.transform = `rotate(${rot}deg)`;
    };

    const stopAuto = () => {
      gen += 1;
      auto = false;
      autoBtn.setAttribute('aria-pressed', 'false');
      autoBtn.innerHTML = '자동 108배 <small>4초에 한 번</small>';
      bowBtn.disabled = false;
      ring.classList.remove('is-breathing');
    };

    // 목탁은 main.js 가 이마가 닿는 순간에 맞춰 울린다.
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
      // 들숨 2초 → 날숨에 절 → 절이 받아들여진 때부터 다시 2초. 아바타 동작이 4초보다 길어도 절을 건너뛰지 않는다.
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

    const bead = () => {
      const t = this._todayCounts();
      t.mala += 1;
      rot -= 360 / MALA_BEADS;
      this.cb.onMala?.(); // 염주 소리는 main.js 가 낸다
      render();
      if (t.mala % 108 === 0) {
        this._sfx('playChukbi');
        this._flash($('[data-mala-live]'), '백팔 염주 한 바퀴를 마쳤습니다.');
      }
    };

    const setTab = this._tabs(root, (name) => {
      tab = name;
      if (name !== 'prostrate' && auto) stopAuto();
    });

    // 염주: 누르기 / 쓸어 넘기기 / 스페이스바
    const mala = $('.mala');
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
    this._on(document, 'keydown', (e) => {
      if (tab !== 'mala' || e.code !== 'Space' || e.repeat) return;
      if (e.target.closest?.('input, textarea, select, button, [contenteditable="true"]')) return;
      e.preventDefault();
      e.stopPropagation();
      bead();
    });

    this._on(root, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tab) setTab(b.dataset.tab);
      else if (b.dataset.act === 'bow') manualBow();
      else if (b.dataset.act === 'auto') (auto ? stopAuto() : startAuto());
      else if (b.dataset.act === 'bead') {
        if (swiped) swiped = false;
        else bead();
      }
    });

    render();
    setTab(tab);
    if (tab === 'mala') mala.setAttribute('data-autofocus', '');
    else bowBtn.setAttribute('data-autofocus', '');
    return {
      refresh: render,
      reopen: (p) => setTab(p.mode === 'mala' ? 'mala' : 'prostrate'),
      destroy: stopAuto
    };
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

  /* ═════════ 7. 심검당 차담 (side) ═════════ */
  _tea() {
    const token = this._token;
    const remote = typeof window !== 'undefined' && !!window.TEMPLE_CONFIG?.monkChatEndpoint;
    const root = this._root(`
      <div class="tea-log" data-log role="log" aria-live="polite" aria-label="차담 내용"></div>
      <div class="tea-dock">
        <div class="tea-row">
          <label class="sr-only" for="tea-input">선사에게 건넬 말</label>
          <input id="tea-input" type="text" maxlength="300" autocomplete="off" enterkeyhint="send" placeholder="편히 적어 보세요" />
          <button type="button" class="m-btn primary" data-act="send">건네기</button>
        </div>
        <div class="tea-foot">
          <button type="button" class="m-link" data-act="card">오늘의 죽비 뽑기</button>
          <span class="tea-privacy">${remote ? '차담은 이 브라우저에 남지 않습니다' : '차담은 어디에도 저장되지 않습니다'}</span>
        </div>
      </div>`);
    root.classList.add('tea');
    const log = root.querySelector('[data-log]');
    const input = root.querySelector('#tea-input');
    const sendBtn = root.querySelector('[data-act="send"]');
    const hist = this._teaHistory;
    let busy = false;
    const alive = () => token === this._token && this._type === 'tea_chat';
    const scroll = () => (log.scrollTop = log.scrollHeight);

    const bubble = (role, text, verse, crisis) => {
      const el = document.createElement('div');
      el.className = `tea-msg is-${role}`;
      if (role === 'monk') {
        const who = document.createElement('p');
        who.className = 'tea-who';
        who.textContent = '청연 선사';
        el.appendChild(who);
      }
      const p = document.createElement('p');
      p.className = 'tea-text';
      p.textContent = text;
      el.appendChild(p);
      if (crisis) {
        const help = document.createElement('div');
        help.className = 'tea-help';
        help.innerHTML = `<a href="tel:109">자살예방상담전화 <b>109</b></a><span>24시간, 언제든 전화할 수 있습니다</span>
          <span class="tea-help-sub">지금 위험한 상황이라면 <a href="tel:119">119</a></span>`;
        el.appendChild(help);
      }
      if (verse) {
        const v = document.createElement('p');
        v.className = 'tea-verse';
        v.textContent = verse;
        el.appendChild(v);
      }
      log.appendChild(el);
      scroll();
      return el;
    };
    const typing = () => {
      const el = document.createElement('div');
      el.className = 'tea-msg is-monk is-typing';
      el.setAttribute('aria-label', '선사가 말을 고르는 중');
      el.innerHTML = '<span></span><span></span><span></span>';
      log.appendChild(el);
      scroll();
      return el;
    };
    const monkSays = async (text, delay, record = true) => {
      const dots = typing();
      await this._wait(delay);
      dots.remove();
      bubble('monk', text);
      if (record) hist.push({ role: 'monk', text });
    };

    const send = async () => {
      const text = input.value.trim();
      if (!text || busy) return;
      busy = true;
      sendBtn.disabled = true;
      input.value = '';
      bubble('user', text);
      const prior = hist.slice();
      hist.push({ role: 'user', text });
      const dots = typing();
      const started = performance.now();
      const res = await generateMonkResponse(text, prior);
      // 창을 닫아도 대화가 끊기지 않게 기록 먼저 (메모리에만)
      hist.push({ role: 'monk', text: res.reply, verse: res.verse, crisis: !!res.crisis });
      if (hist.length > 60) hist.splice(0, hist.length - 60);
      this.cb.onTeaTurn?.();
      const think = Math.min(900 + res.reply.length * 18, 2800) - (performance.now() - started);
      if (think > 0) await this._wait(think);
      if (!alive()) return;
      dots.remove();
      bubble('monk', res.reply, res.verse, res.crisis);
      busy = false;
      sendBtn.disabled = false;
    };

    const drawCard = () => {
      const el = bubble('monk', '죽비 한 자루를 건넵니다. 마음에 닿는 구절이면 간직해 두세요.');
      el.classList.add('has-card');
      const deck = this._deck(el, true);
      this._later(() => deck.draw(), reduceMotion() ? 0 : 350);
      this._later(scroll, 900);
    };

    this._on(input, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        send();
      }
    });
    this._on(root, 'click', (e) => {
      const b = e.target.closest('button');
      if (b?.dataset.act === 'send') send();
      if (b?.dataset.act === 'card') drawCard();
    });

    // 맞이하기
    hist.forEach((h) => bubble(h.role, h.text, h.verse, h.crisis));
    const name = this.store.profile.dharmaName;
    (async () => {
      if (!hist.length) {
        await monkSays(`어서 오십시오, ${name} 도반님. 찻물이 마침 알맞게 끓었습니다. 연잎차 한 잔 따라 드리겠습니다.`, 700);
        if (!alive()) return;
        await monkSays('무엇이든 편히 꺼내 놓으세요. 답을 드리기보다 먼저 듣겠습니다. 한 줄이어도 괜찮습니다.', 1600);
      } else {
        await monkSays('다시 오셨군요. 차를 새로 데웠습니다.', 600, false);
      }
    })();
    return { reopen: () => input.focus({ preventScroll: true }) };
  }

  /* ═════════ 8. 오늘의 죽비 ═════════ */
  _card() {
    const root = this._root('<div data-deck></div>');
    const deck = this._deck(root.querySelector('[data-deck]'), false);
    return { refresh: deck.syncKept };
  }

  /** 죽비 카드 한 벌 — 모달과 차담에서 함께 쓴다 */
  _deck(host, compact) {
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
      </div>
      <p class="m-hint jukbi-kept" data-kept aria-live="polite"></p>`;
    host.appendChild(wrap);
    const card = wrap.querySelector('[data-card]');
    const front = wrap.querySelector('[data-front]');
    const drawBtn = wrap.querySelector('[data-act="draw"]');
    const keepBtn = wrap.querySelector('[data-act="keep"]');
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
      syncKept();
      this._later(() => (busy = false), reduceMotion() ? 0 : 650);
    };
    const draw = () => {
      if (busy) return;
      busy = true;
      const pool = DHARMA_CARDS.filter((c) => c.id !== cur?.id);
      const next = pool[Math.floor(Math.random() * pool.length)];
      if (flipped) {
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
    });
    syncKept();
    return { draw, syncKept };
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
          <button type="button" class="m-link" data-act="rename">법명 다시 받기</button>
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
            ? `<ul class="pf-cards">${kept.map((c) => `<li><span class="jk-quote">${esc(c.quote)}</span><span class="jk-source">${esc(c.source)}</span></li>`).join('')}</ul>`
            : '<p class="m-hint">후원 다실의 죽비에서 마음에 닿는 구절을 간직해 보세요.</p>'
        }
        <p class="m-hint pf-privacy">이 기록은 이 브라우저에만 남습니다.</p>`;
    };
    this._on(root, 'click', (e) => {
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
    const remote = typeof window !== 'undefined' && !!window.TEMPLE_CONFIG?.monkChatEndpoint;
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
        <p class="help-p">${remote ? '차담은 선사의 답을 받기 위해 전해지지만 이 브라우저에 남지 않습니다.' : '차담 내용도 저장되지 않습니다.'} 기도와 고민은 광고에 쓰이지 않습니다.</p>
      </section>`);
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

/**
 * 선사 응답 (docs/03 로드맵 연결점).
 * window.TEMPLE_CONFIG.monkChatEndpoint 가 있으면 {message, history} 를 POST 하고 {reply, verse} 를 쓴다.
 * 없거나 실패하면 로컬 지식베이스로. 위기 신호는 서버에 묻기 전에 로컬에서 먼저, 반드시 109 를 안내한다.
 * API 키는 절대 클라이언트에 두지 않는다 — 엔드포인트는 서버 쪽 프록시여야 한다.
 */
export async function generateMonkResponse(userMessage, history = []) {
  const text = String(userMessage ?? '').slice(0, 1000);
  if (isCrisisText(text)) return localMonkResponse(text, history);
  const endpoint = typeof window !== 'undefined' ? window.TEMPLE_CONFIG?.monkChatEndpoint : null;
  if (endpoint) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(-12).map(({ role, text: t }) => ({ role, text: t })) }),
        signal: ac.signal
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.reply === 'string' && data.reply.trim()) {
          return {
            reply: data.reply.trim().slice(0, 1500),
            verse: typeof data.verse === 'string' ? data.verse.trim().slice(0, 300) : ''
          };
        }
      }
    } catch (e) {
      console.warn('[tea] 차담 서버에 닿지 않아 로컬 응답으로 이어갑니다');
    } finally {
      clearTimeout(timer);
    }
  }
  return localMonkResponse(text, history);
}
