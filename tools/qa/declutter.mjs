// 설명 글을 걷어낸 화면들 스크린숏 + 그림 단추 크기 — node tools/qa/declutter.mjs   (먼저 python3 .claude/devserver.py 8081)
// OUT=폴더 (기본 qa-declutter), ONLY=cairn,stone,lantern,... 로 일부만. 폰 390 · 데스크톱 1280 두 크기.
// 돌탑: 숲길에서 쌓을 수 있는 자리를 찾아 서고 → 알약 → 돌 올리기 창 → 한 알 얹은 뒤 → 다시 알약(층 표시) → 일주문 돌탑 창 → 내 돌탑 걸어가기.
// /api 는 막아 둔다 (정적 서버는 POST 에 501 을 돌려 「나만 보도록 두었습니다 · HTTP 501」 토스트가 창을 가린다 → 막으면 조용한 offline 길).
// 단계마다 토스트를 비우고 시작해서 그 단계가 띄운 토스트만 찍힌다.
// 창 안 글자 없는 그림 단추·스위치는 48×48 이상, 이름(aria-label) 이 있어야 한다 — 어기면 FAIL 줄과 종료 코드 1.
import { mkdirSync } from 'node:fs';
import { launch, enter } from './lib.mjs';

const OUT = process.env.OUT || 'qa-declutter';
const only = process.env.ONLY?.split(',');
const SIZES = [[390, 844], [1280, 800]];
const MIN = 48;
mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const open = (page, type, payload) => page.evaluate(([t, p]) => window.temple.modals.open(t, p), [type, payload]);
const close = (page) => page.evaluate(() => window.temple.modals.close());
const clearToasts = (page) => page.evaluate(() => document.querySelectorAll('#toast-stack > *, #bell-toast-stack > *').forEach((n) => n.remove()));
let bad = 0;

/** 창 안의 글자 없는 단추(그림만)·스위치: 크기와 이름 */
async function checkIcons(page, label) {
  const list = await page.evaluate(() =>
    [...document.querySelectorAll('.modal-window button, .modal-window [role="switch"]')]
      // 글자 단추(이름이 곧 글)는 빼고: 스위치, 글자 없는 단추, aria-label 로 이름을 따로 단 그림 단추
      .filter((el) => el.getBoundingClientRect().width > 0 && (el.getAttribute('role') === 'switch' || !el.textContent.trim() || (el.hasAttribute('aria-label') && el.querySelector('svg'))))
      .map((el) => {
        const hit = el.getAttribute('role') === 'switch' ? el.closest('label') || el : el; // 스위치는 감싼 줄 전체가 누르는 자리
        const r = hit.getBoundingClientRect();
        const name = el.getAttribute('aria-label') || (el.getAttribute('role') === 'switch' ? hit.textContent.trim() : '');
        return { name, cls: el.className || el.type, w: Math.round(r.width), h: Math.round(r.height) };
      })
  );
  for (const b of list) {
    if (b.w < MIN || b.h < MIN || !b.name) {
      bad++;
      console.log(`  FAIL ${label}: ${b.cls} ${b.w}×${b.h} 이름「${b.name}」`);
    }
  }
}

