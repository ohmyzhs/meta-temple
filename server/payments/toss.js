/**
 * 토스페이먼츠 어댑터 자리 — 아직 결제는 하지 않는다.
 *
 * 붙일 때의 흐름 (사주언박싱에서 쓴 방식과 같게):
 *   1. createOrder({ profileId, sku, amount })  → orders 에 status 'ready' 로 기록, orderId 를 돌려준다
 *   2. 화면이 토스 결제위젯을 띄운다 (orderId·amount·orderName)
 *   3. confirm({ paymentKey, orderId, amount }) → 서버가 토스 승인 API 를 부르고 금액을 orders 와 대조
 *      → status 'paid', entitlements 에 source 'purchase' 로 지급
 *   4. 웹훅으로 취소·환불 상태를 맞춘다
 * 비밀 키는 서버 live.env 에만 둔다 (git 밖).
 */
import { paymentsEnabled } from '../products.js';

const disabled = { error: 'payments_disabled' };

export async function createOrder(/* { profileId, sku, amount } */) {
  if (!paymentsEnabled()) return disabled;
  return { error: 'not_implemented' };
}

export async function confirm(/* { paymentKey, orderId, amount } */) {
  if (!paymentsEnabled()) return disabled;
  return { error: 'not_implemented' };
}
