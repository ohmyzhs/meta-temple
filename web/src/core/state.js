/**
 * 수행 기록 저장소 — localStorage (docs/03 §3).
 * 파일럿과 같은 키를 쓰고, 읽을 때 빠진 필드를 채워 넣는다(이미 방문한 사람의 기록이 사라지지 않게).
 * 번뇌 소각 내용은 어디에도 저장하지 않는다.
 */
import {
  generateDharmaName,
  INITIAL_LANTERNS,
  INITIAL_TILES,
  INITIAL_STONES
} from '../data/templeData.js';

const STORAGE_KEY = 'meta_temple_cheongyeon_state_v1';
const VERSION = 2;

const DEFAULT_STATS = {
  bowCount: 0,
  malaCount: 0,
  lanternCount: 0,
  tileCount: 0,
  stoneCount: 0,
  sutraCopiedCount: 0,
  circumambulationLoops: 0,
  incenseCount: 0,
  bellStrikes: 0,
  teaChats: 0
};

export function kstDateString(d = new Date()) {
  // YYYY-MM-DD in Asia/Seoul
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
}

export function kstHour(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const m = Number(parts.find((p) => p.type === 'minute').value);
  return h + m / 60;
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `u_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function fresh() {
  return {
    version: VERSION,
    profile: {
      userId: uuid(),
      dharmaName: generateDharmaName(),
      avatarStyle: 'monk',
      stats: { ...DEFAULT_STATS },
      unlockedItems: [],
      attendance: { lastDate: null, streak: 0, totalDays: 0 },
      dharmaCards: [],
      lastVisitedAt: null
    },
    settings: {
      volumes: { nature: 0.7, temple: 0.65, sfx: 0.8 },
      time: 'realtime',
      weather: 'clear'
    },
    lanterns: INITIAL_LANTERNS.map((l) => ({ ...l })),
    tiles: INITIAL_TILES.map((t) => ({ ...t })),
    stones: INITIAL_STONES.map((s) => ({ ...s })),
    empathized: []
  };
}

function normalize(raw) {
  const base = fresh();
  if (!raw || typeof raw !== 'object' || !raw.profile) return base;
  const p = raw.profile;
  const out = {
    ...base,
    ...raw,
    version: VERSION,
    profile: {
      ...base.profile,
      ...p,
      stats: { ...DEFAULT_STATS, ...(p.stats || {}) },
      attendance: { ...base.profile.attendance, ...(p.attendance || {}) },
      unlockedItems: Array.isArray(p.unlockedItems) ? p.unlockedItems : [],
      dharmaCards: Array.isArray(p.dharmaCards) ? p.dharmaCards : []
    },
    settings: { ...base.settings, ...(raw.settings || {}) },
    empathized: Array.isArray(raw.empathized) ? raw.empathized : []
  };
  // v1 연등은 pos 를 갖고 있었다 — 자리는 이제 연등 줄이 정하므로 버린다.
  const rawLanterns = Array.isArray(raw.lanterns) ? raw.lanterns : [];
  const missingInit = base.lanterns.filter((b) => !rawLanterns.some((l) => l.id === b.id || (l.author === b.author && l.wish === b.wish)));
  out.lanterns = [...missingInit, ...rawLanterns].map((l, i) => ({
    id: l.id || `lantern_m_${i}`,
    author: l.author || '이름 없는 도반',
    color: l.color || '#f3a24a',
    wish: l.wish || '',
    empathy: l.empathy || 0,
    createdAt: l.createdAt || base.lanterns[0].createdAt,
    mine: !!l.mine || (l.author === p.dharmaName && !String(l.id).startsWith('lantern_init'))
  }));
  out.tiles = (Array.isArray(raw.tiles) ? raw.tiles : base.tiles).map((t, i) => ({
    id: t.id || `tile_m_${i}`,
    author: t.author || '이름 없는 도반',
    wish: t.wish || '',
    createdAt: t.createdAt || base.tiles[0].createdAt,
    mine: !!t.mine
  }));
  out.stones = (Array.isArray(raw.stones) ? raw.stones : base.stones).map((s) => ({
    author: s.author || '이름 없는 도반',
    wish: s.wish || '',
    createdAt: s.createdAt || new Date().toISOString(),
    mine: !!s.mine
  }));
  return out;
}

export class TempleStore {
  constructor() {
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (e) {
      console.warn('[store] load failed, starting fresh', e);
    }
    this.isReturning = !!(raw && raw.profile);
    this.state = normalize(raw);
    this._listeners = new Set();
    this.save();
  }

  get profile() {
    return this.state.profile;
  }
  get stats() {
    return this.state.profile.stats;
  }

  /** 하루 한 번 출석 처리. 반환: { streak, isNewDay } */
  checkIn() {
    const att = this.state.profile.attendance;
    const today = kstDateString();
    if (att.lastDate === today) return { streak: att.streak, isNewDay: false };
    const yesterday = kstDateString(new Date(Date.now() - 86400000));
    att.streak = att.lastDate === yesterday ? att.streak + 1 : 1;
    att.totalDays += 1;
    att.lastDate = today;
    this.state.profile.lastVisitedAt = new Date().toISOString();
    this._refreshUnlocks();
    this.save();
    return { streak: att.streak, isNewDay: true };
  }

  addStat(key, n = 1) {
    this.stats[key] = (this.stats[key] || 0) + n;
    const unlocked = this._refreshUnlocks();
    this.save();
    return unlocked;
  }

  /**
   * 비경쟁 시각 보상 (docs/02 §3.2, docs/01 §4)
   *  wooden_mala  — 절 21배 이상 또는 염주 108회
   *  hand_lantern — 연등 1개 이상 또는 사경 1회 이상 (밤에 따라다니는 손연등)
   *  jade_mala    — 7일 연속 출석 (백옥 단주)
   * 반환: 이번에 새로 열린 항목들
   */
  _refreshUnlocks() {
    const s = this.stats;
    const items = this.state.profile.unlockedItems;
    const want = [];
    if (s.bowCount >= 21 || s.malaCount >= 108) want.push('wooden_mala');
    if (s.lanternCount >= 1 || s.sutraCopiedCount >= 1) want.push('hand_lantern');
    if (this.state.profile.attendance.streak >= 7) want.push('jade_mala');
    const added = want.filter((w) => !items.includes(w));
    items.push(...added);
    return added;
  }

  has(item) {
    return this.state.profile.unlockedItems.includes(item);
  }

  setDharmaName(name) {
    this.state.profile.dharmaName = name;
    this.save();
  }

  setAvatarStyle(style) {
    this.state.profile.avatarStyle = style;
    this.save();
  }

  setSetting(key, value) {
    this.state.settings[key] = value;
    this.save();
  }

  addLantern(wish, color) {
    const l = {
      id: `lantern_${Date.now()}`,
      author: this.profile.dharmaName,
      color,
      wish,
      empathy: 0,
      createdAt: new Date().toISOString(),
      mine: true
    };
    this.state.lanterns.push(l);
    const unlocked = this.addStat('lanternCount');
    return { lantern: l, unlocked };
  }

  /** 합장 공감 — 연등 하나에 한 번만 */
  empathize(id) {
    if (this.state.empathized.includes(id)) return false;
    const l = this.state.lanterns.find((x) => x.id === id);
    if (!l) return false;
    l.empathy += 1;
    this.state.empathized.push(id);
    this.save();
    return true;
  }

  addTile(wish) {
    const t = {
      id: `tile_${Date.now()}`,
      author: this.profile.dharmaName,
      wish,
      createdAt: new Date().toISOString(),
      mine: true
    };
    this.state.tiles.push(t);
    this.addStat('tileCount');
    return t;
  }

  addStone(wish) {
    const s = { author: this.profile.dharmaName, wish, createdAt: new Date().toISOString(), mine: true };
    this.state.stones.push(s);
    this.addStat('stoneCount');
    return s;
  }

  keepDharmaCard(card) {
    const list = this.state.profile.dharmaCards;
    if (!list.some((c) => c.id === card.id)) list.push({ id: card.id, keptAt: new Date().toISOString() });
    this.save();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[store] save failed', e);
    }
    this._listeners.forEach((fn) => fn(this.state));
  }
}
