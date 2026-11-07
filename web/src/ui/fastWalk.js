/**
 * 빠르게 걷기 단추 (2026-11-07 사용자 요청) — 터치 화면에서 조이스틱 오른쪽 위, 누를 때마다 켜고 끈다.
 * 데스크톱은 Shift 를 누르는 동안 (main.js 가 keys 로 본다). 빠르기는 avatarManager FAST_SPEED (걷기의 2.5배, 가벼운 뜀 클립).
 * 다른 도반에게는 실제 움직인 빠르기로 보인다 — 보내는 이름·서버는 그대로.
 * 조이스틱을 끝까지 밀어 버티는 몸짓은 이미 자동 걷기라 단추로 따로 둔다.
 */
const CSS = `
.fast-btn {
  position: absolute; left: calc(100% - 18px); bottom: calc(100% - 18px); /* 조이스틱 오른쪽 위 모서리 — 원 밖, 오른쪽 아래 알림·답례 단추와 겹치지 않게 */
  width: 52px; height: 52px; border-radius: 50%; padding: 0;
  background: rgba(20, 17, 14, 0.5); border: 1px solid var(--line); color: var(--hanji-50);
  font-family: var(--font-serif); font-size: 13px; letter-spacing: 0.02em; touch-action: manipulation;
}
.fast-btn.on { color: #f6dfa5; border-color: var(--gold); background: rgba(242, 196, 109, 0.24); box-shadow: 0 0 0 2px var(--gold-soft), 0 0 14px rgba(242, 196, 109, 0.35); }
`;

/** @param joystick #joystick (단추는 그 안에 붙어 조이스틱 자리·크기를 따라간다) */
export function createFastWalk(joystick) {
  let on = false;
  if (!joystick) return { get on() { return false; }, set() {} };
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fast-btn';
  btn.id = 'fast-btn';
  btn.textContent = '빠르게';
  btn.setAttribute('aria-pressed', 'false');
  btn.title = '빠르게 걷기 (키보드는 Shift)';
  // 조이스틱 안에 있으니 누른 손가락을 조이스틱이 잡지 않게
  for (const ev of ['pointerdown', 'pointermove', 'pointerup']) btn.addEventListener(ev, (e) => e.stopPropagation());
  const set = (v) => {
    on = !!v;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  };
  btn.addEventListener('click', () => {
    set(!on);
    navigator.vibrate?.(10);
  });
  joystick.appendChild(btn);
  return {
    get on() {
      return on;
    },
    set
  };
}
