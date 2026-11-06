"""후불벽 세로 그림을 칸 비율에 맞춘다: 그림(위)은 그대로, 맨 아래 세로 널판 띠만 세로로 늘린다 (널판은 세로결이라 늘려도 티가 덜 난다).

  python3 -I tools/spike/wall_fit.py in.png out.webp ASPECT [--split 0.82]
ASPECT = 칸 폭 / 벽 높이 (예: 가운데 7.6 / 11.95). split = 널판 띠가 시작하는 높이 비율 (그림 액자 아래).
"""
import sys

from PIL import Image

src, dst, aspect = sys.argv[1], sys.argv[2], float(sys.argv[3])
split = float(sys.argv[sys.argv.index('--split') + 1]) if '--split' in sys.argv else 0.82
im = Image.open(src).convert('RGB')
w, h = im.size
H = round(w / aspect)
y0 = round(h * split)
top = im.crop((0, 0, w, y0))
boards = im.crop((0, y0, w, h)).resize((w, H - y0), Image.BICUBIC) if H > h else im.crop((0, y0, w, h))
out = Image.new('RGB', (w, max(H, h)))
out.paste(top, (0, 0))
out.paste(boards, (0, y0))
out.save(dst, 'WEBP', quality=84, method=6)
print(f'{dst}: {out.width}x{out.height} (aspect {out.width / out.height:.3f}, boards x{(H - y0) / (h - y0):.2f})')
