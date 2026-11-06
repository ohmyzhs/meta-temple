// 스님 대사를 고치면 녹음도 다시 해야 한다 — 목록의 모든 문장에 mp3 가 있는지 (없으면 tools/tts/monk_voice.py)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MONK_VOICE_LINES, voiceKey, TEA_LINES, localMonkResponse, DHARMA_CARDS, cardVoiceText } from '../data/dharmaTexts.js';

const dir = fileURLToPath(new URL('../../assets/audio/monk/', import.meta.url));

test('every_fixed_monk_line_is_recorded', () => {
  const index = JSON.parse(readFileSync(dir + 'index.json', 'utf8'));
  assert.equal(index.voice, '권일');
  assert.equal(index.emotion, 'tonedown');
  const missing = MONK_VOICE_LINES.filter((t) => !existsSync(`${dir}${voiceKey(t)}.mp3`) || !index.keys.includes(voiceKey(t)));
  assert.deepEqual(missing, [], '녹음이 없는 대사 — tools/tts/monk_voice.py 를 다시 돌린다');
});

test('offline_replies_are_exactly_the_recorded_lines', () => {
  for (const said of ['', '요즘 잠을 잘 못 자요', '외로워요', '이제 가 볼게요', '아무 말']) {
    assert.ok(MONK_VOICE_LINES.includes(localMonkResponse(said, []).reply), said);
  }
  for (const t of Object.values(TEA_LINES)) assert.ok(MONK_VOICE_LINES.includes(t), t);
  for (const c of DHARMA_CARDS) assert.ok(MONK_VOICE_LINES.includes(cardVoiceText(c)), c.id); // 죽비는 모두 녹음
  assert.equal(cardVoiceText(DHARMA_CARDS.find((c) => c.id === 'sa_arrow')).split('.')[0], '잡아함경, 전경'); // 괄호·낫표는 읽지 않는다
  assert.equal(voiceKey('가'), voiceKey('가'.normalize('NFD').normalize('NFC')));
});
