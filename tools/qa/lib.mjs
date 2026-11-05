// 헤드리스 QA 공용 도구 — 프로젝트에 의존성을 더하지 않으려고 전역 @playwright/mcp 에 딸린 playwright 를 쓴다.
// 다른 playwright 를 쓰려면 PW=/path/to/playwright/index.mjs, 다른 서버는 BASE=http://localhost:8080
import { execSync } from 'node:child_process';

export const BASE = process.env.BASE || 'http://localhost:8081';
export const VIEWPORTS = [[360, 780], [390, 844], [430, 932], [844, 390], [820, 1180], [1280, 800]];

export async function launch() {
  const pw = process.env.PW || `${execSync('npm root -g').toString().trim()}/@playwright/mcp/node_modules/playwright/index.mjs`;
  const { chromium } = await import(pw);
  return chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
}

/**
 * 뷰포트 하나로 열고 실제 클릭으로 산문에 들어선다 (사용자 활성화가 있어야 뒤로가기 방어가 쌓인다). 너비 1000 미만은 터치 기기로 본다.
 * prev: 먼저 열어 둘 이전 페이지. fresh: 링크로 새 탭을 연 것처럼 방문 기록이 산사 하나뿐인 탭 (보통 newPage 는 about:blank 항목을 남긴다)
 */
export async function enter(browser, [w, h], { prev, scale = 1, init, fresh = false } = {}) {
  const touch = w < 1000;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, hasTouch: touch, isMobile: touch, locale: 'ko-KR' });
  if (init) await ctx.addInitScript(init);
  let page = await ctx.newPage();
  if (fresh) {
    const cdp = await ctx.newCDPSession(page);
    const { browserContextId } = (await cdp.send('Target.getTargetInfo')).targetInfo;
    const opened = ctx.waitForEvent('page');
    await cdp.send('Target.createTarget', { url: `${BASE}/?q=low`, browserContextId });
    const blank = page;
    page = await opened;
    await blank.close();
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (prev) await page.goto(prev);
  if (fresh) await page.waitForLoadState('domcontentloaded');
  else await page.goto(`${BASE}/?q=low`, { waitUntil: 'domcontentloaded' }); // 'load' 은 외부 글꼴이 늦으면 30초를 넘기기도 한다
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await page.click('#intro-enter');
  await page.waitForFunction(() => document.querySelector('#intro').classList.contains('hidden'), null, { timeout: 8000 });
  return { ctx, page, touch, errors };
}

export const fmt = (n, d = 1) => Number(n).toFixed(d);
