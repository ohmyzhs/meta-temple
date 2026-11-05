// HUD 오작동·크기·가림 검사 — node tools/qa/hud.mjs   (먼저 python3 .claude/devserver.py 8081)
// 기준 (계획서 B2):
//  · 누르는 것(#hud 안 button·input) 모두 48×48 이상, 서로 겹치지 않고, 닫힌 상태에서 화면 밖으로 나가지 않음
//  · 모든 단추: user-select none · touch-action manipulation · 탭 강조 투명 · CSS 에 -webkit-touch-callout none
//  · 길게 누르기·세 번 누르기 뒤 getSelection() 이 빈 문자열
//  · 가림 비율 = #hud 안에서 보이는 '면'(배경·테두리 흐림이 있는 요소, 단추, 입력, 조이스틱)이 덮는 화면 영역의 합집합 / 화면 넓이
//    (2px 격자 표본, 모서리 둥글림 무시 — 실제보다 조금 크게 잰다. 토스트는 잠깐 뜨므로 뺀다). 세로 폰 ≤ 18%
//  · 시트(메뉴·장소·더보기·시간날씨·소리·내 모습)를 하나씩 열어 그 안의 단추도 같은 크기·겹침 검사
import { launch, enter, VIEWPORTS, fmt, BASE } from './lib.mjs';

const MIN = 48;
const COVER_MAX = 0.18;
const only = process.env.ONLY?.split(',');
const SHEETS = [
  ['#menu-btn', '#menu-sheet'],
  ['#place-btn', '#place-sheet'],
  ['#more-btn', '#more-sheet'],
  ['#menu-btn', '#menu-sheet [data-sheet="pop-env"]', '#pop-env'],
  ['#menu-btn', '#menu-sheet [data-sheet="pop-sound"]', '#pop-sound'],
  ['#menu-btn', '#menu-sheet [data-sheet="pop-self"]', '#pop-self']
];

/** 페이지 안에서: scope 안의 보이는 단추·입력 */
function controls(scope) {
  const vw = innerWidth, vh = innerHeight;
  const root = document.querySelector(scope);
  if (!root) return null;
  return [...root.querySelectorAll('button, input, [role="button"]')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const name = el.id ? '#' + el.id : (el.getAttribute('aria-label') || el.textContent.trim() || el.className).slice(0, 14);
      return {
        name, x: r.x, y: r.y, w: r.width, h: r.height,
        off: r.x < -0.5 || r.y < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5,
        style: [cs.userSelect === 'none' || cs.webkitUserSelect === 'none' ? '' : 'user-select', cs.touchAction === 'manipulation' || el.type === 'range' ? '' : 'touch-action',
          /rgba\(0, 0, 0, 0\)|transparent/.test(cs.webkitTapHighlightColor) ? '' : 'tap-highlight'].filter(Boolean)
      };
    });
}

function coverage() {
  const vw = innerWidth, vh = innerHeight;
  const rects = [];
  for (const el of document.querySelectorAll('#hud, #hud *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const bg = cs.backgroundColor;
    const surface = (bg && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(bg)) || cs.backgroundImage !== 'none' || (cs.backdropFilter && cs.backdropFilter !== 'none') ||
      /^(BUTTON|INPUT)$/.test(el.tagName) || el.id === 'joystick';
    if (surface) rects.push([Math.max(0, r.left), Math.max(0, r.top), Math.min(vw, r.right), Math.min(vh, r.bottom)]);
  }
  let hit = 0, all = 0;
  for (let y = 1; y < vh; y += 2) for (let x = 1; x < vw; x += 2) {
    all++;
    for (const [a, b, c, d] of rects) if (x >= a && x < c && y >= b && y < d) { hit++; break; }
  }
  return hit / all;
}

const overlaps = (list) => {
  const out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ix > 0.5 && iy > 0.5) out.push(`${a.name}∩${b.name}`);
  }
  return out;
};
const small = (list) => list.filter((c) => c.w < MIN - 0.01 || c.h < MIN - 0.01).map((c) => `${c.name} ${fmt(c.w, 0)}×${fmt(c.h, 0)}`);
const minOf = (list) => (list.length ? `${fmt(Math.min(...list.map((c) => c.w)), 0)}×${fmt(Math.min(...list.map((c) => c.h)), 0)}` : '-');

async function reset(page) {
  await page.evaluate(async () => {
    getSelection().removeAllRanges();
    window.temple.modals.close();
    try { (await import('./src/ui/sheets.js')).closeAll(); } catch {}
  });
  await page.waitForTimeout(80);
}

