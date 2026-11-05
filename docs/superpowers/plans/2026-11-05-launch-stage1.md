# 청연산사 출시판 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 출시판 1단계 세 묶음 — A 안전·계정, B 모바일 UI, C 렌더·카메라 — 를 서로 다른 브랜치에서 동시에 만들고 `integration/launch` 통합 브랜치에서 합친다.

**Architecture:** 정적 Three.js 사이트(web/, 빌드 없음)와 Node 실시간 서버(server/, ws + pg). 욕설 규칙은 서버와 화면이 한 파일을 공유한다. UI 는 HUD 를 하단 독·메뉴 시트·장소 시트로 다시 짜고, 렌더는 시간대 키와 하늘 셰이더·카메라 규칙을 고친다.

**Tech Stack:** Three.js 0.170 (jsdelivr importmap), 바닐라 ES 모듈, Node 22 (`node --test`), Postgres 17, 헤드리스 Playwright(MCP) 로 화면 검증.

**Spec:** `docs/superpowers/specs/2026-11-05-launch-upgrade-design.md`

## Global Constraints

- 사용자에게 보이는 글·답변은 전부 한국어.
- main 에 푸시하면 실서버에 곧바로 배포된다. 각 묶음은 자기 브랜치(`launch/safety-account`, `launch/mobile-ui`, `launch/render-camera`)에만 커밋하고, 푸시·main 병합은 사용자 확인 후.
- 외부 스크립트는 jsdelivr 고정 버전만 (지금 `three@0.170.0`). 새 런타임 의존성 금지 (서버 `pg`, `ws` 그대로).
- UI 변경은 헤드리스 Playwright 스크린샷으로 눈으로 확인한 뒤 커밋한다 (360×780, 390×844, 430×932, 844×390 가로, 820×1180, 1280×800).
- 코드에 넣는 수치(시간, 거리, 밝기)는 재서 넣는다. 추정값을 사실처럼 쓰지 않는다.
- 공개 글이 거르는 대상: 연등·기와·돌탑 글, 이름(법명), 작성자 표시. (차담 입력·출력은 2단계 D 에서 같은 모듈 사용.)
- 자살·자해 신호 안내 번호는 **109** (자살예방상담전화, 2024-01 통합, 24시간).
- 로컬 검증: `python3 .claude/devserver.py 8080`(Range 지원) + `PORT=8095 node server/server.js`(메모리 저장소). 헤드리스 부팅 스크립트 `.playwright-mcp/boot.js` (입장 후 `window.__view({...})` 제공).

## Review Focus

1. 이미 저장된 v2 기록(옛 `userId`, `dharmaName`, 통계)을 가진 사람이 새 버전에 들어와도 기록·법명이 그대로여야 한다 → Task A3 의 `migrateState` v2 픽스처 테스트.
2. 띄어쓰기·특수문자·한영 섞기·자모 분리로 거름을 우회하는 글(`섹 스`, `S.e.x`, `ㅅㅔㄱㅅㅡ`, `시1발`)이 막혀야 하고, 멀쩡한 말(`시발점`, `섹션`, `건강기원`)은 통과해야 한다 → Task A1 테스트 표.
3. 캐시된 옛 화면이 새 서버에 접속해도(이름 필드 없음, report 없음) 깨지지 않아야 한다 → Task A2 의 옛 형식 hello·POST 테스트.
4. 안드로이드 뒤로가기를 빠르게 여러 번 눌러도 한 번에 사이트를 벗어나지 않아야 하고, 창이 여럿 겹쳐 있으면 위에서부터 하나씩 닫혀야 한다 → Task B3 테스트.
5. 자정·새벽 2시 화면에서도 지붕선·석탑·나무 줄기가 보여야 한다 (어두운 폰 화면 밝기에서도) → Task C1 의 밝기 측정 테스트.

---

## 묶음 A — 안전·계정 (브랜치 `launch/safety-account`)

### Task A1: 공용 거름 모듈

