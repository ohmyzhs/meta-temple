# 사운드템플 — 입체 ASMR 산사 (무설치 웹 3D)

서비스 이름은 **사운드템플**(2026-11-07, ASMR 을 핵심 콘텐츠로 내세우려는 결정). 그 안의 산사 이름은 그대로 청연산사(清蓮山寺) — 산문 현판에만 붓글씨로 걸려 있다.

> 말없이 함께 머물며 산사의 바람·풍경 소리를 듣고, 절·연등·사경·차담으로 마음을 비우는 웹 3D 디지털 안식처

- 라이브: https://temple.lotiony.com (sound-temple.lotiony.com 연결 예정)
- 대문: 사용자가 제공한 「소리사원」 현판 영상의 가로·세로 판. 별도 제공 로고에서 분리한 처마 풍경 엠블럼은 투명 SVG(`web/assets/brand/temple-emblem-v2.svg`)로 두고 상태판과 사이트 아이콘에 쓴다. 서비스 이름은 기존 설정대로 사운드템플이다.
- 기획·설계 문서: [`docs/`](./docs) — 출시판 설계는 [`docs/superpowers/specs/2026-11-05-launch-upgrade-design.md`](./docs/superpowers/specs/2026-11-05-launch-upgrade-design.md), 단계별 계획·결과는 [`docs/superpowers/plans/`](./docs/superpowers/plans)

## 폴더 구조

