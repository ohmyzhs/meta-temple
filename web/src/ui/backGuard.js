/**
 * 안드로이드 뒤로가기 방어 — 열린 것을 위에서부터 하나씩 닫고, 닫을 것이 없으면 「한 번 더 누르면 산문을 나섭니다」.
 * 그 안내 뒤 2초 안에 한 번 더 누르면 산사를 떠난다.
 *
 * 크롬 history manipulation intervention (chromium docs/history_manipulation_intervention.md):
 * 뒤로가기 뒤에는 새 사용자 동작이 있기 전까지 pushState 가 '사용자 동작 없이 만든 항목'이 되고, 그러면 이 문서의
 * 항목 전부가 건너뛸 항목이 되어 다음 뒤로가기가 사이트를 통째로 넘어간다 (popstate 도 오지 않는다).
 * 그래서 popstate 안에서는 다시 쌓지 않는다. 입장(클릭) 때 depth 칸을 미리 쌓아 두고, 뒤로가기마다 한 칸씩 쓰며,
 * 사용자가 화면을 누르거나 키를 칠 때(사용자 동작 중) 모자란 칸을 채운다. history.go() 는 이 규칙과 상관없다.
 *
 * 연타: 무언가를 닫은 직후 quietMs 안에 온 뒤로가기는 조용히 삼킨다 — 창 하나 닫으려다 산문 밖으로 튀어 나가지 않게.
 * ponytail: 연타가 depth 칸을 넘기면(사용자 동작 없이 5번 이상) 남은 뒤로가기는 브라우저 몫이다. 칸을 늘리면 방문 기록에 같은 페이지가 그만큼 쌓인다.
 */
export const EXIT_MSG = '한 번 더 누르면 산문을 나섭니다';
const KEY = 'templeBack';

/** 입장 클릭 처리 안에서 한 번 부른다 */
export function installBackGuard({ closeTop, toast, depth = 5, exitMs = 2000, quietMs = 700 }) {
  const h = history;
  let level = 0; // 지금 서 있는 칸 (0 = 산사에 처음 들어온 원래 항목)
  let armedUntil = 0, quietUntil = 0;
  const fill = () => {
    while (level < depth) h.pushState({ [KEY]: ++level }, '');
  };
  fill();

  addEventListener('popstate', (e) => {
    level = e.state?.[KEY] ?? 0;
    const now = performance.now();
    if (closeTop()) {
      quietUntil = now + quietMs;
      armedUntil = 0;
    } else if (now < quietUntil) {
      quietUntil = now + quietMs;
    } else if (now < armedUntil) {
      h.go(-(level + 1)); // 남은 칸과 원래 항목을 건너 이전 페이지로
    } else {
      armedUntil = now + exitMs;
      toast(EXIT_MSG);
    }
  });

  // 진짜 사용자 동작(손가락을 뗌·클릭·Esc 아닌 키) 안에서만 채운다. navigator.userActivation.isActive 는 동작 뒤 몇 초 동안
  // 참으로 남아 '뒤로가기 뒤의 새 동작'을 가려내지 못하므로, 스크립트가 만든 클릭 같은 가짜 이벤트(isTrusted 아님)는 받지 않는다
  const refill = (e) => {
    if (level >= depth || !e.isTrusted) return;
    if (e.type === 'keydown' ? e.key === 'Escape' : e.type === 'pointerup' && e.pointerType === 'mouse') return;
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    fill();
  };
  for (const t of ['click', 'pointerup', 'keydown']) addEventListener(t, refill, { capture: true, passive: true });
}
