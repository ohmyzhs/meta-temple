"""바깥 실사(?world=real) 에셋 만들기: 생성 이미지(gpt-image)·CC0 사진 PBR → web/assets/world/outdoor/*.ktx2

  KTX_BIN=<KTX-Software 4.4.2 bin> python3 -I tools/outdoor/build.py GEN DL WORK [OUT=web/assets/world/outdoor]

GEN : 생성 이미지 폴더. GEN/<이름>/<이름>.png (투명 배경 PNG) — 프롬프트는 tools/outdoor/prompts/
      ridge_{near,mid,far}_{1,2,3}[ _dusk | _night ], atlas_{fir,pine,maple,bamboo}, imp_{fir,pine,maple}, vista_<쉼터 id>[_night]
DL  : Poly Haven 2k jpg (<id>_diffuse_2k.jpg, <id>_nor_gl_2k.jpg) — 목록은 아래 GROUND·BARK·PROPS, 출처는 credits.json
WORK: 중간 PNG 를 두는 곳 (git 밖)
폰은 1K 예산: 반복 질감 1024, 노멀 512, 잎 아틀라스·원경 나무 _lo(1024), 원경 띠 _lo(4096×256 = 1K² 픽셀).
"""
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

LUM = np.array([0.2126, 0.7152, 0.0722], np.float32)
KTX = Path(os.environ.get('KTX_BIN', '')) / 'ktx'

# 지면 층 (순서 = 셰이더의 층 번호): 숲 바닥(이끼+진흙+낙엽) · 낙엽 · 흙길 · 마사토 · 잔디 · 냇돌(계곡 바닥·바위 비탈) · (생성) 숲 지붕
GROUND = [
    ('brown_mud_leaves_01', None),
    ('dry_decay_leaves', None),
    ('forest_ground_04', None),
    ('gravel_floor', ('#C9B79C', 0.35)),  # 마사토 베이지 쪽으로 (아트 바이블 #DFC6AB, 그늘 감안해 조금 어둡게)
    ('leafy_grass', None),
    ('river_small_rocks', None),
]
BARK = {'fir': 'jolcham_oak_bark_01', 'pine': 'pine_bark', 'maple': 'trident_maple_bark'}
PROPS = {
    'plank': ('weathered_brown_planks', ('#9A8670', 0.3)),  # 데크·다리 판재 (가로 결, 판 14장 = 한 장) — 오래된 소나무 마루처럼 밝은 회갈색으로
    'post': ('weathered_planks', None),  # 기둥·난간·보 (세로 결)
    'granite': ('rock_boulder_dry', ('#A19E99', 0.3)),  # 아트 바이블 화강암 회색
    'mossy': ('mossy_rock', None),
}


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255.0


def load(p, size=None, mode='RGB'):
    im = Image.open(p).convert(mode)
    if size:
        im = im.resize(size, Image.LANCZOS)
    return np.asarray(im, np.float32) / 255.0


def save(a, p):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).save(p)


def recolor(a, target_hex, keep):
    g = a @ LUM
    rel = (g / max(g.mean(), 1e-4))[..., None]
    return np.clip(hexrgb(target_hex) * rel * (1 - keep) + a * keep, 0, 1)


def ktx(inputs, out, kind, layers=None):
    """kind: color(sRGB ETC1S) | rgba(sRGB ETC1S + 알파) | normal(ETC1S normal-mode, XY)"""
    args = [str(KTX), 'create', '--generate-mipmap', '--assign-primaries', 'bt709']
    if kind == 'normal':
        # ETC1S normal-mode: X 는 RGB, Y 는 A 에 (UASTC 의 1/3 크기). 셰이더가 z = sqrt(1 - x² - y²) 로 복원한다 (outdoor.js decodeNormalXY)
        args += ['--format', 'R8G8B8_UNORM', '--assign-tf', 'linear', '--encode', 'basis-lz', '--normal-mode', '--qlevel', '200', '--clevel', '3']
    else:
        args += ['--format', 'R8G8B8A8_SRGB' if kind == 'rgba' else 'R8G8B8_SRGB', '--assign-tf', 'srgb', '--encode', 'basis-lz', '--qlevel', '200', '--clevel', '3']
    if layers:
        args += ['--layers', str(layers)]
    subprocess.run(args + [str(p) for p in inputs] + [str(out)], check=True)
    print(f'{out.name:28s} {out.stat().st_size / 1024:7.0f} KB')


