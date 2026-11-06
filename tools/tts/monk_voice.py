"""차담 스님 목소리를 미리 녹음한다 — Typecast 권일 · 낮은 톤(tonedown) · 속도 0.8 (2026-11-06 사용자가 고름).

  node tools/tts/monk-lines.mjs > /tmp/monk-lines.json
  CF_WORKSPACE=~/Documents/Workspace/cf-studio ~/Documents/Workspace/contents-factory/.venv/bin/python \
      tools/tts/monk_voice.py /tmp/monk-lines.json

- Typecast 호출은 contents-factory 엔진(factory.tts._typecast)을 그대로 쓴다. API 키는 엔진이 작업실 .env 에서 읽는다
  (이 저장소에는 키를 두지 않는다). 1글자 = 1크레딧.
- 이미 있는 파일은 건너뛴다. 목록에서 빠진 문장의 파일은 지운다. 결과: web/assets/audio/monk/<key>.mp3 + index.json
"""
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'web', 'assets', 'audio', 'monk')
ENGINE = os.environ.get('CF_ENGINE', os.path.expanduser('~/Documents/Workspace/contents-factory'))
FFMPEG = os.environ.get('CF_FFMPEG', 'ffmpeg')
VOICE = {'voice': '권일', 'model': 'ssfm-v31', 'emotion': 'tonedown', 'tempo': 0.8, 'pitch_st': 0}

sys.path.insert(0, ENGINE)
from factory import tts  # noqa: E402

lines = json.load(open(sys.argv[1], encoding='utf-8'))
os.makedirs(OUT, exist_ok=True)
keys = {x['key'] for x in lines}
made = chars = 0
for x in lines:
    mp3 = os.path.join(OUT, x['key'] + '.mp3')
    if os.path.exists(mp3):
        continue
    wav = mp3[:-4] + '.wav'
    tts._typecast(x['text'], VOICE['voice'], wav, {k: VOICE[k] for k in ('model', 'emotion', 'tempo', 'pitch_st')})
    # 말소리라 모노 24kHz 40kbps 면 충분하다 (한 줄 약 10초 ≈ 50KB)
    subprocess.run([FFMPEG, '-v', 'quiet', '-y', '-i', wav, '-ac', '1', '-ar', '24000', '-b:a', '40k', mp3], check=True)
    os.remove(wav)
    made += 1
    chars += len(x['text'])
    print(f"{x['key']} {len(x['text'])}자 {x['text'][:24]}…", flush=True)
for f in os.listdir(OUT):
    if f.endswith('.mp3') and f[:-4] not in keys:
        os.remove(os.path.join(OUT, f))
        print('지움', f)
with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as fp:
    json.dump({**VOICE, 'voice_id': tts.typecast_voice_id(VOICE['voice']), 'keys': sorted(keys)}, fp, ensure_ascii=False, indent=1)
print(f'새로 만든 것 {made}개 · {chars}자(크레딧) · 모두 {len(keys)}개')
