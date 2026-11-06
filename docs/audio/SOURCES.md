# 자연의 소리 늘리기 — 1단계 소리 목록과 출처 (2026-11-06 조사)

나중에 토스로 돈을 받을 계획이라 **상업적 이용이 되는 것만** 후보로 올렸다.
쓸 수 있는 것: 공공누리 제1유형, 제3유형(변경 금지 — 자르기·섞기 불가), CC0, Pixabay License.

사용자 결정(2026-11-06): **유료 음원은 쓰지 않는다(산 로열티프리 포함)** · **직접 녹음은 없다** · **폭포는 경내에 없으니 뺀다** · **경내를 걸을 때의 발소리와 행동 효과음도 녹음으로 개선한다** (아래 3장).
뺀 것: 공공누리 2·4유형, CC BY-NC, BBC Sound Effects. CC BY 는 상업 가능하지만 허용 목록 밖이라 따로 표시했다.

## 0. 먼저 알아 둘 것

### 지금 소리가 낮은 품질인 까닭은 원본이 아니라 예전 가공이다
- 국립공원공단 「자연의소리」 원본은 **AAC 48kHz 스테레오 192~384kbps, 길이 약 5분**(범종은 11분 40초)인 MP4 영상이다.
- 지금 `web/assets/audio` 의 파일은 여기서 **60~120초만 잘라 모노 64~96kbps 로 줄인 것**이다(계곡·샘물·염불은 모노 64k).
- 같은 원본에서 길게(스테레오, 48kHz) 다시 자르기만 해도 반복과 음질 문제가 크게 준다. 라이선스 위험도 새로 생기지 않는다.

### 국립공원공단 라이선스 원문 확인
- 지금 쓰는 13개(계곡·솔바람·산새 2·풀벌레·빗소리·염불·샘물·범종·풍탁·목탁·예불 2)와 아래 후보 55개를 data.go.kr 에서 하나씩 열어 보았다.
- **이용허락범위 칸은 전부 「공공저작물 : 출처표시 (제 1유형)」**이다. 페이지의 구조화 데이터(`license`)도 `kogl.or.kr/info/licenseType1.do` 로 같다.
- 그런데 **설명문 끝에는 모든 항목에 같은 문장이 붙어 있다**: 「유튜브 및 공단 누리집 연계 활용도 가능하며, 기관·민간의 비상업적 활용에 적합합니다.」
  - 87개 항목이 모두 같은 틀의 설명이고 수정일이 2025-06-12~13 이라 한꺼번에 다시 쓴 설명으로 보인다.
  - 효력은 이용허락범위(1유형, 상업 가능)가 정하는 것이 보통이지만, 두 글이 어긋나 있다.
  - **권장**: 토스 결제를 붙이기 전에 페이지에 적힌 담당 「국립공원공단 AI데이터팀 033-769-9424」에 상업 이용이 되는지 서면(메일)으로 확인해 두기. 이 확인이 표 승인을 막지는 않는다.
- `무등산자연의소리`(15104867) 는 이용허락범위가 「이용허락범위 제한 없음」으로, 공공누리 유형이 아니다 → 후보에서 뺐다.

### 조사하면서 받은 것 (승인 전)
- 국립공원공단 영상의 길이·오디오 사양을 표에 넣으려고, 68개 파일의 **앞머리 400KB 씩만**(전체 크기의 0.2%) 읽어 ffprobe 로 재고 바로 지웠다.
  서버가 부분 받기를 막아 이 방법밖에 없었지만, 「받기 전에 묻기」 원칙에 어긋났다. 이후로는 승인 전에 더 받지 않는다.
- 403MB 짜리 7개(2021 묶음)는 앞머리에 정보가 없어 「?」로 남겼다.

### 받는 방법과 걸림돌
| 출처 | 받는 방법 | 걸림돌 |
|---|---|---|
| 공공데이터포털(국립공원공단) | 로그인 없이 바로 받기. 받기 전 `check-limit` 를 불러 보안문자가 필요하면 **멈춘다(우회 안 함)** | 파일이 크다(133~403MB) |
| 공유마당 | 상세 페이지에서 「이용범위 동의」 체크 → **첫 1회 설문 제출** → 받기 | 약관 동의·설문 제출은 사용자 승인이 필요 |
| Freesound | 원본은 **로그인해야** 받는다. 미리듣기(mp3 128k)는 로그인 없이 | 계정 만들기·로그인은 제가 못 함 → 사용자가 브라우저 창에서 로그인하거나, 직접 받아 폴더에 넣기 |
| Pixabay | 「Free download」 단추. 로그인이 필요한지는 확인 못 함 | 사양(채널·샘플레이트)이 페이지에 없음 |

### 라이선스별 조건
- **공공누리 1유형**: 상업 이용·변경 가능, 출처 표시 의무 → `credits.js` 「자료 출처」 화면에 올린다.
- **CC BY**: 상업 이용·변경 가능, 저작자 표시 의무. (허용 목록에 명시는 없음 — 고르면 출처 화면에 저작자 이름을 적는다)
- **Pixabay Content License**: 상업 이용 가능, 출처 표시 의무 없음. 단 **가공하지 않은 원본을 그대로 따로 내려받게 하거나 파는 것(standalone)은 금지**.
  우리 사이트는 `assets/audio/` 의 파일을 공개 주소로 내보내므로, Pixabay 소리는 **자르고 다른 소리와 섞어 장면 속에서만** 쓴다(원본 그대로 한 파일로 두지 않는다).
  또 Pixabay 의 `freesound_community` 계정 항목은 Freesound 에서 옮겨 온 것이라, 고르면 Freesound 원본 쪽 라이선스도 다시 확인한다.
- **공공누리 3유형**(예: 국립중앙박물관 성덕대왕신종): 자르기·루프·페이드·섞기 불가 → 장면 소리로는 못 쓴다.
- **국립생물자원관 소리**: 팝업에는 1유형 마크가 있으나 자료실 고지는 3유형이고, 받기 경로가 없다 → 뺐다.

## 1. 장면별 후보

표의 크기는 받을 파일 크기다. 공유마당 MP3 크기는 페이지에 없어서 비트레이트 × 길이로 **추정**했다(「≈」).
비고의 「사람 소리 확인」은 받은 뒤 스펙트로그램으로 확인할 항목이다.