**Files:**
- Create: `server/moderation.js` (원본, DOM 없는 순수 ESM — 서버·브라우저 공용)
- Create: `web/src/core/moderation.js` → `../../../server/moderation.js` 심볼릭 링크
- Modify: `deploy/deploy.sh:37` — `rsync -a` → `rsync -aL` (링크를 실제 파일로 올림)
- Test: `server/moderation.test.js`

**Interfaces:**
- Produces:
  - `normalizeText(s: string): string` — 비교용 정규형.
  - `checkText(s: string, opts: { kind: 'wish'|'name'|'chat', max?: number }): { ok: true, text: string } | { ok: false, reason: 'empty'|'too_short'|'too_long'|'link'|'contact'|'abuse'|'sexual'|'reserved', message: string }` — `text` 는 정리된 원문(공백 정리·제어문자 제거, 원래 글자 유지).
  - `NAME_MIN = 2`, `NAME_MAX = 12`.

- [ ] **Step 1: 실패하는 테스트 작성** — `server/moderation.test.js` (`node:test`, `node:assert`)
  - `blocks_sexual_variants`: `['쉐엑스','Cex','세엑스','Sex','S e x','S.e.x','s3x','섹 스','쎅쓰','섹쓰','ㅅㅔㄱㅅㅡ','sex하자']` 각각 `checkText(x,{kind:'wish'}).ok === false` 이고 `reason === 'sexual'`.
  - `blocks_abuse_variants`: `['시발','씨발','시1발','ㅅㅂ','ㅆㅂ','병신','병1신','ㅂㅅ','좆','개새끼','지랄','fuck','f*ck']` → `reason === 'abuse'`.
  - `blocks_links_contacts`: `['www.abc.com','abc.kr','http://x','010-1234-5678','01012345678','카톡 abc123','오픈채팅']` → `reason` 가 `'link'` 또는 `'contact'`.
  - `allows_normal`: `['건강기원','부모님 부자 되세요','로또대박기원🙏','흐르는데로 편하게 지내다 가자','아자아자','시발점에서 다시','섹션 정리','엑스포 구경','캬~~']` → `ok === true`.
  - `name_rules`: `checkText('',{kind:'name'}).reason==='empty'`, `checkText('가',{kind:'name'}).reason==='too_short'`, `checkText('가'.repeat(13),{kind:'name'}).reason==='too_long'`; `['관리자','운영자','admin','청연산사']` → `'reserved'`; `'청풍 스님'` → ok.
  - `normalize_examples`: `normalizeText(' S.e.X ') === normalizeText('sex')`, `normalizeText('ㅅㅔㄱㅅㅡ') === normalizeText('섹스')`.
- [ ] **Step 2: 실패 확인** — Run: `node --test server/moderation.test.js` → Expected: FAIL (`Cannot find module './moderation.js'`).
- [ ] **Step 3: `server/moderation.js` 구현**
  - 정규화 순서: NFKC → 소문자 → 제로폭·제어문자 제거 → 한글 음절을 초·중·종성 자모로 분해(자모만 쓴 글과 같은 꼴이 되게) → leet 치환(`0→o 1→i 3→e 4→a 5→s 7→t @→a $→s`, `*`는 와일드카드 한 글자) → 공백·기호·이모지 제거.
  - 사전: 한국어·영어 욕설/성적 표현 목록(소리 비틀기 변형 포함: `쉐엑스·세엑스·쎅스·섹쓰·쌕스` 등)을 자모 분해형으로 미리 만들어 두고 부분 일치. 영어 낱말은 원문 기준 단어 경계(`\bsex\b` 류)로 따로 검사해 `essex·sextant` 오탐을 피한다.
  - 예외(허용) 목록: `시발점·시발역·섹션·섹터·엑스포` 등 — 정규형에서 예외어를 먼저 지운 뒤 금지어 검사.
  - 링크·연락처: 원문에서 URL·도메인(`.com .kr .net .org .io` 등)·전화번호(숫자 9자리 이상, 하이픈 포함)·`카톡|오픈채팅|텔레그램|라인 ?아이디`.
  - 한국어 공개 금지어 목록을 가져다 쓰면 라이선스를 파일 머리 주석에 적는다 (확인 안 되면 직접 작성).
