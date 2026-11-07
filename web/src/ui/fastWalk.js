/**
 * 걷기·달리기 (2026-11-07 사용자 요청) — 터치 화면: 조이스틱 가운데 그랩(원)을 톡 누르면 달리기 ↔ 걷기.
 * 그랩에 그 모드의 다리 그림(걷는 다리·발 / 무릎을 든 달리는 다리·발)이 보이고, 누르면 쏙 들어갔다 튀어나온다.
 * 그랩에서 손가락을 끌면 평소 조이스틱 (main.js _bindInput — 누른 자리가 그랩이면 10px 넘게 끌 때부터 움직인다).
 * 데스크톱은 Shift 를 누르는 동안 (main.js 가 keys 로 본다). 빠르기는 avatarManager FAST_SPEED (걷기의 2.5배, 가벼운 뜀 클립).
 * 다른 도반에게는 실제 움직인 빠르기로 보인다 — 보내는 이름·서버는 그대로.
 */
// 다리 그림: 24×24 격자, 둥근 끝 (아이콘 묶음 icons.svg 와 같은 꼴, 그랩 안에서 읽히게 선만 2.5px) — 걷기: 골반에서 내린 두 다리가 땅을 딛음, 달리기: 무릎을 든 다리 + 속도선
const LEGS = `<svg class="fw-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <g class="fw-walk"><g transform="translate(-0.6 0.4)"><path d="M9.6 3.4h4.4"/><path d="M13 3.6l1.6 7.8 1.2 7.8h3.7"/><path d="M10.6 3.6l-.9 7.8-3.4 5.9 2.4 2.2"/></g></g>
  <g class="fw-run"><g transform="translate(1.2 2)"><path d="M9.4 3.4l4.2-.8"/><path d="M12.8 3.4l5 3.6-1.2 6.4 3.7.9"/><path d="M10.2 3.6l-1.4 7.4-4.6 3.6-.9 3.2"/><path stroke-width="1.75" d="M2.1 4.4h3.1M1.4 7.8h2.5"/></g></g>
</svg>`;

const CSS = `
.joy-knob { display: grid; place-items: center; transition: scale 0.12s ease-out, background-color 0.25s, border-color 0.25s, box-shadow 0.25s; }
.joy-knob .fw-ico { width: 66%; height: 66%; color: var(--hanji-50); transition: color 0.25s; pointer-events: none; }
.joy-knob .fw-ico g { transform-box: view-box; transform-origin: 12px 12px; transition: opacity 0.22s, scale 0.22s; }
.joy-knob .fw-run, .joy-knob.run .fw-walk { opacity: 0; scale: 0.6; }
.joy-knob.run .fw-run { opacity: 1; scale: 1; }
.joy-knob.run { background-color: rgba(242, 196, 109, 0.3); border-color: var(--gold); box-shadow: 0 0 0 2px var(--gold-soft), 0 0 14px rgba(242, 196, 109, 0.35); }
.joy-knob.run .fw-ico { color: #f6dfa5; }
.joy-knob.press { scale: 0.86; }
.joy-knob.pop { animation: fw-pop 0.3s ease-out; }
@keyframes fw-pop { 0% { scale: 0.86; } 55% { scale: 1.1; } 100% { scale: 1; } }
`;

/** @param knob #joystick .joy-knob — 그 안에 다리 그림을 넣는다 */
export function createFastWalk(knob) {
  let on = false;
  if (!knob) return { get on() { return false; }, set() {}, toggle() {}, press() {}, hit: () => false };
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  knob.innerHTML = LEGS;
  const set = (v) => {
    on = !!v;
    knob.classList.toggle('run', on);
  };
  return {
    get on() {
      return on;
    },
    set,
    /** 톡 눌렀을 때: 바꾸고 튀어나오는 손맛 */
    toggle() {
      set(!on);
      knob.classList.remove('press', 'pop');
      void knob.offsetWidth; // 같은 애니메이션을 다시
      knob.classList.add('pop');
      navigator.vibrate?.(on ? [12, 40, 12] : 10);
    },
    /** 누르고 있는 동안 쏙 들어간다 */
    press(v) {
      knob.classList.toggle('press', !!v);
    },
    /** 이 자리(화면 좌표)가 그랩 위인가 — 손가락 굵기만큼 6px 넉넉히 */
    hit(x, y) {
      const r = knob.getBoundingClientRect();
      return Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) <= r.width / 2 + 6;
    }
  };
}
