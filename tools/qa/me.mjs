// 나 허브 · 법명 바로 바꾸기 · 기록 지키기(복구키) · 둘러보기 안내 · 도움말 검사
//   python3 .claude/devserver.py 8091 &  (cd server && PORT=8197 node server.js) &
//   BASE=http://localhost:8091 LIVE=http://localhost:8197 OUT=/tmp/shots node tools/qa/me.mjs
// LIVE: 실시간 서버(복구키 저장·되찾기). 없으면 기록 지키기 왕복은 건너뛴다. OUT: 스크린숏 폴더 (없으면 찍지 않음)
import { launch, enter } from './lib.mjs';

const LIVE = process.env.LIVE;
const OUT = process.env.OUT;
const SIZES = (process.env.SIZES || '412x915,1280x800').split(',').map((s) => s.split('x').map(Number));
let bad = 0;
const check = (name, ok, extra = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};
const shot = async (p, name) => OUT && (await p.waitForTimeout(350), await p.screenshot({ path: `${OUT}/${name}.png` }));
const init = LIVE ? `window.TEMPLE_CONFIG = { liveUrl: ${JSON.stringify(LIVE)} };` : undefined;

/** 보이는 단추·입력 중 48px 미만 */
const small = (scope) =>
  [...document.querySelectorAll(`${scope} button, ${scope} input:not([type=file])`)]
    .filter((el) => el.getBoundingClientRect().width > 0)
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width < 47.5 || r.height < 47.5; })
    .map((el) => `${el.textContent.trim().slice(0, 10) || el.getAttribute('aria-label')} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
const isOpen = (sel) => document.querySelector(sel) && !document.querySelector(sel).classList.contains('hidden');
const noHScroll = () => document.documentElement.scrollWidth <= innerWidth;

const browser = await launch();
let savedKey = null;
try {
  for (const size of SIZES) {
    const tag = size.join('x');
    const { ctx, page, errors } = await enter(browser, size, { init });
    page.on('dialog', (d) => d.accept());
    await page.waitForTimeout(800);

    // 1) 메뉴: 맨 위 「나」, 안내 묶음(둘러보기·도움말·출처)
    await page.click('#menu-btn');
    await page.waitForTimeout(300);
    check(`${tag} 메뉴 맨 위 나 (법명 보임)`, await page.evaluate(() => document.querySelector('#me-btn b').textContent === window.temple.store.profile.dharmaName));
    check(`${tag} 메뉴 안내: 둘러보기·도움말·출처, 기록 단추 없음`, await page.evaluate(() => !!document.querySelector('#tour-btn') && !!document.querySelector('#help-btn') && !!document.querySelector('#credits-btn') && !document.querySelector('#record-btn')));
    await shot(page, `menu-${tag}`);

    // 2) 나 허브
    await page.click('#me-btn');
    await page.waitForTimeout(300);
    check(`${tag} 나 시트 열림 (메뉴 위에 쌓임)`, await page.evaluate(isOpen, '#me-sheet'));
    check(`${tag} 나 시트 단추 48 이상`, !(await page.evaluate(small, '#me-sheet')).length, (await page.evaluate(small, '#me-sheet')).join(', '));
    check(`${tag} 가로 스크롤 없음`, await page.evaluate(noHScroll));
    await shot(page, `me-hub-${tag}`);

    // 3) 법명 직접 짓기: 거름에 걸리는 이름 → 안내, 좋은 이름 → 상태판까지 바뀜
    await page.click('[data-me-act="custom"]');
    await page.fill('#me-name-form input', '시발');
    await page.waitForTimeout(150);
    check(`${tag} 욕설 법명 막힘 안내`, await page.evaluate(() => document.querySelector('#me-name-form').classList.contains('is-bad')));
    await shot(page, `me-name-bad-${tag}`);
    await page.fill('#me-name-form input', '맑은솔바람');
    await page.click('#me-name-form .name-ok');
    await page.waitForTimeout(250);
    check(`${tag} 직접 지은 법명이 저장·상태판·나 시트에`, await page.evaluate(() =>
      window.temple.store.profile.dharmaName === '맑은솔바람' && document.querySelector('#hud-dharma-name').textContent === '맑은솔바람' && document.querySelector('.me-dharma').textContent === '맑은솔바람'));
    const before = await page.evaluate(() => window.temple.store.profile.dharmaName);
    await page.click('[data-me-act="rename"]');
    await page.waitForTimeout(200);
    check(`${tag} 다시 받기 → 새 법명`, await page.evaluate((b) => window.temple.store.profile.dharmaName !== b, before));

    // 4) 하위 시트들
    for (const id of ['me-practice', 'me-items', 'me-cards']) {
      await page.click(`#me-sheet [data-sheet="${id}"]`);
      await page.waitForTimeout(300);
      check(`${tag} ${id} 열림 · 단추 48`, (await page.evaluate(isOpen, `#${id}`)) && !(await page.evaluate(small, `#${id}`)).length);
      await shot(page, `${id}-${tag}`);
      await page.click(`#${id} [data-sheet-back]`);
      await page.waitForTimeout(200);
      check(`${tag} ${id} ‹ → 나 시트로`, await page.evaluate(isOpen, '#me-sheet'));
    }

    // 5) 기록 지키기
    await page.click('#me-sheet [data-sheet="me-backup"]');
    await page.waitForTimeout(300);
    await shot(page, `me-backup-empty-${tag}`);
    if (LIVE) {
      await page.evaluate(() => window.temple.store.addStat('bowCount', 33));
      await page.click('[data-bk-act="save"]');
      await page.waitForFunction(() => document.querySelector('[data-bk-key]'), null, { timeout: 8000 }).catch(() => {});
      const key = await page.evaluate(() => JSON.parse(localStorage.getItem('sound_temple_recovery_v1') || 'null')?.key);
      const shown = await page.evaluate(() => document.querySelector('[data-bk-key]')?.textContent || '');
      check(`${tag} 복구키 6자 만들고 맡김 · 크게 보임`, !!key && key.length === 6 && shown.replace(/ /g, '') === key, shown);
      check(`${tag} 기록 지키기 단추 48`, !(await page.evaluate(small, '#me-backup')).length, (await page.evaluate(small, '#me-backup')).join(', '));
      await shot(page, `me-backup-key-${tag}`);
      await page.click('[data-bk-act="reveal"]');
      check(`${tag} 가리기 → 점으로`, await page.evaluate(() => /^[• ]+$/.test(document.querySelector('[data-bk-key]').textContent)));
      savedKey ||= { key, name: await page.evaluate(() => window.temple.store.profile.dharmaName), bows: await page.evaluate(() => window.temple.store.stats.bowCount) };
    }
    await page.click('#me-backup [data-sheet-close]');

    // 6) 상태판에서 바로 법명 바꾸기
    await page.click('#plaque-toggle');
    await page.waitForTimeout(250);
    await shot(page, `plaque-${tag}`);
    check(`${tag} 상태판 단추 48`, !(await page.evaluate(small, '#plaque-body')).length, (await page.evaluate(small, '#plaque-body')).join(', '));
    check(`${tag} 상태판: 법명 옆 아이콘 둘(글자 없음) · 수행 6개 3×2`, await page.evaluate(() => {
      const ico = [...document.querySelectorAll('.pq-namerow .pq-ico')];
      const li = [...document.querySelectorAll('#plaque-body .pq-stats li')];
      const rows = new Set(li.map((x) => Math.round(x.getBoundingClientRect().top)));
      return ico.length === 2 && ico.every((b) => !b.textContent.trim()) && li.length === 6 && rows.size === 2 && li.map((x) => x.querySelector('small').textContent).join() === '절,염주,연등,돌탑,탑돌이,범종';
    }));
    await page.click('[data-me-plaque="rename"]');
    await page.waitForTimeout(300);
    check(`${tag} 상태판 「법명 바꾸기」 → 나 시트 + 짓기 칸`, await page.evaluate(() => !document.querySelector('#me-sheet').classList.contains('hidden') && !document.querySelector('#me-name-form').classList.contains('hidden') && document.querySelector('#hud-plaque').classList.contains('collapsed')));
    await shot(page, `plaque-rename-${tag}`);
    await page.keyboard.press('Escape');

    // 7) 둘러보기 안내
    await page.evaluate(() => document.activeElement?.blur());
    await page.click('#menu-btn');
    await page.click('#tour-btn');
    await page.waitForTimeout(450);
    const steps = await page.evaluate(() => document.querySelector('.tour-step')?.textContent);
    check(`${tag} 둘러보기 시작 (메뉴에서만)`, !!steps, steps);
    const total = Number(steps?.split('/')[1]) || 0;
    for (let i = 0; i < total; i++) {
      const st = await page.evaluate(() => {
        const c = document.querySelector('.tour-card').getBoundingClientRect();
        const h = document.querySelector('.tour-hole').getBoundingClientRect();
        const noT = document.querySelector('#tour').classList.contains('no-target');
        const overlap = !noT && !(c.bottom <= h.top || c.top >= h.bottom || c.right <= h.left || c.left >= h.right);
        return { title: document.querySelector('.tour-title').textContent, inView: c.top >= 0 && c.left >= 0 && c.bottom <= innerHeight && c.right <= innerWidth, overlap, noT };
      });
      check(`${tag} 안내 ${i + 1} 「${st.title}」 카드가 화면 안 · 비춘 곳 안 가림`, st.inView && !st.overlap, st.noT ? '가운데 카드' : '');
      await shot(page, `tour-${i + 1}-${tag}`);
      if (i === 1) {
        await page.click('[data-tour="prev"]');
        await page.waitForTimeout(250);
        check(`${tag} 이전 → 1단계`, (await page.evaluate(() => document.querySelector('.tour-step').textContent)).startsWith('1 '));
        await page.click('[data-tour="next"]');
        await page.waitForTimeout(250);
      }
      if (i === 0) {
        await page.keyboard.down('w'); // 산사로 새지 않는다
        check(`${tag} 안내 중 W 키가 걷기로 새지 않음`, await page.evaluate(() => !window.temple.keys?.KeyW));
        await page.keyboard.up('w');
      }
      await page.click('[data-tour="next"]');
      await page.waitForTimeout(420);
    }
    check(`${tag} 마치기 → 안내 닫힘`, !(await page.$('#tour')));
    await page.click('#menu-btn');
    await page.click('#tour-btn');
    await page.waitForTimeout(300);
    await page.click('[data-tour="skip"]');
    check(`${tag} 건너뛰기 → 닫힘`, !(await page.$('#tour')));
    await page.click('#menu-btn');
    await page.click('#tour-btn');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    check(`${tag} Esc → 닫힘`, !(await page.$('#tour')));

    // 8) 도움말
    await page.evaluate(() => window.temple.modals.open('help'));
    await page.waitForTimeout(900);
    await shot(page, `help-top-${tag}`);
    const help = await page.evaluate(() => document.querySelector('#modal-body').innerText);
    for (const w of ['테마 ASMR', '예불 듣기', '나만의 소리', '휴식 돗자리', '돌탑 쌓기', '선사 차담', '화면 꺼져도 계속 듣기', '장소 단추', '홈 화면에 추가', '빠른 도구', '기록 지키기'])
      check(`${tag} 도움말에 「${w}」`, help.includes(w));
    check(`${tag} 도움말에 옛 문구(서버 계정도 없습니다·기록 내보내기) 없음`, !/서버 계정도 없습니다|기록 내보내기/.test(help));
    await page.evaluate(() => (document.querySelector('#modal-body').scrollTop = 99999));
    await shot(page, `help-bottom-${tag}`);
    await page.evaluate(() => window.temple.modals.close());

    check(`${tag} 페이지 오류 없음`, !errors.length, errors[0] || '');
    await ctx.close();
  }

  // 9) 다른 기기(새 브라우저)에서 복구키로 되찾기
  if (savedKey) {
    const { ctx, page, errors } = await enter(browser, [412, 915], { init });
    page.on('dialog', (d) => d.accept());
    await page.evaluate(() => window.temple.me.open('me-backup'));
    await page.waitForTimeout(300);
    await page.fill('[data-bk-restore] input', (savedKey.key[0] === 'Z' ? 'Y' : 'Z') + savedKey.key.slice(1)); // 틀린 키 (형식은 맞음)
    await page.click('[data-bk-restore] button');
    await page.waitForTimeout(800);
    check('틀린 복구키 → 없다고 안내', /맡긴 기록이 없습니다/.test(await page.evaluate(() => document.querySelector('[data-bk-live]').textContent)), await page.evaluate(() => document.querySelector('[data-bk-live]').textContent));
    await page.fill('[data-bk-restore] input', ` ${savedKey.key.slice(0, 3)} ${savedKey.key.slice(3)} `); // 띄어쓰기는 괜찮다
    await shot(page, 'restore-typed-412x915');
    const nav = page.waitForNavigation({ timeout: 30000 }).catch(() => null); // PBKDF2 두 번 + 받기 + 0.9초 뒤 새로고침
    await page.click('[data-bk-restore] button');
    await nav;
    await page.waitForFunction(() => window.temple && window.temple.store, null, { timeout: 90000 });
    const got = await page.evaluate(() => ({ name: window.temple.store.profile.dharmaName, bows: window.temple.store.stats.bowCount, key: JSON.parse(localStorage.getItem('sound_temple_recovery_v1') || 'null')?.key }));
    check('되찾기 → 법명·절 수가 돌아옴, 키는 이 기기에도', got.name === savedKey.name && got.bows === savedKey.bows && got.key === savedKey.key, JSON.stringify(got));
    check('되찾기 페이지 오류 없음', !errors.length, errors[0] || '');
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(bad ? `\n${bad} FAIL` : '\nALL PASS');
process.exit(bad ? 1 : 0);
