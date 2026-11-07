/**
 * '나' — 법명과 내 기록을 한곳에 (메뉴 › 나, 상태판 펼침 › 「나 · 기록」).
 *
 * #me-sheet 맨 위에서 법명을 바로 바꾸고, 아래는 카드 목록 → 하위 시트 (ui/sheets.js data-parent).
 * 기능이 늘면 ROWS 에 한 줄 + 하위 시트 하나를 더하면 된다 (긴 스크롤 한 장이 되지 않게).
 *   수행 기록 · 지닌 것 · 간직한 죽비 · 내 소리(자연의 소리 창 「내 소리」로) · 기록 지키기(복구키, core/recovery.js)
 *
 * 마크업은 main.js 가 _bindHUD 를 부르기 전에 #hud 에 넣는다 — data-icon · data-sheet · ‹/× · 가장자리 흐림 · 30초 자동 닫힘을 그대로 탄다.
 * 그 뒤에 다시 그리는 부분(요약·목록)은 icon() 을 직접 쓰고 제 손으로 묶는다.
 */
import { icon } from './icons.js';
import { bindNameForm } from './nameField.js';
import { openSheet } from './sheets.js';
import { DHARMA_CARDS, cardVoiceText } from '../data/dharmaTexts.js';
import { MY_MIX_CAP } from '../data/natureSounds.js';
import { LIVE_API } from '../core/live.js';
import { newKey, formatKey, parseKey, backupId, sealBackup, openBackup } from '../core/recovery.js';

const KEY_STORE = 'sound_temple_recovery_v1'; // { key, savedAt } — 수행 기록(state)과 따로 둔다: 맡기는 기록에 키가 섞이지 않게

const STAT_LABELS = [
  ['bowCount', '절', '배'],
  ['malaCount', '염주', '알'],
  ['lanternCount', '연등', '개'],
  ['tileCount', '기와', '장'],
  ['stoneCount', '돌탑', '개'],
  ['sutraCopiedCount', '사경', '구절'],
  ['circumambulationLoops', '탑돌이', '바퀴'],
  ['incenseCount', '헌향', '번'],
  ['bellStrikes', '범종', '번'],
  ['teaChats', '차담', '번']
];

/** 비경쟁 시각 보상 — 조건은 core/state.js _refreshUnlocks 와 같게 */
const rewards = (s, att) => [
  { id: 'wooden_mala', name: '자단목 단주', desc: '손목에 채워지는 붉은 나무 단주', how: '큰절 21배, 또는 염주 108알',
    progress: `절 ${Math.min(s.bowCount, 21)} / 21 · 염주 ${Math.min(s.malaCount, 108)} / 108`, ratio: Math.max(s.bowCount / 21, s.malaCount / 108) },
  { id: 'hand_lantern', name: '연꽃 손연등', desc: '밤 산책길에 곁을 비추는 작은 손연등', how: '소원 연등 하나, 또는 사경 한 구절',
    progress: `연등 ${Math.min(s.lanternCount, 1)} / 1 · 사경 ${Math.min(s.sutraCopiedCount, 1)} / 1`, ratio: Math.max(s.lanternCount, s.sutraCopiedCount) },
  { id: 'jade_mala', name: '백옥 단주', desc: '꾸준히 찾아온 걸음에 채워지는 흰 옥 단주', how: '일곱 날 이어서 산사에 들르기',
    progress: `${Math.min(att.streak, 7)} / 7일`, ratio: att.streak / 7 }
];

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
const n = (v) => (v || 0).toLocaleString('ko-KR');
const when = (iso) => new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const KEY_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2"/></g></svg>';
const PEN_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 16 10.5-10.5a2.1 2.1 0 0 1 3 3L8 19H5v-3ZM13.8 7.2l3 3" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEV = '<svg class="i me-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const head = (title) =>
  `<header class="sheet-head"><button class="ctl" type="button" data-sheet-back data-icon="back" aria-label="뒤로"></button><h2>${title}</h2><button class="ctl" type="button" data-sheet-close data-icon="close" aria-label="닫기"></button></header>`;
const sub = (id, title, body) => `<section class="sheet hidden me-sub" id="${id}" data-parent="me-sheet" aria-label="${title}">${head(title)}${body}</section>`;

function loadKey() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY_STORE) || 'null');
    return v && parseKey(v.key) ? v : null;
  } catch {
    return null;
  }
}
function saveKey(v) {
  try {
    localStorage.setItem(KEY_STORE, JSON.stringify(v));
  } catch {
    /* 저장 못 해도 키는 화면에 보였다 */
  }
}

