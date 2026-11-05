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
import { checkText } from './moderation.js';

// 키 이름은 파일럿 그대로 둔다 (옛 방문자 기록을 그대로 읽으려고). 내용의 판은 schemaVersion 으로 구분한다.
const STORAGE_KEY = 'meta_temple_cheongyeon_state_v1';
const SCHEMA_VERSION = 3;

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
  if (crypto.randomUUID) return crypto.randomUUID();
  const h = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function fresh() {
  return {
    schemaVersion: SCHEMA_VERSION,
    // profileId: 이 브라우저의 도반을 가리키는 영구 ID. 나중에 카카오 로그인 등 계정이 생기면 이 ID 에 묶어 기록을 옮긴다
    profileId: uuid(),
    updatedAt: null,
    profile: {
      dharmaName: generateDharmaName(),
      nameIsCustom: false,
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

/**
 * 저장된 기록을 지금 판(v3)으로. v1·v2 는 profile.userId 를 profileId 로 옮긴다.
 * 모르는 값·빠진 값은 기본값으로 채워, 이미 쌓인 기록이 사라지지 않게 한다.
 */
export function migrateState(raw) {
  const base = fresh();
  if (!raw || typeof raw !== 'object' || !raw.profile) return base;
  const p = raw.profile;
  const { version: _v, ...rest } = raw;
  const { userId, ...pRest } = p;
  const out = {
    ...base,
    ...rest,
    schemaVersion: SCHEMA_VERSION,
    profileId: typeof raw.profileId === 'string' && raw.profileId ? raw.profileId : typeof userId === 'string' && userId ? userId : base.profileId,
    updatedAt: raw.updatedAt || null,
    profile: {
      ...base.profile,
      ...pRest,
      nameIsCustom: !!p.nameIsCustom,
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
    public: !!l.public,
    mine: !!l.mine || (l.author === p.dharmaName && !String(l.id).startsWith('lantern_init'))
  }));
  out.tiles = (Array.isArray(raw.tiles) ? raw.tiles : base.tiles).map((t, i) => ({
    id: t.id || `tile_m_${i}`,
    author: t.author || '이름 없는 도반',
    wish: t.wish || '',
    createdAt: t.createdAt || base.tiles[0].createdAt,
    public: !!t.public,
    mine: !!t.mine
  }));
  out.stones = (Array.isArray(raw.stones) ? raw.stones : base.stones).map((s, i) => ({
    id: s.id || `stone_m_${i}`,
    public: !!s.public,
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
    this.state = migrateState(raw);
    this._listeners = new Set();
    this.save();
  }

  get profile() {
    return this.state.profile;
  }
  get profileId() {
    return this.state.profileId;
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

  /**
   * 법명 바꾸기. custom = 사람이 직접 지은 이름 → 다른 도반에게 보이므로 거름(checkText)을 통과해야 한다.
   * 반환: { ok: true, text } | { ok: false, reason, message }
   */
  setDharmaName(name, { custom = false } = {}) {
    let text = name;
    if (custom) {
      const r = checkText(name, { kind: 'name' });
      if (!r.ok) return r;
      text = r.text;
    }
    this.state.profile.dharmaName = text;
    this.state.profile.nameIsCustom = !!custom;
    this.save();
    return { ok: true, text };
  }

  /** 기록 백업 (공유받은 남의 글은 빼고) */
  exportState() {
    return JSON.stringify(this._ownState(), null, 2);
  }

  /** 백업 되살리기. 실패하면 지금 기록을 건드리지 않는다 */
  importState(json) {
    let raw;
    try {
      raw = JSON.parse(json);
    } catch {
      return { ok: false, message: '기록 파일을 읽을 수 없습니다' };
    }
    if (!raw || typeof raw !== 'object' || !raw.profile || typeof raw.profile !== 'object') return { ok: false, message: '청연산사 기록 파일이 아닙니다' };
    this.state = migrateState(raw);
    this.save();
    return { ok: true };
  }

  setAvatarStyle(style) {
    this.state.profile.avatarStyle = style;
    this.save();
  }

  setSetting(key, value) {
    this.state.settings[key] = value;
    this.save();
  }

  addLantern(wish, color, share = true) {
    const l = {
      id: `l_${uuid()}`, // 서버와 같은 형식 — 공유해도 같은 ID
      public: !!share,
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

  addTile(wish, share = true) {
    const t = {
      id: `t_${uuid()}`,
      public: !!share,
      author: this.profile.dharmaName,
      wish,
      createdAt: new Date().toISOString(),
      mine: true
    };
    this.state.tiles.push(t);
    this.addStat('tileCount');
    return t;
  }

  addStone(wish, share = true) {
    const s = { id: `s_${uuid()}`, public: !!share, author: this.profile.dharmaName, wish, createdAt: new Date().toISOString(), mine: true };
    this.state.stones.push(s);
    this.addStat('stoneCount');
    return s;
  }

  keepDharmaCard(card) {
    const list = this.state.profile.dharmaCards;
    if (!list.some((c) => c.id === card.id)) list.push({ id: card.id, keptAt: new Date().toISOString() });
    this.save();
  }

  /**
   * 다른 도반이 공개한 서원(서버의 최근 일부)을 목록에 섞는다. 저장할 때는 빠진다.
   */
  mergeShared({ lanterns = [], tiles = [], stones = [], stoneTotal = 0 } = {}) {
    const st = this.state;
    const merge = (key, incoming) => {
      const local = st[key].filter((x) => !x.shared);
      const have = new Set(local.map((x) => x.id));
      const add = incoming.filter((x) => !have.has(x.id)).map((x) => ({ ...x, shared: true, mine: false }));
      st[key] = [...local, ...add].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      return add.length;
    };
    const n = merge('lanterns', lanterns) + merge('tiles', tiles) + merge('stones', stones);
    this.sharedStoneTotal = stoneTotal;
    return n;
  }

  /** 돌탑 전체 개수: 공유 총계 + 공개하지 않은 내 돌 + 처음 받은 예시 돌 */
  get stoneTotal() {
    const local = this.state.stones.filter((s) => !s.shared && !s.public).length;
    return Math.max(this.state.stones.length, (this.sharedStoneTotal || 0) + local);
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _ownState() {
    const own = (a) => a.filter((x) => !x.shared);
    const st = this.state;
    // profile.userId: 캐시에 남은 옛 화면(v2 코드)이 같은 ID 를 쓰도록 남겨 두는 별칭
    return { ...st, profile: { ...st.profile, userId: st.profileId }, lanterns: own(st.lanterns), tiles: own(st.tiles), stones: own(st.stones) };
  }

  save() {
    this.state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._ownState()));
    } catch (e) {
      console.warn('[store] save failed', e);
    }
    this._listeners.forEach((fn) => fn(this.state));
  }
}
