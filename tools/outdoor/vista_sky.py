"""쉼터 경치 사진의 하늘 걷어 내기 — 해질녘·밤 사진에 그려진 노을·은하수·별·보름달을 투명하게 (산과 골짜기만 남긴다).
사용자 2026-11-07: 쉼터에 앉으면 사진 속 하늘이 진짜 하늘(web/src/world/nightSky.js) 위에 덮여 달이 둘, 하늘이 엉키고, 비에도 은하수가 비쳤다.

  python3 -I tools/outdoor/vista_sky.py GEN OUTGEN      → OUTGEN/vista_<곳>_{dusk,night}/<같은 이름>.png (RGBA)
  KTX_BIN=… ONLY=vistas python3 -I tools/outdoor/build.py OUTGEN - WORK   → web/assets/world/outdoor/vista_*_{dusk,night}{,_lo}.ktx2

GEN: 생성 원본 폴더 (GEN/vista_<곳>[_dusk|_night]/<이름>.png — tools/outdoor/gen.sh 가 만든 RGB 3:2).
산등성이 선: 낮·해질녘·밤 세 장은 같은 산을 편집한 것이라 산등성이가 같은 줄에 있다. 세 장 평균 밝기가 위(하늘) 창보다 아래(산) 창에서
뚝 떨어지는 첫 줄을 열마다 찾는다 — 구름 아래 가장자리는 세 장에서 밝고 어두움이 엇갈려 평균으로는 떨어지지 않는다. 보름달·구름에 걸린 기둥과
좁은 돌기는 지운다 (옅은 먼 능선은 군데군데 놓쳐 그 자리만 잘린다 — 좁은 홈을 메우면 진짜 골짜기까지 하늘로 차서 두지 않았다). 산등성이 둘레 3px 에 걸쳐 부드럽게 투명 (그 띠의 색은 바로 아래 산 색). 낮 사진은 그대로 둔다 (낮 하늘은 절차 하늘과 같은 파란 하늘이라 겹쳐도 어긋나지 않는다).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

LUM = np.array([0.2126, 0.7152, 0.0722], np.float32)
WIN, DROP, TOP = 10, 0.1, 0.15  # 위·아래 창 높이(px), 산으로 볼 밝기 하락(창 평균, 세 장 평균), 이 비율 위쪽은 늘 하늘


def lum(p):
    return (np.asarray(Image.open(p).convert('RGB'), np.float32) / 255.0) @ LUM


def first_drop(L, y_from):
    """열마다 y_from 아래에서 위 창보다 아래 창이 DROP 이상 어두워지는 첫 줄 (없으면 맨 아래)"""
    H, W = L.shape
    c = np.cumsum(np.vstack([np.zeros((1, W), np.float32), L]), 0)
    ridge = np.full(W, H - 1)
    for y in range(int(H * TOP) + WIN, H - WIN):
        hit = ((c[y] - c[y - WIN]) - (c[y + WIN] - c[y]) > DROP * WIN) & (ridge == H - 1) & (y >= y_from)
        ridge[hit] = y
    return ridge


def running_median(v, k):
    pad = np.pad(v, k // 2, mode='edge')
    return np.median(np.stack([pad[i:i + len(v)] for i in range(k)]), 0)


def ridge_line(Ls):
    L = np.mean(Ls, 0)
    L = (L + np.roll(L, 1, 1) + np.roll(L, -1, 1)) / 3  # 별 한 점이 열 판단을 흔들지 않게
    # 1차: 위에서 첫 하락. 보름달·구름 아래 가장자리에서 걸린 열은 좁은 기둥으로 튀어 오른다
    r1 = first_drop(L, np.zeros(L.shape[1]))
    # 2차: 넓게(101열) 본 중앙값보다 60px 넘게 높이 걸린 열은 거기서부터 다시 찾는다 (봉우리는 둘레와 이어져 오르므로 남는다)
    wide = running_median(r1, 101)
    r2 = running_median(first_drop(L, np.where(r1 < wide - 60, wide - 60, 0)), 9)
    # 3차: 산등성이 바로 위 구름 아래 가장자리에서 걸린 좁은 돌기(21열보다 좁게 솟은 것)만 지운다 — 높이 곡선의 열림(최댓값 → 최솟값 거르기).
    # 봉우리는 넓게 솟아 모양이 남고, 매끈한 봉우리 끝이 몇 px 깎일 뿐이다
    win = lambda v, k, f: f(np.stack([np.pad(v, k // 2, mode='edge')[i:i + len(v)] for i in range(k)]), 0)
    r3 = win(win(r2, 21, np.max), 21, np.min)
    # 창 평균 조건은 산에 닿기 몇 px 전에 먼저 충족된다 — 그 아래 14px 안에서 밝기가 가장 가파르게 떨어지는 줄로 맞춘다
    H, W = L.shape
    g = np.zeros_like(L)
    g[2:-2] = L[:-4] - L[4:]
    cols = np.arange(W)
    ys = np.clip(np.round(r3).astype(int)[None, :] + np.arange(0, 15)[:, None], 0, H - 1)
    return ys[np.argmax(g[ys, cols[None, :]], 0), cols].astype(np.float32)


def main():
    gen, out = Path(sys.argv[1]), Path(sys.argv[2])
    for day in sorted(gen.glob('vista_*')):
        name = day.name
        if name.endswith(('_dusk', '_night')):
            continue
        vs = {v: gen / f'{name}{v}' / f'{name}{v}.png' for v in ('', '_dusk', '_night')}
        if not all(p.exists() for p in vs.values()):
            continue
        ridge = ridge_line([lum(p) for p in vs.values()])
        H = Image.open(vs['']).height
        y = np.arange(H, dtype=np.float32)[:, None]
        alpha = np.clip((y - (ridge[None, :] - 0.5)) / 3.0, 0, 1)  # 산등성이 위 0.5px 에서 0 → 아래 2.5px 에서 1 (하늘빛 테두리가 남지 않게)
        print(f'{name}: 산등성이 {ridge.min():.0f}~{ridge.max():.0f}px (높이 {H}), 위에서 {ridge.mean() / H * 100:.0f}%')
        cols = np.arange(alpha.shape[1])
        for v in ('_dusk', '_night'):
            rgb = np.asarray(Image.open(vs[v]).convert('RGB'), np.uint8).copy()
            # 반투명 경계 3px 는 바로 아래 산 색으로 (하늘빛 테두리가 산등성이에 남지 않게)
            r = np.round(ridge).astype(int)
            for dy in range(-1, 4):
                rgb[np.clip(r + dy, 0, H - 1), cols] = rgb[np.clip(r + 4, 0, H - 1), cols]
            a = (alpha * 255 + 0.5).astype(np.uint8)[..., None]
            d = out / f'{name}{v}'
            d.mkdir(parents=True, exist_ok=True)
            Image.fromarray(np.concatenate([rgb, a], -1), 'RGBA').save(d / f'{name}{v}.png')


if __name__ == '__main__':
    main()
