# 말소리 검사 — 자연의 소리 조각에 내레이션·사람 말이 섞였는지 받아쓰기로 본다.
#   HF_HUB_OFFLINE=1 ~/Documents/Workspace/contents-factory/.venv/bin/python -I tools/audio/voice_check.py web/assets/audio/nature
#   (faster-whisper 는 contents-factory 가상환경에, 모델은 ~/.cache/huggingface/hub 에 이미 있다 — 새로 받지 않는다)
# 한국어, VAD 로 말소리 구간만 받아쓴다. 글자가 나온 조각을 적고, 하나라도 있으면 종료 코드 1.
# 염불(chant-*)은 원래 목소리라 빼고 본다. --model small|medium|large-v3 (기본 small), --json 결과파일
import argparse, glob, json, os, subprocess, sys

import numpy as np
from faster_whisper import WhisperModel

ap = argparse.ArgumentParser()
ap.add_argument('paths', nargs='+', help='폴더(안의 *.m4a) 또는 파일')
ap.add_argument('--model', default='small')
ap.add_argument('--allow', default='chant-', help='이 이름으로 시작하는 조각은 목소리가 있어도 된다')
ap.add_argument('--json')
ap.add_argument('--no-vad', action='store_true', help='VAD 없이 전부 받아쓴다 — 물소리 아래 작은 말소리까지 (헛받아쓰기가 늘어 귀로 확인)')
a = ap.parse_args()

files = []
for p in a.paths:
    files += sorted(glob.glob(os.path.join(p, '*.m4a'))) if os.path.isdir(p) else [p]
model = WhisperModel(a.model, device='cpu', compute_type='int8')
out, bad = [], []
for f in files:
    # PyAV 판이 faster-whisper 와 맞지 않아 ffmpeg 로 16kHz 모노 PCM 을 직접 넘긴다
    pcm = np.frombuffer(subprocess.check_output(['ffmpeg', '-v', 'error', '-i', f, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-']), dtype=np.float32)
    segs, _ = model.transcribe(pcm, language='ko', vad_filter=not a.no_vad, beam_size=1, condition_on_previous_text=False)
    hits = [(round(s.start, 1), round(s.end, 1), s.text.strip()) for s in segs if s.text.strip()]
    name = os.path.basename(f)
    allowed = name.startswith(a.allow) if a.allow else False
    out.append({'f': name, 'hits': hits, 'allowed': allowed})
    if hits and not allowed:
        bad.append(name)
    mark = '·' if not hits else ('(염불)' if allowed else '✗')
    print(f"{mark:<5} {name:<28} " + ' | '.join(f'{s}-{e}s {t}' for s, e, t in hits[:3]), flush=True)
if a.json:
    json.dump(out, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f"\n{len(files)}개 중 말소리 {len(bad)}개" + (': ' + ', '.join(bad) if bad else ' — 깨끗함'))
sys.exit(1 if bad else 0)
