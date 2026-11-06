"""경내 실사(?world=real) 에셋: CC0 사진 PBR + 생성 이미지(아트 바이블) → web/assets/world/precinct/*.ktx2

  KTX_BIN=<KTX-Software 4.4.2 bin> python3 -I tools/precinct/build.py DL [OUT=web/assets/world/precinct]

DL: Poly Haven 2k jpg 폴더 (<id>_diffuse_2k.jpg, <id>_nor_gl_2k.jpg, <id>_arm_2k.jpg) — 아래 SRC, 출처는 credits.json
    + weathered_planks·fine_grained_wood·rock_boulder_dry (바깥 실사·에셋 스파이크가 받은 같은 CC0 사진)
    scipy 필요 (가우스 흐림)
생성 이미지: docs/art/generated/{dancheong_band,earth_wall}.jpg (에셋 스파이크, gpt-image, 아트 바이블 참조)

방향: KTX2 는 flipY 가 없어 그림 맨 윗줄이 v=0 이다 (단청은 꽃이 서게 뒤집어 굽는다).
      노멀은 OpenGL(+Y 위) 그대로 — 초록은 런타임 xyNormal() (outdoor.js) 이 뒤집는다 (GLTFLoader 와 같은 처리).
폰 1K 예산: 색 1024, 노멀·거칠기 512. 노멀은 ETC1S normal-mode(XY) — outdoor.js xyNormals 로 푼다.
"""
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
LUM = np.array([0.2126, 0.7152, 0.0722], np.float32)
KTX = Path(os.environ.get('KTX_BIN', '')) / 'ktx'
DL = Path(sys.argv[1])
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'web/assets/world/precinct'
WORK = Path(os.environ.get('WORK', '/tmp/precinct_work'))  # 중간 PNG (git 밖)


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
    """밝기 결은 두고 색만 target 쪽으로 (keep: 원래 색을 남기는 비율)"""
    g = a @ LUM
    rel = (g / max(g.mean(), 1e-4))[..., None]
    return np.clip(hexrgb(target_hex) * rel * (1 - keep) + a * keep, 0, 1)


