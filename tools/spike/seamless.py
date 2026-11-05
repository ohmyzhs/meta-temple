"""생성 질감을 이음새 없이 반복되게 다듬는다 (gpt-image 는 타일을 보장하지 않음).
  python3 -I tools/spike/seamless.py both  in.png out.png [size]   # 흙벽처럼 가로·세로 모두
  python3 -I tools/spike/seamless.py hband in.png out.png [w h]    # 단청 띠: 가로 주기를 찾아 정수 주기로 자르고 가로만
"""
import sys
import numpy as np
from PIL import Image


def cross_blend(a, axis_x=True, axis_y=True, frac=0.18):
    """반쯤 굴린 영상(가장자리가 원본 가운데라 이어짐)에 원본을 가운데 십자 띠로만 섞어 굴림 이음새를 가린다."""
    h, w = a.shape[:2]
    rolled = np.roll(a, (h // 2 if axis_y else 0, w // 2 if axis_x else 0), axis=(0, 1))
    m = np.zeros((h, w), np.float32)
    if axis_x:
        d = np.abs(np.arange(w) - w / 2) / (w * frac)
        m = np.maximum(m, np.clip(1 - d, 0, 1)[None, :] ** 0.7)
    if axis_y:
        d = np.abs(np.arange(h) - h / 2) / (h * frac)
        m = np.maximum(m, np.clip(1 - d, 0, 1)[:, None] ** 0.7)
    return rolled * (1 - m[..., None]) + a * m[..., None]


def period_x(a, lo, hi):
    g = a.mean(axis=2)
    g = g - g.mean(axis=1, keepdims=True)
    best, bp = -1e9, lo
    for p in range(lo, hi):
        s = (g[:, :-p] * g[:, p:]).mean() / (g[:, :-p].std() * g[:, p:].std() + 1e-6)
        if s > best:
            best, bp = s, p
    return bp, best


if __name__ == '__main__':
    mode, src, dst = sys.argv[1:4]
    a = np.asarray(Image.open(src).convert('RGB'), np.float32)
    if mode == 'both':
        n = min(a.shape[:2]); a = a[:n, :n]
        out = cross_blend(a)
        sat = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0  # 채도 배율 (아트 바이블 흙벽 색에 맞추기)
        g = out.mean(axis=2, keepdims=True)
        out = g + (out - g) * sat
        size = int(sys.argv[4]) if len(sys.argv) > 4 else n
        Image.fromarray(out.clip(0, 255).astype(np.uint8)).resize((size, size), Image.LANCZOS).save(dst)
    else:
        w = a.shape[1]
        p, score = period_x(a, w // 5, w // 2)
        k = w // p
        x0 = (w - k * p) // 2
        crop = a[:, x0:x0 + k * p]
        # 정수 주기만큼 굴리면 이음새 양쪽 무늬 위상이 같아 섞어도 겹침 자국이 없다
        rolled = np.roll(crop, p, axis=1)
        d = np.abs(np.arange(crop.shape[1]) - p) / (p * 0.25)
        m = np.clip(1 - d, 0, 1)[None, :, None]
        out = rolled * (1 - m) + crop * m
        print(f'period {p}px x{k} (corr {score:.3f})')
        size = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (crop.shape[1], crop.shape[0])
        Image.fromarray(out.clip(0, 255).astype(np.uint8)).resize(size, Image.LANCZOS).save(dst)
