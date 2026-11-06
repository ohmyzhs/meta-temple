// 미리 녹음할 스님 대사 목록 → JSON (tools/tts/monk_voice.py 가 읽는다)
//   node tools/tts/monk-lines.mjs > /tmp/monk-lines.json
import { MONK_VOICE_LINES, voiceKey } from '../../web/src/data/dharmaTexts.js';

console.log(JSON.stringify(MONK_VOICE_LINES.map((text) => ({ key: voiceKey(text), text })), null, 1));