const SHOTS = {
  async cairn(page, shot) {
    // 숲길에서 몸 앞 0.9m 까지 돌탑을 쌓을 수 있는 자리 하나
    const ok = await page.evaluate(async () => {
      const { canBuildCairn, isWalkable } = await import('/src/world/layout.js');
      const t = window.temple;
      for (const s of t.temple.trail.spots) {
        for (let k = 0; k < 40; k++) {
          const a = (k / 40) * Math.PI * 2, r = 3 + (k % 4);
          const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
          for (let h = 0; h < 8; h++) {
            const ry = (h / 8) * Math.PI * 2;
            const fx = x + Math.sin(ry) * 0.9, fz = z + Math.cos(ry) * 0.9;
            if (isWalkable(x, z) && canBuildCairn(x, z) && canBuildCairn(fx, fz)) {
              t._teleport(x, z, ry);
              return true;
            }
          }
        }
      }
      return false;
    });
    if (!ok) return console.log('  돌탑 자리를 찾지 못함');
    const pill = (id) => page.waitForFunction((k) => window.temple.nearby?.id?.startsWith(k) && !document.querySelector('#prompt').classList.contains('hidden'), id, { timeout: 8000 });
    await pill('cairn:new');
    await wait(900); // 알약 pop-in
    await clearToasts(page);
    await shot('cairn-pill-new');
    await page.click('#prompt');
    await page.waitForSelector('.m-stone-pagoda', { timeout: 4000 });
    await wait(500);
    await shot('stone-new');
    await checkIcons(page, 'stone-new');
    await page.fill('#stone-wish', '천천히, 그러나 멈추지 않기');
    await page.click('[data-act="add"]');
    await wait(900);
    await shot('stone-added');
    await close(page);
    await pill('cairn:c_');
    await wait(1200); // 얹은 뒤 토스트가 떠 있는 동안
    await shot('cairn-pill-joined');
  },
  async stone(page, shot) {
    await page.evaluate(() => window.temple.activate('stone_pagoda'));
    await page.waitForSelector('.m-stone-pagoda', { timeout: 4000 });
    await wait(800);
    await shot('stone-gate');
    await checkIcons(page, 'stone-gate');
    const walk = await page.$('[data-walk]');
    if (walk) {
      await walk.click();
      await wait(700);
      await shot('cairn-walk');
      await page.evaluate(() => (window.temple.avatars.moveTarget = null)); // 걷기 멈춤 (멈춤 토스트까지 찍는다)
      await wait(600);
      await shot('cairn-walk-stop');
    }
    await close(page);
  },
  async lantern(page, shot) {
    await open(page, 'wish_lantern');
    await wait(500);
    await shot('lantern-write');
    await checkIcons(page, 'lantern-write');
    await page.fill('#lantern-wish', '가족 모두 건강하기를');
    await page.click('[data-act="add"]');
    await wait(1400); // 연등 토스트(0.8초 뒤)까지
    await shot('lantern-view');
    await checkIcons(page, 'lantern-view');
    await page.click('[data-open]');
    await wait(400);
    await shot('lantern-detail');
    await checkIcons(page, 'lantern-detail');
    await page.click('[data-emp]');
    await wait(400);
    await shot('lantern-detail-empathized');
    await close(page);
  },
  async tile(page, shot) {
    await open(page, 'wish_tile');
    await wait(500);
    await shot('tile');
    await close(page);
  },
  async burn(page, shot) {
    await open(page, 'burn_worry');
    await wait(500);
    await shot('burn');
    await close(page);
  },
  async mala(page, shot) {
    await open(page, 'mala');
    await wait(600);
    await shot('mala');
    await close(page);
  },
  async practice(page, shot) {
    await open(page, 'practice_108');
    await wait(600);
    await shot('practice');
    await checkIcons(page, 'practice');
    await close(page);
  },
  async listen(page, shot) {
    for (const v of ['yebul', 'nature']) {
      await open(page, v);
      await wait(500);
      await shot(v);
      await close(page);
    }
  },
  async card(page, shot) {
    await open(page, 'dharma_card');
    await wait(800);
    await shot('card');
    await close(page);
  }
};

const browser = await launch();
try {
  for (const size of SIZES) {
    const { ctx, page, errors } = await enter(browser, size);
    await page.route('**/api/**', (r) => r.abort());
    await wait(1500);
    for (const [name, fn] of Object.entries(SHOTS)) {
      if (only && !only.includes(name)) continue;
      try {
        await clearToasts(page);
        await fn(page, (label) => page.screenshot({ path: `${OUT}/${label}-${size[0]}.png` }));
        console.log(`${size[0]} ${name} ok`);
      } catch (e) {
        console.log(`${size[0]} ${name} FAIL ${String(e).split('\n')[0]}`);
        await close(page).catch(() => {});
      }
    }
    if (errors.length) console.log('  페이지 오류:', errors.slice(0, 3));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(bad ? `그림 단추 FAIL ${bad}` : '그림 단추 PASS');
process.exitCode = bad ? 1 : 0;
