# 청연산사 출시판 3단계 G — 지도 확장 (순환 산책로 · 쉼터 · 돌탑 어디서나) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 짧은 숲길을 산사 전체를 두르는 순환 산책로로 넓히고, 길 중간의 쉼터(돌 쉼터·그루터기·돗자리·전망 바위·작은 다리·약수터)에 앉을 수 있게 하고, 산문 밖 어디서나 돌탑을 쌓게 한다 (설계 요구 5·8).

**Architecture:** 산책로는 three 없이 도는 순수 기하 모듈(`world/trail.js`: Catmull-Rom 표본 + 2m 격자 최근접 + 높이 단면)이고, `layout.js` 의 `terrainHeight`·`walkHeight`·`isWalkable`·`zoneAt` 이 그것을 읽는다. 쉼터·다리·돌탑 모양은 `world/trailProps.js`·`world/cairnField.js` 의 작은 빌더 함수라 나중에 실사 GLB 로 하나씩 바꿀 수 있다. 돌탑 배치 규칙(1.5m 안이면 그 탑에, 아니면 새 탑; 가까운 탑 위주·구역 상한)은 `core/cairns.js` 순수 함수로 서버·화면·테스트가 같은 규칙을 쓴다.

**Tech Stack:** Three.js 0.170, 바닐라 ES 모듈, Node 22 `node --test`, Postgres 17(`ALTER TABLE … ADD COLUMN IF NOT EXISTS`), 헤드리스 Playwright(MCP).

**Spec:** `docs/superpowers/specs/2026-11-05-launch-upgrade-design.md` 요구 5·8

## Global Constraints

- 브랜치 `claude/eager-clarke-abdc56` 에만 커밋. 푸시·병합은 사용자 확인 후 (`integration/launch`).
- 묶음 B(HUD 마크업·CSS, modalManager 출처)와 C(templeScene 카메라·하늘, main.js 장소 이동)를 건드리지 않는다. main.js 에는 상호작용 코드만 더하고 HUD 는 그대로 쓴다(`#prompt` 알약 하나).
- 구역 id 는 4개 그대로(`FOREST|COURTYARD|DAEUNGJEON|TEAHOUSE`). 산책로 위는 어디든 `FOREST` — C 의 `_crossZone` 디졸브가 능선·대숲에서 잘못 켜지지 않게.
- 모양은 지금 그림체(절차적)로. 재질은 `mats()` 공용 재질을 써서 `batchStatic` 이 기존 묶음에 합치게 한다 (draw call 거의 그대로).
- 캐시된 옛 화면·옛 서버와 섞여도 깨지지 않게: 서버 `stones` 새 필드는 선택 항목.
- 수치는 재서 넣는다 (지형 높이·길이·성능).

## 동선 (실측: `node --import <three 해석 훅>` 으로 `terrainHeight` 표본)

| 구간 | 길이 s(m) | 높이(m) | 쉼 |
|---|---|---|---|
| J1 일주문 안 숲길(z 22.5) → 계곡 남쪽 기슭 | 0–30 | 0 ~ 0.3 | 돌 쉼터(계곡을 봄) |
| 작은 나무다리 (x −27.9, z 10.6–18.6) | 30–38 | 다리 판 0.32–0.54 | 다리에 걸터앉기 |
| 서쪽 산자락 | 38–90 | 2.4 → 5 | 그루터기 2, 약수터 |
| 뒷산 능선 | 90–140 | 6 → 11.8 → 5.7 | 전망 바위(산사를 내려다봄), 돗자리 |
| 대숲 · 심검당 뒤 | 150–195 | 0 ~ 0.4 | 돌 쉼터, 다실 갈림길 |
| 계곡 북쪽 → J2 마당 계단 앞(z 9.8) | 195–227 | 0 ~ 0.4 | 돗자리 |

순환로 227m + 숲길 구간 12.7m. 마당 갈림길 = J2 바로 앞 계단, 다실 갈림길 = 대숲에서 심검당 동쪽 마당으로 5m.

## 변경 전 성능 (기준, 헤드리스 Chromium; `t._frame()` 40회 + readPixels 동기화)

