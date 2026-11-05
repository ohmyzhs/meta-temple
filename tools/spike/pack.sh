#!/usr/bin/env bash
# 스파이크 에셋을 웹용으로 압축해 web/assets/spike/ 에 둔다.
#   KTX_BIN=<ktx 실행 파일 폴더> tools/spike/pack.sh WORK_DIR [size=1024]
# WORK_DIR 구조: scan/out/pagoda.glb, hall/out/{hall,ground}.glb, hall/lm/lm_{day,night}.png + lightmaps.json, sky/out/*
# gltf-transform 은 npx 로만 (package.json 에 넣지 않음, 사용자 결정 2026-11-05).
set -euo pipefail
W=$1; SIZE=${2:-1024}
REPO=$(cd "$(dirname "$0")/../.." && pwd)
OUT=$REPO/web/assets/spike; TMP=$W/pack; mkdir -p "$OUT/sky" "$TMP"
export PATH="${KTX_BIN:?KTX_BIN 이 필요합니다}:$PATH"
GT="npx -y @gltf-transform/cli@4.5.1"

glb() { # in out — 노멀은 UASTC, 나머지(색·AO·거칠기)는 ETC1S, 기하는 Meshopt
  local in=$1 out=$2 b; b=$TMP/$(basename "$out" .glb)
  $GT resize "$in" "$b.0.glb" --width "$SIZE" --height "$SIZE"
  # 반복 타일 노멀(*_nor_gl)은 512 — 미세 요철이라 폰에서 차이가 작다. 스캔 노멀(pagoda_nrm)은 SIZE 유지
  $GT resize "$b.0.glb" "$b.1.glb" --pattern "*nor_gl*" --width $((SIZE / 2)) --height $((SIZE / 2))
  $GT uastc "$b.1.glb" "$b.2.glb" --slots "normalTexture" --level 2 --rdo --rdo-lambda 6 --zstd 18
  $GT etc1s "$b.2.glb" "$b.3.glb" --quality 160  # 이미 KTX2 인 노멀은 건너뜀
  $GT meshopt "$b.3.glb" "$out" --level medium
}
glb "$W/scan/out/pagoda.glb" "$REPO/web/assets/world/pagoda_$SIZE.glb"  # 실사 세계와 같이 씀
glb "$W/hall/out/hall.glb" "$OUT/hall_$SIZE.glb"
glb "$W/hall/out/ground.glb" "$OUT/ground_$SIZE.glb"

for m in day night; do # 라이트맵: 8비트 sRGB → ETC1S. 밉맵 없음 — 섬 사이 여백이 작은 밉에서 번지므로 런타임도 LinearFilter
  ktx create --format R8G8B8_SRGB --encode basis-lz --qlevel 255 --clevel 4 --assign-tf srgb \
    "$W/hall/lm/lm_$m.png" "$OUT/lm_$m.ktx2"
done
cp "$W/hall/lm/lightmaps.json" "$OUT/lightmaps.json"
cp "$W/hall/out/hall.json" "$OUT/hall.json"
cp "$W/scan/out/pagoda.json" "$OUT/pagoda.json"
cp "$W"/sky/out/{day_bg_2048.jpg,night_bg_2048.jpg,night_bg_4096.jpg,day_env.hdr,night_env.hdr,day.json,night.json} "$OUT/sky/"
ls -l "$OUT" "$OUT/sky" | awk '{print $5, $9}'
