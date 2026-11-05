"""청연산사 아바타 — 동자승(monk) 2.5등신 치비 모델·리그·가중치·질감·동작 클립을 만들어 스킨드 GLB 로 내보낸다.

  /opt/homebrew/bin/blender -b --factory-startup -P tools/blender/avatar_build.py -- \
      --out web/assets/avatars [--tex 1024] [--preview DIR] [--only-model]

- 다시 만들 수 있게 전부 코드로 만든다 (파일 하나 + avatar_clips.py 동작표). 바깥 파일·애드온 없음.
- 폴리곤으로 실사를 깎지 않는다: 동글동글한 실루엣(삼각형 약 6천)에 깨끗한 단색 질감·부드러운 주름 노멀·그린 얼굴.
- 눈은 얼굴에 얹는 조각 두 벌(뜬 눈·감은 눈) — 런타임이 깜빡이고 좌선·절할 때 감긴다.
- 좌표: 블렌더 Z 위, 캐릭터는 -Y 를 본다(+X 가 캐릭터 왼쪽). glTF 로 나가면 Y 위, +Z 앞 (three.js 아바타와 같은 방향).
- 키는 지금 절차식 아바타와 비슷하게 1.34m (머리 0.58m), 눈 높이 1.0m — 카메라·이름표·좌복 값은 그대로 둔다.
- 결과: OUT/monk.glb (텍스처는 PNG 그대로 — 압축은 tools/blender/avatar_pack.sh 의 gltf-transform 이),
        OUT/monk.json (클립 길이·걸음 속도·접촉 시각 등 실측값; 런타임은 GLB 안 scene.extras.motion 을 읽는다)
"""
import json
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import avatar_clips as AC  # noqa: E402

A = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(k, d=None, f=str):
    return f(A[A.index(k) + 1]) if k in A else d


OUT = os.path.abspath(arg('--out', 'web/assets/avatars'))
TEX = arg('--tex', 1024, int)
PREVIEW = arg('--preview')
ONLY_MODEL = '--only-model' in A
os.makedirs(OUT, exist_ok=True)
T0 = time.time()
log = lambda *m: print('[avatar %.1fs]' % (time.time() - T0), *m, flush=True)
TAU = math.tau
V = Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene
SC.render.fps = AC.FPS

# ───────────────────────── 치수 (m) ─────────────────────────
# 관절 (쉬는 자세: 팔은 45° 아래로 벌린 A 자세, 팔꿈치를 살짝 굽혀 IK 굽힘 방향을 정해 둔다) — avatar_clips.J 와 공유
J = {k: V(v) for k, v in AC.J.items()}
EYE = V(AC.EYE)  # 서서 눈(감은 눈 사이) — 1인칭 눈 위치의 기준

# 질감 아틀라스 구역 (u0, v0, u1, v1)
R_HEAD = (0.0, 0.5, 0.5, 1.0)
R_TORSO = (0.5, 0.5, 1.0, 1.0)
R_LEG = (0.0, 0.0, 0.25, 0.5)
R_SLEEVE = (0.25, 0.0, 0.5, 0.5)
R_KASA = (0.5, 0.375, 1.0, 0.5)
R_COLLAR = (0.5, 0.3125, 1.0, 0.375)
R_HAND = (0.5, 0.1875, 0.625, 0.3125)
R_SHOE = (0.625, 0.1875, 0.75, 0.3125)
R_SKIN = (0.75, 0.1875, 0.875, 0.3125)
R_PELVIS = (0.875, 0.1875, 1.0, 0.3125)
R_RING = (0.5, 0.125, 0.5625, 0.1875)
R_EYE = (0.5625, 0.0625, 0.6875, 0.1875)   # 뜬 눈 한 짝 (두 눈이 같이 쓴다)
R_LID = (0.6875, 0.125, 0.75, 0.1875)      # 감은 눈 선 (짙은 단색)

# ───────────────────────── 메시 도구 ─────────────────────────
PARTS = []  # (name, bmesh-built object, weight rule)


def new_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    SC.collection.objects.link(ob)
    return ob


