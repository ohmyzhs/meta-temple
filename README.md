# 청연산사 (清蓮山寺) — 무설치 웹 3D 온라인 사찰

> 말없이 함께 머물며 산사의 바람·풍경 소리를 듣고, 절·연등·사경·차담으로 마음을 비우는 웹 3D 디지털 안식처

- 라이브: https://temple.lotiony.com
- 기획·설계 문서: [`docs/`](./docs)

## 폴더 구조

```text
meta-temple/
├── README.md
├── package.json              # 실행·배포 스크립트만 (빌드 단계 없음)
├── docs/                     # 기획·설계 문서 (배포되지 않음)
│   ├── 01-planning-and-market-analysis.md
│   ├── 02-spatial-and-avatar-design.md
│   └── 03-technical-specification.md
├── web/                      # 배포 루트 — 이 폴더만 서버에 올라간다
│   ├── assets/audio/         # 실제 녹음 (국립공원공단 자연의소리, 공공누리 제1유형)
│   ├── index.html            # 입장 화면 · HUD · 모달 뼈대 · Three.js import map
│   └── src/
│       ├── main.js           # 앱 진입점: 입장 → 월드 생성 → 입력·HUD·신행 연결 → 루프
│       ├── styles.css        # 디자인 토큰 + HUD (먹빛 유리 패널, 모바일 하단 시트)
│       ├── core/state.js     # localStorage 수행 기록, 출석, 공덕 보상 해금
│       ├── data/
│       │   ├── templeData.js # 구역·법명 사전(24×24)·연등 4색·초기 서원
│       │   └── dharmaTexts.js# 반야심경·법구경 사경문, 죽비 카드, 차담 지식베이스
│       ├── audio/soundEngine.js  # Web Audio 절차적 입체 ASMR (HRTF·리버브·3채널 믹서)
│       ├── ui/
│       │   ├── modalManager.js   # 신행 모달 (연등·기와·돌탑·번뇌 소각·108배·염주·사경·차담·죽비·기록·안내)
│       │   └── modals.css
│       └── world/
│           ├── layout.js     # 가람 배치 좌표 계약: 지형 높이·이동 가능 영역·충돌
│           ├── templeScene.js# 렌더러·후처리·하늘·시간대/날씨·카메라·피킹·정적 병합
│           ├── terrain.js    # 지형·원경 겹산·계곡/연못 물·바위·박석
│           ├── vegetation.js # 전나무·소나무·단풍·대숲·풀·연꽃 (인스턴싱 + 바람 셰이더)
│           ├── architecture.js # 한옥 빌더: 앙곡 지붕(맞배·우진각·팔작)·배흘림 기둥·공포·석탑·석등
│           ├── temple.js     # 경내 조립 + 연등·돌탑·화로·범종·향로·기와대 + 상호작용 지점
│           ├── avatarManager.js # 아바타 3종·동작 상태 머신·동석 참배객·syncRemotePeers
│           ├── effects.js    # GPU 파티클 (연기·불꽃·찻김·비 1,500·눈 1,200·낙엽·반딧불·파동)
│           ├── materials.js  # 공용 재질 + 눈 덮임·젖음·바람·야간 발광 셰이더 주입
│           └── textures.js   # 절차적 텍스처 (기와·단청·창호·화강암·탱화·현판·얼굴)
├── deploy/
│   ├── deploy.sh             # web/ → 오라클 VM (버전 경로로 캐시 무효화)
│   └── oracle_known_hosts
└── .github/workflows/deploy.yml  # main 푸시 → 자동 배포
```

텍스처는 모두 코드로 그리고, 소리는 공공 녹음(`web/assets/audio`) + 합성음을 쓴다. 빌드 없이 정적 서버로 바로 돈다.

## 실행

```bash
npm start
```
브라우저에서 http://localhost:8080 — 저사양 모드 강제는 `?q=low`.

## 배포

