/**
 * 자료 출처 — 메뉴·도움말의 「자료 출처」 화면(ui/modalManager.js `_credits`)이 분류별로 보여 준다.
 * 공공누리 제1유형(출처표시)의 표시 의무를 이 화면으로 지킨다. 화면 곳곳에는 출처를 적지 않는다.
 * 분류: sound 소리 · scans 3D 스캔 · textures 사진 질감 · patterns 문양 · generated 생성형 도구 (빈 분류는 화면에 안 나옴)
 * 항목: { use: 쓴 곳, title: 원본 이름, by: 만든 곳, license, url }
 */
const KOGL1 = '공공누리 제1유형';

export const CREDITS = {
  // 모두 국립공원공단 「자연의소리」 영상에서 소리만 잘라 쓰고(구간 편집·음량 조정·압축) 공공데이터포털에서 받았다
  sound: [
    ['계곡 물소리', '자연의소리_지리산산골짜기의물소리', 15076211],
    ['솔바람', '자연의소리_경주남산의소나무숲과용장사', 15076196],
    ['산새 (산솔새)', '자연의소리_속리산 사내리 산솔새 소리', 15076181],
    ['산새 (곤줄박이)', '자연의소리_속리산곤줄박이소리', 15076183],
    ['가을 풀벌레', '자연의소리_소백산연화봉가을풀벌레소리', 15076169],
    ['산사 빗소리', '자연의소리_덕유산구천동백련사빗소리', 15076128],
    ['법당 염불', '자연의소리_내장산백양사염불소리', 15076137],
    ['연못 샘물', '자연의소리_월출산도갑사미륵전샘터', 15076172],
    ['범종', '자연의소리_지리산 화엄사 범종 타종', 15068173],
    ['처마 풍경(풍탁)', '자연의소리_지리산화엄사풍탁소리', 15076195],
    ['목탁', '자연의소리_내장산학바위산사목탁소리', 15076130],
    ['예불 듣기', '자연의소리_월출산무위사극락보전사시예불', 15076174],
    ['예불 듣기', '자연의소리_변산반도개암사새벽예불소리', 15076175]
  ].map(([use, title, id]) => ({ use, title, by: '국립공원공단', license: KOGL1, url: `https://www.data.go.kr/data/${id}/fileData.do` })),
  // 실사 세계(world/real)에서 쓴다 — 줄이고(4만 삼각형) 색·노멀·AO 를 다시 구움 (tools/blender/scan_bake.py)
  scans: [
    { use: '마당 삼층석탑', title: '경주 고선사지 삼층석탑 3D 데이터', by: '국가유산청', license: KOGL1, url: 'https://digital.khs.go.kr/record/recordDetail3D.do?ichDataUid=13921661843230600369&bizId=20210000011' }
  ],
  textures: [],
  patterns: [],
  generated: []
};

/** 분류 제목과 한 줄 설명 */
export const CREDIT_GROUPS = {
  sound: { title: '소리', note: '산사의 소리는 국립공원공단이 공공누리 제1유형(출처표시)으로 개방한 「자연의소리」를 이용했습니다. 원본은 공공데이터포털에서 무료로 받을 수 있습니다.' },
  scans: { title: '3D 스캔' },
  textures: { title: '사진 질감' },
  patterns: { title: '문양' },
  generated: { title: '생성형 도구' }
};

export const LICENSE_URLS = { [KOGL1]: 'https://www.kogl.or.kr/info/licenseType1.do' };

/** 법당 「예불 듣기」 — 실제 사찰에서 녹음한 예불을 처음부터 끝까지 (국립공원공단 녹음 길이 그대로, 약 5분). sec = ffprobe 실측 길이 */
export const YEBUL_TRACKS = [
  { id: 'baekyang', title: '백양사 염불', place: '내장산 백양사', note: '목탁에 맞춘 염불', file: 'yebul-baekyang.mp3', sec: 292.9, url: 'https://www.data.go.kr/data/15076137/fileData.do' },
  { id: 'muwi', title: '무위사 사시예불', place: '월출산 무위사', note: '극락보전 사시예불', file: 'yebul-muwi.mp3', sec: 287.8, url: 'https://www.data.go.kr/data/15076174/fileData.do' },
  { id: 'gaeam', title: '개암사 새벽예불', place: '변산반도 개암사', note: '범종으로 여는 새벽예불', file: 'yebul-gaeam.mp3', sec: 292.9, url: 'https://www.data.go.kr/data/15076175/fileData.do' }
];
