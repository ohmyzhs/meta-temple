/**
 * 청연산사 (清蓮山寺) — 구역 정의, 자동 법명 사전, 연등 색, 초기 샘플 서원
 * 경전·죽비 카드·차담 지식베이스는 dharmaTexts.js 에 있다.
 */

// 24 × 24 = 576 가지 법명 (docs/02 §3.2)
export const DHARMA_PREFIXES = [
  '새벽안개 품은', '달빛 머금은', '솔바람 스치는', '비 개인 뒤의',
  '고요히 흐르는', '이끼 낀', '산그림자 드리운', '별빛 내려앉은',
  '첫눈 내린', '맑은 이슬 맺힌', '은은한 향기 나는', '천년을 기다린',
  '구름 너머의', '따스한 햇살 받은', '깊은 산속의', '여울물 닮은',
  '단정한 마음의', '차분히 깨어있는', '봄바람 타고 온', '가을 단풍 물든',
  '저녁노을 비친', '풍경 소리 머문', '안개 걷힌', '눈 덮인 산사의'
];

export const DHARMA_NOUNS = [
  '솔잎', '풍경', '연꽃', '여울', '돌계단', '산새',
  '대나무', '찻잔', '반딧불', '석탑', '목탁', '조약돌',
  '초승달', '산바람', '이끼', '연등', '샘물', '소나무',
  '구름', '도반', '향연', '목련', '징검돌', '기왓장'
];

export function generateDharmaName(exclude) {
  for (let i = 0; i < 8; i++) {
    const p = DHARMA_PREFIXES[Math.floor(Math.random() * DHARMA_PREFIXES.length)];
    const n = DHARMA_NOUNS[Math.floor(Math.random() * DHARMA_NOUNS.length)];
    const name = `${p} ${n}`;
    if (name !== exclude) return name;
  }
  return `${DHARMA_PREFIXES[0]} ${DHARMA_NOUNS[0]}`;
}

export const ZONES = {
  FOREST: {
    id: 'FOREST',
    index: 1,
    short: '일주문 숲길',
    name: '일주문 & 전나무 숲길',
    subtitle: '속세의 걸음을 늦추고 물소리와 함께 들어서는 산사 어귀',
    spawn: { x: 0, z: 34, ry: Math.PI },
    rituals: ['stone_pagoda']
  },
  COURTYARD: {
    id: 'COURTYARD',
    index: 2,
    short: '대웅전 앞마당',
    name: '대웅전 앞마당 & 삼층석탑',
    subtitle: '하늘의 소원 연등과 천년 석탑, 범종 소리가 어우러진 마당',
    spawn: { x: 0, z: 3, ry: Math.PI },
    rituals: ['wish_lantern', 'wish_tile', 'burn_worry', 'bell_strike', 'circumambulate']
  },
  DAEUNGJEON: {
    id: 'DAEUNGJEON',
    index: 3,
    short: '대웅전 법당',
    name: '대웅전 법당 (침묵 수행)',
    subtitle: '말없이 나란히 앉아 절과 염주, 사경으로 내면을 비우는 성소',
    spawn: { x: 0, z: -21.2, ry: Math.PI },
    rituals: ['practice_108', 'mala', 'incense', 'sutra_copy', 'yebul']
  },
  TEAHOUSE: {
    id: 'TEAHOUSE',
    index: 4,
    short: '후원 다실',
    name: '후원 다실 심검당 & 연꽃 연못',
    subtitle: '댓바람과 차 향기 속에서 선사와 1:1로 마음을 나누는 다실',
    spawn: { x: 19.2, z: -8.4, ry: Math.PI / 2 },
    rituals: ['tea_chat', 'dharma_card']
  }
};

export const RITUALS = {
  stone_pagoda: { short: '돌탑', label: '소원 돌탑' },
  wish_lantern: { short: '연등', label: '소원 연등' },
  wish_tile: { short: '기와', label: '기와 불사' },
  burn_worry: { short: '소각', label: '번뇌 소각' },
  bell_strike: { short: '범종', label: '범종 타종' },
  circumambulate: { short: '탑돌이', label: '탑돌이' },
  practice_108: { short: '108배', label: '108배', icon: 'prostrate' },
  mala: { short: '염주', label: '염주 돌리기', icon: 'practice_108' }, // 108배와 다른 자세라 창도 따로 (아이콘은 염주 그림)
  incense: { short: '헌향', label: '헌향 · 헌촉' },
  sutra_copy: { short: '사경', label: '사경' },
  yebul: { short: '예불', label: '예불 듣기' },
  tea_chat: { short: '차담', label: '선사 차담' },
  dharma_card: { short: '죽비', label: '오늘의 죽비' }
};

/** 하단 독에 바로 꺼내 두는 구역별 주 신행 (나머지는 「더보기」). 그림은 신행 id 와 같은 이름의 아이콘 */
export const DOCK_RITUALS = {
  FOREST: ['stone_pagoda'],
  COURTYARD: ['wish_lantern', 'bell_strike'],
  DAEUNGJEON: ['practice_108', 'yebul'],
  TEAHOUSE: ['tea_chat', 'dharma_card']
};

