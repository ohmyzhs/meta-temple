/**
 * 공개 글(연등·기와·돌탑)·이름(법명)·차담에 쓰는 거름.
 * 서버(최종 판정)와 화면(쓰는 중 바로 안내)이 이 파일 하나를 함께 쓴다 — web/src/core/moderation.js 는 이 파일로 가는 링크.
 * DOM·Node 전용 API 를 쓰지 않는다.
 *
 * 우회 막기: 띄어쓰기·기호·숫자 끼워 넣기(시1발, 섹 스), 된소리·모음 바꾸기(쎅쓰, 쌕스), 늘여 쓰기(쉐엑스),
 * 자모로 풀어 쓰기(ㅅㅔㄱㅅㅡ), 영어·leet(S.e.x, s3x, f*ck), 초성 줄임(ㅅㅂ, ㅅㅅ).
 * 금지어 목록은 직접 작성했다 (외부 목록 미사용).
 */
export const NAME_MIN = 2;
export const NAME_MAX = 12;

const MESSAGES = {
  empty: '내용이 비어 있습니다',
  too_short: `${NAME_MIN}자 이상으로 지어 주세요`,
  too_long: (max) => `${max}자까지 쓸 수 있습니다`,
  chars: '한글·영문·숫자로만 지어 주세요',
  link: '링크는 올릴 수 없습니다',
  contact: '연락처나 메신저 아이디는 올릴 수 없습니다',
  abuse: '함께 보는 자리에 어울리지 않는 말이 있습니다',
  sexual: '함께 보는 자리에 어울리지 않는 말이 있습니다',
  reserved: '쓸 수 없는 이름입니다'
};

/* ───── 한글 자모 ───── */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
// 비교용으로만 접는다: 된소리 → 예사소리, 비슷한 모음은 하나로, 겹받침은 풀어서
const FOLD = {
  ㄲ: 'ㄱ', ㄸ: 'ㄷ', ㅃ: 'ㅂ', ㅆ: 'ㅅ', ㅉ: 'ㅈ',
  ㅐ: 'ㅔ', ㅒ: 'ㅖ', ㅙ: 'ㅔ', ㅞ: 'ㅔ', ㅚ: 'ㅔ',
  ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ'
};
const isVowel = (c) => c >= 'ㅏ' && c <= 'ㅣ';

function decompose(s) {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code < 11172) {
      out += CHO[Math.floor(code / 588)] + JUNG[Math.floor((code % 588) / 28)] + JONG[code % 28];
    } else out += ch;
  }
  return out;
}

function compose(j) {
  let out = '';
  for (let i = 0; i < j.length; i++) {
    const L = CHO.indexOf(j[i]);
    const V = i + 1 < j.length ? JUNG.indexOf(j[i + 1]) : -1;
    if (L < 0 || V < 0) {
      out += j[i];
      continue;
    }
    let T = 0;
    const t = j[i + 2];
    if (t && !isVowel(t) && !(j[i + 3] && isVowel(j[i + 3]))) {
      const ti = JONG.indexOf(t);
      if (ti > 0) T = ti;
    }
    out += String.fromCharCode(0xac00 + (L * 21 + V) * 28 + T);
    i += T ? 2 : 1;
  }
  return out;
}

/** 한글만 남겨 비교용 꼴로: 쎅쓰·쉐엑스·ㅅㅔㄱㅅㅡ → 섹스, 씨빨 → 시발 */
function koKey(s) {
  let j = decompose(s.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, ''));
  j = [...j].map((c) => FOLD[c] ?? c).join('');
  // 늘여 쓰기: 모음 + ㅇ + 같은 모음 → 모음 하나 (세엑 → 섹)
  for (let k = 0; k < 3; k++) j = j.replace(/([ㅏ-ㅣ])ㅇ\1/g, '$1');
  return compose(j);
}

/* ───── 영문 ───── */
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
// 키릴 문자로 바꿔 쓰기
const HOMO = { а: 'a', е: 'e', о: 'o', с: 'c', р: 'p', х: 'x', у: 'y', к: 'k', м: 'm', т: 't', і: 'i' };

