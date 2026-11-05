import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 브라우저 localStorage 흉내
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
const KEY = 'meta_temple_cheongyeon_state_v1';
const { TempleStore, migrateState } = await import('./state.js');

beforeEach(() => mem.clear());

const V2 = {
  version: 2,
  profile: { userId: 'u-1', dharmaName: '청풍', avatarStyle: 'ink_wanderer', stats: { bowCount: 108 }, attendance: { totalDays: 3, streak: 2, lastDate: '2026-11-01' }, unlockedItems: ['wooden_mala'] },
  settings: { time: 'realtime', weather: 'rain' },
  lanterns: [],
  tiles: [],
  stones: []
};

test('migrate_v2_keeps_records', () => {
  const s = migrateState(structuredClone(V2));
  assert.equal(s.schemaVersion, 3);
  assert.equal(s.profileId, 'u-1');
  assert.equal(s.profile.dharmaName, '청풍');
  assert.equal(s.profile.nameIsCustom, false);
  assert.equal(s.profile.stats.bowCount, 108);
  assert.equal(s.profile.stats.malaCount, 0);
  assert.equal(s.profile.attendance.totalDays, 3);
  assert.deepEqual(s.profile.unlockedItems, ['wooden_mala']);
  assert.equal(s.settings.weather, 'rain');
});

test('store_loads_v2_from_storage_and_saves_v3', () => {
  mem.set(KEY, JSON.stringify(V2));
  const st = new TempleStore();
  assert.equal(st.isReturning, true);
  assert.equal(st.profileId, 'u-1');
  const saved = JSON.parse(mem.get(KEY));
  assert.equal(saved.schemaVersion, 3);
  assert.equal(saved.profileId, 'u-1');
  assert.equal(saved.profile.userId, 'u-1'); // 캐시된 옛 화면이 읽는 별칭
  assert.ok(Date.parse(saved.updatedAt) > 0);
});

test('fresh_profile_has_id', () => {
  const st = new TempleStore();
  assert.match(st.profileId, /^[0-9a-f-]{36}$/);
  assert.equal(st.isReturning, false);
});

test('custom_name_rejects_bad', () => {
  const st = new TempleStore();
  const before = st.profile.dharmaName;
  const r = st.setDharmaName('씨발', { custom: true });
  assert.equal(r.ok, false);
  assert.equal(st.profile.dharmaName, before);
});

test('custom_name_accepts', () => {
  const st = new TempleStore();
  const r = st.setDharmaName('  달빛 머문 도반 ', { custom: true });
  assert.equal(r.ok, true);
  assert.equal(st.profile.dharmaName, '달빛 머문 도반');
  assert.equal(st.profile.nameIsCustom, true);
  st.setDharmaName('청풍 바위');
  assert.equal(st.profile.nameIsCustom, false);
});

test('export_import_roundtrip', () => {
  const st = new TempleStore();
  st.addStat('bowCount', 5);
  const json = st.exportState();
  mem.clear();
  const other = new TempleStore();
  assert.notEqual(other.profileId, st.profileId);
  assert.deepEqual(other.importState(json), { ok: true });
  assert.equal(other.profileId, st.profileId);
  assert.equal(other.stats.bowCount, 5);
  assert.equal(other.importState('{broken').ok, false);
  assert.equal(other.importState('{"foo":1}').ok, false);
  assert.equal(other.profileId, st.profileId); // 실패한 가져오기는 아무것도 바꾸지 않는다
});

test('reported_shared_stays_hidden', () => {
  const st = new TempleStore();
  const shared = { stones: [{ id: 's_x1', author: '남', wish: '나쁜 말', createdAt: '2026-11-05T00:00:00Z' }, { id: 's_x2', author: '남', wish: '좋은 말', createdAt: '2026-11-05T00:00:01Z' }] };
  st.mergeShared(shared);
  assert.equal(st.state.stones.filter((s) => s.shared).length, 2);
  st.hideReported('s_x1');
  assert.equal(st.state.stones.some((s) => s.id === 's_x1'), false);
  st.mergeShared(shared); // 다음에 다시 받아도
  assert.equal(st.state.stones.some((s) => s.id === 's_x1'), false);
  assert.equal(st.state.stones.some((s) => s.id === 's_x2'), true);
  assert.deepEqual(JSON.parse(localStorage.getItem(KEY)).reported, ['s_x1']); // 새로고침해도
});
