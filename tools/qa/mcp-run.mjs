// Playwright MCP 형식(`async (page) => {...}`) QA 스크립트를 헤드리스로 돌린다 — 사용자 Chrome·MCP 브라우저를 쓰지 않는다.
//   BASE=http://localhost:8093 node tools/qa/mcp-run.mjs tools/qa/night.mjs
// 스크립트 안의 http://localhost:808x 는 BASE 로 바꾸고, 먼저 BASE 를 열어 둔다 (night.mjs 는 열린 탭의 주소를 쓴다).
// 스크린샷 상대 경로(.playwright-mcp/...)는 지금 폴더 기준.
import { readFileSync, mkdirSync } from 'node:fs';
import { launch, BASE } from './lib.mjs';

const file = process.argv[2];
const src = readFileSync(file, 'utf8').replace(/http:\/\/localhost:80\d\d/g, BASE);
const fn = (0, eval)(`(${src.slice(src.indexOf('async (page)')).trim().replace(/;?\s*$/, '')})`);
for (const m of src.matchAll(/(?:OUT|path:\s*`)\s*=?\s*'?(\.playwright-mcp\/[\w/-]+)/g)) mkdirSync(m[1], { recursive: true });
if (process.env.NIGHT_HOURS) globalThis.NIGHT_HOURS = process.env.NIGHT_HOURS.split(',').map(Number); // night.mjs: 잴 시각만
const browser = await launch();
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' })).newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  const out = await fn(page);
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
} finally {
  await browser.close();
}