| 화면 | spawn | court | 계곡 서쪽 | 전망 바위 | 대숲 |
|---|---|---|---|---|---|
| 390×844 high | 3.53ms · 559 calls | 4.53 · 683 | 1.22 · 151 | 1.95 · 629 | 1.52 · 366 |
| 390×844 low | 1.57 · 501 | 1.56 · 370 | 1.02 · 61 | 1.58 · 503 | 0.98 · 77 |
| 1280×800 high | 2.75 · 713 | 3.01 · 797 | 1.76 · 158 | 2.29 · 594 | 2.14 · 395 |

---

### Task G1: 산책로 기하와 걷기·높이·구역

**Files:**
- Create: `web/src/world/trail.js` (순수: `TRAIL_CTRL`, `trail`, `teaBranch`, `nearestTrail`, `SMALL_BRIDGE`, `onSmallBridge`, `smallBridgeY`, `REST_SPOTS`)
- Modify: `web/src/world/layout.js` (`pathX` 는 trail.js 의 `forestPathX`, `terrainHeight` 에 산책로 회랑, `walkHeight` 에 작은 다리, `isWalkable` 맨 앞에 산책로, `zoneAt` 산책로 = FOREST, `isClearForTree` 산책로 비움)
- Modify: `web/src/world/terrain.js` (흙길 색, 길가 바위)
- Modify: `web/src/world/vegetation.js` (길 가까운 나무 충돌, 대숲 길 비우기, 길가 풀)
- Test: `web/src/world/trail.test.js` (+ `package.json` test glob 에 `web/src/world/*.test.js`)

- [ ] **Step 1: 실패하는 테스트** — `loop_joins_forest_path`(양 끝이 숲길 중심선 위), `stays_inside_fine_terrain`(모든 표본이 안쪽 지형 격자에서 4m 안: x −38..58, z −52..54), `bridge_straight`(다리 구간 표본 |x−bridge.x| < 0.3), `nearest_matches_bruteforce`(무작위 500점), `rest_spots_reachable`(일어설 자리 standAt 이 산책로 반폭 안).
- [ ] **Step 2: 실패 확인** — `node --test web/src/world/trail.test.js` → FAIL.
- [ ] **Step 3: 구현** — 위 Files. 높이 단면은 산책로 회랑을 빼고 잰 바탕 높이를 ±6m 이동 평균, 다리 구간은 판 높이로 고정하고 양 끝 4m 에서 잇는다.
- [ ] **Step 4: 통과 확인** — `npm test` PASS. `world.build()` 시간 전후 비교(헤드리스, 입장 단추 활성까지).
- [ ] **Step 5: Commit** — `Perimeter loop trail: walkable spline, terrain corridor, small bridge`

### Task G2: 쉼터 — 고른 자리로 걸어가 앉기

**Files:**
- Create: `web/src/world/trailProps.js` (`buildTrailProps(scene, m)` → `{ spots, showMat(id), hideMat() }`; 종류별 빌더 `bench|stump|mat|lookout|bridge|spring`)
- Modify: `web/src/world/temple.js` (생성자에서 `buildTrailProps`, 돗자리 묶음을 `dynamicRoots` 에)
- Modify: `web/src/main.js` (`_sitRest(spot)` — `_sitCushion` 과 같은 꼴: 가까우면 산책로를 따라 걸어가고, 멀면(직선 8m 넘고 산책로 경유 60m 넘음) 순간 이동; `_findNearby`·`_activateNearby`·`_click` 에 쉼터; `onStandUp` 에서 돗자리 걷기)

- [ ] **Step 1:** 쉼터 자리 표(`REST_SPOTS`: id, kind, label, x, z, ry, seatH, stand) — 산책로 위 실측 높이로 확인.
- [ ] **Step 2:** 빌더 6종 (모두 `mats()` 재질, 돗자리만 따로 숨김 메쉬).
- [ ] **Step 3:** `_sitRest` + 알림 문구. 돗자리: 앉을 때 펴지고 일어서면 걷힌다.
- [ ] **Step 4: 화면 확인** — 헤드리스로 종류별 앉은 모습 스크린샷 6장 (390×844).
- [ ] **Step 5: Commit** — `Rest spots along the trail: benches, stumps, mats, lookout rock, bridge, spring`