- [ ] **Step 4: 통과 확인** — Run: `node --test server/moderation.test.js` → Expected: PASS (전 케이스).
- [ ] **Step 5: 링크·배포 확인** — `ln -s ../../../server/moderation.js web/src/core/moderation.js`; Run: `DEPLOY_DRY_RUN=1 deploy/deploy.sh` 의 스테이징 디렉터리에서 `test -f "$STAGE/v/$REV/core/moderation.js" && ! test -L ...` (dry-run 이 스테이징을 남기지 않으면 스크립트에 `KEEP_STAGE=1` 출력 경로 옵션 추가). 브라우저에서 `import('./src/core/moderation.js')` 가 로드되는지 devserver 로 확인.
- [ ] **Step 6: Commit** — `git add server/moderation.js server/moderation.test.js web/src/core/moderation.js deploy/deploy.sh && git commit -m "Shared text moderation for wishes and names"`

### Task A2: 서버 적용 — 글·이름 거름, 신고, 연속 등록 제한, 관리 스크립트

**Files:**
- Modify: `server/server.js` (`validWish`·`BLOCK_RE`·`LINK_RE` 를 `checkText` 로 교체, `hello`/`s` 의 이름, POST 작성자, `/api/report` 추가, 연속 등록 제한)
- Modify: `server/store.js` (SCHEMA 에 `reports` 테이블, `report(kind,id,clientHash)`, memoryStore 동일)
- Create: `deploy/mod.sh` (VM 에서 psql: `list [kind] [n]`, `hide <id>`, `unhide <id>`, `find <text>`)
- Test: `server/server.test.js` (메모리 저장소로 서버를 띄워 fetch/WebSocket 으로 검사)

**Interfaces:**
- Consumes: `checkText`, `NAME_MIN`, `NAME_MAX` (Task A1).
- Produces:
  - `POST /api/report` `{ kind: 'lanterns'|'tiles'|'stones', id, clientId }` → `200 { hidden: boolean, reports: number }`; 서로 다른 clientHash 3건이면 해당 글 `hidden = true`.
  - 거른 글은 `422 { error: <checkText.message>, reason }`.
  - 같은 clientHash 가 같은 kind 를 20초 안에 다시 올리면 `429 { error: '잠시 숨을 고른 뒤 다시 올려 주세요' }`.
  - WS 이름이 거름에 걸리면 `'도반'` 으로 바꿔 쓴다 (연결은 끊지 않음). POST `author` 가 걸리면 `'이름 없는 도반'`.
  - `store.report(kind, id, clientHash) → { reports: number, hidden: boolean } | null`.

- [ ] **Step 1: 실패하는 테스트 작성** — `server/server.test.js`: `before` 에서 `PORT=8199` 로 `server.js` 를 자식 프로세스로 띄우고(`DATABASE_URL` 없음 → 메모리), 아래를 검사.
  - `post_sexual_stone_rejected`: `POST /api/stones {id:'s_'+uuid, wish:'쉐엑스', clientId:'c1'}` → 422, `reason==='sexual'`.
  - `post_normal_then_quick_repeat_429`: 정상 글 201 → 5초 안에 같은 clientId 로 두 번째 → 429.
  - `report_three_hides`: 정상 글 하나에 clientId `r1,r2,r3` 로 신고 → 세 번째 응답 `hidden:true`, 이어 `GET /api/shared` 에 그 id 없음. 같은 clientId 중복 신고는 수를 늘리지 않음.
  - `ws_bad_name_replaced`: WS `hello {name:'씨발', style:'monk'}` 를 보낸 사람이 다른 접속자에게 `'도반'` 으로 보임.
  - `old_client_compat`: 이름 없는 `hello {style:'monk'}`, `report` 를 모르는 옛 형식 POST 도 그대로 201.
