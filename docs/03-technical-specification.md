# 03. 기술 명세서 및 확장 구현 로드맵 (Technical Specification & Roadmap)

본 문서는 다른 개발 도구(IDE, AI 코딩 에이전트 등)에서 프로젝트를 이어받아 기능을 확장하거나 상용 서비스로 고도화할 때 참조할 수 있는 **기술 아키텍처, 데이터 스키마, 오디오·그래픽 파이프라인 명세서**입니다.

---

## 1. 시스템 아키텍처 및 폴더 구조 (Directory Structure)

별도의 무거운 번들러 설치 없이도 즉시 실행 가능하며, 동시에 Vite/Next.js 등 모던 프론트엔드 환경으로 바로 이식할 수 있는 **표준 ES Module (`type="module"`) 기반 아키텍처**로 설계되었습니다.

```text
/Users/gabriel.k/Documents/Workspace/meta-temple/
├── README.md                          # 프로젝트 전체 개요, 실행 방법 및 이어하기 가이드
├── docs/
│   ├── 01-planning-and-market-analysis.md  # 기획 의도, 벤치마킹 및 시장 분석
│   ├── 02-spatial-and-avatar-design.md     # 4단계 가람 배치, 아바타 3종 및 UX 상세 설계서
│   └── 03-technical-specification.md       # 기술 스택, 데이터 스키마 및 고도화 로드맵 (본 문서)
├── index.html                         # 메인 엔트리 HTML (Three.js Import Map 및 미니멀 HUD UI)
└── src/
    ├── styles.css                     # 한국 전통 사찰 미학(한지·먹빛·금니·단청 톤) 반응형 스타일시트
    ├── main.js                        # 앱 초기화, 루프 제어, UI 이벤트 바인딩 및 구역 감지 컨트롤러
    ├── data/
    │   └── templeData.js              # 자동 법명 사전, 반야심경/법구경 사경 데이터, AI 스님 차담 지식베이스, 초기 연등/기와 샘플
    ├── audio/
    │   └── soundEngine.js             # Web Audio API 기반 실시간 절차적(Procedural) ASMR & 전통 타악기(목탁·범종·풍경·죽비) 합성 엔진
    ├── world/
    │   ├── templeScene.js             # Three.js 씬, 카메라(1인칭/3인칭), 실시간 시간대·날씨(비/눈/안개) 조명 및 4대 구역 PBR 지형·전각 빌더
    │   └── avatarManager.js           # 플레이어 아바타(3종 외형) 및 동석 참배객(Co-presence NPC/Realtime 피어) 생성·애니메이션 상태 머신
    └── ui/
        └── modalManager.js            # 신행 활동(108배·염주 오버레이, 소원 연등, 기와 불사, 돌탑, 번뇌 소각장, 디지털 사경, AI 차담) 모달 제어
```

---

## 2. 핵심 서브시스템 기술 명세 (Core Subsystem Specs)

