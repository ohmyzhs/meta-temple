/**
 * 걸어서 갈 길 찾기 — 0.5m 칸 A*(8방향) + 줄 당기기(보이는 데까지 곧게). 「돌탑 찾아가기」처럼 순간 이동 없이 걸어갈 때 쓴다.
 * 칸이 지나갈 만한지는 passable(x, z) 가 정하고, 한 번 잰 칸은 기억해 둔다 (지형·충돌체는 움직이지 않는다).
 * three·DOM 없음 — 시험(pathfind.test.js)은 가짜 지도로 한다.
 */
export function createPathfinder(passable, { x0 = -64, z0 = -60, w = 128, h = 124, cell = 0.5 } = {}) {
  const NX = Math.round(w / cell), NZ = Math.round(h / cell);
  const memo = new Uint8Array(NX * NZ); // 0 모름 · 1 지남 · 2 막힘
  const ok = (i, j) => {
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return false;
    const k = j * NX + i;
    if (!memo[k]) memo[k] = passable(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell) ? 1 : 2;
    return memo[k] === 1;
  };
  const cellOf = (x, z) => [Math.floor((x - x0) / cell), Math.floor((z - z0) / cell)];
  const center = (k) => ({ x: x0 + ((k % NX) + 0.5) * cell, z: z0 + (Math.floor(k / NX) + 0.5) * cell });
  /** (x,z) 에서 가장 가까운 지나갈 수 있는 칸 (r 칸 안) */
  const snap = (x, z, r = 4) => {
    const [ci, cj] = cellOf(x, z);
    let best = -1, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const d = di * di + dj * dj;
        if (d < bd && ok(ci + di, cj + dj)) {
          bd = d;
          best = (cj + dj) * NX + ci + di;
        }
      }
    }
    return best;
  };
  /** a → b 곧은 줄이 지나갈 수 있는 칸으로만 이어지나 */
  const clear = (a, b) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (cell * 0.5));
    for (let k = 1; k < n; k++) {
      const [i, j] = cellOf(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n);
      if (!ok(i, j)) return false;
    }
    return true;
  };

  /** (ax,az) → (bx,bz) 걸어갈 점들 [시작, ..., 끝] (못 가면 null) */
  function find(ax, az, bx, bz, maxNodes = 160000) {
    const s = snap(ax, az), g = snap(bx, bz, 8); // 목적지는 4m 안 가장 가까운 걸을 수 있는 곳까지 (길가 탑이 길 밖에 섰어도)
    if (s < 0 || g < 0) return null;
    const gi = g % NX, gj = Math.floor(g / NX);
    const H = (k) => {
      const dx = Math.abs((k % NX) - gi), dz = Math.abs(Math.floor(k / NX) - gj);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    const cost = new Map([[s, 0]]), from = new Map(), done = new Set();
    // 이진 힙 [f, k]
    const heap = [[H(s), s]];
    const push = (e) => {
      heap.push(e);
      for (let i = heap.length - 1; i > 0; ) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ; ) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    let found = false;
    while (heap.length && done.size < maxNodes) {
      const [, k] = pop();
      if (done.has(k)) continue;
      if (k === g) {
        found = true;
        break;
      }
      done.add(k);
      const i = k % NX, j = Math.floor(k / NX), c0 = cost.get(k);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if ((!di && !dj) || !ok(i + di, j + dj)) continue;
          if (di && dj && (!ok(i + di, j) || !ok(i, j + dj))) continue; // 모서리를 가로질러 끼지 않게
          const n = (j + dj) * NX + i + di;
          const c = c0 + (di && dj ? Math.SQRT2 : 1);
          if (c < (cost.get(n) ?? Infinity)) {
            cost.set(n, c);
            from.set(n, k);
            push([c + H(n), n]);
          }
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = g; k !== undefined; k = from.get(k)) cells.push(center(k));
    cells.reverse();
    const pts = [{ x: ax, z: az }, ...cells.slice(1, -1), { x: bx, z: bz }];
    if (!clear(pts[0], pts[1] || pts[0])) pts[0] = cells[0];
    const last = pts.length - 1;
    if (!clear(pts[last - 1] || pts[last], pts[last])) pts[last] = cells[cells.length - 1];
    // 줄 당기기: 보이는 가장 먼 점까지 곧게
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; ) {
      let j = i + 1;
      while (j + 1 < pts.length && clear(pts[i], pts[j + 1])) j++;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  return { find, ok: (x, z) => ok(...cellOf(x, z)) };
}

/** 점들의 길이 (m) */
export function pathLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return d;
}
