# 물소리 섞임 검사 — 산 어디서나 들리는 녹음(산새·풀벌레·매미·돌풍·밤새·범종 …)에 물소리가 섞였는지 본다.
#   ~/Documents/Workspace/contents-factory/.venv/bin/python -I tools/audio/water_check.py web/assets/audio/nature
# 사용자 2026-11-06 「물길 근처가 아니면 물소리가 절대로 나면 안 된다」 — 물소리는 물길·연못 자리 소리(stream·spring·frogs)와 비 올 때만.
# 조각마다 조용한 프레임(하위 30%) = 바탕에서:
#   닮음  계곡 녹음(stream-*) 바탕과 스펙트럼 모양(1/3옥타브 250Hz~8kHz 로그 파워) 상관
#   쉬익  1~4kHz 띠가 바탕에서 차지하는 몫(dB) — 계곡 -3~-5, 비 -2, 저음 바람 -18
#   찰랑  1~4kHz 띠 세기가 4~20Hz 로 빨리 떨리는 몫 — 물 흐름은 0.7 안팎, 바람·새는 0.1~0.4
#   바탕  바탕 크기 / 큰 소리(상위 5%) dB
# 물 같음 = 닮음 ≥ 0.4 · 바탕 ≥ -20dB · (찰랑 ≥ 0.5 또는 쉬익 ≥ -6dB). 산 어디서나 들리는 조각 중 하나라도 물 같으면 종료 코드 1.
# (2026-11-06 실측: 수리부엉이 4개 닮음 0.44~0.49 · 찰랑 0.56~0.76 · 바탕 -7~-14dB, 800Hz 걷기 전 돌풍 닮음 0.6 · 쉬익 -4dB)
import glob, os, subprocess, sys

import numpy as np

SR = 22050
EDGES = 250 * 2 ** (np.arange(0, 15.1, 1 / 3))
EDGES = EDGES[EDGES <= 8000]
# 자리와 무관하게 산 어디서나 울리는 것 (natureSounds.js: 자리 소리가 아닌 배경·원샷)
MOUNTAIN = ('gust-', 'birds-', 'crickets-', 'cicadas-', 'scops-', 'owl-', 'bell-', 'chime', 'thunder-')


def pcm(f):
    return np.frombuffer(subprocess.check_output(['ffmpeg', '-v', 'error', '-i', f, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-']), dtype=np.float32)


def stft(x, n, hop):
    fr = np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * np.hanning(n)
    return np.abs(np.fft.rfft(fr, axis=1)) ** 2, np.fft.rfftfreq(n, 1 / SR)


def measure(f):
    x = pcm(f)
    if len(x) < SR:
        return None
    P, hz = stft(x, 2048, 1024)
    B = np.stack([P[:, (hz >= a) & (hz < b)].sum(1) for a, b in zip(EDGES[:-1], EDGES[1:])], 1) + 1e-12
    tot = B.sum(1)
    q = tot <= np.quantile(tot, 0.3)
    floor = np.median(B[q], 0)
    hiss_band = (EDGES[:-1] >= 1000) & (EDGES[1:] <= 4100)
    hiss = 10 * np.log10(floor[hiss_band].sum() / floor.sum())
    bg = 10 * np.log10(floor.sum() / np.quantile(tot, 0.95))
    # 찰랑: 1~4kHz 띠의 로그 세기를 4초 창마다 변조 스펙트럼으로
    P2, hz2 = stft(x, 1024, 256)
    e = np.log10(P2[:, (hz2 >= 1000) & (hz2 < 4000)].sum(1) + 1e-12)
    fs = SR / 256
    W = int(fs * 4)
    fl = []
    for i in range(0, len(e) - W, W // 2):
        s = e[i:i + W] - e[i:i + W].mean()
        M = np.abs(np.fft.rfft(s * np.hanning(W))) ** 2
        mh = np.fft.rfftfreq(W, 1 / fs)
        fl.append(M[(mh >= 4) & (mh < 20)].sum() / (M[(mh >= 0.25) & (mh < 20)].sum() + 1e-12))
    return np.log10(floor), hiss, (float(np.median(fl)) if fl else 0.0), bg


paths = sys.argv[1:] or ['web/assets/audio/nature']
files = []
for p in paths:
    files += sorted(glob.glob(os.path.join(p, '*.m4a'))) if os.path.isdir(p) else [p]
res = {os.path.basename(f)[:-4]: measure(f) for f in files}
res = {k: v for k, v in res.items() if v}
ref = np.mean([v[0] - v[0].mean() for k, v in res.items() if k.startswith('stream-')], 0)
bad = []
print(f"{'조각':<24} {'닮음':>5} {'쉬익':>6} {'찰랑':>5} {'바탕':>7}  판정")
for k, (lf, hiss, flick, bg) in sorted(res.items()):
    s = lf - lf.mean()
    corr = float(np.corrcoef(s, ref)[0, 1]) if s.std() > 0 else 0.0
    water = corr >= 0.4 and bg >= -20 and (flick >= 0.5 or hiss >= -6)
    mountain = k.startswith(MOUNTAIN)
    verdict = ('✗ 산 어디서나 들리는데 물 같음' if mountain else '물 같음 — 자리 소리라 그 자리 곁에서만 (물길·연못·비·마당 비질)') if water else ''
    if water and mountain:
        bad.append(k)
    print(f"{k:<24} {corr:5.2f} {hiss:5.1f}dB {flick:5.2f} {bg:5.1f}dB  {verdict}")
print(f"\n산 어디서나 들리는 조각 중 물 같은 것 {len(bad)}개" + (': ' + ', '.join(bad) if bad else ' — 없음'))
sys.exit(1 if bad else 0)
