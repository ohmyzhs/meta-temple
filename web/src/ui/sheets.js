/**
 * HUD 시트(메뉴·장소·더보기와 그 하위 설정) 열림 상태.
 * 한 번에 하나만 보인다. data-parent 가 있는 하위 시트는 부모 위에 쌓여, 닫으면(뒤로가기·‹) 부모로 돌아간다.
 * 여는 단추는 aria-controls 로 시트를 가리키고, aria-expanded 가 열림을 따라간다.
 */
const stack = [];

function sync() {
  const top = stack.at(-1);
  for (const s of document.querySelectorAll('.sheet')) s.classList.toggle('hidden', s.id !== top);
  for (const b of document.querySelectorAll('[aria-controls]')) {
    const id = b.getAttribute('aria-controls');
    if (document.getElementById(id)?.classList.contains('sheet')) b.setAttribute('aria-expanded', String(stack.includes(id)));
  }
}

export function openSheet(id) {
  const parent = document.getElementById(id)?.dataset.parent;
  const at = parent ? stack.indexOf(parent) : -1;
  stack.splice(at + 1, stack.length, id); // 부모가 열려 있으면 그 위에, 아니면 새로
  sync();
}

/** 이미 맨 위에 열려 있으면 모두 닫고, 아니면 연다 */
export function toggleSheet(id) {
  if (stack.at(-1) === id) closeAll();
  else openSheet(id);
}

/** 맨 위 시트 하나를 닫는다. 닫은 것이 있으면 true */
export function closeTop() {
  if (!stack.length) return false;
  stack.pop();
  sync();
  return true;
}

export function closeAll() {
  if (!stack.length) return;
  stack.length = 0;
  sync();
}

export const hasOpen = () => stack.length > 0;
