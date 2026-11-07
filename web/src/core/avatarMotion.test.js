import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickMotion, fadeFor } from './avatarMotion.js';

const TRIAL = ['idle', 'idle_chasu', 'walk', 'walk_chasu', 'walk_gassho', 'bow_half', 'prostrate', 'sit'];
const hasOf = (list) => (n) => list.includes(n);
const has = hasOf(TRIAL);

test('걸을 때는 경내·숲길 모두 팔을 흔들고, 경내에 서 있을 때만 차수', () => {
  assert.equal(pickMotion({ speed: 1.5, zone: 'COURTYARD', has }), 'walk');
  assert.equal(pickMotion({ speed: 1.5, zone: 'DAEUNGJEON', has }), 'walk');
  assert.equal(pickMotion({ speed: 1.5, zone: 'FOREST', has }), 'walk');
  assert.equal(pickMotion({ speed: 0, zone: 'COURTYARD', has }), 'idle_chasu');
  assert.equal(pickMotion({ speed: 0, zone: 'FOREST', has }), 'idle');
});

test('빠르게 걷기: FAST_AT 넘으면 가벼운 뜀 클립, 없으면 걷기로', async () => {
  const { FAST_AT, FAST_SPEED, WALK_SPEED } = await import('./avatarMotion.js');
  const withFast = hasOf([...TRIAL, 'walk_fast']);
  assert.equal(pickMotion({ speed: FAST_SPEED, zone: 'COURTYARD', has: withFast }), 'walk_fast');
  assert.equal(pickMotion({ speed: FAST_AT - 0.1, zone: 'FOREST', has: withFast }), 'walk');
  assert.equal(pickMotion({ speed: FAST_SPEED, zone: 'FOREST', has }), 'walk'); // 클립이 없는 옛 GLB
  assert.ok(WALK_SPEED < FAST_AT && FAST_AT < FAST_SPEED);
  assert.ok(Math.abs(FAST_SPEED / WALK_SPEED - 2.5) < 1e-9, '빠르게 걷기는 걷기의 2.5배');
});

test('탑돌이는 합장하고 걷는다', () => {
  assert.equal(pickMotion({ state: 'circumambulate', speed: 0.95, zone: 'COURTYARD', has }), 'walk_gassho');
});

test('한 번짜리 동작이 걷기·상태보다 먼저', () => {
  assert.equal(pickMotion({ seq: 'prostrate', state: 'sit', speed: 0, has }), 'prostrate');
  assert.equal(pickMotion({ seq: 'bow_half', speed: 2, zone: 'FOREST', has }), 'bow_half');
});

test('기존 상태 이름은 모두 클립이 붙는다 (없는 클립은 가까운 것으로)', () => {
  for (const state of ['idle', 'sit', 'meditate', 'tea', 'circumambulate', 'lookUp', 'walk']) {
    assert.ok(TRIAL.includes(pickMotion({ state, has })), state);
  }
  assert.equal(pickMotion({ state: 'tea', has }), 'sit');
  assert.equal(pickMotion({ state: 'meditate', has }), 'sit');
  assert.equal(pickMotion({ seq: 'incense', has }), 'bow_half');
  assert.equal(pickMotion({ seq: 'offer_stone', has }), 'bow_half');
  assert.equal(pickMotion({ state: 'lookUp', zone: 'COURTYARD', has }), 'idle');
});

test('모르는 상태(새 클라이언트가 보낸 이름)는 서 있는 동작으로', () => {
  assert.equal(pickMotion({ state: 'mala_future', zone: 'FOREST', has }), 'idle');
  assert.equal(pickMotion({ seq: 'unknown_once', state: 'idle', zone: 'FOREST', has }), 'idle');
});

test('클립이 하나도 없으면 null (절차식 아바타로 돌아간다)', () => {
  assert.equal(pickMotion({ state: 'sit', has: () => false }), null);
});

test('크로스페이드: 처음은 0, 앉고 서기는 더 길게', () => {
  assert.equal(fadeFor(null, 'idle'), 0);
  assert.ok(fadeFor('idle', 'sit') > fadeFor('idle', 'walk'));
  assert.ok(fadeFor('walk', 'walk_chasu') > 0);
  assert.equal(fadeFor('prostrate', 'sit'), fadeFor('idle', 'sit')); // 큰절은 서서 끝난다
});

test('반가부좌 ↔ 선 자세 사이에는 일어서기·앉기를 넣는다 (걸어 나갈 때는 빼고)', async () => {
  const { transitionFor } = await import('./avatarMotion.js');
  const has = (n) => ['sit', 'idle', 'prostrate', 'stand_up', 'sit_down', 'walk'].includes(n);
  assert.equal(transitionFor('sit', 'prostrate', false, has), 'stand_up');
  assert.equal(transitionFor('sit', 'idle', false, has), 'stand_up');
  assert.equal(transitionFor('idle', 'sit', false, has), 'sit_down');
  assert.equal(transitionFor('prostrate', 'sit', false, has), 'sit_down');
  assert.equal(transitionFor('sit', 'walk', true, has), null);
  assert.equal(transitionFor('stand_up', 'idle', false, has), null);
  assert.equal(transitionFor('sit', 'idle', false, (n) => n !== 'stand_up'), null); // 클립이 없으면 바로 섞는다
});