/** 영문 낱말들. 한 글자씩 띄워 쓴 것은 붙인다 (s e x → sex). '*' 는 아무 글자 하나 */
function latinTokens(s) {
  const mapped = [...s.toLowerCase()].map((c) => LEET[c] ?? HOMO[c] ?? c).join('');
  const raw = mapped.replace(/[^a-z*]+/g, ' ').trim().split(' ').filter(Boolean);
  const out = [];
  let run = '';
  for (const t of raw) {
    if (t.length === 1) run += t;
    else {
      if (run) out.push(run);
      run = '';
      out.push(t);
    }
  }
  if (run) out.push(run);
  return out;
}

/** 비교용 준비: NFKC(전각·호환 문자 정리) 뒤, NFKC 가 첫가끝 자모로 바꾼 것을 다시 호환 자모로 (ㅅㅔㄱㅅㅡ 가 깨지지 않게) */
function prep(s) {
  return [...String(s ?? '').normalize('NFKC')]
    .map((c) => {
      const u = c.charCodeAt(0);
      if (u >= 0x1100 && u <= 0x1112) return CHO[u - 0x1100];
      if (u >= 0x1161 && u <= 0x1175) return JUNG[u - 0x1161];
      if (u >= 0x11a8 && u <= 0x11c2) return JONG[u - 0x11a8 + 1];
      return c;
    })
    .join('');
}

export function normalizeText(s) {
  const t = prep(s);
  return `${koKey(t)}|${latinTokens(t).join('')}`;
}

/* ───── 금지어 ───── */
const KO_ALLOW = ['시발점', '시발역', '시발택시', '성교육', '자위대', '자위권', '자위적'].map(koKey);
// 두 글자 이하는 낱말(띄어 쓴 덩어리) 안에서만 찾는다 — "다시 발원" 같은 낱말 경계 오탐을 피하려고
const KO_SEXUAL = ['섹스', '섹시', '야동', '강간', '성교', '자위', '오르가즘', '딸딸이', '몸캠', '조건만남', '원조교제', '성매매', '성관계', '애널', '사까시', '펠라', '질싸', '노콘', '야한사진', '알몸'].map(koKey);
const KO_ABUSE = ['시발', '병신', '좆', '존나', '개새끼', '개새기', '개색기', '지랄', '미친놈', '미친년', '엠창', '니애미', '느금마', '닥쳐', '꺼져', '한남충', '김치녀', '틀딱', '짱깨', '쪽바리', '급식충', '맘충', '카지노', '토토사이트', '바카라', '출장안마', '홀덤'].map(koKey);
const JAMO_SEXUAL = ['ㅅㅅ'];
const JAMO_ABUSE = ['ㅅㅂ', 'ㅂㅅ', 'ㅈㄹ', 'ㄱㅅㄱ', 'ㅈㄴ', 'ㅁㅊ', 'ㄴㄱㅁ', 'ㅗㅗ'];
const EN_SEXUAL = ['sex', 'sexy', 'seks', 'cex', 'porn', 'porno', 'nude', 'nudes', 'xxx', 'slut', 'whore', 'rape', 'pussy', 'dick', 'cock', 'boobs', 'horny'];
const EN_ABUSE = ['fuck', 'fck', 'fuk', 'shit', 'bitch', 'asshole', 'bastard', 'motherfucker', 'cunt', 'retard', 'nigger', 'nigga', 'casino', 'toto'];
const EN_PREFIX = ['sex', 'porn', 'fuck'];

function hitKo(text, list) {
  // 낱말별로 보되, 한 글자씩 띄워 쓴 덩어리는 붙여서 본다 (시 발 → 시발). 개 새끼처럼 띄어 쓴 긴 말은 붙인 전체에서 본다
  const words = text.split(/\s+/).map(koKey).filter(Boolean);
  const merged = [];
  let run = '';
  for (const w of words) {
    if (w.length === 1) run += w;
    else {
      if (run) merged.push(run);
      run = '';
      merged.push(w);
    }
  }
  if (run) merged.push(run);
  const strip = (w) => KO_ALLOW.reduce((acc, a) => acc.split(a).join(' '), w);
  const tokens = merged.map(strip);
  const whole = strip(words.join(''));
  return list.some((k) => (k.length >= 3 ? whole.includes(k) : tokens.some((t) => t.includes(k))));
}