```text
meta-temple/
├── README.md
├── package.json              # 실행·시험·배포 스크립트만 (빌드 단계 없음)
├── docs/                     # 기획·설계 문서 (배포되지 않음)
│   ├── 01~03-*.md            # 첫 기획·공간·기술 명세
│   ├── superpowers/specs/    # 출시판 업그레이드 설계 (요구사항·결정·구현 현황)
│   ├── superpowers/plans/    # 1단계(안전·모바일 UI·렌더) · 3단계(지도 확장·실사) 계획과 결과
│   ├── art/ · spike/ · outdoor/ · avatar/   # 아트 바이블, 에셋 스파이크·실사 보고서, 아바타 예절 동작
├── web/                      # 배포 루트 — 이 폴더만 서버에 올라간다
│   ├── index.html            # 입장 화면 · HUD(독·시트) · 예불 재생기 · 모달 뼈대 · Three.js import map
│   ├── spike.html            # 에셋 스파이크 비교 화면
│   ├── assets/
│   │   ├── audio/            # 실제 녹음 — nature/ 는 tools/audio/build.py 가 만든 자연의 소리·효과음 (출처 manifest.json) · 스님 고정 대사(Typecast)
│   │   ├── entrance/         # 가로·세로 대문 영상, 현판·기둥 고정 레이어, 포스터, 대문 전용 자연 소리
│   │   ├── brand/temple-emblem-v2.svg # 첨부 원안에서 분리하고 선을 보강한 투명 풍경 엠블럼
│   │   ├── icons/icons.svg   # 그림 아이콘 30종 (<symbol> 스프라이트, currentColor)
│   │   ├── avatars/          # 블렌더 아바타 GLB (동자승·행자 / 등불 정령)
│   │   └── world/ · spike/   # 실사 세계 에셋 (스캔 석탑·사진 질감·원경·삼존·후불벽)
│   └── src/
│       ├── main.js           # 앱 진입점: 입장 → 월드 → 입력·HUD·신행·예불 듣기·차담 장면 → 루프
│       ├── styles.css        # 디자인 토큰 + HUD(하단 독·시트·예불 재생기)
│       ├── entrance.css      # 대문 배경·입장 요소
│       ├── core/
│       │   ├── state.js      # 저장 구조 v3 (profileId·직접 지은 법명·내보내기/가져오기), 출석, 공덕 해금
│       │   ├── live.js       # 실시간 동석 + 공유 서원 클라이언트 (server/server.js 짝)
│       │   ├── moderation.js # → ../../../server/moderation.js 링크 (서버·화면 같은 거름)
│       │   ├── cairns.js     # → server/cairns.js 링크 (돌탑 어디서나 규칙)
│       │   └── avatarMotion.js # 아바타 상태 → 블렌더 동작 클립 (순수 함수)
│       ├── data/
│       │   ├── templeData.js # 구역·하단 독 신행(DOCK_RITUALS)·법명 사전·연등 색
│       │   ├── dharmaTexts.js# 사경문, 차담 로컬 지식베이스
│       │   ├── dharma.js     # → server/dharma.js 링크 (죽비 38장·위기 신호)
│       │   └── credits.js    # 자료 출처 (분류: sound·scans·textures·patterns·generated) + 예불 트랙
│       ├── audio/
│       │   ├── soundEngine.js# Web Audio 입체 ASMR (HRTF·리버브·3채널), 녹음·예불·목소리 재생
│       │   └── background.js # 화면이 꺼져도 계속 듣기 (Android 오디오 포커스, iOS audioSession)
│       ├── ui/
│       │   ├── introBackground.js # 화면별 대문 영상·현판 고정·대문 전용 소리
│       │   ├── modalManager.js # 신행 모달 (연등·기와·돌탑·번뇌 소각·108배·사경·차담·죽비·기록·안내·자료 출처)
│       │   ├── modals.css
│       │   ├── icons.js      # icon(name) → <svg><use href="icons.svg?v=N#name"></svg>
│       │   ├── sheets.js     # HUD 시트 열림 상태 (openSheet·toggleSheet·closeTop·closeAll·hasOpen)
│       │   ├── backGuard.js  # 안드로이드 뒤로가기 방어 (열린 것부터 닫고, 두 번 눌러야 산문 밖으로)
│       │   ├── veil.js       # 화면 전환 가림막
│       │   ├── nameField.js  # 법명 직접 짓기 칸 (즉시 거름 안내)
│       │   ├── miniMap.js    # 장소 시트의 작은 지도 (가람·쉼터로 바로 가기)
│       │   └── scrollFade.js # 시트 스크롤: 막대 대신 가장자리 흐림
│       ├── spike/spike.js    # 에셋 스파이크 페이지
│       └── world/
│           ├── layout.js     # 가람 배치 좌표 계약: 지형 높이·이동 가능 영역·구역·충돌
│           ├── templeScene.js# 렌더러·후처리·하늘(달빛·은하수)·시간대/날씨·스프링 암 카메라·가림 처리·피킹
│           ├── terrain.js · vegetation.js · architecture.js · materials.js · textures.js · effects.js
│           ├── temple.js     # 경내 조립 (대웅전 5×3칸·좌복 65) + 신행 소품 + 상호작용 지점
│           ├── westCourt.js  # 서쪽 마당·대웅전 옆마당
│           ├── trail.js · trailProps.js · cairnField.js · pathfind.js  # 순환 산책로·쉼터·길가 돌탑·길 찾기
│           ├── buddha.js · buddhaSculpt.js · buddhaWorker.js           # 절차식 삼존 (조각은 워커에서)
│           ├── avatarManager.js · avatarRig.js # 아바타·동작 상태 머신·동석 참배객 / 블렌더 스킨드 리그
│           └── real/         # 실사 세계 (기본값; ?world=classic 이면 절차식): 원경·지면·나무·경내 질감·스캔 석탑
├── server/                   # 실시간 동석(WebSocket /ws) + 공유 서원·신고·차담 AI API(/api) — Node 22, ws, pg
│   ├── server.js · store.js · relevance.js   # 동석 서버·Postgres/메모리 저장소·관심 영역
│   ├── moderation.js · dharma.js · cairns.js # 화면과 같이 쓰는 규칙 (web/src 에 링크)
│   ├── monk.js               # /api/monk 차담 스님 AI (OpenRouter, 구조화 출력, 하루 한도)
│   └── products.js · payments/toss.js        # 과금 대비 자리 (지금은 모두 꺼짐)
├── tools/
│   ├── qa/                   # 헤드리스 검사 스크립트 (아래 「검사」)
│   ├── blender/ · tts/       # 아바타·법당 칸 굽기, 스님 고정 대사 녹음
│   └── outdoor/ · precinct/ · spike/   # 실사 원경·경내 질감·스파이크 에셋 만들기
├── deploy/
│   ├── deploy.sh             # web/ → 오라클 VM (web/src 는 버전 경로 v/<커밋>/ 로)
│   ├── live.sh               # server/ → VM 도커 (temple-live + temple-db Postgres)
│   ├── mod.sh                # 공개 글 관리 (목록·숨김·되살림·찾기)
│   ├── nginx-temple.conf · oracle_known_hosts
└── .github/workflows/deploy.yml  # main 에 web/** 푸시 → 자동 배포
```

