"""법당 실내 한 조각 (정면 3칸 × 측면 2칸, 앞 왼쪽 모서리) — 모델링 + 낮·밤 라이트맵 굽기 + GLB.

  blender -b --factory-startup -P tools/blender/hall_bay.py -- \
      --tex TEX_DIR --sky SKY_DIR --out OUT_DIR [--lm 2048] [--samples 256] [--no-bake]

TEX_DIR : tools/spike/textures.py 결과 (floor_diff.jpg … hanji_diff.jpg)
SKY_DIR : tools/spike/sky.py 결과 (day_env.hdr, night_env.hdr, day.json)
OUT_DIR : hall.glb, ground.glb, lm_day.npy, lm_night.npy (float, 위가 v=1 줄 아님 — lightmap.py 가 처리), hall.json

좌표 (Blender, Z 위): 정면이 -Y 를 본다. glTF 로 나가면 three 에서 정면이 +Z, 마루 윗면 y=0.
치수 근거:
  칸 너비 4.4m   — 스펙 4장 「정면 5칸 약 22m」 ÷ 5
  칸 깊이 4.333m — 스펙 「측면 3칸 약 13m」 ÷ 3
  기둥 높이 4.4m·반지름 0.27m·배흘림 곡선 — 지금 대웅전(web/src/world/temple.js _hall, architecture.js columnGeometry) 값
  그 밖(문지방·상방·창방·평방 높이, 천장 5.4m, 기단 0.55/0.9m 등)은 스파이크용 설계값이며 실측이 아니다.
"""
import json
import math
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

A = sys.argv[sys.argv.index('--') + 1:]


def arg(k, d=None, f=str):
    return f(A[A.index(k) + 1]) if k in A else d


TEX, SKY, OUT = arg('--tex'), arg('--sky'), arg('--out')
SUN_AZ = arg('--sun-az', None, float)  # three 기준 방위(도, 정면 +Z 에서 +X 쪽이 +). 주면 HDRI 전체를 그만큼 돌린다
LM, SAMPLES, BAKE = arg('--lm', 2048, int), arg('--samples', 256, int), '--no-bake' not in A
T0 = time.time()
log = lambda *m: print('[hall %.0fs]' % (time.time() - T0), *m, flush=True)

BAY_X, BAY_Y, NX, NY = 4.4, 13.0 / 3.0, 3, 2
COL_H, COL_R = 4.4, 0.27
W, D = BAY_X * NX, BAY_Y * NY
Z_SILL, Z_HEAD, Z_HEAD2, Z_CB, Z_PB, Z_CEIL = 0.18, 3.25, 3.45, 3.95, 4.62, 5.4  # 문지방 위, 상방 아래/위, 창방 아래, 평방 위, 천장
Z_GIDAN, Z_GROUND = -0.55, -1.45

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == 'METAL'
sc.cycles.device = 'GPU'

# ───────────────────────── 재질 ─────────────────────────
TILE = {'floor': 2.5, 'wood': 1.2, 'column': 1.5, 'earth': 1.6, 'stone': 2.0, 'ground': 3.0, 'hanji': 0.6}
MATS = {}


def img(name, non_color=False):
    im = bpy.data.images.load(f'{TEX}/{name}', check_existing=True)
    if non_color:
        im.colorspace_settings.name = 'Non-Color'
    return im