- [ ] **Step 2: 실패 확인** — Run: `node --test server/server.test.js` → Expected: FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces 그대로. 연속 등록 제한은 메모리 `Map(clientHash+kind → lastAt)`(재시작 시 초기화 허용, `ponytail:` 주석으로 한계 표기). `reports` 테이블: `(kind text, item_id text, client_hash text, created_at timestamptz default now(), primary key(kind,item_id,client_hash))`.
- [ ] **Step 4: 통과 확인** — Run: `node --test server/` → Expected: PASS (A1 + A2).
- [ ] **Step 5: 실서버 스키마 반영 방법 확인** — `CREATE TABLE IF NOT EXISTS` 라 `deploy/live.sh` 재실행으로 적용됨을 로컬 Postgres(docker `postgres:17`)에서 한 번 확인: `docker run --rm -d -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:17` 후 `DATABASE_URL=postgres://postgres:x@localhost:55432/postgres node server/server.js` 기동·신고 1건.
- [ ] **Step 6: Commit** — `git add server/ deploy/mod.sh && git commit -m "Server-side moderation, reports with auto-hide, post cooldown, mod script"`

### Task A3: 저장 구조 v3 · 이름 직접 짓기 · 백업

**Files:**
- Modify: `web/src/core/state.js` (`VERSION` 3, `migrateState(raw)` export, `profileId`, `updatedAt`, `exportState()`, `importState(json)`)
- Modify: `web/src/main.js` (입장 화면·내 모습 메뉴의 이름 입력 연결, `live.setIdentity`)
- Modify: `web/index.html`, `web/src/styles.css` (입장 화면 이름 입력칸 — 묶음 B 의 HUD 영역은 건드리지 않음, 입장 화면 `#intro` 안만)
- Test: `web/src/core/state.test.js` (`node --test`, 가짜 `localStorage`)

**Interfaces:**
- Consumes: `checkText` (Task A1, `web/src/core/moderation.js`).
- Produces:
  - 저장 키는 그대로 `meta_temple_cheongyeon_state_v1` (옛 방문자 호환), 내용 `{ schemaVersion: 3, profileId, updatedAt, profile:{ dharmaName, nameIsCustom, avatarStyle, stats, unlockedItems, attendance, dharmaCards, lastVisitedAt }, settings, lanterns, tiles, stones, empathized }`.
  - `migrateState(raw: object|null): State` — v2(`version:2`, `profile.userId`) → v3 (`profileId = profile.userId`, `nameIsCustom:false`), 알 수 없는 값은 기본값으로.
  - `TempleStore#setDharmaName(name, { custom: boolean })` — `custom` 이면 `checkText(kind:'name')` 통과해야 저장, 실패 시 `{ ok:false, message }` 반환.
  - `TempleStore#exportState(): string` (JSON), `TempleStore#importState(json: string): { ok: boolean, message?: string }` (같은 `migrateState` 경유).
  - `TempleStore#profileId: string` getter.
- [ ] **Step 1: 실패하는 테스트 작성** — `web/src/core/state.test.js`
  - `migrate_v2_keeps_records`: v2 픽스처(`version:2, profile:{userId:'u-1', dharmaName:'청풍', stats:{bowCount:108}, attendance:{totalDays:3}}`) → `schemaVersion===3`, `profileId==='u-1'`, `profile.dharmaName==='청풍'`, `stats.bowCount===108`, `attendance.totalDays===3`.
  - `custom_name_rejects_bad`: `setDharmaName('씨발',{custom:true}).ok===false`, 저장된 이름 그대로.
  - `custom_name_accepts`: `setDharmaName('달빛 머문 도반',{custom:true}).ok===true`, `nameIsCustom===true`.
  - `export_import_roundtrip`: `importState(exportState())` 후 `profileId`·통계 같음; 깨진 JSON → `ok:false`.
- [ ] **Step 2: 실패 확인** — Run: `node --test web/src/core/state.test.js` → Expected: FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces. 공유 글 저장 제외(`shared:true` 필터)는 지금 동작 유지.
- [ ] **Step 4: 통과 확인** — Run: `node --test web/src/core/state.test.js` → Expected: PASS.
- [ ] **Step 5: 화면 연결** — 입장 화면: 지금의 `#intro-dharma-name` 옆에 「직접 짓기」 → 입력칸(2~12자, 입력 중 `checkText` 결과를 아래 한 줄로), 「다시 받기」는 추천 법명. 내 모습 메뉴에도 같은 입력. 바꾸면 `live.setIdentity(name, style)`. 수행 기록 화면에 「기록 내보내기 / 가져오기」(파일 저장·열기).
- [ ] **Step 6: 화면 확인** — 헤드리스로 390×844·1280×800 입장 화면 스크린샷, 금지어 입력 시 안내 문구, 정상 이름 저장 후 새로고침해도 유지.
- [ ] **Step 7: Commit** — `git commit -m "State schema v3 with profileId, custom dharma names, export/import"`