## 실행

```bash
npm start
```

브라우저에서 http://localhost:8080 . 주소 뒤에 붙이는 선택지:

| 선택지 | 뜻 |
|---|---|
| `?q=low` / `?q=high` | 저사양·고사양 강제 (기본은 기기 판별 + 첫 몇 초 프레임 실측) |
| `?world=classic` | 실사 세계 대신 절차식 세계 |
| `?rig=0` | 블렌더 아바타 대신 절차식 아바타 |

실시간 동석·공유 서원·차담 AI 를 로컬에서 보려면 `PORT=8095 node server/server.js` 를 함께 띄운다 (8080·8093 포트의 화면은 8095 서버를 찾는다. `DATABASE_URL` 이 없으면 메모리 저장소, `OPENROUTER_API_KEY` 가 없으면 차담은 대화 나무로).

## 검사

```bash
npm test
```

서버·저장 구조·거름·아이콘·지도·아바타 동작 단위 시험 (`node --test`). 서버 시험에는 `server/` 에서 `npm ci` 가 먼저 필요하다.

화면 검사는 `tools/qa/*.mjs` — 헤드리스 Chrome 으로 띄워 수치를 출력한다. 두 가지 꼴이 있다.

- **`node` 로 바로 실행** (대부분 `tools/qa/lib.mjs` 를 씀): `node tools/qa/<이름>.mjs`. 프로젝트에 의존성을 더하지 않으려고 전역 `@playwright/mcp` 에 딸린 playwright 를 쓴다(`PW=…` 로 바꿀 수 있음). 대상은 `BASE=http://localhost:<포트>` (기본 8081 — Range 를 지원하는 정적 서버로 `web/` 을 띄울 것).
- **Playwright MCP 로 도는 것**: `browser_run_code_unsafe {filename}` 으로 실행 (파일 머리 주석에 쓰는 법).

| 영역 | 스크립트 (★ = `node` 로 바로 실행) | 보는 것 |
|---|---|---|
| 모바일 UI | `hud.mjs`★ | 여섯 뷰포트에서 모든 단추 48×48 이상·겹침·화면 밖·글자 선택 안 됨·HUD 가림 비율(세로 폰 ≤ 18%) |
| | `back.mjs`★ | 안드로이드 뒤로가기: 창·시트·예불 듣기·차담을 하나씩 닫고, 두 번 눌러야 나감 (링크로 바로 들어온 탭·새로고침 포함) |
| | `credits.mjs`★ · `listen.mjs`★ · `listen-ctl.mjs`★ · `seated.mjs`★ | 자료 출처 화면 / 재생기 접기 / 예불·자연의 소리 같은 재생기(단추·목록 다시 열기·소리 크기·듣기 방식·타이머·화면 꺼짐) / 일어나면 앉은 자세가 풀리는지 |
| | `practice.mjs`★ | 자동 108배가 3초 뒤 작은 막대로 접히는지, 염주 창(따로)과 광클릭 막기 |
| 렌더·카메라 | `night.mjs` · `day.mjs` · `camera.mjs` · `occlusion.mjs` · `travel.mjs` · `bloom-nan.mjs`★ · `normal-sign.mjs`★ | 밤 밝기·윤곽, 맑은 낮 채도, 카메라 가림, 장소 이동 |
| 실사·아바타·군중 | `outdoor.mjs`★ · `real-*.mjs` · `avatar-*.mjs` · `crowd.mjs` · `live-load.mjs`★ | 실사 세계, 블렌더 아바타 동작·동기화·성능, 군중 컬링·서버 부하 |
| 차담·소리 | `tea.mjs`★ · `background.mjs`★ | 차담 장면(/api/monk 흉내), 화면 꺼져도 계속 듣기 |

