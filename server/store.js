/**
 * 공유 연등·기와·돌탑 저장소. DATABASE_URL 이 있으면 Postgres, 없으면 메모리(로컬 개발용).
 * 작성자 식별은 브라우저 무작위 ID 를 서버 소금으로 해시한 값만 남긴다 (공감 중복·도배 막기용).
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS lanterns (
  id text PRIMARY KEY,
  author text NOT NULL,
  color text NOT NULL,
  wish text NOT NULL,
  empathy integer NOT NULL DEFAULT 0,
  client_hash text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lantern_empathy (
  lantern_id text NOT NULL REFERENCES lanterns(id) ON DELETE CASCADE,
  client_hash text NOT NULL,
  PRIMARY KEY (lantern_id, client_hash)
);
CREATE TABLE IF NOT EXISTS tiles (
  id text PRIMARY KEY,
  author text NOT NULL,
  wish text NOT NULL,
  client_hash text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stones (
  id text PRIMARY KEY,
  author text NOT NULL,
  wish text NOT NULL,
  client_hash text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reports (
  kind text NOT NULL,
  item_id text NOT NULL,
  client_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, item_id, client_hash)
);
-- 과금 대비 (아직 쓰지 않음): 주문과 보유 권리. 수행 보상은 source 'merit', 결제는 'purchase'
CREATE TABLE IF NOT EXISTS orders (
  order_id text PRIMARY KEY,
  profile_id text NOT NULL,
  sku text NOT NULL,
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'ready',
  provider text NOT NULL DEFAULT 'toss',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS entitlements (
  id serial PRIMARY KEY,
  profile_id text NOT NULL,
  sku text NOT NULL,
  source text NOT NULL CHECK (source IN ('merit', 'purchase')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS entitlements_profile ON entitlements (profile_id);
CREATE INDEX IF NOT EXISTS lanterns_recent ON lanterns (created_at DESC) WHERE NOT hidden;
CREATE INDEX IF NOT EXISTS tiles_recent ON tiles (created_at DESC) WHERE NOT hidden;
CREATE INDEX IF NOT EXISTS stones_recent ON stones (created_at DESC) WHERE NOT hidden;
-- 돌탑 어디서나 (요구 8): 길가 돌탑의 돌은 탑 id 와 탑 자리(처음 돌의 자리)를 함께 둔다. 없으면 일주문 옆 돌탑
ALTER TABLE stones ADD COLUMN IF NOT EXISTS cairn_id text;
ALTER TABLE stones ADD COLUMN IF NOT EXISTS x double precision;
ALTER TABLE stones ADD COLUMN IF NOT EXISTS z double precision;
CREATE INDEX IF NOT EXISTS stones_cairn ON stones (cairn_id) WHERE cairn_id IS NOT NULL;
-- 기록 지키기 (복구키, web/src/core/recovery.js): 키는 화면에만 있다. 서버에는 키에서 유도한 조회값을 소금 해시한 id 와
-- 화면이 gzip·AES-GCM 으로 잠근 덩어리(base64)만 — 키는 오지 않는다 (6자 키라 DB·ID_SALT 가 함께 새면 PBKDF2 가 맞혀 보기를 늦출 뿐)
CREATE TABLE IF NOT EXISTS backups (
  id text PRIMARY KEY,
  data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

// 한 번에 돌려주는 양 — "일부만" 보이게 (최근 것 위주). cairns 는 최근에 돌이 얹힌 길가 돌탑
export const LIMITS = { lanterns: 90, tiles: 24, stones: 20, cairns: 300, cairnStones: 40 };

const row = (r) => ({
  id: r.id,
  author: r.author,
  ...(r.color ? { color: r.color } : {}),
  wish: r.wish,
  ...(r.empathy !== undefined ? { empathy: r.empathy } : {}),
  ...(r.cairn_id ? { cairnId: r.cairn_id, x: Number(r.x), z: Number(r.z) } : {}),
  createdAt: new Date(r.created_at).toISOString()
});

export async function createStore(url) {
  if (!url) return memoryStore();
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  for (let i = 0; ; i++) {
    try {
      await pool.query(SCHEMA);
      break;
    } catch (e) {
      if (i >= 20) throw e;
      console.warn('[store] db not ready, retry', e.code || e.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return {
    kind: 'postgres',
    async recent() {
      const [l, t, s, sc, c] = await Promise.all([
        pool.query('SELECT id, author, color, wish, empathy, created_at FROM lanterns WHERE NOT hidden ORDER BY created_at DESC LIMIT $1', [LIMITS.lanterns]),
        pool.query('SELECT id, author, wish, created_at FROM tiles WHERE NOT hidden ORDER BY created_at DESC LIMIT $1', [LIMITS.tiles]),
        pool.query('SELECT id, author, wish, cairn_id, x, z, created_at FROM stones WHERE NOT hidden ORDER BY created_at DESC LIMIT $1', [LIMITS.stones]),
        pool.query('SELECT count(*)::int AS n, (count(*) FILTER (WHERE cairn_id IS NULL))::int AS gate FROM stones WHERE NOT hidden'),
        pool.query(
          'SELECT cairn_id, min(x) AS x, min(z) AS z, count(*)::int AS n FROM stones WHERE NOT hidden AND cairn_id IS NOT NULL GROUP BY cairn_id ORDER BY max(created_at) DESC LIMIT $1',
          [LIMITS.cairns]
        )
      ]);
      return {
        lanterns: l.rows.map(row),
        tiles: t.rows.map(row),
        stones: s.rows.map(row),
        stoneTotal: sc.rows[0].n,
        gateStones: sc.rows[0].gate,
        cairns: c.rows.map((r) => ({ id: r.cairn_id, x: Number(r.x), z: Number(r.z), n: r.n }))
      };
    },
    /** 한 돌탑에 얹힌 돌 (최근 것부터, id 가 null 이면 일주문 옆 돌탑) + 그 탑의 돌 수 */
    async cairnStones(id) {
      const where = id ? 'cairn_id = $1' : 'cairn_id IS NULL';
      const args = id ? [id] : [];
      const [s, c] = await Promise.all([
        pool.query(`SELECT id, author, wish, cairn_id, x, z, created_at FROM stones WHERE NOT hidden AND ${where} ORDER BY created_at DESC LIMIT ${LIMITS.cairnStones}`, args),
        pool.query(`SELECT count(*)::int AS n FROM stones WHERE NOT hidden AND ${where}`, args)
      ]);
      return { stones: s.rows.map(row), n: c.rows[0].n };
    },
    /** 이 탑 (숨긴 돌만 남았어도 자리는 지킨다) */
    async cairnById(id) {
      const r = await pool.query('SELECT x, z FROM stones WHERE cairn_id = $1 LIMIT 1', [id]);
      return r.rows[0] ? { id, x: Number(r.rows[0].x), z: Number(r.rows[0].z) } : null;
    },
    /** (x,z) 반경 r 안의 탑들 */
    async cairnsNear(x, z, r) {
      const q = await pool.query(
        'SELECT cairn_id, min(x) AS x, min(z) AS z FROM stones WHERE cairn_id IS NOT NULL AND x BETWEEN $1 AND $2 AND z BETWEEN $3 AND $4 GROUP BY cairn_id',
        [x - r, x + r, z - r, z + r]
      );
      return q.rows.map((c) => ({ id: c.cairn_id, x: Number(c.x), z: Number(c.z) })).filter((c) => (c.x - x) ** 2 + (c.z - z) ** 2 <= r * r);
    },
    async countToday(table, clientHash) {
      const r = await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE client_hash = $1 AND created_at > now() - interval '1 day'`, [clientHash]);
      return r.rows[0].n;
    },
    async add(table, item) {
      const cols = Object.keys(item);
      const vals = Object.values(item);
      const r = await pool.query(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT (id) DO NOTHING RETURNING *`,
        vals
      );
      return r.rows[0] ? row(r.rows[0]) : null;
    },
    /** 신고 한 건 (같은 사람은 한 번). hideAt 명이 넘으면 숨긴다. 글이 없으면 null */
    async report(table, id, clientHash, hideAt) {
      const found = await pool.query(`SELECT hidden FROM ${table} WHERE id = $1`, [id]);
      if (!found.rows[0]) return null;
      await pool.query('INSERT INTO reports (kind, item_id, client_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [table, id, clientHash]);
      const n = (await pool.query('SELECT count(*)::int AS n FROM reports WHERE kind = $1 AND item_id = $2', [table, id])).rows[0].n;
      let hidden = found.rows[0].hidden;
      if (!hidden && n >= hideAt) {
        await pool.query(`UPDATE ${table} SET hidden = true WHERE id = $1`, [id]);
        hidden = true;
      }
      return { hidden, reports: n };
    },
    /** 맡긴 기록 넣기/덮어쓰기 → { updatedAt }. create: 새 키 — 이미 있으면 덮지 않고 null */
    async putBackup(id, data, { create = false } = {}) {
      const r = await pool.query(
        `INSERT INTO backups (id, data) VALUES ($1, $2) ON CONFLICT (id) ${create ? 'DO NOTHING' : 'DO UPDATE SET data = EXCLUDED.data, updated_at = now()'} RETURNING updated_at`,
        [id, data]
      );
      return r.rows[0] ? { updatedAt: new Date(r.rows[0].updated_at).toISOString() } : null;
    },
    /** 맡긴 기록 → { data, updatedAt } | null */
    async getBackup(id) {
      const r = await pool.query('SELECT data, updated_at FROM backups WHERE id = $1', [id]);
      return r.rows[0] ? { data: r.rows[0].data, updatedAt: new Date(r.rows[0].updated_at).toISOString() } : null;
    },
    async empathize(id, clientHash) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const ins = await c.query('INSERT INTO lantern_empathy (lantern_id, client_hash) SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM lanterns WHERE id = $1) ON CONFLICT DO NOTHING', [id, clientHash]);
        const r = ins.rowCount
          ? await c.query('UPDATE lanterns SET empathy = empathy + 1 WHERE id = $1 RETURNING empathy', [id])
          : await c.query('SELECT empathy FROM lanterns WHERE id = $1', [id]);
        await c.query('COMMIT');
        return r.rows[0] ? { empathy: r.rows[0].empathy, added: ins.rowCount > 0 } : null;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    }
  };
}

