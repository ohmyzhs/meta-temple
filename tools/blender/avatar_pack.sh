#!/usr/bin/env bash
# 아바타 GLB 를 웹용으로 줄인다: 키프레임 정리(resample) → 텍스처 WebP → Meshopt(정점·애니메이션 양자화; 마지막에 해야 풀리지 않는다).
#   tools/blender/avatar_pack.sh <raw.glb> <out.glb>
# gltf-transform 4.5 (npm @gltf-transform/cli). KTX2(UASTC/ETC1S)는 toktx 가 필요해 아직 쓰지 않는다 — 에셋 파이프라인과 맞출 때 바꾼다.
set -euo pipefail
IN=$1; OUT=$2
GT=${GLTF_TRANSFORM:-npx -y @gltf-transform/cli@4.5.1}
TMP=$(mktemp -d)
$GT resample "$IN" "$TMP/a.glb" --tolerance 0.0001
$GT prune "$TMP/a.glb" "$TMP/b.glb"
$GT webp "$TMP/b.glb" "$TMP/c.glb" --quality 85 --effort 80
$GT meshopt "$TMP/c.glb" "$OUT" --level medium
rm -rf "$TMP"
ls -l "$OUT"