### Task A4: 과금 대비 골격 (결제는 꺼 둠)

**Files:**
- Create: `server/products.js` (상품 초안 목록, 기본 비활성)
- Create: `server/payments/toss.js` (인터페이스만, `PAYMENTS_ENABLED !== 'true'` 이면 `503`)
- Modify: `server/store.js` (SCHEMA 에 `entitlements`, `orders` 테이블)
- Modify: `server/server.js` (`GET /api/products` → 비활성이면 `{ enabled:false, products:[] }`)
- Test: `server/payments.test.js`

**Interfaces:**
- Produces:
  - `PRODUCTS: Array<{ sku: string, name: string, priceKrw: number|null, kind: 'offering'|'decor'|'tea_leaves', durationDays?: number }>` — 초안: `offering_free`(공양 올리기, 금액 직접), `lantern_gold_30d`, `tile_gold`, `stone_gold`, `tea_leaves_20`. 가격은 `null`(미정).
  - 테이블: `orders(order_id text pk, profile_id text, sku text, amount int, status text, provider text, created_at, updated_at)`, `entitlements(id serial pk, profile_id text, sku text, source text check (source in ('merit','purchase')), granted_at timestamptz, expires_at timestamptz null)`.
  - `toss.createOrder({profileId, sku, amount}) / toss.confirm({paymentKey, orderId, amount})` — 지금은 둘 다 `{ error:'payments_disabled' }`.
- [ ] **Step 1: 테스트** — `products_disabled_by_default`: `GET /api/products` → `{enabled:false, products:[]}`; `toss_disabled`: `createOrder()` → `{error:'payments_disabled'}`.
- [ ] **Step 2: 실패 확인 → Step 3: 구현 → Step 4: 통과 확인** — Run: `node --test server/` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Payment-ready skeleton: products, orders, entitlements (disabled)"`

### Task A5: 묶음 A 배포 준비

- [ ] 로컬 전체 확인: `node --test server/ web/src/core/` PASS, 헤드리스에서 금지어 돌탑 등록 시 안내, 정상 등록·신고 3회 숨김 동작.
- [ ] 사용자에게 보고 후 확인받으면: `integration/launch` 에 병합 → `deploy/live.sh`(서버) → main 푸시(화면). 실서버에서 `/api/health`, 금지어 POST 422 확인.

---

## 묶음 B — 모바일 UI (브랜치 `launch/mobile-ui`)

### Task B1: 아이콘 세트

**Files:**
- Create: `web/assets/icons/icons.svg` (SVG `<symbol>` 스프라이트)
- Create: `web/src/ui/icons.js` (`icon(name: string, { label?: string }): string` → `<svg aria-hidden><use href="./assets/icons/icons.svg#name"/></svg>`)
- Test: `web/src/ui/icons.test.js` (스프라이트에 아래 이름이 모두 있는지 파싱 검사)

**Interfaces:**
- Produces: 심볼 이름 — 행동 `bow_half prostrate meditate incense circumambulate tea`, 도구 `menu time_weather sound self record help credits close more back`, 장소 `zone_forest zone_courtyard zone_hall zone_teahouse`, 신행 `stone_pagoda wish_lantern wish_tile burn_worry bell_strike practice_108 sutra_copy yebul tea_chat dharma_card`.
- [ ] Step 1 테스트(이름 전부 존재) → Step 2 실패 확인(`node --test web/src/ui/icons.test.js`) → Step 3 그리기: 24×24 격자, 둥근 끝 1.75px 선, `currentColor`, 장소는 건물 실루엣(일주문·석탑·팔작지붕 법당·다실 찻잔+지붕). 필요하면 생성형 이미지로 원안을 먼저 뽑아 형태를 정하고 SVG 로 손질한다 → Step 4 통과 → Step 5 1280×800 에서 아이콘 시트 페이지(임시) 스크린샷으로 확인 → Commit.