function hitJamo(text, list) {
  // 직접 친 자음·모음(완성되지 않은 글자)만 모아 초성 줄임을 찾는다 — 옷바구니(ㅅㅂ) 같은 완성 글자는 해당 없음
  const lone = [...text.replace(/[^ㄱ-ㅎㅏ-ㅣ]/g, '')].map((c) => FOLD[c] ?? c).join('');
  return list.some((k) => lone.includes(k));
}

function hitEn(tokens, list) {
  return tokens.some((t) => {
    if (t.includes('*')) {
      const re = new RegExp(`^${t.replace(/\*/g, '[a-z]')}$`);
      return list.some((w) => re.test(w));
    }
    return list.includes(t) || EN_PREFIX.some((p) => list.includes(p) && t.startsWith(p) && t.length <= p.length + 3);
  });
}

const URL_RE = /(https?:\/\/|www\.)/i;
const DOMAIN_RE = /[a-z0-9-]{2,}\s*(\.|닷|dot)\s*(com|net|org|kr|co|io|me|ly|xyz|site|shop|info|biz|app|dev|gg|tv|to|link|kr)\b/i;
const PHONE_RE = /(?:\d[\s.\-]?){9,}/;
// 메신저 이름만으로는 막지 않는다 (인스타 끊기, 텔레비전) — 뒤에 아이디가 붙거나 오픈채팅 초대일 때만
const MESSENGER_RE = /(카톡|카카오톡|카카오|텔레그램|라인|인스타|insta|kakao|telegram|line)\s*(아이디|id)?\s*[:：]?\s*@?[a-z0-9_.]{3,}/i;
const OPENCHAT_RE = /(오픈채팅|오픈톡|open\.kakao|@[a-z0-9_.]{4,})/i;
const NAME_CHARS = /^[가-힣a-zA-Z0-9 ·]+$/;
const RESERVED_KO = ['관리자', '운영자', '운영진', '청연산사', '공지', '시스템'].map(koKey);
const RESERVED_EN = ['admin', 'administrator', 'moderator', 'system', 'official'];

const clean = (s) => String(s ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f​-‏⁠﻿]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * @param {string} s
 * @param {{ kind: 'wish'|'name'|'chat', max?: number }} opts
 * @returns {{ ok: true, text: string } | { ok: false, reason: string, message: string }}
 */
export function checkText(s, { kind = 'wish', max } = {}) {
  const text = clean(s);
  const limit = kind === 'name' ? NAME_MAX : max ?? 200;
  const fail = (reason) => ({ ok: false, reason, message: reason === 'too_long' ? MESSAGES.too_long(limit) : MESSAGES[reason] });
  if (!text) return fail('empty');
  if (kind === 'name' && [...text].length < NAME_MIN) return fail('too_short');
  if ([...text].length > limit) return fail('too_long');
  if (kind === 'name' && !NAME_CHARS.test(text)) return fail('chars');
  const m = prep(text);
  if (URL_RE.test(m) || DOMAIN_RE.test(m)) return fail('link');
  if (PHONE_RE.test(m) || MESSENGER_RE.test(m) || OPENCHAT_RE.test(m)) return fail('contact');
  const en = latinTokens(m);
  if (hitKo(m, KO_SEXUAL) || hitJamo(m, JAMO_SEXUAL) || hitEn(en, EN_SEXUAL)) return fail('sexual');
  if (hitKo(m, KO_ABUSE) || hitJamo(m, JAMO_ABUSE) || hitEn(en, EN_ABUSE)) return fail('abuse');
  if (kind === 'name') {
    const k = koKey(m);
    if (RESERVED_KO.some((r) => k.includes(r)) || en.some((t) => RESERVED_EN.includes(t))) return fail('reserved');
  }
  return { ok: true, text };
}