def loft(name, rings, uv_rect, v_param=None, cap0=False, cap1=False, outward=None):
    """rings: [[Vector]*N]*K, 닫힌 고리들을 이어 만든 관. u 는 고리 둘레(0→1), v 는 고리 순서."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    K, N = len(rings), len(rings[0])
    vs = v_param or [k / (K - 1) for k in range(K)]
    u0, v0, u1, v1 = inset(uv_rect)
    W = lambda uu, vv: (u0 + uu * (u1 - u0), v0 + vv * (v1 - v0))
    vert = [[bm.verts.new(p) for p in ring] for ring in rings]
    for k in range(K - 1):
        for i in range(N):
            j = (i + 1) % N
            f = bm.faces.new((vert[k][i], vert[k][j], vert[k + 1][j], vert[k + 1][i]))
            for lp, uv in zip(f.loops, [(i / N, vs[k]), ((i + 1) / N, vs[k]), ((i + 1) / N, vs[k + 1]), (i / N, vs[k + 1])]):
                lp[uvl].uv = W(*uv)
    for flag, k in ((cap0, 0), (cap1, K - 1)):
        if not flag:
            continue
        c = bm.verts.new(sum(rings[k], V()) / N)
        for i in range(N):
            j = (i + 1) % N
            f = bm.faces.new((vert[k][i], vert[k][j], c) if k else (vert[k][j], vert[k][i], c))
            for lp, uv in zip(f.loops, [((i + 0.5) / N, vs[k])] * 3):
                lp[uvl].uv = W(*uv)
    bm.normal_update()
    if outward is not None:  # 바깥을 보도록: 면 법선과 (면 중심 - 축) 내적의 합이 음이면 뒤집는다
        s = sum(f.normal.dot(f.calc_center_median() - outward(f.calc_center_median())) for f in bm.faces)
        if s < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return new_obj(name, bm)


def inset(r, px=4):
    """구역 안쪽으로 px 텍셀 들인다 (구역 둘레를 따라 밉맵이 옆 구역 색을 끌어오지 않게)."""
    e = px / TEX
    return (r[0] + e, r[1] + e, r[2] - e, r[3] - e)


def ring_at(c, X, Yb, rx, ry, n, phase=0.0):
    """θ=0 이 Yb 쪽, θ=π/2 가 X 쪽인 타원 고리 (u 이음매는 Yb 쪽)."""
    return [c + X * (rx * math.sin(TAU * i / n + phase)) + Yb * (ry * math.cos(TAU * i / n + phase)) for i in range(n)]


def tube_along(path, radii, n, back_hint, drop=None):
    """경로를 따라가는 관 고리들. radii[k] = (rx, ry). back_hint: 이음매(u=0)를 둘 쪽 (안쪽·아래쪽)."""
    rings = []
    for k, c in enumerate(path):
        t = (path[min(k + 1, len(path) - 1)] - path[max(k - 1, 0)]).normalized()
        yb = (back_hint - t * back_hint.dot(t)).normalized()
        x = t.cross(yb).normalized()
        cc = c + (drop[k] if drop else V())
        rings.append(ring_at(cc, x, yb, radii[k][0], radii[k][1], n))
    return rings


def ellipsoid(name, c, r, uv_rect, n=12, m=8):
    rings = []
    vs = []
    for k in range(1, m):
        ph = -math.pi / 2 + math.pi * k / m
        rings.append(ring_at(c + V((0, 0, r[2] * math.sin(ph))), V((1, 0, 0)), V((0, 1, 0)), r[0] * math.cos(ph), r[1] * math.cos(ph), n))
        vs.append(k / m)
    return loft(name, rings, uv_rect, vs, cap0=True, cap1=True, outward=lambda p: c)


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


# ───────────────────────── 몸 각 부분 (2.5등신 치비) ─────────────────────────
# 저고리(동방) 단면: z → (rx, ry, y중심) — 배가 동글고 어깨는 좁다
TORSO_PROF = [
    (0.265, 0.172, 0.152, 0.0), (0.30, 0.173, 0.156, -0.002), (0.36, 0.171, 0.159, -0.006), (0.42, 0.166, 0.156, -0.008),
    (0.48, 0.159, 0.148, -0.006), (0.54, 0.151, 0.137, -0.004), (0.60, 0.144, 0.125, 0.0), (0.645, 0.135, 0.113, 0.002),
    (0.68, 0.115, 0.098, 0.003), (0.705, 0.086, 0.081, 0.003), (0.725, 0.062, 0.062, 0.002), (0.737, 0.05, 0.05, 0.0),
]


def torso_surface(z, theta):
    """저고리 겉면 점 (가사·깃을 옷 위에 얹을 때 쓴다). theta: 0=뒤(+Y), π/2=왼쪽(+X)."""
    zs = [p[0] for p in TORSO_PROF]
    z = min(max(z, zs[0]), zs[-1])
    for i in range(len(zs) - 1):
        if zs[i] <= z <= zs[i + 1]:
            t = (z - zs[i]) / (zs[i + 1] - zs[i])
            a, b = TORSO_PROF[i], TORSO_PROF[i + 1]
            rx, ry, yc = lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)
            return V((rx * math.sin(theta), yc + ry * math.cos(theta), z))


def build_torso():
    N = 32
    rings, vs = [], []
    for (z, rx, ry, yc), v in [((0.31, 0.162, 0.144, 0.0), 0.0), ((0.268, 0.166, 0.147, 0.0), 0.02)]:
        rings.append(ring_at(V((0, yc, z)), V((1, 0, 0)), V((0, 1, 0)), rx, ry, N))
        vs.append(v)
    z0, z1 = TORSO_PROF[0][0], TORSO_PROF[-1][0]
    for z, rx, ry, yc in TORSO_PROF:
        rings.append(ring_at(V((0, yc, z)), V((1, 0, 0)), V((0, 1, 0)), rx, ry, N))
        vs.append(0.04 + 0.96 * (z - z0) / (z1 - z0))
    return loft('torso', rings, R_TORSO, vs, outward=lambda p: V((0, 0, p.z)))


def path_v(pts):
    L_ = sum((pts[i + 1] - pts[i]).length for i in range(len(pts) - 1))
    acc, vs = 0.0, [0.0]
    for i in range(len(pts) - 1):
        acc += (pts[i + 1] - pts[i]).length
        vs.append(acc / L_)
    return vs


def build_legs():
    obs = []
    for s, x in (('L', 1), ('R', -1)):
        hj, kn, an = J[f'hipj.{s}'], J[f'knee.{s}'], J[f'ankle.{s}']
        top = V((x * 0.068, 0, 0.44))
        pts = [top, lerp(top, hj, 0.5), hj, lerp(hj, kn, 0.5), kn, lerp(kn, an, 0.35), lerp(kn, an, 0.62), lerp(kn, an, 0.8), an + V((0, 0, -0.012))]
        rad = [(0.072, 0.072), (0.074, 0.075), (0.073, 0.075), (0.07, 0.072), (0.066, 0.068), (0.062, 0.064), (0.056, 0.057), (0.05, 0.05), (0.046, 0.046)]
        rings = tube_along(pts, rad, 18, V((-x, 0, 0)))  # 이음매는 다리 안쪽
        axis = lambda p, pts=pts: min(pts, key=lambda q: (q - p).length)
        obs.append((loft(f'leg.{s}', rings, R_LEG, path_v(pts), cap1=True, outward=axis), s))
    return obs


def build_sleeves():
    obs = []
    for s, x in (('L', 1), ('R', -1)):
        sh, el, wr = J[f'shoulder.{s}'], J[f'elbow.{s}'], J[f'wrist.{s}']
        d2 = (wr - el).normalized()
        cuff = wr + d2 * 0.008
        root_ = V((x * 0.085, 0.0, 0.66))
        pts = [root_, sh, lerp(sh, el, 0.5), el, lerp(el, cuff, 0.45), lerp(el, cuff, 0.8), cuff]
        rad = [(0.06, 0.06), (0.058, 0.058), (0.054, 0.055), (0.052, 0.054), (0.056, 0.058), (0.062, 0.064), (0.066, 0.068)]
        drop = [V((0, 0, 0))] * 4 + [V((0, 0, -0.004)), V((0, 0, -0.009)), V((0, 0, -0.013))]
        rings = tube_along(pts, rad, 16, V((-x * 0.6, 0, -1)), drop)
        c = sum(rings[-1], V()) / len(rings[-1])
        lip = [c + (p - c) * 0.86 for p in rings[-1]]
        inner = [p - d2 * 0.035 for p in lip]
        rings += [lip, inner]
        vs = [0, 0.14, 0.32, 0.5, 0.68, 0.84, 0.95, 0.975, 1.0]
        obs.append((loft(f'sleeve.{s}', rings, R_SLEEVE, vs), s))
    return obs


HC, HR = V(AC.HEAD_C), V(AC.HEAD_R)


def head_point(th, ph):
    """머리 겉면 (u=θ/2π, 0=뒤 → 0.5=얼굴, φ: -π/2 턱 → π/2 정수리). 볼이 통통하고 턱은 살짝 좁다."""
    sp, cp = math.sin(ph), math.cos(ph)
    jaw = 1 - 0.07 * max(0.0, -sp) ** 1.5
    rx = HR.x * cp * jaw
    back = 1.03 if math.cos(th) > 0 else 0.985
    ry = HR.y * cp * lerp(1.0, back, abs(math.cos(th)))
    return V((rx * math.sin(th), HC.y + ry * math.cos(th), HC.z + HR.z * sp))


def head_angles(x, z):
    """얼굴 쪽 (x, z) 에 해당하는 θ, φ (눈·입 자리를 머리 겉면에 놓을 때)."""
    ph = math.asin(max(-1, min(1, (z - HC.z) / HR.z)))
    rx = HR.x * math.cos(ph)
    th = math.pi - math.asin(max(-1, min(1, x / max(rx, 1e-6))))  # θ=π 가 정면
    return th, ph


def build_head():
    rings, vs = [], []
    m, n = 22, 36
    for k in range(1, m):
        ph = -math.pi / 2 + math.pi * k / m
        rings.append([head_point(TAU * i / n, ph) for i in range(n)])
        vs.append(k / m)
    head = loft('head', rings, R_HEAD, vs, cap0=True, cap1=True, outward=lambda p: HC)
    ears = []
    for s, x in (('L', 1), ('R', -1)):
        th, ph = head_angles(x * 0.275, 1.0)
        c = head_point(th, ph) + V((x * 0.006, 0.012, 0))
        ears.append(ellipsoid(f'ear.{s}', c, (0.026, 0.036, 0.05), R_SKIN, 10, 6))
    neckr = [ring_at(V((0, 0.0, z)), V((1, 0, 0)), V((0, 1, 0)), r, r * 0.95, 12) for z, r in ((0.70, 0.048), (0.75, 0.048), (0.80, 0.055))]
    neck = loft('neck', neckr, R_SKIN, outward=lambda p: V((0, 0, p.z)))
    return head, ears, neck


EYE_X, EYE_Z, EYE_W, EYE_H = 0.1, 0.99, 0.037, 0.048  # 눈 가운데·반폭·반높이 (m)


def eye_patch(name, kind):
    """얼굴 겉면에 얹는 눈. open: 세로로 긴 타원(눈동자·반짝임은 질감), closed: 아래로 휜 선(‿)."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')

    def on_face(x, z, lift=0.0025):
        th, ph = head_angles(x, z)
        p = head_point(th, ph)
        return p + (p - HC).normalized() * lift
    for sx in (1, -1):
        cx = sx * EYE_X
        if kind == 'open':
            u0, v0, u1, v1 = inset(R_EYE)
            ctr = bm.verts.new(on_face(cx, EYE_Z))
            rings = []
            for r in (0.5, 1.0):
                ring = []
                for i in range(20):
                    a = TAU * i / 20
                    ring.append((bm.verts.new(on_face(cx + EYE_W * r * math.cos(a), EYE_Z + EYE_H * r * math.sin(a))),
                                 (0.5 + 0.5 * r * math.cos(a), 0.5 + 0.5 * r * math.sin(a))))
                rings.append(ring)
            UV = lambda uv: (u0 + uv[0] * (u1 - u0), v0 + uv[1] * (v1 - v0))
            for i in range(20):
                j = (i + 1) % 20
                f = bm.faces.new((ctr, rings[0][i][0], rings[0][j][0]))
                for lp, uv in zip(f.loops, [(0.5, 0.5), rings[0][i][1], rings[0][j][1]]):
                    lp[uvl].uv = UV(uv)
                f = bm.faces.new((rings[0][i][0], rings[1][i][0], rings[1][j][0], rings[0][j][0]))
                for lp, uv in zip(f.loops, [rings[0][i][1], rings[1][i][1], rings[1][j][1], rings[0][j][1]]):
                    lp[uvl].uv = UV(uv)
        else:
            u0, v0, u1, v1 = inset(R_LID)
            top, bot = [], []
            for i in range(9):
                t = -1 + 2 * i / 8
                z = EYE_Z - 0.006 - 0.012 * (1 - t * t)
                w = 0.0055 * (1 - 0.6 * t * t)
                top.append(bm.verts.new(on_face(cx + EYE_W * 1.05 * t, z + w)))
                bot.append(bm.verts.new(on_face(cx + EYE_W * 1.05 * t, z - w)))
            for i in range(8):
                f = bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
                for lp in f.loops:
                    lp[uvl].uv = ((u0 + u1) / 2, (v0 + v1) / 2)
    bm.normal_update()
    s = sum(f.normal.dot(f.calc_center_median() - HC) for f in bm.faces)
    if s < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return new_obj(name, bm)