function memoryStore() {
  const db = { lanterns: [], tiles: [], stones: [], emp: new Set(), reports: new Map(), backups: new Map() };
  const newest = (a, n) => [...a].filter((x) => !x.hidden).sort((x, y) => y.created_at - x.created_at).slice(0, n).map(row);
  return {
    kind: 'memory',
    async recent() {
      const shown = db.stones.filter((s) => !s.hidden);
      const by = new Map();
      for (const s of shown) {
        if (!s.cairn_id) continue;
        const c = by.get(s.cairn_id) || { id: s.cairn_id, x: s.x, z: s.z, n: 0, last: 0 };
        c.n++;
        c.last = Math.max(c.last, s.created_at);
        by.set(s.cairn_id, c);
      }
      const cairns = [...by.values()].sort((a, b) => b.last - a.last).slice(0, LIMITS.cairns).map(({ last, ...c }) => c);
      return {
        lanterns: newest(db.lanterns, LIMITS.lanterns),
        tiles: newest(db.tiles, LIMITS.tiles),
        stones: newest(db.stones, LIMITS.stones),
        stoneTotal: shown.length,
        gateStones: shown.filter((s) => !s.cairn_id).length,
        cairns
      };
    },
    async cairnStones(id) {
      const mine = db.stones.filter((s) => !s.hidden && (s.cairn_id || null) === (id || null));
      return { stones: newest(mine, LIMITS.cairnStones), n: mine.length };
    },
    async cairnById(id) {
      const s = db.stones.find((x) => x.cairn_id === id);
      return s ? { id, x: s.x, z: s.z } : null;
    },
    async cairnsNear(x, z, r) {
      const by = new Map();
      for (const s of db.stones) if (s.cairn_id && (s.x - x) ** 2 + (s.z - z) ** 2 <= r * r) by.set(s.cairn_id, { id: s.cairn_id, x: s.x, z: s.z });
      return [...by.values()];
    },
    async countToday(table, clientHash) {
      const day = Date.now() - 86400000;
      return db[table].filter((x) => x.client_hash === clientHash && x.created_at > day).length;
    },
    async add(table, item) {
      if (db[table].some((x) => x.id === item.id)) return null;
      const r = { empathy: table === 'lanterns' ? 0 : undefined, hidden: false, created_at: Date.now(), ...item };
      db[table].push(r);
      return row(r);
    },
    async report(table, id, clientHash, hideAt) {
      const item = db[table].find((x) => x.id === id);
      if (!item) return null;
      const key = `${table}|${id}`;
      if (!db.reports.has(key)) db.reports.set(key, new Set());
      const who = db.reports.get(key);
      who.add(clientHash);
      if (!item.hidden && who.size >= hideAt) item.hidden = true;
      return { hidden: item.hidden, reports: who.size };
    },
    async putBackup(id, data, { create = false } = {}) {
      if (create && db.backups.has(id)) return null;
      const updatedAt = new Date().toISOString();
      db.backups.set(id, { data, updatedAt });
      return { updatedAt };
    },
    async getBackup(id) {
      return db.backups.get(id) || null;
    },
    async empathize(id, clientHash) {
      const l = db.lanterns.find((x) => x.id === id);
      if (!l) return null;
      const key = `${id}|${clientHash}`;
      const added = !db.emp.has(key);
      if (added) {
        db.emp.add(key);
        l.empathy += 1;
      }
      return { empathy: l.empathy, added };
    }
  };
}
