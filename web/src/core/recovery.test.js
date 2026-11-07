import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newKey, formatKey, parseKey, backupId, sealBackup, openBackup, KEY_LEN } from './recovery.js';

test('key_format_and_parse', () => {
  const k = newKey();
  assert.equal(k.length, KEY_LEN);
  assert.match(k, /^[A-HJ-NP-Za-km-z2-9]{6}$/); // 0 O o 1 l I 없음
  assert.equal(parseKey(formatKey(k)), k);
  assert.equal(parseKey(` ${k.slice(0, 2)}-${k.slice(2)} `), k); // 띄어쓰기·줄표 무시
  assert.equal(parseKey('aB3kPz'), 'aB3kPz');
  assert.notEqual(parseKey('aB3kPz'), parseKey('AB3KPZ')); // 대·소문자 구별
  assert.equal(parseKey('aB3kP'), null); // 짧음
  assert.equal(parseKey('aB3kP0'), null); // 헷갈리는 글자는 키에 없다
  const seen = new Set(Array.from({ length: 2000 }, newKey));
  assert.ok(seen.size > 1990, '거의 겹치지 않는다');
  const chars = new Set([...seen].join(''));
  assert.equal(chars.size, 56, '56자가 모두 나온다');
});

test('seal_open_roundtrip_and_privacy', async () => {
  const k = newKey();
  const json = JSON.stringify({ profile: { dharmaName: '청풍', note: '가'.repeat(5000) } });
  const { id, data } = await sealBackup(json, k);
  assert.match(id, /^[0-9a-f]{64}$/);
  assert.equal(id, await backupId(k)); // 되찾을 때 같은 조회값
  assert.equal(await openBackup(data, k), json);
  assert.ok(!atob(data).includes('dharmaName'), '평문이 보이면 안 된다');
  assert.ok(data.length < json.length / 2, `gzip 으로 줄어야 한다 (${data.length} / ${json.length})`);
  const again = await sealBackup(json, k);
  assert.notEqual(again.data, data); // IV 가 매번 다르다
});

test('wrong_key_or_tampered_fails', async () => {
  const k = newKey();
  const { data } = await sealBackup('{"a":1}', k);
  await assert.rejects(openBackup(data, k === 'aB3kPz' ? 'aB3kPx' : 'aB3kPz'));
  const b = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  b[b.length - 1] ^= 1;
  await assert.rejects(openBackup(btoa(String.fromCharCode(...b)), k));
  assert.notEqual(await backupId('aB3kPz'), await backupId('AB3kPz'));
});
