import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkText, normalizeText, NAME_MIN, NAME_MAX } from './moderation.js';

const wish = (s) => checkText(s, { kind: 'wish', max: 80 });
const name = (s) => checkText(s, { kind: 'name' });

test('blocks_sexual_variants', () => {
  for (const s of ['쉐엑스', 'Cex', '세엑스', 'Sex', 'S e x', 'S.e.x', 's3x', '섹 스', '쎅쓰', '섹쓰', 'ㅅㅔㄱㅅㅡ', 'sex하자', '쌕스', 'ㅅㅅ하자', '야동 공유']) {
    const r = wish(s);
    assert.equal(r.ok, false, s);
    assert.equal(r.reason, 'sexual', s);
  }
});

test('blocks_abuse_variants', () => {
  for (const s of ['시발', '씨발', '시1발', 'ㅅㅂ', 'ㅆㅂ', '병신', '병1신', 'ㅂㅅ', '좆', '개새끼', '개 새끼', '지랄', 'fuck', 'f*ck', '씨빨', '시 발']) {
    const r = wish(s);
    assert.equal(r.ok, false, s);
    assert.equal(r.reason, 'abuse', s);
  }
});

test('blocks_links_contacts', () => {
  for (const s of ['www.abc.com', 'abc.kr', 'http://x', '010-1234-5678', '01012345678', '카톡 abc123', '오픈채팅 오세요']) {
    const r = wish(s);
    assert.equal(r.ok, false, s);
    assert.ok(r.reason === 'link' || r.reason === 'contact', `${s}: ${r.reason}`);
  }
});

test('allows_normal', () => {
  for (const s of ['건강기원', '부모님 부자 되세요', '로또대박기원🙏', '흐르는데로 편하게 지내다 가자', '아자아자', '시발점에서 다시', '섹션 정리', '엑스포 구경', '캬~~', '다시 발원합니다', '조절하며 살자', '시바견이랑 산책', '성교육 잘 받기', '보지 마세요 걱정을']) {
    const r = wish(s);
    assert.equal(r.ok, true, `${s}: ${r.reason}`);
  }
});

test('wish_length_and_empty', () => {
  assert.equal(wish('   ').reason, 'empty');
  assert.equal(checkText('가'.repeat(31), { kind: 'wish', max: 30 }).reason, 'too_long');
  const r = wish('  두   칸  ');
  assert.equal(r.ok, true);
  assert.equal(r.text, '두 칸');
});

test('name_rules', () => {
  assert.equal(NAME_MIN, 2);
  assert.equal(NAME_MAX, 10);
  assert.equal(name('').reason, 'empty');
  assert.equal(name('가').reason, 'too_short');
  assert.equal(name('가'.repeat(11)).reason, 'too_long');
  assert.equal(name('가'.repeat(10)).ok, true);
  for (const s of ['관리자', '운영자', 'admin', '청연산사']) assert.equal(name(s).reason, 'reserved', s);
  assert.equal(name('달빛🌙').reason, 'chars');
  assert.equal(name('씨발').reason, 'abuse');
  assert.equal(name('청풍 스님').ok, true);
  assert.equal(name('Moon River').ok, true);
});

test('normalize_examples', () => {
  assert.equal(normalizeText(' S.e.X '), normalizeText('sex'));
  assert.equal(normalizeText('ㅅㅔㄱㅅㅡ'), normalizeText('섹스'));
  assert.equal(normalizeText('쉐엑스'), normalizeText('섹스'));
});

test('chat_everyday_words_pass', () => {
  const chat = (s) => checkText(s, { kind: 'chat', max: 600 });
  for (const s of [
    '마음의 불이 꺼져 버린 것 같아요',
    '닥쳐올 일이 걱정돼요',
    '등불이 꺼져 가도 달빛은 남습니다. 찻물이 식기 전에 한 모금 드시지요.',
    '요즘 회사 일이 너무 힘들어서 잠을 못 자요',
    '엄마랑 크게 다퉜어요. 제가 잘못한 것 같아서 마음이 무거워요',
    '시험 결과가 나오는 날이라 떨려요',
    '자살예방상담전화 109로 전화하시면 24시간 언제든 마음을 들어 줄 사람이 있습니다.'
  ]) assert.equal(chat(s).ok, true, s);
  assert.equal(chat('씨발 진짜').reason, 'abuse');
  assert.equal(chat('섹스 얘기 하자').reason, 'sexual');
  assert.equal(checkText('꺼져', { kind: 'wish' }).reason, 'abuse'); // 공개 글은 그대로 막는다
});
