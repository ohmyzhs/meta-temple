// 앞마당 의식(범종·기와불사·소각)으로 갈 때: 같은 마당 안이면 거리와 상관없이 길을 찾아 걸어가고, 다른 구역에서 부르면 페이드 순간이동인지
//   node tools/qa/court-walk.mjs   (python3 .claude/devserver.py 8095, BASE=http://localhost:8095)
// 사용자 2026-11-08 「마당 안은 걷기」 — 전에는 15m 넘으면 같은 마당 안에서도 순간이동했다 (앞마당 도착 지점에서 범종 18.6m·기와 16.2m)
// 칸마다: 어디서 → 무엇, 순간이동 했는지(_place 호출), 걸린 시간, 다가가 설 자리까지 남은 거리, 의식이 열렸는지(종 치기 / 창)
import { launch, BASE } from './lib.mjs';

const browser = await launch();
let fail = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?q=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
  await page.click('#intro-enter');
  await page.waitForFunction(() => document.querySelector('#intro').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const t = window.temple;
    window.__cw = { jumped: false, done: null };
    const place = t._place.bind(t);
    t._place = (...a) => ((window.__cw.jumped = true), place(...a));
    const bell = t._strikeBell.bind(t);
    t._strikeBell = (...a) => ((window.__cw.done ||= 'bell'), bell(...a));
    const open = t.modals.open.bind(t.modals);
    t.modals.open = (id, ...a) => ((window.__cw.done ||= id), open(id, ...a));
  });
  const SPOTS = { '앞마당 도착(0,3)': [0, 3, Math.PI], '석탑 앞(0,-5)': [0, -5, Math.PI], 범종앞: [11, -12, Math.PI / 2], 기와앞: [-14.4, -4.5, -Math.PI / 2], '숲길(0,34)': [0, 34, Math.PI] };
  const CASES = [
    ['앞마당 도착(0,3)', 'bell_strike', 'walk'],
    ['앞마당 도착(0,3)', 'wish_tile', 'walk'],
    ['앞마당 도착(0,3)', 'burn_worry', 'walk'],
    ['범종앞', 'wish_tile', 'walk'],
    ['기와앞', 'bell_strike', 'walk'],
    ['석탑 앞(0,-5)', 'burn_worry', 'walk'],
    ['숲길(0,34)', 'bell_strike', 'jump']
  ];
  for (const [from, id, want] of CASES) {
    const r = await page.evaluate(async ([at, id]) => {
      const t = window.temple;
      if (t.modals.isOpen) t.modals.close();
      t._place(...at);
      await new Promise((r) => setTimeout(r, 600));
      window.__cw = { jumped: false, done: null };
      const t0 = performance.now();
      t.activate(id);
      while (!window.__cw.done && performance.now() - t0 < 40000) await new Promise((r) => setTimeout(r, 100));
      const a = t._interactable(id).approach, p = t.player.root.position;
      return { jumped: window.__cw.jumped, done: window.__cw.done, sec: +((performance.now() - t0) / 1000).toFixed(1), left: +Math.hypot(p.x - a.x, p.z - a.z).toFixed(2), zone: t.zone };
    }, [SPOTS[from], id]);
    const ok = r.done && r.left < 1 && (want === 'jump') === r.jumped;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${from} → ${id}: ${r.jumped ? '순간이동' : '걸어감'} ${r.sec}초 · 설 자리까지 ${r.left}m · 열림 ${r.done}`);
  }
  await page.evaluate(() => window.temple.modals.isOpen && window.temple.modals.close());
  console.log(`pageerror: ${errors.length ? errors.join(' | ') : '없음'}`);
  await ctx.close();
} finally {
  await browser.close();
}
console.log(fail ? `FAIL (${fail})` : 'court-walk PASS');