def build_pelvis():
    return ellipsoid('pelvis', V((0, 0.0, 0.385)), (0.115, 0.095, 0.065), R_PELVIS, 14, 8)


def build_hands(arm):
    """통통한 벙어리장갑 모양 손 (치비)."""
    obs = []
    for s, x in (('L', 1), ('R', -1)):
        M = arm.data.bones[f'hand.{s}'].matrix_local  # 손 뼈 좌표: +Y 손끝, +Z 손등, 엄지는 L 이 +X, R 이 -X
        k = 1.3  # 치비 손은 몸에 비해 크고 둥글게
        sec = [(-0.004, 0.021, 0.016), (0.01, 0.029, 0.02), (0.03, 0.032, 0.021), (0.05, 0.031, 0.019),
               (0.065, 0.027, 0.016), (0.077, 0.019, 0.012), (0.084, 0.009, 0.006)]
        sec = [(y * 1.12, w * k, t * k) for y, w, t in sec]
        rings = []
        for y, w, t in sec:
            curl = -0.3 * smooth((y - 0.05) / 0.045) * (y - 0.05)
            rings.append([M @ V((w * math.sin(TAU * i / 14), y, t * math.cos(TAU * i / 14) + curl)) for i in range(14)])
        palm = loft(f'hand.{s}', rings, R_HAND, [0, 0.12, 0.35, 0.55, 0.72, 0.88, 1.0], cap0=True, cap1=True,
                    outward=lambda p, M=M: M @ V((0, (M.inverted() @ p).y, 0)))
        base = V((x * 0.03, 0.018, -0.01))
        d = V((x * 0.6, 0.75, -0.3)).normalized()
        tp = [base, base + d * 0.02, base + d * 0.036]
        tr = []
        for c, r in zip(tp, (0.015, 0.014, 0.0105)):
            yb = V((0, 0, 1))
            yb = (yb - d * yb.dot(d)).normalized()
            xx = d.cross(yb)
            tr.append([M @ (c + xx * (r * math.sin(TAU * i / 8)) + yb * (r * math.cos(TAU * i / 8))) for i in range(8)])
        thumb = loft(f'thumb.{s}', tr, R_HAND, [0.0, 0.5, 1.0], cap1=True, outward=lambda p, M=M, tp=tp: M @ min(tp, key=lambda q: (M @ q - p).length))
        obs += [(palm, s), (thumb, s)]
    return obs


def build_shoes():
    """고무신: 코가 동글게 살짝 들린 작은 신."""
    obs = []
    for s, x in (('L', 1), ('R', -1)):
        cx = J[f'ankle.{s}'].x
        secs = [(0.04, 0.03, 0.026, 0.03), (0.025, 0.037, 0.034, 0.034), (0.0, 0.041, 0.038, 0.035), (-0.035, 0.043, 0.035, 0.031),
                (-0.07, 0.041, 0.03, 0.027), (-0.1, 0.034, 0.022, 0.025), (-0.122, 0.018, 0.013, 0.027)]
        rings = []
        for y, w, h, zc in secs:
            ring = []
            for i in range(16):
                th = TAU * i / 16
                sx, cy = math.sin(th), math.cos(th)
                zz = max(zc + h * cy * (0.8 if cy < 0 else 1.0), 0.003)
                ring.append(V((cx + w * sx, y, zz)))
            rings.append(ring)
        obs.append((loft(f'shoe.{s}', rings, R_SHOE, [i / 6 for i in range(7)], cap0=True, cap1=True,
                         outward=lambda p, cx=cx: V((cx, p.y, 0.03))), s))
    return obs


def band_on_torso(name, path_pts, width, uv_rect, off=0.008, thick=0.006, normal_fn=None):
    """저고리 겉면에 얹는 띠 (가사·깃). path_pts: 띠 중심선(대략), 겉면으로 밀어낸다."""
    def push(p):
        s = torso_surface(p.z, math.atan2(p.x, p.y))
        r = V((s.x, s.y, 0)).length
        return V((0, 0, p.z)) + V((p.x, p.y, 0)).normalized() * (r + off)
    closed = (path_pts[0] - path_pts[-1]).length < 1e-6
    pts = path_pts[:-1] if closed else path_pts
    ra, rb = [], []
    for i, p in enumerate(pts):
        q0 = pts[(i - 1) % len(pts)] if closed else pts[max(i - 1, 0)]
        q1 = pts[(i + 1) % len(pts)] if closed else pts[min(i + 1, len(pts) - 1)]
        t = (q1 - q0).normalized()
        w = normal_fn(p, t) if normal_fn else t.cross(V((p.x, p.y, 0)).normalized()).normalized()
        ra.append(push(p + w * (width / 2)))
        rb.append(push(p - w * (width / 2)))
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    u0, v0, u1, v1 = inset(uv_rect)
    M = len(pts)
    va = [bm.verts.new(p) for p in ra]
    vb = [bm.verts.new(p) for p in rb]
    last = M if closed else M - 1
    for i in range(last):
        j = (i + 1) % M
        f = bm.faces.new((va[i], va[j], vb[j], vb[i]))
        for lp, (uu, vv) in zip(f.loops, [(i / last, 1), ((i + 1) / last, 1), ((i + 1) / last, 0), (i / last, 0)]):
            lp[uvl].uv = (u0 + uu * (u1 - u0), v0 + vv * (v1 - v0))
    bm.normal_update()
    s = sum(f.normal.dot(V((f.calc_center_median().x, f.calc_center_median().y, 0))) for f in bm.faces)
    if s < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    ob = new_obj(name, bm)
    mod = ob.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = thick
    mod.offset = -1
    mod.use_even_offset = True
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier='solid')
    ob.select_set(False)
    return ob


KASA = dict(c=V((-0.01, 0.0, 0.53)), lx=0.215, ly=0.16, beta=math.radians(50))


def kasa_point(a):
    k = KASA
    lx, ly = k['lx'] * math.cos(a), k['ly'] * math.sin(a)
    return k['c'] + V((lx * math.cos(k['beta']), ly, lx * math.sin(k['beta'])))


def build_kasa():
    """가사: 왼어깨에서 오른허리로 비스듬히 두른 띠 + 왼가슴의 가사 고리."""
    pts = [kasa_point(TAU * i / 56) for i in range(57)]
    b = KASA['beta']
    nplane = V((-math.sin(b), 0, math.cos(b)))
    kasa = band_on_torso('kasa', pts, 0.085, R_KASA, off=0.006, thick=0.008, normal_fn=lambda p, t: nplane)
    p = kasa_point(math.radians(250))
    s = torso_surface(p.z, math.atan2(p.x, p.y))
    ctr = V((s.x, s.y, s.z)) + V((0, -0.017, 0))
    rings = []
    for k in range(10):
        a = TAU * k / 10
        cc = ctr + V((0.014 * math.cos(a), 0, 0.014 * math.sin(a)))
        rad = V((math.cos(a), 0, math.sin(a)))
        rings.append([cc + rad * (0.0045 * math.cos(TAU * i / 6)) + V((0, 0.0045 * math.sin(TAU * i / 6), 0)) for i in range(6)])
    rings.append(rings[0])
    return kasa, loft('kasa_ring', rings, R_RING)


def build_collar():
    """깃: 오른 목옆 → 뒷목 → 왼 목옆 → 앞섶을 따라 오른가슴 아래로 (왼섶이 위로 오는 여밈)."""
    ctrl = [V((-0.056, 0.012, 0.722)), V((-0.032, 0.05, 0.727)), V((0, 0.06, 0.73)), V((0.032, 0.05, 0.727)), V((0.056, 0.012, 0.722)),
            V((0.045, -0.045, 0.712)), V((0.016, -0.085, 0.682)), V((-0.028, -0.115, 0.632)), V((-0.068, -0.13, 0.578)),
            V((-0.1, -0.13, 0.532)), V((-0.126, -0.12, 0.49))]
    pts = []
    for i in range(len(ctrl) - 1):
        for t in (0, 0.5):
            pts.append(lerp(ctrl[i], ctrl[i + 1], t))
    pts.append(ctrl[-1])

    def nf(p, t):
        n = V((p.x, p.y, 0.6 if p.z > 0.712 else 0)).normalized()
        return t.cross(n).normalized()
    return band_on_torso('collar', pts, 0.03, R_COLLAR, off=0.004, thick=0.006, normal_fn=nf)


# ───────────────────────── 뼈대 ─────────────────────────
DEF = ['root', 'hips', 'spine', 'chest', 'neck', 'head']
for s in 'LR':
    DEF += [f'shoulder.{s}', f'upper_arm.{s}', f'forearm.{s}', f'hand.{s}', f'fingers.{s}', f'thumb.{s}',
            f'thigh.{s}', f'shin.{s}', f'foot.{s}', f'toe.{s}']