async function api(path, body, ms = 10000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(`${LIVE_API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    if (res.status === 413) return { error: '기록이 너무 커서 맡길 수 없습니다' };
    if (data.error === 'not found' || !data.error) return { error: `아직 기록 지키기를 쓸 수 없습니다 (서버 ${res.status})` }; // 옛 서버
    return { error: data.error, status: res.status };
  } catch (e) {
    return { error: e.name === 'AbortError' ? '산사 서버가 답하지 않습니다. 잠시 뒤 다시 해 주세요' : '산사 서버에 닿지 못했습니다. 인터넷 연결을 확인해 주세요' };
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {{ store, modals, rename: () => any, setName: (text) => {ok,message?}, importState: (json) => {ok,message?}, openMixes: () => void }} o
 * @returns {{ open(id?: string): void, refresh(): void }}
 */
export function mountMeHub({ store, modals, rename, setName, importState, openMixes }) {
  const $ = (s, r = document) => r.querySelector(s);
  const hud = $('#hud');

  const ROWS = [
    { sheet: 'me-practice', icon: icon('record'), title: '수행 기록' },
    { sheet: 'me-items', icon: icon('practice_108'), title: '지닌 것' },
    { sheet: 'me-cards', icon: icon('dharma_card'), title: '간직한 죽비' },
    { act: 'mixes', icon: icon('listen_nature'), title: '내 소리' },
    { sheet: 'me-backup', icon: KEY_ICON, title: '기록 지키기' }
  ];

  /* ───── 마크업 ───── */
  // 메뉴 머리줄 안 (세로·넓은 화면은 CSS 가 둘째 줄 전체로, 낮은 가로 폰은 「메뉴」 옆 한 줄로 — 메뉴가 스크롤 없이 들어가게)
  $('#menu-sheet .sheet-head [data-sheet-close]').insertAdjacentHTML(
    'beforebegin',
    `<button class="ctl me-entry" type="button" id="me-btn" data-sheet="me-sheet" aria-controls="me-sheet" aria-expanded="false">
      <span class="pq-seal" aria-hidden="true"><img src="./assets/brand/temple-emblem-v2.svg" alt="" width="470" height="540" /></span>
      <span class="me-entry-txt"><b data-me-name></b><small>나 · 수행 기록 · 지닌 것 · 내 소리 · 기록 지키기</small></span>${CHEV}
    </button>`
  );
  // 상태판 펼침: 붓글씨 법명 오른쪽에 아이콘 둘 (연필 = 법명 바꾸기, 사람 = 나). 법명 글은 main.js 가 textContent 로 바꾸니 옆에 둔다
  const big = $('#hud-dharma-name-big');
  const row = document.createElement('div');
  row.className = 'pq-namerow';
  big.before(row);
  row.append(big);
  row.insertAdjacentHTML(
    'beforeend',
    `<button class="ctl pq-ico" type="button" data-me-plaque="rename" aria-label="법명 바꾸기" title="법명 바꾸기">${PEN_ICON}</button>
    <button class="ctl pq-ico" type="button" data-me-plaque="hub" aria-label="나 — 수행 기록·지닌 것·기록 지키기" title="나">${icon('self')}</button>`
  );
  hud.insertAdjacentHTML(
    'beforeend',
    `<section class="sheet hidden me-sheet" id="me-sheet" data-parent="menu-sheet" aria-label="나">
      ${head('나')}
      <div class="me-id">
        <p class="me-label">나의 법명</p>
        <p class="me-dharma" data-me-name></p>
        <p class="me-att" data-me-att></p>
        <div class="me-name-acts">
          <button class="ctl chip" type="button" data-me-act="rename">다시 받기</button>
          <button class="ctl chip" type="button" data-me-act="custom" aria-expanded="false" aria-controls="me-name-form">직접 짓기</button>
        </div>
        <form class="name-form me-name-form hidden" id="me-name-form" autocomplete="off">
          <input type="text" aria-label="법명 직접 짓기" enterkeyhint="done" />
          <button type="submit" class="ctl name-ok">정하기</button>
          <p class="name-hint" data-hint aria-live="polite"></p>
        </form>
      </div>
      <ul class="me-rows">${ROWS.map(
        (r) => `<li><button class="ctl me-row" type="button" ${r.sheet ? `data-sheet="${r.sheet}" aria-controls="${r.sheet}" aria-expanded="false"` : `data-me-act="${r.act}"`}>
          ${r.icon}<span class="me-row-txt"><b>${r.title}</b><small data-sum="${r.sheet || r.act}"></small></span>${CHEV}</button></li>`
      ).join('')}</ul>
    </section>
    ${sub('me-practice', '수행 기록', '<div data-me-body="practice"></div>')}
    ${sub('me-items', '지닌 것', '<p class="me-note">순위도 경쟁도 없습니다. 수행이 쌓이면 아바타에 조용히 나타납니다.</p><div data-me-body="items"></div>')}
    ${sub('me-cards', '간직한 죽비', '<div data-me-body="cards"></div>')}
    ${sub(
      'me-backup',
      '기록 지키기',
      `<p class="me-note">기록을 이 기기에서 암호화해 산사 서버에 맡깁니다. 복구키가 있으면 다른 기기에서도, 브라우저 기록을 지운 뒤에도 되찾을 수 있습니다. 서버도 운영자도 내용을 읽을 수 없습니다.</p>
      <div class="bk-state" data-bk-state></div>
      <p class="bk-live" data-bk-live aria-live="polite"></p>
      <h3 class="sheet-sub">복구키로 되찾기</h3>
      <form class="bk-restore" data-bk-restore autocomplete="off">
        <input type="text" aria-label="복구키 6자" placeholder="복구키 6자" maxlength="12" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" />
        <button type="submit" class="ctl chip">되찾기</button>
      </form>
      <p class="me-note">대·소문자를 구별합니다. 되찾으면 지금 이 브라우저의 기록은 되찾은 기록으로 바뀝니다.</p>`
    )}`
  );

  const me = $('#me-sheet');
  const sheets = [me, ...document.querySelectorAll('.me-sub')];
  const live = $('[data-bk-live]');
  const flash = (msg) => (live.textContent = msg);
  let reveal = false; // 복구키를 다 보여 줄지 (만든 직후엔 보이고, 나중에 열면 가린 채로)
  let busy = false;

  /* ───── 그리기 ───── */
  function renderHub() {
    const p = store.profile, s = p.stats, att = p.attendance || { streak: 0, totalDays: 0 };
    document.querySelectorAll('[data-me-name]').forEach((el) => (el.textContent = p.dharmaName));
    $('[data-me-att]').textContent = att.totalDays ? `${att.streak || 0}일째 이어 오는 걸음 · 모두 ${att.totalDays}일 머묾` : '';
    const sum = {
      'me-practice': `절 ${n(s.bowCount)} · 염주 ${n(s.malaCount)} · 연등 ${n(s.lanternCount)}`,
      'me-items': `${(p.unlockedItems || []).length} / 3 지님`,
      'me-cards': `${(p.dharmaCards || []).length}장`,
      mixes: (store.state.settings.myMixes || []).length ? `${store.state.settings.myMixes.length} / ${MY_MIX_CAP}개 담음` : '자연의 소리에서 내 소리로 담기',
      'me-backup': loadKey() ? `복구키 있음 · ${when(loadKey().savedAt)} 맡김` : '복구키로 서버에 맡겨 두기'
    };
    for (const [k, v] of Object.entries(sum)) $(`[data-sum="${k}"]`).textContent = v;
  }

  function renderPractice() {
    const s = store.stats, att = store.profile.attendance || { streak: 0, totalDays: 0 };
    $('[data-me-body="practice"]').innerHTML = `
      <div class="me-att-grid"><div><b>${att.streak || 0}</b><span>일째 이어 오는 걸음</span></div><div><b>${att.totalDays || 0}</b><span>일 산사에 머묾</span></div></div>
      <dl class="me-stats">${STAT_LABELS.map(([k, label, unit]) => `<div><dt>${label}</dt><dd><b>${n(s[k])}</b>${unit}</dd></div>`).join('')}</dl>`;
  }

  function renderItems() {
    const p = store.profile;
    const has = (id) => (p.unlockedItems || []).includes(id);
    $('[data-me-body="items"]').innerHTML = `<ul class="me-rewards">${rewards(p.stats, p.attendance || { streak: 0 })
      .map(
        (r) => `<li class="me-reward${has(r.id) ? ' is-on' : ''}">
          <span class="me-reward-icon me-${r.id}" aria-hidden="true"></span>
          <span class="me-reward-body"><b>${r.name}${has(r.id) ? '<em>지니고 있습니다</em>' : ''}</b><small>${r.desc}</small>
          ${has(r.id) ? '' : `<small class="me-how">얻는 길 · ${r.how}</small><span class="me-bar"><span style="width:${Math.min(100, r.ratio * 100).toFixed(1)}%"></span></span><small class="me-progress">${r.progress}</small>`}
          </span></li>`
      )
      .join('')}</ul>`;
  }

  function renderCards() {
    const kept = (store.profile.dharmaCards || []).map((k) => DHARMA_CARDS.find((c) => c.id === k.id)).filter(Boolean);
    $('[data-me-body="cards"]').innerHTML = kept.length
      ? `<ul class="pf-cards">${kept
          .map(
            (c) => `<li><span class="jk-quote">${esc(c.quote)}</span><span class="jk-source">${esc(c.source)}</span>
              <button type="button" class="ctl pf-listen" data-listen="${esc(c.id)}" aria-label="${esc(c.source)} — 스님 목소리로 듣기">${icon('sound')}</button></li>`
          )
          .join('')}</ul>`
      : '<p class="me-note">후원 다실의 죽비나 차담에서 마음에 닿는 구절을 간직해 보세요.</p>';
  }

  function renderBackup() {
    const k = loadKey();
    const el = $('[data-bk-state]');
    el.innerHTML = k
      ? `<p class="bk-label">내 복구키 <small>대·소문자 구별 · 비밀번호처럼 지켜 주세요</small></p>
        <p class="bk-key${reveal ? '' : ' masked'}" data-bk-key>${reveal ? formatKey(k.key) : formatKey(k.key).replace(/\S/g, '•')}</p>
        <div class="bk-acts">
          <button class="ctl chip" type="button" data-bk-act="copy">복사</button>
          <button class="ctl chip" type="button" data-bk-act="reveal" aria-pressed="${reveal}">${reveal ? '가리기' : '보기'}</button>
        </div>
        <p class="bk-when">${when(k.savedAt)}에 맡긴 기록이 있습니다. 같은 키로 다른 기기에서 맡기면 나중에 맡긴 것만 남습니다.</p>
        <button class="ctl bk-main" type="button" data-bk-act="save"${busy ? ' disabled' : ''}>지금 기록으로 다시 맡기기</button>`
      : `<button class="ctl bk-main" type="button" data-bk-act="save"${busy ? ' disabled' : ''}>${KEY_ICON}<span class="lbl">복구키 만들고 기록 맡기기</span></button>`;
  }

  const visible = () => sheets.some((s) => !s.classList.contains('hidden'));
  function refresh() {
    $('#me-btn [data-me-name]').textContent = store.profile.dharmaName;
    if (!visible()) return;
    renderHub();
    renderPractice();
    renderItems();
    renderCards();
  }
  store.onChange(refresh);
  // 열 때마다 새로 (시트가 보이게 되는 순간)
  const seen = new MutationObserver(() => {
    if ($('#me-backup').classList.contains('hidden')) reveal = false; // 다시 열면 가린 채로
    if (visible()) refresh(), renderBackup();
  });
  sheets.forEach((s) => seen.observe(s, { attributes: true, attributeFilter: ['class'] }));
  refresh();

  /* ───── 법명 ───── */
  const nameForm = $('#me-name-form');
  const customBtn = $('[data-me-act="custom"]');
  const nf = bindNameForm(nameForm, (text) => {
    const r = setName(text);
    if (r?.ok) {
      nf.reset();
      toggleForm(false);
      inkNew();
    }
    return r;
  });
  const inkNew = () => {
    const el = $('.me-dharma');
    el.classList.remove('is-new');
    void el.offsetWidth;
    el.classList.add('is-new');
  };
  function toggleForm(open = nameForm.classList.contains('hidden')) {
    nameForm.classList.toggle('hidden', !open);
    customBtn.setAttribute('aria-expanded', String(open));
    if (open) nf.input.focus({ preventScroll: true });
  }

  me.addEventListener('click', (e) => {
    const b = e.target.closest('[data-me-act]');
    if (!b) return;
    const act = b.dataset.meAct;
    if (act === 'rename') {
      rename();
      inkNew();
    } else if (act === 'custom') toggleForm();
    else if (act === 'mixes') openMixes();
  });

  // 상태판에서 바로: 「법명 바꾸기」 = 나 시트 + 직접 짓기 칸, 「나 · 기록」 = 나 시트
  row.addEventListener('click', (e) => {
    const b = e.target.closest('[data-me-plaque]');
    if (!b) return;
    const plaque = $('#hud-plaque');
    if (!plaque.classList.contains('collapsed')) $('#plaque-toggle').click();
    openSheet('me-sheet');
    if (b.dataset.mePlaque === 'rename') toggleForm(true);
  });

  /* ───── 간직한 죽비 듣기 ───── */
  $('#me-cards').addEventListener('click', (e) => {
    const b = e.target.closest('[data-listen]');
    const c = b && DHARMA_CARDS.find((x) => x.id === b.dataset.listen);
    if (c) modals.speak(cardVoiceText(c));
  });

  /* ───── 기록 지키기 ───── */
  async function save() {
    if (busy) return;
    const had = loadKey();
    let key = had?.key || newKey();
    busy = true;
    renderBackup();
    flash('기록을 잠그는 중…');
    try {
      let r;
      // 새 키가 드물게 남의 키와 겹치면 서버가 409 — 새 키로 다시 (남의 기록을 덮지 않는다)
      for (let tries = 0; ; tries++) {
        const { id, data } = await sealBackup(store.exportState(), key);
        r = await api('/backup', { id, data, create: !had }, 20000);
        if (r.status !== 409 || had || tries >= 3) break;
        key = newKey();
      }
      if (r.error) return flash(r.error);
      saveKey({ key, savedAt: r.updatedAt }); // 맡기는 데 성공한 키만 남긴다
      if (!had) reveal = true;
      flash(had ? '지금 기록으로 다시 맡겼습니다' : '복구키를 만들고 기록을 맡겼습니다. 지금 복사해서 메모 앱 등 안전한 곳에 적어 두세요. 이 키가 없으면 아무도 되찾아 드릴 수 없습니다.');
    } catch (e) {
      flash(e.code === 'insecure' ? e.message : '기록을 잠그지 못했습니다');
    } finally {
      busy = false;
      renderBackup();
      renderHub();
    }
  }

  async function copy() {
    const k = loadKey();
    if (!k) return;
    try {
      await navigator.clipboard.writeText(k.key);
      flash('복구키를 복사했습니다');
    } catch {
      // 클립보드를 못 쓰는 곳: 키를 보여 주고 골라 둔다 → 길게 눌러 복사
      reveal = true;
      renderBackup();
      getSelection().selectAllChildren($('[data-bk-key]'));
      flash('복구키를 골라 두었습니다. 길게 누르거나 ⌘C 로 복사해 주세요');
    }
  }

  async function restore(input) {
    const key = parseKey(input.value);
    if (!key) return flash('복구키는 6자입니다 (영문 대·소문자와 숫자)');
    if (busy) return;
    busy = true;
    flash('맡긴 기록을 찾는 중…');
    try {
      const r = await api('/backup/restore', { id: await backupId(key) });
      if (r.error) return flash(r.error);
      let json;
      try {
        json = await openBackup(r.data, key);
      } catch {
        return flash('기록을 풀지 못했습니다. 복구키를 다시 확인해 주세요');
      }
      if (!window.confirm(`${when(r.updatedAt)}에 맡긴 기록을 되찾습니다.\n지금 이 브라우저의 기록은 되찾은 기록으로 바뀝니다. 계속할까요?`)) return flash('');
      const res = importState(json);
      if (!res?.ok) return flash(res?.message || '되찾지 못했습니다');
      saveKey({ key, savedAt: r.updatedAt }); // 이 기기에서 다시 맡기면 같은 자리에
      input.value = '';
      flash('기록을 되찾았습니다. 산문을 다시 엽니다…');
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      flash(e.code === 'insecure' ? e.message : '되찾지 못했습니다');
    } finally {
      busy = false;
    }
  }

  const bk = $('#me-backup');
  bk.addEventListener('click', (e) => {
    const act = e.target.closest('[data-bk-act]')?.dataset.bkAct;
    if (act === 'save') save();
    else if (act === 'copy') copy();
    else if (act === 'reveal') {
      reveal = !reveal;
      renderBackup();
    }
  });
  $('[data-bk-restore]').addEventListener('submit', (e) => {
    e.preventDefault();
    restore(e.currentTarget.querySelector('input'));
  });
  renderBackup();

  return {
    refresh,
    /** 나 시트를 연다. id 를 주면 그 하위 시트까지 (검사·안내에서 씀) */
    open(id) {
      openSheet('me-sheet');
      if (id) openSheet(id);
    }
  };
}