# ───── 원경 능선 띠: 프레임 3장 + 좌우 뒤집은 3장 = 6구간을 360° 로 이어 붙인다 ─────
def ridge_strip(gen, layer, variant, W, H):
    frames = []
    for f in (1, 2, 3):
        n = f'ridge_{layer}_{f}' + (f'_{variant}' if variant != 'day' else '')
        p = gen / n / f'{n}.png'
        if not p.exists():
            return None
        frames.append(load(p, (1024, 683), 'RGBA'))
    seq = [frames[0], frames[1], frames[2], frames[0][:, ::-1], frames[2][:, ::-1], frames[1][:, ::-1]]
    O = 160  # 이음 겹침 (px)
    ramp = np.linspace(0, 1, O, dtype=np.float32)[None, :, None]
    strip = seq[0]
    for f in seq[1:]:
        strip = np.concatenate([strip[:, :-O], strip[:, -O:] * (1 - ramp) + f[:, :O] * ramp, f[:, O:]], axis=1)
    # 360° 이음: 끝 O 열을 처음 O 열에 섞고 끝을 잘라낸다
    strip[:, :O] = strip[:, -O:] * (1 - ramp) + strip[:, :O] * ramp
    strip = strip[:, :-O]
    return strip


def ridges(gen, work, out):
    meta = {}
    for layer in ('near', 'mid', 'far'):
        day = ridge_strip(gen, layer, 'day', 0, 0)
        a = day[..., 3]
        top = int(np.argmax((a > 0.5).any(axis=1)))  # 가장 높은 봉우리 줄
        top = max(0, top - 6)
        for variant in ('day', 'dusk', 'night'):
            s = day if variant == 'day' else ridge_strip(gen, layer, variant, 0, 0)
            if s is None:
                print('  (없음)', layer, variant)
                continue
            band = s[top:]
            # 알파 가장자리 색 번짐 막기: 투명 픽셀의 RGB 를 아래쪽 불투명 색으로 채운다
            rgb, al = band[..., :3], band[..., 3:]
            filled = rgb.copy()
            for y in range(filled.shape[0] - 2, -1, -1):
                m = al[y, :, 0] < 0.5
                filled[y, m] = filled[y + 1, m]
            band = np.concatenate([filled, al], axis=-1)
            for tag, (w, h) in (('', (4096, 512)), ('_lo', (4096, 256))):
                p = work / f'ridge_{layer}_{variant}{tag}.png'
                Image.fromarray((band * 255 + 0.5).astype(np.uint8), 'RGBA').resize((w, h), Image.LANCZOS).save(p)
                ktx([p], out / f'ridge_{layer}_{variant}{tag}.ktx2', 'rgba')
        # 띠 위쪽 끝(top)이 원래 프레임 높이의 어디였는지 — 셰이더가 봉우리 높이를 맞추는 데 쓴다
        meta[layer] = {'bandTopFrac': top / day.shape[0], 'peakFrac': 1.0}
    return meta


