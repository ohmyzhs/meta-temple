# Blender 로 .hdr 을 읽어 float32 .npy (H, W, 3, 위가 하늘) 로 떨군다. 나머지 처리는 tools/spike/sky.py.
#   blender -b --factory-startup -P tools/blender/hdr_to_npy.py -- in.hdr out.npy
import bpy, sys, numpy as np
src, dst = sys.argv[sys.argv.index('--') + 1:][:2]
img = bpy.data.images.load(src)
w, h = img.size
a = np.empty(w * h * 4, np.float32)
img.pixels.foreach_get(a)
a = a.reshape(h, w, 4)[::-1, :, :3]  # Blender 픽셀은 아래 줄부터
np.save(dst, np.ascontiguousarray(a))
print('NPY', w, h, float(a.max()), float(np.median(a)))