def make_mat(name, diff, nrm=None, arm=None, rough=0.8, emission=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    uv = nt.nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UVMap'
    if diff:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img(diff)
        nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
        nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if nrm:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img(nrm, True)
        nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.uv_map = 'UVMap'
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if arm:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img(arm, True)
        nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
        sp = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(t.outputs['Color'], sp.inputs['Color'])
        nt.links.new(sp.outputs['Green'], b.inputs['Roughness'])
    else:
        b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = 0.0
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = 0.0
    MATS[name] = m
    return m


make_mat('floor', 'floor_diff.jpg', 'floor_nor_gl.jpg', 'floor_arm.jpg')
make_mat('wood', 'wood_diff.jpg', 'wood_nor_gl.jpg', 'wood_arm.jpg')
make_mat('column', 'column_diff.jpg', 'wood_nor_gl.jpg', 'wood_arm.jpg')
MATS['lattice'] = MATS['wood']  # 살대: 같은 재질, 라이트맵 해상도만 낮춘다 (bmesh 를 따로 쌓아 면을 구분)
MATS['trim'] = MATS['wood']  # 마루 귀틀

make_mat('earth', 'earth_diff.jpg', 'earth_nor_gl.jpg', rough=0.95)
make_mat('dancheong', 'dancheong_diff.jpg', rough=0.85)
MATS['ceilgrid'] = MATS['dancheong']  # 천장 귀틀
make_mat('ceiling', 'ceiling_diff.jpg', rough=0.85)
make_mat('hanji', 'hanji_diff.jpg', rough=0.9)
make_mat('stone', 'stone_diff.jpg', 'ground_nor_gl.jpg', 'ground_arm.jpg')
make_mat('ground', 'ground_diff.jpg', 'ground_nor_gl.jpg', 'ground_arm.jpg')
make_mat('candle', None, rough=0.5).node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.93, 0.88, 0.78, 1)
make_mat('flame', None, rough=0.5, emission=(1.0, 0.55, 0.18))
MATS['hanji'].use_backface_culling = False

# 한지: 굽기 때만 투광(Translucent)을 섞어 문 너머 빛이 종이를 지나 방으로 들어오게
_hn = MATS['hanji'].node_tree
_out = _hn.nodes['Material Output']
_bsdf = _hn.nodes['Principled BSDF']
_tl = _hn.nodes.new('ShaderNodeBsdfTranslucent')
_mix = _hn.nodes.new('ShaderNodeMixShader')
_mix.inputs['Fac'].default_value = 0.45
_hn.links.new(_hn.nodes['Image Texture'].outputs['Color'], _tl.inputs['Color'])
_hn.links.new(_bsdf.outputs['BSDF'], _mix.inputs[1])
_hn.links.new(_tl.outputs['BSDF'], _mix.inputs[2])


def hanji_mode(bake):
    _hn.links.new((_mix if bake else _bsdf).outputs[0], _out.inputs['Surface'])


# ───────────────────────── 형상 (재질별 bmesh 에 쌓기) ─────────────────────────
BM = {}


def bm_of(mat):
    if mat not in BM:
        b = bmesh.new()
        b.loops.layers.uv.new('UVMap')
        BM[mat] = b
    return BM[mat]


def face_uv_world(f, uvl, tile):
    n = f.normal
    ax = max(range(3), key=lambda i: abs(n[i]))
    a, b = {0: (1, 2), 1: (0, 2), 2: (0, 1)}[ax]
    for l in f.loops:
        l[uvl].uv = (l.vert.co[a] / tile, l.vert.co[b] / tile)


def box(mat, x0, x1, y0, y1, z0, z1, uv='world', tile=None):
    """축에 나란한 상자. uv: world(실제 크기 반복) | band_x | band_y (단청 띠를 긴 축 따라) | unit(면마다 0~1)."""
    b = bm_of(mat)
    uvl = b.loops.layers.uv['UVMap']
    vs = bmesh.ops.create_cube(b, size=1.0)['verts']
    for v in vs:
        v.co = Vector(((x0 + x1) / 2 + v.co.x * (x1 - x0), (y0 + y1) / 2 + v.co.y * (y1 - y0), (z0 + z1) / 2 + v.co.z * (z1 - z0)))
    faces = {f for v in vs for f in v.link_faces}
    b.normal_update()
    lo, hi = (x0, y0, z0), (x1, y1, z1)
    for f in faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        if uv in ('band_x', 'band_y') and ax != (0 if uv == 'band_x' else 1):
            L = 0 if uv == 'band_x' else 1
            C = 3 - L - ax  # 면 안에서 긴 축이 아닌 축
            h = hi[C] - lo[C]
            for l in f.loops:
                l[uvl].uv = (l.vert.co[L] / (2 * h), (l.vert.co[C] - lo[C]) / h)
        elif uv == 'unit':
            a, c = {0: (1, 2), 1: (0, 2), 2: (0, 1)}[ax]
            for l in f.loops:
                l[uvl].uv = ((l.vert.co[a] - lo[a]) / (hi[a] - lo[a]), (l.vert.co[c] - lo[c]) / (hi[c] - lo[c]))
        else:
            face_uv_world(f, uvl, tile or TILE.get(mat, 1.5))
    return vs


