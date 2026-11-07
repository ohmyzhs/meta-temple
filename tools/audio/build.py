#!/usr/bin/env python3
"""
자연의 소리 가공 — 받아 둔 원본에서 조각을 잘라 web/assets/audio/nature/ 에 m4a·mp3 로 낸다 (ffmpeg 만 씀).

  python3 tools/audio/build.py check <원본파일> [--every 60]   스펙트로그램 PNG (사람 소리·잡음 눈으로 확인)
  python3 tools/audio/build.py build [이름...]                 manifest.json 대로 만들기 (이름을 주면 그것만)
  python3 tools/audio/build.py asmr [id...]                   테마 ASMR 원음 → web/assets/audio/asmr/ + web/src/data/asmr.js
  python3 tools/audio/build.py report                          만든 파일의 길이·LUFS·크기 표
  python3 tools/audio/build.py scan <원본> [--len 50] [--skip 15]  배경으로 쓸 만한 고른 구간 찾기 (3초 단기 음량이 들쭉날쭉하지 않은 곳)
  python3 tools/audio/build.py credits                         web/src/data/credits.js 의 자연의 소리 출처를 manifest 대로 다시 쓴다

원본 폴더: AUDIO_RAW (기본 tools/audio/raw/ — git 에 넣지 않는다). 출처·라이선스는 manifest.json 의 sources.

처리 순서 (한 조각마다)
  1) 자르기: 원본 [from, to] 초 → 48kHz, 25Hz 아래 웅웅거림 걷기, mono 면 두 채널 평균
  2) 크기 맞추기: 배경(bed)은 -24 LUFS (soundEngine REC_BED 보정 기준). 원샷(shot)은 manifest 의 lufs (지금 쓰는 파일과 같은 크기)
     — loudnorm 은 다이내믹 모드로 넘어가 자연스러운 크고 작음을 눌러 버릴 수 있어서, 잰 만큼 한 번에 올리고 내린다(선형).
       봉우리가 -1 dBTP 를 넘을 때만 리미터가 닿는다.
  3) 반복 이음새: 배경은 끝 XF 초를 처음 XF 초에 등전력 교차 페이드로 겹친다 → 파일 끝에서 처음으로 이어 돌아도 이음새가 없다
  4) 인코딩: m4a (AAC, 48kHz, 스테레오 128k / 모노 80k) + mp3 (같은 비트레이트, AAC 를 못 푸는 브라우저용)

효과음 묶음(kind: sprite): 걸음·딸깍처럼 짧은 소리를 구간에서 자동으로 찾아(에너지 봉우리) 하나씩 잘라
  slot 초 간격으로 한 파일에 담는다 — 엔진은 칸 하나(i·slot 부터 len 초)를 골라 튼다. 재질마다 파일 하나만 받으면 된다.
  manifest: { kind: 'sprite', n: 최대 개수, slot: 칸 길이, len: 소리 길이, gap: 봉우리 사이 최소 간격, starts: [수동 시각…] }
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
RAW = Path(os.environ.get('AUDIO_RAW', HERE / 'raw'))
OUT = Path(os.environ.get('AUDIO_OUT', ROOT / 'web/assets/audio/nature'))
MANIFEST = Path(os.environ.get('AUDIO_MANIFEST', HERE / 'manifest.json'))
BED_LUFS = -24.0
TP_MAX = -1.0
XF = 3.0  # 반복 이음새 교차 페이드(초)
RATE = {2: '128k', 1: '80k'}


def ff(args, capture=True):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-y', *args], capture_output=capture, text=True)
    if r.returncode:
        sys.exit(f'ffmpeg 실패: {" ".join(args)}\n{r.stderr[-2000:]}')
    return r.stderr


def loudness(path, filt=None):
    """(통합 LUFS, true peak dBTP)"""
    af = (filt + ',' if filt else '') + 'ebur128=peak=true'
    err = ff(['-i', str(path), '-af', af, '-f', 'null', '-'])
    summary = err[err.rfind('Summary:'):]
    i = float(re.search(r'I:\s+(-?[\d.]+|-inf) LUFS', summary).group(1).replace('-inf', '-70'))
    tp = float(re.search(r'True peak:\s+Peak:\s+(-?[\d.]+|-inf)', summary).group(1).replace('-inf', '-70'))
    return i, tp


def probe(path):
    o = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size:stream=channels,sample_rate,codec_name', '-of', 'json', str(path)]))
    s = o['streams'][0]
    return float(o['format']['duration']), int(o['format']['size']), s['channels'], int(s['sample_rate']), s['codec_name']


def aac_codec():
    enc = subprocess.run(['ffmpeg', '-hide_banner', '-encoders'], capture_output=True, text=True).stdout
    return 'aac_at' if ' aac_at ' in enc else 'aac'


def make_sprite(cut, out_wav, ch, n=12, slot=0.6, length=0.45, gap=0.3, starts=None, pre=0.02):
    """구간에서 짧은 소리를 찾아 slot 간격으로 늘어놓는다. 반환: 담은 개수"""
    import numpy as np
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(cut), '-f', 'f32le', '-ac', str(ch), '-ar', '48000', '-'])
    y = np.frombuffer(raw, dtype=np.float32).reshape(-1, ch)
    sr, hop = 48000, 120  # 2.5ms
    mono = np.abs(y).mean(axis=1)
    win = 480  # 10ms 이동 평균
    env = np.sqrt(np.convolve(mono ** 2, np.ones(win) / win, mode='same'))[::hop]
    if starts:
        onsets = [int(t * sr) for t in starts]
    else:
        thr = max(np.percentile(env, 50) * 4, env.max() * 0.08)
        peaks = []
        for i in np.argsort(env)[::-1]:
            if env[i] < thr:
                break
            if all(abs(i - j) * hop > gap * sr for j in peaks):
                peaks.append(i)
        onsets = []
        for i in sorted(peaks):
            j = i
            while j > 0 and env[j] > env[i] * 0.25:
                j -= 1
            onsets.append(max(0, j * hop - int(pre * sr)))
        # 가장 큰 n 개가 아니라 고르게 — 너무 큰 쿵·너무 작은 것 빼기: 봉우리 크기 가운데 쪽 n 개
        if len(onsets) > n:
            amp = [env[min(len(env) - 1, o // hop + int(0.05 * sr / hop))] for o in onsets]
            mid = np.argsort(np.abs(np.array(amp) - np.median(amp)))[:n]
            onsets = sorted(onsets[k] for k in mid)
    L = int(length * sr)
    out = np.zeros((int(slot * sr) * len(onsets), ch), dtype=np.float32)
    fi, fo = int(0.003 * sr), int(0.12 * sr)
    ramp = np.ones(L, dtype=np.float32)
    ramp[:fi] = np.linspace(0, 1, fi)
    ramp[-fo:] = np.cos(np.linspace(0, np.pi / 2, fo)) ** 2
    for k, o in enumerate(onsets):
        seg = y[o:o + L].copy()
        if len(seg) < L:
            seg = np.pad(seg, ((0, L - len(seg)), (0, 0)))
        seg *= ramp[:, None]
        rms = np.sqrt((seg[: int(0.25 * sr)] ** 2).mean()) or 1
        seg *= 0.1 / rms  # 걸음마다 같은 크기로 (전체 크기는 뒤에서 LUFS 로)
        p = k * int(slot * sr)
        out[p:p + L] = seg
    peak = np.abs(out).max() or 1
    if peak > 0.8:
        out *= 0.8 / peak  # -1.9 dBFS — 리미터(-1 dBTP)가 닿지 않게
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', str(ch), '-ar', '48000', '-i', '-', '-c:a', 'pcm_f32le', str(out_wav)], input=out.tobytes(), check=True)
    return len(onsets)


def build_piece(src, out, a, b, kind, ch, lufs, tmp, sprite=None, hp=25, peakcut=0, lp=0):
    # peakcut: 봉우리만 이만큼(dB) 깎는다 — 모닥불 탁 소리처럼 봉우리가 큰 녹음이 엔진의 리미터를 누르지 않게 (평균 크기는 뒤에서 LUFS 로)
    # lp: 이 위를 24dB/옥타브로 걷는다 — 바람의 쉬익 띠(1~4kHz)가 물소리처럼 들리지 않게 (돌풍)
    base = f'aresample=48000,highpass=f={hp}' + (f',lowpass=f={lp},lowpass=f={lp}' if lp else '') + (f',alimiter=limit={10 ** (-peakcut / 20):.4f}:attack=1:release=40:level=0' if peakcut else '') + (',pan=mono|c0=0.5*c0+0.5*c1' if ch == 1 else '')
    cut = tmp / 'cut.wav'
    ff(['-ss', str(a), '-to', str(b), '-i', str(src), '-vn', '-af', base, '-ac', str(ch), '-c:a', 'pcm_f32le', str(cut)])
    count = None
    if kind == 'sprite':
        sp = tmp / 'sprite.wav'
        count = make_sprite(cut, sp, ch, **(sprite or {}))
        cut = sp
    i, tp = loudness(cut)
    target = lufs if lufs is not None else BED_LUFS  # 배경은 -24 (돌풍 섞인 바람처럼 봉우리가 큰 것은 manifest 에서 더 낮게)
    gain = 0.0 if kind == 'sprite' and lufs is None else target - i  # 효과음 묶음은 봉우리로 맞춰 두었다 — 크기는 엔진에서
    lim = f',alimiter=limit={10 ** (TP_MAX / 20):.4f}:attack=5:release=80:level=0' if tp + gain > TP_MAX else ''
    lev = tmp / 'lev.wav'
    ff(['-i', str(cut), '-af', f'volume={gain:.2f}dB{lim}', '-c:a', 'pcm_f32le', str(lev)])
    final = lev
    if kind == 'bed':
        dur = b - a
        x = min(XF, dur / 4)
        seam = tmp / 'seam.wav'
        fc = (f'[0]asplit=3[a][b][c];'
              f'[a]atrim=0:{x},asetpts=PTS-STARTPTS,afade=t=in:d={x}:curve=qsin[h];'
              f'[c]atrim={dur - x}:{dur},asetpts=PTS-STARTPTS,afade=t=out:d={x}:curve=qsin[t];'
              f'[h][t]amix=inputs=2:normalize=0[m];'
              f'[b]atrim={x}:{dur - x},asetpts=PTS-STARTPTS[body];'
              f'[m][body]concat=n=2:v=0:a=1')
        ff(['-i', str(lev), '-filter_complex', fc, '-c:a', 'pcm_f32le', str(seam)])
        final = seam
    out.parent.mkdir(parents=True, exist_ok=True)
    br = RATE[ch]
    ff(['-i', str(final), '-c:a', aac_codec(), '-b:a', br, '-ar', '48000', '-movflags', '+faststart', str(out.with_suffix('.m4a'))])
    ff(['-i', str(final), '-c:a', 'libmp3lame', '-b:a', br, '-ar', '48000', str(out.with_suffix('.mp3'))])
    return i, gain, bool(lim), count


def cmd_build(names):
    m = json.loads(MANIFEST.read_text())
    sources = m['sources']
    done = 0
    for e in m['pieces']:
        if names and e['out'] not in names and not any(e['out'].startswith(n) for n in names):
            continue
        s = sources[e['src']]
        src = RAW / s['file']
        if not src.exists():
            print(f'· 건너뜀 {e["out"]}: 원본 없음 {src}')
            continue
        ch = 1 if e.get('mono') else 2
        with tempfile.TemporaryDirectory() as t:
            sp = {k: e[k] for k in ('n', 'slot', 'len', 'gap', 'starts') if k in e}
            if 'len' in sp:
                sp['length'] = sp.pop('len')
            i, gain, lim, count = build_piece(src, OUT / e['out'], e['from'], e['to'], e.get('kind', 'bed'), ch, e.get('lufs'), Path(t), sp, e.get('hp', 25), e.get('peakcut', 0), e.get('lp', 0))
        print(f'✓ {e["out"]:<22} {e["from"]:>6.1f}–{e["to"]:<6.1f}s  원래 {i:6.1f} LUFS → {gain:+5.1f} dB{"  (리미터)" if lim else ""}{f"  {count}칸" if count else ""}')
        done += 1
    print(f'{done}개 만듦 → {OUT}')


def cmd_report():
    rows = []
    for f in sorted(OUT.glob('*.m4a')):
        d, size, ch, sr, codec = probe(f)
        i, tp = loudness(f)
        mp3 = f.with_suffix('.mp3')
        rows.append((f.stem, d, ch, sr, i, tp, size, mp3.stat().st_size if mp3.exists() else 0))
    print(f'{"이름":<22}{"길이":>7}{"채널":>4}{"Hz":>7}{"LUFS":>7}{"dBTP":>6}{"m4a KB":>8}{"mp3 KB":>8}')
    for n, d, ch, sr, i, tp, a, b in rows:
        print(f'{n:<22}{d:7.1f}{ch:4d}{sr:7d}{i:7.1f}{tp:6.1f}{a / 1024:8.0f}{b / 1024:8.0f}')
    print(f'합계 m4a {sum(r[6] for r in rows) / 1048576:.2f}MB · mp3 {sum(r[7] for r in rows) / 1048576:.2f}MB · {len(rows)}개')


def cmd_check(path, every=60.0):
    """원본을 every 초씩 끊어 스펙트로그램(로그 주파수)을 그린다. 사람 말소리는 100~300Hz 바탕음 위 가로 줄무늬(배음)로 보인다"""
    src = Path(path)
    d = probe(src)[0]
    out = HERE / 'check' / src.stem
    out.mkdir(parents=True, exist_ok=True)
    t = 0.0
    while t < d:
        png = out / f'{int(t):04d}.png'
        ff(['-ss', str(t), '-t', str(every), '-i', str(src), '-vn', '-lavfi',
            'aresample=48000,pan=mono|c0=0.5*c0+0.5*c1,showspectrumpic=s=1200x360:legend=1:fscale=log:color=intensity:gain=2', str(png)])
        t += every
    print(f'{out} 에 {len(list(out.glob("*.png")))}장 (길이 {d:.0f}초)')


def short_term(path):
    """3초 단기 음량(LUFS)을 0.1초마다 — ebur128 의 S 값"""
    err = ff(['-i', str(path), '-vn', '-af', 'ebur128', '-f', 'null', '-'])
    return [float(m.group(1)) for m in re.finditer(r' S:\s*(-?[\d.]+)', err)]


def cmd_scan(path, length=50.0, skip=15.0, k=4):
    """편집 이음·돌풍·사람 소리처럼 갑자기 튀는 곳을 피해, 단기 음량이 고른 구간 k 개 (겹치지 않게)"""
    S = short_term(path)
    dt = 0.1
    n, w = len(S), int(length / dt)
    lo, hi = int(skip / dt), n - int(5 / dt)
    cands = []
    for a in range(lo, hi - w, 10):
        seg = sorted(S[a:a + w])
        spread = seg[int(len(seg) * 0.98)] - seg[int(len(seg) * 0.02)]
        cands.append((spread, a))
    picked = []
    for spread, a in sorted(cands):
        if all(abs(a - b) >= w for _, b in picked):
            picked.append((spread, a))
        if len(picked) >= k:
            break
    med = sorted(S[lo:hi])[(hi - lo) // 2]
    print(f'{Path(path).name}: 길이 {n * dt:.0f}초 · 단기 음량 가운데 {med:.1f} LUFS')
    for spread, a in sorted(picked, key=lambda x: x[1]):
        seg = S[a:a + w]
        print(f'  {a * dt:6.1f}–{(a + w) * dt:6.1f}s  흔들림 {spread:4.1f} LU  평균 {sum(seg) / len(seg):6.1f}')


# 조각 이름 앞부분 → 「자료 출처」에 적을 쓰는 곳
USE = {'stream': '계곡 물소리', 'rain': '빗소리', 'wind': '솔바람', 'winter': '겨울 숲 고요', 'bamboo': '대숲 바람', 'birds': '산새', 'crickets': '가을 풀벌레',
       'cicadas': '여름 매미', 'frogs': '개구리', 'chant': '법당 염불', 'spring': '연못 샘물', 'fire': '화롯불', 'gust': '돌풍', 'bell': '범종', 'chime': '처마 풍경(풍탁)',
       'scops': '소쩍새', 'owl': '솔부엉이', 'eagleowl': '수리부엉이', 'thunder': '먼 천둥', 'drip': '낙숫물', 'sweep': '마당 쓰는 소리', 'step': '발소리',
       'chukbi': '죽비', 'beads': '염주', 'pebble': '돌탑 조약돌', 'paper': '한지', 'robe': '도복 스침', 'brush': '붓', 'paperfire': '번뇌 소각', 'pour': '차 따르기'}


ASMR_OUT = ROOT / 'web/assets/audio/asmr'
ASMR_JS = ROOT / 'web/src/data/asmr.js'
ASMR_LUFS = -24.0


def cmd_asmr(ids):
    """테마 ASMR: 원음을 그대로(되풀이 영상은 한 주기, 도입부는 뺀다) 크기만 -24 LUFS 로 맞춰 AAC 하나로. 목록은 web/src/data/asmr.js 로 쓴다"""
    m = json.loads(MANIFEST.read_text())
    rows = []
    for e in m['asmr']:
        src = m['sources'][e['src']]
        out = ASMR_OUT / f"{e['id']}.m4a"
        if not ids or e['id'] in ids:
            dur, _, ch, _, _ = probe(RAW / src['file'])
            a, b = e.get('from', 0), e.get('to', dur)
            with tempfile.TemporaryDirectory() as t:
                cut = Path(t) / 'cut.wav'
                ff(['-ss', str(a), '-to', str(b), '-i', str(RAW / src['file']), '-vn', '-af', 'aresample=48000,highpass=f=25', '-c:a', 'pcm_f32le', str(cut)])
                i, tp = loudness(cut)
                gain = ASMR_LUFS - i
                lim = f',alimiter=limit={10 ** (TP_MAX / 20):.4f}:attack=5:release=80:level=0' if tp + gain > TP_MAX else ''
                n = b - a
                ASMR_OUT.mkdir(parents=True, exist_ok=True)
                ff(['-i', str(cut), '-af', f'volume={gain:.2f}dB{lim},afade=t=in:d=1.5,afade=t=out:st={n - 3:.2f}:d=3', '-c:a', aac_codec(), '-b:a', '96k' if ch > 1 else '64k', '-ar', '48000', '-movflags', '+faststart', str(out)])
                print(f"✓ {e['id']:<18} {a:6.1f}–{b:6.1f}s  원래 {i:6.1f} LUFS → {gain:+5.1f} dB{' · 리미터' if lim else ''}  {out.stat().st_size / 1e6:.1f}MB")
        sec = probe(out)[0]
        rows.append('  ' + json.dumps({'id': e['id'], 'title': e['title'], 'place': e['place'], 'note': e['note'], 'group': e['group'], 'file': f"asmr/{e['id']}.m4a", 'sec': round(sec, 1), 'url': src['url']}, ensure_ascii=False))
    ASMR_JS.write_text('// tools/audio/build.py asmr 가 manifest.json 의 asmr 로 쓴다 — 손으로 고치지 말 것\n'
                       '// 테마 ASMR: 지역·주제가 뚜렷한 2분 넘는 원음을 그대로 (자연의 소리 듣기 창의 「테마 ASMR」). sec = ffprobe 실측 길이\n'
                       'export const ASMR_TRACKS = [\n' + ',\n'.join(rows) + '\n];\n')
    print(f'{len(rows)}곡 → {ASMR_JS}')


def cmd_credits():
    m = json.loads(MANIFEST.read_text())
    uses = {}
    for p in m['pieces']:
        uses.setdefault(p['src'], set()).add(USE.get(p['out'].split('-')[0], p['out']))
    for e in m.get('asmr', []):
        uses.setdefault(e['src'], set()).add('테마 ASMR')
    rows = []
    for k, src in m['sources'].items():
        if k in uses:
            u = ' · '.join(sorted(uses[k]))
            rows.append(f"    {{ use: {json.dumps(u, ensure_ascii=False)}, title: {json.dumps(src['title'], ensure_ascii=False)}, by: {json.dumps(src['by'], ensure_ascii=False)}, license: {json.dumps(src['license'], ensure_ascii=False)}, url: {json.dumps(src['url'])} }}")
    path = ROOT / 'web/src/data/credits.js'
    js = path.read_text()
    a, b = js.index('  // <nature-sounds>'), js.index('  // </nature-sounds>')
    js = js[:a] + '  // <nature-sounds> tools/audio/build.py credits 가 manifest.json 으로 다시 쓴다 — 손으로 고치지 말 것\n' + ',\n'.join(rows) + ',\n' + js[b:]
    path.write_text(js)
    print(f'{len(rows)}개 출처 → {path}')


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    if a[0] == 'build':
        cmd_build(a[1:])
    elif a[0] == 'report':
        cmd_report()
    elif a[0] == 'credits':
        cmd_credits()
    elif a[0] == 'asmr':
        cmd_asmr(a[1:])
    elif a[0] == 'scan':
        opt = lambda k, d: float(a[a.index(k) + 1]) if k in a else d
        cmd_scan(a[1], opt('--len', 50.0), opt('--skip', 15.0), int(opt('--k', 4)))
    elif a[0] == 'check':
        cmd_check(a[1], float(a[a.index('--every') + 1]) if '--every' in a else 60.0)
    else:
        sys.exit(__doc__)
