// 소리 받는 양 — node tools/qa/audio-bytes.mjs   (먼저 python3 .claude/devserver.py 8097, 다른 서버는 BASE=)
// 1) 산문(첫 자리)에서 들리는 소리가 모두 켜질 때까지 받은 것 — 입장 버튼은 소리를 기다리지 않는다
// 2) 그 뒤 걷는 동안 뒤에서 조용히 받아 두는 나머지 전부 (압축본)
// 3) 마당으로 들어가면 새로 받는 것 — 다 받아 두었으니 0 이어야 한다 (재생은 자리를 따라)
// DATE=2026-07-15T05:30 처럼 주면 그 날짜·시각(한국)으로 들어간다 (?date=)
import { launch, BASE } from './lib.mjs';

const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
  const page = await ctx.newPage();
  let got = [];
  page.on('response', async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.includes('/assets/audio/')) return;
    const b = await r.body().catch(() => null);
    got.push([u.pathname.replace('/assets/audio/', ''), b ? b.length : 0]);
  });
  const q = process.env.DATE ? `&date=${encodeURIComponent(process.env.DATE)}` : '';
  await page.goto(`${BASE}/?q=low${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  const before = got.length;
  await page.click('#intro-enter');
  // 들려야 할 배경이 모두 켜지고 받는 중인 것이 없을 때까지
  const settled = () =>
    page.waitForFunction(() => {
      const e = window.temple.sound;
      if (!e._nbeds) return false;
      const busy = e._nbeds.some((b) => b.pending || (!b.on && b.layer.level.gain._target * (b.layer.panner?._bus === 'temple' ? 1 : e.natureZone.gain._target) > 0.006 && e._pool(b.def).length));
      // 산문 소리: 들려야 할 배경이 다 켜지고 돌풍·범종을 받았을 때 (뒤에서 받는 나머지는 세지 않는다)
      return !busy && e._shotsQueued && e.rec.gust && e.rec.bell;
    }, null, { timeout: 60000, polling: 500 }).catch(() => null);
  await page.evaluate(() => {
    // 받는 줄이 비었는지 보이게 (QA 용)
    const e = window.temple.sound;
    const d = e._decode.bind(e);
    let n = 0;
    e._decode = async (f) => {
      e._busyNet = ++n;
      try {
        return await d(f);
      } finally {
        if (!--n) e._busyNet = 0;
      }
    };
  });
  await settled();
  const sum = (rows) => (rows.reduce((s, [, n]) => s + n, 0) / 1048576).toFixed(2);
  const entry = got.slice(before);
  const info = await page.evaluate(() => ({ on: window.temple.sound._nbeds.filter((b) => b.on).map((b) => b.name), mb: +(window.temple.sound.decodedBytes / 1048576).toFixed(1) }));
  console.log(`${process.env.DATE || '지금'}  산문: ${sum(entry)} MB ${entry.length}개 (켜진 배경 ${info.on.join(',')} · 풀어 둔 ${info.mb} MB)`);
  if (!process.env.QUIET) for (const [p, n] of entry) console.log(`   ${(n / 1024).toFixed(0).padStart(5)} KB  ${p}`);
  // 뒤에서 나머지 전부
  got = [];
  await page.waitForFunction(() => window.temple.sound._idleDone && !window.temple.sound._inflight?.size, null, { timeout: 180000, polling: 500 }).catch(() => null);
  const pk = await page.evaluate(() => ({ n: window.temple.sound._packed.size, mb: +([...window.temple.sound._packed.values()].reduce((s, b) => s + b.byteLength, 0) / 1048576).toFixed(1) }));
  console.log(`   뒤에서 더 받음: ${sum(got)} MB ${got.length}개 · 받아 둔 압축본 ${pk.n}개 ${pk.mb} MB`);
  // 마당으로
  got = [];
  await page.evaluate(() => window.temple._teleport(0, 0, Math.PI));
  await page.waitForTimeout(2000);
  await settled();
  await page.waitForTimeout(1500);
  console.log(`   마당에 들어서며 더 받음: ${sum(got)} MB ${got.length}개 — ${got.map(([p]) => p.replace('nature/', '').replace(/\.(m4a|mp3)$/, '')).join(', ')}`);
} finally {
  await browser.close();
}