def quad_down(mat, x0, x1, y0, y1, z):
    """아래를 보는 사각 판 (천장 반자), UV 0~1."""
    b = bm_of(mat)
    uvl = b.loops.layers.uv['UVMap']
    vs = [b.verts.new(p) for p in ((x0, y0, z), (x0, y1, z), (x1, y1, z), (x1, y0, z))]
    f = b.faces.new(vs)
    for l, uvv in zip(f.loops, ((0, 0), (0, 1), (1, 1), (1, 0))):
        l[uvl].uv = uvv
    return vs


def column(cx, cy, seg=20, rings=14):
    b = bm_of('column')
    uvl = b.loops.layers.uv['UVMap']
    tile = TILE['column']
    grid = []
    for j in range(rings + 1):
        t = j / rings
        bulge = 1 + 0.09 * math.sin(min(t / 0.36, 1) * math.pi * 0.5) - 0.13 * max(0, t - 0.36)
        r = COL_R * bulge
        grid.append([b.verts.new((cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg), t * COL_H)) for i in range(seg)])
    for j in range(rings):
        for i in range(seg):
            i2 = (i + 1) % seg
            f = b.faces.new((grid[j][i], grid[j][i2], grid[j + 1][i2], grid[j + 1][i]))
            for l, (ii, jj) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                l[uvl].uv = (ii / seg * 2 * math.pi * COL_R / tile, jj / rings * COL_H / tile)


def rotate_z(verts, hx, hy, ang):
    R = Matrix.Rotation(ang, 3, 'Z')
    for v in verts:
        p = Vector((v.co.x - hx, v.co.y - hy, v.co.z))
        v.co = R @ p + Vector((hx, hy, 0))


def lattice(x0, x1, z0, z1, y=0.0, open_hinge=None):
    """띠살 문짝 하나: 울거미 + 세로 살 + 띠(가로 살 3묶음) + 바깥쪽 한지. open_hinge=(hx, 각도) 면 그 축으로 연다."""
    vs = []
    fw, fd = 0.07, 0.06
    vs += box('wood', x0, x0 + fw, y - fd / 2, y + fd / 2, z0, z1)
    vs += box('wood', x1 - fw, x1, y - fd / 2, y + fd / 2, z0, z1)
    vs += box('wood', x0 + fw, x1 - fw, y - fd / 2, y + fd / 2, z0, z0 + 0.09)
    vs += box('wood', x0 + fw, x1 - fw, y - fd / 2, y + fd / 2, z1 - 0.09, z1)
    ix0, ix1, iz0, iz1 = x0 + fw, x1 - fw, z0 + 0.09, z1 - 0.09
    n = max(2, round((ix1 - ix0) / 0.1))
    for k in range(1, n):
        x = ix0 + (ix1 - ix0) * k / n
        vs += box('lattice', x - 0.011, x + 0.011, y, y + 0.03, iz0, iz1)
    H = iz1 - iz0
    for frac in (0.10, 0.13, 0.16, 0.47, 0.50, 0.53, 0.84, 0.87, 0.90) if H > 1 else (0.3, 0.7):
        z = iz0 + H * frac
        vs += box('lattice', ix0, ix1, y, y + 0.03, z - 0.011, z + 0.011)
    vs += box('hanji', ix0, ix1, y - 0.022, y - 0.018, iz0, iz1)
    if open_hinge:
        rotate_z(vs, open_hinge[0], y, open_hinge[1])


