"""국가유산청 3D 스캔(OBJ, RealityCapture, Z-up) → 웹용 저폴리 GLB (색·노멀·AO 를 원본에서 굽기).

  blender -b --factory-startup -P tools/blender/scan_bake.py -- \
      --obj scan.obj --tex scan_8k.jpg --out OUT_DIR \
      [--tris 40000] [--size 2048] [--crop-z 0.17] [--ao-samples 96] [--name pagoda]

- 지면 조각: 스캔 최저점에서 --crop-z(m) 아래 정점은 지운다 (고선사지 스캔은 기단 둘레에 약 7.5m 사각 지면이 붙어 있고,
  높이 띠별 반경을 재 보면 최저점+0.2m 부터가 기단). 잘린 자리는 런타임 마당 바닥이 덮는다.
- 원점: 수평 중심(정점 중앙값) = (0,0), 남은 메시의 최저점 = 0.
- 결과: OUT_DIR/{name}.glb (텍스처는 PNG/JPG 그대로 — 압축은 gltf-transform 이), {name}_col.jpg, _nrm.png, _ao.png, {name}.json(수치)
"""
import json
import math
import sys
import time

import bmesh
import bpy
import numpy as np

A = sys.argv[sys.argv.index('--') + 1:]


def arg(k, d=None, f=str):
    return f(A[A.index(k) + 1]) if k in A else d


OBJ, TEX, OUT = arg('--obj'), arg('--tex'), arg('--out')
TRIS, SIZE = arg('--tris', 40000, int), arg('--size', 2048, int)
CROP_Z, AO_S, NAME = arg('--crop-z', 0.17, float), arg('--ao-samples', 96, int), arg('--name', 'pagoda')
T0 = time.time()
log = lambda *m: print('[scan %.0fs]' % (time.time() - T0), *m, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == 'METAL'
sc.cycles.device = 'GPU'

# ── 가져오기 ──
bpy.ops.wm.obj_import(filepath=OBJ, forward_axis='Y', up_axis='Z')
hi = bpy.context.selected_objects[0]
hi.name = 'scan_high'
me = hi.data
n_src = len(me.polygons)
co = np.empty(len(me.vertices) * 3, np.float32)
me.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
cx, cy = float(np.median(co[:, 0])), float(np.median(co[:, 1]))

# ── 지면 고리 자르기 + 원점 ──
bm = bmesh.new()
bm.from_mesh(me)
z0 = float(co[:, 2].min())
low = [v for v in bm.verts if v.co.z < z0 + CROP_Z]
bmesh.ops.delete(bm, geom=low, context='VERTS')
zmin = min(v.co.z for v in bm.verts)
for v in bm.verts:
    v.co.x -= cx
    v.co.y -= cy
    v.co.z -= zmin
bm.to_mesh(me)
bm.free()
me.update()
n_hi = len(me.polygons)
dims = list(hi.dimensions)
log('high', n_src, '->', n_hi, 'faces after crop; dims', [round(x, 3) for x in dims])

# 원본 재질: 8k 색 텍스처
img_src = bpy.data.images.load(TEX)
mat_hi = bpy.data.materials.new('scan_src')
mat_hi.use_nodes = True
nt = mat_hi.node_tree
bsdf = nt.nodes['Principled BSDF']
tn = nt.nodes.new('ShaderNodeTexImage')
tn.image = img_src
nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
me.materials.clear()
me.materials.append(mat_hi)

# ── 줄이기 ──
lo = hi.copy()
lo.data = hi.data.copy()
lo.name = NAME
sc.collection.objects.link(lo)
mod = lo.modifiers.new('dec', 'DECIMATE')
mod.decimate_type = 'COLLAPSE'
mod.ratio = TRIS / n_hi
mod.use_collapse_triangulate = True
bpy.context.view_layer.objects.active = lo
bpy.ops.object.select_all(action='DESELECT')
lo.select_set(True)
bpy.ops.object.modifier_apply(modifier='dec')
n_lo = len(lo.data.polygons)
log('low', n_lo, 'tris')

# 새 UV (굽기용, 겹침 없음)
while lo.data.uv_layers:
    lo.data.uv_layers.remove(lo.data.uv_layers[0])
lo.data.uv_layers.new(name='UVMap')
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.shade_smooth()

# 저폴리 재질 + 굽기 대상 이미지
def new_img(n, non_color):
    im = bpy.data.images.new(n, SIZE, SIZE, alpha=False, float_buffer=False)
    if non_color:
        im.colorspace_settings.name = 'Non-Color'
    return im

img_col, img_nrm, img_ao = new_img(NAME + '_col', False), new_img(NAME + '_nrm', True), new_img(NAME + '_ao', True)
mat = bpy.data.materials.new(NAME)
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes['Principled BSDF']
nodes = {}
for key, im in (('col', img_col), ('nrm', img_nrm), ('ao', img_ao)):
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = im
    nodes[key] = n
lo.data.materials.clear()
lo.data.materials.append(mat)


def bake(kind, target, samples, **kw):
    sc.cycles.samples = samples
    for n in nt.nodes:
        n.select = False
    nodes[target].select = True
    nt.nodes.active = nodes[target]
    bpy.ops.object.select_all(action='DESELECT')
    hi.select_set(True)
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    t = time.time()
    bpy.ops.object.bake(type=kind, use_selected_to_active=True, cage_extrusion=0.03, max_ray_distance=0.12,
                        margin=16, use_clear=True, **kw)
    log('bake', kind, target, '%.1fs' % (time.time() - t))


bake('DIFFUSE', 'col', 4, pass_filter={'COLOR'})
bake('NORMAL', 'nrm', 4, normal_space='TANGENT')
bake('AO', 'ao', AO_S)

for im, ext in ((img_col, 'jpg'), (img_nrm, 'png'), (img_ao, 'png')):
    im.filepath_raw = f'{OUT}/{im.name}.{ext}'
    im.file_format = 'JPEG' if ext == 'jpg' else 'PNG'
    im.save()

# ── 내보내기용 재질 연결 ──
for n in nodes.values():
    n.select = False
nt.links.new(nodes['col'].outputs['Color'], bsdf.inputs['Base Color'])
nm = nt.nodes.new('ShaderNodeNormalMap')
nt.links.new(nodes['nrm'].outputs['Color'], nm.inputs['Color'])
nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
bsdf.inputs['Roughness'].default_value = 0.88
bsdf.inputs['Metallic'].default_value = 0.0
# glTF 내보내기가 occlusion 으로 읽는 노드 그룹
grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
gn = nt.nodes.new('ShaderNodeGroup')
gn.node_tree = grp
sep = nt.nodes.new('ShaderNodeSeparateColor')
nt.links.new(nodes['ao'].outputs['Color'], sep.inputs['Color'])
nt.links.new(sep.outputs['Red'], gn.inputs['Occlusion'])

bpy.data.objects.remove(hi, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
lo.select_set(True)
bpy.ops.export_scene.gltf(filepath=f'{OUT}/{NAME}.glb', export_format='GLB', use_selection=True,
                          export_texcoords=True, export_normals=True, export_tangents=True,
                          export_materials='EXPORT', export_image_format='AUTO', export_yup=True)
meta = dict(source_faces=n_src, cropped_faces=n_hi, low_tris=n_lo, dims_m=dims, crop_z=CROP_Z, bake_size=SIZE,
            center_xy=[cx, cy], zmin=float(zmin), seconds=round(time.time() - T0, 1))
open(f'{OUT}/{NAME}.json', 'w').write(json.dumps(meta, indent=1))
log('done', json.dumps(meta))
