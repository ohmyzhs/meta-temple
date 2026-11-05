"""HDRI(.npy, tools/blender/hdr_to_npy.py 결과) → 웹용 하늘 파일.

  python3 -I tools/spike/sky.py day   day.npy   OUTDIR --exposure 1.0
  python3 -I tools/spike/sky.py night night.npy OUTDIR --exposure 1.0

만드는 것 (OUTDIR):
  {name}_bg_{w}.jpg  배경 — three 의 ACESFilmic 과 같은 곡선·노출로 미리 톤매핑한 sRGB (three 는 sRGB 배경을 톤매핑하지 않음)
  {name}_env.hdr     조명(IBL)용 256×128 RGBE — 낮은 해를 하늘 밝기로 눌러 둔다 (해는 따로 DirectionalLight 로)
  {name}.json        해(달) 방향 uv, 고도, 해 조도(HDR 단위) 등 런타임 상수
밤: 지평선 아래(사막·바위)는 남빛으로 덮고, 지평선 위 몇 도는 옅은 남빛으로 번지게 한다 (스펙: 지평선 쪽 옅은 남빛).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

LUM = np.array([0.2126, 0.7152, 0.0722], np.float32)


def aces_three(c, exposure):
    """three.js r170 ACESFilmicToneMapping 그대로 (mat3 은 열 우선)."""
    c = c * (exposure / 0.6)
    i0, i1, i2 = np.array([0.59719, 0.07600, 0.02840]), np.array([0.35458, 0.90834, 0.13383]), np.array([0.04823, 0.01566, 0.83777])
    v = c[..., 0:1] * i0 + c[..., 1:2] * i1 + c[..., 2:3] * i2
    a = v * (v + 0.0245786) - 0.000090537
    b = v * (0.983729 * v + 0.4329510) + 0.238081
    v = a / b
    o0, o1, o2 = np.array([1.60475, -0.10208, -0.00327]), np.array([-0.53108, 1.10813, -0.07276]), np.array([-0.07367, -0.00605, 1.07602])
    v = v[..., 0:1] * o0 + v[..., 1:2] * o1 + v[..., 2:3] * o2
    return np.clip(v, 0, 1)


def srgb(x):
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.maximum(x, 0), 1 / 2.4) - 0.055)


def solid_angles(h, w):
    elev = np.pi / 2 - (np.arange(h) + 0.5) / h * np.pi
    return (np.cos(elev) * (np.pi / h) * (2 * np.pi / w))[:, None], elev


def downsample(a, w):
    h = w // 2
    im = [Image.fromarray(a[..., k]) for k in range(3)]
    return np.stack([np.asarray(i.resize((w, h), Image.BOX)) for i in im], -1).astype(np.float32)


def write_rgbe(path, a):
    h, w, _ = a.shape
    m = a.max(axis=2)
    f, e = np.frexp(m)
    scale = np.where(m > 1e-32, f * 256.0 / np.maximum(m, 1e-32), 0)
    rgbe = np.zeros((h, w, 4), np.uint8)
    rgbe[..., :3] = np.clip(a * scale[..., None], 0, 255).astype(np.uint8)
    rgbe[..., 3] = np.where(m > 1e-32, e + 128, 0).astype(np.uint8)
    if rgbe[0, 0, 0] == 2 and rgbe[0, 0, 1] == 2:  # RLE 표식으로 오인되지 않게
        rgbe[0, 0, 0] = 3
    with open(path, 'wb') as fh:
        fh.write(f'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y {h} +X {w}\n'.encode())
        fh.write(rgbe.tobytes())


def main():
    kind, src, out = sys.argv[1:4]
    exposure = float(sys.argv[sys.argv.index('--exposure') + 1]) if '--exposure' in sys.argv else 1.0
    arg = lambda k, d: float(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
    bg_gain, bg_sat = arg('--bg-gain', 1.0), arg('--bg-sat', 1.0)  # 배경 사진만의 노출 배율·채도 (조명값과 별개)
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    a = np.load(src).astype(np.float32)
    h, w, _ = a.shape
    dw, elev = solid_angles(h, w)
    L = a @ LUM
    meta = {'source': Path(src).stem, 'exposure': exposure, 'bgGain': bg_gain, 'bgSat': bg_sat}

    if kind == 'day':
        y, x = np.unravel_index(np.argmax(L), L.shape)
        sun = L > np.percentile(L, 99.9) * 20  # 해 원반 (하늘 상위 0.1% 의 20배 넘는 픽셀)
        e_sun = float((a * sun[..., None] * dw[..., None]).sum(axis=(0, 1)) @ LUM)  # 해를 향한 면의 조도
        sun_rgb = (a * sun[..., None] * dw[..., None]).sum(axis=(0, 1))
        sun_rgb = (sun_rgb / max(sun_rgb.max(), 1e-9)).tolist()
        sky = a.copy()
        cap = np.percentile(L[: h // 2], 99.5)
        Ls = sky @ LUM
        over = Ls > cap
        sky[over] *= (cap / Ls[over])[:, None]  # 해·둘레를 하늘 밝기로 눌러 IBL 이 해를 두 번 더하지 않게
        e_sky_h = float(((sky @ LUM) * np.sin(np.maximum(elev, 0))[:, None] * dw).sum())  # 수평면 하늘 조도
        meta.update(sunU=(x + 0.5) / w, sunV=(y + 0.5) / h, sunElevDeg=float(np.degrees(elev[y])),
                    sunIrradiance=e_sun, sunColor=sun_rgb, skyIrradianceHorizontal=e_sky_h, sunPixels=int(sun.sum()))
        # 지평선 아래(퓨어 스카이의 어두운 바닥)는 지평선 띠 색으로 — 바닥 끝 너머가 검게 뚫려 보이지 않게
        e_deg = np.degrees(elev)[:, None, None]
        horizon = a[(np.abs(np.degrees(elev)) < 1.0)].mean(axis=0)
        below = np.clip(-e_deg / 4.0, 0, 1)
        bg = a * (1 - below) + horizon * (1 - 0.45 * below) * below  # 아래로 갈수록 조금 어둡게
        env = sky
    else:
        # 장노출 사진의 뿌연 하늘빛(대기광)을 빼서 하늘을 깊은 남빛으로, 별·은하수는 남긴다
        m = np.median(a[: h // 2].reshape(-1, 3), axis=0)
        bg = np.maximum(a - m * 0.85, 0) * 1.6
        e0 = np.clip(np.degrees(elev), 0, 90)[:, None, None] / 90.0
        navy = np.array([0.050, 0.075, 0.17], np.float32) * (1 - e0) + np.array([0.012, 0.020, 0.055], np.float32) * e0
        bg = bg + navy
        indigo_low = np.array([0.020, 0.028, 0.060], np.float32)   # 지평선 아래
        indigo_haze = np.array([0.10, 0.13, 0.24], np.float32)     # 지평선 위 옅은 남빛
        e_deg = np.degrees(elev)[:, None, None]
        # 지평선 가까이 남은 주황 광해를 덜어 내고(채도↓·푸른 쪽으로), 바위 능선은 옅은 남빛 실루엣으로
        warm = np.clip(1 - e_deg / 25.0, 0, 1) * (e_deg >= 0)
        g = (bg @ LUM)[..., None]
        bg = bg * (1 - warm * 0.7) + (g * np.array([0.75, 0.9, 1.35], np.float32)) * warm * 0.7
        haze = np.clip(1 - e_deg / 9.0, 0, 1) ** 1.2 * (e_deg >= 0)
        bg = bg * (1 - haze * 0.85) + indigo_haze * haze * 0.85
        below = np.clip(-e_deg / 3.0, 0, 1)
        bg = bg * (1 - below) + indigo_low * below
        env = bg
        meta.update(skyMedianUpper=float(np.median(L[: h // 2])))

    for bw in ([2048] if kind == 'day' else [4096, 2048]):
        if bw > w:
            continue
        im = bg if bw == w else downsample(bg, bw)
        ldr = aces_three(im, exposure * bg_gain)
        g = (ldr @ LUM)[..., None]
        ldr = srgb(np.clip(g + (ldr - g) * bg_sat, 0, 1))
        Image.fromarray((ldr * 255 + 0.5).astype(np.uint8)).save(out / f'{kind}_bg_{bw}.jpg', quality=88, optimize=True, progressive=True)
    write_rgbe(out / f'{kind}_env.hdr', downsample(env, 256))
    (out / f'{kind}.json').write_text(json.dumps(meta, indent=1))
    print(json.dumps(meta))


if __name__ == '__main__':
    main()