# 마루 + 귀틀
box('floor', 0, W, -0.1, D, -0.05, 0.0)
for j in range(1, NY * 2):
    y = BAY_Y * j / 2
    box('trim', 0, W, y - 0.12, y + 0.12, 0.0, 0.012, tile=TILE['wood'])
for i in range(1, NX * 4):
    x = BAY_X * i / 4
    box('trim', x - 0.08, x + 0.08, 0, D, 0.0, 0.01, tile=TILE['wood'])

# 기둥
for i in range(NX + 1):
    for j in range(NY + 1):
        column(i * BAY_X, j * BAY_Y)

# 정면: 칸마다 문지방·문설주·상방·광창·문짝 4, 위로 창방·평방
OPEN = 0  # 이 칸의 가운데 두 짝을 연다
for b in range(NX):
    bx = b * BAY_X
    x0, x1 = bx + COL_R, bx + BAY_X - COL_R
    box('wood', x0, x1, -0.1, 0.1, 0, Z_SILL)
    box('wood', x0, x0 + 0.12, -0.08, 0.08, Z_SILL, Z_HEAD)
    box('wood', x1 - 0.12, x1, -0.08, 0.08, Z_SILL, Z_HEAD)
    box('wood', x0, x1, -0.1, 0.1, Z_HEAD, Z_HEAD2)
    lattice(x0 + 0.12, x1 - 0.12, Z_HEAD2, Z_CB)
    lx0, lw = x0 + 0.12, (x1 - x0 - 0.24) / 4
    for k in range(4):
        hinge = None
        if b == OPEN and k == 1:
            hinge = (lx0 + lw, math.radians(100))
        if b == OPEN and k == 2:
            hinge = (lx0 + 3 * lw, math.radians(-100))
        lattice(lx0 + k * lw, lx0 + (k + 1) * lw, Z_SILL, Z_HEAD, open_hinge=hinge)

# 벽: 하방·흙벽·중방·흙벽 (왼쪽 x=0, 오른쪽 x=W, 뒤 y=D)
def wall_x(x, y0, y1):
    box('wood', x - 0.1, x + 0.1, y0, y1, 0, 0.2)
    box('earth', x - 0.09, x + 0.09, y0, y1, 0.2, 1.3)
    box('wood', x - 0.1, x + 0.1, y0, y1, 1.3, 1.5)
    box('earth', x - 0.09, x + 0.09, y0, y1, 1.5, Z_CB)


def wall_y(y, x0, x1):
    box('wood', x0, x1, y - 0.1, y + 0.1, 0, 0.2)
    box('earth', x0, x1, y - 0.09, y + 0.09, 0.2, 1.3)
    box('wood', x0, x1, y - 0.1, y + 0.1, 1.3, 1.5)
    box('earth', x0, x1, y - 0.09, y + 0.09, 1.5, Z_CB)


for j in range(NY):
    y0, y1 = j * BAY_Y + COL_R, (j + 1) * BAY_Y - COL_R
    wall_x(0, y0, y1)
    wall_x(W, y0, y1)
for i in range(NX):
    wall_y(D, i * BAY_X + COL_R, (i + 1) * BAY_X - COL_R)

# 창방·평방 (네 둘레 + 안쪽 기둥 줄) 과 공포대 포벽
for y in (0.0, BAY_Y, D):
    box('dancheong', -0.1, W + 0.1, y - 0.15, y + 0.15, Z_CB, COL_H, uv='band_x')
    box('dancheong', -0.15, W + 0.15, y - 0.19, y + 0.19, COL_H, Z_PB, uv='band_x')
