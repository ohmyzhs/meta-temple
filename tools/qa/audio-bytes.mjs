// 첫 입장 소리 전송량 — node tools/qa/audio-bytes.mjs   (먼저 python3 .claude/devserver.py 8097, 다른 서버는 BASE=)
// 입장 후 WAIT 초 동안 받은 /assets/audio/ 바이트를 센다 (자연의 소리를 늘려도 첫 입장 전송량이 크게 늘지 않는지).
// DATE=2026-07-15T05:30 처럼 주면 그 날짜·시각으로 들어간다 (?date=)
import { launch, BASE } from './lib.mjs';

const WAIT = +(process.env.WAIT || 45);
const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const got = new Map();
  page.on('response', async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.includes('/assets/audio/')) return;
    const b = await r.body().catch(() => null);
    got.set(u.pathname, (got.get(u.pathname) || 0) + (b ? b.length : 0));
  });
  const q = process.env.DATE ? `&date=${encodeURIComponent(process.env.DATE)}` : '';
  await page.goto(`${BASE}/?q=low${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await page.click('#intro-enter');
  await page.waitForTimeout(WAIT * 1000);
  const info = await page.evaluate(() => {
    const s = window.temple.sound;
    return { loaded: s.recordingsLoaded, decodedMB: s.decodedBytes ? +(s.decodedBytes / 1048576).toFixed(1) : null };
  });
  let sum = 0;
  for (const [p, n] of [...got].sort()) {
    sum += n;
    console.log(`${(n / 1024).toFixed(0).padStart(6)} KB  ${p}`);
  }
  console.log(`합계 ${(sum / 1048576).toFixed(2)} MB (${got.size}개, ${WAIT}초) · 붙은 녹음 ${JSON.stringify(info)}`);
} finally {
  await browser.close();
}
