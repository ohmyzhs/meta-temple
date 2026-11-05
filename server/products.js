/**
 * 나중의 유료 상품 초안 (지금은 모두 꺼져 있다 — PAYMENTS_ENABLED=true 가 되기 전에는 아무도 볼 수 없다).
 * 원칙 (설계 문서 5장): 수행으로 얻는 공덕 보상(도감·칭호)은 팔지 않는다. 돈은 꾸밈·표시 기간·추가 차담에만.
 * 가격은 정하지 않았다 (null) — 사용자가 정한다.
 */
export const PRODUCTS = [
  { sku: 'offering_free', name: '공양 올리기', kind: 'offering', priceKrw: null, note: '금액을 직접 고르는 운영 후원 · 감사 연출과 공양 연등' },
  { sku: 'lantern_gold_30d', name: '금빛 공양 연등 (30일)', kind: 'decor', priceKrw: null, durationDays: 30 },
  { sku: 'tile_gold', name: '금빛 기와', kind: 'decor', priceKrw: null },
  { sku: 'stone_gold', name: '금빛 돌탑 돌', kind: 'decor', priceKrw: null },
  { sku: 'tea_leaves_20', name: '찻잎 (차담 20번)', kind: 'tea_leaves', priceKrw: null }
];

export const paymentsEnabled = () => process.env.PAYMENTS_ENABLED === 'true';