for x in (0.0, W):
    box('dancheong', x - 0.15, x + 0.15, -0.1, D + 0.1, Z_CB, COL_H, uv='band_y')
    box('dancheong', x - 0.19, x + 0.19, -0.15, D + 0.15, COL_H, Z_PB, uv='band_y')
for y in (0.0, D):
    box('earth', 0, W, y - 0.05, y + 0.05, Z_PB, Z_CEIL)
for x in (0.0, W):
    box('earth', x - 0.05, x + 0.05, 0, D, Z_PB, Z_CEIL)
# 공포(다포): 기둥 위 주심포 + 칸마다 사이포 2 — 주두·첨차 2단·살미, 안쪽으로 내민 부분이 실내에서 보인다
def bracket_x(x, y, inward):
    s = 1 if inward > 0 else -1
    box('dancheong', x - 0.25, x + 0.25, y - 0.25, y + 0.25, Z_PB, Z_PB + 0.2, uv='band_x')
    box('dancheong', x - 0.45, x + 0.45, y - 0.08, y + 0.08, Z_PB + 0.2, Z_PB + 0.34, uv='band_x')
    box('dancheong', x - 0.65, x + 0.65, y - 0.08, y + 0.08, Z_PB + 0.42, Z_PB + 0.56, uv='band_x')
    ya, yb = sorted((y, y + s * 0.75))
    box('dancheong', x - 0.08, x + 0.08, ya, yb, Z_PB + 0.2, Z_PB + 0.34, uv='band_y')
    ya, yb = sorted((y, y + s * 0.55))
    box('dancheong', x - 0.08, x + 0.08, ya, yb, Z_PB + 0.42, Z_PB + 0.56, uv='band_y')


for y, inward in ((0.0, 1), (D, -1)):
    for i in range(NX + 1):
        bracket_x(i * BAY_X, y, inward)
        if i < NX:
            for k in (1, 2):
                bracket_x(i * BAY_X + BAY_X * k / 3, y, inward)

# 대들보 (앞뒤로 가로지름)
for i in range(1, NX):
    box('dancheong', i * BAY_X - 0.26, i * BAY_X + 0.26, 0, D, Z_PB, Z_CEIL - 0.08, uv='band_y')

# 우물천장: 귀틀 격자 + 연화문 반자
nx, ny = 24, 16
for i in range(nx + 1):
    x = W * i / nx
    box('ceilgrid', x - 0.05, x + 0.05, 0, D, Z_CEIL - 0.1, Z_CEIL, uv='band_y')
for j in range(ny + 1):
    y = D * j / ny
    box('ceilgrid', 0, W, y - 0.05, y + 0.05, Z_CEIL - 0.1, Z_CEIL, uv='band_x')
for i in range(nx):
    for j in range(ny):
        quad_down('ceiling', W * i / nx + 0.05, W * (i + 1) / nx - 0.05, D * j / ny + 0.05, D * (j + 1) / ny - 0.05, Z_CEIL)

# 불단(가운데 칸 뒤) + 촛대 둘
box('dancheong', BAY_X + 0.5, 2 * BAY_X - 0.5, D - 0.95, D - 0.15, 0, 0.85, uv='band_x')
box('wood', BAY_X + 0.45, 2 * BAY_X - 0.45, D - 1.0, D - 0.1, 0.85, 0.95)
CANDLES = [(BAY_X + 1.2, D - 0.6), (2 * BAY_X - 1.2, D - 0.6)]
for cx, cy in CANDLES:
    box('candle', cx - 0.04, cx + 0.04, cy - 0.04, cy + 0.04, 0.95, 1.27)
    box('flame', cx - 0.012, cx + 0.012, cy - 0.012, cy + 0.012, 1.28, 1.34)

