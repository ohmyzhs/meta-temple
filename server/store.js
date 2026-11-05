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
CREATE INDEX IF NOT EXISTS lanterns_recent ON lanterns (created_at DESC) WHERE NOT hidden;
CREATE INDEX IF NOT EXISTS tiles_recent ON tiles (created_at DESC) WHERE NOT hidden;
CREATE INDEX IF NOT EXISTS stones_recent ON stones (created_at DESC) WHERE NOT hidden;
`;

// 한 번에 돌려주는 양 — "일부만" 보이게 (최근 것 위주)
export const LIMITS = { lanterns: 90, tiles: 24, stones: 20 };

const row = (r) => ({
  id: r.id,
  author: r.author,
  ...(r.color ? { color: r.color } : {}),
  wish: r.wish,
  ...(r.empathy !== undefined ? { empathy: r.empathy } : {}),
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
      const [l, t, s, sc] = await Promise.all([
        pool.query('SELECT id, author, color, wish, empathy, created_at FROM lanterns WHERE NOT hidden ORDER BY created_at DESC LIMIT $1', [LIMITS.lanterns]),
        pool.query('SELECT id, author, wish, created_at FROM tiles WHERE NOT hidden ORDER BY created_at DESC LIMIT $1', [LIMITS.tiles]),
        pool.query('SELECT id, author, wish, created_at FROM stones WHERE NOT hidden ORDER BY created_at DESC LIMIT $1', [LIMITS.stones]),
        pool.query('SELECT count(*)::int AS n FROM stones WHERE NOT hidden')
      ]);
      return { lanterns: l.rows.map(row), tiles: t.rows.map(row), stones: s.rows.map(row), stoneTotal: sc.rows[0].n };
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
  const db = { lanterns: [], tiles: [], stones: [], emp: new Set() };
  const newest = (a, n) => [...a].filter((x) => !x.hidden).sort((x, y) => y.created_at - x.created_at).slice(0, n).map(row);
  return {
    kind: 'memory',
    async recent() {
      return { lanterns: newest(db.lanterns, LIMITS.lanterns), tiles: newest(db.tiles, LIMITS.tiles), stones: newest(db.stones, LIMITS.stones), stoneTotal: db.stones.length };
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
