import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relevantUpdate, NEAR } from './relevance.js';

const peer = (sid, x, z) => ({ sid, name: '도반', style: 'monk', x, y: 0, z, ry: 0, a: 'idle', n: 0, ver: 1, sent: new Map(), rosterKey: '' });

test('near_every_tick_far_only_on_slow', () => {
  const me = peer(1, 0, 0), near = peer(2, 5, 0), far = peer(3, NEAR + 5, 0);
  const ready = [me, near, far], roster = [1, 2, 3];
  const a = relevantUpdate(me, ready, false, roster);
  assert.deepEqual(a.peers.map((r) => r[0]), [2]); // 먼 사람은 빠른 틱에 안 온다
  assert.deepEqual(a.ids, [2, 3]); // 처음엔 명단
  const b = relevantUpdate(me, ready, true, roster);
  assert.deepEqual(b.peers.map((r) => r[0]), [3]); // 느린 틱: 아직 못 받은 먼 사람만 (가까운 사람은 안 바뀌었다)
  assert.equal(b.ids, undefined);
  assert.equal(relevantUpdate(me, ready, true, roster), null); // 바뀐 게 없으면 보내지 않는다
});

test('changed_peer_resent_once', () => {
  const me = peer(1, 0, 0), near = peer(2, 5, 0);
  const ready = [me, near], roster = [1, 2];
  relevantUpdate(me, ready, false, roster);
  near.ver++;
  near.x = 6;
  assert.deepEqual(relevantUpdate(me, ready, false, roster).peers.map((r) => r[3]), [6]);
  assert.equal(relevantUpdate(me, ready, false, roster), null);
});

test('roster_change_sends_ids_and_forgets_left', () => {
  const me = peer(1, 0, 0), a = peer(2, 5, 0), b = peer(3, 6, 0);
  relevantUpdate(me, [me, a, b], false, [1, 2, 3]);
  const m = relevantUpdate(me, [me, a], false, [1, 2]); // 3 이 나갔다
  assert.deepEqual(m.ids, [2]);
  assert.equal(me.sent.has(3), false);
});
