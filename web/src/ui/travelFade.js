/**
 * 순간이동 가림 (main.js _teleport 가 모든 순간이동에 쓴다 — 미니맵·장소 시트·범종·기와불사·쉼터·좌복·산책 시작·탑돌이):
 * 화면이 OUT_MS 동안 어두워지고 → 가장 어두울 때 move() → 새 자리가 두 번 그려지고 HOLD_MS 가 지나면 → IN_MS 동안 밝아진다. 합쳐 약 2초.
 * 사용자 2026-11-08: 「미니맵 지점을 터치하면 순간이동이 너무 빠르다 — 어두워졌다 밝아지는 2초쯤의 디졸브로 옮겼다는 걸 알게」.
 * 걸어서 구역을 넘을 때는 쓰지 않는다 (2026-11-06 「제거해라」 그대로).
 *
 * 옛 가림막(ui/veil.js: 0.55초 어두워짐, 0.6초 뒤 옮김, 1.4초 걷힘)은 걷힐 때 첫 0.33초에 73% 가 밝아져 깜빡임처럼 지나갔다
 * (tools/qa/travel-fade.mjs 가 견줘 잰다) → 여기서는 양쪽 다 느린 S 곡선이라 가운데에 어두운 순간이 보인다.
 * 옮긴 직후 첫 렌더는 오래 걸릴 수 있어(CPU 4배 느리게 968ms) 새 장면이 그려질 때까지 어두운 채로 기다린다.
 * 덮개는 HUD·알림까지 덮고(z-index 80) 누르기를 받아 삼킨다 — 페이드 중 키·조이스틱은 main.js 가 무시한다.
 * 모션 줄이기 설정이어도 그대로 페이드한다 (위치 이동을 알리는 것이 목적이라).
 */
export const FADE = { out: 900, hold: 220, in: 900 };

let el = null;

const frames = (n) => new Promise((r) => { const f = () => (--n > 0 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** move() 를 가림 뒤에서. 다 밝아지면 풀리는 Promise */
export async function travelFade(move) {
  if (!el) {
    el = document.createElement('div');
    el.id = 'travel-fade';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;inset:0;z-index:80;background:#07060a;opacity:0;pointer-events:auto';
    document.body.appendChild(el);
  }
  el.hidden = false;
  const fade = (from, to, ms) => el.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: 'ease-in-out', fill: 'forwards' }).finished;
  try {
    await fade(0, 1, FADE.out);
    try {
      move();
    } finally {
      await Promise.all([frames(3), wait(FADE.hold)]); // 본 루프가 새 자리를 두 번 그릴 때까지, 그리고 어두운 순간을 잠깐
      await fade(1, 0, FADE.in);
    }
  } finally {
    el.hidden = true;
    el.getAnimations().forEach((a) => a.cancel()); // 끝난 애니메이션의 fill 이 다음 페이드의 시작 불투명도를 붙잡지 않게 (숨긴 뒤에)
  }
}
