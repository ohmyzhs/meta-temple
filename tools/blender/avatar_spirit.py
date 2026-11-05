"""청연산사 아바타 — 연꽃 등불 정령(lantern_spirit): 사람 몸 대신 떠다니는 작은 연꽃 등불. 꽃잎 16장이 뼈로 피고 접힌다.

  /opt/homebrew/bin/blender -b --factory-startup -P tools/blender/avatar_spirit.py -- \
      --out web/assets/avatars [--preview DIR]

- 도구(관 만들기·질감·눈 조각)는 avatar_build.py 것을 그대로 쓴다. 결과: OUT/spirit.glb, OUT/spirit.json
- 동작 이름은 동자승과 같다 (idle·walk·bow_half·prostrate·sit·look_up) — 런타임이 같은 규칙(core/avatarMotion.js)으로 고르고,
  없는 동작(차수·헌향·돌탑 등)은 가까운 것으로 대신한다.
- 좌표: 블렌더 Z 위, -Y 앞. 등불(머리 뼈 'head')은 바닥에서 0.95m 에 떠 있다 (지금 절차식 정령과 같은 높이).
"""
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import avatar_build as AB  # noqa: E402  (실행부는 __main__ 에서만 돈다)
from avatar_build import V, TAU, SC, OUT, log, loft, ring_at, new_obj, Atlas, save_image, to_lin, hexrgb, smooth_np, vnoise  # noqa: E402

FPS = 30
SC.render.fps = FPS
FLOAT = 0.95          # 등불 가운데 높이
CORE_R = 0.13
R_CORE = (0.0, 0.5, 0.5, 1.0)
R_OUTER = (0.5, 0.5, 0.75, 1.0)
R_INNER = (0.75, 0.5, 1.0, 1.0)
R_PAD = (0.0, 0.0, 0.5, 0.5)
R_EYE = (0.5, 0.25, 0.625, 0.375)
R_LID = (0.625, 0.25, 0.6875, 0.3125)
TEXN = 512
RINGS = [('o', 8, 0.0, 0.05, -0.11, 28.0, 0.27, 0.135), ('i', 8, math.pi / 8, 0.04, -0.1, 57.0, 0.21, 0.115)]  # 꽃잎이 등불을 감싼다  # 이름·장수·돌림·밑동 반지름·높이·벌림°·길이·폭
EYE = (0, -CORE_R + 0.03, FLOAT + 0.005)


def petal_frame(phi, r0, z0, elev):
    d0 = V((math.sin(phi), -math.cos(phi), 0))  # 바깥 (phi=0 이 앞)
    t = V((math.cos(phi), math.sin(phi), 0))    # 둘레 방향
    e = math.radians(elev)
    d = (d0 * math.cos(e) + V((0, 0, 1)) * math.sin(e)).normalized()
    base = V((0, 0, FLOAT + z0)) + d0 * r0
    return base, d, t


def build_armature():
    ad = bpy.data.armatures.new('spirit_rig')
    arm = bpy.data.objects.new('spirit_rig', ad)
    SC.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = ad.edit_bones
    root = eb.new('root')
    root.head, root.tail = V((0, 0, 0)), V((0, 0, 0.12))
    head = eb.new('head')  # 등불 몸 (뜨고·기울고·숨쉰다) — 동자승의 머리 뼈처럼 1인칭 눈을 여기에 단다
    head.head, head.tail = V((0, 0, FLOAT)), V((0, 0, FLOAT + 0.12))
    head.align_roll(V((0, -1, 0)))
    head.parent = root
    for name, n, off, r0, z0, elev, L, W in RINGS:
        for i in range(n):
            base, d, t = petal_frame(off + TAU * i / n, r0, z0, elev)
            b = eb.new(f'petal_{name}{i}')
            b.head, b.tail = base, base + d * 0.05
            b.align_roll(t.cross(d))  # 뼈 X = 둘레 방향 → X 로 돌리면 꽃잎이 바깥으로 벌어진다
            b.parent = eb['head']
    bpy.ops.object.mode_set(mode='POSE')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def ellipsoid_on(name, center, axes, radii, uv, n=12, m=8):
    """axes = (x축, y축, z축) 방향으로 radii 만큼인 타원체."""
    rings, vs = [], []
    ax, ay, az = axes
    for k in range(1, m):
        ph = -math.pi / 2 + math.pi * k / m
        rings.append([center + ax * (radii[0] * math.cos(ph) * math.sin(TAU * i / n)) + ay * (radii[1] * math.cos(ph) * math.cos(TAU * i / n))
                      + az * (radii[2] * math.sin(ph)) for i in range(n)])
        vs.append(k / m)
    return loft(name, rings, uv, vs, cap0=True, cap1=True, outward=lambda p: center)