# 바깥: 고막이(마루 밑 돌), 기단, 계단 — 실내에서 열린 문으로 보인다
box('stone', -0.4, W + 0.4, -0.25, -0.1, Z_GIDAN, 0.0)
box('stone', -1.6, W + 1.6, -2.4, -0.1, Z_GROUND, Z_GIDAN)
sx0, sx1 = 1.2, 3.2
box('stone', sx0, sx1, -2.7, -2.4, Z_GROUND, Z_GIDAN - 0.3)
box('stone', sx0, sx1, -3.0, -2.7, Z_GROUND, Z_GIDAN - 0.6)
# 지붕 대신 덮개 + 처마(1.8m, 설계값): 천장 위로 해·달이 직접 들지 않게, 처마가 높은 해를 가려 문간 빛 웅덩이가 실제처럼 짧아지게
EAVE = 1.8
box('wood', -EAVE, W + EAVE, -EAVE, D + EAVE, Z_CEIL + 0.25, Z_CEIL + 0.45)
# 마당 (굽기 때 반사광용, 따로 내보냄)
box('ground', -400, W + 400, -500, 300, Z_GROUND - 0.2, Z_GROUND)  # 지평선까지 (끝이 바다처럼 보이지 않게)


def to_object(name, mats):
    me = bpy.data.meshes.new(name)
    allb = bmesh.new()
    allb.loops.layers.uv.new('UVMap')
    for mi, m in enumerate(mats):
        b = BM[m]
        b.normal_update()
        tmp = bpy.data.meshes.new('tmp')
        b.to_mesh(tmp)
        for p in tmp.polygons:
            p.material_index = mi
        tmp.attributes.new('lm_scale', 'FLOAT', 'FACE').data.foreach_set('value', [LM_SCALE.get(m, 1.0)] * len(tmp.polygons))
        allb.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    allb.to_mesh(me)
    allb.free()
    seen = []
    for m in mats:
        if MATS[m] not in seen:
            seen.append(MATS[m])
    for p in me.polygons:  # 같은 재질을 쓰는 bmesh(살대=wood)는 한 슬롯으로
        p.material_index = seen.index(MATS[mats[p.material_index]])
    for m in seen:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    return ob


# 라이트맵에서 작게 줄일 것 (가늘어서 빛 변화가 작거나, 런타임 발광이거나, 대부분 가려진 면)
LM_SCALE = {'lattice': 0.3, 'hanji': 0.3, 'candle': 0.3, 'flame': 0.2, 'trim': 0.6, 'ceilgrid': 0.4}
HALL_MATS = ['floor', 'wood', 'lattice', 'trim', 'ceilgrid', 'column', 'earth', 'dancheong', 'ceiling', 'hanji', 'stone', 'candle', 'flame']
hall = to_object('hall', HALL_MATS)
ground = to_object('ground', ['ground'])
log('mesh: hall', len(hall.data.polygons), 'faces; ground', len(ground.data.polygons))

# 라이트맵 UV (두 번째 UV)
hall.data.uv_layers.new(name='lightmap')
hall.data.uv_layers.active = hall.data.uv_layers['lightmap']
bpy.context.view_layer.objects.active = hall
hall.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=8.0 / LM, area_weight=0.0, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
# LM_SCALE 재질의 면을 줄이고 다시 채워 마루·벽·천장에 해상도를 몰아준다
_bm = bmesh.new()
_bm.from_mesh(hall.data)
_uv = _bm.loops.layers.uv['lightmap']
_sc = _bm.faces.layers.float.get('lm_scale')
for f in _bm.faces:
    k = f[_sc] if _sc else 1.0
    if k < 1.0:
        c = sum((l[_uv].uv for l in f.loops), Vector((0, 0))) / len(f.loops)
        for l in f.loops:
            l[_uv].uv = c + (l[_uv].uv - c) * k
_bm.to_mesh(hall.data)
_bm.free()
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.select_all(action='SELECT')
bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=8.0 / LM)  # 1024 로 줄여도 섬 사이 4px
bpy.ops.object.mode_set(mode='OBJECT')

