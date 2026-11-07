/**
 * 화질 단계를 장면을 다시 만들지 않고 바꾼다 (판단은 core/qualityTier.js).
 * 바뀌는 것: 그림자 맵 크기(1024 ↔ 2048)·매 프레임 갱신(low 는 3프레임에 한 번)·나무와 대숲 그림자, 화면 배율 상한(tierCap — 실제 배율은 main.js _adaptQuality 가 0.25씩 옮긴다).
 * 그대로인 것: antialias(WebGL 문맥을 만들 때 정해진다), 나무·풀·대숲 수, 지형 해상도, 불꽃·잎 입자, 불상 조각, 실사 노멀맵 — 장면을 만들 때 quality 로 정해진다.
 * world.quality 는 그대로 둔다 (실사 질감을 늦게 받는 쪽이 그것을 읽는다).
 * 나무 잎·대숲 잎은 흔들림 깊이 재질(customDepthMaterial)을 따로 가져, low 로 지은 장면에서 처음 그림자를 드리울 때 셰이더 3~4개를 새로 짓는다
 * (이 맥에서 하나 6~9ms, 올리는 프레임 42ms). 실사 바깥(real/outdoor.js _trees)이 질감을 받고 나서 잎 재질과 깊이 재질을 통째로 바꾸므로
 * 대문에서 미리 지으면 헛일이다 → 자원 문이 열리는 첫 틱(main.js _adaptQuality, 잎 재질이 막 바뀌어 어차피 셰이더를 짓는 때)에 warmRenderTier 로 한 번.
 * 그 뒤로는 바꿔도 셰이더 수 그대로 (tools/qa/quality-tier.mjs).
 */
export const tierCap = (tier) => Math.min(window.devicePixelRatio || 1, tier === 'low' ? 1.25 : 1.75);

export function applyRenderTier(world, tier) {
  const low = tier === 'low';
  const sm = world.renderer.shadowMap;
  sm.autoUpdate = !low;
  sm.needsUpdate = true;
  const sh = world.sun.shadow, size = low ? 1024 : 2048;
  if (sh.mapSize.x !== size) {
    sh.mapSize.set(size, size);
    sh.map?.dispose(); // 다음 그림자 패스가 새 크기로 다시 잡는다
    sh.map = null;
  }
  for (const m of Object.values(world.veg?.meshes || {})) m.castShadow = !low;
  world.renderTier = tier;
}

/** low 로 지은 장면: 나무 그림자 셰이더를 미리 지어 둔다 (한 번 더 그리지만 이 프레임의 본 그리기가 덮어 화면에는 안 남는다) */
export function warmRenderTier(world) {
  const meshes = Object.values(world.veg?.meshes || {});
  const sm = world.renderer.shadowMap;
  meshes.forEach((m) => (m.castShadow = true));
  sm.needsUpdate = true;
  world.render();
  meshes.forEach((m) => (m.castShadow = false));
  sm.needsUpdate = true;
}