### 2.1 3D 렌더링 및 환경 조명 파이프라인 (`src/world/templeScene.js`)
1. **엔진 및 렌더러 설정**
   - [Three.js](https://threejs.org/manual/) `WebGLRenderer` (향후 `WebGPURenderer` 호환 구조)
   - `ACESFilmicToneMapping` 및 물리 기반 조명(`shadowMap.type = THREE.PCFSoftShadowMap`)을 활성화하여 목조건축의 깊은 처마 그림자와 금동불·연등의 따뜻한 글로우를 표현합니다.
2. **실시간 시간대(Time-of-Day) & 날씨(Weather) 상태 머신**
   - **시간대 프리셋 (5종)**:
     - `realtime`: 사용자의 로컬 시스템 시각(`new Date().getHours()`)을 기반으로 태양 고도, 하늘 그라데이션, 안개 밀도, 연등 점등 여부를 자동 계산합니다.
     - `dawn` (새벽예불, 05:00): 짙은 남청색 하늘(`#141e30`), 자욱한 바닥 물안개(`FogExp2`), 석등·연등 부분 점등.
     - `day` (한낮 산사, 13:00): 맑은 청자빛 하늘(`#7fa6c4`), 선명한 태양 직사광과 나뭇잎 그림자.
     - `sunset` (저녁노을, 18:00): 노을빛 주홍·보라 하늘(`#c96b4b`), 길게 드리운 그림자와 연등 점등 시작.
     - `night` (산사의 밤, 22:00): 깊은 먹빛 밤하늘(`#080b12`), 별빛 파티클, 마당의 수십 개 소원 연등과 대웅전 내부 촛불이 주 광원으로 작동.
   - **날씨 파티클 (3종)**:
     - `clear`: 솔잎과 반딧불/향 연기 미세 부유 입자.
     - `rain` (산사 봄비): 1,500개의 빗줄기 낙하 파티클 + 마당 바닥 재질의 거칠기(`roughness`) 감소로 젖은 반사광 연출 + 빗소리 ASMR 자동 가중.
     - `snow` (겨울 설경): 1,200개의 눈송이가 바람(Sine 파형)을 타고 흩날리며 지붕과 마당에 설경 분위기 연출.
3. **클릭 이동(Raycasting) 및 충돌·구역 감지**
   - 지면(`groundMesh`)에 대한 `THREE.Raycaster` 클릭 이동과 키보드(`WASD` / 화살표 키) 연속 이동을 동시에 지원합니다.
   - 플레이어의 `(X, Z)` 위치에 따라 현재 구역(`Zone 1 ~ 4`)을 실시간 판별하여 상단 현판 UI, 하단 추천 신행 버튼, 공간 음향 믹싱 비율을 자동으로 전환합니다.

### 2.2 절차적 Web Audio API 공간 ASMR 합성 엔진 (`src/audio/soundEngine.js`)
외부 MP3 파일 로딩 실패나 저작권 문제 없이 언제나 즉각 작동하도록 **[MDN Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics) 네이티브 오실레이터·노이즈 필터·컨볼루션 리버브 기반 절차적 사운드 엔진**을 구현했습니다 (추후 실제 사찰 현장 녹음 음원 `.mp3/.ogg` 트랙을 레이어로 손쉽게 추가 가능).
1. **3채널 마스터 믹서 버스 (`GainNode`)**
   - `natureGain`: 핑크/브라운 노이즈 + 대역통과 필터(`BiquadFilterNode`) 변조를 이용한 **솔바람 소리, 계곡 물소리, 빗소리**, 그리고 고주파 사인파 포락선 변조를 이용한 **산새 지저귐**.
   - `templeGain`: 펜타토닉(오음음계: 궁·상·각·치·우) 배음 합성 기반의 **처마 끝 풍경(풍탁) 소리**, 저주파 배음과 맥놀이(Beating) 감쇠를 구현한 **청동 범종 타종음**, 법당 내부의 고요한 **독송 공명 드론(Chant Drone)**.
   - `sfxGain`: 우드블록 포락선 공명을 합성한 **목탁(Moktak) 타격음**, 맑은 금속성 **인경/죽비 소리**, **염주 알 굴리는 소리**, 화로 **불꽃 타오르는 소리**.
2. **구역별 거리 감쇠 (Spatial Attenuation)**
   - 플레이어가 `Zone 3 (대웅전 내부)`에 들어가면 외부 바람·계곡물 볼륨이 40%로 줄어들고 법당 독송 공명과 실내 잔향(Reverb)이 깊어집니다.
   - `Zone 1 (일주문 숲길)`에서는 계곡물과 산새 소리가 강조되고, `Zone 4 (후원 다실)`에서는 찻물 끓는 소리와 대나무 바람 소리가 강조됩니다.

### 2.3 아바타 & 동석(Co-presence) 매니저 (`src/world/avatarManager.js`)
1. **플레이어 아바타 메쉬 빌더 (`buildAvatarMesh(style, meritData)`)**
   - `monk`: 무광 백자/목각 피부 셰이더 + 회색 장삼·가사 폴드 + 합장 가능한 양팔 관절 그룹 + 공덕 달성 시 손목 단주(염주) 및 손연등 부착.
   - `ink_wanderer`: 전통 삿갓(원추형 대나무 삿갓) + 먹빛 도포 + 반투명 수묵 아우라.
   - `lantern_spirit`: 부유하는 연꽃 등불 코어 + 회전하는 연잎 광원 + 빛 입자 궤적.
2. **침묵의 동석 참배객 시뮬레이션 및 실시간 연동 인터페이스**
   - 법당 방석에서 절을 올리거나, 석탑 주위를 탑돌이하거나, 숲길을 거니는 **동석 참배객(Ambient Visitors)**들이 함께 렌더링됩니다.
   - 플레이어가 `합장 반배(1번 키)`를 실행하면 반경 6m 이내의 동석 참배객이 플레이어를 바라보며 함께 고개 숙여 합장하고 화면에 따뜻한 알림(*"『달빛 머금은 풍경』 도반이 합장으로 답례합니다"*)이 표시됩니다.

---

## 3. 데이터 스키마 명세 (Data Schema for LocalStorage & Supabase)

현재 프로토타입은 브라우저 `localStorage`(`meta_temple_state_v1`)를 통해 새로고침 후에도 모든 수행 기록과 내가 단 연등·기와를 영구 보존하며, 상용 배포 시 [Supabase Realtime](https://supabase.com/docs/guides/realtime/presence) 및 PostgreSQL 테이블로 1:1 매핑할 수 있도록 설계되었습니다.

### 3.1 사용자 수행 프로필 (`UserProfile`)
```json
{
  "userId": "uuid-v4",
  "dharmaName": "새벽안개 품은 솔잎",
  "avatarStyle": "monk",
  "stats": {
    "bowCount": 108,
    "malaCount": 216,
    "lanternCount": 2,
    "tileCount": 1,
    "stoneCount": 3,
    "sutraCopiedCount": 5,
    "circumambulationLoops": 3
  },
  "unlockedItems": ["wooden_mala", "hand_lantern"],
  "lastVisitedAt": "2026-11-05T10:40:00+09:00"
}
```

### 3.2 소원 연등 & 기와 불사 엔티티 (`WishLantern`, `WishTile`)
```json
{
  "id": "lantern_1762306800",
  "authorDharmaName": "달빛 머금은 풍경",
  "color": "#ff8a65",
  "wishText": "가족 모두 몸과 마음이 평안하기를 발원합니다.",
  "position": { "x": -3.2, "y": 4.8, "z": -6.5 },
  "empathyCount": 14,
  "createdAt": "2026-11-05T10:40:00+09:00"
}
```

---

## 4. 다른 개발 도구에서 이어서 고도화하기 위한 단계별 로드맵

### Step 1. 국가유산청 실측 3D 에셋(`.glb`) 및 3DGS 배경 교체
1. 국가유산청 [국가유산 디지털 서비스 3D 에셋](https://digital.khs.go.kr/heritage/heriTage.do)에서 아래 에셋을 무료 다운로드(공공누리, 상업적 활용 가능)합니다:
   - **전각**: 부석사 무량수전 또는 봉정사 극락전, 일주문, 범종각 3D 모델
   - **성보**: 석굴암 본존불 또는 부석사 소조여래좌상, 불국사 삼층석탑(석가탑), 성덕대왕신종
2. 블렌더(Blender)에서 라이트맵(Lightmap)을 베이킹한 뒤 `gltf-transform` CLI로 압축합니다:
   ```bash
   npx @gltf-transform/cli optimize raw_daeungjeon.glb public/models/daeungjeon_opt.glb --compress draco --texture-compress ktx2
   ```
3. `src/world/templeScene.js`의 `loadCustomGLBModels()` 훅에 경로를 연결하면 절차적 기본 메쉬가 실측 스캔 모델로 즉시 대체됩니다.
4. 산사 원경(산봉우리, 계곡, 소나무 숲)은 드론 촬영 영상을 [PlayCanvas SuperSplat](https://developer.playcanvas.com/user-manual/supersplat/)으로 정제한 `.ply` / `.splat` 파일로 불러와 배경 레이어에 배치합니다.

### Step 2. Supabase Realtime 기반 실시간 멀티플레이어 동석 연동
1. Supabase 프로젝트 생성 후 `Realtime Presence` 채널(`room:cheongyeon_1`)을 구독합니다.
2. 플레이어의 위치 `(x, y, z)`, 회전값 `ry`, 아바타 스타일 `avatarStyle`, 현재 동작 `actionState`를 200ms 주기로 브로드캐스트하여 `avatarManager.syncRemotePeers(peers)`에 주입합니다.

### Step 3. LLM API(Gemini / OpenAI) 기반 실시간 AI 스님 차담 고도화
1. `src/ui/modalManager.js`의 `generateMonkResponse(userMessage)` 함수를 서버리스 함수(`/api/monk-chat`)와 연결합니다.
2. 시스템 프롬프트에 초기불교 경전(법구경, 숫타니파타, 금강경)과 선어록 구절을 RAG(검색 증강 생성)로 주입하여, 사용자의 고민에 대해 판단이나 훈계 없이 따뜻한 차담과 경전 한 구절을 건네도록 확장합니다.