FWD = V((0, -1, 0))


def build_armature():
    ad = bpy.data.armatures.new('rig')
    arm = bpy.data.objects.new('monk_rig', ad)
    SC.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = ad.edit_bones

    def bone(name, h, t, parent=None, roll_to=FWD, deform=True, connect=False):
        b = eb.new(name)
        b.head, b.tail = h, t
        b.align_roll(roll_to)
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        b.use_deform = deform
        return b

    bone('root', V((0, 0, 0)), V((0, 0, 0.12)))
    bone('hips', J['hips'], J['spine'], 'root')
    bone('spine', J['spine'], J['chest'], 'hips', connect=True)
    bone('chest', J['chest'], J['neck'], 'spine', connect=True)
    bone('neck', J['neck'], J['head'], 'chest', connect=True)
    bone('head', J['head'], J['crown'], 'neck', connect=True)
    for s, x in (('L', 1), ('R', -1)):
        bone(f'shoulder.{s}', J[f'clav.{s}'], J[f'shoulder.{s}'], 'chest')
        bone(f'upper_arm.{s}', J[f'shoulder.{s}'], J[f'elbow.{s}'], f'shoulder.{s}', connect=True)
        bone(f'forearm.{s}', J[f'elbow.{s}'], J[f'wrist.{s}'], f'upper_arm.{s}', connect=True)
        d2 = (J[f'wrist.{s}'] - J[f'elbow.{s}']).normalized()
        back = V((x * 0.707, 0, 0.707))  # 손등이 바깥 위 (손바닥은 몸 쪽)
        back = (back - d2 * back.dot(d2)).normalized()
        bone(f'hand.{s}', J[f'wrist.{s}'], J[f'knuckle.{s}'], f'forearm.{s}', roll_to=back, connect=True)
        bone(f'fingers.{s}', J[f'knuckle.{s}'], J[f'fingertip.{s}'], f'hand.{s}', roll_to=back, connect=True)
        hb = eb[f'hand.{s}']
        hm = hb.matrix
        th_h = hm @ V((x * 0.03, 0.018, -0.01))
        th_t = hm @ (V((x * 0.03, 0.018, -0.01)) + V((x * 0.6, 0.75, -0.3)).normalized() * 0.036)
        bone(f'thumb.{s}', th_h, th_t, f'hand.{s}', roll_to=back)
        bone(f'thigh.{s}', J[f'hipj.{s}'], J[f'knee.{s}'], 'hips')
        bone(f'shin.{s}', J[f'knee.{s}'], J[f'ankle.{s}'], f'thigh.{s}', connect=True)
        bone(f'foot.{s}', J[f'ankle.{s}'], J[f'ball.{s}'], f'shin.{s}', roll_to=V((0, 0, 1)), connect=True)
        bone(f'toe.{s}', J[f'ball.{s}'], J[f'toetip.{s}'], f'foot.{s}', roll_to=V((0, 0, 1)), connect=True)
        # 조종용 (내보내지 않음): IK 목표는 해당 뼈와 같은 쉬는 자세 → 회전 복사가 그대로 맞는다
        ik = bone(f'ik_hand.{s}', J[f'wrist.{s}'], J[f'knuckle.{s}'], 'root', roll_to=back, deform=False)
        bone(f'ik_foot.{s}', J[f'ankle.{s}'], J[f'ball.{s}'], 'root', roll_to=V((0, 0, 1)), deform=False)
        bone(f'pole_arm.{s}', J[f'elbow.{s}'] + V((x * 0.1, 0.35, -0.05)), J[f'elbow.{s}'] + V((x * 0.1, 0.35, 0.03)), 'root', deform=False)
        bone(f'pole_leg.{s}', J[f'knee.{s}'] + V((0, -0.45, 0)), J[f'knee.{s}'] + V((0, -0.45, 0.08)), 'root', deform=False)
    bpy.ops.object.mode_set(mode='POSE')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    for s in 'LR':
        fa = arm.pose.bones[f'forearm.{s}']
        c = fa.constraints.new('IK')
        c.target, c.subtarget, c.pole_target, c.pole_subtarget, c.chain_count = arm, f'ik_hand.{s}', arm, f'pole_arm.{s}', 2
        h = arm.pose.bones[f'hand.{s}'].constraints.new('COPY_ROTATION')
        h.target, h.subtarget = arm, f'ik_hand.{s}'
        sh = arm.pose.bones[f'shin.{s}']
        c = sh.constraints.new('IK')
        c.target, c.subtarget, c.pole_target, c.pole_subtarget, c.chain_count = arm, f'ik_foot.{s}', arm, f'pole_leg.{s}', 2
        f = arm.pose.bones[f'foot.{s}'].constraints.new('COPY_ROTATION')
        f.target, f.subtarget = arm, f'ik_foot.{s}'
    bpy.ops.object.mode_set(mode='OBJECT')
    tune_poles(arm)
    return arm


def tune_poles(arm):
    """IK 극 각도: 쉬는 자세에서 팔꿈치·무릎이 제자리에 오는 각도를 고른다 (뼈 roll 에 따라 달라짐)."""
    for s in 'LR':
        for bn, joint in ((f'forearm.{s}', f'elbow.{s}'), (f'shin.{s}', f'knee.{s}')):
            c = arm.pose.bones[bn].constraints['IK']
            best = None
            for deg in range(-180, 180, 15):
                c.pole_angle = math.radians(deg)
                bpy.context.view_layer.update()
                pb = arm.pose.bones[bn]
                err = ((arm.matrix_world @ pb.head) - J[joint]).length
                if best is None or err < best[0]:
                    best = (err, deg)
            c.pole_angle = math.radians(best[1])
            log(f'pole {bn}: {best[1]}° (오차 {best[0] * 1000:.1f}mm)')


# ───────────────────────── 가중치 ─────────────────────────
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length


def assign_weights(ob, arm, rule):
    """rule(p) → {뼈: 배율} 후보. 후보 뼈까지의 선분 거리로 1/d⁴ 가중, 큰 것 3개만."""
    bones = arm.data.bones
    seg = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in bones}
    groups = {}
    for v in ob.data.vertices:
        p = ob.matrix_world @ v.co
        cand = rule(p)
        ws = []
        for bn, mul in cand.items():
            if mul <= 0:
                continue
            d = seg_dist(p, *seg[bn])
            ws.append((mul / (d * d + 1e-4) ** 2, bn))
        ws.sort(reverse=True)
        ws = ws[:3]
        tot = sum(w for w, _ in ws)
        for w, bn in ws:
            if w / tot < 0.02:
                continue
            g = groups.get(bn) or ob.vertex_groups.new(name=bn)
            groups[bn] = g
            g.add([v.index], w / tot, 'REPLACE')


def side(p):
    return 'L' if p.x >= 0 else 'R'


def rule_torso(p):
    s = side(p)
    c = {'hips': 1, 'spine': 1, 'chest': 1}
    if p.z > 0.70:
        c['neck'] = 0.6
    if p.z > 0.6 and abs(p.x) > 0.08:
        c[f'shoulder.{s}'] = 0.8
        if abs(p.x) > 0.105 and p.z > 0.62:
            c[f'upper_arm.{s}'] = 0.35
    if p.z < 0.37:
        front = smooth((-p.y + 0.03) / 0.11)  # 앞자락만 허벅지를 따라간다
        if front > 0:
            c[f'thigh.{s}'] = 1.6 * front
        if p.z < 0.32:
            c['spine'] = 0
    return c


def rule_leg(s):
    def r(p):
        c = {f'thigh.{s}': 1, f'shin.{s}': 1}
        if p.z > 0.34:
            c['hips'] = 0.7
        if p.z < 0.085:
            c[f'foot.{s}'] = 0.5
        return c
    return r


def rule_sleeve(s):
    def r(p):
        c = {f'upper_arm.{s}': 1, f'forearm.{s}': 1}
        if abs(p.x) < 0.14 and p.z > 0.6:
            c[f'shoulder.{s}'] = 0.9
            c['chest'] = 0.4
        return c
    return r


def rule_hand(s, thumb=False):
    if thumb:
        return lambda p: {f'thumb.{s}': 1, f'hand.{s}': 0.3}
    return lambda p: {f'hand.{s}': 1, f'fingers.{s}': 1}


def rule_neck(p):
    return {'neck': 1, 'head': 0.8 if p.z > 0.75 else 0.0, 'chest': 0.6 if p.z < 0.72 else 0.0}


def rule_band(p):
    s = side(p)
    c = {'chest': 1, 'spine': 1, 'hips': 0.6 if p.z < 0.45 else 0}
    if p.z > 0.63 and abs(p.x) > 0.07:
        c[f'shoulder.{s}'] = 0.7
    if p.z < 0.37 and p.y < 0:
        c[f'thigh.{s}'] = 0.5
    return c