### Task B2: HUD 재배치 — 하단 독, 메뉴 시트, 장소 시트, 오작동 방지

**Files:**
- Modify: `web/index.html` (HUD 마크업: `#dock`, `#menu-sheet`, `#place-sheet`; 기존 `.hud-tools`, `.hud-compass`, `.gesture-bar`, `#ritual-bar` 대체)
- Modify: `web/src/styles.css` (HUD 부분), `web/src/main.js` (`_bindHUD`, `_onZoneChange` 의 신행 버튼 생성, 키보드 1~6 은 유지)
- Test: `tools/qa/hud.mjs` (헤드리스 검사 스크립트 — 아래 기준을 숫자로 출력)

**Interfaces:**
- Produces:
  - 하단 독: 지금 구역의 주 신행 1~2개 + 몸짓 4개(합장·큰절·가부좌·헌향) + 「더보기」(나머지 몸짓·신행을 시트로). 버튼 = `<button class="ctl">` + 아이콘 + 짧은 글자.
  - 우측 상단: 장소 버튼(지금 장소 아이콘 + 이름) 하나, 메뉴 버튼(≡) 하나. 메뉴 시트 항목: 시간·날씨, 소리, 내 모습, 수행 기록, 도움말, 자료 출처 — 각 아이콘 + 글자.
  - 장소 시트: 4곳 아이콘 + 이름 + 한 줄 설명, 지금 장소 표시.
  - 모든 `.ctl`: `user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; -webkit-tap-highlight-color:transparent; touch-action:manipulation;` 최소 48×48px, 글자는 `pointer-events:none` 로 아이콘·글자 위를 눌러도 버튼이 받음.
  - 시트 열림 상태 API (B3 이 씀): `ui.openSheet(id)`, `ui.closeTop(): boolean`, `ui.hasOpen(): boolean` (`web/src/ui/sheets.js`).
- [ ] Step 1 `tools/qa/hud.mjs` 작성: 각 뷰포트에서 모든 `.ctl` 의 크기 ≥ 48×48, 서로 겹침 없음, 화면 가림 비율(HUD 요소 면적 / 화면 면적) 세로 폰 ≤ 18%, 길게 누르기 후 `getSelection().toString() === ''`.
- [ ] Step 2 실패 확인(지금 HUD 로 실행 → 기준 미달 출력) → Step 3 구현 → Step 4 통과 → Step 5 여섯 뷰포트 스크린샷 확인 → Commit.

### Task B3: 안드로이드 뒤로가기 방어

**Files:**
- Create: `web/src/ui/backGuard.js` (`installBackGuard({ closeTop: () => boolean, toast: (msg) => void })`)
- Modify: `web/src/main.js` (입장 시 설치; `closeTop` 은 순서대로 예불 듣기 → 열린 모달 → 시트 → (2단계) 차담을 닫음)
- Test: `tools/qa/back.mjs` (헤드리스에서 `page.goBack()` 으로 검사)
- [ ] Step 1 테스트: (a) 모달 열고 뒤로 → 모달 닫힘, URL 그대로 사이트 안; (b) 시트 + 모달 겹침에서 뒤로 두 번 → 모달 먼저, 시트 다음; (c) 아무것도 없을 때 뒤로 한 번 → 안내 토스트 `한 번 더 누르면 산문을 나섭니다`, 사이트 안; (d) 2초 안에 한 번 더 → 이전 페이지로 나감; (e) 0.2초 간격 세 번 연타(창 하나 열림) → 창만 닫히고 사이트 안.
- [ ] Step 2 실패 → Step 3 구현: 입장 시 `history.pushState({temple:1}, '')`, `popstate` 마다 `closeTop()` 이 true 면 다시 `pushState`; false 면 첫 번째는 토스트 + `pushState` + 2초 타이머, 타이머 안 두 번째는 `history.back()` 그대로 둠 → Step 4 통과 → Commit.

### Task B4: 출처 모아보기

