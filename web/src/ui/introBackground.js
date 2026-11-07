/** 움직이는 대문과 대문 전용 소리. 산사 안의 소리 설정과 저장소는 건드리지 않는다. */
export function createIntroBackground() {
  const video = document.querySelector('#intro-video');
  const motion = document.querySelector('#intro-motion');
  const edge = document.querySelector('#intro-edge');
  const sign = document.querySelector('#intro-sign');
  const audio = document.querySelector('#intro-audio');
  const button = document.querySelector('#intro-sound');
  const portrait = matchMedia('(max-width: 600px), (orientation: portrait)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const audioKey = 'meta_temple_intro_audio_v1';
  let wanted = true;
  try { wanted = localStorage.getItem(audioKey) !== 'off'; } catch { /* 저장소가 막혀도 대문은 열린다 */ }
  let active = true, stopTimer = null, animation = null, source = '';

  function syncButton() {
    const playing = active && !audio.paused && !audio.ended;
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-label', `대문 배경 소리 ${playing ? '끄기' : '켜기'}`);
    button.querySelector('span').textContent = playing ? '소리 끄기' : '소리 켜기';
  }
  async function playAudio() {
    if (!active || !wanted || document.hidden) return;
    try {
      await audio.play();
      if (!active || !wanted || document.hidden) audio.pause();
    } catch { /* 브라우저가 자동 재생을 막으면 소리 켜기 단추로 시작한다 */ }
    syncButton();
  }
  button.addEventListener('click', () => {
    wanted = audio.paused;
    try { localStorage.setItem(audioKey, wanted ? 'on' : 'off'); } catch { /* 이 방문 동안은 유지 */ }
    if (wanted) playAudio();
    else { audio.pause(); syncButton(); }
  });
  // 자동 재생이 차단되더라도 방문자의 첫 대문 조작에서 기본 소리를 시작한다.
  // 소리 단추와 입장 단추는 각자의 동작이 끝난 뒤 재생을 다시 켜지 않게 제외한다.
  document.addEventListener('click', (event) => {
    if (!event.isTrusted || !active || !wanted || !audio.paused) return;
    if (event.target instanceof Element && event.target.closest('#intro-sound, #intro-enter')) return;
    playAudio();
  });
  for (const name of ['play', 'pause', 'ended', 'error']) audio.addEventListener(name, syncButton);

  function align() {
    const hidden = !video.videoWidth || !video.videoHeight;
    edge.hidden = sign.hidden = hidden;
    if (hidden) return;
    const m = portrait.matches;
    const edgeArea = m ? { x: 420, y: 0, w: 150, h: 1920 } : { x: 1106, y: 0, w: 150, h: 1080 };
    const signArea = m ? { x: 450, y: 380, w: 600, h: 1040 } : { x: 1160, y: 135, w: 420, h: 730 };
    const w = motion.clientWidth, h = motion.clientHeight;
    const s = Math.max(w / video.videoWidth, h / video.videoHeight);
    const place = (node, box) => Object.assign(node.style, {
      left: `${(w - video.videoWidth * s) / 2 + box.x * s}px`,
      top: `${(h - video.videoHeight * s) / 2 + box.y * s}px`,
      width: `${box.w * s}px`, height: `${box.h * s}px`
    });
    place(edge, edgeArea);
    place(sign, signArea);
  }
  function animate() {
    const previousTime = animation?.currentTime ?? 0;
    animation?.cancel();
    animation = null;
    motion.style.transform = 'none';
    align();
    if (!active || reduced.matches) return;
    const s = portrait.matches ? 1.75 : 1.5;
    const focus = portrait.matches ? .69 : .71;
    // 확대 후에도 화면 끝에 영상 밖의 빈 영역이 나타나지 않게 한다.
    const x = Math.max(-motion.clientWidth * (s - 1) / 2, -(focus - .5) * s * motion.clientWidth);
    animation = motion.animate(
      [{ transform: 'translate(0px, 0px) scale(1)' }, { transform: `translate(${x}px, 0px) scale(${s})` }],
      { duration: 15000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }
    );
    animation.currentTime = previousTime;
  }
  function setSource() {
    const m = portrait.matches, next = m ? 'mobile' : 'desktop';
    if (source === next) return;
    source = next;
    edge.hidden = sign.hidden = true;
    edge.src = `./assets/entrance/${next}-edge-v1.webp`;
    sign.src = `./assets/entrance/${next}-sign-v1.webp`;
    video.poster = `./assets/entrance/${next}-poster-v1.webp`;
    video.src = `./assets/entrance/temple-${next}-v1.mp4`;
    video.load();
    if (active && !document.hidden && !reduced.matches) video.play().catch(() => {});
    animate();
  }
  video.addEventListener('loadedmetadata', align);
  portrait.addEventListener('change', setSource);
  reduced.addEventListener('change', () => {
    animate();
    if (reduced.matches) video.pause();
    else if (active && !document.hidden) video.play().catch(() => {});
  });
  addEventListener('resize', animate);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { video.pause(); audio.pause(); syncButton(); }
    else if (active) {
      if (!reduced.matches) video.play().catch(() => {});
      playAudio();
    }
  });
  setSource();
  syncButton();
  playAudio();
  return {
    leave() {
      active = false;
      audio.pause();
      syncButton();
      clearTimeout(stopTimer);
      // 대문이 사라지는 동안 마지막 화면이 갑자기 정지하지 않게 한다.
      stopTimer = setTimeout(() => { video.pause(); animation?.pause(); }, 1400);
    },
    show() {
      active = true;
      clearTimeout(stopTimer);
      animate();
      if (!document.hidden && !reduced.matches) video.play().catch(() => {});
      playAudio();
    }
  };
}