# ───────────────────────── 빛 ─────────────────────────
day = json.load(open(f'{SKY}/day.json'))


def three_dir_from_uv(u, v_top):
    """three.js equirectUv 의 역: u = atan(z,x)/2π + .5, v(아래가 0) = asin(y)/π + .5"""
    az = (u - 0.5) * 2 * math.pi
    el = (0.5 - v_top) * math.pi
    return Vector((math.cos(el) * math.cos(az), math.sin(el), math.cos(el) * math.sin(az)))


def blender_from_three(d):
    return Vector((d.x, -d.z, d.y))


SUN_T0 = three_dir_from_uv(day['sunU'], day['sunV'])
SKY_YAW = 0.0
if SUN_AZ is not None:  # 하늘을 세로축으로 돌려 해가 정면 왼쪽에서 열린 문으로 들게 (three: backgroundRotation.y = SKY_YAW)
    SKY_YAW = math.radians(SUN_AZ) - math.atan2(SUN_T0.x, SUN_T0.z)
c, s_ = math.cos(SKY_YAW), math.sin(SKY_YAW)
SUN_T = Vector((SUN_T0.x * c + SUN_T0.z * s_, SUN_T0.y, -SUN_T0.x * s_ + SUN_T0.z * c))
MOON_EL, MOON_AZ = math.radians(35), math.radians(-25)  # three 기준: 정면(+Z)에서 왼쪽으로 25°
MOON_T = Vector((math.cos(MOON_EL) * math.sin(MOON_AZ), math.sin(MOON_EL), math.cos(MOON_EL) * math.cos(MOON_AZ)))

world = bpy.data.worlds.new('w')
sc.world = world
world.use_nodes = True
wn = world.node_tree
env = wn.nodes.new('ShaderNodeTexEnvironment')
wn.links.new(env.outputs['Color'], wn.nodes['Background'].inputs['Color'])
_tc = wn.nodes.new('ShaderNodeTexCoord')
_mp = wn.nodes.new('ShaderNodeMapping')
_mp.inputs['Rotation'].default_value[2] = -SKY_YAW  # 조회 벡터를 반대로 돌리면 하늘이 +SKY_YAW 돈다
wn.links.new(_tc.outputs['Generated'], _mp.inputs['Vector'])
wn.links.new(_mp.outputs['Vector'], env.inputs['Vector'])


def env_irradiance(path):
    im = bpy.data.images.load(path, check_existing=True)
    w, h = im.size
    a = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)[::-1, :, :3]
    el = math.pi / 2 - (np.arange(h) + 0.5) / h * math.pi
    dw = np.cos(el) * (math.pi / h) * (2 * math.pi / w)
    L = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    return float((L * (np.sin(np.maximum(el, 0)) * dw)[:, None]).sum())


def sun_lamp(name, d_three, strength, color, angle_deg):
    L = bpy.data.lights.new(name, 'SUN')
    L.energy = strength
    L.color = color
    L.angle = math.radians(angle_deg)
    o = bpy.data.objects.new(name, L)
    o.rotation_euler = Vector((0, 0, 1)).rotation_difference(blender_from_three(d_three)).to_euler()
    sc.collection.objects.link(o)
    return o


E_SKY_NIGHT = env_irradiance(f'{SKY}/night_env.hdr')
E_MOON = 6.0 * E_SKY_NIGHT  # 달빛이 하늘빛을 이기게 (스펙: 은백색 달빛을 주광으로) — 설계값
P_CANDLE = 2.0 * E_MOON * 4 * math.pi * 1.5 ** 2  # 1.5m 거리에서 달빛 조도의 2배 — 설계값
sun = sun_lamp('sun', SUN_T, day['sunIrradiance'], day['sunColor'], 0.53)
moon = sun_lamp('moon', MOON_T, E_MOON, (0.78, 0.86, 1.0), 0.53)
candles = []
for cx, cy in CANDLES:
    L = bpy.data.lights.new('candle', 'POINT')
    L.energy = P_CANDLE
    L.color = (1.0, 0.62, 0.28)
    L.shadow_soft_size = 0.02
    o = bpy.data.objects.new('candle', L)
    o.location = (cx, cy, 1.31)
    sc.collection.objects.link(o)
    candles.append(o)


