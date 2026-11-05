// node --test web/src/ui/icons.test.js — 스프라이트에 화면이 쓰는 아이콘이 모두 있는지
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { icon, ICON_NAMES, ZONE_ICONS } from './icons.js';

const sprite = readFileSync(new URL('../../assets/icons/icons.svg', import.meta.url), 'utf8');
const symbols = new Map([...sprite.matchAll(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/g)].map(([, attrs, body]) => [/\bid="([^"]+)"/.exec(attrs)?.[1], { attrs, body }]));

const PLAN = {
  행동: 'bow_half prostrate meditate incense circumambulate tea',
  도구: 'menu time_weather sound self record help credits close more back',
  장소: 'zone_forest zone_courtyard zone_hall zone_teahouse',
  신행: 'stone_pagoda wish_lantern wish_tile burn_worry bell_strike practice_108 sutra_copy yebul tea_chat dharma_card'
};

test('sprite_has_every_planned_symbol', () => {
  for (const [group, names] of Object.entries(PLAN)) {
    for (const n of names.split(' ')) assert.ok(symbols.has(n), `${group}: #${n} 없음`);
  }
});

test('symbols_are_24_grid_with_content', () => {
  for (const [id, { attrs, body }] of symbols) {
    assert.match(attrs, /viewBox="0 0 24 24"/, `#${id} viewBox`);
    assert.ok(/<(path|circle|ellipse|rect|line|polyline)\b/.test(body), `#${id} 비어 있음`);
  }
});

test('icon_names_match_sprite', () => {
  assert.deepEqual([...ICON_NAMES].sort(), [...symbols.keys()].sort());
  for (const z of Object.values(ZONE_ICONS)) assert.ok(symbols.has(z), z);
});

test('icon_markup', () => {
  const plain = icon('menu');
  assert.match(plain, /<svg[^>]*aria-hidden="true"/);
  assert.match(plain, /<use href="\.\/assets\/icons\/icons\.svg\?v=\d+#menu"/);
  const named = icon('help', { label: '도움말' });
  assert.match(named, /role="img"/);
  assert.match(named, /aria-label="도움말"/);
  assert.doesNotMatch(named, /aria-hidden/);
  assert.match(icon('x', { label: '"<&' }), /aria-label="&quot;&lt;&amp;"/);
});
