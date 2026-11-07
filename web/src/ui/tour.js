/**
 * 둘러보기 안내 (튜토리얼) — 메뉴 › 안내 › 둘러보기 에서만 연다. 처음 들어올 때 저절로 띄우지 않는다.
 * 한 단계씩 HUD 의 한 곳을 비추고(나머지는 어둡게) 옆에 설명 카드. 건너뛰기 · 이전 · 다음.
 * 떠 있는 동안 화면 누르기·키(WASD·숫자)는 산사로 새지 않는다. Esc·뒤로가기로 닫는다 (main.js _closeTop).
 * 글은 data/guide.js TOUR_STEPS.
 */
import { TOUR_STEPS } from '../data/guide.js';

const PAD = 8; // 비추는 테두리와 대상 사이
const GAP = 14; // 카드와 비춘 곳 사이

export function createTour() {
  let el = null;
  let i = 0;
  const touch = () => matchMedia('(pointer: coarse)').matches;
  const pick = (v) => (v && typeof v === 'object' ? v[touch() ? 'touch' : 'mouse'] : v);

  function target(step) {
    const sel = pick(step.target);
    const t = sel && document.querySelector(sel);
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(t).visibility !== 'hidden' ? r : null;
  }

  function place() {
    if (!el) return;
    const step = TOUR_STEPS[i];
    const hole = el.querySelector('.tour-hole');
    const card = el.querySelector('.tour-card');
    const vw = innerWidth, vh = innerHeight;
    const r = target(step);
    el.classList.toggle('no-target', !r);
    card.style.top = card.style.bottom = card.style.left = '';
    const cw = Math.min(360, vw - 32);
    card.style.width = `${cw}px`;
    if (!r) {
      card.style.left = `${(vw - cw) / 2}px`;
      card.style.top = `${Math.max(16, (vh - card.offsetHeight) / 2)}px`;
      return;
    }
    // 화면 가장자리에 붙은 것(독·상태판)도 테두리가 잘리지 않게 화면 안으로
    const x0 = Math.max(2, r.left - PAD), y0 = Math.max(2, r.top - PAD);
    const x1 = Math.min(vw - 2, r.right + PAD), y1 = Math.min(vh - 2, r.bottom + PAD);
    Object.assign(hole.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
    const cx = r.left + r.width / 2;
    card.style.left = `${Math.min(vw - cw - 16, Math.max(16, cx - cw / 2))}px`;
    // 대상이 위쪽 절반이면 아래에, 아니면 위에. 들어갈 자리가 없으면 반대쪽
    const below = r.top + r.height / 2 < vh / 2;
    const h = card.offsetHeight;
    if (below && r.bottom + PAD + GAP + h <= vh - 8) card.style.top = `${r.bottom + PAD + GAP}px`;
    else if (!below && r.top - PAD - GAP - h >= 8) card.style.top = `${r.top - PAD - GAP - h}px`;
    else card.style.top = `${below ? Math.max(8, r.top - PAD - GAP - h) : Math.min(vh - h - 8, r.bottom + PAD + GAP)}px`;
  }

  function render() {
    const step = TOUR_STEPS[i];
    const extra = step.extra ? pick(step.extra) : '';
    el.querySelector('.tour-step').textContent = `${i + 1} / ${TOUR_STEPS.length}`;
    el.querySelector('.tour-title').textContent = step.title;
    el.querySelector('.tour-body').innerHTML = `${pick(step.body)}${extra ? ` ${extra}` : ''}`; // 우리가 쓴 글만 (guide.js)
    el.querySelector('[data-tour="prev"]').disabled = i === 0;
    el.querySelector('[data-tour="next"] .lbl').textContent = i === TOUR_STEPS.length - 1 ? '마치기' : '다음';
    el.querySelector('.tour-dots').innerHTML = TOUR_STEPS.map((_, n) => `<span${n === i ? ' class="on"' : ''}></span>`).join('');
    place();
    el.querySelector('[data-tour="next"]').focus({ preventScroll: true });
  }

  const go = (d) => {
    const n = i + d;
    if (n < 0) return;
    if (n >= TOUR_STEPS.length) return close();
    i = n;
    render();
  };

  /** 산사 단축키(WASD·숫자·E·V)로 새지 않게. 단추 사이 Tab·누르기(Enter·Space)는 그대로 */
  function onKey(e) {
    e.stopPropagation();
    const act = { Escape: close, ArrowRight: () => go(1), ArrowLeft: () => go(-1) }[e.key];
    if (act || !['Tab', 'Enter', ' '].includes(e.key)) e.preventDefault();
    act?.();
  }

  function open() {
    if (el) return;
    i = 0;
    el = document.createElement('div');
    el.id = 'tour';
    el.className = 'tour';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '둘러보기 안내');
    el.innerHTML = `
      <div class="tour-hole" aria-hidden="true"></div>
      <div class="tour-card">
        <p class="tour-head"><span class="tour-step"></span><span class="tour-dots" aria-hidden="true"></span></p>
        <h2 class="tour-title"></h2>
        <p class="tour-body" aria-live="polite"></p>
        <div class="tour-acts">
          <button class="ctl tour-skip" type="button" data-tour="skip"><span class="lbl">건너뛰기</span></button>
          <span class="tour-gap"></span>
          <button class="ctl tour-btn" type="button" data-tour="prev"><span class="lbl">이전</span></button>
          <button class="ctl tour-btn primary" type="button" data-tour="next"><span class="lbl">다음</span></button>
        </div>
      </div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tour]');
      if (!b) return;
      if (b.dataset.tour === 'skip') close();
      else go(b.dataset.tour === 'next' ? 1 : -1);
    });
    // 어두운 곳을 눌러도 산사가 움직이지 않게 (걷기·시점 돌리기)
    for (const t of ['pointerdown', 'pointerup', 'touchstart', 'wheel', 'contextmenu']) el.addEventListener(t, (e) => e.stopPropagation(), { passive: t !== 'contextmenu' });
    document.body.appendChild(el);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    render();
  }

  function close() {
    if (!el) return;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    el.remove();
    el = null;
  }

  return { open, close, get active() { return !!el; } };
}
