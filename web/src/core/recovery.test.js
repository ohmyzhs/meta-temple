import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newKey, formatKey, parseKey, backupId, sealBackup, openBackup, KEY_LEN } from './recovery.js';

test('key_format_and_parse', () => {
  const k = newKey();
  assert.equal(k.length, KEY_LEN);
  assert.match(formatKey(k), /^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(parseKey(formatKey(k)), k);
  assert.equal(parseKey(` ${formatKey(k).toLowerCase()} `), k); // 소문자·앞뒤 공백
  assert.equal(parseKey(k.slice(0, 4) + ' ' + k.slice(4)), k);
  assert.equal(parseKey('O' + k.slice(1)), parseKey('0' + k.slice(1))); // O 는 0
  assert.equal(parseKey('l' + k.slice(1)), parseKey('1' + k.slice(1))); // l 은 1
  assert.equal(parseKey(k.slice(1)), null); // 짧음
  assert.equal(parseKey('U' + k.slice(1)), null); // 없는 글자
  assert.notEqual(newKey(), newKey());
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
  await assert.rejects(openBackup(data, newKey()));
  const b = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  b[b.length - 1] ^= 1;
  await assert.rejects(openBackup(btoa(String.fromCharCode(...b)), k));
  assert.notEqual(await backupId(k), await backupId(newKey()));
});