const css = await (await fetch(`${BASE}/src/styles.css`)).text();
const calloutRule = /\.ctl[^{]*\{[^}]*-webkit-touch-callout:\s*none/.test(css) && /\.hud[^{]*\{[^}]*-webkit-touch-callout:\s*none/.test(css);

const browser = await launch();
let failed = 0;
const fail = (cond) => (cond ? (failed++, '✗') : '✓');
console.log(`CSS -webkit-touch-callout:none (.ctl, .hud) ${fail(!calloutRule)}`);

for (const vp of VIEWPORTS) {
  const [w, h] = vp;
  if (only && !only.includes(`${w}x${h}`)) continue;
  const { ctx, page, touch, errors } = await enter(browser, vp);
  await page.waitForTimeout(600);
  const portraitPhone = touch && w < 600 && h > w;
  console.log(`\n${w}x${h}${touch ? ' 터치' : ''}`);

  // 닫힌 상태
  const list = await page.evaluate(controls, '#hud');
  const cover = await page.evaluate(coverage);
  const sm = small(list), ov = overlaps(list), off = list.filter((c) => c.off).map((c) => c.name), st = list.filter((c) => c.style.length).map((c) => `${c.name}(${c.style})`);
  console.log(`  닫힘  단추 ${list.length} · 최소 ${minOf(list)} ${fail(sm.length)} 48미만 ${sm.length}${sm.length ? ' [' + sm.join(', ') + ']' : ''}`);
  console.log(`        겹침 ${ov.length} ${fail(ov.length)}${ov.length ? ' [' + ov.join(', ') + ']' : ''} · 화면 밖 ${off.length} ${fail(off.length)}${off.length ? ' [' + off.join(', ') + ']' : ''} · 스타일 누락 ${st.length} ${fail(st.length)}${st.length ? ' [' + st.slice(0, 6).join(', ') + ']' : ''}`);
  console.log(`        가림 ${fmt(cover * 100)}%${portraitPhone ? ` (기준 ≤ ${COVER_MAX * 100}%) ${fail(cover > COVER_MAX)}` : ' (참고)'}`);

  // 근처 신행 안내(#prompt)가 떴을 때도 겹침·크기
  await page.evaluate(() => {
    const t = window.temple, it = t.temple.interactables.find((i) => i.id === 'stone_pagoda');
    const a = it.approach || it.pos;
    t.avatars.teleport(a.x, a.z, a.ry ?? 0);
  });
  await page.waitForFunction(() => !document.querySelector('#prompt').classList.contains('hidden'), null, { timeout: 4000 }).catch(() => {});
  const withPrompt = await page.evaluate(controls, '#hud');
  const pOv = overlaps(withPrompt), pSm = small(withPrompt.filter((c) => c.name === '#prompt'));
  console.log(`  안내  #prompt ${withPrompt.some((c) => c.name === '#prompt') ? 'on' : 'off'} · 48미만 ${pSm.length} ${fail(pSm.length)} · 겹침 ${pOv.length} ${fail(pOv.length)}${pOv.length ? ' [' + pOv.join(', ') + ']' : ''}`);

  // 신행이 둘인 구역(독이 가장 붐빔)에서도 크기·겹침·화면 밖
  for (const z of ['COURTYARD', 'DAEUNGJEON', 'TEAHOUSE']) {
    await page.evaluate((id) => document.querySelector(`#place-list [data-goto-zone="${id}"]`)?.click(), z);
    await page.waitForTimeout(400);
    const zl = await page.evaluate(controls, '#hud');
    const zs = small(zl), zo = overlaps(zl), zf = zl.filter((c) => c.off).map((c) => c.name);
    console.log(`  ${z.padEnd(10)} 단추 ${zl.length} · 최소 ${minOf(zl)} ${fail(zs.length)} 48미만 ${zs.length} · 겹침 ${zo.length} ${fail(zo.length)}${zo.length ? ' [' + zo.join(', ') + ']' : ''} · 화면 밖 ${zf.length} ${fail(zf.length)}`);
  }

  // 글자 선택: 세 번 누르기(마우스) + 길게 누르기(터치). 단추 동작(창 열기·이동)은 막아 두고 선택만 본다 —
  // 열린 창의 글자가 두 번째·세 번째 누름에 잡히면 HUD 가 아니라 창 글자를 재게 된다
  await page.evaluate(() => { window.__block = (e) => { e.stopImmediatePropagation(); e.preventDefault(); }; addEventListener('click', window.__block, true); });
  const picks = list;
  const selected = [];
  const cdp = touch ? await ctx.newCDPSession(page) : null;
  for (const c of picks) {
    const x = c.x + c.w / 2, y = c.y + c.h / 2;
    await page.mouse.click(x, y, { clickCount: 3 });
    let s = await page.evaluate(() => getSelection().toString());
    if (!s && cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(800);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      s = await page.evaluate(() => getSelection().toString());
    }
    if (s.trim()) selected.push(`${c.name}:"${s.trim().slice(0, 8)}"`);
    await reset(page);
  }
  await page.evaluate(() => removeEventListener('click', window.__block, true));
  console.log(`  선택  ${picks.length}개 눌러 봄 · 선택된 글자 ${selected.length} ${fail(selected.length)}${selected.length ? ' [' + selected.join(', ') + ']' : ''}`);

  // 시트
  for (const [opener, step, target = step] of SHEETS) {
    await reset(page);
    let okOpen = (await page.$(opener)) && (await page.$(target));
    if (okOpen) {
      await page.click(opener);
      if (step !== target) await page.click(step);
      await page.waitForTimeout(250);
      okOpen = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.width > 0 && r.height > 0; }, target);
    }
    if (!okOpen) {
      console.log(`  시트  ${target} 없음/안 열림 ${fail(true)}`);
      continue;
    }
    const sl = await page.evaluate(controls, target);
    const ssm = small(sl), sov = overlaps(sl), sst = sl.filter((c) => c.style.length).map((c) => `${c.name}(${c.style})`);
    console.log(`  시트  ${target.padEnd(12)} 단추 ${String(sl.length).padStart(2)} · 최소 ${minOf(sl)} ${fail(ssm.length)} 48미만 ${ssm.length}${ssm.length ? ' [' + ssm.join(', ') + ']' : ''} · 겹침 ${sov.length} ${fail(sov.length)}${sov.length ? ' [' + sov.join(', ') + ']' : ''} · 스타일 누락 ${sst.length} ${fail(sst.length)}`);
  }
  if (errors.length) console.log(`  페이지 오류 ${errors.length} ${fail(true)} ${errors[0]}`);
  await ctx.close();
}
await browser.close();
console.log(`\n${failed ? `FAIL (${failed})` : 'PASS'}`);
process.exit(failed ? 1 : 0);
