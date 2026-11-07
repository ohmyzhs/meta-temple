/** 브라우저가 이미지 파일을 기기의 공유 창으로 넘길 수 있는지 확인한다. */
export function canShareImage(file, nav = navigator) {
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try { return nav.canShare({ files: [file] }); } catch { return false; }
}

/** 공유 창은 사용자 동작이 살아 있을 때만 연다. 실패하면 다시 누를 수 있는 미리보기로 보낸다. */
export async function shareImage(file, nav = navigator) {
  if (!canShareImage(file, nav)) return 'unavailable';
  if (nav.userActivation?.isActive === false) return 'activation-required';
  try {
    await nav.share({ files: [file], title: '소리사원 풍경' });
    return 'shared';
  } catch (error) {
    return error?.name === 'AbortError' ? 'cancelled' : 'unavailable';
  }
}
