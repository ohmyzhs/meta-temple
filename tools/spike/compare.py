"""지금 화면 vs 스파이크 비교 이미지 (한국어 라벨).
  python3 -I tools/spike/compare.py SHOTS_DIR OUT_DIR
SHOTS_DIR: baseline.mjs(current-*) · measure.mjs(spike-*) 스크린샷.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

S, O = Path(sys.argv[1]), Path(sys.argv[2])
O.mkdir(parents=True, exist_ok=True)
FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'


def font(n):
    return ImageFont.truetype(FONT, n, index=6)  # Bold


def label(im, text, size):
    d = ImageDraw.Draw(im)
    f = font(size)
    x, y = int(size * 0.6), int(size * 0.5)
    b = d.textbbox((x, y), text, font=f)
    d.rectangle((b[0] - 8, b[1] - 6, b[2] + 8, b[3] + 6), fill=(20, 17, 14))
    d.text((x, y), text, font=f, fill=(243, 235, 221))
    return im


def grid(cells, cols, cw, ch, title):
    rows = (len(cells) + cols - 1) // cols
    top = 56
    out = Image.new('RGB', (cols * cw + (cols + 1) * 8, top + rows * ch + (rows + 1) * 8), (14, 12, 11))
    ImageDraw.Draw(out).text((12, 12), title, font=font(30), fill=(243, 235, 221))
    for i, (path, text) in enumerate(cells):
        im = Image.open(path).convert('RGB').resize((cw, ch), Image.LANCZOS)
        label(im, text, max(16, cw // 26))
        out.paste(im, (8 + (i % cols) * (cw + 8), top + 8 + (i // cols) * (ch + 8)))
    return out


for hour, t, name in (('13h', 'day', '낮 13시'), ('00h', 'night', '자정')):
    cells = [
        (S / f'current-hall-{hour}-1280x800.png', '지금 · 법당 안'), (S / f'spike-hall-{t}-1280x800.png', '스파이크 · 법당 안 (구운 빛)'),
        (S / f'current-courtyard-{hour}-1280x800.png', '지금 · 마당 석탑'), (S / f'spike-court-{t}-1280x800.png', '스파이크 · 고선사지 삼층석탑 스캔'),
    ]
    grid(cells, 2, 960, 600, f'청연산사 에셋 스파이크 — {name}, 1280×800').save(O / f'compare-{t}-1280x800.jpg', quality=86)
    cells = [
        (S / f'current-hall-{hour}-390x844.png', '지금 · 법당'), (S / f'spike-hall-{t}-390x844.png', '스파이크 · 법당'),
        (S / f'current-courtyard-{hour}-390x844.png', '지금 · 마당'), (S / f'spike-court-{t}-390x844.png', '스파이크 · 석탑'),
    ]
    grid(cells, 4, 390, 844, f'{name}, 390×844 (폰 세로)').save(O / f'compare-{t}-390x844.jpg', quality=86)
print(sorted(p.name for p in O.iterdir()))
