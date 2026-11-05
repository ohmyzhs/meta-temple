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
 * 칸 번호는 산사에 처음 들어온 항목(0)에서 몇 칸 위인지다. 새로고침하면 새 문서가 옛 칸 위에서 시작하므로 그 번호부터 이어 쌓고,
 * 나갈 때는 옛 칸까지 한 번에 건너뛴다. 링크로 바로 들어와 앞 페이지가 없으면 맨 아래 칸으로만 옮긴다 (그다음 뒤로가기는 브라우저가 탭을 닫는다).
 * ponytail: 연타가 depth 칸을 넘기면(사용자 동작 없이 5번 이상) 남은 뒤로가기는 브라우저 몫이다. 칸을 늘리면 방문 기록에 같은 페이지가 그만큼 쌓인다.
 */
export const EXIT_MSG = '한 번 더 누르면 산문을 나섭니다';
const KEY = 'templeBack';

/** 입장 클릭 처리 안에서 한 번 부른다 */
export function installBackGuard({ closeTop, toast, depth = 5, exitMs = 2000, quietMs = 700 }) {
  const h = history;
  const base = h.state?.[KEY] ?? 0; // 새로고침 뒤라면 옛 칸 번호
  let level = base, top = base; // 지금 서 있는 칸, 쌓인 맨 위 칸
  let armedUntil = 0, quietUntil = 0, ignoreUntil = 0;
  const fill = () => {
    while (level < base + depth) h.pushState({ [KEY]: ++level }, '');
    top = level;
  };
  fill();

  addEventListener('popstate', (e) => {
    level = e.state?.[KEY] ?? 0;
    const now = performance.now();
    if (now < ignoreUntil) return; // 나가려고 스스로 옮긴 것
    if (closeTop()) {
      quietUntil = now + quietMs;
      armedUntil = 0;
    } else if (now < quietUntil) {
      quietUntil = now + quietMs;
    } else if (now < armedUntil) {
      // pushState 는 앞쪽 항목을 지우므로 맨 위 칸 위에는 아무것도 없다 → 원래 항목 앞에 있는 페이지 수 = length - 1 - top
      const away = h.length - 1 - top > 0 ? level + 1 : level;
      armedUntil = 0;
      ignoreUntil = now + 600;
      if (away) h.go(-away);
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
