"""스파이크용 질감 준비: CC0 사진 PBR 을 아트 바이블 팔레트로 고르고, 생성 질감·한지를 더해 한 폴더에 모은다.

  python3 -I tools/spike/textures.py DL_TEX_DIR GEN_TEX_DIR OUT_DIR [size=1024]

DL_TEX_DIR : Poly Haven 2k jpg (wood_floor_worn, fine_grained_wood, rocky_trail_02 의 diff/col, nor_gl, arm)
GEN_TEX_DIR: tools/spike/seamless.py 결과 (earth_wall, dancheong_band, ceiling_panel_src — .png 또는 .jpg; 저장소 사본은 docs/art/generated/)
결과 이름은 tools/blender/hall_bay.py 가 쓰는 이름과 같다.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

LUM = np.array([0.2126, 0.7152, 0.0722], np.float32)


def load(p, size):
    return np.asarray(Image.open(p).convert('RGB').resize((size, size), Image.LANCZOS), np.float32) / 255.0


def save(a, p, q=90):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).save(p, quality=q)


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255.0


def grade(a, sat=1.0, gain=1.0):
    g = (a @ LUM)[..., None]
    return np.clip((g + (a - g) * sat) * gain, 0, 1)


def recolor(a, target_hex, keep=0.0, contrast=1.0):
    """밝기 변화(결)는 살리고 평균 색을 target 으로. keep = 원래 색을 남길 비율."""
    g = a @ LUM
    rel = (g / max(g.mean(), 1e-4))[..., None] ** contrast
    return np.clip(hexrgb(target_hex) * rel * (1 - keep) + a * keep, 0, 1)


def height_to_normal(h, strength):
    gx = np.roll(h, -1, 1) - np.roll(h, 1, 1)
    gy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
    n = np.stack([-gx * strength, gy * strength, np.ones_like(h)], -1)  # OpenGL(+Y 위) 노멀
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def hanji(size, seed=7):
    """한지: 옅은 미색 바탕에 긴 섬유 결 (절차적)."""
    rng = np.random.default_rng(seed)
    base = rng.normal(0, 1, (size, size)).astype(np.float32)
    im = Image.fromarray(((base * 0.5 + 0.5).clip(0, 1) * 255).astype(np.uint8))
    fib = np.asarray(im.filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255.0
    streak = np.asarray(im.resize((size // 16, size), Image.BILINEAR).resize((size, size), Image.BICUBIC), np.float32) / 255.0
    v = 0.92 + (fib - 0.5) * 0.06 + (streak - 0.5) * 0.08
    return np.clip(v[..., None] * hexrgb('#F3EBDD'), 0, 1)


def gen_file(gen, stem):
    return next(p for p in (gen / f'{stem}.png', gen / f'{stem}.jpg') if p.exists())


def main():
    dl, gen, out = map(Path, sys.argv[1:4])
    size = int(sys.argv[4]) if len(sys.argv) > 4 else 1024
    out.mkdir(parents=True, exist_ok=True)
    W, F, R = 'wood_floor_worn', 'fine_grained_wood', 'rocky_trail_02'
    # 마루: 오래된 소나무, 주황기를 빼고 회갈색으로
    save(grade(load(dl / f'{W}_diff_2k.jpg', size), sat=0.85, gain=0.8), out / 'floor_diff.jpg')
    # 기둥: 석간주(#672C21) 칠, 나무결 살림
    save(recolor(load(dl / f'{F}_col_2k.jpg', size), '#5A261C', keep=0.12, contrast=1.2), out / 'column_diff.jpg')
    # 창호·문틀·귀틀: 결 있는 짙은 나무 그대로, 조금 밝게
    save(grade(load(dl / f'{F}_col_2k.jpg', size), sat=0.9, gain=1.25), out / 'wood_diff.jpg')
    # 마당: 마사토 베이지
    save(recolor(load(dl / f'{R}_diff_2k.jpg', size), '#A99478', keep=0.3, contrast=1.25), out / 'ground_diff.jpg')
    # 기단 돌: 화강암 회색
    save(recolor(load(dl / f'{R}_diff_2k.jpg', size), '#A19E99', keep=0.08, contrast=0.8), out / 'stone_diff.jpg')
    for src, dst in [(W, 'floor'), (F, 'wood'), (R, 'ground')]:
        for kind in ('nor_gl', 'arm'):
            Image.open(dl / f'{src}_{kind}_2k.jpg').resize((size, size), Image.LANCZOS).save(out / f'{dst}_{kind}.jpg', quality=92)
    # 생성 질감
    ew = load(gen_file(gen, 'earth_wall'), size)
    save(ew, out / 'earth_diff.jpg')
    hb = np.asarray(Image.fromarray((ew @ LUM * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5)), np.float32) / 255.0
    save(height_to_normal(hb, 6.0), out / 'earth_nor_gl.jpg', q=92)
    Image.open(gen_file(gen, 'dancheong_band')).convert('RGB').resize((size, size // 2), Image.LANCZOS).save(out / 'dancheong_diff.jpg', quality=90)
    Image.open(gen_file(gen, 'ceiling_panel_src')).convert('RGB').resize((size // 2, size // 2), Image.LANCZOS).save(out / 'ceiling_diff.jpg', quality=90)
    save(hanji(size // 2), out / 'hanji_diff.jpg')
    print('textures ->', out, sorted(p.name for p in out.iterdir()))


if __name__ == '__main__':
    main()
