/**
 * 스크롤 막대 없이 넘치는 쪽 가장자리만 부드럽게 흐리게 — 시트(.sheet)에 쓴다.
 * 위로 더 있으면 .fade-top, 아래로 더 있으면 .fade-bottom (모양은 styles.css 의 ::before / ::after).
 */
export function scrollFade(el) {
  const update = () => {
    const max = el.scrollHeight - el.clientHeight;
    el.classList.toggle('fade-top', el.scrollTop > 2);
    el.classList.toggle('fade-bottom', max - el.scrollTop > 2);
  };
  el.addEventListener('scroll', update, { passive: true });
  // 열릴 때(숨김 → 보임)·화면 크기·안의 내용 크기가 바뀔 때
  const ro = new ResizeObserver(update);
  ro.observe(el);
  for (const c of el.children) ro.observe(c);
  update();
  return update;
}