### Task G3: 돌탑 어디서나 (규칙 · 서버)

**Files:**
- Create: `web/src/core/cairns.js` (순수: `JOIN_RADIUS=1.5`, `findJoinable(cairns,x,z)`, `placeStone(cairns,x,z,newId)`, `pickVisible(cairns,px,pz,{max,cell,perCell})`, `areaCount(cairns,x,z,r)`)
- Create: `web/src/core/cairns.test.js`
- Modify: `server/store.js` (`ALTER TABLE stones ADD COLUMN IF NOT EXISTS cairn_id text, x double precision, z double precision` + 색인, `recent()` 에 `cairns:[{id,x,z,n}]`·`gateStones`, `cairnById`, `cairnsNear`, 메모리 저장소 동일)
- Modify: `server/server.js` (POST `/api/stones` 의 선택 필드 `cairnId,x,z` 검사 → 1.5m 안 탑이 있으면 그 탑으로 합침, 새 탑은 반경 5m 안 6개 상한 → 422, 응답에 최종 `cairnId,x,z`)
- Test: `server/server.test.js` (`stone_cairn_fields`, `stone_joins_nearby_cairn`, `stone_area_cap`, `stone_bad_cairn_400`, `old_stone_still_gate`)

- [ ] **Step 1: 실패하는 테스트** — 위 이름들 + `cairns.test.js`: `joins_within_1_5m`, `new_when_farther`, `nearest_of_two`, `visible_nearest_first_with_cell_cap`.
- [ ] **Step 2: 실패 확인 → Step 3: 구현 → Step 4: `npm test` PASS.**
- [ ] **Step 5: Commit** — `Cairns anywhere: shared cairn_id/x/z on stones, server-side join and area cap`

### Task G4: 돌탑 어디서나 (화면)

**Files:**
- Create: `web/src/world/cairnField.js` (모든 길가 돌탑을 InstancedMesh 하나로; 가까운 탑 위주 `pickVisible`, 떨어지는 돌 하나만 따로 움직임)
- Modify: `web/src/core/state.js` (`migrateState` 가 돌의 `cairnId,x,z` 를 지킴, `addStone(wish, share, place)`, `mergeShared` 가 `cairns`·`gateStones` 를 받음, `cairnList()`)
- Modify: `web/src/world/layout.js` (`canBuildCairn(x,z)`: 걸을 수 있고 FOREST, 다리·쉼터·충돌체 위가 아님)
- Modify: `web/src/main.js` (멈춰 선 곳이 쌓을 수 있으면 알약에 「여기에 돌탑 쌓기」/「돌탑에 돌 얹기 · N층」; 누르면 지금 있는 소원 돌탑 창을 그대로 열고, 얹을 때 그 자리 규칙으로 탑을 고름; 공개 응답의 최종 `cairnId` 반영)
- Test: `web/src/core/state.test.js` (`stone_place_survives_reload`)

- [ ] **Step 1~4:** 테스트 → 구현 → `npm test` PASS.
- [ ] **Step 5: 화면 확인** — 산책로 두 곳(계곡 기슭, 능선)에 돌탑을 쌓고(새 탑 1층 → 같은 자리 2층), 다른 브라우저 창에서 서버를 통해 보이는지 스크린샷.
- [ ] **Step 6: Commit** — `Build a cairn anywhere outside the gate`

### Task G5: 성능·검증·보고

- [ ] 위 기준표와 같은 방법으로 390×844(high·low)·1280×800 재측정, draw call·ms/frame·삼각형·부팅 시간 비교를 이 문서 끝에 적는다.
- [ ] 헤드리스 스크린샷: 산책로 여러 지점, 쉼터 종류별 앉기, 산책로 두 곳의 돌탑 → SendUserFile.
- [ ] `integration/launch` 병합 여부를 사용자에게 묻는다.