**Files:**
- Modify: `web/src/ui/modalManager.js` (새 뷰 `credits`; `_help` 의 「소리의 출처」 절 삭제 후 맨 아래 「자료 출처」 링크; `_yebul` 의 출처 줄 삭제)
- Modify: `web/src/data/soundCredits.js` → `web/src/data/credits.js` 로 이름 바꾸고 분류형으로 (`{ sound: [...], scans: [], textures: [], patterns: [], generated: [] }`; 1단계에서는 sound 만 채움)
- [ ] Step 1 헤드리스 검사: 도움말·예불 목록에 `공공누리`·`자연의소리` 글자가 없을 것, 메뉴와 도움말의 「자료 출처」로 연 화면에 지금의 모든 소리 출처가 있을 것 → Step 2 실패 → Step 3 구현 → Step 4 통과 → 스크린샷 → Commit.

### Task B5: 묶음 B 배포 준비
- [ ] 여섯 뷰포트 스크린샷 묶음과 `hud.mjs`·`back.mjs` 결과를 사용자에게 보고, 확인받으면 `launch` 병합 → main 푸시.

---

## 묶음 C — 렌더·카메라 (브랜치 `launch/render-camera`)

### Task C1: 밤에도 윤곽이 보이는 달빛 + 은하수

**Files:**
- Modify: `web/src/world/templeScene.js` (`KEYS` 의 밤·새벽·해질녘 값, 하늘 셰이더의 별·은하수·달, 노출 하한)
- Test: `tools/qa/night.mjs` (헤드리스: 시각을 0시·2시·22시로 고정해 렌더 후 캔버스 픽셀을 읽어 측정)

**Interfaces:**
- Produces: `TempleScene#setTimeOfDay` 동작은 그대로; 새 상수 `NIGHT_EXPOSURE_FLOOR`(측정으로 정함).
- [ ] Step 1 `night.mjs`: 정해진 세 구도(숲길에서 일주문, 앞마당에서 석탑·대웅전, 대웅전 안)에서 (a) 화면 평균 휘도(sRGB 루마) ≥ 지금 낮 화면 평균의 18%, (b) 지붕선 주변 띠의 국소 대비(지붕 위 하늘 vs 지붕 아래 처마, 루마 차) ≥ 0.06, (c) 하늘 영역에서 밝기 0.6 이상 별 픽셀 수 ≥ 300 (1280×800 기준), (d) 은하수 띠 영역 평균이 주변 하늘보다 밝음 — 수치를 출력.
- [ ] Step 2 지금 값으로 실행해 기준선 기록(실패 예상) → Step 3 조정: 밤 `li`(달빛)·`hi`(하늘빛)·`exp` 상향, `hemiS` 를 푸른 은빛으로, 별 밀도(step 문턱 낮추기)·크기, 은하수 띠(하늘 방향 기준 대원 둘레의 노이즈 띠, 가장자리 먼지 띠), 달 원반 + 달무리. 연등·석등 점광원은 그대로 따뜻하게 → Step 4 기준 통과 + 세 구도 스크린샷을 사용자 판단용으로 남김 → Commit.

### Task C2: 쨍한 맑은 낮

**Files:** Modify: `web/src/world/templeScene.js` (`KEYS` 9시·13시·16.4시 하늘·안개·빛), 필요하면 색 보정(`finalPass` 셰이더에 채도·대비)
**Test:** `tools/qa/day.mjs` — 13시 세 구도에서 하늘 영역 평균 채도(HSV S) ≥ 0.35, 먼 산 대비 ≥ 지금 값, 화면 하이라이트 과포화(루마>0.98) ≤ 3%.
- [ ] Step 1 기준선 → Step 2 조정(하늘 파랑·햇빛 세기 상향, 회색 안개 밀도 하향) → Step 3 통과 + 전후 스크린샷 → Commit. (HDRI 는 2단계 에셋 스파이크에서.)

### Task C3: 장소 전환 디졸브