# ───────────────────────── 질감 (numpy 로 그린다) ─────────────────────────
RNG = np.random.default_rng(1080)


def vnoise(h, w, gh, gw, wrap_u=True, seed=None):
    """부드러운 값 잡음 (u 방향 이어짐)."""
    rng = np.random.default_rng(seed) if seed is not None else RNG
    g = rng.random((gh + 1, gw + (0 if wrap_u else 1)))
    ys = np.linspace(0, gh, h, endpoint=False)
    xs = np.linspace(0, gw, w, endpoint=False)
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = ys - y0
    fx = xs - x0
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    x1 = (x0 + 1) % g.shape[1]
    y1 = np.minimum(y0 + 1, gh)
    a = g[y0][:, x0]
    b = g[y0][:, x1]
    c = g[y1][:, x0]
    d = g[y1][:, x1]
    top = a + (b - a) * fx[None, :]
    bot = c + (d - c) * fx[None, :]
    return top + (bot - top) * fy[:, None]


def fbm(h, w, base, octaves=4, seed=0):
    out = np.zeros((h, w))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        out += amp * vnoise(h, w, base[0] * 2 ** o, base[1] * 2 ** o, seed=seed + o)
        tot += amp
        amp *= 0.5
    return out / tot


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


class Atlas:
    def __init__(self, n):
        self.n = n
        self.col = np.zeros((n, n, 3))
        self.hgt = np.zeros((n, n))
        self.rough = np.full((n, n), 0.9)
        self.scale = np.ones((n, n, 2))  # 텍셀 하나의 실제 크기 (m) — 노멀 세기를 맞춘다

    def region(self, r):
        u0, v0, u1, v1 = r
        n = self.n
        return slice(int(v0 * n), int(v1 * n)), slice(int(u0 * n), int(u1 * n))

    def grid(self, r):
        sy, sx = self.region(r)
        h, w = sy.stop - sy.start, sx.stop - sx.start
        u = (np.arange(w) + 0.5) / w
        v = (np.arange(h) + 0.5) / h
        return np.meshgrid(u, v)

    def put(self, r, col, hgt, rough, metres_u, metres_v):
        sy, sx = self.region(r)
        self.col[sy, sx] = col
        self.hgt[sy, sx] = hgt
        self.rough[sy, sx] = rough
        h, w = sy.stop - sy.start, sx.stop - sx.start
        self.scale[sy, sx, 0] = metres_u / w
        self.scale[sy, sx, 1] = metres_v / h

    def normal(self, strength=1.0):
        h = self.hgt
        du = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * self.scale[..., 0])
        dv = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / (2 * self.scale[..., 1])
        n = np.dstack([-du * strength, -dv * strength, np.ones_like(h)])
        n /= np.linalg.norm(n, axis=2, keepdims=True)
        return n * 0.5 + 0.5


def weave(u, v, fu, fv):
    """삼베·무명 짜임: 날실·씨실이 번갈아 뜨는 작은 요철."""
    a = np.sin(u * fu * TAU) * 0.5 + 0.5
    b = np.sin(v * fv * TAU) * 0.5 + 0.5
    chk = (np.floor(u * fu * 2) + np.floor(v * fv * 2)) % 2
    return (a * chk + b * (1 - chk)) ** 1.5


def soft_cloth(at, r, base_hex, mu, mv, seed, shade=None, folds=None, rough=0.88):
    """깨끗한 단색 천: 아주 옅은 얼룩 + 몇 줄의 부드러운 주름(골은 살짝 어둡게) + 고운 짜임은 노멀에만."""
    U, Vv = at.grid(r)
    h, w = U.shape
    base = to_lin(hexrgb(base_hex))
    lo = fbm(h, w, (2, 3), 3, seed)
    fh = folds(U, Vv, h, w) if folds else np.zeros_like(U)
    sh = shade(U, Vv) if shade is not None else 1.0
    tone = (1 + 0.035 * (lo - 0.5) + 0.07 * np.clip(fh, -1, 1)) * sh
    col = base[None, None, :] * tone[..., None]
    wv = weave(U, Vv, mu / 0.0022, mv / 0.0022)
    at.put(r, col, 0.0025 * fh + 0.00012 * wv, rough, mu, mv)
    return U, Vv


def ridge(x, c, w):
    return np.exp(-((x - c) / w) ** 2)


