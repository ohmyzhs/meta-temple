/**
 * 미니맵 순간이동 디졸브: 지금 화면을 한 장 떠서 3D 위에 덮고, 옮긴 뒤 새 장면이 실제로 그려지고 나서 그 한 장을 천천히 걷는다
 * — 떠난 자리가 도착한 자리로 녹아든다.
 *
 * 옛 가림막(ui/veil.js, 2026-11-06 「효과가 없다」로 가람 이동에서 뺐다)은 검게 꺼졌다 켜지는 dip 이었다 (tools/qa/map-dissolve.mjs 실측):
 * 0.1~0.9초 검었다가 걷힐 때 첫 0.33초에 70% 가 밝아져 깜빡임처럼 지나갔고, 밤 화면(평균 밝기 37)은 가림막(6.5)과 차이가 작았으며,
 * 모션 줄이기 설정에서는 0.63초 검은 화면이 뚝 끊겼다. 두 장소가 겹쳐 보이는 순간이 없어 이동처럼 읽히지 않았다.
 *
 * 그림을 뜨는 법: 렌더러가 그리기 버퍼를 남기지 않으므로(preserveDrawingBuffer=false) 같은 작업 안에서 한 번 그리고 곧바로 drawImage.
 * 옮긴 직후 첫 렌더가 오래 걸릴 수 있어(CPU 4배 느리게 968ms) 새 장면이 두 번 그려질 때까지는 떠 둔 그림을 그대로 덮어 둔다.
 * 이름표(CSS2DRenderer)는 거리순으로 z-index 를 1..이름표 수로 받으므로 덮개는 그보다 높게 — 새 이름표도 장면과 함께 드러난다.
 * #scene 이 따로 쌓임 맥락(position: fixed)이라 HUD(z-index 10)는 늘 덮개 위.
 */
export const DISSOLVE_MS = 1100;
const MOVED_M = 0.5; // move() 뒤 이만큼도 안 옮겼으면(가까운 쉼터는 걸어간다) 디졸브 없이 걷는다

let el = null, anim = null;

/**
 * move() 를 디졸브로 감싼다. world: TempleScene, where(): 지금 내 자리 {x, z} (옮겼는지 보려고).
 * 끝나면(또는 옮기지 않았으면) 풀리는 Promise.
 */
export function dissolveMove(world, move, where, { ms = DISSOLVE_MS } = {}) {
  const src = world.renderer.domElement;
  if (!el) {
    el = document.createElement('canvas');
    el.id = 'map-dissolve';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;inset:0;z-index:100000;width:100%;height:100%;pointer-events:none';
    src.parentElement.appendChild(el);
  }
  anim?.cancel();
  el.width = src.width;
  el.height = src.height;
  world.render();
  el.getContext('2d').drawImage(src, 0, 0);
  el.style.opacity = '1';
  el.hidden = false;
  const a = where();
  const from = { x: a.x, z: a.z };
  try {
    move();
  } catch (e) {
    done(); // 덮개가 장면 위에 굳지 않게
    throw e;
  }
  const b = where();
  if (Math.hypot(b.x - from.x, b.z - from.z) < MOVED_M) return done(), Promise.resolve(false);
  return new Promise((resolve) => {
    let n = 0;
    const wait = () => {
      if (++n < 3) return requestAnimationFrame(wait); // 옮긴 뒤 본 루프가 새 장면을 두 번 그릴 때까지
      anim = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' });
      anim.onfinish = () => (done(), resolve(true));
      anim.oncancel = () => resolve(true);
    };
    requestAnimationFrame(wait);
  });
}

function done() {
  el.hidden = true;
  anim?.cancel(); // 끝난 애니메이션의 fill 이 남아 있으면 다음 디졸브의 덮개를 투명하게 붙잡는다 (숨긴 뒤에 지워 깜빡이지 않게)
  anim = null;
  el.width = el.height = 0; // 떠 둔 그림 메모리를 돌려준다
}