---

## 결과 (2026-11-06, 커밋 3ec2c1b)

### 성능 — 변경 전(1회) → 변경 후(2회 범위), 같은 방법·같은 지점

ms/frame 은 `t._frame()` 40회 + readPixels 동기화 (회차마다 ±0.6ms 흔들림). draw calls 는 그림자·후처리 포함 한 프레임.

| 화면 · 지점 | ms/frame 전 → 후 | draw calls 전 → 후 |
|---|---|---|
| 390×844 high · spawn | 3.53 → 1.89–2.44 | 559 → 574–578 |
| 390×844 high · court | 4.53 → 2.07–2.53 | 683 → 707–716 |
| 390×844 high · 계곡 서쪽 | 1.22 → 1.32–1.44 | 151 → 159–167 |
| 390×844 high · 전망 바위 | 1.95 → 2.23–2.68 | 629 → 673–679 |
| 390×844 high · 대숲 | 1.52 → 1.46–1.57 | 366 → 371–372 |
| 390×844 low · spawn | 1.57 → 1.56–2.16 | 501 → 504–506 |
| 390×844 low · court | 1.56 → 1.80–1.96 | 370 → 379–384 |
| 390×844 low · 전망 바위 | 1.58 → 2.17–2.77 | 503 → 496–498 |
| 1280×800 · spawn | 2.75 → 2.73–2.90 | 713 → 734–736 |
| 1280×800 · court | 3.01 → 2.79–3.11 | 797 → 798–806 |
| 1280×800 · 전망 바위 | 2.29 → 2.33–2.38 | 594 → 720–721 |
| 1280×800 · 대숲 | 2.14 → 2.07–2.16 | 395 → 401–402 |

- 정적 묶음 351→64 개가 473→70 개로 (쉼터·다리·석등이 기존 재질 묶음에 합쳐짐). 평소 지점 draw call +1~4%.
- 전망 바위 1280×800 +127 calls 는 일부러 연 시야 때문 (전망 바위·능선 돗자리 앞 나무를 비워 산사 전각이 한눈에 들어옴). 저사양(low)에서는 오히려 −5.
- 삼각형은 조금 줄었다 (길 위 나무를 비움: 390 high spawn 1725k → 1682k).
- rAF fps 는 헤드리스에서 화면 주사율(60/120Hz)에 묶여 비교가 안 된다: 전 390 ≈119–120 · 1280 ≈60–70, 후 두 번째 회차 전 지점 120.5.
- 부팅(이동 → 입장 단추 활성) 전 1.1–1.6s, 후 1.05–1.74s. `nearestTrail` 은 2m 격자로 지형 정점 59k 번에 28ms (Node).

### 확인한 것
- `npm test` 43개 통과 (산책로 기하 7, 돌탑 규칙 6, 서버 돌탑 필드 5, 상태 2 추가).
- Postgres 17(docker)에서 옛 `stones` 표 + 옛 돌 1개 위로 새 서버를 두 번 띄움: ALTER 가 두 번째에도 문제없음, 새 탑·1m 옆 합치기·아는 탑 id 로 엉뚱한 자리 보내기(탑 자리 유지)·옛 형식 돌(gateStones 로)·구역 상한 422·잘못된 id 400.
- 헤드리스 걷기: J1 → J2 산책로 전체를 경유점 이동으로 94.8초에 막힘 없이 완주. 중심선 ±1m 는 다리 밖(난간 너머)만 빼고 모두 걸을 수 있음.
- 다른 브라우저 문맥(빈 기록)에서 서버를 통해 길가 돌탑 4개가 보임.

### 병합 메모 (B·C)
- B·C 브랜치는 bc97ddb(묶음 A 이전)에서 갈라져, 이 브랜치와 겹치는 충돌은 main.js 맨 위 import 줄뿐 (A 의 `nameField` import 와 B/C 의 새 import). main 과 B/C 사이의 충돌과 같은 것.
- C 를 합치면 `_jump` 가 C 의 `_veilTeleport`(가림막 순간 이동)를 그대로 쓴다.