def build_mesh():
    parts = []  # (object, bone)
    core = ellipsoid_on('core', V((0, 0, FLOAT)), (V((1, 0, 0)), V((0, 1, 0)), V((0, 0, 1))), (CORE_R, CORE_R * 0.98, CORE_R * 1.02), R_CORE, 28, 18)
    parts.append((core, 'head'))
    pad_c = V((0, 0, FLOAT - 0.165))
    pad = ellipsoid_on('pad', pad_c, (V((1, 0, 0)), V((0, 1, 0)), V((0, 0, 1))), (0.29, 0.29, 0.016), R_PAD, 24, 6)
    parts.append((pad, 'head'))
    for name, n, off, r0, z0, elev, L, W in RINGS:
        uv = R_OUTER if name == 'o' else R_INNER
        for i in range(n):
            base, d, t = petal_frame(off + TAU * i / n, r0, z0, elev)
            nrm = t.cross(d).normalized()
            c = base + d * (L * 0.48) - nrm * 0.01  # 안쪽으로 살짝 오목
            ob = ellipsoid_on(f'p{name}{i}', c, (t, nrm, d), (W / 2, 0.012, L / 2), uv, 12, 8)
            parts.append((ob, f'petal_{name}{i}'))
    return parts


def eyes_on_core(kind):
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    cen = V((0, 0, FLOAT))

    def on(x, z, lift=0.002):
        y = -math.sqrt(max(CORE_R ** 2 - x * x - (z - FLOAT) ** 2, 1e-6))
        p = V((x, y, z))
        return cen + (p - cen).normalized() * (CORE_R + lift)
    ew, eh, ez = 0.02, 0.026, FLOAT + 0.012
    for sx in (1, -1):
        cx = sx * 0.05
        if kind == 'open':
            u0, v0, u1, v1 = AB.inset(R_EYE, 2)
            UV = lambda a, b: (u0 + a * (u1 - u0), v0 + b * (v1 - v0))
            c = bm.verts.new(on(cx, ez))
            ring = [(bm.verts.new(on(cx + ew * math.cos(TAU * i / 16), ez + eh * math.sin(TAU * i / 16))),
                     (0.5 + 0.5 * math.cos(TAU * i / 16), 0.5 + 0.5 * math.sin(TAU * i / 16))) for i in range(16)]
            for i in range(16):
                j = (i + 1) % 16
                f = bm.faces.new((c, ring[i][0], ring[j][0]))
                for lp, uv in zip(f.loops, [(0.5, 0.5), ring[i][1], ring[j][1]]):
                    lp[uvl].uv = UV(*uv)
        else:
            u0, v0, u1, v1 = AB.inset(R_LID, 2)
            top, bot = [], []
            for i in range(9):
                t = -1 + 2 * i / 8
                z = ez - 0.004 - 0.009 * (1 - t * t)
                w = 0.004 * (1 - 0.6 * t * t)
                top.append(bm.verts.new(on(cx + ew * 1.05 * t, z + w)))
                bot.append(bm.verts.new(on(cx + ew * 1.05 * t, z - w)))
            for i in range(8):
                f = bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
                for lp in f.loops:
                    lp[uvl].uv = ((u0 + u1) / 2, (v0 + v1) / 2)
    bm.normal_update()
    if sum(f.normal.dot(f.calc_center_median() - cen) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return new_obj(f'eyes_{kind}', bm)


def paint():
    at = Atlas(TEXN)
    emis = np.zeros((TEXN, TEXN))
    # 등불 몸: 따뜻한 흰빛, 아래로 갈수록 살구빛 — 얼굴(볼·입)은 정면 투영으로
    U, Vv = at.grid(R_CORE)
    th, ph = U * TAU, -np.pi / 2 + np.pi * Vv
    X = CORE_R * np.cos(ph) * np.sin(th)
    Z = CORE_R * np.sin(ph)
    front = -np.cos(th)
    col = to_lin(hexrgb('#ffe9b8'))[None, None, :] * np.ones(U.shape)[..., None]
    low = smooth_np((0.5 - Vv) / 0.5)[..., None]
    col = col * (1 - 0.6 * low) + to_lin(hexrgb('#ffb877')) * 0.6 * low
    for sgn in (-1, 1):
        cb = np.exp(-(((X - sgn * 0.08) / 0.02) ** 2 + ((Z + 0.018) / 0.011) ** 2)) * (front > 0.2)
        col = col * (1 - 0.55 * cb[..., None]) + to_lin(hexrgb('#f48a8a')) * 0.55 * cb[..., None]
    mx = X / 0.011
    d = np.abs(Z - (-0.03 + 0.004 * mx ** 2)) + np.where(np.abs(mx) > 1, (np.abs(mx) - 1) * 0.011, 0)
    a = (np.clip(1 - d / 0.003, 0, 1) ** 0.7 * 0.8 * (front > 0.3))[..., None]
    col = col * (1 - a) + to_lin(hexrgb('#b8645a')) * a
    at.put(R_CORE, col, np.zeros(U.shape), 0.45, CORE_R * TAU, CORE_R * np.pi)
    sy, sx = at.region(R_CORE)
    emis[sy, sx] = 1.0 - 0.6 * a[..., 0]
    # 꽃잎: 밑동 진분홍 → 끝 흰빛, 가는 잎맥 (v 0 밑동 → 1 끝 쪽은 고리 순서라 대략)
    for rr, tip in ((R_OUTER, '#e9789b'), (R_INNER, '#f095b0')):
        U, Vv = at.grid(rr)
        h, w = U.shape
        g = smooth_np(Vv)[..., None]
        col = to_lin(hexrgb(tip))[None, None, :] * (1 - g) + to_lin(hexrgb('#fff3f5')) * g
        vein = (0.5 + 0.5 * np.cos(U * TAU * 9)) ** 6
        col *= (1 - 0.08 * vein)[..., None]
        at.put(rr, col, 0.0003 * vein, 0.55, 0.12, 0.2)
        sy, sx = at.region(rr)
        emis[sy, sx] = 0.25 + 0.2 * Vv
    # 연잎 받침
    U, Vv = at.grid(R_PAD)
    h, w = U.shape
    col = to_lin(hexrgb('#5b8a44'))[None, None, :] * (0.9 + 0.12 * Vv + 0.06 * (vnoise(h, w, 8, 8, seed=140) - 0.5))[..., None]
    rib = (0.5 + 0.5 * np.cos(U * TAU * 14)) ** 8
    col *= (1 + 0.15 * rib)[..., None]
    at.put(R_PAD, col, 0.0005 * rib, 0.6, 1.8, 0.3)
    sy, sx = at.region(R_PAD)
    emis[sy, sx] = 0.06
    # 눈 (동자승과 같은 그림, 작게)
    U, Vv = at.grid(R_EYE)
    rr = np.hypot(U - 0.5, Vv - 0.5) * 2
    col = to_lin(hexrgb('#2a1d19'))[None, None, :] * np.ones(U.shape)[..., None]
    lowe = smooth_np((0.55 - Vv) / 0.45)[..., None]
    col = col * (1 - 0.8 * lowe) + to_lin(hexrgb('#6e4a38')) * 0.8 * lowe
    for cx, cy, rx_, ry_, al in ((0.63, 0.69, 0.18, 0.15, 1.0), (0.37, 0.31, 0.08, 0.08, 0.85)):
        hl = smooth_np((1 - np.hypot((U - cx) / rx_, (Vv - cy) / ry_)) / 0.25) * al
        col = col * (1 - hl[..., None]) + np.ones(3) * hl[..., None]
    at.put(R_EYE, col, np.zeros(U.shape), 0.15, 0.05, 0.06)
    U, Vv = at.grid(R_LID)
    at.put(R_LID, to_lin(hexrgb('#3b2a22'))[None, None, :] * np.ones(U.shape)[..., None], np.zeros(U.shape), 0.5, 0.05, 0.05)
    return at, emis


def make_material(at, emis):
    col = save_image('spirit_col', at.col, os.path.join(OUT, 'spirit_col.png'), True)
    em = save_image('spirit_emis', np.dstack([emis] * 3) * at.col, os.path.join(OUT, 'spirit_emis.png'), True)
    orm = save_image('spirit_orm', np.dstack([np.ones((TEXN, TEXN)), at.rough, np.zeros((TEXN, TEXN))]), os.path.join(OUT, 'spirit_orm.png'), False)
    mat = bpy.data.materials.new('spirit')
    mat.use_backface_culling = True
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexImage')
    tc.image = col
    nt.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
    te = nt.nodes.new('ShaderNodeTexImage')
    te.image = em
    nt.links.new(te.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 2.2
    to = nt.nodes.new('ShaderNodeTexImage')
    to.image = orm
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(to.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    return mat


def bind(ob, arm, bone, mat):
    g = ob.vertex_groups.new(name=bone)
    g.add([v.index for v in ob.data.vertices], 1.0, 'REPLACE')
    ob.data.materials.clear()
    ob.data.materials.append(mat)


# ───────────────────────── 동작 (뼈를 직접 키) ─────────────────────────
def pose_at(name, t):
    """→ dict: lift(등불 높이 변화 m), tilt(앞 숙임°), sway(좌우 돌림°), pulse(크기 배율), o·i(바깥·안 꽃잎 벌림°)"""
    s = math.sin
    if name == 'idle':
        T = 3.0
        return dict(lift=0.035 * s(TAU * t / T), tilt=2 * s(TAU * t / T + 1), sway=6 * s(TAU * t / (T * 2) * 2), pulse=1 + 0.02 * s(TAU * t / T * 2),
                    o=4 * s(TAU * t / T), i=3 * s(TAU * t / T + 2))
    if name == 'walk':  # 앞으로 기울어 미끄러지듯, 꽃잎은 뒤로 조금 날린다
        T = 1.2
        return dict(lift=0.012 * s(TAU * t / T * 2), tilt=12 + 2 * s(TAU * t / T), sway=4 * s(TAU * t / T), pulse=1.0, o=10 + 3 * s(TAU * t / T * 2), i=6)
    if name == 'look_up':
        T = 4.0
        return dict(lift=0.02 * s(TAU * t / T), tilt=-24 + 2 * s(TAU * t / T), sway=0.0, pulse=1.0, o=8, i=6)
    if name == 'sit':  # 좌복 위에 내려앉아 활짝 핀 채 천천히 숨
        T = 5.0
        br = 0.5 - 0.5 * math.cos(TAU * t / T)
        return dict(lift=-0.5 + 0.01 * br, tilt=4, sway=0.0, pulse=1 + 0.03 * br, o=22 + 4 * br, i=14 + 3 * br)
    if name == 'bow_half':  # 숙였다가 (꽃잎을 오므려 합장하듯) 다시 핀다
        u = AB.smooth(t / 0.9) * (1 - AB.smooth((t - 1.6) / 0.8))
        return dict(lift=-0.08 * u, tilt=32 * u, sway=0.0, pulse=1.0, o=-12 * u, i=-10 * u)
    if name == 'prostrate':  # 바닥까지 내려앉아 봉오리로 접었다가 (3.6초) 다시 피어 떠오른다 — 큰절과 같은 7.6초
        down = AB.smooth((t - 0.6) / 2.4) * (1 - AB.smooth((t - 5.4) / 1.9))
        close = AB.smooth((t - 1.8) / 1.6) * (1 - AB.smooth((t - 4.6) / 0.8))
        bloom = AB.smooth((t - 4.6) / 0.8) * (1 - AB.smooth((t - 6.2) / 1.2))
        return dict(lift=-0.62 * down, tilt=48 * close, sway=0.0, pulse=1 + 0.08 * bloom, o=-30 * close + 28 * bloom, i=-24 * close + 18 * bloom)
    raise KeyError(name)


CLIPS = [('idle', 3.0, True), ('walk', 1.2, True), ('look_up', 4.0, True), ('sit', 5.0, True), ('bow_half', 74 / 30, False), ('prostrate', 7.6, False)]


def bake(arm):
    arm.animation_data_create()
    pbs = arm.pose.bones
    meta = {'fps': FPS, 'clips': {}, 'eye': list(EYE), 'height': FLOAT + 0.25}
    for name, T, loop in CLIPS:
        act = bpy.data.actions.new(name)
        arm.animation_data.action = act
        n = round(T * FPS)
        for f in range(n + 1):
            p = pose_at(name, (f / FPS) % T if loop else f / FPS)
            h = pbs['head']
            h.location = (0, p['lift'], 0)  # 뼈 Y = 위
            h.rotation_euler = (math.radians(p['tilt']), math.radians(p['sway']), 0)
            h.scale = (p['pulse'],) * 3
            h.keyframe_insert('location', frame=f)
            h.keyframe_insert('rotation_euler', frame=f)
            h.keyframe_insert('scale', frame=f)
            for rn, cnt, *_ in RINGS:
                for i in range(cnt):
                    pb = pbs[f'petal_{rn}{i}']
                    pb.rotation_euler = (math.radians(p[rn]), 0, 0)
                    pb.keyframe_insert('rotation_euler', frame=f)
        act.use_frame_range = True
        act.frame_start, act.frame_end = 0, n
        act.use_fake_user = True
        meta['clips'][name] = {'duration': n / FPS, 'loop': loop, **({'speed': 1.1} if name == 'walk' else {})}
        arm.animation_data.action = None
    return meta


if __name__ == '__main__':
    arm = build_armature()
    at, emis = paint()
    mat = make_material(at, emis)
    parts = build_mesh()
    for ob, bone in parts:
        bind(ob, arm, bone, mat)
    bpy.ops.object.select_all(action='DESELECT')
    for ob, _ in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0][0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = 'spirit_body'
    eyes = [eyes_on_core('open'), eyes_on_core('closed')]
    for e in eyes:
        bind(e, arm, 'head', mat)
    for ob in [body] + eyes:
        ob.parent = arm
        m = ob.modifiers.new('rig', 'ARMATURE')
        m.object = arm
    tris = sum(len(p.vertices) - 2 for o in [body] + eyes for p in o.data.polygons)
    log('spirit', tris, 'tris')
    meta = bake(arm)
    meta['tris'] = tris
    if AB.PREVIEW:
        eyes[1].hide_render = True
        os.makedirs(AB.PREVIEW, exist_ok=True)
        shots = [('spirit_front', None, 0, 0, 8, 2.6), ('spirit_34', None, 0, 35, 14, 2.6)]
        for name, T, loop in CLIPS:
            for k in range(4):
                shots.append((f'spirit_{name}_{k}', name, round(T * FPS * k / 4), 40, 12, 2.8))
        AB.preview(arm, body, shots)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in [arm, body] + eyes:
        ob.select_set(True)
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)
    SC['motion'] = json.dumps(meta, ensure_ascii=False)
    path = os.path.join(OUT, 'spirit.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_animations=True, export_animation_mode='ACTIONS', export_def_bones=True, export_force_sampling=True,
        export_optimize_animation_size=True, export_reset_pose_bones=True, export_rest_position_armature=True,
        export_anim_single_armature=True, export_skins=True, export_morph=False, export_extras=True,
        export_image_format='AUTO', export_tangents=False, export_leaf_bone=False)
    with open(os.path.join(OUT, 'spirit.json'), 'w') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    log('export →', path, os.path.getsize(path), 'bytes')
