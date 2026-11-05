"""녹색 배경(#00FF00)으로 생성한 사진에서 배경을 빼 컷아웃 WebP 로 (불상 판용).

  python3 -I tools/spike/matte.py in.png out.webp [--max-h 1536] [--mirror]

- 녹색 정도 g' = G - max(R, B) 로 알파를 정한다 (g' ≥ 60 이면 투명, ≤ 20 이면 불투명, 사이는 부드럽게).
- 가장자리 녹색 번짐 제거: G 를 max(R, B) 로 누른다.
- 불투명 영역 경계 상자로 잘라 판이 물체에 꼭 맞게 (위아래·좌우 여백 1%).
"""
import sys

import numpy as np
from PIL import Image, ImageFilter


def main():
    src, dst = sys.argv[1:3]
    max_h = int(sys.argv[sys.argv.index('--max-h') + 1]) if '--max-h' in sys.argv else 1536
    im = Image.open(src).convert('RGB')
    a = np.asarray(im, np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    gp = g - np.maximum(r, b)
    alpha = np.clip((60 - gp) / 40, 0, 1)
    # 작은 구멍·티 정리: 알파를 살짝 줄였다 키운다
    am = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    alpha = np.asarray(am, np.float32) / 255
    g2 = np.minimum(g, np.maximum(r, b) * 1.02 + 2)  # 녹색 번짐 제거
    out = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
    ys, xs = np.where(alpha > 0.5)
    h, w = alpha.shape
    pad = int(0.01 * max(h, w))
    y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(w, xs.max() + pad + 1)
    cut = Image.fromarray(out[y0:y1, x0:x1], 'RGBA')
    if '--mirror' in sys.argv:
        cut = cut.transpose(Image.FLIP_LEFT_RIGHT)
    if cut.height > max_h:
        cut = cut.resize((round(cut.width * max_h / cut.height), max_h), Image.LANCZOS)
    cut.save(dst, 'WEBP', quality=88, method=6)
    print(f'{dst}: {cut.width}x{cut.height}, crop y {y0}-{y1} x {x0}-{x1}, opaque {float((alpha > 0.5).mean()):.3f}')


if __name__ == '__main__':
    main()
