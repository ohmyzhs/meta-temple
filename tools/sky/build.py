"""밤하늘 굽기 — NASA SVS Deep Star Maps 2020 (4k, 천구 좌표 J2000, 선형 HDR EXR) → web/assets/world/sky/
  milkyway.webp (4096×2048) · milkyway_lo.webp (2048×1024): 밝은 별을 뺀 은하수 빛·먼지 띠·희미한 별 (sRGB 8비트)
  stars.bin: 밝은 별 N 개 — Float32 [x, y, z, r, g, b] × N. xyz = 천구 좌표 단위 벡터 (x→RA 0h, y→RA 6h, z→천구 북극),
             rgb = 별빛 양 (지도 화소값 합 × 화소 입체각, sr) — 셰이더가 화면 픽셀 크기와 상관없이 같은 밝기로 점을 그린다
지도 방향 (재서 확인): u = 0.5 − RA/24h (가운데가 0h, 왼쪽으로 늘어남), 위가 +90° — 대각성(14h16m, +19°)·북극성(2h32m, +89.3°) 자리 일치.
원본 받기 (36 MB, git 에 넣지 않음):
  curl -o tools/sky/raw/starmap_2020_4k.exr https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_4k.exr
실행: python3 tools/sky/build.py [원본 경로]
출처: NASA/Goddard Space Flight Center Scientific Visualization Studio, Gaia DR2: ESA/Gaia/DPAC (https://svs.gsfc.nasa.gov/4851)
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import exr  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'tools/sky/raw/starmap_2020_4k.exr'
OUT = ROOT / 'web/assets/world/sky'
N_STARS = 6000  # 점으로 그릴 밝은 별 수 (맨눈 6등급까지가 온 하늘 약 9천 — 그중 밝은 쪽)
R_OPEN = 3  # 별을 지우는 열림(최솟값→최댓값) 반지름 (px) — 4k 지도의 별은 1~3px


def shift_min_max(a, r, op, axis):
    out = a.copy()
    for k in range(1, r + 1):
        for s in (k, -k):
            out = op(out, np.roll(a, s, axis=axis))
    return out


def opening(a, r):
    """회색조 열림: 반지름 r 보다 작은 밝은 점(별)을 지우고 넓은 빛(은하수)만 남긴다. 가로는 이어 붙인다(둘레 360°)"""
    m = shift_min_max(shift_min_max(a, r, np.minimum, 1), r, np.minimum, 0)
    return shift_min_max(shift_min_max(m, r, np.maximum, 1), r, np.maximum, 0)


def box(a, r):
    out = np.zeros_like(a)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out += np.roll(np.roll(a, dy, 0), dx, 1)
    return out / (2 * r + 1) ** 2


def srgb8(a):
    a = np.clip(a, 0, 1)
    s = np.where(a <= 0.0031308, 12.92 * a, 1.055 * np.power(a, 1 / 2.4) - 0.055)
    return (s * 255 + 0.5).astype(np.uint8)


def main():
    raw, chans = exr.read(SRC)
    img = raw[:, :, [chans.index(c) for c in 'RGB']]
    H, W, _ = img.shape
    L = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    bg = np.stack([box(opening(img[:, :, c], R_OPEN), 2) for c in range(3)], 2)
    bgL = bg @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    res = L - bgL
    # 별 = 둘레 3×3 에서 가장 밝고 배경보다 뚜렷이 밝은 점
    # 은하 중심처럼 바탕이 밝은 곳은 별구름 알갱이가 다 '별'로 잡혀 반짝이 가루처럼 보인다 — 바탕의 1.5배는 더 밝아야 점 별로 뺀다
    peak = res > 0.05 + 1.5 * bgL
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx or dy:
                peak &= res >= np.roll(np.roll(res, dy, 0), dx, 1)
    ys, xs = np.nonzero(peak)
    # 별빛 양: 배경 뺀 RGB 를 둘레(세로 5px, 가로는 극 가까이 늘어난 만큼 넓게)에서 합하고 화소 입체각을 곱한다 — 극 가까이 늘어난 별도 제 밝기로
    resRGB = np.clip(img - bg, 0, None)
    lw = np.array([0.2126, 0.7152, 0.0722], np.float32)
    cands = []
    for y, x in zip(ys, xs):
        d = np.pi / 2 - (y + 0.5) / H * np.pi
        rx = int(min(W // 4, np.ceil(2 / max(np.cos(d), 1e-3))))
        y0, y1 = max(0, y - 2), min(H, y + 3)
        cols = np.arange(x - rx, x + rx + 1) % W
        patch = resRGB[y0:y1][:, cols]
        w = patch @ lw
        sw = w.sum() + 1e-9
        cy = (w.sum(1) * np.arange(y0, y1)).sum() / sw
        cx = x + (w.sum(0) * np.arange(-rx, rx + 1)).sum() / sw
        ra = (0.5 - (cx + 0.5) / W) * 2 * np.pi
        de = np.pi / 2 - (cy + 0.5) / H * np.pi
        f = patch.reshape(-1, 3).sum(0) * (2 * np.pi / W) * (np.pi / H) * np.cos(de)
        cands.append((float(f @ lw), y, x, rx, np.array([np.cos(de) * np.cos(ra), np.cos(de) * np.sin(ra), np.sin(de)]), f))
    cands.sort(key=lambda c: -c[0])
    # 같은 별을 두 번 잡지 않게: 이미 고른 별에서 0.2° 안은 버린다 (극 가까이 가로로 늘어난 별이 여러 꼭짓점을 낸다)
    cell, near, grid, keep = 0.0035, np.cos(np.radians(0.2)), {}, []
    for c in cands:
        k = tuple(np.floor(c[4] / cell).astype(int))
        if any(c[4] @ o[4] > near for dx in (-1, 0, 1) for dy in (-1, 0, 1) for dz in (-1, 0, 1) for o in grid.get((k[0] + dx, k[1] + dy, k[2] + dz), ())):
            continue
        grid.setdefault(k, []).append(c)
        keep.append(c)
        if len(keep) == N_STARS:
            break
    # 점으로 따로 그릴 별은 지도에서 지운다 (두 번 그리지 않게). 배경으로 덮으면 희미한 별 잔결까지 사라져 네모 구멍이 보이므로
    # 그 둘레 잔결 수준(배경 + 둘레 잔차 평균의 2배)까지만 누른다
    # 잔결은 별을 잘라 낸 잔차로 잰다 (별 자체가 섞이면 밝은 별 둘레가 안 눌린다). 밝은 별은 번짐이 넓어 창을 키운다 (반지름 2~7px)
    grain = np.stack([box(np.minimum(resRGB[:, :, c], 0.02), 4) for c in range(3)], 2) * 2
    glow = img.copy()
    top = keep[0][0]
    for lum, y, x, rx, v, f in keep:
        r = int(round(2 + 5 * np.sqrt(lum / top)))
        d = np.pi / 2 - (y + 0.5) / H * np.pi
        rx = int(min(W // 4, np.ceil(r / max(np.cos(d), 1e-3))))
        y0, y1 = max(0, y - r), min(H, y + r + 1)
        cols = np.arange(x - rx, x + rx + 1) % W
        glow[y0:y1, cols] = np.minimum(glow[y0:y1, cols], bg[y0:y1, cols] + grain[y0:y1, cols])
    # 천구 극 둘레(|적위| > 88.5°)는 한 줄이 한 점으로 모인다 — 줄 평균으로 고르게 (늘어난 북극성이 작은 고리로 보이지 않게)
    cap = int(np.ceil(1.5 / 180 * H))
    for rows in (slice(0, cap), slice(H - cap, H)):
        glow[rows] = glow[rows].mean(1, keepdims=True)
    rec = [[*v, *f] for lum, y, x, rx, v, f in keep]
    stars = cands
    OUT.mkdir(parents=True, exist_ok=True)
    np.asarray(rec, np.float32).tofile(OUT / 'stars.bin')
    Image.fromarray(srgb8(glow)).save(OUT / 'milkyway.webp', quality=86, method=6)
    lo = glow.reshape(H // 2, 2, W // 2, 2, 3).mean((1, 3))
    Image.fromarray(srgb8(lo)).save(OUT / 'milkyway_lo.webp', quality=86, method=6)
    lums = np.array([s[0] for s in keep])
    print(f'별 후보 {len(stars)} → {len(keep)} (별빛 최대 {lums[0]:.2e}, 끝 {lums[-1]:.2e} sr), 배경 중앙값 {np.median(bgL):.5f}')
    for p in sorted(OUT.iterdir()):
        print(f'  {p.name} {p.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