def height_to_normal(h, strength):
    gx = np.roll(h, -1, 1) - np.roll(h, 1, 1)
    gy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
    n = np.stack([-gx * strength, gy * strength, np.ones_like(h)], -1)  # OpenGL(+Y 위) 노멀
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def ground(dl, work, out, gen):
    cols, nors = [], []
    for i, (pid, rc) in enumerate(GROUND):
        c = load(dl / f'{pid}_diffuse_2k.jpg', (1024, 1024))
        if rc:
            c = recolor(c, *rc)
        cp = work / f'ground_{i}_col.png'
        save(c, cp)
        cols.append(cp)
        n = Image.open(dl / f'{pid}_nor_gl_2k.jpg').convert('RGB').resize((512, 512), Image.LANCZOS)
        npth = work / f'ground_{i}_nor.png'
        n.save(npth)
        nors.append(npth)
    # 마지막 층: 먼 산자락의 숲 지붕 (생성 이미지 canopy — 위에서 내려다본 수관, 이음새 없이 반복). 노멀은 밝기를 높이로 삼아
    c = load(gen / 'canopy' / 'canopy.png', (1024, 1024))
    save(c, work / 'ground_6_col.png')
    cols.append(work / 'ground_6_col.png')
    h = np.asarray(Image.fromarray((c @ LUM * 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS), np.float32) / 255.0
    save(height_to_normal(h, 5.0), work / 'ground_6_nor.png')
    nors.append(work / 'ground_6_nor.png')
    ktx(cols, out / 'ground_col.ktx2', 'color', layers=len(cols))
    ktx(nors, out / 'ground_nor.ktx2', 'normal', layers=len(nors))


def single(dl, work, out, name, pid, rc=None, csize=1024, nsize=512):
    c = load(dl / f'{pid}_diffuse_2k.jpg', (csize, csize))
    if rc:
        c = recolor(c, *rc)
    save(c, work / f'{name}_col.png')
    ktx([work / f'{name}_col.png'], out / f'{name}_col.ktx2', 'color')
    Image.open(dl / f'{pid}_nor_gl_2k.jpg').convert('RGB').resize((nsize, nsize), Image.LANCZOS).save(work / f'{name}_nor.png')
    ktx([work / f'{name}_nor.png'], out / f'{name}_nor.ktx2', 'normal')


def premult_fill(im):
    """투명 픽셀의 RGB 를 가까운 불투명 색으로 (밉맵에서 검은 테두리가 생기지 않게) — 흐린 색을 알파 가중으로 퍼뜨린다"""
    a = np.asarray(im, np.float32) / 255.0
    rgb, al = a[..., :3], a[..., 3:]
    acc, w = rgb * al, al.copy()
    out = rgb.copy()
    k = 1
    while k < 256:
        acc = acc + np.roll(acc, k, 0) + np.roll(acc, -k, 0) + np.roll(acc, k, 1) + np.roll(acc, -k, 1)
        w = w + np.roll(w, k, 0) + np.roll(w, -k, 0) + np.roll(w, k, 1) + np.roll(w, -k, 1)
        k *= 2
    fill = acc / np.maximum(w, 1e-6)
    out = np.where(al > 0.02, rgb, fill)
    return Image.fromarray((np.concatenate([out, al], -1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def atlases(gen, work, out):
    # 잎 2×2: 전나무 가지 · 소나무 솔잎 · 단풍 · 대나무 잎
    cell = 1024
    A = Image.new('RGBA', (cell * 2, cell * 2), (0, 0, 0, 0))
    for i, n in enumerate(('atlas_fir', 'atlas_pine', 'atlas_maple', 'atlas_bamboo')):
        im = Image.open(gen / n / f'{n}.png').convert('RGBA').resize((cell, cell), Image.LANCZOS)
        A.paste(im, ((i % 2) * cell, (i // 2) * cell))
    A = premult_fill(A)
    for tag, s in (('', 2048), ('_lo', 1024)):
        p = work / f'foliage{tag}.png'
        A.resize((s, s), Image.LANCZOS).save(p)
        ktx([p], out / f'foliage{tag}.ktx2', 'rgba')
    # 원경 나무 1×3 (가로 2048 × 세로 1024, 칸마다 2:3 나무를 가운데·바닥에 맞춰)
    B = Image.new('RGBA', (2048, 1024), (0, 0, 0, 0))
    cw = 2048 // 3
    for i, n in enumerate(('imp_fir', 'imp_pine', 'imp_maple')):
        im = Image.open(gen / n / f'{n}.png').convert('RGBA')
        bb = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
        im = im.crop(bb)
        sc = min((cw - 8) / im.width, 1016 / im.height)
        im = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.LANCZOS)
        B.paste(im, (i * cw + (cw - im.width) // 2, 1024 - im.height), im)
        print(f'  impostor {n}: 칸 안 높이 {im.height}px, 너비 {im.width}px')
    B = premult_fill(B)
    for tag, (w, h) in (('', (2048, 1024)), ('_lo', (1024, 512))):
        p = work / f'impostor{tag}.png'
        B.resize((w, h), Image.LANCZOS).save(p)
        ktx([p], out / f'impostor{tag}.ktx2', 'rgba')


def vistas(gen, work, out):
    for d in sorted(gen.glob('vista_*')):
        p = d / f'{d.name}.png'
        if not p.exists():
            continue
        im = Image.open(p).convert('RGBA')
        im = premult_fill(im)
        for tag, w in (('', 2048), ('_lo', 1024)):
            q = work / f'{d.name}{tag}.png'
            im.resize((w, w * im.height // im.width // 4 * 4), Image.LANCZOS).save(q)
            ktx([q], out / f'{d.name}{tag}.ktx2', 'rgba')


def main():
    gen, dl, work = map(Path, sys.argv[1:4])
    out = Path(sys.argv[4]) if len(sys.argv) > 4 else Path(__file__).resolve().parents[2] / 'web/assets/world/outdoor'
    work.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    only = os.environ.get('ONLY', 'ridges,ground,bark,props,atlases,vistas').split(',')
    if 'ridges' in only:
        print(ridges(gen, work, out))
    if 'ground' in only:
        ground(dl, work, out, gen)
    if 'bark' in only:
        for k, pid in BARK.items():
            single(dl, work, out, f'bark_{k}', pid, csize=512, nsize=512)
    if 'props' in only:
        for k, (pid, rc) in PROPS.items():
            single(dl, work, out, k, pid, rc)
    if 'atlases' in only:
        atlases(gen, work, out)
    if 'vistas' in only:
        vistas(gen, work, out)
    tot = sum(p.stat().st_size for p in out.glob('*.ktx2'))
    print(f'합계 {tot / 1e6:.2f} MB ({len(list(out.glob("*.ktx2")))} 파일)')


if __name__ == '__main__':
    main()
