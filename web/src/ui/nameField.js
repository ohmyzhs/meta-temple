/**
 * 법명 직접 짓기 칸 — 입장 화면과 수행 기록 창이 함께 쓴다.
 * 쓰는 동안 거름(core/moderation.js) 결과를 한 줄로 알려 주고, 정하면 onSubmit(정리된 이름).
 */
import { checkText, NAME_MIN, NAME_MAX } from '../core/moderation.js';

export const NAME_PLACEHOLDER = `법명을 지어 주세요 (${NAME_MIN}~${NAME_MAX}자)`;

/** 입력값 → { ok, text?, message } (빈 칸이면 null) */
export function nameFeedback(value) {
  if (!String(value ?? '').trim()) return null;
  const r = checkText(value, { kind: 'name' });
  return r.ok ? { ok: true, text: r.text, message: '좋은 법명입니다' } : r;
}

/**
 * <form> 안의 input·[data-hint] 를 묶는다.
 * onSubmit(text) 이 { ok:false, message } 를 돌려주면 그 말을 보여 준다.
 */
export function bindNameForm(form, onSubmit) {
  const input = form.querySelector('input');
  const hint = form.querySelector('[data-hint]');
  input.maxLength = NAME_MAX + 4; // 앞뒤 공백까지 받아 두고 판정은 거름이 한다
  input.placeholder = NAME_PLACEHOLDER;
  const show = () => {
    const r = nameFeedback(input.value);
    hint.textContent = r ? r.message : '';
    form.classList.toggle('is-bad', !!r && !r.ok);
    return r;
  };
  input.addEventListener('input', show);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = show();
    if (!r?.ok) return input.focus();
    const res = onSubmit(r.text);
    if (res && res.ok === false) {
      hint.textContent = res.message;
      form.classList.add('is-bad');
    }
  });
  return { input, reset: () => ((input.value = ''), show()) };
}