- `main` 에 `web/**` 변경을 푸시하면 GitHub Actions 가 오라클 VM(`/srv/temple/dist`)으로 올린다.
- 맥에서 직접: `npm run deploy`
- `web/src` 는 `v/<커밋>/` 경로로 올라가고 `index.html` 이 그 경로를 가리킨다. Cloudflare 가 JS/CSS 를 4시간 캐시해도 옛 모듈과 새 페이지가 섞이지 않는다.

## 구현된 것

- **가람 4구역 (심리스)**: 일주문·전나무 숲길·계곡 홍예교·소원 돌탑 → 마당(삼층석탑·연등 줄·범종각·번뇌 소각 화로·기와 불사대) → 대웅전(금동 삼존불·광배·후불탱화·향로·쌍촛대·좌복 32개·사경 서안) → 후원 다실 심검당(툇마루 찻상·연꽃 연못·정자·대숲)
- **시간대 5종 + 날씨 3종**: 실시간(KST) / 새벽 / 한낮 / 노을 / 밤, 맑음(낙엽·반딧불) / 봄비(젖은 바닥) / 설경(지붕·마당 눈 덮임). 매일 05:00·18:00 KST 예불 범종 5타.
- **아바타 3종**: 목각·백자 동자승 / 삿갓 수묵 행자(림 라이트) / 연꽃 등불 정령. 법명 자동 부여·다시 받기.
- **동작 6종**: 합장 반배(6m 안 도반 답례) · 큰절(오체투지) · 가부좌·염주 · 헌향·헌촉 · 탑돌이(반경 4.5m 우요) · 다선
- **신행**: 소원 연등(4색, 합장 공감) · 기와 불사 · 소원 돌탑 · 번뇌 소각(어디에도 저장 안 함) · 108배(4초 호흡 가이드)·염주 · 반야심경 사경(한글 IME 대응) · 선사 차담 · 오늘의 죽비
- **비경쟁 공덕 표시**: 자단목 단주(절 21배·염주 108회), 손연등(연등 1개·사경 1회, 밤에만), 백옥 단주(7일 연속)
- **입체 ASMR (실제 녹음)**: 계곡·솔바람·산새·빗소리·풀벌레·연못 샘물, 범종·풍탁·목탁·법당 염불은 국립공원공단 「자연의소리」 녹음. 죽비·염주·발걸음·찻물 등 작은 효과음과 녹음을 받기 전 몇 초는 Web Audio 합성음. 구역별 감쇠(법당 안 바깥 소리 40%)
- **예불 듣기**: 법당에서 백양사 염불 · 무위사 사시예불 · 개암사 새벽예불(각 약 5분, 실제 녹음)을 골라 처음부터 끝까지
- **모바일**: 가상 조이스틱, 핀치 줌, 하단 시트, 저사양 자동 판별과 첫 몇 초 프레임 실측 후 해상도 자동 조정

## 소리의 출처

`web/assets/audio/` 의 녹음은 모두 **국립공원공단 「자연의소리」**(공공데이터포털, **공공누리 제1유형: 출처표시**)의 영상에서 소리만 잘라 쓴 것입니다(구간 편집·음량 조정·MP3 압축). 항목별 원본 링크는 `web/src/data/soundCredits.js` 와 사이트의 「산사 안내 → 소리의 출처」에 있습니다.

## 이어서 할 일 (docs/03 §4 로드맵 훅)

| 훅 | 위치 | 하는 일 |
|---|---|---|
| `loadCustomGLBModels()` | `world/templeScene.js` | `window.TEMPLE_CONFIG.models` 의 국가유산청 `.glb` 를 불러와 배치 |
| `avatarManager.syncRemotePeers(peers)` | `world/avatarManager.js` | Supabase Presence 피어를 아바타로 주입·보간 |
| `generateMonkResponse(message, history)` | `ui/modalManager.js` | `window.TEMPLE_CONFIG.monkChatEndpoint` 가 있으면 서버 LLM, 없으면 로컬 지식베이스 |
