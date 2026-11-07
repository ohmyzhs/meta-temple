/**
 * 그림 아이콘 — web/assets/icons/icons.svg 의 <symbol> 을 <use> 로 불러 쓴다.
 * 24×24 격자, 둥근 끝 1.75px 선, 색은 currentColor (버튼 글자색을 따른다).
 * assets/ 는 배포 때 버전 경로 밖이라 캐시가 4시간 남는다 — 그림을 바꾸면 V 를 올린다.
 */
const V = 4;
const SPRITE = `./assets/icons/icons.svg?v=${V}`;

export const ICON_NAMES = [
  'bow_half', 'prostrate', 'meditate', 'incense', 'circumambulate', 'tea',
  'menu', 'time_weather', 'sound', 'self', 'record', 'help', 'credits', 'close', 'more', 'back',
  'zone_forest', 'zone_courtyard', 'zone_hall', 'zone_teahouse',
  'stone_pagoda', 'wish_lantern', 'wish_tile', 'burn_worry', 'bell_strike', 'practice_108', 'sutra_copy', 'yebul', 'tea_chat', 'dharma_card',
  't_realtime', 't_dawn', 'sun', 't_sunset', 't_night', 'w_rain', 'w_snow', 'cam_third', 'cam_first', 'av_monk', 'av_wanderer', 'listen_nature', 'sliders',
  'th_water', 'th_bird', 'th_bug',
  'mx_wind', 'mx_cicada', 'mx_frog', 'mx_bamboo', 'mx_drop', 'mx_chime', 'rest_mat'
];

/** 가람 구역 → 건물 그림 */
export const ZONE_ICONS = { FOREST: 'zone_forest', COURTYARD: 'zone_courtyard', DAEUNGJEON: 'zone_hall', TEAHOUSE: 'zone_teahouse' };

const attr = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** label 이 있으면 그림 자체가 이름을 갖고(role=img), 없으면 옆 글자가 이름이므로 읽지 않게 숨긴다 */
export function icon(name, { label } = {}) {
  const a11y = label ? `role="img" aria-label="${attr(label)}"` : 'aria-hidden="true"';
  return `<svg class="i" viewBox="0 0 24 24" ${a11y} focusable="false"><use href="${SPRITE}#${attr(name)}"/></svg>`;
}