def normal_from_height(h, strength):
    """높이(0..1) → 탄젠트 공간 노멀 RGB (+Y 위 = OpenGL), 가장자리 이어짐"""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.stack([-dx, dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def ktx(src, out, kind):
    """kind: color(sRGB ETC1S) | normal(ETC1S normal-mode XY) | linear(ETC1S 선형, 거칠기·틈 그늘)"""
    args = [str(KTX), 'create', '--generate-mipmap', '--assign-primaries', 'bt709']
    if kind == 'normal':
        args += ['--format', 'R8G8B8_UNORM', '--assign-tf', 'linear', '--encode', 'basis-lz', '--normal-mode', '--qlevel', '200', '--clevel', '3']
    elif kind == 'linear':
        args += ['--format', 'R8G8B8_UNORM', '--assign-tf', 'linear', '--encode', 'basis-lz', '--qlevel', '160', '--clevel', '3']
    else:
        args += ['--format', 'R8G8B8_SRGB', '--assign-tf', 'srgb', '--encode', 'basis-lz', '--qlevel', '200', '--clevel', '3']
    subprocess.run(args + [str(src), str(out)], check=True)
    print(f'{out.name:24s} {out.stat().st_size / 1024:7.0f} KB')


def emit(name, a, kind, size):
    p = WORK / f'{name}.png'
    im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    if im.size != (size, size * im.size[1] // im.size[0]):
        im = im.resize((size, size * im.size[1] // im.size[0]), Image.LANCZOS)
    im.save(p)
    ktx(p, OUT / f'{name}.ktx2', kind)


def ph(id_, part, size=2048, mode='RGB'):
    return load(DL / f'{id_}_{part}_2k.jpg', (size, size), mode)


def blur(a, r):
    """이어지는 가우스 흐림 (가장자리를 감아서 — 타일 이음매가 생기지 않게)"""
    from scipy.ndimage import gaussian_filter
    return gaussian_filter(a, r, mode='wrap')


def highpass(g, r):
    """큰 얼룩(r px 보다 큰 밝기 변화)을 빼고 잔결만"""
    return g - blur(g, r)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(7)

    # ── 기와: 둥근 수키와가 줄지어 내려가는 CC0 사진을 먹회색 기와로 (이끼 초록은 빼고 밝기 결만) ──
    roof = ph('ceramic_roof_01', 'diffuse')
    g = roof @ LUM
    roof = recolor(np.repeat(g[..., None], 3, -1), '#3E3E41', 0.0)
    roof = np.clip(roof * (0.92 + 0.16 * (g[..., None] - g.mean())), 0, 1)
    emit('roof_col', roof, 'color', 1024)
    emit('roof_nor', ph('ceramic_roof_01', 'nor_gl'), 'normal', 512)
    emit('roof_arm', ph('ceramic_roof_01', 'arm'), 'linear', 512)

    # ── 서까래 밑면: rafterTexture() 와 같은 배치(한 장에 서까래 8개, 끝 띠는 아래)를 사진 나무로 ──
    W = 1024
    boards = load(DL / 'weathered_planks_diffuse_2k.jpg', (W, W))
    boards = recolor(boards, '#D2C4A2', 0.25)
    grain = load(DL / 'fine_grained_wood_col_2k.jpg', (W, W)) @ LUM
    # 사진 결이 이미 세로(서까래 길이 방향) — |d/dx| 4.4 > |d/dy| 2.4 실측
    img = boards.copy()
    height = np.zeros((W, W), np.float32)
    xs = np.arange(W)
    for i in range(8):
        cx = (i + 0.5) * W / 8
        half = 36
        d = np.abs(xs - cx) / half
        inside = d < 1
        prof = np.sqrt(np.clip(1 - d * d, 0, 1))  # 둥근 서까래
        height[:, inside] = np.maximum(height[:, inside], prof[inside])
        shade = 0.55 + 0.45 * prof
        col = hexrgb('#1F4B41') * (1 - prof[:, None] * 0.0) + (hexrgb('#3D8A76') - hexrgb('#1F4B41')) * prof[:, None]
        g2 = (0.82 + 0.36 * (grain[:, inside] - grain.mean()))[..., None]
        img[:, inside] = np.clip(col[inside][None, :, :] * g2 * shade[inside][None, :, None] / 0.9, 0, 1)
        # 서까래 그늘이 개판에 (양옆)
        for side in (-1, 1):
            sh = (xs - cx) * side
            m = (sh > half) & (sh < half + 22)
            img[:, m] *= (0.72 + 0.28 * (sh[m] - half) / 22)[None, :, None]
        # 끝 띠 (그림 아래 = 처마 끝): 흰 띠, 주홍, 석황 — 지붕 밑면 v 의 6% (큰 법당 처마 깊이 약 5m 에서 0.3m)
        for y0, y1, hx in ((962, 970, '#F1E7CF'), (974, 996, '#B7402A'), (1000, 1024, '#E1B54A')):
            band = hexrgb(hx) * (0.85 + 0.25 * (grain[y0:y1, inside] - grain.mean()))[..., None]
            img[y0:y1][:, inside] = np.clip(band * shade[inside][None, :, None], 0, 1)
    # 뒤집지 않는다: 그림 아랫줄 = v≈1 = 처마 끝 (지붕 밑면 v 는 용마루 0 → 처마 1). 캔버스 판은 끝 띠가 용마루 쪽에 있었다
    emit('rafter_col', img, 'color', 1024)
    emit('rafter_nor', normal_from_height(height + 0.05 * grain, 6.0), 'normal', 512)

    # ── 단청 띠: 에셋 스파이크의 생성 그림 (가로로 이어지게 만든 것). 꽃이 위로 서게 뒤집어 굽는다 ──
    dc = load(ROOT / 'docs/art/generated/dancheong_band.jpg')
    emit('dancheong_col', dc[::-1], 'color', 1024)

    # ── 흙벽: 생성 그림 + CC0 흙미장 노멀 ──
    emit('wall_col', load(ROOT / 'docs/art/generated/earth_wall.jpg', (1024, 1024)), 'color', 1024)
    emit('wall_nor', ph('clay_plaster', 'nor_gl'), 'normal', 512)

    # ── 칠한 나무 결 (뇌록·주홍 칠 부재에 곱하는 밝기 결): 판재 사진은 줄눈이 줄무늬로 보여(시험 화면) 결 고운 나무로.
    #    결은 v(세로) 방향, 평균 0.95 — 칠 색이 어두워지지 않게. 노멀은 같은 결에서 얕게 ──
    wd = load(DL / 'fine_grained_wood_col_2k.jpg', (2048, 2048)) @ LUM  # 결은 세로 그대로
    wd = highpass(wd, 60)
    p = 0.95 + wd / max(wd.std(), 1e-4) * 0.035
    emit('paint_col', np.repeat(p[..., None], 3, -1), 'color', 1024)
    emit('paint_nor', normal_from_height(blur(wd, 1.5), 3.0), 'normal', 512)

    # ── 다듬은 화강암 (기단·계단·석등·박석): 바위 사진(rock_boulder_dry, 바깥 실사와 같은 CC0)의 큰 얼룩은 빼고 잔결만 —
    #    큰 얼룩이 다듬은 돌에서는 얼룩무늬로 보였다(시험 화면). 바탕은 절차적 화강암 색 #A9A69C 보다 조금 밝게 ──
    gr = ph('rock_boulder_dry', 'diffuse')
    gl = gr @ LUM
    hp = highpass(gl, 24)
    hp = hp / max(hp.std(), 1e-4)
    mid = highpass(blur(gl, 24), 160)  # 돌 한 장 안의 은은한 얼룩 (사진 큰 얼룩의 1/4 세기)
    mid = mid / max(mid.std(), 1e-4)
    # 색 잡음은 넣지 않는다 — ETC1S 가 잔 색결을 파랗고 노란 점으로 뭉갰다(시험 화면)
    stone = hexrgb('#B3B0A8') * (1 + 0.06 * hp[..., None] + 0.035 * mid[..., None])
    emit('stone_col', stone, 'color', 1024)
    emit('stone_nor', normal_from_height(blur(hp, 1.0) * 0.06, 2.0), 'normal', 512)

    # ── 청동(범종·화로·향로): 주물 금속 바탕(옛 절차적 청동 색) + 녹슨 사진의 잔결을 얕게 + 군데군데 번진 녹청.
    #    녹 사진을 그대로 쓰면 나무껍질처럼 보였다(시험 화면) — 결은 ±10% 만 ──
    rust = ph('rust_coarse_01', 'diffuse') @ LUM
    rh = highpass(blur(rust, 4), 60)  # 결을 cm 단위로 — 잔 녹결은 금속 반사에서 털처럼 반짝였다(시험 화면)
    rh = rh / max(rh.std(), 1e-4)
    br = hexrgb('#7A6440') * (1 + 0.1 * rh[..., None])
    pat = ph('green_metal_rust', 'diffuse') @ LUM
    blob = blur(rng.random((2048, 2048)).astype(np.float32), 90)
    blob = (blob - blob.mean()) / max(blob.std(), 1e-4)
    mask = np.clip(blob * 0.5 - 0.35 + 0.3 * (pat - pat.mean()), 0, 1)[..., None] * 0.6  # 녹청은 군데군데 번지게
    verd = hexrgb('#5B806C') * (0.85 + 0.3 * (pat[..., None] - pat.mean()))
    emit('bronze_col', br * (1 - mask) + verd * mask, 'color', 1024)
    emit('bronze_nor', normal_from_height(blur(rh, 2.0) * 0.05, 2.0), 'normal', 512)
    # ARM: R 틈 그늘(얕게) · G 거칠기(금속 0.5 ~ 녹청 0.85) · B 금속성(0.85, 녹청은 0)
    m2 = mask[..., 0] / 0.6
    arm = np.stack([1 - 0.12 * np.clip(-rh, 0, 3) / 3, 0.5 + 0.35 * m2 + 0.04 * rh, 0.85 * (1 - m2)], -1)
    emit('bronze_arm', arm, 'linear', 512)

    # ── 한지(연등): 섬유가 엉킨 결 — 이어지게 그린다 (가장자리를 넘는 선은 반대쪽에도) ──
    S = 512
    im = Image.new('L', (S, S), 236)
    dr = ImageDraw.Draw(im, 'L')
    for _ in range(2600):
        x, y = rng.random(2) * S
        ang = rng.random() * np.pi
        ln = 8 + rng.random() * 40
        pts = [(x + np.cos(ang + t * 0.03) * t, y + np.sin(ang + t * 0.03) * t) for t in np.linspace(0, ln, 6)]
        c = int(222 + rng.random() * 30)
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                dr.line([(a + ox, b + oy) for a, b in pts], fill=c, width=1)
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    h = np.asarray(im, np.float32) / 255
    cream = hexrgb('#F4EAD3') * (0.9 + 0.7 * (h[..., None] - h.mean()))
    emit('hanji_col', cream, 'color', 512)


if __name__ == '__main__':
    main()