def lighting(mode):
    env.image = bpy.data.images.load(f'{SKY}/{mode}_env.hdr', check_existing=True)
    sun.hide_render = mode != 'day'
    moon.hide_render = mode != 'night'
    for c in candles:
        c.hide_render = mode != 'night'
    MATS['flame'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 40.0 if mode == 'night' else 0.0


meta = dict(skyYaw=SKY_YAW, bay=[BAY_X, BAY_Y], grid=[NX, NY], colH=COL_H, colR=COL_R, ceil=Z_CEIL, gidan=Z_GIDAN, ground=Z_GROUND,
            sunDirThree=list(SUN_T), moonDirThree=list(MOON_T), sunIrradiance=day['sunIrradiance'], sunColor=day['sunColor'],
            moonIrradiance=E_MOON, moonColor=[0.78, 0.86, 1.0], skyIrradianceNight=E_SKY_NIGHT, candleW=P_CANDLE,
            candles=[[c[0], 1.31, -c[1]] for c in CANDLES], hallFaces=len(hall.data.polygons), lm=LM, samples=SAMPLES)

# ───────────────────────── 굽기 ─────────────────────────
if BAKE:
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    sc.render.bake.margin = 16
    target = bpy.data.images.new('lm', LM, LM, alpha=True, float_buffer=True)
    UNIQ = list({id(MATS[m]): MATS[m] for m in HALL_MATS}.values())
    for mt in UNIQ:
        nt = mt.node_tree
        n = nt.nodes.new('ShaderNodeTexImage')
        n.name = 'BAKE'
        n.image = target
        uvn = nt.nodes.new('ShaderNodeUVMap')
        uvn.uv_map = 'lightmap'
        nt.links.new(uvn.outputs['UV'], n.inputs['Vector'])
        for x in nt.nodes:
            x.select = False
        n.select = True
        nt.nodes.active = n
    hanji_mode(True)
    bpy.ops.object.select_all(action='DESELECT')
    hall.select_set(True)
    bpy.context.view_layer.objects.active = hall
    for mode in ('day', 'night'):
        lighting(mode)
        target.generated_color = (0, 0, 0, 0)
        target.source = 'GENERATED'
        t = time.time()
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=16, use_clear=True)
        a = np.empty(LM * LM * 4, np.float32)
        target.pixels.foreach_get(a)
        np.save(f'{OUT}/lm_{mode}.npy', a.reshape(LM, LM, 4))
        log('bake', mode, '%.1fs' % (time.time() - t))
        meta[f'bake_{mode}_s'] = round(time.time() - t, 1)
    for mt in UNIQ:
        nt = mt.node_tree
        for n in [n for n in nt.nodes if n.name == 'BAKE' or (n.type == 'UVMAP' and n.uv_map == 'lightmap')]:
            nt.nodes.remove(n)
    hanji_mode(False)

# ───────────────────────── 내보내기 ─────────────────────────
hall.data.uv_layers.active = hall.data.uv_layers['UVMap']
for ob, name in ((hall, 'hall'), (ground, 'ground')):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=f'{OUT}/{name}.glb', export_format='GLB', use_selection=True,
                              export_texcoords=True, export_normals=True, export_tangents=False,
                              export_materials='EXPORT', export_image_format='AUTO', export_yup=True, export_lights=False)
meta['seconds'] = round(time.time() - T0, 1)
open(f'{OUT}/hall.json', 'w').write(json.dumps(meta, indent=1))
log('done', json.dumps(meta))
