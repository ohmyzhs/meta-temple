# 청연산사 출시판 3단계 G — 실사 전환 (요구 1·4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에셋 스파이크(2단계 F, `docs/spike/REPORT.md`)에서 확인한 실사 파이프라인으로 세계를 구역별로 바꾼다. 다른 세션 작업과 꼬이지 않고, 언제든 한 줄로 되돌릴 수 있게.

**Architecture:** 실사 코드는 모두 새 폴더 `web/src/world/real/`, 에셋은 `web/assets/world/`. 기존 파일에는 훅 두 곳만 둔다.
절차적 세계는 그대로 남고, 플래그가 켜지면 정적 병합 전에 교체 대상(slot)을 병합에서 빼 두었다가 실사 GLB 가 도착하면 바꿔 끼운다. 실패하거나 저사양(`q=low`)이면 절차적 그대로.

**Spec:** `docs/superpowers/specs/2026-11-05-launch-upgrade-design.md` 3장·요구 1·4. 지도 확장(요구 5·8)은 session-3 의 `2026-11-05-launch-stage3-map.md`.

## 꼬이지 않게 — 파일 경계 (2026-11-06 확인)
| 누가 | 고치는 파일 | 이 계획에서 |
|---|---|---|
| session-3 지도 확장 (`claude/eager-clarke-abdc56`, 병합 대기) | `layout.js` `terrain.js` `vegetation.js` `temple.js`(생성자 부근) `main.js` `avatarManager.js` `state.js` server/* | **안 건드림** (layout 의 `addBoxCollider` 는 불러 쓰기만) |
| session-4 캐릭터 (`claude/avatar-motion`, 커밋 전) | `main.js` `avatarManager.js` `avatarRig.js` `tools/blender/avatar_*` | **안 건드림** |
| B·C (integration/launch 에 병합됨, 지금 쉼) | `templeScene.js` `index.html` `styles.css` `credits.js` … | `templeScene.js` 훅 몇 줄, `credits.js` scans 항목 |
| 이 계획 | 새 파일 `world/real/*`, `assets/world/*`, `temple.js` 의 slot 표시 한 줄씩 | |

- 커밋마다 `git merge-tree --write-tree HEAD claude/eager-clarke-abdc56` 로 session-3 와 충돌 없음을 확인한다.
- **대웅전 5×3칸 확장은 session-3 병합 뒤**로 미룬다 (충돌체·걷는 영역·좌복 자리가 모두 `layout.js`). 순서만 바꾸는 것이고 사용자 결정(5×3)은 그대로.

## 롤백
- `web/src/world/real/flag.js` 의 `DEFAULT` 한 줄 (`false` = 지금 세계). 방문별로는 `?world=real` / `?world=classic`.
- 플래그가 꺼지면 실사 모듈을 아예 받지 않는다 (동적 import). → 꺼진 상태의 그리기 호출·삼각형·스크린샷이 훅 넣기 전과 같아야 한다 (QA 게이트 1).
- 그 뒤로는 병합 커밋 `git revert -m 1`.

## 훅 넣기 전 기준 (병합 트리 c58bd10, `tools/spike/baseline.mjs`, Metal M4 Pro)
1280×800: 마당 13시 605 calls · 1,733,733 tris, 법당 13시 554 · 1,968,437, 마당 0시 628 · 2,008,159, 법당 0시 562 · 1,970,633.
390×844: 마당 13시 567 · 1,700,733, 법당 13시 468 · 1,696,145, 마당 0시 590 · 1,975,159, 법당 0시 476 · 1,698,341.
스크린샷: `.playwright-mcp/realflag/pre/` (gitignore).

## Tasks

### R1: 플래그·훅 골격
- Create `web/src/world/real/flag.js` (`REAL`), `web/src/world/real/realWorld.js` (`prepareReal(world)` → `{ update(dt, player) }`).
- Modify `templeScene.js`: `build()` 에서 Temple 생성 직후·정적 병합 전에 `if (REAL) this.real = (await import('./real/realWorld.js')).prepareReal(this)`, `update()` 에 `this.real?.update(dt, player)`.
- 게이트 1: 플래그 끔 → 위 기준과 calls·tris 동일, 스크린샷 픽셀 차 0.

### R2: 마당 석탑 = 고선사지 삼층석탑 스캔
- `temple.js`: `pg.userData.realSlot = 'pagoda'` 한 줄.
- 크기: 스캔 기단 반대각 약 4.5m, 높이 11.0m. 탑돌이 반경 4.5m(layout) 를 지키려면 반대각 ≤ 3.8m → **0.84배**(설계값, 높이 약 9.2m). 충돌 상자도 그 기단에 맞춰 더한다 (`addBoxCollider`).
- 받기: 플레이어가 석탑에서 90m 안이면 받기 시작 (첫 입장 숲길 예산에 넣지 않음, 입장 뒤 뒤에서).
- 게이트 2: 낮·밤·새벽 스크린샷, 탑돌이 한 바퀴가 기단에 막히지 않음, 클릭으로 탑돌이 시작.
- `credits.js` scans 에 국가유산청 항목 (공공누리 1유형 표시 의무).

### R2b: 공용 재질 사진 PBR (완료 2026-11-06)
- `realWorld.js` `MATERIALS`: `mats()` 의 floor·column·wood·woodDark 그림 텍스처를 KTX2 사진 PBR(색·노멀·거칠기/틈그늘)로. 기존 repeat 그대로.
- 화강암·회벽은 상자 UV 에서 결이 늘어져 뺐다 (시험 화면). 화강암은 월드 좌표(삼면) 투영이 필요 — 다음 단계.
- 용량: `web/assets/world/tex/*.ktx2` 7장 0.92MB, 입장 뒤 뒤에서 받음.

### R2c: 삼존 불상 = 생성형 사진 판 (완료 2026-11-06)
- 사용자 결정 「불상만 이미지로」(3D 모델 파일 대신). 참고: AI-CLASS 영상(2026-11-04)·산사(SANSA) 원본도 불상을 사진으로 벽면에 둔다.
- gpt-image 로 본존(석가모니불, 항마촉지인, 연화대좌·화염 광배)과 협시보살(보관·연꽃 봉오리, 본존 사진을 화풍 참조) 생성 → 녹색 배경을 빼 WebP 컷아웃
  (`tools/spike/matte.py`, 협시 오른쪽은 좌우 반전). 프롬프트 `docs/art/prompts/buddha-*.txt`.
- `temple.js` 에 `realSlot` 두 줄(buddha, bodhiL/R). 판 크기·자리는 절차적 불상(조각이 끝난 뒤)의 경계 상자를 그대로 따른다. 피킹은 숨긴 절차적 불상이 계속 받는다.
- 용량 1.08MB (본존 423KB, 협시 329KB×2), 법당 60m 안에서 받음. 검사 `tools/qa/real-buddha.mjs`.

### R3: 법당 실내 (지금 크기 3×2칸)
- 2026-11-06 판단: 지금 대웅전은 정면이 열려(들어걸개) 시간마다 해 방향이 바뀐다 → 스파이크처럼 해를 고정해 구운 라이트맵은 시간과 어긋난다.
  실내는 실시간 빛 + 사진 질감 + 구운 틈 그늘(AO)로 가고, 전체 빛 굽기는 5×3 확장 때 하늘빛만 굽는 방식으로 다시 정한다.
- 지금 대웅전 기둥 자리(xs −8, −2.8, 2.8, 8 · zs −30.4, −25.4, −20.4, 기둥 4.4m)에 맞춘 실내 셸을 `hall_bay.py` 로 다시 만든다 (불상·불단·좌복·탱화는 절차적 그대로 = 상호작용 유지).
- 라이트맵: 실시간 세계 노출(≈1)에 맞춘 배율, 낮·밤 두 벌을 `world.hour` 로 섞는다 (새벽·해질녘 = 섞임).
- 실내 지붕·벽은 C 의 가림 검사(`occluders`)에 넣는다.
- 불상 실사(청곡사 삼존 스캔)는 사용자가 받아 주면 별도 작업.

### R4: 하늘 (맨 나중)
- 새벽·해질녘 HDRI 가 없으므로 C 의 절차적 하늘을 기본으로 두고, 맑은 낮(9~16시)·밤(20~4시)에만 HDRI 배경을 섞을지 사용자 확인 후.

### R5: 회귀·보고
- 플래그 켬: C 의 `tools/qa/{night,day,occlusion,travel}.mjs`, B 의 `hud.mjs`, 폰 측정(DPR 1·2).
- `git merge-tree` 로 session-3 와 충돌 없음 확인 → 사용자에게 `integration/launch` 병합·기본값 켜기 여부를 묻는다.