def paint(atlas_n):
    at = Atlas(atlas_n)
    # 게임 장면은 노출이 밝아(햇빛·톤매핑) 바탕색을 한 단계 진하게 잡는다 — 게임 안 캡처로 맞춘 값
    robe = '#8e8a81'   # 승복: 따뜻한 회색
    pants = '#7d7970'

    # 저고리: 위는 밝고 아래로 갈수록 살짝 어둡게, 아랫단 바느질 두 줄, 옆구리·겨드랑이 부드러운 주름
    def t_shade(U, Vv):
        return (0.93 + 0.1 * smooth_np((Vv - 0.05) / 0.7)) * (1 - 0.1 * ridge(Vv, 0.075, 0.018))

    def t_folds(U, Vv, h, w):
        f = np.zeros_like(U)
        for c in (0.33, 0.67):  # 앞 옆구리 세로 주름 (아랫단 쪽)
            f -= ridge(U, c, 0.025) * (1 - smooth_np((Vv - 0.05) / 0.35))
        for c in (0.2, 0.8):  # 겨드랑이 사선
            f -= 0.7 * ridge(U + (Vv - 0.75) * 0.25 * np.sign(c - 0.5), c, 0.02) * ridge(Vv, 0.75, 0.12)
        return f
    U, Vv = soft_cloth(at, R_TORSO, robe, 1.0, 0.47, 20, t_shade, t_folds)
    sy, sx = at.region(R_TORSO)
    stitch = (ridge(Vv, 0.1, 0.004) > 0.5) & (((U * 220) % 1) < 0.5)
    at.col[sy, sx][stitch] *= 1.12
    at.col[sy, sx][Vv < 0.04] *= 0.55

    # 바지 + 흰 버선 (v 0 엉덩이 → 1 발목)
    def l_folds(U, Vv, h, w):
        f = -0.8 * ridge(Vv, 0.47, 0.025) * (0.6 + 0.4 * np.cos(U * TAU))  # 무릎 뒤 접힘
        f -= 0.6 * ridge(Vv, 0.7, 0.02) - 0.4 * ridge(Vv, 0.735, 0.015)  # 버선 위 주름
        return f
    U, Vv = soft_cloth(at, R_LEG, pants, 0.45, 0.4, 10, None, l_folds)
    sy, sx = at.region(R_LEG)
    sock = smooth_np((Vv - 0.78) / 0.015)
    sock_col = to_lin(hexrgb('#e4e0d6'))[None, None, :] * (1 - 0.06 * ridge(Vv, 0.81, 0.012))[..., None]
    at.col[sy, sx] = at.col[sy, sx] * (1 - sock[..., None]) + sock_col * sock[..., None]
    at.rough[sy, sx] = np.where(sock > 0.5, 0.8, 0.88)

    # 소매: 팔꿈치 안쪽 주름, 소맷부리 단
    def s_folds(U, Vv, h, w):
        return -0.8 * ridge(Vv, 0.5, 0.03) * (0.5 + 0.5 * np.cos(U * TAU)) - 0.4 * ridge(Vv, 0.86, 0.012)
    U, Vv = soft_cloth(at, R_SLEEVE, robe, 0.36, 0.28, 30, lambda U, Vv: 1 - 0.1 * ridge(Vv, 0.9, 0.03), s_folds)
    sy, sx = at.region(R_SLEEVE)
    at.col[sy, sx][Vv > 0.955] *= 0.5
    soft_cloth(at, R_PELVIS, pants, 0.5, 0.25, 70)
    # 깃: 조금 짙은 회색 + 가운데 바느질
    U, Vv = soft_cloth(at, R_COLLAR, '#86827a', 0.9, 0.03, 80)
    sy, sx = at.region(R_COLLAR)
    at.col[sy, sx][(np.abs(Vv - 0.5) < 0.06) & (((U * 160) % 1) < 0.5)] *= 1.15

    # 가사: 따뜻한 괴색, 조각을 이어 붙인 밭 모양 — 솔기는 가늘고 짙게, 가장자리 연(緣)은 한 톤 짙게
    U, Vv = soft_cloth(at, R_KASA, '#983d28', 1.15, 0.085, 90, rough=0.85)
    sy, sx = at.region(R_KASA)
    cu, cv = (U * 22) % 1, ((Vv - 0.15) / 0.7 * 2) % 1
    seam = (np.minimum(cu, 1 - cu) < 0.035) | ((np.minimum(cv, 1 - cv) < 0.04) & (Vv > 0.15) & (Vv < 0.85))
    edge = (Vv < 0.15) | (Vv > 0.85)
    patch = np.floor(U * 22) + 5 * np.floor(Vv * 2)
    at.col[sy, sx] *= (0.96 + 0.07 * ((patch * 0.618) % 1))[..., None]
    at.col[sy, sx][edge] *= 0.8
    at.col[sy, sx][seam] *= 0.78
    at.hgt[sy, sx] += np.where(seam, 0.0008, 0)

    # 피부: 복숭앗빛, 매끈하게 (나뭇결 없음)
    skin = to_lin(hexrgb('#e2a986'))
    for rr in (R_SKIN, R_HAND):
        U, Vv = at.grid(rr)
        at.put(rr, skin[None, None, :] * (0.98 + 0.03 * Vv)[..., None], np.zeros(U.shape), 0.6, 0.15, 0.15)

    # 머리: u=0 뒤 → 0.5 얼굴, v 0 턱 → 1 정수리. 겉면 좌표로 바꿔 눈썹·입·볼을 그린다 (눈은 따로 얹는 조각)
    U, Vv = at.grid(R_HEAD)
    th = U * TAU
    ph = -np.pi / 2 + np.pi * Vv
    X = HR.x * np.cos(ph) * (1 - 0.07 * np.clip(-np.sin(ph), 0, None) ** 1.5) * np.sin(th)
    Z = HC.z + HR.z * np.sin(ph)
    front = -np.cos(th)
    col = skin[None, None, :] * (0.97 + 0.04 * Vv)[..., None]
    # 깎은 머리: 이마선 위로 푸르스름한 회색이 부드럽게
    hair_line = 1.0 + 0.17 * (front * 0.5 + 0.5)
    scalp = smooth_np((Z - hair_line) / 0.09) * 0.38
    col = col * (1 - scalp[..., None]) + to_lin(hexrgb('#8f939d'))[None, None, :] * scalp[..., None]

    def stroke(d, width, alpha):
        return (np.clip(1 - d / width, 0, 1) ** 0.7 * alpha * (front > 0.3))[..., None]
    for sgn in (-1, 1):
        bx = (X - sgn * 0.1) / 0.03
        d = np.abs(Z - (1.078 + 0.006 * (1 - bx ** 2))) + np.where(np.abs(bx) > 1, (np.abs(bx) - 1) * 0.03, 0)
        a = stroke(d, 0.0055, 0.75)
        col = col * (1 - a) + to_lin(hexrgb('#8d6a55')) * a
        cb = np.exp(-(((X - sgn * 0.168) / 0.04) ** 2 + ((Z - 0.93) / 0.022) ** 2)) * (front > 0.2)
        col = col * (1 - 0.42 * cb[..., None]) + to_lin(hexrgb('#f4948a')) * 0.42 * cb[..., None]
    mx = X / 0.02
    d = np.abs(Z - (0.912 + 0.007 * mx ** 2)) + np.where(np.abs(mx) > 1, (np.abs(mx) - 1) * 0.02, 0)
    a = stroke(d, 0.0042, 0.85)
    col = col * (1 - a) + to_lin(hexrgb('#a95c4e')) * a
    nose = np.exp(-((X / 0.009) ** 2 + ((Z - 0.955) / 0.007) ** 2)) * (front > 0.5)
    col *= (1 - 0.12 * nose)[..., None]
    at.put(R_HEAD, col, np.zeros(U.shape), 0.6, HR.x * TAU, HR.z * np.pi)
    at.rough[at.region(R_HEAD)] = np.where(scalp > 0.3, 0.7, 0.6)

    # 뜬 눈: 짙은 밤색 눈동자, 아래로 갈수록 밝은 갈색, 큰 반짝임 + 작은 반짝임
    U, Vv = at.grid(R_EYE)
    rr = np.hypot(U - 0.5, Vv - 0.5) * 2
    col = to_lin(hexrgb('#2a1d19'))[None, None, :] * np.ones(U.shape)[..., None]
    low = smooth_np((0.55 - Vv) / 0.45)[..., None]
    col = col * (1 - 0.8 * low) + to_lin(hexrgb('#6e4a38')) * 0.8 * low
    col *= (1 - 0.35 * smooth_np((rr - 0.82) / 0.18))[..., None]
    for cx, cy, rx_, ry_, al in ((0.63, 0.69, 0.17, 0.14, 1.0), (0.37, 0.31, 0.075, 0.075, 0.85)):
        hl = smooth_np((1 - np.hypot((U - cx) / rx_, (Vv - cy) / ry_)) / 0.25) * al
        col = col * (1 - hl[..., None]) + np.ones(3) * hl[..., None]
    at.put(R_EYE, col, np.zeros(U.shape), 0.15, 0.06, 0.08)
    U, Vv = at.grid(R_LID)
    at.put(R_LID, to_lin(hexrgb('#3b2a22'))[None, None, :] * np.ones(U.shape)[..., None], np.zeros(U.shape), 0.5, 0.06, 0.06)

    # 고무신: 짙은 회색, 바닥 테는 더 짙게
    U, Vv = at.grid(R_SHOE)
    rim = ridge(np.cos(U * TAU), -0.85, 0.12)
    col = to_lin(hexrgb('#64615d'))[None, None, :] * (1 - 0.35 * rim)[..., None]
    at.put(R_SHOE, col, 0.0005 * rim, 0.5, 0.2, 0.15)
    U, Vv = at.grid(R_RING)
    at.put(R_RING, to_lin(hexrgb('#efe6d0'))[None, None, :] * np.ones(U.shape)[..., None], np.zeros(U.shape), 0.35, 0.1, 0.03)
    return at