## 배포

- 작업 흐름: 묶음마다 자기 브랜치 → `integration/launch` 에 합쳐 화면·수치 확인 → 사용자 확인 뒤 `main`.
- `main` 에 `web/**` 변경을 푸시하면 GitHub Actions 가 `deploy/deploy.sh` 로 오라클 VM(`/srv/temple/dist`)에 올린다. 맥에서 직접: `npm run deploy`.
- `web/src` 는 `v/<커밋>/` 경로로 올라가고 `index.html` 이 그 경로를 가리킨다. Cloudflare 가 JS/CSS 를 4시간 캐시해도 옛 모듈과 새 페이지가 섞이지 않는다.
- `web/assets/` 는 버전 경로 밖이다. 바꾸면 파일 이름을 바꾸거나 주소의 버전을 올린다 (아이콘은 `web/src/ui/icons.js` 의 `V`).
- 실시간 서버(`server/`)는 `deploy/live.sh` 로 따로 올린다 (SSH 가 열린 네트워크의 맥에서). 비밀값(`OPENROUTER_API_KEY`, DB 비밀번호)은 VM 의 `/srv/temple/live.env` 에만 둔다.

## 구현된 것

- **대문**: 가로·세로 자연 영상과 느린 시점 이동, 현판·기둥 고정 레이어, 법명·모습 선택. 대문에 머무는 동안 3D 장면은 미리 준비하되 렌더 루프를 멈추고 입장하면 시작한다. 우측 위 대문 소리 스위치는 인게임 소리와 별도이고 기본은 켬이다. 브라우저가 자동재생을 막으면 첫 대문 조작에서 재생을 다시 시도하며, 직접 끈 설정은 유지한다. 입장 시 대문 영상·소리는 멈춘다. 사용자가 지정한 북방산개구리·새소리 녹음을 음량 조정해 쓴다(출처 화면 참고).
- **공간**: 가람 4구역(일주문 숲길 · 대웅전 앞마당 · 대웅전 법당 5×3칸 좌복 65 · 후원 다실) + 서쪽 마당. 산사를 두르는 순환 산책로(전나무 데크·깊은 숲·대숲·징검다리·이정표)와 쉼터(여럿이 나란히 앉기), 산책로 어디서나 돌 올리기(돌탑마다 글 따로), 자동 산책.
- **실사 세계 (기본)**: 사진 원경 능선(해질녘·밤 띠), 지면·나무 사진 질감, 경내 기와·단청·석재 실사 질감, 스캔 삼층석탑, 생성형 삼존·후불벽. `?world=classic` 이면 절차식.
- **시간·날씨**: 실시간(KST) 기본. 맑은 낮은 쨍하게, 밤은 달빛 아래 윤곽과 은하수(노출 하한). 봄비·설경은 고를 때만. 매일 05:00·18:00 KST 예불 범종.
- **카메라**: 스프링 암 3인칭(지붕·담에 가려지지 않게), 1인칭, 장소 이동은 가림막 뒤 순간 이동.
- **아바타**: 블렌더 리그 3종(동자승·삿갓 행자·등불 정령), 걸음 1.1m/s, 법명 자동 부여 + 직접 짓기(2~10자, 거름). 머리 위 이름표는 먹 상자 위 14px, 실제 접속한 사람(나·도반)은 초록 점, 산사식구(참배객·스님)는 점 없이.
- **동작·신행**: 합장(도반 답례) · 큰절 · 가부좌·염주 · 헌향 · 탑돌이 · 다선, 소원 연등 · 기와 불사 · 소원 돌탑 · 번뇌 소각(어디에도 저장 안 함) · 108배(자동으로 돌리면 작은 막대로 접힘) · 염주(한 알에 한 숨, 한 알 사이 최소 3초) · 반야심경 사경 · 오늘의 죽비(38장, 스님 목소리로 듣기).
- **차담**: 다실에서 스님과 마주 앉는 대사 장면. 스님 두뇌는 서버 AI(`/api/monk`), 고정 대사는 녹음한 목소리, 예상 응답 3개 + 직접 말하기, 다음 방문까지 짧은 기억. 자살·자해 신호에는 자살예방상담전화 **109** 안내. AI 가 없으면 대화 나무로.
- **예불 듣기**: 실제 녹음 예불 3편(각 약 5분). 법당 좌복에 홀로 앉아 듣거나 쉼터에서 경치를 보며 1인칭으로. 화면이 꺼져도 계속 듣기. 예불 듣기와 자연의 소리 듣기는 같은 재생기를 쓴다: 재생·이전·다음, 듣기 방식(한 곡·연속·반복, 자연의 소리는 장면 한 편 10분), 잠자기 타이머, 소리 크기(소리 창과 같은 값), 곡 이름을 누르면 목록이 다시 떠 앉은 채 다른 예불·장면으로, 접기(작은 알약)·일어나기.
- **실시간 동석**: 같은 시간에 접속한 도반의 위치·모습·동작이 보인다(채팅 없음). 합장 인사·답례. 보이는 사람만 그리고 먼 사람은 덜 자주 보내 50명 군중도 가볍게.
- **공유 서원과 안전**: 연등·기와·돌탑을 공개하면 모두에게 보인다. 욕설·성적 표현·링크·연락처는 서버와 화면이 같은 규칙으로 거른다(띄어쓰기·자모 분리·한영 섞기 우회 포함). 서로 다른 3명이 신고하면 자동 숨김, 연속 등록 제한, 관리 스크립트 `deploy/mod.sh`.
- **기록**: 이 브라우저에만 저장(저장 구조 v3, 옛 기록 그대로 이어받음), 기록 내보내기·가져오기. 비경쟁 공덕 표시(단주·손연등).
- **모바일 UI**: 하단 독(이곳의 주 신행 + 몸짓 4 + 더보기), 오른쪽 위 장소(지도·쉼터 바로 가기)·메뉴(시간·날씨 · 소리 · 내 모습 · 수행 기록 · 도움말 · 자료 출처), 모두 그림 아이콘 + 짧은 글자. 단추는 48px 이상이고 글자 선택·길게 누르기 메뉴가 뜨지 않는다. 시트는 기본 접힘. 안드로이드 뒤로가기는 열린 것부터 하나씩 닫고, 닫을 것이 없으면 「한 번 더 누르면 산문을 나섭니다」.
- **과금 대비**: 상품·주문·보유 권리 테이블과 토스페이먼츠 어댑터 자리만 (지금은 모두 꺼짐).