// 연등 4색 (docs/02 §2 Zone 2)
export const LANTERN_COLORS = [
  { id: 'pink', label: '연분홍', hex: '#f4a3b5' },
  { id: 'amber', label: '등황', hex: '#f3a24a' },
  { id: 'white', label: '백색', hex: '#f3ecdc' },
  { id: 'blue', label: '청색', hex: '#79a9d9' }
];

export const INITIAL_LANTERNS = [
  ['달빛 머금은 풍경', 'amber', '우리 가족 모두 올 한 해 아프지 않고 평안하기를 발원합니다.', 24],
  ['새벽안개 품은 솔잎', 'pink', '조급한 마음을 내려놓고 제 속도로 걸어갈 수 있는 지혜를 주소서.', 19],
  ['비 개인 뒤의 연꽃', 'pink', '준비하고 있는 시험과 새로운 시작에 흔들리지 않는 평온이 함께하길.', 31],
  ['고요히 흐르는 여울', 'blue', '무지개다리 건넌 우리 강아지가 별빛 아래서 행복하게 뛰어놀기를.', 42],
  ['산그림자 드리운 찻잔', 'white', '오늘 밤 이곳에 머무는 모든 도반들의 마음이 한결 가벼워지기를 바랍니다.', 27],
  ['첫눈 내린 돌계단', 'amber', '어머니의 수술이 무사히 끝나고 건강한 웃음을 되찾으시길 기도합니다.', 53],
  ['맑은 이슬 맺힌 산새', 'pink', '미워하는 마음 대신 이해하는 마음을 먼저 낼 수 있기를.', 16],
  ['구름 너머의 반딧불', 'white', '아버지가 계신 곳이 따뜻하고 평안하기를.', 38],
  ['저녁노을 비친 목련', 'amber', '새로 시작하는 회사에서 좋은 인연을 만나게 하소서.', 12],
  ['풍경 소리 머문 이끼', 'blue', '불면의 밤이 지나고 깊은 잠을 잘 수 있기를.', 21],
  ['차분히 깨어있는 소나무', 'pink', '아이가 건강하고 밝게 자라기를 발원합니다.', 33],
  ['안개 걷힌 징검돌', 'amber', '마음속 오래된 미움을 오늘은 조금 내려놓습니다.', 18],
  ['깊은 산속의 목탁', 'white', '할머니의 기억이 조금만 더 오래 머물기를.', 47],
  ['봄바람 타고 온 구름', 'pink', '좋아하는 사람과 오래오래 함께 걷기를.', 15],
  ['천년을 기다린 석탑', 'blue', '세상 모든 생명이 고통에서 벗어나 평안하기를.', 29],
  ['따스한 햇살 받은 샘물', 'amber', '취업 준비하는 동생에게 좋은 소식이 오기를.', 22],
  ['눈 덮인 산사의 연등', 'white', '나 자신에게 조금 더 다정해지기를.', 36],
  ['여울물 닮은 조약돌', 'pink', '이번 겨울 부모님 무릎이 덜 아프시기를.', 25]
].map(([author, color, wish, empathy], i) => ({
  id: `lantern_init_${i + 1}`,
  author,
  color: LANTERN_COLORS.find((c) => c.id === color).hex,
  wish,
  empathy,
  createdAt: '2026-11-04T19:00:00+09:00'
}));

export const INITIAL_TILES = [
  ['은은한 향기 나는 대나무', '가정 화목과 부모님 만수무강 발원'],
  ['구름 너머의 반딧불', '마음의 번뇌가 사라지고 매 순간 깨어있기를'],
  ['따스한 햇살 받은 석탑', '세상 모든 생명이 고통에서 벗어나 평안하기를'],
  ['가을 단풍 물든 여울', '우리 딸 수능 무사히'],
  ['솔바람 스치는 기왓장', '건강 회복 발원']
].map(([author, wish], i) => ({
  id: `tile_init_${i + 1}`,
  author,
  wish,
  createdAt: '2026-11-04T10:00:00+09:00'
}));

export const INITIAL_STONES = [
  ['깊은 산속의 목탁', '오늘 하루도 무사히 감사한 마음으로'],
  ['여울물 닮은 조약돌', '복잡한 생각을 숲길에 내려놓고 갑니다'],
  ['단정한 마음의 초승달', '나와 내 주변 사람들에게 다정할 수 있기를'],
  ['이끼 낀 징검돌', '천천히, 그러나 멈추지 않기'],
  ['비 개인 뒤의 산새', '내일은 오늘보다 조금 더 웃기를'],
  ['맑은 이슬 맺힌 소나무', '엄마에게 전화 한 통'],
  ['고요히 흐르는 구름', '지금 이 숨에 머물기']
].map(([author, wish], i) => ({
  author,
  wish,
  createdAt: new Date(Date.now() - (i + 1) * 17 * 60000).toISOString()
}));
