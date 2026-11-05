import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrder, confirm } from './payments/toss.js';
import { PRODUCTS, paymentsEnabled } from './products.js';

test('toss_disabled', async () => {
  delete process.env.PAYMENTS_ENABLED;
  assert.equal(paymentsEnabled(), false);
  assert.deepEqual(await createOrder({ profileId: 'p', sku: 'tile_gold', amount: 1000 }), { error: 'payments_disabled' });
  assert.deepEqual(await confirm({ paymentKey: 'k', orderId: 'o', amount: 1000 }), { error: 'payments_disabled' });
});

test('products_shape', () => {
  const skus = PRODUCTS.map((p) => p.sku);
  assert.equal(new Set(skus).size, skus.length);
  for (const p of PRODUCTS) assert.ok(['offering', 'decor', 'tea_leaves'].includes(p.kind), p.sku);
  // 수행 보상(공덕)은 상품이 될 수 없다
  assert.equal(PRODUCTS.some((p) => p.kind === 'merit'), false);
});
