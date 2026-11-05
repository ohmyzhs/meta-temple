"""Cycles 로 구운 라이트맵(float .npy, Blender 픽셀 순서) → 웹용 8비트 sRGB PNG + 배율.

  python3 -I tools/spike/lightmap.py IN_DIR OUT_DIR [size=1024] [--exposure day=34,night=9.5]

IN_DIR 의 lm_day.npy, lm_night.npy (tools/blender/hall_bay.py) 를 읽는다.
- Blender 는 아래 줄부터 → 위아래를 뒤집어 glTF(flipY=false) 순서로.
- 알파(구운 칸=1) 가중 상자 필터로 줄인다 (빈 칸이 섞여 가장자리가 어두워지지 않게).
- 값 B 는 Cycles Diffuse(직접+간접, 색 없음) = 조도/π. 저장은 B/S 를 sRGB 로.
  S = min(99.5 백분위, 그 시간 법당 노출에서 알베도 0.25 면이 하얗게 포화되는 B). 실내 값이 8비트 바닥에 몰리지 않게
  (해 든 기단·햇빛 웅덩이 심지는 어차피 포화되므로 잘라도 화면이 같다). 노출은 spike.js EXPOSURE 의 실측값.
  three: lightMapIntensity = π·S (r170 은 lightMap 을 조도로 더하고 Lambert 에서 /π 하므로).
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

LUM = np.array([0.2126, 0.7152, 0.0722], np.float32)


def srgb(x):
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.maximum(x, 0), 1 / 2.4) - 0.055)


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    size = int(sys.argv[3]) if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else 1024
    expo = {'day': 34.0, 'night': 9.5}
    if '--exposure' in sys.argv:
        expo.update({k: float(v) for k, v in (kv.split('=') for kv in sys.argv[sys.argv.index('--exposure') + 1].split(','))})
    out.mkdir(parents=True, exist_ok=True)
    meta = {}
    for mode in ('day', 'night'):
        a = np.flipud(np.load(src / f'lm_{mode}.npy')).astype(np.float32)
        n = a.shape[0] // size
        rgb, al = a[..., :3], a[..., 3:4]
        s_rgb = (rgb * al).reshape(size, n, size, n, 3).sum((1, 3))
        s_a = al.reshape(size, n, size, n, 1).sum((1, 3))
        img = np.where(s_a > 0, s_rgb / np.maximum(s_a, 1e-6), 0)
        cov = s_a[..., 0] > 0
        L = img @ LUM
        # ACES(three) 는 노출·x/0.6 ≈ 3 이면 거의 흰색 → 포화 B = 3·0.6 / (노출·알베도)
        sat_b = 3 * 0.6 / (expo[mode] * 0.25)
        S = min(float(np.percentile(L[cov], 99.5)), sat_b)
        enc = srgb(np.clip(img / S, 0, 1))
        Image.fromarray((enc * 255 + 0.5).astype(np.uint8)).save(out / f'lm_{mode}.png', optimize=True)
        meta[mode] = dict(clipped=float((L[cov] > S).mean()), exposure=expo[mode], scale=S, intensity=math.pi * S, coverage=float(cov.mean()), median=float(np.median(L[cov])), size=size)
    (out / 'lightmaps.json').write_text(json.dumps(meta, indent=1))
    print(json.dumps(meta))


if __name__ == '__main__':
    main()