test('큰절 시각이 구운 GLB(monk.json)와 같다', async () => {
  const { readFile } = await import('node:fs/promises');
  const { PROSTRATE } = await import('./avatarMotion.js');
  const meta = JSON.parse(await readFile(new URL('../../assets/avatars/monk.json', import.meta.url), 'utf8'));
  const c = meta.clips.prostrate;
  assert.ok(Math.abs(c.duration - PROSTRATE.length) < 1e-6, `${c.duration} ≠ ${PROSTRATE.length}`);
  assert.equal(c.foreheadAt, PROSTRATE.forehead);
  assert.deepEqual(c.rustle, PROSTRATE.rustle);
  assert.ok(Math.abs(c.foreheadMinAt - PROSTRATE.forehead) < 1 / 30 + 1e-6, '이마가 정한 때 바닥에 닿는다');
  for (const n of ['stand_up', 'sit_down']) assert.ok(meta.clips[n], n);
  assert.ok(!meta.clips.run, '달리기는 없앴다');
  const { WALK_SPEED, FAST_SPEED } = await import('./avatarMotion.js');
  for (const n of ['walk', 'walk_chasu', 'walk_gassho']) assert.ok(Math.abs(meta.clips[n].speed - WALK_SPEED) < 1e-6, `${n} 은 게임 걷기 속도(${WALK_SPEED}m/s)로 굽는다`);
  assert.ok(Math.abs(meta.clips.walk_fast.speed - FAST_SPEED) < 1e-6, `빠르게 걷기는 ${FAST_SPEED}m/s 로 굽는다`);
  for (const n of ['walk', 'walk_fast']) assert.ok(meta.clips[n].slip < 0.01, `${n}: 디딤발이 미끄러지지 않는다 (${meta.clips[n].slip}m/s)`);
  assert.ok(meta.label?.head && meta.label?.hat, '이름표 자리(머리·삿갓 타원체)');
});

test('넓힌 동작: 상태마다 제 클립, 다실 선사는 앉은 채 찻잔을 건넨다', async () => {
  const { pickMotion, ACTION_STATES } = await import('./avatarMotion.js');
  const { readFile } = await import('node:fs/promises');
  const meta = JSON.parse(await readFile(new URL('../../assets/avatars/monk.json', import.meta.url), 'utf8'));
  const has = (n) => !!meta.clips[n];
  for (const [o, want] of [[{ state: 'meditate' }, 'meditate'], [{ state: 'tea' }, 'tea'], [{ state: 'sutra' }, 'sutra'], [{ state: 'lookUp' }, 'look_up'],
    [{ state: 'circumambulate' }, 'gassho'], [{ seq: 'incense' }, 'incense'], [{ seq: 'incense', seated: true }, 'serve_tea'],
    [{ seq: 'offer_stone' }, 'offer_stone'], [{ seq: 'write_tile' }, 'write_tile'], [{ seq: 'hang_lantern' }, 'hang_lantern']]) {
    assert.equal(pickMotion({ ...o, has }), want, JSON.stringify(o));
  }
  // 서버 허용 목록과 같은 이름들 (server.js ACTIONS), 사경은 'sit' 으로 보낸다
  const server = await readFile(new URL('../../../server/server.js', import.meta.url), 'utf8');
  const actions = server.match(/const ACTIONS = new Set\(\[([^\]]*)\]/)[1];
  for (const a of ACTION_STATES) assert.ok(actions.includes(`'${a}'`), `server ACTIONS 에 ${a}`);
  assert.ok(!actions.includes("'sutra'"));
  const { wireState } = await import('./avatarMotion.js');
  assert.equal(wireState('sutra'), 'sit');
  assert.equal(wireState('meditate'), 'meditate');
});

test('연꽃 등불 정령: 없는 동작은 가까운 것으로', async () => {
  const { pickMotion } = await import('./avatarMotion.js');
  const { readFile } = await import('node:fs/promises');
  const meta = JSON.parse(await readFile(new URL('../../assets/avatars/spirit.json', import.meta.url), 'utf8'));
  const has = (n) => !!meta.clips[n];
  assert.equal(pickMotion({ speed: 1.5, zone: 'COURTYARD', has }), 'walk');
  assert.equal(pickMotion({ speed: 3.75, zone: 'FOREST', has }), 'walk_fast');
  const { WALK_SPEED, FAST_SPEED } = await import('./avatarMotion.js');
  assert.equal(meta.clips.walk.speed, WALK_SPEED);
  assert.equal(meta.clips.walk_fast.speed, FAST_SPEED);
  assert.equal(pickMotion({ state: 'meditate', has }), 'sit');
  assert.equal(pickMotion({ seq: 'write_tile', has }), 'bow_half');
  assert.equal(pickMotion({ state: 'circumambulate', has }), 'idle');
});