def smooth_np(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def save_image(name, arr, path, srgb):
    """arr: (n, n, 3) 아래(v=0)에서 위로. 블렌더 픽셀도 아래 줄부터라 그대로 넣는다."""
    n = arr.shape[0]
    if srgb:
        arr = np.where(arr <= 0.0031308, arr * 12.92, 1.055 * np.clip(arr, 0, None) ** (1 / 2.4) - 0.055)
    rgba = np.dstack([np.clip(arr, 0, 1), np.ones((n, n))]).astype(np.float32)
    img = bpy.data.images.new(name, n, n, alpha=False)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    return img


def make_material(at):
    n = at.n
    col = save_image('monk_col', at.col, os.path.join(OUT, 'monk_col.png'), True)
    nrm = save_image('monk_nrm', at.normal(1.0), os.path.join(OUT, 'monk_nrm.png'), False)
    orm = save_image('monk_orm', np.dstack([np.ones((n, n)), at.rough, np.zeros((n, n))]), os.path.join(OUT, 'monk_orm.png'), False)
    mat = bpy.data.materials.new('monk')
    mat.use_backface_culling = True  # 한 면만 (소맷부리·저고리 단은 안쪽 면을 따로 만들었다)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexImage')
    tc.image = col
    nt.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = nrm
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    to = nt.nodes.new('ShaderNodeTexImage')
    to.image = orm
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(to.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    return mat


# ───────────────────────── 조립 ─────────────────────────
def build_model():
    arm = build_armature()
    log('armature', len(arm.data.bones), 'bones')
    torso = build_torso()
    parts = [(torso, rule_torso)]
    parts += [(o, rule_leg(s)) for o, s in build_legs()]
    parts += [(o, rule_sleeve(s)) for o, s in build_sleeves()]
    head, ears, neck = build_head()
    parts += [(head, lambda p: {'head': 1}), (neck, rule_neck)] + [(e, lambda p: {'head': 1}) for e in ears]
    parts.append((build_pelvis(), lambda p: {'hips': 1, 'thigh.L': 0.5 if p.z < 0.39 else 0, 'thigh.R': 0.5 if p.z < 0.39 else 0}))
    for o, s in build_hands(arm):
        parts.append((o, rule_hand(s, o.name.startswith('thumb'))))
    for o, s in build_shoes():
        parts.append((o, lambda p, s=s: {f'foot.{s}': 1, f'toe.{s}': 1.0 if p.y < J[f'ball.{s}'].y + 0.01 else 0}))
    kasa, ring = build_kasa()
    parts += [(kasa, rule_band), (ring, lambda p: {'chest': 1}), (build_collar(), rule_band)]
    for ob, rule in parts:
        assign_weights(ob, arm, rule)
    bpy.ops.object.select_all(action='DESELECT')
    for ob, _ in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = torso
    bpy.ops.object.join()  # 몸은 한 메시 (드로우콜 1)
    body = bpy.context.view_layer.objects.active
    body.name = 'monk_body'
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    mat = make_material(paint(TEX))
    # 눈: 뜬 눈·감은 눈 두 조각 (런타임이 깜빡이고, 좌선·절할 때 감는다) — 같은 재질, 머리 뼈에만
    eyes = [eye_patch('eyes_open', 'open'), eye_patch('eyes_closed', 'closed')]
    for ob in [body] + eyes:
        if ob is not body:
            assign_weights(ob, arm, lambda p: {'head': 1})
        ob.data.materials.clear()
        ob.data.materials.append(mat)
        ob.parent = arm
        mod = ob.modifiers.new('rig', 'ARMATURE')
        mod.object = arm
    me = body.data
    tris = sum(len(p.vertices) - 2 for p in me.polygons) + sum(len(p.vertices) - 2 for e in eyes for p in e.data.polygons)
    log('body', len(me.vertices), 'verts', tris, 'tris (눈 포함)')
    body['eyes'] = [e.name for e in eyes]
    return arm, body, eyes, tris


# ───────────────────────── 동작 → 키프레임 ─────────────────────────
def frame_of(pb_name, arm, space):
    """space 뼈의 (지금 자세 / 쉬는 자세) 변환: 쉬는 자세 기준 좌표를 지금 자세로 옮긴다."""
    if space == 'root':
        return Matrix.Identity(4)
    pb = arm.pose.bones[space]
    return pb.matrix @ pb.bone.matrix_local.inverted()


def orient(bone, aim, palm_or_sole):
    """bone 의 쉬는 자세 축(Y=뼈 방향, -Z=손바닥/발바닥)을 aim, palm_or_sole 로 돌리는 회전."""
    M = bone.matrix_local.to_3x3()
    by = (M @ V((0, 1, 0))).normalized()
    bn = (M @ V((0, 0, -1))).normalized()
    a = V(aim).normalized()
    p = V(palm_or_sole)
    p = (p - a * p.dot(a)).normalized()
    Fr = Matrix((by, bn, by.cross(bn))).transposed()
    Ft = Matrix((a, p, a.cross(p))).transposed()
    return (Ft @ Fr.transposed()) @ M


def apply_frame(arm, pose):
    pbs = arm.pose.bones
    # 1) FK
    pbs['hips'].location = (0, 0, 0)
    hip_rest = pbs['hips'].bone.head_local
    hl = V(pose['hips_loc'])
    pbs['hips'].rotation_euler = [math.radians(a) for a in pose['hips']]
    for b in ('spine', 'chest', 'neck', 'head'):
        pbs[b].rotation_euler = [math.radians(a) for a in pose[b]]
    for s in 'LR':
        pbs[f'shoulder.{s}'].rotation_euler = [math.radians(a) for a in pose[f'shoulder.{s}']]
        pbs[f'fingers.{s}'].rotation_euler = (math.radians(pose[f'fingers.{s}']), 0, 0)
        pbs[f'thumb.{s}'].rotation_euler = [math.radians(a) for a in pose[f'thumb.{s}']]
        pbs[f'toe.{s}'].rotation_euler = (math.radians(pose[f'toe.{s}']), 0, 0)
    # hips 위치: 쉬는 자리 기준 변위 → 뼈 좌표로
    Mh = pbs['hips'].bone.matrix_local.to_3x3()
    pbs['hips'].location = Mh.inverted() @ (hl - hip_rest)
    bpy.context.view_layer.update()
    # 2) IK 목표 (이웃 두 키를 섞는 중이면 각자의 좌표계에서 구해 위치는 선형, 방향은 구면 보간)
    def resolve(ik, spec, kind):
        if 'mix' in spec:
            a, b, u = spec['mix']
            pa, qa = resolve(ik, a, kind)
            pb_, qb = resolve(ik, b, kind)
            return pa.lerp(pb_, u), qa.slerp(qb, u)
        F = frame_of(None, arm, spec.get('space', 'root'))
        R3 = orient(ik.bone, F.to_3x3() @ V(spec['aim']), F.to_3x3() @ V(spec['palm' if kind == 'hand' else 'sole']))
        return F @ V(spec['pos']), R3.to_quaternion()
    for s in 'LR':
        for kind in ('hand', 'foot'):
            ik = pbs[f'ik_{kind}.{s}']
            pos, q = resolve(ik, pose[f'{kind}.{s}'], kind)
            ik.matrix = Matrix.Translation(pos) @ q.to_matrix().to_4x4()
        for kind in ('arm', 'leg'):
            pb = pbs[f'pole_{kind}.{s}']
            pb.matrix = Matrix.Translation(V(pose[f'pole_{kind}.{s}'])) @ pb.bone.matrix_local.to_3x3().to_4x4()
    bpy.context.view_layer.update()


KEYED = ['hips', 'spine', 'chest', 'neck', 'head'] + [f'{b}.{s}' for s in 'LR' for b in ('shoulder', 'fingers', 'thumb', 'toe')]
IKB = [f'{b}.{s}' for s in 'LR' for b in ('ik_hand', 'ik_foot', 'pole_arm', 'pole_leg')]


def key_frame(arm, f):
    pbs = arm.pose.bones
    for b in KEYED:
        pbs[b].keyframe_insert('rotation_euler', frame=f)
    pbs['hips'].keyframe_insert('location', frame=f)
    for b in IKB:
        pbs[b].keyframe_insert('location', frame=f)
        if not b.startswith('pole'):
            pbs[b].keyframe_insert('rotation_quaternion', frame=f) if pbs[b].rotation_mode == 'QUATERNION' else pbs[b].keyframe_insert('rotation_euler', frame=f)


def forehead_z(arm):
    head = arm.pose.bones['head']
    return (arm.matrix_world @ head.matrix @ head.bone.matrix_local.inverted() @ V(AC.FOREHEAD)).z


def solve_keys(arm, clip):
    """'_solve' 표시가 있는 키: 이마 높이가 목표가 되도록 그 채널 각을 이분법으로 맞춘다 (같은 값을 '_same' 키에 복사)."""
    solved = None
    for t, pose in clip.get('keys', []):
        sv = pose.get('_solve')
        if sv:
            ch, ax = sv['channel'], sv['axis']
            lo, hi = pose[ch][ax] - 40, pose[ch][ax] + 20
            for _ in range(30):
                mid = (lo + hi) / 2
                r = list(pose[ch])
                r[ax] = mid
                pose[ch] = tuple(r)
                apply_frame(arm, pose)
                if forehead_z(arm) > sv['forehead_z']:
                    lo = mid  # 더 숙여야 이마가 내려간다
                else:
                    hi = mid
            if not sv.get('local'):
                solved = (ch, pose[ch])
            log(f"solve {clip['name']} t={t}: {ch}={pose[ch][ax]:.2f}° 이마 {forehead_z(arm):.4f}m")
        elif solved and pose.get('_same') == solved[0]:
            pose[solved[0]] = solved[1]


def bake_clips(arm, body):
    meta = {'fps': AC.FPS, 'clips': {}, 'eye': list(EYE), 'height': J['crown'].z}
    arm.animation_data_create()
    measured = {}
    for clip in AC.CLIPS:
        solve_keys(arm, clip)
        act = bpy.data.actions.new(clip['name'])
        arm.animation_data.action = act
        n = clip['frames']
        for f in range(n + 1):
            pose = AC.sample(clip, f / AC.FPS)
            apply_frame(arm, pose)
            key_frame(arm, f)
        act.use_frame_range = True
        act.frame_start, act.frame_end = 0, n
        act.use_cyclic = bool(clip.get('loop'))
        act.use_fake_user = True
        # 실측: 눈 높이(최저·최고), 이마 최저 높이, 발 미끄러짐
        m = measure(arm, body, act, clip)
        measured[clip['name']] = m
        meta['clips'][clip['name']] = {'duration': n / AC.FPS, 'loop': bool(clip.get('loop')), **{k: v for k, v in clip.get('meta', {}).items()}, **m}
        log(f"clip {clip['name']}: {n} frames", json.dumps({k: v for k, v in m.items() if k != 'legs'}, ensure_ascii=False))
        if 'legs' in m:
            log('legs worst', m['legs']['worst'], 'cross frames', m['legs']['crossFrames'])
            for r in m['legs']['rows']:
                log('  ', r)
            m.pop('legs')
        arm.animation_data.action = None
    return meta


def measure(arm, body, act, clip):
    """구운 동작을 블렌더에서 실제로 돌려 재는 값 (IK 를 푼 뒤 결과)."""
    arm.animation_data.action = act
    pbs = arm.pose.bones
    head = pbs['head']
    eye_local = head.bone.matrix_local.inverted() @ EYE
    fore_local = head.bone.matrix_local.inverted() @ V(AC.FOREHEAD)
    out = {'eyeMin': 9.0, 'eyeMax': -9.0, 'foreheadMin': 9.0}
    contact = None
    for f in range(0, clip['frames'] + 1):
        SC.frame_set(f)
        hm = arm.matrix_world @ head.matrix
        e = hm @ eye_local
        fo = hm @ fore_local
        out['eyeMin'] = min(out['eyeMin'], e.z)
        out['eyeMax'] = max(out['eyeMax'], e.z)
        if fo.z < out['foreheadMin']:
            out['foreheadMin'] = fo.z
            contact = f / AC.FPS
    out['foreheadMinAt'] = contact
    if clip['name'] in ('prostrate', 'stand_up', 'sit_down', 'walk') or '--legs' in A:
        out['legs'] = leg_report(arm, clip)
    for k in ('eyeMin', 'eyeMax', 'foreheadMin'):
        out[k] = round(out[k], 4)
    return out


def leg_report(arm, clip):
    """다리 꼬임 검사 (프레임마다): 무릎이 앞을 보는지, 발목이 정강이에 대해 비틀렸는지, 두 무릎·발목이 엇갈렸는지.
    knee: 무릎이 굽는 쪽과 몸 앞(골반이 보는 쪽) 사이 각°, twist: 발이 정강이 축을 두고 돈 각°, cross: 왼무릎 x < 오른무릎 x."""
    pbs = arm.pose.bones
    worst = {'knee': (0, 0), 'twist': (0, 0)}
    rows = []
    for f in range(0, clip['frames'] + 1):
        SC.frame_set(f)
        hm = pbs['hips'].matrix.to_3x3()
        fwd = (hm @ V((0, 0, 1))).normalized()  # 골반 뼈 Z = 앞(-Y) 쪽
        row = {'t': round(f / AC.FPS, 2)}
        knees = {}
        for s in 'LR':
            th, sh, ft = pbs[f'thigh.{s}'], pbs[f'shin.{s}'], pbs[f'foot.{s}']
            hip, knee, ank = th.head, sh.head, sh.tail
            axis = (ank - hip)
            mid = hip + axis * ((knee - hip).dot(axis) / max(axis.length_squared, 1e-9))
            kdir = knee - mid
            an = axis.normalized()
            f_h = fwd - an * fwd.dot(an)
            if f_h.length < 0.35:  # 다리 축이 앞을 향하면(앉아서 발을 앞에 딛음) 기준을 '위'로 — 무릎은 위로 솟아야 한다
                up = V((0, 0, 1))
                f_h = up - an * up.dot(an)
            ang = math.degrees(kdir.angle(f_h)) if kdir.length > 0.004 and f_h.length > 1e-4 else 0.0
            # 발목 비틀림: 정강이·발의 옆 축(X, 발목이 접히는 경첩 축)을 정강이 축에 수직인 면에 투영해 잰 각 − 쉬는 자세의 같은 각
            sa = (sh.tail - sh.head).normalized()
            def proj(v):
                v = v - sa * v.dot(sa)
                return v.normalized() if v.length > 1e-6 else v
            a_now = proj(sh.matrix.to_3x3() @ V((1, 0, 0))).angle(proj(ft.matrix.to_3x3() @ V((1, 0, 0))), 0)
            rs = (sh.bone.tail_local - sh.bone.head_local).normalized()
            def projr(v):
                v = v - rs * v.dot(rs)
                return v.normalized() if v.length > 1e-6 else v
            a_rest = projr(sh.bone.matrix_local.to_3x3() @ V((1, 0, 0))).angle(projr(ft.bone.matrix_local.to_3x3() @ V((1, 0, 0))), 0)
            tw = abs(math.degrees(a_now - a_rest))
            row[f'knee{s}'] = round(ang)
            row[f'twist{s}'] = round(tw)
            knees[s] = knee
            for key, v in (('knee', ang), ('twist', tw)):
                if v > worst[key][0]:
                    worst[key] = (round(v), row['t'])
        row['cross'] = knees['L'].x < knees['R'].x
        rows.append(row)
    return {'worst': worst, 'crossFrames': sum(r['cross'] for r in rows), 'rows': rows[::3]}


# ───────────────────────── 미리보기 렌더 ─────────────────────────
def preview(arm, body, shots):
    """Workbench 로 정면·3/4 렌더 (모양·자세 점검용)."""
    os.makedirs(PREVIEW, exist_ok=True)
    SC.render.resolution_x, SC.render.resolution_y = 480, 640
    SC.render.film_transparent = False
    world = bpy.data.worlds.new('w')
    SC.world = world
    if '--eevee' in A:  # 실제 재질로 (해·하늘빛) — 생김새를 보일 때
        SC.render.engine = 'BLENDER_EEVEE'
        world.use_nodes = True
        world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.62, 0.72, 1)
        world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
        sun.data.energy = 3.2
        sun.data.angle = math.radians(8)
        sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
        SC.collection.objects.link(sun)
        SC.view_settings.view_transform = 'AgX'
    else:
        SC.render.engine = 'BLENDER_WORKBENCH'
        SC.display.shading.light = 'STUDIO'
        SC.display.shading.color_type = 'TEXTURE'
        SC.display.shading.show_shadows = True
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    SC.collection.objects.link(cam)
    SC.camera = cam
    cam.data.lens = 50
    floor = bpy.data.objects.new('floor', bpy.data.meshes.new('floor'))
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=2)
    bm.to_mesh(floor.data)
    SC.collection.objects.link(floor)
    arm.animation_data_create()
    for name, act, frame, az, el, dist in shots:
        arm.animation_data.action = bpy.data.actions.get(act) if act else None
        if not act:
            for pb in arm.pose.bones:
                pb.location = (0, 0, 0)
                pb.rotation_euler = (0, 0, 0)
        SC.frame_set(frame)
        tgt = V((0, 0, 0.62 if act != 'prostrate' else 0.35))
        a, e = math.radians(az), math.radians(el)
        cam.location = tgt + V((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
        cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        SC.render.filepath = os.path.join(PREVIEW, f'{name}.png')
        bpy.ops.render.render(write_still=True)
    log('preview →', PREVIEW)


def export(arm, body, eyes, meta):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in [arm, body] + eyes:
        ob.select_set(True)
    SC['motion'] = json.dumps(meta, ensure_ascii=False)
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
    if arm.animation_data:
        arm.animation_data.action = None
    path = os.path.join(OUT, 'monk.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_animations=True, export_animation_mode='ACTIONS', export_def_bones=True, export_force_sampling=True,
        export_optimize_animation_size=True, export_reset_pose_bones=True, export_rest_position_armature=True,
        export_anim_single_armature=True, export_skins=True, export_morph=False, export_extras=True,
        export_image_format='AUTO', export_tangents=False, export_leaf_bone=False)
    log('export →', path, os.path.getsize(path), 'bytes')
    with open(os.path.join(OUT, 'monk.json'), 'w') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)


arm, body, eyes, tris = build_model()
meta = {'tris': tris}
if not ONLY_MODEL:
    meta.update(bake_clips(arm, body))
for e in eyes:  # 미리보기·쉬는 자세에는 뜬 눈만
    e.hide_render = e.name != 'eyes_open'
if PREVIEW:
    shots = [('rest_front', None, 0, 0, 8, 3.0), ('rest_34', None, 0, 35, 12, 3.0), ('rest_back', None, 0, 180, 10, 3.0)]
    TIMES = {'prostrate': [round(x * 0.2, 1) for x in range(39)], 'bow_half': [0.5, 1.2, 1.5, 2.0],
             'stand_up': [0, 0.3, 0.45, 0.65, 0.85, 1.0, 1.2, 1.5], 'sit_down': [0, 0.3, 0.5, 0.65, 0.85, 1.05, 1.3, 1.5],
             'walk': [0, 0.17, 0.33, 0.5], 'walk_chasu': [0, 0.17, 0.33, 0.5], 'walk_gassho': [0.1, 0.4], 'sit': [0, 2.5],
             'idle': [0], 'idle_chasu': [0]}
    for c in ([] if ONLY_MODEL else AC.CLIPS):
        for i, tt in enumerate(TIMES.get(c['name'], [0])):
            if c['name'] == 'prostrate':  # 다리 꼬임 검사: 옆·뒤·앞비스듬히
                for az in (90, 200, 320):
                    shots.append((f"prostrate_{az}_{i:02d}", c['name'], round(tt * AC.FPS), az, 18, 2.3))
                continue
            az = 90 if c['name'] == 'bow_half' or c['name'].startswith('walk') else 300 if c['name'] in ('stand_up', 'sit_down') else 30
            shots.append((f"{c['name']}_{i:02d}", c['name'], round(tt * AC.FPS), az, 10, 3.0))
            if c['name'] in ('sit', 'idle_chasu', 'walk_gassho') and i == 0:
                shots.append((f"{c['name']}_{i:02d}f", c['name'], round(tt * AC.FPS), 10, 14, 2.4))
    preview(arm, body, shots)
export(arm, body, eyes, meta)
log('done')
