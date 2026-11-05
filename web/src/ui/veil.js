/**
 * 화면 전환 가림막 (#listen-veil 재사용): 어두워진 뒤 fn, 그리고 천천히 걷힌다.
 * 예불 듣기 장면 바꾸기·가람 이동·산문/법당 문턱 넘기가 함께 쓴다.
 * 새 가림막이 앞의 것이 아직 fn 을 부르기 전에 오면 앞의 fn 은 버린다 (마지막 전환만 남는다) — 그 Promise 는 끝나지 않는다.
 * 어두워지는 데 0.55초, 걷히는 데 1.4초 (styles.css #listen-veil).
 */
let timer = 0;

export function veil(fn, { hold = 600 } = {}) {
  const v = document.querySelector('#listen-veil');
  v.classList.add('on');
  clearTimeout(timer);
  return new Promise((resolve) => {
    timer = setTimeout(() => {
      fn();
      setTimeout(() => v.classList.remove('on'), 60);
      resolve();
    }, hold);
  });
}

/** 가림막이 내려와 있거나 내려오는 중인가 */
export const veiling = () => !!document.querySelector('#listen-veil')?.classList.contains('on');