## 자료 출처

사이트의 메뉴와 도움말 맨 아래 「자료 출처」 화면에 분류별로 모아 둔다 (`web/src/data/credits.js`). 화면 곳곳에는 출처를 적지 않는다.
`web/assets/audio/` 의 녹음은 **국립공원공단 「자연의소리」**(공공데이터포털)·**공유마당**(공공누리 제1유형: 출처표시)과 **Freesound CC0** 녹음에서 구간을 잘라(음량 -24 LUFS·이음새 교차 페이드·AAC/MP3) 만든 것이다. 원본·구간은 `tools/audio/manifest.json`, 조사와 라이선스 확인은 `docs/audio/SOURCES.md`.

소리는 자리를 따른다: 계곡·연못·대숲·화로·독송·범종·풍경 같은 자리 소리는 `soundEngine.js` 의 `PLACED` 표(배경)와 `_spot()`(원샷)에 위치·모양·세기만 주면 같은 전파 법칙(거리 퍼짐·숲 초과 감쇠·담 가림·공기 흡수)을 받는다. 바람·비·산새·풀벌레·매미는 산 어디서나 시간대·날씨·계절(달)로만. 검사: `tools/qa/sound-map.mjs`(산책로 자리별 크기), `tools/qa/levels.mjs`(녹음·합성 크기 맞춤), `tools/qa/headroom.mjs`, `tools/qa/audio-bytes.mjs`.

## 남은 일

출시판 설계([spec](./docs/superpowers/specs/2026-11-05-launch-upgrade-design.md) 「구현 현황」)에서 아직 하지 않은 것: 공덕 도감·오늘의 수행(요구 6), 실제 결제와 카카오 로그인, AI 답의 서버 음성 합성.
