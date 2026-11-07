/**
 * 자료 출처 — 메뉴·도움말의 「자료 출처」 화면(ui/modalManager.js `_credits`)이 분류별로 보여 준다.
 * 공공누리 제1유형(출처표시)의 표시 의무를 이 화면으로 지킨다. 화면 곳곳에는 출처를 적지 않는다.
 * 분류: sound 소리 · scans 3D 스캔 · textures 사진 질감 · patterns 문양 · generated 생성형 도구 (빈 분류는 화면에 안 나옴)
 * 항목: { use: 쓴 곳, title: 원본 이름, by: 만든 곳, license, url }
 */
const KOGL1 = '공공누리 제1유형';

export const CREDITS = {
  // 자연의 소리·효과음: 원본에서 구간을 잘라 음량을 맞추고(-24 LUFS) 이음새를 겹쳐 AAC·MP3 로 압축 (tools/audio/build.py, 구간은 manifest.json)
  sound: [
  // <nature-sounds> tools/audio/build.py credits 가 manifest.json 으로 다시 쓴다 — 손으로 고치지 말 것
    { use: "계곡 물소리", title: "자연의소리_지리산산골짜기의물소리", by: "국립공원공단", license: "공공누리 제1유형", url: "https://www.data.go.kr/data/15076211/fileData.do" },
    { use: "계곡 물소리", title: "자연의소리_북한산원도봉계곡의여름", by: "국립공원공단", license: "공공누리 제1유형", url: "https://www.data.go.kr/data/15076158/fileData.do" },
    { use: "계곡 물소리", title: "화개천계곡_새벽 빠른계류", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372472&menuNo=200020" },
    { use: "빗소리", title: "자연의소리_덕유산구천동백련사빗소리", by: "국립공원공단", license: "공공누리 제1유형", url: "https://www.data.go.kr/data/15076128/fileData.do" },
    { use: "빗소리", title: "자연의소리_치악산구룡사비오는날풍경", by: "국립공원공단", license: "공공누리 제1유형", url: "https://www.data.go.kr/data/15076171/fileData.do" },
    { use: "빗소리", title: "가리산 숲속에 쏟아지는 비", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372573&menuNo=200020" },
    { use: "낙숫물", title: "소청도 빗물받이 가느다란 물소리", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372511&menuNo=200020" },
    { use: "먼 천둥", title: "봉산전망대 폭우와 멀리서 들리는 천둥소리", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372546&menuNo=200020" },
    { use: "대숲 바람", title: "숲_담양_죽녹원_오후_공간음", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13287859&menuNo=200020" },
    { use: "산새", title: "자연의소리_속리산곤줄박이소리", by: "국립공원공단", license: "공공누리 제1유형", url: "https://www.data.go.kr/data/15076183/fileData.do" },
    { use: "산새", title: "자연의소리_속리산 사내리 산솔새 소리", by: "국립공원공단", license: "공공누리 제1유형", url: "https://www.data.go.kr/data/15076181/fileData.do" },
    { use: "산새", title: "자연의소리_속리산 화양동 흰배지빠귀 소리", by: "국립공원공단", license: "공공누리 제1유형", url: "https://www.data.go.kr/data/15076188/fileData.do" },
    { use: "산새", title: "자연의소리_속리산 되지빠귀 소리", by: "국립공원공단", license: "공공누리 제1유형", url: "https://www.data.go.kr/data/15076180/fileData.do" },
    { use: "산새", title: "자연의소리_속리산 뻐꾸기 소리", by: "국립공원공단", license: "공공누리 제1유형", url: "https://www.data.go.kr/data/15076187/fileData.do" },
    { use: "소쩍새", title: "소쩍새 울음소리, 산청 밤머리재", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371662&menuNo=200020" },
    { use: "솔부엉이", title: "솔부엉이 두 마리가 우는 소리 (늘솔길공원)", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371671&menuNo=200020" },
    { use: "가을 풀벌레", title: "청솔귀뚜라미들의 노래, 가을밤 강진 백련사", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371688&menuNo=200020" },
    { use: "여름 매미", title: "지리산둘레길 소요산매미", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371638&menuNo=200020" },
    { use: "개구리", title: "백령도 진촌리 논에서 우는 청개구리 집단음", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371634&menuNo=200020" },
    { use: "대문 배경 소리 (음량 조정)", title: "계곡 숲의 북방산개구리 울음소리, 새소리와 함께", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372012&menuNo=200020" },
    { use: "법당 염불", title: "자연의소리_내장산백양사염불소리", by: "국립공원공단", license: "공공누리 제1유형", url: "https://www.data.go.kr/data/15076137/fileData.do" },
    { use: "연못 샘물", title: "자연의소리_월출산도갑사미륵전샘터", by: "국립공원공단", license: "공공누리 제1유형", url: "https://www.data.go.kr/data/15076172/fileData.do" },
    { use: "범종", title: "망경대산 만봉사 범종 소리", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372528&menuNo=200020" },
    { use: "처마 풍경(풍탁)", title: "자연의소리_지리산화엄사풍탁소리", by: "국립공원공단", license: "공공누리 제1유형", url: "https://www.data.go.kr/data/15076195/fileData.do" },
    { use: "마당 쓰는 소리", title: "전통사물_대나무빗자루_쓸다", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13287375&menuNo=200020" },
    { use: "화롯불", title: "Campfire 02", by: "HECKFRICKER (Freesound)", license: "CC0", url: "https://freesound.org/s/729396/" },
    { use: "개구리", title: "Pool Frogs with birds (Pelophylax lessonae)", by: "remmert (Freesound)", license: "CC0", url: "https://freesound.org/s/513978/" },
    { use: "돌풍", title: "silent windy pine forest", by: "bruno.auzet (Freesound)", license: "CC0", url: "https://freesound.org/s/670307/" },
    { use: "먼 천둥", title: "Dry storm thunders", by: "fran_marenco (Freesound)", license: "CC0", url: "https://freesound.org/s/796529/" },
    { use: "발소리", title: "Footsteps Gravel Stones - Walk", by: "Vrymaa (Freesound)", license: "CC0", url: "https://freesound.org/s/825854/" },
    { use: "발소리", title: "Footsteps forest", by: "Juno24 (Freesound)", license: "CC0", url: "https://freesound.org/s/474113/" },
    { use: "발소리", title: "Walk in dry leaves in the forest", by: "devy32 (Freesound)", license: "CC0", url: "https://freesound.org/s/437455/" },
    { use: "발소리", title: "footsteps socks wood", by: "Yuval (Freesound)", license: "CC0", url: "https://freesound.org/s/210770/" },
    { use: "발소리", title: "Footsteps - Wood Deck, Sneakers", by: "PMarcy (Freesound)", license: "CC0", url: "https://freesound.org/s/399309/" },
    { use: "발소리", title: "Stone Steps", by: "Phil25 (Freesound)", license: "CC0", url: "https://freesound.org/s/208103/" },
    { use: "발소리", title: "Footsteps on snow (clean)", by: "xkeril (Freesound)", license: "CC0", url: "https://freesound.org/s/611277/" },
    { use: "죽비", title: "Wooden staff hitting hand", by: "eveninx (Freesound)", license: "CC0", url: "https://freesound.org/s/434979/" },
    { use: "염주", title: "Beads - Manipulation", by: "Vrymaa (Freesound)", license: "CC0", url: "https://freesound.org/s/807390/" },
    { use: "돌탑 조약돌", title: "rocks on rocks", by: "_StudentofSound_ (Freesound)", license: "CC0", url: "https://freesound.org/s/703519/" },
    { use: "번뇌 소각", title: "1.10_burning-paper", by: "15GKovacovaJulie (Freesound)", license: "CC0", url: "https://freesound.org/s/461075/" },
    { use: "차 따르기", title: "Tea Pouring", by: "mdayalan (Freesound)", license: "CC0", url: "https://freesound.org/s/240125/" },
    { use: "도복 스침", title: "Cotton clothes rustling", by: "khenshom (Freesound)", license: "CC0", url: "https://freesound.org/s/481075/" },
    { use: "한지", title: "종이_넘기는_소리", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372326&menuNo=200020" },
    { use: "붓", title: "전통사물_붓_쓰다_글씨_천천히_ver.1", by: "(재)전주정보문화산업진흥원", license: "공공누리 제1유형", url: "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13287388&menuNo=200020" },
    { use: "수리부엉이", title: "Hibou Grand Duc", by: "barkenov (Freesound)", license: "CC0", url: "https://freesound.org/s/471507/" },
  // </nature-sounds>
    ...[
      ['목탁', '자연의소리_내장산학바위산사목탁소리', 15076130],
      ['예불 듣기', '자연의소리_월출산무위사극락보전사시예불', 15076174],
      ['예불 듣기', '자연의소리_변산반도개암사새벽예불소리', 15076175],
      ['예불 듣기', '자연의소리_내장산백양사염불소리', 15076137]
    ].map(([use, title, id]) => ({ use, title, by: '국립공원공단', license: KOGL1, url: `https://www.data.go.kr/data/${id}/fileData.do` }))
  ],
  // 실사 세계(world/real)에서 쓴다 — 줄이고(4만 삼각형) 색·노멀·AO 를 다시 구움 (tools/blender/scan_bake.py)
  scans: [
    { use: '마당 삼층석탑', title: '경주 고선사지 삼층석탑 3D 데이터', by: '국가유산청', license: KOGL1, url: 'https://digital.khs.go.kr/record/recordDetail3D.do?ichDataUid=13921661843230600369&bizId=20210000011' }
  ],
  textures: [],
  patterns: [],
  // 실사 세계(world/real)의 법당 삼존·후불벽 — 3D 모델 대신 생성형 사진을 세운 판 (프롬프트: docs/art/prompts/)
  generated: [
    { use: '법당 삼존 불상 사진·후불벽 탱화', title: 'gpt-image 생성 이미지', by: 'OpenAI', url: 'https://openai.com' },
    { use: '산문 현판 붓글씨 「清蓮山寺」', title: 'gpt-image 생성 이미지', by: 'OpenAI', url: 'https://openai.com' },
    { use: '대문 풍경 영상', title: '사용자 제공 이미지를 바탕으로 제작한 영상', by: 'Google Flow', url: 'https://labs.google/fx/tools/flow' }
  ]
};

/** 분류 제목과 한 줄 설명 */
export const CREDIT_GROUPS = {
  sound: { title: '소리', note: '산사에서 실제로 녹음한 소리를 잘라 음량을 맞추고 이어 붙여 씁니다. 국내에 없는 소리(겨울 숲·모닥불·수리부엉이·발소리 등)는 Freesound 의 CC0 녹음으로 채웠습니다.' },
  scans: { title: '3D 스캔' },
  textures: { title: '사진 질감' },
  patterns: { title: '문양' },
  generated: { title: '생성형 도구' }
};

export const LICENSE_URLS = { [KOGL1]: 'https://www.kogl.or.kr/info/licenseType1.do', CC0: 'https://creativecommons.org/publicdomain/zero/1.0/deed.ko' };

/**
 * 출처별 묶음 — 「자료 출처」 화면이 항목의 by 로 묶어 카드 하나에 보여 준다 (머리에 라이선스·원본 사이트를 한 번만).
 * Freesound 항목은 by 가 「올린 사람 (Freesound)」 — 묶음은 Freesound, 올린 사람은 항목 옆에.
 * strip: 화면에서 원본 이름 앞에서 뗄 말 (묶음 이름에 이미 있다)
 */
export const CREDIT_SOURCES = {
  국립공원공단: { name: '국립공원공단 「자연의소리」', site: '공공데이터포털', url: 'https://www.data.go.kr', strip: '자연의소리_' },
  '(재)전주정보문화산업진흥원': { name: '공유마당 자연음·전통사물 소리', site: '한국저작권위원회 공유마당', url: 'https://gongu.copyright.or.kr', note: '(재)전주정보문화산업진흥원 제작' },
  Freesound: { name: 'Freesound', site: 'freesound.org', url: 'https://freesound.org', note: '저작권을 포기한 녹음 — 올린 사람을 함께 적는다' },
  국가유산청: { name: '국가유산청', site: '국가유산 디지털 서비스', url: 'https://digital.khs.go.kr' },
  OpenAI: { name: 'OpenAI', site: 'openai.com', url: 'https://openai.com' }
};

/** 항목의 출처 묶음 이름과 (Freesound 면) 올린 사람 */
export function creditSource(c) {
  const m = /^(.*) \(Freesound\)$/.exec(c.by || '');
  return m ? { key: 'Freesound', author: m[1] } : { key: c.by, author: null };
}

/** 법당 「예불 듣기」 — 실제 사찰에서 녹음한 예불을 처음부터 끝까지 (국립공원공단 녹음 길이 그대로, 약 5분). sec = ffprobe 실측 길이 */
export const YEBUL_TRACKS = [
  { id: 'baekyang', title: '백양사 염불', place: '내장산 백양사', note: '목탁에 맞춘 염불', file: 'yebul-baekyang.mp3', sec: 292.9, url: 'https://www.data.go.kr/data/15076137/fileData.do' },
  { id: 'muwi', title: '무위사 사시예불', place: '월출산 무위사', note: '극락보전 사시예불', file: 'yebul-muwi.mp3', sec: 287.8, url: 'https://www.data.go.kr/data/15076174/fileData.do' },
  { id: 'gaeam', title: '개암사 새벽예불', place: '변산반도 개암사', note: '범종으로 여는 새벽예불', file: 'yebul-gaeam.mp3', sec: 292.9, url: 'https://www.data.go.kr/data/15076175/fileData.do' }
];
