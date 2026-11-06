/**
 * 화면이 꺼져도 계속 듣기 (사용자 2026-11-06: ASMR 이 목적이니 폰 화면이 꺼지거나 크롬을 뒤로 보내도 소리가 이어져야 한다.
 * 옵션으로 끄고 켜며 기본은 켬. 다른 소리·전화가 오면 양보하고, 끝나면 스스로 이어진다. 예불 연속 듣기에는 꼭).
 *
 * 플랫폼별로 소리를 살려 두는 길 (공개 문서·버그 기록 기준, 실기기 확인은 따로):
 *  - 안드로이드 크롬: Web Audio 만으로는 미디어 알림·오디오 포커스가 생기지 않는다 (Chrome for Developers, Media Session).
 *    5초 넘는 <audio> 를 함께 틀면 알림이 생겨 일반 음악처럼 화면이 꺼져도 이어지고, 전화·유튜브가 포커스를 가져가면
 *    크롬이 그 <audio> 를 멈췄다가(일시적이면) 다시 튼다. 그 멈춤·재생을 신호로 우리 소리 전체를 내렸다 올린다.
 *    → 소리 없는 20초 반복 파일(assets/audio/keepalive.mp3)을 '닻'으로 튼다.
 *  - iOS 사파리: navigator.audioSession.type = 'playback' 이면 잠금 중에도 Web Audio 가 멈추지 않는다 (iOS 17.5 에서
 *    WebKit 버그 261554 가 고쳐졌다는 보고). 전화가 오면 AudioContext 가 'interrupted' 가 되었다가 돌아온다.
 *  - 화면이 꺼진 동안 setInterval 은 크게 늦춰지므로 소리 예약은 워커 타이머로 돌리고, 미리 예약하는 시간을 늘린다.
 */
export const isAndroid = /Android/i.test(navigator.userAgent);
export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** 워커 안의 타이머로 fn 을 부른다 (숨은 탭에서도 덜 늦춰진다). 워커를 못 쓰면 setInterval */
export function startTicker(fn, ms) {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = () => fn();
    return { stop: () => w.terminate() };
  } catch {
    const id = setInterval(fn, ms);
    return { stop: () => clearInterval(id) };
  }
}

/** iOS 오디오 세션 종류: 켜면 'playback'(잠금 중에도 재생, 무음 스위치 무시, 다른 앱 음악은 멈춤), 끄면 'auto' */
export function applySession(on) {
  const s = navigator.audioSession;
  if (!s) return;
  try {
    s.type = on ? 'playback' : 'auto';
  } catch (e) {
    console.warn('[background] audioSession', e);
  }
}

/** 잠금화면·알림의 조작 단추. handlers: { play, pause, stop, nexttrack, previoustrack } (null 이면 단추를 뺀다) */
export function setMediaActions(handlers) {
  if (!('mediaSession' in navigator)) return;
  for (const [action, h] of Object.entries(handlers)) {
    try {
      navigator.mediaSession.setActionHandler(action, h || null);
    } catch {
      /* 이 브라우저가 모르는 동작 */
    }
  }
}

/** art: assets/covers/<art>-256|512.jpg (게임 안 장면을 찍어 만든 표지 — 없으면 잠금화면에 크롬 로고·빈 그림이 뜬다) */
export function setNowPlaying(title, artist, art = 'forest') {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  const artwork = [256, 512].map((n) => ({ src: new URL(`./assets/covers/${art}-${n}.jpg`, location.href).href, sizes: `${n}x${n}`, type: 'image/jpeg' }));
  navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album: '청연산사 · 입체 ASMR', artwork });
}

export function setPlaybackState(state) {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state;
}
