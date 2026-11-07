// tools/audio/build.py asmr 가 manifest.json 의 asmr 로 쓴다 — 손으로 고치지 말 것
// 테마 ASMR: 지역·주제가 뚜렷한 2분 넘는 원음을 그대로 (자연의 소리 듣기 창의 「테마 ASMR」). sec = ffprobe 실측 길이
export const ASMR_TRACKS = [
  {"id": "jiri-valley", "title": "지리산 산골짜기 물소리", "place": "지리산", "note": "바위 사이로 흐르는 골짜기 물", "group": "물", "file": "asmr/jiri-valley.m4a", "sec": 293.0, "url": "https://www.data.go.kr/data/15076211/fileData.do"},
  {"id": "dobong-summer", "title": "원도봉계곡의 여름", "place": "북한산 원도봉계곡", "note": "여름 계곡 물소리", "group": "물", "file": "asmr/dobong-summer.m4a", "sec": 293.0, "url": "https://www.data.go.kr/data/15076158/fileData.do"},
  {"id": "hwagae-dawn", "title": "화개천 새벽 계류", "place": "하동 화개천", "note": "새벽의 빠른 물살", "group": "물", "file": "asmr/hwagae-dawn.m4a", "sec": 193.3, "url": "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372472&menuNo=200020"},
  {"id": "yeongwon-gate", "title": "영원사 들머리 계류와 매미", "place": "치악산 영원사", "note": "오후의 계류, 그 위로 매미", "group": "물", "file": "asmr/yeongwon-gate.m4a", "sec": 181.5, "url": "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372522&menuNo=200020"},
  {"id": "dogap-spring", "title": "도갑사 미륵전 샘터", "place": "월출산 도갑사", "note": "샘터로 떨어지는 물", "group": "물", "file": "asmr/dogap-spring.m4a", "sec": 293.0, "url": "https://www.data.go.kr/data/15076172/fileData.do"},
  {"id": "baekryeon-rain", "title": "백련사 빗소리", "place": "덕유산 구천동 백련사", "note": "절 마당에 내리는 비", "group": "비", "file": "asmr/baekryeon-rain.m4a", "sec": 184.0, "url": "https://www.data.go.kr/data/15076128/fileData.do"},
  {"id": "guryong-rain", "title": "구룡사 비 오는 날", "place": "치악산 구룡사", "note": "빗속에 우는 풍경", "group": "비", "file": "asmr/guryong-rain.m4a", "sec": 293.0, "url": "https://www.data.go.kr/data/15076171/fileData.do"},
  {"id": "garisan-rain", "title": "가리산 숲속 소나기", "place": "홍천 가리산", "note": "숲에 쏟아지는 비", "group": "비", "file": "asmr/garisan-rain.m4a", "sec": 167.0, "url": "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372573&menuNo=200020"},
  {"id": "bongsan-storm", "title": "봉산 전망대 폭우", "place": "봉산 전망대", "note": "폭우와 멀리서 오는 천둥", "group": "비", "file": "asmr/bongsan-storm.m4a", "sec": 239.1, "url": "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372546&menuNo=200020"},
  {"id": "socheong-drip", "title": "소청도 빗물받이", "place": "옹진 소청도", "note": "처마 빗물받이로 가늘게 떨어지는 물", "group": "비", "file": "asmr/socheong-drip.m4a", "sec": 154.1, "url": "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372511&menuNo=200020"},
  {"id": "songni-gonjul", "title": "곤줄박이", "place": "속리산", "note": "텃새 곤줄박이의 낮 노래", "group": "새", "file": "asmr/songni-gonjul.m4a", "sec": 155.0, "url": "https://www.data.go.kr/data/15076183/fileData.do"},
  {"id": "songni-thrush", "title": "흰배지빠귀", "place": "속리산 화양동", "note": "새벽 숲의 지빠귀", "group": "새", "file": "asmr/songni-thrush.m4a", "sec": 293.0, "url": "https://www.data.go.kr/data/15076188/fileData.do"},
  {"id": "songni-cuckoo", "title": "뻐꾸기", "place": "속리산", "note": "초여름 낮의 뻐꾸기", "group": "새", "file": "asmr/songni-cuckoo.m4a", "sec": 190.0, "url": "https://www.data.go.kr/data/15076187/fileData.do"},
  {"id": "sancheong-scops", "title": "밤머리재 소쩍새", "place": "산청 밤머리재", "note": "봄밤의 소쩍새", "group": "새", "file": "asmr/sancheong-scops.m4a", "sec": 177.0, "url": "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371662&menuNo=200020"},
  {"id": "baekryeong-frogs", "title": "백령도 논 청개구리", "place": "백령도 진촌리", "note": "논을 메운 청개구리 소리", "group": "숲", "file": "asmr/baekryeong-frogs.m4a", "sec": 132.1, "url": "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371634&menuNo=200020"},
  {"id": "valley-frogs", "title": "계곡 숲 북방산개구리", "place": "계곡 숲", "note": "이른 봄 개구리와 새소리", "group": "숲", "file": "asmr/valley-frogs.m4a", "sec": 136.0, "url": "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372012&menuNo=200020"},
  {"id": "gangjin-crickets", "title": "백련사 가을밤 귀뚜라미", "place": "강진 백련사", "note": "청솔귀뚜라미들의 노래", "group": "숲", "file": "asmr/gangjin-crickets.m4a", "sec": 125.1, "url": "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371688&menuNo=200020"},
  {"id": "yeonhwa-insects", "title": "연화봉 가을 풀벌레", "place": "소백산 연화봉", "note": "바람 부는 가을 풀벌레", "group": "숲", "file": "asmr/yeonhwa-insects.m4a", "sec": 293.0, "url": "https://www.data.go.kr/data/15076169/fileData.do"},
  {"id": "jiri-cicadas", "title": "지리산둘레길 매미", "place": "지리산둘레길", "note": "한여름 소요산매미", "group": "숲", "file": "asmr/jiri-cicadas.m4a", "sec": 222.6, "url": "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371638&menuNo=200020"},
  {"id": "hwaeom-chime", "title": "화엄사 풍탁", "place": "지리산 화엄사", "note": "처마 끝 풍탁", "group": "절", "file": "asmr/hwaeom-chime.m4a", "sec": 177.0, "url": "https://www.data.go.kr/data/15076195/fileData.do"},
  {"id": "hwaeom-bell", "title": "화엄사 범종", "place": "지리산 화엄사", "note": "범종 타종", "group": "절", "file": "asmr/hwaeom-bell.m4a", "sec": 223.0, "url": "https://www.data.go.kr/data/15068173/fileData.do"},
  {"id": "mirae-tea", "title": "미래사 차의 시간", "place": "한려해상 미래사", "note": "찻물 끓이고 따르는 소리", "group": "절", "file": "asmr/mirae-tea.m4a", "sec": 221.1, "url": "https://www.data.go.kr/data/15076225/fileData.do"}
];