### 국립공원공단 「자연의소리」 (공공데이터포털, 공공누리 1유형) — 원본은 MP4 영상, 소리만 뽑는다

#### 계곡 여울

| 원본 | 링크 | 라이선스 | 길이 | 오디오 | 크기 | 비고 |
|---|---|---|---|---|---|---|
| 지리산산골짜기의물소리 | [data.go.kr/15076211](https://www.data.go.kr/data/15076211/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 현재 계곡 원본 |
| 북한산원도봉계곡의여름 | [data.go.kr/15076158](https://www.data.go.kr/data/15076158/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB |  |
| 태백산검룡소가는길 | [data.go.kr/15076213](https://www.data.go.kr/data/15076213/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB |  |
| 지리산중봉골물떨어지는소리 | [data.go.kr/15076194](https://www.data.go.kr/data/15076194/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 작은 물줄기 |
| 지리산 화엄계곡 치유 탐방로 | [data.go.kr/15076215](https://www.data.go.kr/data/15076215/fileData.do) | 1유형 | 5:05 | AAC 48k 2ch 384k | 178MB | 탐방로 — 발소리 가능 |

#### 처마 낙숫물·소나기

| 원본 | 링크 | 라이선스 | 길이 | 오디오 | 크기 | 비고 |
|---|---|---|---|---|---|---|
| 덕유산구천동백련사빗소리 | [data.go.kr/15076128](https://www.data.go.kr/data/15076128/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 현재 빗소리 원본 |
| 치악산구룡사비오는날풍경 | [data.go.kr/15076171](https://www.data.go.kr/data/15076171/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 절 마당 비 + 풍경일 수 있음 |
| 내장산쌍계루연못빗소리 | [data.go.kr/15076206](https://www.data.go.kr/data/15076206/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 연못에 듣는 비 |
| 소백산비내리는늦은목이자락길 | [data.go.kr/15076159](https://www.data.go.kr/data/15076159/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB |  |
| 한려해상 비오는 국립공원 | [data.go.kr/15076224](https://www.data.go.kr/data/15076224/fileData.do) | 1유형 | 5:06 | AAC 48k 2ch 384k | 178MB |  |
| 계룡산수통골동굴물떨어지는소리 | [data.go.kr/15076199](https://www.data.go.kr/data/15076199/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 동굴 물방울 — 낙숫물 원샷용 |
| 덕유산구천동약숫물소리 | [data.go.kr/15076129](https://www.data.go.kr/data/15076129/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 약숫물 — 낙숫물 원샷용 |

#### 솔바람·억새 (대숲 없음)

| 원본 | 링크 | 라이선스 | 길이 | 오디오 | 크기 | 비고 |
|---|---|---|---|---|---|---|
| 경주남산의소나무숲과용장사 | [data.go.kr/15076196](https://www.data.go.kr/data/15076196/fileData.do) | 1유형 | 5:48 | AAC 48k 2ch 192k | 195MB | **뺌** — 명상 안내 내레이션 영상 (아래 「말소리 검사」) |
| 소백산연화봉바람소리 | [data.go.kr/15076164](https://www.data.go.kr/data/15076164/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB |  |
| 지리산장터목의가을바람 | [data.go.kr/15076210](https://www.data.go.kr/data/15076210/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB |  |
| 주왕산내원마을억새 | [data.go.kr/15076146](https://www.data.go.kr/data/15076146/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 억새 스치는 소리 |
| 경주남산용장골풍경 | [data.go.kr/15076198](https://www.data.go.kr/data/15076198/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB |  |

#### 산새 (시간대별)

| 원본 | 링크 | 라이선스 | 길이 | 오디오 | 크기 | 비고 |
|---|---|---|---|---|---|---|
| 속리산곤줄박이소리 | [data.go.kr/15076183](https://www.data.go.kr/data/15076183/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 186MB | 현재 산새 원본 · 낮 |
| 속리산 사내리 산솔새 소리 | [data.go.kr/15076181](https://www.data.go.kr/data/15076181/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 186MB | 현재 산새2 원본 · 낮 |
| 속리산 화양동 흰배지빠귀 소리 | [data.go.kr/15076188](https://www.data.go.kr/data/15076188/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 186MB | 지빠귀 — 새벽 |
| 속리산 되지빠귀 소리 | [data.go.kr/15076180](https://www.data.go.kr/data/15076180/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 186MB | 지빠귀 — 새벽 |
| 덕유산덕유대야영장의아침햇살 | [data.go.kr/15076132](https://www.data.go.kr/data/15076132/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 아침 |
| 속리산 노랑턱멧새 소리 | [data.go.kr/15076191](https://www.data.go.kr/data/15076191/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 186MB | 낮 |
| 속리산 뻐꾸기 소리 | [data.go.kr/15076187](https://www.data.go.kr/data/15076187/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 186MB | 초여름 낮 |
| 속리산 삼가저수지 검은등뻐꾸기 소리 | [data.go.kr/15076214](https://www.data.go.kr/data/15076214/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 186MB | 초여름 낮 |
| 속리산 화양동 매사촌 소리 | [data.go.kr/15076178](https://www.data.go.kr/data/15076178/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 186MB | 해질녘·밤에도 욺 |
| 지리산 물까치 소리 | [data.go.kr/15076217](https://www.data.go.kr/data/15076217/fileData.do) | 1유형 | 5:20 | AAC 48k 2ch 384k | 187MB |  |

#### 봄 개구리

| 원본 | 링크 | 라이선스 | 길이 | 오디오 | 크기 | 비고 |
|---|---|---|---|---|---|---|
| 무등산 평두메습지 북방산 개구리 울음 | [data.go.kr/15076230](https://www.data.go.kr/data/15076230/fileData.do) | 1유형 | 5:14 | AAC 48k 2ch 384k | 183MB |  |
| 속리산 북방산개구리 소리 | [data.go.kr/15076190](https://www.data.go.kr/data/15076190/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 185MB |  |
| 주왕산절골두꺼비여름나기 | [data.go.kr/15076170](https://www.data.go.kr/data/15076170/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 두꺼비 |
| 무등산장불재의봄 | [data.go.kr/15076208](https://www.data.go.kr/data/15076208/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB |  |

#### 여름 매미

| 원본 | 링크 | 라이선스 | 길이 | 오디오 | 크기 | 비고 |
|---|---|---|---|---|---|---|
| 다도해보길도세연정의매미소리 | [data.go.kr/15076173](https://www.data.go.kr/data/15076173/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB |  |
| 무등산의여름 | [data.go.kr/15076209](https://www.data.go.kr/data/15076209/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB |  |
| 지리산 쌍계사 소나무 숲 매미 소리 | [data.go.kr/15068205](https://www.data.go.kr/data/15068205/fileData.do) | 1유형 | ? | ? (앞머리에 정보 없음) | 403MB |  |

#### 가을 풀벌레

| 원본 | 링크 | 라이선스 | 길이 | 오디오 | 크기 | 비고 |
|---|---|---|---|---|---|---|
| 소백산연화봉가을풀벌레소리 | [data.go.kr/15076169](https://www.data.go.kr/data/15076169/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 현재 풀벌레 원본 |
| 내장산일광정풀벌레소리 | [data.go.kr/15076131](https://www.data.go.kr/data/15076131/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB |  |
| 변산반도개암저수지풀벌레소리 | [data.go.kr/15076207](https://www.data.go.kr/data/15076207/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB |  |
| 태백산을채우는가을소리 | [data.go.kr/15076212](https://www.data.go.kr/data/15076212/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB |  |
| 가야산 풀벌레와 뻐꾸기 소리 | [data.go.kr/15076228](https://www.data.go.kr/data/15076228/fileData.do) | 1유형 | 5:22 | AAC 48k 2ch 384k | 188MB | 뻐꾸기 섞임 |

#### 범종·풍경·목탁·법고

| 원본 | 링크 | 라이선스 | 길이 | 오디오 | 크기 | 비고 |
|---|---|---|---|---|---|---|
| 지리산 화엄사 범종 타종 | [data.go.kr/15068173](https://www.data.go.kr/data/15068173/fileData.do) | 1유형 | 11:40 | AAC 48k 2ch 192k | 392MB | 현재 범종 원본 |
| 오대산월정사타종소리 | [data.go.kr/15076157](https://www.data.go.kr/data/15076157/fileData.do) | 1유형 | 4:59 | AAC 48k 2ch 192k | 167MB | 다른 종 |
| 지리산화엄사풍탁소리 | [data.go.kr/15076195](https://www.data.go.kr/data/15076195/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 현재 풍경 원본 |
| 내장산학바위산사목탁소리 | [data.go.kr/15076130](https://www.data.go.kr/data/15076130/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 현재 목탁 원본 |
| 오대산월정사법고소리 | [data.go.kr/15076155](https://www.data.go.kr/data/15076155/fileData.do) | 1유형 | 7:42 | AAC 48k 2ch 192k | 259MB | 법고 |

#### 찻물

| 원본 | 링크 | 라이선스 | 길이 | 오디오 | 크기 | 비고 |
|---|---|---|---|---|---|---|
| 한려해상 미래사 차의 시간 | [data.go.kr/15076225](https://www.data.go.kr/data/15076225/fileData.do) | 1유형 | 3:48 | AAC 48k 2ch 384k | 133MB | 차 따르기 추정 — 사람 소리 확인 필요 |

#### 연못 샘물·염불 (현재 사용)

| 원본 | 링크 | 라이선스 | 길이 | 오디오 | 크기 | 비고 |
|---|---|---|---|---|---|---|
| 월출산도갑사미륵전샘터 | [data.go.kr/15076172](https://www.data.go.kr/data/15076172/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 현재 샘물 원본 |
| 내장산백양사염불소리 | [data.go.kr/15076137](https://www.data.go.kr/data/15076137/fileData.do) | 1유형 | 5:00 | AAC 48k 2ch 192k | 168MB | 현재 염불·예불 원본 |


### 공유마당 (공공누리 1유형, 출처 「(재)전주정보문화산업진흥원」) — JICA 2022 자연음은 MP3 320k/48kHz

| 장면 | 원본 | 링크 | 라이선스 | 길이 | 오디오 | 크기 | 비고 |
|---|---|---|---|---|---|---|---|
| 계곡 | 화개천계곡_새벽 빠른계류 | [13372472](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372472&menuNo=200020) | 1유형 | 3:13 | MP3 320k 48k | ≈7.7MB | |
| 계곡 | 지리산 형제봉 계곡 작은 폭포 거품 | [13372468](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372468&menuNo=200020) | 1유형 | 2:29 | MP3 320k 48k | ≈6.0MB | 가까운 물 |
| 비 | 가리산 숲속에 쏟아지는 비 | [13372573](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372573&menuNo=200020) | 1유형 | 2:46 | MP3 320k 48k | ≈6.6MB | |
| 낙숫물 | 소청도 빗물받이 가느다란 물소리 | [13372511](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372511&menuNo=200020) | 1유형 | 2:34 | MP3 320k 48k | ≈6.2MB | 처마 낙숫물 대용 |
| 낙숫물 | 백령도 빗물받이 관로 물소리 | [13372521](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372521&menuNo=200020) | 1유형 | 2:10 | MP3 320k 48k | ≈5.2MB | 관로 울림(금속성) 가능 |
| 먼 천둥 | 봉산전망대 폭우와 멀리서 들리는 천둥 | [13372546](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372546&menuNo=200020) | 1유형 | 3:59 | MP3 320k 48k | ≈9.6MB | |
| 먼 천둥 | 봉산 숲길 작은빗소리와 천둥 | [13372547](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372547&menuNo=200020) | 1유형 | 4:49 | MP3 320k 48k | ≈11.6MB | |
| 대숲 | 담양 죽녹원 대나무숲 공간음 | [13287859](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13287859&menuNo=200020) | 1유형 | 3:41 | MP3 127k 48k | ≈3.5MB | 관광지 — 사람 소리 확인 |
| 대숲·솔숲 | 사려니숲 바람부는 | [13287870](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13287870&menuNo=200020) | 1유형 | 6:49 | MP3 127k 48k | ≈6.5MB | |
| 산새 | 운곡서원길 대숲 새소리 | [13372497](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372497&menuNo=200020) | 1유형 | 3:56 | MP3 320k 48k | ≈9.4MB | 딱따구리·뻐꾸기 |
| 소쩍새 | 소쩍새 울음소리, 산청 밤머리재 | [13371662](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371662&menuNo=200020) | 1유형 | 2:57 | MP3 320k 48k 스테레오 | ≈7.1MB | |
| 소쩍새 | 한밤 중베짱이 소리와 소쩍새 | [13371612](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371612&menuNo=200020) | 1유형 | 2:06 | MP3 320k 48k 스테레오 | ≈5.0MB | 지리산 |
| 부엉이 | 솔부엉이 두 마리 | [13371671](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371671&menuNo=200020) | 1유형 | 1:19 | MP3 320k 48k 모노 | ≈3.2MB | 도시공원 — 생활 소음 확인 |
| 봄 개구리 | 계곡 숲의 북방산개구리 + 새소리 | [13372012](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372012&menuNo=200020) | 1유형 | 2:16 | MP3 320k 48k 모노 | ≈5.4MB | 이른 봄 |
| 봄 개구리 | 백령도 논 청개구리 집단음 | [13371634](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371634&menuNo=200020) | 1유형 | 2:12 | MP3 320k 48k 모노 | ≈5.3MB | 늦봄 논 |
| 여름 매미 | 치악산 영원사 입구 계류와 소요산매미 | [13372522](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372522&menuNo=200020) | 1유형 | 3:01 | MP3 320k 48k | ≈7.2MB | 절 입구 |
| 여름 매미 | 지리산둘레길 소요산매미 | [13371638](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371638&menuNo=200020) | 1유형 | 3:42 | MP3 320k 48k 스테레오 | ≈8.9MB | |
| 여름 매미 | 우거진 숲 참매미 | [13371841](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371841&menuNo=200020) | 1유형 | 0:49 | MP3 320k 48k 스테레오 | ≈2.0MB | 가까운 한 마리 |
| 가을 귀뚜라미 | 청솔귀뚜라미들의 노래, 가을밤 강진 백련사 | [13371688](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371688&menuNo=200020) | 1유형 | 2:05 | MP3 320k 48k 모노 | ≈5.0MB | 절 |
| 가을 귀뚜라미 | 가랑비 내리는 봉선사 뒷산 숲 귀뚜라미 | [13371746](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13371746&menuNo=200020) | 1유형 | 2:15 | MP3 320k 48k 모노 | ≈5.4MB | 절 뒷산 |
| 범종 | 망경대산 만봉사 범종 소리 | [13372528](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372528&menuNo=200020) | 1유형 | 2:19 | MP3 320k 48k | ≈5.6MB | 10m 거리 |
| 마당 쓸기 | 전통사물_대나무빗자루_쓸다 | [13287375](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13287375&menuNo=200020) | 1유형 | 0:36 | MP3 96k 32k 스테레오 | ≈0.4MB | 낮은 음질, 멀리 들리게 씀 |
| 찻물 | 전통사물_쇠주전자_따르다_물_느리게 | [13287397](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13287397&menuNo=200020) | 1유형 | 0:37 | MP3 96k 32k 스테레오 | ≈0.4MB | |
| 화로 | 전통사물_화로_뒤적이다 | [13287478](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13287478&menuNo=200020) | 1유형 | 0:30 | MP3 127k 48k 스테레오 | ≈0.5MB | |
| 눈 밟기 | 눈 밟는 소리 | [13220735](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13220735&menuNo=200020) | **CC BY** | 0:54 | MP3 320k 44.1k | ≈2.2MB | 한국저작권위원회 |
| 풍경 | 사찰 풍경소리 | [13220756](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13220756&menuNo=200020) | **CC BY** | 0:32 | MP3 320k 44.1k | ≈1.3MB | |
| 모닥불 | 타닥타닥 모닥불 태우는 소리 | [13220748](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13220748&menuNo=200020) | **CC BY** | 1:55 | MP3 320k 44.1k | ≈4.6MB | |

뺀 것: 성덕대왕신종(공공누리 3유형, 변경 금지), 실상사 염불·목탁(사람 목소리), 선운사 저녁예불(법구가 섞임), 조계사(이름 부르는 소리).

### Pixabay (Pixabay Content License — 상업 가능, 출처 표시 불필요, 원본 그대로 배포 금지)

페이지에는 길이와 「MP3」만 나오고 샘플레이트·채널·비트레이트가 없다. 받은 뒤에야 안다.
범종·목탁·소쩍새는 맞는 것이 없었다(교토 종 2초, 미얀마 종, 크로아티아 소쩍새 등).

| 장면 | 원본 | 링크 | 길이 | 올린 이 | 비고 |
|---|---|---|---|---|---|
| 계곡 | Bubbling Mountain Stream | [186926](https://pixabay.com/sound-effects/nature-bubbling-mountain-stream-flowing-water-nature-sound-186926/) | 4:48 | rdicksonoutdoors | |
| 비 | Soft rain on a tile roof | [14515](https://pixabay.com/sound-effects/nature-soft-rain-on-a-tile-roof-14515/) | 8:46 | freesound_community (richwise) | 기와지붕 비 |
| 먼 천둥 | Distant Thunder | [19162](https://pixabay.com/sound-effects/nature-distant-thunder-19162/) | 7:07 | freesound_community (richwise) | 천둥만 |
| 솔바람 | Wind through trees in a pine forrest | [208856](https://pixabay.com/sound-effects/nature-wind-through-trees-in-a-pine-forrest-208856/) | 4:02 | Dia_Pazon | |
| 대숲 | bamboo forest (2) | [17668](https://pixabay.com/sound-effects/city-bamboo-forest-2-17668/) | 1:45 | freesound_community (Codly) | 대 삐걱임·잎 |
| 새벽 산새 | Bird Song Dawn Chorus | [53470](https://pixabay.com/sound-effects/nature-bird-song-dawn-chorus-53470/) | 10:50 | freesound_community (James2nd) | 유럽 새일 가능성 |
| 여름 매미 | Cicada Sounds | [24958](https://pixabay.com/sound-effects/nature-cicada-sounds-24958/) | 15:07 | freesound_community (Gnomun) | 한국 종 아닐 수 있음 |
| 귀뚜라미 | crickets | [17862](https://pixabay.com/sound-effects/nature-crickets-17862/) | 4:18 | freesound_community (ES335-001) | |
| 눈 밟기 | Footsteps in Deep Snow | [16761](https://pixabay.com/sound-effects/nature-footsteps-in-deep-snow-16761/) | 2:34 | freesound_community (Kinoton) | |
| 겨울 숲 | Mountain forest winter amb trees creak light wind | [49062](https://pixabay.com/sound-effects/nature-mountain-forest-winter-amb-trees-creak-light-wind-banff-190107-49062/) | 2:45 | freesound_community (TRP) | 나무 삐걱·약한 바람 |
| 마당 쓸기 | Sweeping The Front | [63473](https://pixabay.com/sound-effects/film-special-effects-sweeping-the-front-63473/) | 0:54 | freesound_community (DuranBurrus) | |
| 찻물 | Pouring tea | [70635](https://pixabay.com/sound-effects/household-pouring-tea-70635/) | 0:15 | freesound_community (BeeProductive) | |
| 모닥불 | Warm Camp Fire (High Quality) | [176816](https://pixabay.com/sound-effects/nature-warm-camp-fire-high-quality-176816/) | 3:02 | Prem_Adhikary | |
| 모닥불 | Crackle Fireplace Campfire | [402289](https://pixabay.com/sound-effects/nature-crackle-fireplace-campfire-402289/) | 2:14 | CapaholiczSFX | |


### Freesound (CC0 — 상업 가능, 출처 표시 의무 없음) — 원본(WAV/FLAC) 받기는 로그인 필요

한국 녹음이 거의 없어(서울 올림픽공원 겨울새 하나), 국내 출처에 없는 것을 채우는 데만 쓴다.
소쩍새(*Otus sunia*)·한국 매미·목탁·한국 풍경의 CC0 녹음은 없었다.

| 장면 | 원본 | 링크 | 길이 | 오디오 | 크기 | 비고 |
|---|---|---|---|---|---|---|
| 계곡 | Mountain Stream … Torrente Pettorina | [869104](https://freesound.org/people/bassimat/sounds/869104/) | 6:58 | WAV 48k/32 스테레오 | 153MB | 돌로미티 급류 |
| 낙숫물 | Rain gutter zleb 003 | [652260](https://freesound.org/people/frenkfurth/sounds/652260/) | 10:06 | WAV 48k/16 스테레오 | 111MB | 빗물받이 낙수 |
| 소나기·천둥 | mountain forest thunderstorm | [398016](https://freesound.org/people/chromakei/sounds/398016/) | 4:18 | FLAC 48k/16 스테레오 | 19.8MB | 처마 밑 창가, 소나기 처음부터 끝까지 |
| 먼 천둥 | Dry storm thunders | [796529](https://freesound.org/people/fran_marenco/sounds/796529/) | 3:48 | WAV 48k/24 스테레오 | 63MB | 수 km 밖 계곡 천둥 |
| 대숲 | Birds, wind through bamboo … Japan (Binaural) | [843520](https://freesound.org/people/tomasloos/sounds/843520/) | 3:26 | WAV 48k/24 스테레오 | 57MB | 일본 돗토리 대숲 |
| 솔바람 | silent windy pine forest | [670307](https://freesound.org/people/bruno.auzet/sounds/670307/) | 5:34 | WAV 48k/24 스테레오 | 92MB | 겨울 고목 소나무 큰 바람 |
| 새벽 산새 | zenkojibells_norm | [514135](https://freesound.org/people/earthmonkey1/sounds/514135/) | 6:04 | WAV 44.1k/16 스테레오 | 61MB | 일본 3월 06시, 1:30부터 먼 절 종 |
| 겨울새 | December Bird | [837717](https://freesound.org/people/dareumfield/sounds/837717/) | 7:13 | WAV 48k/32 스테레오 | 159MB | 서울 올림픽공원 12월 — 도시 소음 확인 |
| 부엉이 | Hibou Grand Duc | [471507](https://freesound.org/people/barkenov/sounds/471507/) | 2:21 | WAV 44.1k/24 스테레오 | 36MB | 수리부엉이(겨울에 욺) |
| 부엉이 | eagle owl | [701135](https://freesound.org/people/bruno.auzet/sounds/701135/) | 1:24 | WAV 96k/32 스테레오 | 62MB | 수리부엉이, 배경 제거됨 |
| 개구리 | Pool Frogs with birds | [513978](https://freesound.org/people/remmert/sounds/513978/) | 6:38 | WAV 48k/16 스테레오 | 73MB | 참개구리와 같은 속 |
| 매미 | Taiwan Alishan … Dense Cicada Chorus | [860235](https://freesound.org/people/BayTsai/sounds/860235/) | 0:56 | WAV 48k/32 스테레오 | 21MB | |
| 풀벌레 | Japan_Kashiwa_Insects_Far_and_Upclose | [365257](https://freesound.org/people/RutgerMuller/sounds/365257/) | 3:22 | WAV 96k/24 스테레오 | 111MB | 일본 10월 말 |
| 눈 밟기 | Footsteps on snow (clean) | [611277](https://freesound.org/people/xkeril/sounds/611277/) | 0:45 | WAV 48k/24 모노 | 6.3MB | 깨끗한 발걸음 모음 |
| 눈 밟기 | Walking through a snowy forest | [180962](https://freesound.org/people/morosopher/sounds/180962/) | 7:17 | FLAC 44.1k/16 스테레오 | 25MB | 영하 10℃ 눈 숲 |
| 겨울 고요 | Snow Silence – Winter Soundscape | [842985](https://freesound.org/people/shouya_trumpet/sounds/842985/) | 13:56 | WAV 48k/16 스테레오 | 153MB | 일본 효고, 눈 오는 중 솔바람·먼 까마귀 |
| 겨울 고요 | Appalachian Snowy Afternoon 1 | [719851](https://freesound.org/people/lakewoodsound/sounds/719851/) | 2:31 | FLAC 96k/24 스테레오 | 43MB | 약한 바람, 새 몇 |
| 범종 | temple bell 001 | [668646](https://freesound.org/people/tec_studio/sounds/668646/) | 0:44 | WAV 44.1k/24 모노 | 5.7MB | 1532년 일본 청동 범종, 긴 여운 |
| 풍경 | Soleri Windbell | [181973](https://freesound.org/people/stomachache/sounds/181973/) | 0:08 | WAV 44.1k/24 스테레오 | 2.2MB | 청동 단일 종 — 풍경과 가장 비슷 |
| 마당 쓸기 | sweepingleaves | [648933](https://freesound.org/people/anaroja/sounds/648933/) | 3:18 | WAV 48k/16 스테레오 | 36MB | 정원 낙엽 쓸기 |
| 찻물 | Pouring tea | [395615](https://freesound.org/people/BeeProductive/sounds/395615/) | 0:14 | WAV 48k/24 스테레오 | 4.1MB | |
| 모닥불 | Campfire 02 | [729396](https://freesound.org/people/HECKFRICKER/sounds/729396/) | 4:27 | WAV 44.1k/16 스테레오 | 45MB | 근접, 무가공 |
| 화로 | Aachen Burning Fireplace | [501417](https://freesound.org/people/visionear/sounds/501417/) | 11:54 | WAV 48k/24 스테레오 | 196MB | 실내 벽난로 |


## 2. 추천 묶음 (승인 받을 것)

원칙: 한국 산사 소리는 국립공원공단·공유마당(한국 녹음, 1유형)을 먼저, 거기 없는 것(겨울 눈, 모닥불)만 외국 CC0·Pixabay 로.
한 장면에 녹음 2~3개를 번갈아 쓰도록 골랐다.

| 묶음 | 내용 | 개수 | 받을 크기 |
|---|---|---|---|
| A. 다시 자르기 (지금 쓰는 원본) | 국립공원공단 15076211 계곡 · 15076128 빗소리 · 15076196 솔바람 · 15076183 곤줄박이 · 15076181 산솔새 · 15076169 풀벌레 · 15076172 샘물 · 15076137 염불 · 15068173 범종 · 15076195 풍탁 | 10 | 1,967MB |
| B. 국립공원공단 새로 | 15076158 원도봉계곡 · 15076171 구룡사 비오는 날 · 15076164 연화봉 바람 · 15076188 흰배지빠귀(새벽) · 15076180 되지빠귀(새벽) · 15076187 뻐꾸기(초여름) · 15076225 미래사 차의 시간 | 7 | 1,195MB |
| C. 공유마당 1유형 | 13372472 화개천 계류 · 13372573 가리산 비 · 13372511 빗물받이(낙숫물) · 13372546 먼 천둥 · 13287859 죽녹원 대숲 · 13371662 소쩍새 · 13371671 솔부엉이 · 13372012 북방산개구리 · 13371634 논 청개구리 · 13372522 영원사 매미 · 13371638 소요산매미 · 13371688 백련사 귀뚜라미 · 13372528 만봉사 범종 · 13287375 대빗자루 · 13287478 화로 | 15 | ≈92MB |
| D. 빈 곳 채우기 | 겨울 눈 밟기 · 겨울 숲 · 모닥불 — 아래 Freesound/Pixabay 후보 중에서 | 3 | 수 MB |
| E. (선택) 예불 음질 | 무위사 15076174 · 개암사 15076175 를 스테레오로 다시 뽑기 (백양사는 A 의 15076137) | 2 | 333MB |

- 합계(A~D): 36개 안팎, **약 3.3GB** (거의 국립공원공단 영상). 원본은 저장소 밖(작업용 임시 폴더)에 두고, 잘라 인코딩한 결과만 커밋한다.
- 목탁(15076130)은 지금 쓰는 0.2초 원샷으로 충분해 다시 받지 않는다.
- 공유마당 받기에는 「이용범위 동의」 체크와 첫 1회 설문 제출이 들어간다 — 이것도 함께 승인 받는다.

## 3. 발소리·행동 효과음 (사용자 요청 2026-11-06 추가)

경내 땅 재질: 법당 마루(`floor`) · 바깥 나무 데크·다리(`deck`) · 박석·징검돌(`stone`) · 마사토 마당(`gravel`) · 흙길(`earth`) · 가을 숲길 낙엽(`leaves`, 10~11월) · 눈(`snow`, 눈 오는 날 바깥).
재질마다 연속으로 걷는 녹음 하나에서 걸음을 자동으로 잘라 한 파일(칸 묶음)로 만들고, 엔진이 칸을 번갈아(같은 걸음 연달아 X) 높이 ±7%·크기 0.8~1.1 로 흔들어 튼다.

| 쓰는 곳 | 추천 원본 | 링크 | 라이선스 | 길이 | 오디오 | 크기 | 대안 |
|---|---|---|---|---|---|---|---|
| 마사토 마당 | Footsteps Gravel Stones – Walk (Vrymaa) | [825854](https://freesound.org/s/825854/) | CC0 | 38s | WAV 48k/16 모노 | 3.5MB | 352870 흙+자갈 · 331478 안뜰 쇄석 |
| 흙길 | Footsteps forest (Juno24) | [474113](https://freesound.org/s/474113/) | CC0 | 23s | WAV 48k/16 모노 | 2.1MB | 869611 숲 흙 · 공유마당 13264265(CC BY) |
| 가을 낙엽 | Walk in dry leaves in the forest (devy32) | [437455](https://freesound.org/s/437455/) | CC0 | 1:21 | WAV 48k/24 모노 | 11.1MB | 274833 |
| 법당 마루 | footsteps socks wood (Yuval) | [210770](https://freesound.org/s/210770/) | CC0 | 38s | WAV 48k/24 모노 | 5.2MB | 공유마당 13287282 버선_나무위_걷다(1유형, 96k/32k) · 635054 맨발 |
| 나무 데크·다리 | Footsteps – Wood Deck, Sneakers (PMarcy) | [399309](https://freesound.org/s/399309/) | CC0 | 57s | WAV 48k/24 모노 | 7.8MB | 공유마당 13287239 고무신_나무위(1유형) |
| 박석·돌계단 | Stone Steps (Phil25) | [208103](https://freesound.org/s/208103/) | CC0 | 9s | WAV 48k/32 스테레오 | 3.2MB | 677069(실내 울림 큼) · 13264173(CC BY) |
| 눈 | Footsteps on snow (clean) (xkeril) | [611277](https://freesound.org/s/611277/) | CC0 | 45s | WAV 48k/24 모노 | 6.3MB | 613849 등산화 12걸음 · 333422 |
| 죽비 | Wooden staff hitting hand (eveninx) | [434979](https://freesound.org/s/434979/) | CC0 | 12s | MP3 44.1k 모노 | 0.5MB | Pixabay 81238 Sticks Clapping |
| 염주 | Beads – Manipulation (Vrymaa) | [807390](https://freesound.org/s/807390/) | CC0 | 36s | WAV 48k/16 모노 | 3.3MB | 공유마당 13287405 염주_만지다(1유형) |
| 돌탑 조약돌 | rocks on rocks (_StudentofSound_) | [703519](https://freesound.org/s/703519/) | CC0 | 12s | WAV 48k/24 스테레오 | 3.4MB | 567701 |
| 번뇌 소각(종이 불) | burning-paper (15GKovacovaJulie) | [461075](https://freesound.org/s/461075/) | CC0 | 10s | WAV 48k/16 스테레오 | 1.9MB | 528662(1:05) |
| 차 따르기 | Tea Pouring (mdayalan) | [240125](https://freesound.org/s/240125/) | CC0 | 8s | WAV 48k/24 모노 | 1.2MB | 849313 도자기 잔 |
| 한지 | 종이_넘기는_소리 (JICA) | [13372326](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13372326&menuNo=200020) | 1유형 | 6s | MP3 320k/48k | ≈0.3MB | 13287479 화선지_펼치다 |
| 도복 스침 | Cotton clothes rustling (khenshom) | [481075](https://freesound.org/s/481075/) | CC0 | 39s | WAV 48k/32 스테레오 | 14.1MB | 공유마당 13287378 무명옷_옷소리(1유형) |
| 붓 | 전통사물_붓_쓰다_글씨_천천히 | [13287388](https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=13287388&menuNo=200020) | 1유형 | 35s | MP3 96k/48k | ≈0.4MB | 650350 Ink.wav |

목탁은 지금 쓰는 국립공원공단 원샷 그대로. 합장 화음·연등·UI 딸깍은 녹음 대상이 아니라 합성 그대로.

## 4. 받은 뒤 알게 된 것 (2026-11-06)

- **국립공원공단 영상 몇 개는 같은 소리를 이어 붙여 5분을 채웠다** (파형 상관 0.8~0.99): 연화봉 바람 약 31초 · 되지빠귀 105초 · 산솔새 97초 · 곤줄박이 156초 · 뻐꾸기 191초 · 풍탁 178초 · 화엄사 범종 223초. 공유마당 만봉사 범종은 타종 하나를 6번 복사했다.
  → 한 주기 안에서만 잘랐다. 연화봉 바람은 31초에 큰 순간음이 있어 뺐다.
- 영상 앞 수십 초에 도입부(음악 같은 소리)가 있는 것이 있어(백련사 빗소리) 앞부분은 쓰지 않았다.
- 구룡사 비 오는 날은 0~200초 내내 풍경 같은 음정 소리가 깔려 있어 210~260초만 썼다.
- 담양 죽녹원은 0~180초에 사람 발걸음(초당 2번꼴 낮은 쿵)이 있어 180초 뒤 40초만, 300Hz 아래를 걷어 썼다.
- 북방산개구리(13372012)는 -52 LUFS 로 너무 작아(올리면 잡음이 커진다) 쓰지 않았다.

## 5. 결과 (2026-11-06, 이 브랜치)

### 실은 것 — 라이선스별
| 라이선스 | 원본 수 | 출처 |
|---|---|---|
| 공공누리 제1유형 | 26 | 국립공원공단 「자연의소리」 12 · 공유마당((재)전주정보문화산업진흥원) 14 |
| CC0 | 18 | Freesound |
| CC BY · Pixabay · 공공누리 3유형 | 0 | (후보였지만 고르지 않음) |

- 원본 44개에서 조각 82개(배경 53 · 원샷 14 · 발소리 7 · 행동 효과음 8). 범종은 만봉사 한 조각만(사용자 2026-11-07 「만봉사가 제일 낫다」 — 화엄사 범종 15068173 은 뺐다). 출처는 「자료 출처」 화면(credits.js, `build.py credits` 가 manifest 로 다시 씀).
- 받은 것 중 쓰지 않은 것: 연화봉 바람(31초 되풀이 + 큰 순간음), 소백산 풀벌레(돌풍), 미래사 차의 시간(폴리라 배경감 아님), 북방산개구리(-52 LUFS), 영원사 매미·돗토리 대숲(계류 물소리가 섞여 물 없는 곳에서 물소리가 남), 전통사물 화로, 경주남산 소나무숲(15076196 — 아래), 솔바람·겨울 숲 배경(아래 「바람」), 화엄사 범종.
- **국립공원공단 설명문의 「비상업적 활용에 적합」 문구**: 이용허락범위는 1유형이지만 문구가 어긋난다 — 토스 결제를 붙이기 전에 AI데이터팀(033-769-9424)에 서면 확인 권장.

### 말소리 검사 (사용자 2026-11-06 「배경에 나레이션이 들린다」)
- 국립공원공단 「경주남산의소나무숲과용장사」(15076196)는 소리 녹음이 아니라 **명상 안내 영상**이었다 — 바람 아래로 「허리를 곧게 펴고」「온 산을 가득 채우는 종소리의 울림처럼」「아침 안개 자욱한 삼릉의 새벽을…」 같은 내레이션이 깔려 있다. 이 원본에서 뽑은 돌풍 6개(산 어디서나 들리는 원샷)와 솔바람 3개(늘 깔리는 배경)를 모두 뺐다.
- 돌풍은 Freesound 솔숲 바람(670307, CC0)의 큰 바람 5곳(60.6·197.1·279.5·301.8·320.4초 봉우리, 앞 5초·뒤 2.5초, -25 LUFS)으로 다시 만들었다.
- 검사: `tools/audio/voice_check.py` — contents-factory 가상환경의 faster-whisper(small, 로컬 모델)로 조각마다 한국어 받아쓰기, VAD 로 말소리 구간만. 글자가 나오면 실패.
  - 89개 중 말소리 0개 (그 뒤 바람 배경 5개를 빼 지금 84개) (염불 chant-baekyang-3 의 「아이고」는 염불을 잘못 받아쓴 것 — 염불은 원래 목소리라 빼고 본다).
  - 새 원본을 넣을 때마다 `build.py build` 뒤에 돌린다.
- 게임 안에서 듣고 가려내기: 콘솔에서 `temple.sound.playing()`(지금 울리는 배경·조각·크기), `temple.sound.solo('wind')`(그 배경만), `temple.sound.solo()`(풀기).

### 바람 (사용자 2026-11-06 「바람소리가 너무 크다. 모든 바람은 간헐적으로만」)
- 늘 깔리던 바람을 모두 걷었다: 솔바람 배경(Freesound 670307 의 50초 조각 3개)·겨울 숲 배경(719851)·합성 바람. 바람 레이어에는 18~42초에 한 번 지나가는 돌풍 녹음(gust-pine 5개, 7.5초)만 싣는다. 대숲 바람(죽녹원)은 대숲 안에서만 들리는 자리 소리라 그대로.
- 크기: `tools/qa/wind.mjs` 가 돌풍을 막은 10초(나머지 소리)와 돌풍 4번의 가장 센 0.1초를 잰다. 11월 밤 산문에서 바람 레이어 0.3 일 때 돌풍이 나머지보다 **+12.1dB**(마당 +7.5dB) — 바람이 모든 소리를 덮었다. 돌풍을 800Hz 위로 걷은 뒤(아래 「물소리」) 0.06 으로: 산문 -2.4dB · 마당 -6.8dB, 돌풍 없을 때 바람 레이어는 소리 없음.

### 물소리 (사용자 2026-11-06 「산꼭대기에서 물소리가 들리다 말다 한다 — 물길 근처가 아니면 물소리가 절대로 나면 안 된다」)
- 엔진은 맞았다: 계곡·샘물·개구리는 물길·연못 자리 소리라 물길에서 가장 먼 산책로(계곡까지 68m)에서 60초 동안 출력이 0 (`tools/qa/no-water.mjs`).
- 물은 **산 어디서나 들리는 녹음 속**에 있었다. `tools/audio/water_check.py` 가 조각마다 조용한 바탕을 계곡 녹음과 견준다(스펙트럼 닮음 · 1~4kHz 쉬익 몫 · 4~20Hz 찰랑임 · 바탕 크기):
  - 경주남산 솔바람 `wind-namsan-2`(운영 사이트에 아직 있음): 계곡 녹음과 닮음 **0.80** — 사실상 계곡 녹음. 3~11월 내내 산 어디서나 깔렸다.
  - 수리부엉이 4개(Freesound 471507)도 바탕이 물과 닮게 나왔지만(닮음 0.44~0.49) 사용자가 듣고 「사람 소리 없다, 그대로 쓴다」(2026-11-07) — 그대로 둔다. `water_check.py` 의 산 어디서나 목록에서 뺐다.
  - 솔숲 돌풍 `gust-pine`(Freesound 670307): 1~4kHz 쉬익 몫 -3.8~-5.0dB 로 계곡(-2.9~-4.5)과 같은 자리 — 「쏴아」가 물소리로 들린다. 800Hz 위를 24dB/옥타브로 걷어(`build.py` 의 `lp`) -15dB 로 — 낮은 「우우웅」 바람만.
- 이제 산 어디서나 들리는 조각(돌풍·산새·풀벌레·매미·밤새·범종·풍경·천둥) 중 물 같은 것 0개. 새 녹음을 넣으면 `build.py build` 뒤에 `water_check.py` 를 돌린다 (물 같으면 종료 코드 1).

### 크기 (LUFS)
- 배경은 -24.0 ±0.4 LUFS (예전 REC_BED 보정 기준). 일부러 낮춘 것·높인 것: 돌풍 -25, 범종 -22, 풍경 -25, 낙숫물 -28, 모닥불 -37·종이 불 -37(봉우리가 0dBFS 가까움), 찻물 -36. 효과음 묶음은 봉우리 -1.9dBFS 로 맞추고 크기는 엔진에서.
- 엔진 안 크기는 합성음과 같게 실측(`tools/qa/levels.mjs`: 오프라인 렌더 에너지비). 봉우리가 큰 것(모닥불·종이 불·찻물·도복·한지·조약돌·죽비)은 봉우리를 합성보다 +3dB 안으로 묶었다.
- 헤드룸(`tools/qa/headroom.mjs`, 20~25초): 자리 4곳·장면 4개·효과음 연타 모두 리미터 누름 평균 < 0.1dB, 최대 < 2.1dB, 마스터 봉우리 -4.9dBFS 이하.

### 저장소 크기
- `web/assets/audio/nature/` 63MB (m4a 32MB + mp3 30MB — AAC 를 못 푸는 브라우저는 mp3). 지운 예전 mp3 14개 6.24MB.
- 원본(약 3.8GB)은 `tools/audio/raw/`(git 밖)에만 있다. 받는 곳은 manifest 의 url.

### 받는 방식과 양 (사용자 2026-11-06: 입장은 소리를 기다리지 않고, 산문 소리부터 받는 대로 서서히, 나머지는 걷는 동안 뒤에서 전부)
- 입장 버튼은 소리를 기다리지 않는다. 입장하면 소리는 4.5초에 걸쳐 페이드인.
- 받기는 한 번에 하나씩, **지금 자리에서 크게 들리는 배경부터** → 그 배경이 켜지면 돌풍·범종 → 그 뒤 **나머지 녹음 전부**(압축본만 넣어 두고 풀지 않음). 재생은 캐릭터 자리(전파 법칙)를 따른다.
- 실측 (`tools/qa/audio-bytes.mjs`, 로컬 서버, 경주남산 조각과 바람 배경을 뺀 뒤 다시 잼):

| 들어온 때 | 산문에서 먼저 받은 것 | 그 뒤 뒤에서 받은 것 | 마당에 들어설 때 새로 |
|---|---|---|---|
| 11월 밤 (지금) | 2.76MB 15개 — 풀벌레 | 28.39MB 69개 | 0 |
| 7월 한낮 | 4.01MB 13개 — 산새 두 겹·매미 | 27.14MB 71개 | 0 |
| 1월 밤 | 2.30MB 14개 — 계곡 | 28.85MB 70개 | 0 |
| (바꾸기 전) | 첫 10초에 6.25MB 17개 전부 | – | – |

- 풀어 둔 소리(메모리): 46~88MB (바꾸기 전 177MB). 지금 들리는 조각과 다음 조각만 풀어 둔다.
- 헤드룸 재측정: 위와 같음 (리미터 최대 0.35dB, 마스터 봉우리 -5.2dBFS 이하).