**Files:**
- Create: `web/src/ui/veil.js` (`veil(fn: () => void, { hold?: number }): Promise<void>` — 예불 듣기의 `_veil` 을 옮겨 공용화, `#listen-veil` 요소 재사용)
- Modify: `web/src/main.js` (예불 듣기의 `_veil` 호출을 `veil()` 로; 장소 이동 버튼·산문 통과·법당 문턱 통과 때 `veil()` + 도착 구도)
- Modify: `web/src/world/templeScene.js` (`snapCameraTo(yaw, pitch, dist)` — 가림막 뒤에서 카메라를 바로 놓기)
**Interfaces:** Produces `veil()`, `TempleScene#snapCameraTo(yaw: number, pitch: number, dist: number): void`.
- [ ] Step 1 헤드리스: 장소 이동 버튼 4개 각각 → 가림막 불투명 프레임 1회 이상, 도착 후 0.6초 안에 카메라가 도착 구도(±0.05 rad) → Step 2 실패 → Step 3 구현 → Step 4 통과 → 예불 듣기 진입·나오기 회귀 확인 → Commit.

### Task C4: 카메라 가림 해결 + 실내 카메라

**Files:** Modify: `web/src/world/templeScene.js` (`_updateCamera`: 처마·지붕·담·벽 메쉬로 광선 검사, 가리는 물체 디더 투명, 실내 규칙)
**Interfaces:** Produces `TempleScene#occluders: THREE.Object3D[]` (temple 빌드 후 등록 — 지붕 재질 `roofTop/roofUnder/roofEdge`, 담, 벽 메쉬).
- [ ] Step 1 `tools/qa/occlusion.mjs`: 정해진 경로(숲길 → 일주문 통과 → 마당 → 대웅전 계단·문턱 → 법당 안 → 다실 가는 담 사이 길 → 다실) 를 자동으로 걸으며 0.1초마다 카메라→캐릭터 머리 광선이 occluders 에 막히는 비율 측정. 기준: 막힘 ≤ 5%, 카메라가 지붕·벽 안에 있는 프레임 0.
- [ ] Step 2 지금 값 기준선(실패 예상) → Step 3 구현: 막히면 카메라를 막힌 지점 앞 0.3m 로 당기되 최소 1.2m; 처마·담 윗부분처럼 얇은 가림은 당기지 않고 디더 투명(셰이더 `onBeforeCompile`, 화면 공간 4×4 Bayer, 가림 정도에 따라). 법당 안·다실 통로는 낮은 높이·짧은 거리 규칙. 1인칭은 건드리지 않음 → Step 4 기준 통과 + 경로 스크린샷 → Commit.

### Task C5: 묶음 C 배포 준비
- [ ] `night.mjs`·`day.mjs`·`occlusion.mjs` 수치와 스크린샷을 사용자에게 보고, 확인받으면 `launch` 병합 → main 푸시.

---

## 2·3단계 개요 (1단계가 합쳐진 뒤 각각 별도 계획서로)

- **D 차담 재설계**: 대사 장면(HUD 거둠·고정 구도·대사 상자·초상), Web Speech 음성 + Typecast 고정 대사, 예상 응답 3 + 직접 말하기(`visualViewport`), `/api/monk`(`claude-haiku-5-5`, 구조화 출력 `{reply, suggestions[3], verse?}`, 캐시한 페르소나, 하루 무료 한도, 109 안내, A1 거름), 「차담 스님은 AI 입니다」, 오프라인 대화 나무. 묶음 A·B 뒤.
- **E 공덕 도감·오늘의 수행**: 24종, 조건·연출·착용·동기화, A3 저장 구조 위에. 아이템 그림 생성형.
- **F 에셋 스파이크**: 아트 바이블 1장, 국가유산 스캔 받는 경로 확인, 삼층석탑 스캔 → Blender 헤드리스 줄이기·굽기 → GLB(Meshopt+KTX2), 법당 한 칸 + 낮·밤 라이트맵, CC0 맑은 하늘·밤하늘 HDRI, 생성 질감 2~3종 → 비교 스크린샷·용량·fps 보고.
- **G 세계 전환**: 대웅전 5×3칸 실사화, 배경 전체, 순환 숲길(쉼터·앉기), 돌탑 어디서나(서버 `cairn_id,x,z`). F 결과 승인 뒤.
