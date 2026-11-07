/**
 * 사운드템플 — 앱 진입점. (서비스 이름은 사운드템플, 그 안의 산사는 청연산사 — 산문 현판 「清蓮山寺」)
 * 입장 화면 → 월드 생성 → HUD·입력·신행 활동 연결 → 메인 루프.
 */
import * as THREE from 'three';
import { ZONES, RITUALS, generateDharmaName } from './data/templeData.js';
import { TempleStore, kstHour, uuid } from './core/state.js';
import { readLastPosition, writeLastPosition } from './core/lastPosition.js';
import { TempleSoundEngine } from './audio/soundEngine.js';
import { TempleScene } from './world/templeScene.js';
import { AvatarManager } from './world/avatarManager.js';
import { loadRig } from './world/avatarRig.js';
import { createIntroBackground } from './ui/introBackground.js';
import { wireState } from './core/avatarMotion.js';
import { L, COURTS, isWalkable, zoneAt, streamZ, walkHeight, canBuildCairn, pathX, resolveCollisions } from './world/layout.js';
import { createPathfinder, pathLength } from './world/pathfind.js';
import { SKY_TOTAL, BURN } from './world/burnPaper.js';
import { createMiniMap } from './ui/miniMap.js';
import { scrollFade } from './ui/scrollFade.js';
import { trail, loop, J1, REST_SIT_MSG, REST_GROUND_MSG, REST_SPOTS } from './world/trail.js';
import { restSlots, restGroundSlot } from './world/trailProps.js';
import { placeStone, findJoinable, areaCount, AREA_CAP, AREA_RADIUS, GATE_ID } from './core/cairns.js';
import { ModalManager } from './ui/modalManager.js';
import { LiveLink, sharedApi } from './core/live.js';
import { YEBUL_TRACKS } from './data/credits.js';
import { NATURE_PRESETS, SLEEP_MINUTES, SCENE_MINUTES, LISTEN_MODES, MIX_ADD, MY_MIX_CAP, MIX_SOUNDS } from './data/natureSounds.js';
import { ASMR_TRACKS } from './data/asmr.js';
// 테마 ASMR 을 듣는 동안 엔진의 자연의 소리는 모두 쉰다 (낮·맑음 — 밤새·천둥도 나지 않게)
const ASMR_QUIET = { id: 'asmr', time: 'day', weather: 'clear', mix: {} };
import { bindNameForm } from './ui/nameField.js';
import { veil } from './ui/veil.js';
import { DOCK_RITUALS } from './data/templeData.js';
import { icon, ZONE_ICONS } from './ui/icons.js';
import { toggleSheet, openSheet, closeTop, closeAll } from './ui/sheets.js';
import { installBackGuard } from './ui/backGuard.js';
import { createFastWalk } from './ui/fastWalk.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const PERF = new URLSearchParams(location.search).has('perf'); // ?perf=1: 성능 표 (_perfHud)

function detectQuality() {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low' || q === 'high') return q;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const weak = (navigator.deviceMemory && navigator.deviceMemory < 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  return (coarse && small) || weak ? 'low' : 'high';
}

// 장소 이동: 가림막(디졸브) 없이 바로 옮긴다 — 맵이 한 공간이라 디졸브는 어색하기만 했다 (사용자 2026-11-06 「제거해라」)
const ARRIVAL = { pitch: 0.22, dist: 9 }; // 도착 구도: 입장 때와 같은 높이·거리, 방위는 도착해서 바라보는 쪽의 뒤 (법당 안은 실내 규칙이 줄인다)
const MALA_MIN_MS = 3000; // 염주 한 알 사이 최소 간격 3초 — 광클릭으로 세지 않게 (사용자 결정 2026-11-06, 한 알에 한 숨)
const FP_TURN = 2.0; // 1인칭 A/D·조이스틱 좌우로 도는 빠르기(rad/s)
// 자동 걷기 (모바일): 조이스틱을 앞으로 끝까지 밀어 AUTO_HOLD 초 버티면 손을 떼도 앞으로 걷는다.
// 걷는 중 조이스틱을 좌우로 밀면 AUTO_TURN rad/s 로 방향만 돌고, 아래로 당기거나 한 번 톡 누르면 멈춘다.
const AUTO_HOLD = 0.6, AUTO_TURN = 1.2;
// 눌렀다 끌어서 걷기: 바닥을 HOLD_WALK_MS 동안 누르고 있으면 손가락 밑으로 걸어간다 (빨리 끌면 지금처럼 카메라가 돈다)
const HOLD_WALK_MS = 300;
const REPLY_DELAY_MS = 600; // 도반의 합장을 받고 돌아서 답례하기까지 (바로 하면 기계 같다)
// 1인칭 탑돌이: 걷는 방향에서 탑 쪽(오른쪽)으로 57° — 실측: 1000×640 은 탑 중심이 화면 x≈0.8, 375×812 는 탑 기단이 오른쪽 1/3 에 들고 왼쪽엔 앞길
const FP_CIRCLE_LOOK = -1.0;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const LISTEN_SHOT_SEC = 40; // 예불 듣기: 한 장면을 이만큼 천천히 흘린 뒤 다음 장면으로 끊는다
const MAT_SLOPE = 16; // 휴식 돗자리를 펼 수 있는 기울기(°) — 산책로 돗자리 자리 실측 중앙 6°·최대 14.7°, 길 옆 숲 최대 15.1° (tools/qa/mixer.mjs 가 다시 잰다)
const MODE_LABEL = { one: '한 곡', all: '연속', repeat: '반복' }; // 듣기 방식 (data/natureSounds.js LISTEN_MODES)
const fmtTime = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–:––');

const UNLOCK_MSG = {
  wooden_mala: '📿 손목에 붉은 자단목 단주가 채워졌습니다.',
  hand_lantern: '🏮 밤길을 밝혀 줄 작은 손연등이 곁에 머뭅니다.',
  jade_mala: '🤍 이레 동안의 발걸음 — 백옥 단주가 채워졌습니다.'
};

class MetaTempleApp {
  constructor() {
    this.store = new TempleStore();
    this.sound = new TempleSoundEngine();
    const v = this.store.state.settings.volumes;
    Object.entries(v).forEach(([ch, val]) => this.sound.setChannelVolume(ch, val));
    this.quality = detectQuality();
    this.keys = {};
    this.joy = { x: 0, z: 0 };
    this.zone = null;
    this.entered = false;
    // 대문에서는 장면을 미리 준비하되 3D 렌더 루프는 입장할 때 시작한다.
    this._loopRunning = false;
    this._loopRequest = null;
    this.clock = new THREE.Clock();
    this.introBackground = createIntroBackground();
    this._initIntro();
    addEventListener('pagehide', () => this._rememberPosition());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this._rememberPosition(); });
    this._bootPromise = this._boot().then(() => true, (error) => {
      console.error(error);
      $('#intro-loading').classList.remove('done');
      $('#intro-loading-text').textContent = '산사를 준비하지 못했습니다. 새로고침해 주세요.';
      return false;
    });
  }

  /* ───────── 입장 ───────── */
  _initIntro() {
    const p = this.store.profile;
    $('#intro-dharma-name').textContent = p.dharmaName;
    const att = p.attendance;
    if (this.store.isReturning && att.lastDate) {
      $('#intro-streak').textContent = `다시 오셨군요 · 누적 ${att.totalDays}일 · 절 ${p.stats.bowCount}배 · 연등 ${p.stats.lanternCount}등`;
    }
    const pick = (style) => $$('.avatar-card').forEach((c) => c.setAttribute('aria-checked', String(c.dataset.avatar === style)));
    pick(p.avatarStyle);
    $$('.avatar-card').forEach((c) =>
      c.addEventListener('click', () => {
        this.store.setAvatarStyle(c.dataset.avatar);
        pick(c.dataset.avatar);
        if (this.avatars) this._rebuildPlayer();
      })
    );
    $('#intro-rename').addEventListener('click', () => this._setName(generateDharmaName(this.store.profile.dharmaName), false));
    const form = $('#intro-name-form');
    const field = bindNameForm(form, (text) => {
      const r = this._setName(text, true);
      if (r.ok) {
        form.classList.add('hidden');
        $('#intro-custom').setAttribute('aria-expanded', 'false');
        field.reset();
      }
      return r;
    });
    $('#intro-custom').addEventListener('click', () => {
      const open = form.classList.toggle('hidden') === false;
      $('#intro-custom').setAttribute('aria-expanded', String(open));
      if (open) field.input.focus();
    });
    $('#intro-enter').addEventListener('click', () => this._requestEntry());
    $('#intro-enter').disabled = false;
    // 대문은 글을 덜어 낸다: 법명·모습은 칩 하나로 접어 두고, 누르면 고르는 칸이 열린다
    const panel = $('#intro-who-panel');
    const syncWho = () => {
      $('#intro-who-name').textContent = $('#intro-dharma-name').textContent;
      $('#intro-who-av').textContent = $('.avatar-card[aria-checked="true"] b')?.textContent || '';
    };
    syncWho();
    new MutationObserver(syncWho).observe(panel, { subtree: true, childList: true, characterData: true, attributeFilter: ['aria-checked'] });
    $('#intro-who').addEventListener('click', (e) => {
      panel.hidden = !panel.hidden;
      e.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
    });
  }

  /** 법명 바꾸기 (custom = 직접 지은 이름 → 거름 통과 필요). 화면·내 아바타·실시간 동석에 함께 반영 */
  _setName(name, custom) {
    const r = this.store.setDharmaName(name, { custom });
    if (!r.ok) return r;
    $('#intro-dharma-name').textContent = r.text;
    this.avatars?.player.setName(r.text);
    this.live?.setIdentity(r.text, this.store.profile.avatarStyle);
    if (this.entered) this._updateHUD();
    return r;
  }

  async _boot() {
    const container = $('#scene');
    const rigWanted = new URLSearchParams(location.search).get('rig') !== '0';
    try {
      this.world = new TempleScene(container, {
        quality: this.quality,
        onProgress: (p, label) => {
          $('#intro-progress').style.width = `${Math.round(p * 100)}%`;
          $('#intro-loading-text').textContent = label;
          if (this._entryTransition) $('#intro-enter-label').textContent = label;
        }
      });
      // 현판·기와 글씨는 캔버스에 한 번 그려 캐시하므로, 서체(한자 부분 집합 포함)를 먼저 받아 둔다
      $('#intro-loading-text').textContent = '현판 글씨를 쓰는 중…';
      await Promise.race([
        Promise.all([
          document.fonts.load('900 64px "Noto Serif KR"', '清蓮山寺大雄殿尋劍堂梵鐘閣'),
          document.fonts.load('26px "Nanum Brush Script"', '가족건강발원평안')
        ]),
        new Promise((r) => setTimeout(r, 2500))
      ]).catch(() => {});
      await this.world.build();
    } catch (e) {
      throw e;
    }
    const temple = this.world.temple;
    this.temple = temple;
    temple.paperBurn.warm(this.world.renderer, this.world.camera, this.world.scene, this.world.composer?.readBuffer); // 첫 소각에서 셰이더를 만드느라 멈칫하지 않게
    this.avatars = new AvatarManager(this.world.scene, temple, {
      onStep: (surface) => this.sound.playFootstep(surface),
      onRustle: (strength, len) => this.sound.playRobeRustle(strength, len), // 큰절·앉고 일어설 때 도복 스치는 소리
      onBowReply: (av) => {
        this.world.ripples.spawn(av.root.position, { color: '#f2c46d', maxR: 2.2, life: 1.8 });
        this.sound.playBlessing();
        this.toast(`『${av.name}』 도반이 합장으로 답례합니다`);
      },
      onCircleLoop: (n) => {
        this.store.addStat('circumambulationLoops');
        this._updateHUD();
        this.sound.playWindChime(0.8);
        this.toast(`🔄 석탑을 ${n}바퀴 돌았습니다 · 누적 ${this.store.stats.circumambulationLoops}바퀴`);
      },
      onStandUp: () => {
        this.world.setFocusVignette(false);
        this.temple?.trail.hideMat(); // 돗자리는 일어서면 걷는다
      }
    });
    this.avatars.camera = this.world.camera; // 시야 밖 사람은 그리지도 몸을 계산하지도 않는다 (avatarManager _crowdLod)
    this._rebuildPlayer();
    this.avatars.spawnAmbientVisitors();
    // 블렌더 아바타(GLB 2개)는 산사를 다 지은 뒤에 받기 시작한다 — 느린 망에서 입장을 늦추지 않게(같이 받으면 Fast 3G 에서 입장이 수 초 늦었다).
    // 받기 전·못 받으면 절차식 몸, 받는 대로 제자리에서 바꾼다 (?rig=0 이면 받지 않음)
    if (rigWanted) loadRig().then((ok) => ok && this.avatars.upgradeRigs());
    temple.lanterns.sync(this.store.state.lanterns);
    await this._brushFont(this.store.state.tiles.map((t) => t.wish).join(''));
    temple.tileRack.sync(this.store.state.tiles);
    temple.cairn.sync(this.store.gateStoneTotal);
    temple.cairns.setCairns(this.store.cairnList());

    const s = this.store.state.settings;
    this.world.setTimeOfDay(s.time || 'realtime');
    this.world.hour = this.world.hourTarget;
    this.world.setWeather(s.weather || 'clear');
    this.world.applyEnv(true);

    this.modals = new ModalManager(this.store, this._withMotions(this._modalCallbacks()), this.sound);
    this._bindHUD();
    this._bindInput();
    this._bindListen();
    this._syncChips();
    this._updateHUD();
    $('#intro-loading').classList.add('done');
    // 장면과 리소스는 준비하지만, 입장하기 전까지는 그리지 않는다.
    this.world.cam.yaw = 0;
    this.world.cam.pitch = 0.22;
    this.world.cam.targetDist = this.world.cam.dist = 9;
    setInterval(() => this._checkYebul(), 20000);
    this._pullShared();
    setInterval(() => this._pullShared(), 180000);
  }

  /** 붓글씨 서체는 글자 구간별로 내려받으므로, 캔버스에 쓰기 전에 그 글자들을 받아 둔다 */
  _brushFont(text) {
    return Promise.race([document.fonts.load('26px "Nanum Brush Script"', text || '가'), new Promise((r) => setTimeout(r, 2000))]).catch(() => {});
  }

  /** 다른 도반이 공개한 연등·기와·돌탑(최근 일부)을 받아 경내에 섞는다 */
  async _pullShared() {
    const d = await sharedApi.recent();
    if (d.error) return;
    this.store.mergeShared(d);
    this.temple.lanterns.sync(this.store.state.lanterns);
    this.temple.cairn.sync(Math.min(this.store.gateStoneTotal, 40));
    this.temple.cairns.setCairns(this.store.cairnList());
    await this._brushFont(this.store.state.tiles.map((t) => t.wish).join(''));
    this.temple.tileRack.sync(this.store.state.tiles);
    this.modals?.refresh();
  }

  /** 공개를 고른 서원을 서버에 올린다. 거절되면(링크·욕설·하루 한도) 이 브라우저에만 남긴다 */
  _publish(kind, item, label) {
    sharedApi.publish(kind, item, this.store.profileId).then((r) => {
      if (!r.error) {
        // 서버가 1.5m 안의 다른 탑에 합쳤으면 그 탑으로 고쳐 둔다
        if (kind === 'stones' && r.cairnId && r.cairnId !== item.cairnId) {
          Object.assign(item, { cairnId: r.cairnId, x: r.x, z: r.z });
          this.store.save();
          this.temple.cairns.setCairns(this.store.cairnList());
        }
        return;
      }
      item.public = false;
      this.store.save();
      if (r.error !== 'offline' && r.error !== 'timeout') this.toast(`${label}은 나만 보도록 두었습니다 · ${r.error}`);
    });
  }

  _rebuildPlayer() {
    const p = this.store.profile;
    const items = Object.fromEntries(['wooden_mala', 'jade_mala', 'hand_lantern'].map((k) => [k, this.store.has(k)]));
    const last = !this.avatars.player && readLastPosition();
    const safe = last && isWalkable(last.x, last.z) ? resolveCollisions(last.x, last.z) : null;
    const pos = safe && isWalkable(safe.x, safe.z) ? safe : L.spawn;
    this.player = this.avatars.initPlayer(p.avatarStyle, p.dharmaName, items, pos, safe && pos === safe ? last.heading : Math.PI);
    this.player.restState = null;
  }

  _rememberPosition() {
    if (!this.entered || !this.player) return;
    const p = this.player.root.position;
    const spot = isWalkable(p.x, p.z) ? p : this.player.returnPos;
    if (spot && isWalkable(spot.x, spot.z)) {
      const pos = { x: +spot.x.toFixed(2), z: +spot.z.toFixed(2), heading: +this.player.heading.toFixed(2) };
      const key = JSON.stringify(pos);
      if (key !== this._savedPositionKey && writeLastPosition(pos)) this._savedPositionKey = key;
    }
  }

  async _requestEntry() {
    if (this.entered || this._entryTransition) return;
    this._entryTransition = true;
    const request = this._entryRequest = (this._entryRequest || 0) + 1;
    const button = $('#intro-enter');
    button.disabled = true;
    button.classList.add('is-entering');
    button.setAttribute('aria-busy', 'true');
    $('#intro-enter-label').textContent = '산문을 열고 있습니다…';
    this.introBackground.pauseSound();
    // history 항목은 실제 사용자 누름 안에서 쌓아야 모바일 뒤로가기가 건너뛰지 않는다.
    if (this.backGuard) this.backGuard.enter();
    else this.backGuard = installBackGuard({
      closeTop: () => this.entered && this._closeTop(),
      toast: (m) => this.toast(m),
      onExit: () => this.entered ? this._toIntro() : this._cancelEntry()
    });
    try {
      if (!this._hasEntered) this.sound.setBackground(this.store.state.settings.bgAudio !== false);
      this.sound.prepareForEntry(); // 입장 준비가 길어져도 최초 누름의 오디오 권한을 보존한다.
    } catch (error) { console.warn('[soundEngine] 오디오 준비 실패', error); }
    // 입장 초기화와 첫 렌더가 메인 스레드를 점유하기 전에 버튼 상태를 먼저 그린다.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const ready = await this._bootPromise;
    if (request !== this._entryRequest) return;
    if (!ready) return this._entryFailed();
    $('#intro-enter-label').textContent = '산문으로 들어가는 중…';
    try { this._enter(); } catch (error) { this._entryFailed(error); }
  }

  _entryFailed(error) {
    if (error) console.error(error);
    this._stopLoop();
    this.entered = false;
    this._entryTransition = false;
    this.backGuard?.cancel();
    this.sound.cancelPreparedEntry();
    if (this.sound.isEnabled) this.sound.toggleAudio();
    this.introBackground.resumeSound();
    $('#hud').classList.add('hidden');
    $('#quick-tools').classList.add('hidden');
    const button = $('#intro-enter');
    button.classList.remove('is-entering');
    button.removeAttribute('aria-busy');
    button.disabled = true;
    $('#intro-enter-label').textContent = '입장할 수 없습니다';
    $('#intro-loading').classList.remove('done');
    $('#intro-loading-text').textContent = '산사를 열지 못했습니다. 새로고침해 주세요.';
  }

  _cancelEntry() {
    this._entryRequest++;
    this._entryTransition = false;
    this.sound.cancelPreparedEntry();
    this.introBackground.resumeSound();
    const button = $('#intro-enter');
    button.disabled = false;
    button.classList.remove('is-entering');
    button.removeAttribute('aria-busy');
    $('#intro-enter-label').textContent = '산문에 들어서기';
  }

  _finishEntry() {
    if (!this._entryTransition || !this.entered) return;
    this._entryTransition = false;
    this.introBackground.leave();
    $('#intro').classList.add('leaving');
    this._introTimer = setTimeout(() => {
      $('#intro').classList.add('hidden');
      const button = $('#intro-enter');
      button.disabled = false;
      button.classList.remove('is-entering');
      button.removeAttribute('aria-busy');
      $('#intro-enter-label').textContent = '산문에 들어서기';
    }, 1500);
  }

  _enter() {
    if (this.entered) return;
    this.entered = true;
    $('#hud').classList.remove('hidden');
    $('#quick-tools').classList.remove('hidden');
    this._startLoop();
    this.zone = null;
    this.enteredAt = performance.now();
    if (this._hasEntered) return this._reenter();
    this._hasEntered = true;
    this.sound.setBackground(this.store.state.settings.bgAudio !== false); // 「화면 꺼져도 계속 듣기」 (기본 켬)
    // 화면이 꺼져 그리기가 멈춰도 연속·반복 듣기는 다음(같은) 예불로 (켜져 있으면 _listenTick 이 잠깐 머문 뒤 넘긴다)
    this.sound.onTrackEnd = () => {
      const ls = this._listening;
      if (ls && !ls.leaving && ls.mode !== 'one' && document.hidden) this._listenEnded();
    };
    // 자연의 소리 장면 한 편이 끝남 — 엔진의 워커 시계라 화면이 꺼져 있어도 온다
    this.sound.onSceneEnd = () => this._listening?.nature && this._listenEnded();
    // 잠자기 타이머가 다 되면 소리가 잦아들어 멈춘다 → 일어난다 (소리는 멈춘 채로, 다시 화면을 켜면 이어진다)
    this.sound.onSleep = () => this._listening && this.exitListening({ keepPaused: true });
    this.sound.init();
    this.sound.setEmitters(this._emitters());
    this.sound.setAreas({ courts: COURTS, tea: L.teahouseTerrace, hall: L.hall, groves: [L.bamboo, L.bambooEast] }); // 소리가 자리를 따르게 (담 가림·대숲 자리)
    this.sound.loadRecordings('./assets/audio/'); // 실제 녹음 — 받는 동안은 합성음
    this.sound.setWeather(this.world.weatherName);
    this.sound.setTimeOfDay(this.world.phase);
    this._syncSoundButton();
    const { streak, isNewDay } = this.store.checkIn();
    this._applyItems();
    setTimeout(() => {
      this.toast(matchMedia('(pointer: coarse)').matches
        ? '산문에 들어섰습니다 · 조이스틱이나 바닥을 눌러 걸어 보세요 · 옆 단추로 빠르게'
        : '산문에 들어섰습니다 · WASD 또는 바닥을 눌러 걸어 보세요 · Shift 를 누르면 빠르게');
      if (isNewDay && streak > 1) setTimeout(() => this.toast(`🍃 ${streak}일째 이어진 발걸음입니다`), 2600);
      if (this.store.renamedFrom) {
        // 법명이 10자로 줄어든 뒤 처음 들어온 옛 방문자 (state.js shortenName)
        setTimeout(() => this.toast(`법명을 10자 안으로 줄였습니다 · 『${this.store.profile.dharmaName}』`), 1800);
        delete this.store.renamedFrom;
      }
    }, 900);
    this.live = new LiveLink({
      onPeers: (peers, count) => {
        this.avatars.syncRemotePeers(peers);
        this.avatars.setNpcBudget(Math.max(4, 11 - count)); // 실제 도반이 늘면 NPC 참배객을 줄인다
      },
      onPeerUpdates: (peers, ids, count) => {
        this.avatars.updateRemotePeers(peers, ids);
        this.avatars.setNpcBudget(Math.max(4, 11 - count));
      },
      onBow: (from) => this._onPeerBow(from),
      onBell: ({ name }) => {
        if (!this.entered) return;
        this.sound.playBell(1);
        this.world.ripples.spawn(new THREE.Vector3(L.bell.x, L.courtyard.y, L.bell.z), { color: '#e8c070', maxR: 22, life: 4.5 });
        this.toast(`🔔 ${name} 도반이 범종을 울렸습니다`, 'bell-toast-stack');
      }
    });
    this.live.start(this.store.profile.dharmaName, this.store.profile.avatarStyle);
  }

  /** 산문을 나섰다가 다시 들어설 때 — 방어와 소리만 되살린다 (실시간 연결·녹음·출석은 첫 입장 그대로) */
  _reenter() {
    if (this._soundBeforeIntro && !this.sound.isEnabled) this.sound.toggleAudio();
    this._syncSoundButton();
    setTimeout(() => this.toast('다시 산문에 들어섰습니다'), 900);
  }

  /** 뒤로가기로 산문을 나섬: 입장 전 첫 화면으로 돌아가며 마지막 자리를 기억한다 */
  _toIntro() {
    this._rememberPosition();
    this.entered = false;
    this._entryTransition = false;
    this._stopLoop();
    clearTimeout(this._introTimer);
    const button = $('#intro-enter');
    button.disabled = false;
    button.classList.remove('is-entering');
    button.removeAttribute('aria-busy');
    $('#intro-enter-label').textContent = '산문에 들어서기';
    closeAll();
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const last = readLastPosition();
    if (last && isWalkable(last.x, last.z)) this.avatars.teleport(last.x, last.z, last.heading);
    Object.assign(this.world.cam, { yaw: 0, pitch: 0.22, targetDist: 9, dist: 9 });
    this._soundBeforeIntro = this.sound.isEnabled;
    if (this._soundBeforeIntro) this.sound.toggleAudio(); // 첫 화면은 입장 전처럼 조용히
    this._syncSoundButton();
    $('#hud').classList.add('hidden');
    $('#quick-tools').classList.add('hidden');
    const intro = $('#intro');
    intro.classList.remove('hidden');
    void intro.offsetWidth; // display:none 에서 막 돌아왔으니 한 번 그린 뒤 페이드인
    intro.classList.remove('leaving');
    this.introBackground.show();
  }

  _emitters() {
    const stream = [];
    for (let x = -48; x <= 48; x += 4) stream.push({ x, y: -0.4, z: streamZ(x) }); // 보이는 물길 그대로 (terrain.js buildWater 와 같은 범위)
    const h = L.hall;
    const chimes = [
      { x: h.x0 - 2.5, y: 9, z: h.z1 + 2.5 },
      { x: h.x1 + 2.5, y: 9, z: h.z1 + 2.5 },
      { x: h.x0 - 2.5, y: 9, z: h.z0 - 2.5 },
      { x: h.x1 + 2.5, y: 9, z: h.z0 - 2.5 },
      { x: L.bell.x - 3.5, y: 5.5, z: L.bell.z - 3.5 },
      { x: L.bell.x + 3.5, y: 5.5, z: L.bell.z + 3.5 },
      { x: L.teahouse.x - 3.6, y: 4.6, z: L.teahouse.z - 5.6 }
    ];
    return {
      stream,
      chimes,
      chant: { x: 0, y: h.floorY + 1.4, z: L.altar.z + 2.2 },
      brazier: { x: L.brazier.x, y: 2, z: L.brazier.z },
      kettle: { x: L.teahouse.x - L.teahouse.halfW - 0.9, y: 2, z: L.teahouse.z + 0.75 },
      bamboo: { x: 34, y: 4, z: -12 },
      bell: { x: L.bell.x, y: 4, z: L.bell.z },
      pond: { x: L.pond.x, y: L.pond.waterY + 0.3, z: L.pond.z }
    };
  }

  /** 신행을 마치면 아바타도 그 몸짓을 한다 — 돌탑에 조약돌을 얹고, 기와에 쓰고, 연등을 띄운다 (다른 도반에게도 보인다) */
  _withMotions(cb) {
    const after = (name, fn) => (...a) => {
      const r = fn(...a);
      const pl = this.player;
      if (!pl.busy && !pl.sitting) {
        pl.restState = null;
        pl.play(name);
      }
      return r;
    };
    return { ...cb, onAddStone: after('offer_stone', cb.onAddStone), onAddTile: after('write_tile', cb.onAddTile), onAddLantern: after('hang_lantern', cb.onAddLantern) };
  }

  /* ───────── 신행 콜백 ───────── */
  _modalCallbacks() {
    return {
      onAddLantern: (wish, color, share = true) => {
        const res = this.store.addLantern(wish, color, share);
        if (share) this._publish('lanterns', res.lantern, '연등');
        this.temple.lanterns.sync(this.store.state.lanterns);
        const from = this.player.root.position.clone().add(new THREE.Vector3(0, 1.2, 0));
        this.temple.lanterns.launch(res.lantern.id, from);
        this.sound.playLanternRise();
        this._afterUnlock(res.unlocked);
        this._updateHUD();
        setTimeout(() => this.toast('🏮 마당 하늘에 나의 소원 연등이 밝혀졌습니다'), 800);
        return res;
      },
      onEmpathize: (id) => {
        const ok = this.store.empathize(id);
        if (ok) this.sound.playWindChime(0.7);
        const l = this.store.state.lanterns.find((x) => x.id === id);
        if (ok && l && (l.shared || l.public)) {
          sharedApi.empathize(id, this.store.profileId).then((r) => {
            if (r.empathy == null) return;
            l.empathy = r.empathy;
            this.store.save();
            this.modals.refresh();
          });
        }
        return ok;
      },
      onAddTile: (wish, share = true) => {
        const t = this.store.addTile(wish, share);
        if (share) this._publish('tiles', t, '기와');
        this._brushFont(wish).then(() => this.temple.tileRack.sync(this.store.state.tiles));
        this._updateHUD();
        this.toast('🀫 기와에 새긴 서원이 불사대에 봉안되었습니다');
        return t;
      },
      onAddStone: (wish, share = true) => {
        const place = this._stonePlace();
        const s = this.store.addStone(wish, share, place);
        if (share) this._publish('stones', s, '돌탑의 돌');
        const drop = () => this.sound.playStoneDrop();
        if (place) {
          const c = this.temple.cairns.addStone({ id: place.cairnId, x: place.x, z: place.z }, drop);
          this.toast(c.n === 1 ? '⛰️ 길가에 새 돌탑을 세웠습니다 · 첫 층' : `⛰️ 길가 돌탑에 돌을 얹었습니다 · ${c.n}층`);
        } else {
          this.temple.cairn.addStone(drop);
          this.toast(`⛰️ 돌탑에 조약돌 하나를 얹었습니다 · 지금까지 ${this.store.stoneTotal}개`);
        }
        this._updateHUD();
        return s;
      },
      stoneScope: () => this._stoneScope(),
      onStoneView: () => this._loadCairnStones(),
      myCairns: () => this._myCairns(),
      onWalkCairn: (id) => {
        this.modals.close();
        this._walkToCairn(id);
      },
      onBurnWorry: (paper) => {
        // 글은 받지 않는다 — 저장·전송하지 않음. 창이 그린 쪽지 그림(paper)만 화로로 날려 태우고 픽셀까지 지운다
        if (paper && this.entered) return this._burnPaper(paper);
        this.temple.flareBrazier();
        this.sound.playFireWhoosh();
        return false;
      },
      onBow: () => this._doProstration(true),
      onMala: () => {
        // 염주를 세는 곳은 여기 하나 (염주 창의 단추·스페이스·3 키). 너무 빠르면 세지 않고 false
        const now = performance.now();
        if (now - (this._malaAt || 0) < MALA_MIN_MS) return false;
        this._malaAt = now;
        const unlocked = this.store.addStat('malaCount');
        this.sound.playBeadClick();
        this._afterUnlock(unlocked);
        this._updateHUD();
        return true;
      },
      onSutraComplete: () => {
        const unlocked = this.store.addStat('sutraCopiedCount');
        this.sound.playBell(0.6);
        this._afterUnlock(unlocked);
        this._updateHUD();
      },
      onTeaLeave: () => this._leaveTea(),
      onTeaTurn: () => {
        this.store.addStat('teaChats');
        this.temple.teaSteam.userData.uniforms.uIntensity.value = 1;
      },
      onDharmaCard: (card) => {
        this.store.keepDharmaCard(card);
        this.sound.playChukbi();
      },
      onRename: () => this._setName(generateDharmaName(this.store.profile.dharmaName), false).text,
      onSetName: (text) => this._setName(text, true),
      onReport: (kind, id) => {
        this.store.hideReported(id);
        this.temple.lanterns.sync(this.store.state.lanterns);
        this.temple.tileRack.sync(this.store.state.tiles);
        this.temple.cairn.sync(Math.min(this.store.gateStoneTotal, 40));
        this.temple.cairns.setCairns(this.store.cairnList());
        sharedApi.report(kind, id, this.store.profileId).then((r) =>
          this.toast(r.error ? '신고를 보내지 못했습니다 · 내 화면에서는 가렸습니다' : '신고했습니다 · 이 글은 이제 내 화면에 보이지 않습니다')
        );
      },
      onExport: () => this.store.exportState(),
      onImport: (json) => this.store.importState(json),
      onYebul: (track) => (this._listening?.track === track ? this.modals.close() : this.listen(track)), // 듣는 중 다시 연 목록에서 지금 것을 누르면 닫기만
      onHereMix: () => this.listen(this._hereTrack()), // 자연의 소리 창 「내 소리」의 「이 자리 소리」
      onPracticeEnd: () => {
        if (this._listening) return this._listenBack(); // 듣는 중에 다시 연 목록을 닫음: 앉은 채 재생기로
        // 좌복·쉼터에서 하던 수행을 닫으면 그 자리에 그대로 앉아 있는다 (일어나려면 움직이면 된다)
        const pl = this.player;
        if (pl.seat?.kind === 'cushion' || pl.seat?.kind === 'rest') {
          pl.restState = 'sit';
          if (!pl.busy) pl.setState('sit');
        } else this.avatars.standUp();
        this.world.setFocusVignette(false);
      }
    };
  }

  /** 실제 도반의 합장: 내가 막 합장했으면 '답례', 아니면 '인사' */
  _onPeerBow({ id, name }) {
    if (this._listening) return; // 홀로 듣는 동안에는 알리지 않는다
    const r = this.avatars.remote.get(id);
    if (r) this.world.ripples.spawn(r.av.root.position, { color: '#f2c46d', maxR: 2.4, life: 1.8 });
    this.sound.playBlessing();
    const replied = performance.now() - (this._lastBowAt || 0) < 6000;
    if (replied) return this.toast(`『${name}』 도반이 합장으로 답례합니다`);
    // 먼저 인사받았다: 그 도반 쪽으로 돌아서 합장 반배로 답례한다 (서 있을 때 저절로).
    // 내 답례는 상대에게 '답례'로 가므로(상대가 막 합장했으니) 서로 끝없이 주고받지 않는다.
    this._bowFrom = { id, name, at: performance.now() };
    const pl = this.player;
    if (!pl.sitting && !pl.busy && !this._blockingModal()) {
      setTimeout(() => this._replyBow(), REPLY_DELAY_MS);
      this.toast(`『${name}』 도반이 합장으로 인사합니다 · 마주 보고 답례합니다`);
    } else this._showReply(name); // 앉아 있거나 다른 몸짓 중이면 단추 하나로
  }

  /** 지금 걸음을 막는 창이 열려 있나 (수행 창은 걸으며 닫히므로 막지 않는다) */
  _blockingModal() {
    return this.modals?.isOpen && !['practice_108', 'mala', 'tea_chat'].includes(this.modals.current);
  }

  /** 막 합장해 온 도반(6초 안)을 바라보고 합장 반배. 앉아 있으면 앉은 채 합장 인사만 보낸다 */
  _replyBow() {
    this._hideReply();
    const pl = this.player;
    const from = this._bowFrom && performance.now() - this._bowFrom.at < 6000 ? this._bowFrom : null;
    const r = from && this.avatars.remote.get(from.id);
    if (pl.sitting) {
      this.live?.bow();
      this._lastBowAt = performance.now();
      this.world.ripples.spawn(pl.root.position, { maxR: 2.4, life: 1.8 });
      return this.toast(from ? `앉은 채 『${from.name}』 도반께 합장으로 답례했습니다` : '앉은 채 합장했습니다');
    }
    if (r) {
      const p = pl.root.position, q = r.av.root.position;
      pl.heading = Math.atan2(q.x - p.x, q.z - p.z);
    }
    this._bowFrom = null;
    this.gesture('bow_half');
  }

  _showReply(name) {
    const b = $('#reply-btn');
    if (!b) return;
    $('#reply-text').textContent = `『${name}』께 합장 답례`;
    b.classList.remove('hidden');
    clearTimeout(this._replyHide);
    this._replyHide = setTimeout(() => this._hideReply(), 6000);
  }

  _hideReply() {
    clearTimeout(this._replyHide);
    $('#reply-btn')?.classList.add('hidden');
  }

  _afterUnlock(list = []) {
    if (!list.length) return;
    this._applyItems();
    list.forEach((k, i) => setTimeout(() => this.toast(UNLOCK_MSG[k]), 1600 + i * 2200));
    this.sound.playBlessing();
  }

  _applyItems() {
    const items = Object.fromEntries(['wooden_mala', 'jade_mala', 'hand_lantern'].map((k) => [k, this.store.has(k)]));
    this.player.setItems(items);
  }

  /** 큰절 한 번 (오체투지). fromPractice 면 좌복 위에서 서서 절하고 다시 선다 */
  _doProstration(fromPractice = false) {
    const pl = this.player;
    if (pl.busy) return false;
    if (fromPractice) pl.restState = 'idle';
    const dur = this.avatars.triggerAction('prostrate');
    if (pl.seat?.kind === 'cushion') pl.sitting = true; // 좌복 위에서 절하면 좌복을 떠나지 않는다
    const unlocked = this.store.addStat('bowCount');
    this._afterUnlock(unlocked);
    this._updateHUD();
    return dur;
  }

  /* ───────── 신행 실행 ───────── */
  _interactable(id) {
    return this.temple.interactables.find((i) => i.id === id);
  }

  /** 상호작용 지점까지 걸어간 뒤 실행 */
  _goAndDo(def, fn) {
    if (!def?.approach) return fn();
    const a = def.approach;
    const p = this.player.root.position;
    const near = Math.hypot(p.x - a.x, p.z - a.z) < 0.5;
    const sameZone = zoneAt(p.x, p.z) === def.zone;
    const run = () => {
      this.player.heading = a.ry;
      fn();
    };
    if (near) return run();
    // 다른 구역이거나 멀면(숲길은 산책로까지 450m) 가람 이동처럼 바로 옮긴다 — 곧장 걷다 막혀 엉뚱한 데서 열리지 않게
    if (!sameZone || Math.hypot(p.x - a.x, p.z - a.z) > 15) return this._teleport(a.x, a.z, a.ry, () => setTimeout(run, 250));
    this.avatars.moveTo(a.x, a.z, run);
  }

  activate(id, payload) {
    this.sound.init();
    if (id === 'stone_pagoda') this._stoneSpot = null; // 일주문 옆 돌탑
    const def = this._interactable(id);
    switch (id) {
      case 'stone_pagoda': {
        // 독의 「돌탑」: 선 자리에 쌓을 수 있으면 여기서, 아니면 일주문 옆 돌탑으로
        const here = this._cairnHere();
        if (here) return this._stoneHere(here.at);
        return this._goAndDo(def, () => this.modals.open(id));
      }
      case 'wish_tile':
      case 'burn_worry':
      case 'dharma_card':
        return this._goAndDo(def, () => this.modals.open(id));
      case 'wish_lantern':
        return this.modals.open('wish_lantern', payload);
      case 'bell_strike':
        return this._goAndDo(def, () => this._strikeBell());
      case 'circumambulate': {
        const circle = () => {
          this.avatars.triggerAction('circumambulate');
          this.toast('🙏 두 손을 모으고 석탑을 오른쪽으로 돕니다 · 움직이면 멈춥니다');
        };
        if (zoneAt(this.player.root.position.x, this.player.root.position.z) !== 'COURTYARD') return this._teleport(0, 1.5, Math.PI, circle);
        return circle();
      }
      case 'incense':
        return this._goAndDo(def, () => this._offerIncense());
      case 'mala':
        return this._practiceHere('mala');
      case 'practice_108': {
        const mode = payload?.mode || 'prostrate';
        if (payload?.cushion != null) return this._sitCushion(payload.cushion, () => this._practiceHere(mode));
        // 대웅전에서는 먼저 빈 좌복에 자리 잡고 불단 정면을 바라본다.
        if (mode !== 'mala' && zoneAt(this.player.root.position.x, this.player.root.position.z) === 'DAEUNGJEON') {
          const pl = this.player;
          if (pl.sitting && pl.seat?.kind === 'cushion') {
            pl.heading = pl.seat.ry;
            pl.root.rotation.y = pl.heading;
            return this._practiceHere(mode);
          }
          const c = this.avatars.freeCushionNear(pl.root.position.x, pl.root.position.z);
          return c ? this._sitCushion(c.index, () => this._practiceHere(mode)) : this.toast('빈 좌복이 없습니다');
        }
        return this._practiceHere(mode);
      }
      case 'sutra_copy':
        return this._goAndDo(def, () => {
          const s = this.temple.sutraSeat;
          this.avatars.sitAt({ ...s, standAt: { x: s.x, z: s.z + 1.0 } }, 'sutra'); // 서안 앞에서 붓으로 쓴다
          this.player.restState = null;
          this.modals.open('sutra_copy');
        });
      case 'tea_chat':
        return this._goAndDo(def, () => this._sitTea());
      case 'yebul':
        return this.modals.open('yebul');
      case 'nature':
        return this.modals.open('nature');
    }
  }

  /* ───────── 예불 듣기: 화면이 바뀌어 좌복에 홀로 앉아 처음부터 끝까지 ───────── */
  listen(track) {
    if (!track || this._listening?.leaving) return;
    const nature = !!track.mix; // 자연의 소리 장면 (data/natureSounds.js) · 나만의 소리
    const asmr = ASMR_TRACKS.includes(track); // 테마 ASMR 원음 (data/asmr.js)
    const kind = nature ? 'nature' : asmr ? 'asmr' : 'yebul';
    if (this._listening && (kind === 'yebul') !== (this._listening.kind === 'yebul')) return; // 예불과 자연의 소리는 일어난 뒤 바꾼다
    this.sound.init();
    if (!this.sound.isEnabled) {
      this.sound.toggleAudio();
      this._soundStarted = true;
      this._syncSoundButton();
    }
    // 소리는 누른 그 순간에 튼다 (iOS 는 사용자 동작 안에서만 재생을 허락한다). 화면은 가림막 뒤에서 바꾼다
    if (this._listening) {
      this.modals.close(); // 재생기에서 다시 연 목록
      if (kind !== this._listening.kind) this._listenSwitch(kind);
      this._listenPlay(track);
      return veil(() => this._listening && this._listenScene(), { hold: 380 });
    }
    // 산문 밖 쉼터에 앉아 있으면 그 자리에서 듣는다. 자연의 소리·테마 ASMR 은 어디서든 선 자리에 앉아 듣는다
    const p = this.player.root.position;
    const rest = (this.player.seat?.kind === 'rest' ? this.player.seat._ref : null) || (nature || asmr ? { x: p.x, z: p.z } : null);
    this.modals.close();
    const cam = this.world.cam;
    const ls = (this._listening = { track, rest, kind, nature, asmr, ...this._listenPrefs(kind, rest), saved: { mode: cam.mode, yaw: cam.yaw, pitch: cam.pitch, dist: cam.targetDist } });
    $('#listen').classList.toggle('nature', nature);
    this.sound.setSleep(ls.sleep);
    this.joy = { x: 0, z: 0 };
    this.keys = {};
    this._listenPlay(track);
    veil(() => {
      if (this._listening !== ls) return;
      if (rest) return this._listenOutdoor(ls);
      const c = this.avatars.freeCushionNear(0, L.hall.z1 - 6.4); // 셋째 줄 가운데(본존 정면): 불단과 삼존불이 한눈에 들어오는 자리
      const seat = this.avatars.cushionSeat(c);
      seat.kind = 'cushion';
      this.avatars.sitAt(seat, 'meditate');
      this.player.restState = 'meditate';
      ls.cushion = c;
      this.avatars.solo = true;
      this.world.setFocusVignette(true);
      document.body.classList.add('listening');
      $('#listen').classList.remove('hidden');
      this._listenScene();
    });
  }

  /** 듣기 방식·잠자기 타이머는 예불·자연의 소리·테마 ASMR 따로 기억한다. 고른 적이 없으면 예불은 쉼터에서 연속·법당에서 한 곡(타이머 없음),
   *  자연의 소리는 반복·30분, 테마 ASMR 은 연속(끝나면 다음 곡)·30분 */
  _listenPrefs(kind, rest) {
    const S = this.store.state.settings;
    const mode = S[`${kind}Mode`] ?? (kind === 'nature' ? 'repeat' : kind === 'asmr' || S.listenLoop === true || (S.listenLoop == null && rest) ? 'all' : 'one');
    return { mode, sleep: S[`${kind}Sleep`] ?? (kind === 'yebul' ? 0 : 30) };
  }

  /** 자연의 소리 창 안에서 장면 ↔ 테마 ASMR 을 앉은 채로 바꾼다 (듣기 방식·타이머는 그 종류 것으로) */
  _listenSwitch(kind) {
    const ls = this._listening;
    if (ls.nature) {
      // 장면을 거두고 하늘을 돌려놓는다 (원음은 낮·맑음 고요 위에서)
      this.sound.setSceneTimer(0);
      this.world.setTimeOfDay(ls.world.time);
      this.world.setWeather(ls.world.weather);
      ls.world = ls.draft = ls.place = null;
    } else this.sound.stopTrack(0.6);
    Object.assign(ls, { kind, nature: kind === 'nature', asmr: kind === 'asmr' }, this._listenPrefs(kind, ls.rest));
    $('#listen').classList.toggle('nature', ls.nature);
    this.sound.setSleep(ls.sleep);
  }

  _listenPlay(track) {
    const ls = this._listening;
    ls.track = track;
    ls.gone = 0;
    ls.draft = null; // 조절하던 것(담지 않은)은 다른 장면으로 넘어가면 사라진다
    ls.dirty = false;
    if (ls.nature) {
      // 녹음 한 곡이 아니라 장면: 엔진이 그 장면의 소리만 섞고, 하늘·날씨도 장면에 맞춘다
      ls.ready = true;
      this.sound.setPreset(track);
      const w = this.world;
      ls.world ||= { time: w.timeMode, weather: w.weatherName };
      ls.place ||= { time: this.sound.time, weather: this.sound.weather }; // 장면이 하늘을 바꾸기 전 이 자리의 시간대·날씨 (「이 자리 소리」가 쓴다)
      w.setTimeOfDay(track.time);
      w.setWeather(track.weather);
      this.sound.setSceneTimer(SCENE_MINUTES * 60); // 장면 한 편 — 한 곡·연속·반복이 이것으로 (data/natureSounds.js)
      this._listenLabel(track.title, track.note);
      this.sound.setNowPlaying(track.title, '소리사원 · 자연의 소리');
      this.sound.setTrackActions(() => this._listenStep(-1), () => this._listenStep(1));
      return this._listenSync();
    }
    if (ls.asmr) this.sound.setPreset(ASMR_QUIET);
    ls.ready = !!this.sound.playTrack('./assets/audio/' + track.file, ls.asmr ? 'nature' : 'temple');
    this._listenLabel(track.title, track.place);
    // 잠금화면·알림: 제목과 이전·다음 단추
    this.sound.setNowPlaying(track.title, ls.asmr ? `소리사원 테마 ASMR · ${track.place}` : `소리사원 예불 · ${track.place}`);
    this.sound.setTrackActions(() => this._listenStep(-1), () => this._listenStep(1));
    this._listenSync();
  }

  /** 재생기의 이름 단추(누르면 목록)·이전·다음 이름 */
  _listenLabel(name, sub) {
    const what = this._listening.nature ? '장면' : this._listening.asmr ? '곡' : '예불';
    $('#listen-name').textContent = name;
    $('#listen-sub').textContent = sub;
    $('#listen [data-l="list"]').setAttribute('aria-label', `${name} — 목록에서 다른 ${what} 고르기`);
    $('#listen [data-l="prev"]').setAttribute('aria-label', `이전 ${what}`);
    $('#listen [data-l="next"]').setAttribute('aria-label', `다음 ${what}`);
    $('#listen-seek').disabled = !!this._listening.nature; // 장면은 구간 이동이 없다 — 한 편 안의 위치만
    // 자연의 소리: 소리 단추가 「조절」 — 소리마다 크기를 맞추는 나만의 소리 창 (테마 ASMR·예불은 섞인 원음이라 크기만)
    const vb = $('#listen [data-l="vol"]');
    vb.querySelector('span').textContent = this._listening.nature ? '조절' : '소리';
    vb.setAttribute('aria-label', this._listening.nature ? '소리 조절 — 나만의 소리' : '소리 크기');
    vb.setAttribute('aria-haspopup', this._listening.nature ? 'dialog' : 'false');
  }

  /** 첫 장면으로 끊고 제목을 잠시 띄운다 */
  _listenScene() {
    const ls = this._listening;
    ls.shot = 0;
    ls.shotT = 0;
    this.world.setShot(this._listenShot(0), true);
    const tt = $('#listen-title');
    tt.querySelector('b').textContent = ls.track.title;
    tt.querySelector('small').textContent = ls.nature ? ls.track.note : `${ls.track.place} · ${ls.track.note}`;
    tt.classList.add('show');
    clearTimeout(this._titleT);
    this._titleT = setTimeout(() => tt.classList.remove('show'), 7000);
    $('#listen').classList.toggle('folded', !!this.store.state.settings.listenFold); // 접어 둔 사람은 접힌 채로
    this._listenWake();
  }

  exitListening({ keepPaused = false } = {}) {
    const ls = this._listening;
    if (!ls || ls.leaving) return;
    ls.leaving = true;
    if (['yebul', 'nature', 'mixer'].includes(this.modals.current)) this.modals.close(); // 다시 연 목록·조절 창이 떠 있으면 함께 거둔다
    this._listenVol(false);
    this.sound.stopTrack(1.2);
    this.sound.setTrackActions(null, null);
    this.sound.setSleep(0);
    this.sound.setSceneTimer(0);
    if (!keepPaused && this.sound._userPaused) this.sound.resumeAll();
    if (ls.asmr) this.sound.setPreset(null);
    if (ls.nature) {
      this.sound.setPreset(null);
      this.world.setTimeOfDay(ls.world.time);
      this.world.setWeather(ls.world.weather);
      $('#listen').classList.remove('nature');
    }
    this._nowPlayingZone();
    veil(() => {
      this._listening = null;
      this.avatars.solo = false;
      this.avatars.standUp();
      this.world.setShot(null);
      // 일어서면 불단을 바라보는 뒷모습에서 다시 시작 (쉼터면 듣기 전에 보던 구도로)
      Object.assign(this.world.cam, { mode: ls.saved.mode, yaw: ls.rest ? ls.saved.yaw : 0, pitch: ls.saved.pitch, targetDist: ls.saved.dist });
      document.body.classList.remove('listening', 'l-idle');
      $('#listen').classList.add('hidden');
      $('#listen').classList.remove('l-away');
      $('#listen-title').classList.remove('show');
      this.world.setFocusVignette(false);
      this._syncChips();
    });
  }

  /* ───────── 장소 전환: 가림막 뒤에서 옮기고 도착 구도로 ───────── */
  /** 가람 이동 (장소 버튼·장소 시트가 부른다) */
  travelTo(zoneId) {
    const z = ZONES[zoneId];
    if (!z) return;
    this.sound.init();
    return this._teleport(z.spawn.x, z.spawn.z, z.spawn.ry, () => this.toast(`📍 ${z.name}(으)로 발걸음을 옮겼습니다`));
  }

  /** 다른 구역으로 순간 이동: 바로 옮기고 그 자리에서 바라보는 쪽 뒤에 카메라를 놓는다 */
  _teleport(x, z, ry, then) {
    this.avatars.teleport(x, z, ry);
    this.world.snapCameraTo(ry - Math.PI, ARRIVAL.pitch, ARRIVAL.dist);
    this._onZoneChange(true);
    then?.();
    return Promise.resolve();
  }

  /** 장면들: 좌복(c) 기준. 세로 화면은 삼존불이 다 들어오지 않으니 더 가깝고 높게 잡는다 */
  _listenShot(i) {
    if (this._listening.rest) return null; // 산문 밖은 장면을 끊지 않고 1인칭으로 그 자리 경치를
    const c = this._listening.cushion, fy = L.hall.floorY, az = L.altar.z;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const tall = innerWidth / innerHeight < 0.85;
    const shots = tall
      ? [
          // 높은 뒤: 나는 오른쪽 아래, 본존불은 위 가운데 (내려다봐서 재생기 위로 올린다)
          { pos: V(c.x - 0.5, fy + 2.1, c.z + 3.6), to: V(c.x - 0.3, fy + 1.95, c.z + 3.0), look: V(0.45, fy + 0.7, az - 0.6), lookTo: V(0.4, fy + 0.8, az - 0.6) },
          // 오른쪽 뒤 비스듬히: 나는 왼쪽, 본존불은 오른쪽 (좁은 화면엔 옆모습과 불상이 같이 안 들어간다)
          { pos: V(c.x + 1.3, fy + 1.0, c.z + 2.2), to: V(c.x + 1.45, fy + 1.05, c.z + 2.1), look: V(c.x - 0.33, fy + 0.95, c.z - 1.45), lookTo: V(c.x - 0.3, fy + 1.0, c.z - 1.5) },
          // 불단 쪽에서 얼굴: 열린 문 너머 석탑이 머리 뒤로 (기둥은 비켜서)
          { pos: V(c.x - 0.1, fy + 1.15, c.z - 2.2), to: V(c.x + 0.05, fy + 1.07, c.z - 1.95), look: V(c.x, fy + 0.7, c.z), lookTo: V(c.x, fy + 0.72, c.z + 0.1) }
        ]
      : [
          // 왼쪽 뒤: 나는 오른쪽 1/3, 삼존불은 가운데 (재생기와 겹치지 않는 높이)
          { pos: V(c.x - 1.4, fy + 1.25, c.z + 3.6), to: V(c.x - 1.0, fy + 1.2, c.z + 2.9), look: V(0.9, fy + 1.55, az - 0.4), lookTo: V(0.75, fy + 1.65, az - 0.4) }, // 커진 본존(8.3m) 광배 끝까지
          // 오른쪽 옆모습: 불단 촛불이 뒤로
          { pos: V(c.x + 2.4, fy + 0.95, c.z + 0.8), to: V(c.x + 2.1, fy + 0.9, c.z + 0.2), look: V(c.x - 0.4, fy + 0.75, c.z - 0.6), lookTo: V(c.x - 0.5, fy + 0.8, c.z - 1.0) },
          // 불단 쪽에서 얼굴: 열린 법당 문 너머 마당 (기둥이 머리 뒤에 오지 않게 왼쪽으로)
          { pos: V(c.x - 1.3, fy + 1.1, c.z - 2.3), to: V(c.x - 1.0, fy + 1.02, c.z - 2.0), look: V(c.x + 0.1, fy + 0.72, c.z), lookTo: V(c.x + 0.05, fy + 0.74, c.z + 0.1) },
          // 높은 모서리: 법당 전체에 홀로
          { pos: V(L.hall.xs[1] - 1.2, fy + 3.9, L.hall.z1 - 0.8), to: V(L.hall.xs[1], fy + 3.8, L.hall.z1 - 1.0), look: V(0.5, fy + 0.9, az + 1.7), lookTo: V(0.6, fy + 1.0, az + 1.4) }
        ];
    const s = { ...shots[i % shots.length], dur: LISTEN_SHOT_SEC };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      delete s.to;
      delete s.lookTo;
    }
    return s;
  }

  _listenTick(dt) {
    const ls = this._listening;
    if (!ls.ready || ls.leaving || !(ls.cushion || ls.rest)) return;
    if (!ls.nature && !this.sound.currentTrack) {
      // 끝까지 들었다: 잠깐 고요히 머문 뒤 일어난다 (연속 듣기면 다음 예불로)
      if ((ls.gone += dt) > 2.5) this._listenEnded();
      return;
    }
    if (ls.rest) this._listenDrift(dt);
    ls.shotT += dt;
    if (ls.shotT > LISTEN_SHOT_SEC && !ls.rest && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      ls.shotT = 0;
      const n = ++ls.shot;
      veil(() => this._listening === ls && this.world.setShot(this._listenShot(n), true), { hold: 450 });
    }
    if ((ls.uiT = (ls.uiT || 0) + dt) > 0.25) {
      ls.uiT = 0;
      this._listenSync();
    }
  }

  /** 내가 멈춰 두었나 (잠금화면 멈춤 포함) */
  _listenPaused() {
    return this._listening?.nature ? !!this.sound._userPaused : !!this.sound._userPaused || !!this.sound.currentTrack?.el.paused;
  }

  _listenSync() {
    const ls = this._listening;
    if (!ls) return;
    const paused = this._listenPaused();
    $('#listen').classList.toggle('paused', paused);
    $$('#listen .l-main').forEach((b) => b.setAttribute('aria-label', paused ? '이어 듣기' : '일시정지')); // 재생기와 접은 알약
    // 진행: 예불은 곡 안의 위치, 자연의 소리는 장면 한 편(SCENE_MINUTES) 안의 위치
    let t, d;
    if (ls.nature) {
      d = SCENE_MINUTES * 60;
      t = d - (this.sound.sceneLeft ?? d);
    } else {
      const el = this.sound.currentTrack?.el;
      d = el && Number.isFinite(el.duration) ? el.duration : ls.track.sec;
      t = el ? el.currentTime : 0;
    }
    $('#listen-time').textContent = `${fmtTime(t)} / ${fmtTime(d)}`;
    const seek = $('#listen-seek');
    if (!ls.seeking) seek.value = Math.round((t / d) * 1000);
    seek.style.setProperty('--p', `${seek.value / 10}%`);
    $('#listen-line').style.width = `${(t / d) * 100}%`;
    // 듣기 방식
    const m = $('#listen [data-l="mode"]');
    m.dataset.mode = ls.mode;
    m.querySelector('span').textContent = MODE_LABEL[ls.mode];
    m.setAttribute('aria-label', `듣기 방식: ${MODE_LABEL[ls.mode]} (누르면 바뀜)`);
    // 잠자기 타이머: 남은 시간을 짧게
    const left = this.sound.sleepLeft;
    const sl = $('#listen [data-l="sleep"]');
    const short = left == null ? '타이머' : left >= 60 ? `${Math.ceil(left / 60)}분` : `${Math.ceil(left)}초`;
    sl.setAttribute('aria-pressed', String(left != null));
    sl.querySelector('span').textContent = short;
    sl.setAttribute('aria-label', left == null ? '잠자기 타이머 꺼짐 (누르면 15분)' : `잠자기 타이머 ${short} 남음 (누르면 바뀜)`);
  }

  /** 쉼터에서 듣기: 그 자리에 앉은 채 1인칭으로 경치를 본다 (다른 도반은 잠시 보이지 않는다) */
  _listenOutdoor(ls) {
    const cam = this.world.cam, pl = this.player, s = ls.rest;
    this.avatars.solo = true;
    // 선 자리에서 듣는 경우도 실제 앉은 상태여야 일어날 때 자세가 정리된다.
    if (!pl.sitting) this.avatars.triggerAction('meditate');
    pl.restState = 'meditate';
    pl.setState('meditate');
    document.body.classList.add('listening');
    $('#listen').classList.remove('hidden');
    cam.mode = 'first';
    this._fp = null; // 다음 프레임에 지금 yaw 로 1인칭 시선을 다시 잡는다
    const v = s.vista || null;
    cam.yaw = (v ? Math.atan2(v[0] - s.x, v[1] - s.z) : pl.heading) - Math.PI;
    cam.pitch = s.listenPitch ?? 0.05;
    ls.drift = 0;
    ls.t = 0;
    this._listenScene();
  }

  /** 쉼터 1인칭: 아주 천천히 좌우로 둘러본다 (70초에 한 번, ±10°). 끌어서 돌아본 만큼은 그대로 더해진다 */
  _listenDrift(dt) {
    const ls = this._listening;
    if (!this._fp || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ls.t += dt;
    const k = 0.18 * Math.sin((ls.t * Math.PI * 2) / 70);
    this._fp.off += k - ls.drift;
    ls.drift = k;
  }

  /** 듣기 방식 바꾸기: 한 곡 → 연속 → 반복 (예불·자연의 소리 따로 저장해 다음에도 그대로) */
  _listenMode() {
    const ls = this._listening;
    ls.mode = LISTEN_MODES[(LISTEN_MODES.indexOf(ls.mode) + 1) % LISTEN_MODES.length];
    this.store.setSetting(`${ls.kind}Mode`, ls.mode);
    const n = SCENE_MINUTES;
    const say = ls.nature
      ? { one: `이 장면을 ${n}분 들은 뒤 일어납니다`, all: `${n}분마다 다음 장면으로 넘어갑니다`, repeat: '이 장면을 계속 듣습니다' }
      : { one: '이 예불이 끝나면 일어납니다', all: '이 예불이 끝나면 다음 예불이 이어집니다', repeat: '이 예불을 처음부터 다시 듣습니다' };
    this._listenNote(`${MODE_LABEL[ls.mode]} 듣기`, say[ls.mode]);
  }

  /** 한 곡(장면 한 편)이 끝났다: 한 곡 = 일어나기, 연속 = 다음, 반복 = 처음부터 */
  _listenEnded() {
    const ls = this._listening;
    if (!ls || ls.leaving) return;
    if (ls.mode === 'one') return this.exitListening();
    if (ls.mode === 'all') return this._listenStep(1);
    if (ls.nature) return this.sound.setSceneTimer(SCENE_MINUTES * 60); // 장면은 소리가 끊기지 않으니 시계만 처음으로
    this._listenStep(0);
  }

  /** 듣는 동안은 알림이 숨으므로 제목 자리에 잠깐 띄운다 */
  _listenNote(title, sub) {
    const tt = $('#listen-title');
    tt.querySelector('b').textContent = title;
    tt.querySelector('small').textContent = sub;
    tt.classList.add('show');
    clearTimeout(this._titleT);
    this._titleT = setTimeout(() => tt.classList.remove('show'), 3000);
  }

  _listenToggle() {
    if (this.sound._userPaused) return this.sound.resumeAll(); // 잠금화면에서 멈춘 것 (예불도 함께 이어진다)
    if (this._listening?.nature) return this.sound.pauseAll();
    this.sound.toggleTrack(); // 내가 멈춘 것 — 전화·다른 소리의 양보와 구분된다
  }

  /** 잠자기 타이머 바꾸기: 끔 → 15 → 30 → 60분 (지금부터 다시 센다 · 예불·자연의 소리 따로 저장) */
  _listenSleep() {
    const ls = this._listening;
    ls.sleep = SLEEP_MINUTES[(SLEEP_MINUTES.indexOf(ls.sleep) + 1) % SLEEP_MINUTES.length];
    this.store.setSetting(`${ls.kind}Sleep`, ls.sleep);
    this.sound.setSleep(ls.sleep);
    this._listenNote(ls.sleep ? `${ls.sleep}분 뒤 잦아듦` : '잠자기 타이머 끔', ls.sleep ? '시간이 되면 소리가 천천히 줄어들며 멈춥니다' : '일어날 때까지 계속 듣습니다');
  }

  /** 잠금화면·알림의 제목: 지금 있는 곳의 소리 */
  _nowPlayingZone() {
    const z = ZONES[this.zone];
    if (z) this.sound.setNowPlaying(`${z.short}의 소리`, '소리사원 · 자연의 소리');
  }

  _listenSeek(by) {
    const el = this.sound.currentTrack?.el;
    if (el && Number.isFinite(el.duration)) el.currentTime = Math.max(0, Math.min(el.duration - 0.5, el.currentTime + by));
  }

  _listenStep(k) {
    const t = this._listening.track;
    const mine = this.store.state.settings.myMixes || [];
    const list = t.mine ? (mine.includes(t) ? mine : [t]) : this._listening.nature ? NATURE_PRESETS : this._listening.asmr ? ASMR_TRACKS : YEBUL_TRACKS;
    this.listen(list[(list.indexOf(this._listening.track) + k + list.length) % list.length]);
  }

  /** 듣는 동안의 키: Esc·이동 = 일어나기, Space = 멈춤/이어 듣기, ←→ = 10초 */
  _listenKey(e) {
    const c = e.code;
    if (c === 'Escape' && !$('#listen-vol').hidden) this._listenVol(false);
    else if (c === 'Escape' || ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown'].includes(c)) this.exitListening();
    else if (c === 'Space') this._listenToggle();
    else if (c === 'ArrowLeft' || c === 'ArrowRight') this._listenSeek(c === 'ArrowLeft' ? -10 : 10);
    else return this._listenWake();
    e.preventDefault();
    this._listenWake();
    this._listenSync();
  }

  /** 재생기는 손이 닿으면 나타나고, 3.5초 가만히 있으면 사라진다 (멈춤 중·손을 올린 동안·키보드로 고르는 동안은 그대로).
   *  누른 단추에 남는 포커스는 보지 않는다 — 폰에서 단추를 한 번 누르면 재생기가 다시는 숨지 않았다 */
  _listenWake() {
    const ui = $('#listen');
    ui.classList.remove('l-idle');
    document.body.classList.remove('l-idle');
    clearTimeout(this._idleT);
    this._idleT = setTimeout(() => {
      if (!this._listening) return;
      const ctl = ui.querySelector('.listen-ctl');
      const hover = matchMedia('(hover: hover)').matches && ctl.matches(':hover'); // 터치는 누른 자리에 :hover 가 남는다 — 마우스만 본다
      if (this._listenPaused() || !$('#listen-vol').hidden || hover || ctl.querySelector(':focus-visible')) return this._listenWake();
      ui.classList.add('l-idle');
      document.body.classList.add('l-idle');
    }, 3500);
  }

  /** 재생기 접기·펴기 — 접으면 재생/멈춤·펴기만 남은 작은 알약이 되고, 화면을 끌어 둘러봐도 다시 뜨지 않는다. 고른 값은 저장 */
  _listenFold(folded) {
    $('#listen').classList.toggle('folded', folded);
    this.store.setSetting('listenFold', folded);
    document.activeElement?.blur?.(); // 숨는 단추에 포커스가 남지 않게
  }

  /** 재생기에서 고르던 창(예불 목록·장면 목록)을 다시 연다 — 일어나지 않고 다른 것으로 바꾼다. 창이 떠 있는 동안 재생기는 비켜 선다 */
  _listenList() {
    const ls = this._listening;
    this._listenVol(false);
    if (ls.kind !== 'yebul') this.store.setSetting('natureTab', ls.asmr ? 'asmr' : ls.track.mine || ls.track.id === 'here' ? 'mine' : 'scenes');
    this.modals.open(ls.kind === 'yebul' ? 'yebul' : 'nature');
    $('#listen').classList.add('l-away');
    $$('#modal-body .yebul-item').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === ls.track.id)));
  }

  /** 「조절」: 지금 장면을 나만의 소리로 고치는 창. 창이 떠 있는 동안 재생기는 비켜 서고, 소리는 그대로 들으며 맞춘다 */
  _listenMixer() {
    this._listenVol(false);
    this._mixDraft();
    this.modals.open('mixer', { mix: this._mixApi() });
    $('#listen').classList.add('l-away');
  }

  /** 고치는 장면(초안): 처음 열 때 지금 장면을 나만의 소리로 굽는다 (바꾸기 전에는 듣던 그대로) — 장면 목록·내 소리 원본은 건드리지 않는다 */
  _mixDraft() {
    const ls = this._listening;
    if (!ls.draft) {
      const t = ls.track;
      ls.draft = t.free ? { ...t, mix: { ...t.mix } } : this.sound.bake(t);
      ls.dirty = false;
      this.sound.setPreset(ls.draft);
    }
    return ls.draft;
  }

  /** 조절 창이 쓰는 손잡이 (ui/modalManager.js _mixer) */
  _mixApi() {
    const ls = this._listening;
    const edit = (fn) => {
      if (this._listening !== ls) return;
      fn(this._mixDraft().mix);
      ls.dirty = true;
      this.sound.remix();
    };
    return {
      state: () => {
        const n = (this.store.state.settings.myMixes || []).length + 1;
        return { title: ls.track.title, mine: !!ls.track.mine, dirty: !!ls.dirty, mix: this._mixDraft().mix, vols: this.store.state.settings.volumes, cap: MY_MIX_CAP, suggest: `나만의 소리 ${n}` };
      },
      level: (k, v) => edit((m) => (m[k] = v)),
      add: (k) => edit((m) => (m[k] = Math.min(MIX_ADD, MIX_SOUNDS.find((x) => x.k === k)?.max ?? MIX_ADD))),
      remove: (k) => edit((m) => delete m[k]),
      volume: (ch, v) => this._setVolume(ch, v),
      save: (title, asNew) => this._mixSave(title, asNew)
    };
  }

  /** 내 소리로 담기: 그 자체로 들을 수 있는 장면(free)으로 저장한다 — 장면 이름에 기대지 않는다 (장면은 계속 손본다). 고쳐 담기면 같은 자리에 */
  _mixSave(title, asNew) {
    const ls = this._listening;
    if (!ls?.nature) return null;
    const d = this._mixDraft();
    const list = [...(this.store.state.settings.myMixes || [])];
    const i = !asNew && ls.track.mine ? list.findIndex((m) => m.id === ls.track.id) : -1;
    if (i < 0 && list.length >= MY_MIX_CAP) return null;
    const names = MIX_SOUNDS.filter((x) => x.k in d.mix).map((x) => x.name);
    const { id: _id, title: _t, note: _n, ...rest } = d;
    const rec = {
      ...rest,
      v: 1,
      mine: true,
      free: true,
      id: i >= 0 ? ls.track.id : `my-${Date.now().toString(36)}`,
      title: title || ls.track.title,
      note: names.length > 3 ? `${names.slice(0, 3).join('·')} 외 ${names.length - 3}가지` : names.join('·') || '고요',
      mix: { ...d.mix }
    };
    if (i >= 0) list[i] = rec;
    else list.unshift(rec);
    this.store.setSetting('myMixes', list);
    // 이제 그 내 소리를 듣고 있다 (소리는 같은 값이라 바뀌지 않는다)
    ls.track = rec;
    ls.draft = { ...rec, mix: { ...rec.mix } };
    ls.dirty = false;
    this.sound.setPreset(ls.draft);
    this._listenLabel(rec.title, rec.note);
    this.sound.setNowPlaying(rec.title, '소리사원 · 나만의 소리');
    return rec;
  }

  /** 「이 자리 소리」: 지금 선(앉은) 곳에서 들리는 자연음을 그대로 한 장면으로 — 하늘·날씨도 지금 그대로 */
  _hereTrack() {
    const seat = this.player.seat;
    const where = seat?.kind === 'rest' ? seat._ref.name : ZONES[this.zone]?.name || '이곳';
    return { id: 'here', title: '이 자리 소리', note: `${where} · 지금 들리는 그대로`, ...this.sound.here(this._listening?.place) }; // 장면을 듣는 중이면 장면 전의 하늘로
  }

  /** 다시 연 목록을 닫았다: 재생기로 돌아온다 */
  _listenBack() {
    $('#listen').classList.remove('l-away');
    this._listenWake();
  }

  /** 소리 크기 판 열고 닫기 (값은 소리 창과 같은 것) */
  _listenVol(open) {
    const p = $('#listen-vol');
    if (open) $$('#listen-vol [data-vol]').forEach((i) => (i.value = this.store.state.settings.volumes[i.dataset.vol]));
    p.hidden = !open;
    $('#listen [data-l="vol"]').setAttribute('aria-expanded', String(!!open));
  }

  /** 채널 크기: 소리 창·재생기 슬라이더가 함께 쓴다 (엔진·저장·다른 쪽 슬라이더까지) */
  _setVolume(ch, v) {
    this.sound.setChannelVolume(ch, v);
    this.store.setSetting('volumes', { ...this.store.state.settings.volumes, [ch]: v });
    $$(`#vol-${ch}, #listen-vol [data-vol="${ch}"]`).forEach((i) => Number(i.value) !== v && (i.value = v));
  }

  _bindListen() {
    const ui = $('#listen');
    ui.addEventListener('click', (e) => {
      const b = e.target.closest('[data-l]');
      if (!b || !this._listening) return;
      const act = b.dataset.l;
      if (act !== 'vol') this._listenVol(false);
      if (act === 'play') this._listenToggle();
      else if (act === 'prev') this._listenStep(-1);
      else if (act === 'next') this._listenStep(1);
      else if (act === 'mode') this._listenMode();
      else if (act === 'sleep') this._listenSleep();
      else if (act === 'vol') return this._listening.nature ? this._listenMixer() : this._listenVol($('#listen-vol').hidden);
      else if (act === 'list') return this._listenList();
      else if (act === 'fold' || act === 'unfold') this._listenFold(act === 'fold');
      else if (act === 'exit') this.exitListening();
      this._listenSync();
      this._listenWake();
    });
    $$('#listen-vol [data-vol]').forEach((i) => i.addEventListener('input', () => this._setVolume(i.dataset.vol, Number(i.value))));
    // 소리 판 밖을 누르면 닫는다
    window.addEventListener('pointerdown', (e) => !$('#listen-vol').hidden && !e.target.closest?.('#listen-vol, #listen [data-l="vol"]') && this._listenVol(false), { passive: true });
    const seek = $('#listen-seek');
    seek.addEventListener('input', () => {
      if (this._listening) this._listening.seeking = true;
      seek.style.setProperty('--p', `${seek.value / 10}%`);
    });
    seek.addEventListener('change', () => {
      const el = this.sound.currentTrack?.el;
      if (el && Number.isFinite(el.duration)) el.currentTime = (seek.value / 1000) * el.duration;
      if (this._listening) this._listening.seeking = false;
      seek.blur();
      this._listenSync();
    });
    const wake = () => this._listening && this._listenWake();
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('pointerdown', wake, { passive: true });
  }

  _strikeBell() {
    const pos = new THREE.Vector3(L.bell.x, L.courtyard.y, L.bell.z);
    this.temple.strikeBell(() => {
      this.sound.playBell(1);
      this.live?.bell();
      this.world.ripples.spawn(pos, { color: '#e8c070', maxR: 22, life: 4.5 });
      this.world.ripples.spawn(pos, { color: '#e8c070', maxR: 14, life: 3.5, delay: 0.5 });
    });
    this.store.addStat('bellStrikes');
    this.player.play('bow_half');
    setTimeout(() => this.toast('🔔 청동 범종의 울림이 산사 전체로 퍼져 나갑니다'), 1100);
  }

  _offerIncense() {
    this.player.restState = null;
    this.avatars.triggerAction('incense');
    setTimeout(() => {
      this.temple.offerIncense();
      this.sound.playMoktak(0.5);
    }, 1400);
    this.store.addStat('incenseCount');
    this.toast('🕯️ 불단 앞에 향 한 대와 초 한 자루를 공손히 올립니다');
  }

  /** 고른 좌복으로 걸어가 그냥 앉는다 (아무 수행도 열지 않음). then 이 있으면 앉은 뒤 이어서 */
  _sitCushion(index, then) {
    const p = this.player.root.position;
    const c = index != null ? this.temple.cushions[index] : this.avatars.freeCushionNear(p.x, p.z);
    if (!c) return;
    if (c.occupant && c.occupant !== this.player) {
      this.toast('다른 도반이 앉아 있는 좌복입니다. 빈 좌복을 골라 주세요');
      return;
    }
    if (this.player.seat?._ref === c) return then?.(); // 이미 이 좌복에 앉아 있다
    const seat = this.avatars.cushionSeat(c); // 전개(...)하면 occupant setter 가 사라진다
    seat.kind = 'cushion';
    const go = () => {
      this.avatars.sitAt(seat, 'sit');
      this.player.restState = 'sit';
      if (then) then();
      else this.toast('🪷 좌복에 앉았습니다 · 움직이면 일어납니다');
    };
    if (zoneAt(p.x, p.z) !== 'DAEUNGJEON') return this._teleport(c.x, c.z + 0.8, Math.PI, () => setTimeout(go, 200));
    this.avatars.moveTo(c.x, c.z + 0.75, go);
  }

  /* ───────── 순환 산책로: 쉼터에 앉기 · 돌탑 어디서나 ───────── */
  /** 다른 구역·먼 곳으로 옮길 때 (장소 이동 가림막이 있으면 그것으로) */
  _jump(x, z, ry, then) {
    return this._teleport(x, z, ry, () => setTimeout(then, 200));
  }

  /** 지도·쉼터 목록에서 고른 쉼터로: 8m 안이면 걸어가고, 멀면 가림막 뒤에서 그 앞으로 옮겨 앉는다 */
  _goRest(id) {
    const s = this.temple.trail.spots.find((q) => q.id === id);
    if (!s) return;
    this.sound.init();
    const p = this.player.root.position;
    if (Math.hypot(p.x - s.stand.x, p.z - s.stand.z) < 8) return this._sitRest(s);
    this._jump(s.stand.x, s.stand.z, s.ry, () => this._sitRest(s));
  }

  /** 장소 시트가 열려 있으면 지도 위 내 자리를 옮긴다 */
  _syncMiniMap() {
    if (!this.miniMap || $('#place-sheet').classList.contains('hidden')) return;
    const p = this.player.root.position;
    this.miniMap.setPlayer(p.x, p.z, this.player.heading);
  }

  /** 쉼터의 빈 칸: 다른 도반이 앉은 칸은 비켜 가까운 칸, 다 찼으면 곁의 땅 (그마저 없으면 null) */
  _restSlot(s) {
    const pl = this.player, p = pl.root.position;
    const taken = this.avatars.sittingOthers();
    const free = restSlots(s).filter((k) => (!k.occupant || k.occupant === pl) && !taken.some((t) => Math.hypot(t.x - k.x, t.z - k.z) < 0.45));
    const cost = (k) => Math.hypot(k.stand.x - p.x, k.stand.z - p.z) - (k.index === 0 ? 0.4 : 0); // 비슷하면 원래 자리(경치가 가장 좋은 칸)
    if (free.length) return free.sort((a, b) => cost(a) - cost(b))[0];
    return restGroundSlot(s, p.x, p.z, taken);
  }

  /** 고른 쉼터로 걸어가 앉는다: 가까우면 곧장, 산책로 위면 길을 따라(60m 안), 아니면 옮겨 간다. 한 쉼터에 여럿이 나란히 앉는다 */
  _sitRest(s) {
    const pl = this.player, p = pl.root.position;
    if (pl.seat?._ref === s) return;
    const slot = this._restSlot(s);
    if (!slot) return this.toast('이 쉼터는 자리가 꽉 찼습니다 · 다른 쉼터를 골라 보세요');
    const tr = this.temple.trail;
    const go = () => {
      // 걸어오는 사이 다른 도반이 그 칸에 먼저 앉았으면 남은 칸으로
      const k = this.avatars.sittingOthers().some((t) => Math.hypot(t.x - slot.x, t.z - slot.z) < 0.45) ? this._restSlot(s) : slot;
      if (!k) return this.toast('이 쉼터는 자리가 꽉 찼습니다 · 다른 쉼터를 골라 보세요');
      this.avatars.sitAt(tr.seat(s, k), k.state);
      pl.restState = k.state;
      if (s.kind === 'mat' && !k.ground) tr.showMat(s);
      this.toast(k.ground ? REST_GROUND_MSG : REST_SIT_MSG[s.kind]);
      if (!this._restHinted) {
        this._restHinted = true; // 처음 앉았을 때 한 번만
        setTimeout(() => pl.seat?.kind === 'rest' && this.toast('🎧 아래 「예불 듣기」·「자연의 소리 듣기」를 누르면 이 자리에서 경치를 보며 듣습니다'), 2600);
      }
    };
    const st = slot.stand;
    const d = Math.hypot(p.x - st.x, p.z - st.z);
    if (d < 0.6) return go();
    let clear = d < 8;
    for (let k = 1; clear && k * 0.5 < d; k++) clear = isWalkable(p.x + ((st.x - p.x) * k * 0.5) / d, p.z + ((st.z - p.z) * k * 0.5) / d);
    if (clear) return this.avatars.moveTo(st.x, st.z, go);
    const here = trail.nearest(p.x, p.z), there = trail.nearest(st.x, st.z);
    if (here && there && here.d < 2 && Math.abs(there.s - here.s) < 60) return this.avatars.moveTo(st.x, st.z, go, trail.route(here.s, there.s, 3));
    this._jump(st.x, st.z, s.ry, go);
  }

  /**
   * 휴식 (하단 독 · 3 키, 사용자 2026-11-07: 가부좌 대신): 선 자리에 돗자리를 펴고 앉는다 — 쉼터처럼 「예불 듣기」·「자연의 소리 듣기」가 뜬다.
   * 돗자리(1.0×1.5m)는 천처럼 땅을 따라 덮고(trailProps showMat), 네 귀퉁이가 걸을 수 있는 땅이고 MAT_SLOPE° 안일 때만 편다 (물·담·계단은 안 됨). 법당 안은 가까운 좌복에
   */
  _restHere() {
    const pl = this.player, p = pl.root.position;
    if (this.modals.current === 'mala') return; // 염주 창에서 3 은 염주 한 알 (창이 센다)
    if (pl.seat?.kind === 'rest') return this.toast('🎧 아래 「예불 듣기」·「자연의 소리 듣기」를 누르면 이 자리에서 듣습니다');
    if (zoneAt(p.x, p.z) === 'DAEUNGJEON') {
      const c = this.avatars.freeCushionNear(p.x, p.z);
      return c ? this._sitCushion(c.index) : this.toast('빈 좌복이 없습니다');
    }
    if (pl.sitting) return this.toast('이미 앉아 있습니다 · 움직이면 일어납니다');
    const ry = pl.heading, c = Math.cos(ry), sn = Math.sin(ry);
    const P = [[0, 0], [0.5, 0.75], [-0.5, 0.75], [0.5, -0.75], [-0.5, -0.75]].map(([lx, lz]) => ({ x: p.x + c * lx + sn * lz, z: p.z - sn * lx + c * lz }));
    const h = P.map((q) => walkHeight(q.x, q.z));
    const front = Math.atan(((h[1] + h[2]) - (h[3] + h[4])) / 2 / 1.5), side = Math.atan(((h[1] + h[3]) - (h[2] + h[4])) / 2 / 1.0);
    if (!P.every((q) => isWalkable(q.x, q.z)) || Math.max(Math.abs(front), Math.abs(side)) > (MAT_SLOPE * Math.PI) / 180) {
      return this.toast('🧺 여기는 돗자리를 펴기 어렵습니다 · 조금 평평한 곳으로 옮겨 보세요');
    }
    const s = { id: 'mat_here', name: '돗자리', kind: 'mat', x: p.x, z: p.z, y: h[0] + 0.03, ry, stand: { x: p.x, z: p.z }, seatH: 0.03, listenPitch: 0.02 };
    this._sitRest(s);
  }

  /** 지금 알려진 길가 돌탑 + 일주문 옆 돌탑 */
  _cairnsWithGate() {
    const g = this.temple.cairnPos;
    return [...this.temple.cairns.all, { id: GATE_ID, x: g.x, z: g.z, n: this.store.gateStoneTotal }];
  }

  /** 돌 올리기 창을 이 자리 기준으로 연다 (돌 하나하나는 얹을 때 1.5m 규칙으로 탑을 고른다) */
  _stoneHere(at) {
    this._stoneSpot = { x: at.x, z: at.z };
    this.modals.open('stone_pagoda');
  }

  /** 돌을 얹을 자리 → { cairnId, x, z } (길가 돌탑) 또는 null (일주문 옆 돌탑) */
  _stonePlace() {
    const at = this._stoneSpot, p = this.player.root.position;
    if (!at || Math.hypot(p.x - at.x, p.z - at.z) > 4) return null; // 그 자리를 떠났으면(다른 데서 연 창) 일주문 옆 돌탑
    const list = this._cairnsWithGate();
    let r = placeStone(list, at.x, at.z, `c_${uuid()}`);
    if (r.full) r = findJoinable(list, at.x, at.z, AREA_RADIUS); // 구역이 꽉 찼으면 가장 가까운 탑에
    if (!r || r.id === GATE_ID) return null;
    return { cairnId: r.id, x: r.x, z: r.z };
  }

  /** 지금 선 자리(몸 앞 0.9m 또는 발밑)에 돌탑을 쌓거나 얹을 수 있으면 { at } (일주문 옆 돌탑 1.5m 안은 아님) */
  _cairnHere() {
    const pl = this.player, p = pl.root.position;
    const fx = p.x + Math.sin(pl.heading) * 0.9, fz = p.z + Math.cos(pl.heading) * 0.9;
    const at = canBuildCairn(fx, fz) ? { x: fx, z: fz } : canBuildCairn(p.x, p.z) ? { x: p.x, z: p.z } : null;
    if (!at) return null;
    const list = this._cairnsWithGate();
    const c = findJoinable(list, at.x, at.z);
    if (c?.id === GATE_ID) return null;
    if (c) return { at: { x: c.x, z: c.z } };
    return areaCount(list, at.x, at.z) >= AREA_CAP ? null : { at };
  }

  /* ───────── 자동 산책: 순환 산책로(+ 산문 앞 숲길)를 한 바퀴씩 천천히 ───────── */
  _toggleStroll() {
    this.sound.init();
    if (this._stroll) return this._stopStroll('멈춤');
    const p = this.player.root.position;
    const n = loop.nearest(p.x, p.z);
    if (!n || n.d > 6) {
      // 산책로에서 멀면 산문 앞 갈림목으로 옮겨 가 거기서 시작
      const b = trail.at(2);
      return this._jump(J1.x, J1.z, Math.atan2(b.x - J1.x, b.z - J1.z), () => this._startStroll(0));
    }
    this._startStroll(n.s);
  }

  _startStroll(s0) {
    this._stroll = { mt: null };
    this._strollLap(s0);
    this._strollBtn.classList.add('active');
    this._strollBtn.setAttribute('aria-pressed', 'true');
    this._strollBtn.querySelector('.lbl').textContent = '멈추기';
    this.toast('🚶 자동 산책 — 순환 산책로를 천천히 한 바퀴씩 걷습니다 · 움직이거나 「멈추기」를 누르면 멈춥니다');
  }

  _strollLap(s0) {
    const end = loop.at(loop.length);
    this.avatars.moveTo(end.x, end.z, () => {
      if (!this._stroll) return;
      const p = this.player.root.position;
      // moveTo 는 막혀도 도착으로 부른다 — 정말 끝에 닿았을 때만 다음 바퀴, 아니면 가까운 자리에서 다시
      if (Math.hypot(p.x - end.x, p.z - end.z) < 1.2) return this._strollLap(0);
      const n = loop.nearest(p.x, p.z);
      if (n && n.d < 3) return this._strollLap(Math.min(n.s + 2, loop.length - 1));
      this._stopStroll('막힘');
    }, loop.route(s0, loop.length, 3));
    this._stroll.mt = this.avatars.moveTarget;
  }

  _stopStroll(why) {
    if (!this._stroll) return;
    this._stroll = null;
    if (why === '멈춤') this.avatars.moveTarget = null;
    this._strollBtn.classList.remove('active');
    this._strollBtn.setAttribute('aria-pressed', 'false');
    this._strollBtn.querySelector('.lbl').textContent = '산책';
    if (why !== '구역') this.toast('자동 산책을 멈췄습니다');
  }

  /** 매 프레임: 다른 움직임이 끼어들면 멈추고, 3인칭이면 카메라가 천천히 걷는 쪽 뒤로 돈다 */
  _strollTick(dt) {
    const w = this._walk;
    if (w && this.avatars.moveTarget !== w.mt) {
      this._walk = null; // 다른 움직임이 끼어들었다 (닿았을 때는 도착 콜백이 먼저 비운다)
      this.toast('돌탑 찾아가기를 멈췄습니다');
    }
    const st = this._stroll || this._walk;
    if (!st) return;
    if (this._stroll && this.avatars.moveTarget !== st.mt) return this._stopStroll('끼어듦');
    const cam = this.world.cam;
    if (cam.mode === 'third' && !this._listening) cam.yaw += wrapAngle(this.player.heading - Math.PI - cam.yaw) * (1 - Math.exp(-dt * 0.7));
  }

  /* ───────── 돌탑: 이 탑에 남긴 글만, 내가 쌓은 탑 찾아가기 ───────── */
  /** 돌 올리기 창이 가리키는 탑: 선 자리(4m 안)의 탑, 아직 없으면 새 탑 자리, 아니면 일주문 옆 돌탑 */
  _stoneScope() {
    const p = this.player.root.position, at = this._stoneSpot;
    let c = { id: GATE_ID, ...this.temple.cairnPos };
    if (at && Math.hypot(p.x - at.x, p.z - at.z) <= 4) {
      c = findJoinable(this._cairnsWithGate(), at.x, at.z);
      if (!c) return { id: null, isNew: true, name: this._cairnName(at), total: 0, stones: [], mine: this._myCairns() };
    }
    const mine = this._myCairns();
    const hidden = new Set(this.store.state.reported || []);
    const local = this.store.state.stones.filter((s) => (s.cairnId || GATE_ID) === c.id); // 내 돌 + 이미 받아 둔 최근 돌 중 이 탑 것
    const got = this._cairnCache?.get(c.id);
    const by = new Map();
    for (const s of [...(got?.stones || []), ...local]) if (!hidden.has(s.id)) by.set(s.id, { ...by.get(s.id), ...s });
    const stones = [...by.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const n = c.id === GATE_ID ? this.store.gateStoneTotal : Math.max(this.store.cairnList().find((k) => k.id === c.id)?.n || 0, got?.n || 0, stones.length);
    return { id: c.id, isNew: false, name: mine.find((k) => k.id === c.id)?.name || this._cairnName(c), total: n, stones, loading: !got, offline: !!got?.offline, mine };
  }

  /** 창을 열면 그 탑에 남긴 글을 서버에서 받아 온다 (받으면 창을 다시 그린다) */
  _loadCairnStones() {
    const sc = this._stoneScope();
    if (!sc.id) return;
    this._cairnCache ||= new Map();
    sharedApi.cairnStones(sc.id === GATE_ID ? null : sc.id).then((r) => {
      if (r.error) this._cairnCache.set(sc.id, { stones: [], n: 0, offline: true }); // 서버에 닿지 않으면 내 화면에 있는 글만
      else this._cairnCache.set(sc.id, { stones: (r.stones || []).map((s) => ({ ...s, shared: true })), n: r.n || 0 });
      this.modals.refresh();
    });
  }

  /** 탑 이름: 일주문 옆 돌탑, 아니면 가까운 쉼터·장소 이름으로 */
  _cairnName(c) {
    if (c.id === GATE_ID) return '일주문 옆 돌탑';
    let best = null, bd = 40;
    for (const s of REST_SPOTS) {
      const d = Math.hypot(s.x - c.x, s.z - c.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (best) return `${best.name} 근처 돌탑`;
    return zoneAt(c.x, c.z) === 'FOREST' && Math.abs(c.x - pathX(c.z)) < 8 ? '일주문 숲길 돌탑' : '순환 산책로 돌탑';
  }

  /** 내가 돌을 얹은 탑들 (이 기기에 기억해 둔 내 돌에서 — 최근에 얹은 탑부터) */
  _myCairns() {
    const p = this.player.root.position, list = this.store.cairnList(), by = new Map();
    for (const s of this.store.state.stones) {
      if (s.shared) continue; // 내가 얹은 돌만
      const id = s.cairnId || GATE_ID;
      let c = by.get(id);
      if (!c) {
        const at = id === GATE_ID ? this.temple.cairnPos : { x: s.x, z: s.z };
        c = { id, x: at.x, z: at.z, n: id === GATE_ID ? this.store.gateStoneTotal : list.find((k) => k.id === id)?.n || 0, mine: 0, last: '' };
        by.set(id, c);
      }
      c.mine++;
      if (String(s.createdAt) > c.last) c.last = String(s.createdAt);
    }
    const seen = new Map(); // 같은 쉼터 근처에 탑이 여럿이면 「… 돌탑 2」처럼 (최근 것이 이름 그대로)
    return [...by.values()]
      .sort((a, b) => b.last.localeCompare(a.last))
      .map((c) => {
        const base = this._cairnName(c), k = (seen.get(base) || 0) + 1;
        seen.set(base, k);
        return { ...c, name: k > 1 ? `${base} ${k}` : base, d: Math.round(Math.hypot(c.x - p.x, c.z - p.z)) };
      });
  }

  /** 장소 시트의 「내가 쌓은 돌탑」 */
  _syncMyCairns() {
    const mine = this._myCairns().slice(0, 8);
    $('#my-cairns-wrap').classList.toggle('hidden', !mine.length);
    $('#my-cairn-list').innerHTML = mine.map((c) => `<button class="ctl chip" type="button" data-walk-cairn="${c.id}" title="${c.name} · 내 돌 ${c.mine}개">${c.name.replace(' 돌탑', '')} <small>${c.d}m</small></button>`).join('');
  }

  /** 걸어서 찾아갈 길 (0.5m 칸, 몸 반지름보다 넉넉히 비켜서) — 처음 부를 때 만든다.
   * 칸 가운데와 네 귀(±0.22m)가 모두 걸을 수 있어야 지나간다: 곧게 당긴 줄이 울타리 띠·길 가장자리를 스치지 않게 */
  _pf() {
    const E = 0.22;
    return (this._pathfinder ||= createPathfinder((x, z) => {
      if (!isWalkable(x, z) || !isWalkable(x + E, z + E) || !isWalkable(x - E, z + E) || !isWalkable(x + E, z - E) || !isWalkable(x - E, z - E)) return false;
      const q = resolveCollisions(x, z, 0.38);
      return Math.hypot(q.x - x, q.z - z) < 1e-3;
    }));
  }

  /** 내가 쌓은 탑까지 걸어서 (순간 이동 없이). 다른 움직임이 끼어들면 멈추고, 길에 걸리면 그 자리에서 길을 다시 찾는다 (3번까지) */
  _walkToCairn(id, retry = 0) {
    const c = this._myCairns().find((k) => k.id === id);
    if (!c) return;
    this.sound.init();
    if (this._stroll) this._stopStroll('구역');
    const p = this.player.root.position;
    if (Math.hypot(c.x - p.x, c.z - p.z) < 2) return retry ? null : this.toast(`⛰️ 이미 ${c.name} 앞입니다`);
    const path = this._pf().find(p.x, p.z, c.x, c.z);
    if (!path) return this.toast('그 돌탑까지 걸어갈 길을 찾지 못했습니다');
    // 탑 바로 앞(0.9m)에서 멈춰 탑을 바라본다
    const prev = path[path.length - 2] || p;
    const dd = Math.hypot(prev.x - c.x, prev.z - c.z) || 1;
    let end = { x: c.x + ((prev.x - c.x) / dd) * 0.9, z: c.z + ((prev.z - c.z) / dd) * 0.9 };
    if (!this._pf().ok(end.x, end.z)) end = path[path.length - 1]; // 탑 앞이 걸을 수 없는 땅이면 닿을 수 있는 가장 가까운 곳까지
    const via = path.slice(1, -1);
    const len = pathLength([...path.slice(0, -1), end]);
    this.avatars.moveTo(end.x, end.z, () => {
      if (!this._walk) return;
      this._walk = null;
      const q = this.player.root.position;
      if (Math.hypot(q.x - end.x, q.z - end.z) > 2.5) {
        if (retry < 3) return this._walkToCairn(id, retry + 1);
        return this.toast('길이 막혀 멈췄습니다 · 조금 움직인 뒤 다시 찾아가 보세요');
      }
      this.player.heading = Math.atan2(c.x - q.x, c.z - q.z);
      this.player.root.rotation.y = this.player.heading;
      this._stoneSpot = { x: c.x, z: c.z };
      this.toast(`⛰️ ${c.name}에 닿았습니다 · 돌을 하나 더 얹을 수 있습니다`);
    }, via);
    this._walk = { mt: this.avatars.moveTarget, id };
    const min = Math.max(1, Math.round(len / 1.1 / 60));
    if (!retry) this.toast(`🚶 ${c.name}까지 걸어갑니다 · 약 ${Math.round(len)}m, ${min}분 · 움직이면 멈춥니다`);
  }

  /** 멈춰 선 자리에서 돌탑을 쌓을 수 있으면 알약 하나 (걷는 동안에는 띄우지 않는다) */
  _cairnPrompt(p) {
    const pl = this.player, now = performance.now();
    const s = this._still;
    if (!s || Math.hypot(p.x - s.x, p.z - s.z) > 0.05 || this.avatars.moveTarget || pl.busy) this._still = { x: p.x, z: p.z, t: now };
    if (now - this._still.t < 600 || pl.sitting) return null;
    // 몸 앞 0.9m 에 쌓는다 (그 자리가 안 되면 발밑)
    const fx = p.x + Math.sin(pl.heading) * 0.9, fz = p.z + Math.cos(pl.heading) * 0.9;
    const at = canBuildCairn(fx, fz) ? { x: fx, z: fz } : canBuildCairn(p.x, p.z) ? { x: p.x, z: p.z } : null;
    if (!at) return null;
    const list = this._cairnsWithGate();
    const c = findJoinable(list, at.x, at.z);
    if (c?.id === GATE_ID) return null; // 일주문 옆 돌탑은 원래 알약이 맡는다
    if (c) return { id: `cairn:${c.id}`, label: `돌탑에 돌 얹기 · ${c.n}층`, at: { x: c.x, z: c.z } };
    if (areaCount(list, at.x, at.z) >= AREA_CAP) return null;
    return { id: 'cairn:new', label: '여기에 돌탑 쌓기', at };
  }

  /** 108배·염주: 자리를 옮기지 않고 지금 그 자리에서 (좌복 위든 마루 위든) */
  _practiceHere(mode) {
    const pl = this.player;
    if (mode === 'mala') {
      if (pl.state !== 'meditate') {
        this.avatars.triggerAction('meditate');
        pl.restState = 'meditate';
      }
      this.world.setFocusVignette(true);
    }
    this.modals.open(mode === 'mala' ? 'mala' : 'practice_108'); // 108배와 염주는 다른 자세라 창도 따로
  }

  _sitTea() {
    const s = L.teaSeat;
    const def = this._interactable('tea_chat');
    const seat = { x: s.x, y: s.y, z: s.z, ry: Math.PI / 2, standAt: { x: def.approach.x, z: def.approach.z } };
    this.avatars.sitAt(seat, 'sit');
    this.player.restState = null;
    const monk = this.avatars.teaMonk;
    monk.restState = 'sit';
    monk.play('incense'); // 두 손으로 찻잔을 건네는 몸짓
    setTimeout(() => {
      this.sound.playTeaPour();
      this.temple.teaSteam.userData.uniforms.uIntensity.value = 1;
    }, 900);
    setTimeout(() => this.player.seat === seat && this.player.setState('tea'), 2400); // 그새 일어나 걸어갔으면 찻잔을 들지 않는다
    if (this._teaScene && this.modals.current === 'tea_chat') return this.modals.open('tea_chat');
    // 대사 장면: 가림막 뒤에서 HUD 를 거두고, 내 어깨 너머로 찻상 건너 스님이 보이는 구도에 카메라를 묶는다
    const cam = this.world.cam;
    const tea = (this._teaScene = { seat, saved: this._teaScene?.saved || { mode: cam.mode, yaw: cam.yaw, pitch: cam.pitch, dist: cam.targetDist } });
    this.joy = { x: 0, z: 0 };
    this.keys = {};
    veil(() => {
      if (this._teaScene !== tea) return;
      if (this.player.seat !== seat) return void (this._teaScene = null); // 그새 자리를 떴다
      cam.mode = 'third';
      this.world.setShot(this._teaShot(), true);
      document.body.classList.add('tea-scene');
      this.modals.open('tea_chat');
    }, { hold: 500 });
  }

  /**
   * 차담 구도 (고정, 앉은 자리 기준 — 둘은 1.3m 떨어져 서로 마주 본다).
   * 세로 화면: 내 어깨 너머 높은 데서 내려다봐 스님이 위쪽 40% 안에 (긴 답이면 대사 상자가 아래 절반을 덮는다).
   * 가로 화면: 가로 시야가 넓어 뒤에서는 내 머리가 화면을 가리므로, 옆에서 나(왼쪽 옆모습)와 마주 보는 스님을 함께.
   * 수치는 360·390·430·1280·844(가로) 스크린숏으로 맞췄다 (tools/qa/tea.mjs).
   */
  _teaShot() {
    const s = L.teaSeat, m = this.temple.monkSeat;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const tall = innerWidth / innerHeight < 0.85;
    return tall
      ? { pos: V(s.x - 1.2, s.y + 1.25, s.z + 1.3), look: V(m.x + 0.1, m.y - 0.95, m.z - 0.15), dur: 1 }
      : { pos: V(s.x - 0.55, s.y + 0.7, s.z + 1.6), look: V(m.x - 0.15, m.y + 0.03, m.z), dur: 1 };
  }

  /**
   * 번뇌 소각: 적은 쪽지가 손앞에서 화로로 날아 들어가 불꽃이 되어 사라진다. 나는 화로를 보며 천천히 합장한다.
   * 반배 몸짓(triggerAction 'bow_half')을 쓰지 않으므로 참배객 답례·축복음(띠링)·인사 신호가 없다 — 서버에는 합장 자세만 간다.
   * 옆에서 나와 화로를 함께 담고, 다 타면 원래 시점으로. 걸으면 바로 풀린다 (종이는 그대로 다 탄다).
   */
  _burnPaper(canvas) {
    const pl = this.player, p = pl.root.position, b = L.brazier, y = L.courtyard.y;
    this.modals.close();
    this.avatars.moveTarget = null;
    if (pl.sitting) this.avatars.standUp();
    const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    pl.heading = Math.atan2(ux, uz);
    pl.setState('circumambulate'); // 선 채 두 손을 모은 합장 (gassho)
    // 옆에서 보는 구도: 나·화로를 잇는 선의 양옆 가운데 마당 쪽 (뒤의 기와걸이·담을 피해서)
    const side = [[-uz, ux], [uz, -ux]].sort((A, B) => Math.hypot(b.x + A[0] * 3, b.z + A[1] * 3) - Math.hypot(b.x + B[0] * 3, b.z + B[1] * 3))[0];
    const tall = innerWidth / innerHeight < 0.85;
    const D = tall ? 4.6 : 3.4, H = tall ? 2.4 : 1.75, mx = (p.x + b.x) / 2, mz = (p.z + b.z) / 2;
    const pos = new THREE.Vector3(mx + side[0] * D + ux * 0.6, y + H, mz + side[1] * D + uz * 0.6); // 화로 쪽으로 조금: 내 얼굴과 모은 두 손이 보이게
    const look = new THREE.Vector3(mx + ux * 0.3, y + 0.95, mz + uz * 0.3);
    this.world.setShot({ pos, look, dur: 1 });
    this._burnHold = true;
    const from = new THREE.Vector3(p.x + ux * 0.42, p.y + 1.05, p.z + uz * 0.42); // 모은 두 손 앞
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.temple.burnPaper(canvas, from, pos, {
      instant: still,
      onIgnite: () => {
        this.temple.flareBrazier();
        this.sound.playFireWhoosh();
        this.sound.flareBrazier?.(SKY_TOTAL); // 화로 타닥 소리를 하늘로 솟는 불길 길이만큼 키웠다 줄인다 (소리 세션의 훅 — 없으면 건너뜀)
        // 불똥이 하늘로 솟는 동안 카메라도 천천히 올려다본다
        if (!still)
          setTimeout(() => {
            if (!this._burnHold) return;
            // 조금 물러나며 살짝만 올려다본다: 화로가 화면 아래에 남고, 불기둥이 위로 솟아 화면 밖(하늘)으로 사라진다
            const lookTo = new THREE.Vector3(b.x, y + 2.4, b.z);
            const to = pos.clone().addScaledVector(pos.clone().sub(look).setY(0).normalize(), 2.2).setY(pos.y + 0.3);
            this.world.setShot({ pos, look, to, lookTo, dur: 3.0 });
          }, 1000);
      },
      onDone: () => {
        this.toast('🔥 흔적 없이 사라졌습니다 · 깊게 한 번 내쉬어 보세요');
        // 하늘로 솟은 마지막 불똥이 사라질 무렵 원래 시점으로 (종이는 불붙고 BURN 초 뒤에 다 탄다)
        setTimeout(() => this._endBurnHold(), still ? 900 : (SKY_TOTAL - BURN) * 1000);
      }
    });
    return true;
  }

  /** 소각 구도를 푼다: 원래 시점으로, 합장을 내린다 */
  _endBurnHold() {
    if (!this._burnHold) return;
    this._burnHold = false;
    this.world.setShot(null);
    if (this.player.state === 'circumambulate' && !this.avatars.circling) this.player.setState('idle');
  }

  /** 차담에서 일어남: 원래 보던 구도와 HUD 로 */
  _leaveTea() {
    const tea = this._teaScene;
    if (!tea) return;
    this._teaScene = null;
    veil(() => {
      if (this._teaScene) return; // 그새 다시 앉았다
      this.world.setShot(null);
      this.world.cam.mode = tea.saved.mode;
      this.world.snapCameraTo(tea.saved.yaw, tea.saved.pitch, tea.saved.dist);
      document.body.classList.remove('tea-scene');
      this._syncChips();
    }, { hold: 420 });
  }

  /* ───────── 동작 6종 ───────── */
  gesture(name) {
    this.sound.init();
    const p = this.player.root.position;
    const zone = zoneAt(p.x, p.z);
    switch (name) {
      case 'bow_half': {
        if (this._bowFrom && performance.now() - this._bowFrom.at < 6000 && !this.player.busy) return this._replyBow(); // 인사해 온 도반께 답례
        this._hideReply();
        // 합장 인사가 닿는 기존 10m 안에서 실제 도반 중 가장 가까운 이를 바라본다.
        let nearest = null, distance = 10;
        for (const peer of this.avatars.remote.values()) {
          const q = peer.av.root.position, d = Math.hypot(q.x - p.x, q.z - p.z);
          if (d < distance) { distance = d; nearest = q; }
        }
        if (nearest && !this.player.sitting) {
          this.player.heading = Math.atan2(nearest.x - p.x, nearest.z - p.z);
          this.player.root.rotation.y = this.player.heading;
        }
        const d = this.avatars.triggerAction('bow_half');
        if (d) {
          this.live?.bow();
          this._lastBowAt = performance.now();
          this.world.ripples.spawn(p, { maxR: 3.2, life: 2 });
        }
        break;
      }
      case 'prostrate':
        if (this._doProstration(false)) this.toast('🙇 두 무릎을 꿇고 이마를 바닥에 대어 절을 올립니다');
        break;
      case 'rest':
        return this._restHere();
      case 'incense':
        if (zone === 'DAEUNGJEON') return this.activate('incense');
        this.player.restState = null;
        this.avatars.triggerAction('incense');
        break;
      case 'circumambulate':
        if (zone !== 'COURTYARD') return this.toast('탑돌이는 대웅전 앞마당의 삼층석탑에서 할 수 있습니다');
        this.activate('circumambulate');
        break;
      case 'tea':
        if (zone === 'TEAHOUSE' && Math.hypot(p.x - L.teaSeat.x, p.z - L.teaSeat.z) < 4) return this.activate('tea_chat');
        this.avatars.triggerAction('tea');
        this.player.restState = 'tea';
        this.toast('🍵 따뜻한 찻잔을 두 손으로 감싸 쥡니다');
        break;
    }
  }

  /* ───────── 정시 예불 (05:00 · 18:00 KST) ───────── */
  _checkYebul() {
    if (!this.entered) return;
    const h = kstHour();
    const slot = h >= 5 && h < 5.1 ? 'dawn' : h >= 18 && h < 18.1 ? 'evening' : null;
    if (!slot) return;
    const key = new Date().toDateString() + slot;
    if (this._yebulKey === key) return;
    this._yebulKey = key;
    this.toast(slot === 'dawn' ? '🔔 새벽예불 — 범종이 다섯 번 울립니다' : '🔔 저녁예불 — 범종이 다섯 번 울립니다');
    this.sound.ringYebul(5, 9);
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        this.temple.strikeBell();
        this.world.ripples.spawn(new THREE.Vector3(L.bell.x, L.courtyard.y, L.bell.z), { color: '#e8c070', maxR: 22, life: 4.5 });
      }, i * 9000);
    }
  }

  /* ───────── HUD ───────── */
  toast(msg, stackId = 'toast-stack') {
    const stack = document.getElementById(stackId);
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    stack.appendChild(el);
    while (stack.children.length > 3) stack.firstChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 650);
    }, 3800);
  }

  _updateHUD() {
    const p = this.store.profile, s = p.stats;
    $('#hud-dharma-name').textContent = $('#hud-dharma-name-big').textContent = p.dharmaName;
    const n = (v) => (v || 0).toLocaleString('ko-KR');
    $('#hud-bows').textContent = n(s.bowCount);
    $('#hud-mala').textContent = n(s.malaCount);
    $('#hud-lanterns').textContent = n(s.lanternCount);
    if (this.avatars) {
      const real = this.live?.count || 0;
      $('#hud-presence-count').textContent = real > 0 ? `도반 ${real}명과 함께` : '홀로 머무는 중';
      $('#hud-presence').textContent = real > 0 ? `지금 도반 ${real}명이 말없이 함께 머뭅니다` : '지금은 홀로 머뭅니다';
      $('#hud-presence-sub').textContent = `산사 식구 ${this.avatars.npcCount}명이 곁에 있습니다`;
    }
  }

  _onZoneChange(force = false) {
    const p = this.player.root.position;
    const z = zoneAt(p.x, p.z);
    if (z === this.zone && !force) return;
    this.zone = z;
    $$('[data-goto-zone]').forEach((b) => b.classList.toggle('active', b.dataset.gotoZone === z));
    this.miniMap?.setHere(z);
    this._zoneRituals(z);
    if (this.entered) this.sound.setZone(z);
    if (this.entered && !this._listening) this._nowPlayingZone();
    if (z !== 'DAEUNGJEON') this.sound.stopTrack(); // 예불 듣기는 법당 안에서만
  }

  _syncChips() {
    const s = this.store.state.settings;
    $$('[data-time]').forEach((b) => b.classList.toggle('active', b.dataset.time === (s.time || 'realtime')));
    $$('[data-weather]').forEach((b) => b.classList.toggle('active', b.dataset.weather === (s.weather || 'clear')));
    $$('#menu-sheet [data-avatar]').forEach((b) => b.classList.toggle('active', b.dataset.avatar === this.store.profile.avatarStyle));
    $$('[data-camera]').forEach((b) => b.classList.toggle('active', b.dataset.camera === this.world.cam.mode));
    const v = s.volumes;
    ['nature', 'temple', 'sfx'].forEach((ch) => ($(`#vol-${ch}`).value = v[ch]));
    const h = kstHour();
    // 「실시간」 칩: 지금 한국 시각 (그 시각에 맞춰 하늘이 바뀐다 — 매일 05시·18시에 예불 종)
    const hm = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    const rt = $('#realtime-chip');
    rt.querySelector('small').textContent = hm;
    rt.title = `지금 한국 시각 ${hm}에 맞춰 하늘이 바뀝니다. 매일 05시·18시에 예불 종이 울립니다.`;
  }

  _syncSoundButton() {
    const on = this.sound.isEnabled;
    // 제어판 타일: 켜져 있으면 채운 타일 + 「소리 켬」 (누르면 끈다)
    $('#audio-toggle-btn .lbl').textContent = on ? '소리 켬' : '소리 끔';
    $('#audio-toggle-btn').classList.toggle('active', on);
    $('#audio-toggle-btn').setAttribute('aria-pressed', String(on));
    const bg = this.store.state.settings.bgAudio !== false;
    $('#bg-audio-btn').textContent = bg ? '켜짐' : '꺼짐';
    $('#bg-audio-btn').classList.toggle('active', bg);
    $('#bg-audio-btn').setAttribute('aria-pressed', String(bg));
    $('#sound-tool').classList.toggle('muted', !on);
    const quick = $('#quick-sound');
    quick.setAttribute('aria-pressed', String(on));
    quick.setAttribute('aria-label', on ? '소리 끄기' : '소리 켜기');
    quick.title = on ? '소리 끄기' : '소리 켜기';
  }

  _setCameraMode(mode) {
    const cam = this.world.cam;
    const next = mode || (cam.mode === 'third' ? 'first' : 'third');
    if (next === cam.mode) return;
    this.world.toggleCameraMode(next);
    if (next === 'first') {
      cam.yaw = wrapAngle(this.player.heading - Math.PI);
      cam.pitch = 0; // 몸의 정면과 같은 눈높이
      cam.turn = 0;
      this._fp = { off: 0 };
    }
    this._syncChips();
  }

  _zoomCamera(delta) {
    if (!delta || !this.entered) return;
    if (this._listening) { this.world.zoom(delta); return; }
    const cam = this.world.cam;
    if (cam.mode === 'first') {
      if (delta > 0) {
        cam.dist = cam.targetDist = 2.2; // 1인칭에서 나올 때 가까운 3인칭부터 연속적으로 멀어진다.
        this._setCameraMode('third');
        this.world.zoom(delta);
      }
    } else if (delta < 0 && cam.targetDist * (1 + delta) <= 2.2) {
      cam.targetDist = 2.2; // 기존 3인칭 확대 한계에서 1인칭으로 이어진다.
      this._setCameraMode('first');
    } else this.world.zoom(delta);
  }

  /**
   * 하단 독: 이 자리에서만 하는 신행·몸짓(특수 행동)이 늘 맨 앞, 남는 칸에 일반 몸짓(합장 → 헌향 → 큰절 → 휴식 순).
   * 칸이 모자라면 휴식·큰절부터 「더보기」로. 몸짓 단추는 새로 만들지 않고 옮긴다 (누름 처리가 그대로 남게).
   */
  _zoneRituals(z) {
    const DOCK_SLOTS = 6; // 「더보기」 빼고 (360px 폰 세로까지 48px 단추가 들어가는 수)
    const PLACE_GESTURES = { COURTYARD: ['circumambulate'], DAEUNGJEON: ['incense'] };
    // 다실에서는 「다선」을 숨긴다: 찻자리 4m 안에서 누르면 「차담」과 똑같이 찻자리에 앉는다 (gesture 'tea') — 같은 일을 하는 단추 둘
    const HIDE = { TEAHOUSE: ['tea'] };
    const GENERAL = ['bow_half', 'incense', 'prostrate', 'rest', 'tea', 'circumambulate'];
    const DOCK_GENERAL = new Set(['bow_half', 'incense', 'prostrate', 'rest']); // 「더보기」에 원래 있던 탑돌이·다선은 제자리에서만 앞으로
    const rituals = [...(DOCK_RITUALS[z] || []), ...ZONES[z].rituals].filter((id, i, a) => a.indexOf(id) === i && !GENERAL.includes(id));
    const btn = (id, cls, text) => `<button class="ctl ${cls}" type="button" data-ritual="${id}" title="${RITUALS[id].label}">${icon(RITUALS[id].icon || id)}<span class="lbl">${text}</span></button>`;
    const tmp = document.createElement('div');
    const specials = rituals.map((id) => {
      tmp.innerHTML = btn(id, 'dock-btn ritual', RITUALS[id].short);
      return { node: tmp.firstElementChild, ritual: id };
    });
    if (z === 'FOREST') specials.push({ node: this._strollBtn });
    for (const g of PLACE_GESTURES[z] || []) specials.push({ node: this._gestureBtns[g], gesture: g });
    const front = specials.slice(0, DOCK_SLOTS), spill = specials.slice(DOCK_SLOTS);
    const used = new Set(front.map((s) => s.gesture).filter(Boolean));
    const hidden = HIDE[z] || [];
    hidden.forEach((g) => this._gestureBtns[g].remove());
    const general = GENERAL.filter((g) => !used.has(g) && !hidden.includes(g));
    const room = DOCK_SLOTS - front.length;
    const inDock = general.filter((g) => DOCK_GENERAL.has(g)).slice(0, room);
    const toMore = general.filter((g) => !inDock.includes(g));
    const place = (node, where, special) => {
      node.classList.toggle('dock-btn', where === 'dock');
      node.classList.toggle('tile', where === 'more');
      node.classList.toggle('ritual', !!special && where === 'dock');
    };
    front.forEach((s) => place(s.node, 'dock', true));
    $('#dock-rituals').replaceChildren(...front.map((s) => s.node));
    if (z !== 'FOREST') this._strollBtn.remove();
    const more = $('#more-btn');
    inDock.forEach((g) => {
      place(this._gestureBtns[g], 'dock');
      more.before(this._gestureBtns[g]);
    });
    toMore.forEach((g) => place(this._gestureBtns[g], 'more'));
    $('#more-gestures').replaceChildren(...toMore.map((g) => this._gestureBtns[g]));
    $('#more-gestures-wrap').classList.toggle('hidden', !toMore.length);
    spill.forEach((s) => place(s.node, 'more'));
    $('#more-rituals').replaceChildren(...spill.map((s) => s.node));
    $('#more-rituals-wrap').classList.toggle('hidden', !spill.length);
    $('#place-btn .i')?.remove();
    $('#place-btn').insertAdjacentHTML('afterbegin', icon(ZONE_ICONS[z]));
    $('#place-name').textContent = ZONES[z].short;
  }

  /** 뒤로가기가 닫는 순서: 열린 창(차담·듣는 중 다시 연 목록 포함) → 듣기 → 시트 → 펼친 현판. 닫은 것이 있으면 true */
  _closeTop() {
    if (this.modals.isOpen) {
      this.modals.back(); // 창 안에 겹친 것(차담의 죽비 층)부터
      return true;
    }
    if (this._listening) {
      this.exitListening();
      return true;
    }
    if (closeTop()) return true;
    if ($('#hud-plaque').classList.contains('collapsed')) return false;
    $('#plaque-toggle').click();
    return true;
  }

  _bindHUD() {
    // 그림 아이콘을 채우고 장소 목록을 만든다
    $$('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
    // 몸짓 단추(독·더보기를 오간다)와 숲길의 「산책」 단추
    // 상태판은 오른쪽 위 장소·메뉴 단추 묶음이 남긴 너비까지만 (장소 이름 길이에 따라 변한다)
    new ResizeObserver(([e]) => document.documentElement.style.setProperty('--hud-top-w', `${Math.ceil(e.target.getBoundingClientRect().width)}px`)).observe($('.hud-top'));
    this._gestureBtns = Object.fromEntries($$('[data-gesture]').map((b) => [b.dataset.gesture, b]));
    const sb = document.createElement('div');
    sb.innerHTML = `<button class="ctl dock-btn ritual" type="button" id="stroll-btn" title="자동 산책 — 순환 산책로를 천천히 걷습니다" aria-pressed="false"><svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 3.8c1.6 0 2.4 1.6 2.2 3.6-.2 2-1.2 3.2-2.4 3.2S6.4 9.4 6.4 7.5c0-2 .6-3.7 2.1-3.7z"/><path d="M7 12.6l2.8.3-.4 2.4c-.2 1-1 1.5-1.8 1.4-.9-.1-1.3-.9-1.1-1.8z"/><path d="M15.5 7.8c1.5 0 2.1 1.7 2.1 3.7s-1 3.1-2.2 3.1-2.2-1.2-2.4-3.2c-.2-2 .9-3.6 2.5-3.6z"/><path d="M14 16.6l2.8-.3.5 2.3c.2 1-.3 1.7-1.1 1.8-.8.1-1.6-.4-1.8-1.4z"/></g></svg><span class="lbl">산책</span></button>`;
    this._strollBtn = sb.firstElementChild;
    this._strollBtn.addEventListener('click', () => this._toggleStroll());
    $('#place-list').innerHTML = Object.values(ZONES)
      .map(
        (z) => `<li><button class="ctl place-item" type="button" data-goto-zone="${z.id}">${icon(ZONE_ICONS[z.id])}
          <span class="place-txt"><b>${z.short}</b><small>${z.subtitle}</small></span><em class="here">지금 여기</em></button></li>`
      )
      .join('');

    // 장소 시트의 작은 지도 + 산책길 쉼터 목록: 누르면 그리로 간다 (쉼터는 가서 앉는다)
    this.miniMap = createMiniMap($('#minimap'), {
      zones: Object.values(ZONES),
      geo: { streamZ, pathX, L },
      onPick: (m) => {
        closeAll();
        if (m.kind === 'zone') this.travelTo(m.id);
        else this._goRest(m.id);
      }
    });
    $('#rest-list').innerHTML = this.miniMap.markers
      .filter((m) => m.kind === 'rest')
      .map((m) => `<button class="ctl chip" type="button" data-goto-rest="${m.id}">${m.name}</button>`)
      .join('');
    $$('[data-goto-rest]').forEach((b) => b.addEventListener('click', () => this._goRest(b.dataset.gotoRest)));
    $('#my-cairn-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-walk-cairn]');
      if (!b) return;
      closeAll();
      this._walkToCairn(b.dataset.walkCairn);
    });
    $$('.sheet').forEach(scrollFade); // 스크롤 막대 대신 가장자리 흐림

    // 시트: 단추로 여닫고, 하위 시트는 ‹ 로 메뉴에 돌아가며, 바깥을 누르거나 Esc 로 닫는다
    $$('[data-sheet]').forEach((b) =>
      b.addEventListener('click', () => {
        toggleSheet(b.dataset.sheet);
        if (b.dataset.sheet === 'place-sheet') {
          $('#place-sheet').scrollTop = 0; // 열 때마다 지도부터
          this._syncMyCairns();
        }
        this._syncMiniMap();
        this._syncChips();
        this.sound.playUIClick();
      })
    );
    $$('[data-sheet-back]').forEach((b) => b.addEventListener('click', () => closeTop()));
    $$('[data-sheet-close]').forEach((b) => b.addEventListener('click', () => closeAll()));
    document.addEventListener('pointerdown', (e) => !e.target.closest?.('.sheet, [data-sheet], #modal-overlay') && closeAll());
    window.addEventListener('keydown', (e) => e.key === 'Escape' && !this.modals.isOpen && !this._listening && closeTop() && e.preventDefault(), true);
    // 장소 이동·몸짓·신행을 고르면 그 시트는 닫는다
    $$('#place-sheet, #more-sheet').forEach((s) => s.addEventListener('click', (e) => e.target.closest('[data-goto-zone], [data-goto-rest], [data-gesture], [data-ritual]') && closeAll()));
    $('#hud').addEventListener('click', (e) => {
      const r = e.target.closest('[data-ritual]');
      if (r) this.activate(r.dataset.ritual);
    });

    $$('[data-time]').forEach((b) =>
      b.addEventListener('click', () => {
        this.store.setSetting('time', b.dataset.time);
        this.world.setTimeOfDay(b.dataset.time);
        setTimeout(() => this.sound.setTimeOfDay(this.world.phase), 1500);
        this._syncChips();
      })
    );
    $$('[data-weather]').forEach((b) =>
      b.addEventListener('click', () => {
        this.store.setSetting('weather', b.dataset.weather);
        this.world.setWeather(b.dataset.weather);
        this.sound.setWeather(b.dataset.weather);
        this._syncChips();
      })
    );
    $$('#menu-sheet [data-avatar]').forEach((b) =>
      b.addEventListener('click', () => {
        this.store.setAvatarStyle(b.dataset.avatar);
        this._rebuildPlayer();
        this._applyItems();
        this.live?.setIdentity(this.store.profile.dharmaName, b.dataset.avatar);
        this._syncChips();
      })
    );
    $$('[data-camera]').forEach((b) =>
      b.addEventListener('click', () => {
        this._setCameraMode(b.dataset.camera);
      })
    );
    $('#bg-audio-btn').addEventListener('click', () => {
      const on = this.store.state.settings.bgAudio === false; // 누르면 반대로
      this.store.setSetting('bgAudio', on);
      this.sound.setBackground(on); // 누른 순간(사용자 동작)이라 안드로이드 닻도 바로 튼다
      this._syncSoundButton();
      this.toast(on ? '🌙 화면이 꺼져도 산사 소리와 예불이 이어집니다' : '화면이 꺼지면 소리도 쉽니다');
    });
    $('#nature-listen-btn').addEventListener('click', () => {
      closeAll();
      this.activate('nature');
    });
    $('#audio-toggle-btn').addEventListener('click', () => {
      if (!this.sound.isEnabled && !this._soundStarted) this.sound.init();
      else this.sound.toggleAudio();
      this._soundStarted = true;
      this._syncSoundButton();
    });
    $('#quick-sound').addEventListener('click', () => $('#audio-toggle-btn').click());
    $('#quick-fullscreen').addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.fullscreenEnabled && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        else this.toast('이 브라우저에서는 전체화면 보기를 지원하지 않습니다.', 'bell-toast-stack');
      } catch { this.toast('전체화면을 열 수 없습니다.', 'bell-toast-stack'); }
    });
    document.addEventListener('fullscreenchange', () => {
      const button = $('#quick-fullscreen');
      button.setAttribute('aria-label', document.fullscreenElement ? '전체화면 나가기' : '전체화면 보기');
      button.title = button.getAttribute('aria-label');
    });
    $('#quick-capture').addEventListener('click', () => { this._captureRequested = true; });
    $('#shortcut-add').addEventListener('click', async () => {
      const prompt = window.templeInstallPrompt;
      if (prompt) {
        window.templeInstallPrompt = null;
        try { await prompt.prompt(); } catch { this.toast('홈 화면 추가를 열 수 없습니다.'); }
        return;
      }
      const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      $('#shortcut-help').textContent = ios
        ? 'Safari의 공유 버튼을 누르고 「홈 화면에 추가」를 선택해 주세요.'
        : '브라우저 메뉴에서 「홈 화면에 추가」 또는 「앱 설치」를 선택해 주세요.';
      openSheet('shortcut-sheet');
    });
    ['nature', 'temple', 'sfx'].forEach((ch) => $(`#vol-${ch}`).addEventListener('input', (e) => this._setVolume(ch, Number(e.target.value))));
    [['#record-btn', 'profile'], ['#help-btn', 'help'], ['#credits-btn', 'credits']].forEach(([sel, view]) =>
      $(sel).addEventListener('click', () => {
        closeAll();
        this.modals.open(view);
      })
    );
    // 현판은 접어 둔다 (펼치면 이곳 안내·내 법명·수행·동석)
    $('#plaque-toggle').addEventListener('click', () => {
      const open = $('#hud-plaque').classList.toggle('collapsed') === false;
      $('#plaque-toggle').setAttribute('aria-expanded', String(open));
    });

    // 메뉴와 상태판은 해당 영역을 마지막으로 조작한 뒤 30초 동안 열어 둔다.
    const plaque = $('#hud-plaque');
    const menuSheets = [$('#menu-sheet'), ...$$('.sheet[data-parent="menu-sheet"]')];
    let panelTimer;
    const armPanelTimer = () => {
      clearTimeout(panelTimer);
      const menuOpen = menuSheets.some((s) => !s.classList.contains('hidden'));
      if (!menuOpen && plaque.classList.contains('collapsed')) return;
      panelTimer = setTimeout(() => {
        if (menuSheets.some((s) => !s.classList.contains('hidden'))) closeAll();
        plaque.classList.add('collapsed');
        $('#plaque-toggle').setAttribute('aria-expanded', 'false');
      }, 30000);
    };
    const panels = new MutationObserver(armPanelTimer);
    [plaque, ...menuSheets].forEach((el) => panels.observe(el, { attributes: true, attributeFilter: ['class'] }));
    for (const event of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'input', 'scroll']) {
      document.addEventListener(event, (e) => {
        if (e.target.closest?.('#hud-plaque, #menu-sheet, .sheet[data-parent="menu-sheet"]')) armPanelTimer();
      }, { capture: true, passive: true });
    }

    $$('[data-goto-zone]').forEach((b) =>
      b.addEventListener('click', () => this.travelTo(b.dataset.gotoZone))
    );
    $$('[data-gesture]').forEach((b) => b.addEventListener('click', () => this.gesture(b.dataset.gesture)));
    $('#prompt').addEventListener('click', () => this.nearby && this._activateNearby());
    $('#prompt-alt').addEventListener('click', () => this.nearby?.alt && this.activate(this.nearby.alt.id));
  }

  /* ───────── 입력 ───────── */
  _bindInput() {
    const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    window.addEventListener('keydown', (e) => {
      if (this._listening) {
        if (this.modals.isOpen || e.defaultPrevented) return; // 다시 연 목록·조절 창: Esc 는 창을 닫고(닫은 Esc 로 일어나지 않게), 나머지 키는 창 안에서
        if (!e.target.closest?.('#listen') || e.code === 'Escape') this._listenKey(e); // 재생기 단추·막대는 제 키를 쓴다
        return;
      }
      if (typing() || !this.entered) return;
      if (this.modals.isOpen && !this.modals.current?.match(/practice_108|mala|tea_chat/)) return;
      this.keys[e.code] = true;
      if (this._teaScene) return; // 차담 장면: 1·2·3 은 예상 응답을 고른다. 걷는 키만 남긴다 (걸으면 일어난다)
      const k = e.key;
      // 108배 패널이 열려 있으면 절·염주는 패널이 센다 (오늘 횟수가 어긋나지 않게)
      if (this.modals.isOpen && this.modals.current?.match(/practice_108|mala/) && (k === ' ' || e.code === 'Space' || k === '2' || k === '3')) return;
      if (['1', '2', '3', '4', '5', '6'].includes(k)) {
        this.gesture(['bow_half', 'prostrate', 'rest', 'incense', 'circumambulate', 'tea'][Number(k) - 1]);
      }
      if (e.code === 'KeyV') {
        this._setCameraMode();
      }
      if (e.code === 'KeyE' && this.nearby) this._activateNearby();
      if (e.code === 'KeyR' && this.nearby?.alt) this.activate(this.nearby.alt.id);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => (this.keys[e.code] = false));
    window.addEventListener('blur', () => (this.keys = {}));

    const el = this.world.renderer.domElement;
    const pointers = new Map();
    let down = null, pinch = 0;
    el.addEventListener('pointerdown', (e) => {
      this._lookDragging = true;
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
        // 바닥을 눌러 버티면 손가락 밑으로 걸어간다 (끄는 대로 따라감, 떼면 멈춤)
        const mine = down;
        clearTimeout(this._holdTimer);
        this._holdTimer = setTimeout(() => {
          if (down === mine && mine.moved <= 8 && pointers.size === 1 && this.entered && !this._listening && !this._blockingModal()) {
            this._holdWalk = { x: mine.x, y: mine.y, next: 0 };
            this._setAutoWalk(false);
          }
        }, HOLD_WALK_MS);
      }
      if (pointers.size === 2) {
        this._endHoldWalk();
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
        down = null;
      }
    });
    el.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        // 호버: 연등 강조와 커서
        if (this.entered && e.pointerType === 'mouse' && !this._hoverPending) {
          this._hoverPending = true;
          requestAnimationFrame(() => {
            this._hoverPending = false;
            el.style.cursor = this.world.hoverLantern(e.clientX, e.clientY) ? 'pointer' : 'default';
          });
        }
        return;
      }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      prev.x = e.clientX;
      prev.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this._zoomCamera((pinch - d) * 0.006);
        pinch = d;
        return;
      }
      if (this._holdWalk) {
        this._holdWalk.x = e.clientX;
        this._holdWalk.y = e.clientY;
        return; // 끌어 걷는 동안은 카메라를 돌리지 않는다
      }
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      if (!down || down.moved > 5) this.world.orbit(dx, dy);
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      this._lookDragging = pointers.size > 0;
      if (pointers.size < 2) pinch = 0;
      clearTimeout(this._holdTimer);
      if (this._holdWalk) {
        this._endHoldWalk();
        down = null;
        return;
      }
      if (down && down.moved <= 6 && performance.now() - down.t < 450 && this.entered && !this._listening) this._click(e.clientX, e.clientY);
      down = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', (e) => {
      pointers.delete(e.pointerId);
      this._lookDragging = pointers.size > 0;
      clearTimeout(this._holdTimer);
      this._endHoldWalk();
      down = null;
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._zoomCamera(e.deltaY * 0.0012);
    }, { passive: false });

    // 가상 조이스틱
    const joy = $('#joystick'), knob = joy.querySelector('.joy-knob');
    let jid = null;
    const setJoy = (e) => {
      const r = joy.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(x, y);
      if (l > 1) {
        x /= l;
        y /= l;
      }
      this.joy = { x, z: y };
      const reach = r.width * 0.3; // 조이스틱 크기(116/96px)에 비례
      knob.style.transform = `translate(${x * reach}px, ${y * reach}px)`;
    };
    let jdown = null; // { t, far(앞으로 끝까지 민 시작 시각), moved }
    joy.addEventListener('pointerdown', (e) => {
      jid = e.pointerId;
      joy.setPointerCapture(jid);
      jdown = { t: performance.now(), far: null, moved: 0 };
      setJoy(e);
      this.sound.init();
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== jid) return;
      setJoy(e);
      jdown.moved = Math.max(jdown.moved, Math.hypot(this.joy.x, this.joy.z));
      if (this.autoWalk) {
        // 자동 걷기 중: 좌우만 방향(가운데 0.25 는 곧장), 아래로 당기면 멈춤
        if (this.joy.z > 0.35) this._setAutoWalk(false);
        else this.joy = { x: Math.abs(this.joy.x) < 0.25 ? 0 : this.joy.x, z: 0 };
        return;
      }
      // 앞으로 끝까지(위 80% 넘게, 좌우 45% 안) 밀어 AUTO_HOLD 초 버티면 자동 걷기
      const far = this.joy.z < -0.8 && Math.abs(this.joy.x) < 0.45;
      jdown.far = far ? jdown.far ?? performance.now() : null;
    });
    const jend = () => {
      const tap = jdown && performance.now() - jdown.t < 220 && jdown.moved < 0.3;
      if (this.autoWalk && tap) this._setAutoWalk(false); // 톡 누르면 멈춤
      jid = null;
      jdown = null;
      this.joy = { x: 0, z: 0 };
      knob.style.transform = this.autoWalk ? 'translate(0, -30%)' : '';
    };
    this._joyHeld = () => jdown && jdown.far != null && (performance.now() - jdown.far) / 1000 >= AUTO_HOLD;
    joy.addEventListener('pointerup', jend);
    joy.addEventListener('pointercancel', jend);
    this.fastWalk = createFastWalk(joy); // 빠르게 걷기 단추 (데스크톱은 Shift — _frame)
    $('#reply-btn')?.addEventListener('click', () => {
      this.sound.init();
      this._replyBow();
    });
  }

  /** 자동 걷기 켜기·끄기 (조이스틱에 표시) */
  _setAutoWalk(on) {
    if (!!this.autoWalk === on) return;
    this.autoWalk = on;
    this._autoStuck = 0;
    const joy = $('#joystick');
    joy?.classList.toggle('auto', on);
    if (!on && joy) joy.querySelector('.joy-knob').style.transform = '';
    if (on) {
      navigator.vibrate?.(15);
      if (!this._autoTold) {
        this._autoTold = true;
        this.toast('자동 걷기 · 조이스틱을 좌우로 밀면 방향, 아래로 당기거나 톡 누르면 멈춥니다');
      }
    }
  }

  /** 자동 걷기: 조이스틱을 앞으로 버티면 켜고, 막혀서 못 가거나 앉고·창이 열리면 끈다 */
  _autoWalkTick(dt, input) {
    if (!this.autoWalk && this._joyHeld?.()) this._setAutoWalk(true);
    if (!this.autoWalk) return;
    const pl = this.player;
    if (this._listening || this._blockingModal() || pl.sitting) return this._setAutoWalk(false);
    // 벽·난간에 막혀 1초 넘게 거의 못 가면 멈춘다
    this._autoStuck = input && !pl.busy && pl.speed < 0.3 ? (this._autoStuck || 0) + dt : 0;
    if (this._autoStuck > 1) this._setAutoWalk(false);
  }

  /** 눌렀다 끌어 걷기: 손가락 밑 바닥을 0.1초마다 다시 골라 그리로 걷는다 */
  _holdWalkTick(dt) {
    const h = this._holdWalk;
    if (!h) return;
    h.next -= dt;
    if (h.next > 0) return;
    h.next = 0.1;
    const hit = this.world.pick(h.x, h.y);
    const pt = hit?.point;
    if (!pt || !isWalkable(pt.x, pt.z)) return;
    const A = this.avatars;
    if (this.player.sitting) A.standUp();
    A.circling = null;
    A.moveTarget = { x: pt.x, z: pt.z };
    if (!h.mark || Math.hypot(h.mark.x - pt.x, h.mark.z - pt.z) > 0.8) {
      h.mark = { x: pt.x, z: pt.z };
      this.world.ripples.spawn(new THREE.Vector3(pt.x, walkHeight(pt.x, pt.z), pt.z), { color: '#f3ecdc', maxR: 0.5, life: 0.6 });
    }
  }

  _endHoldWalk() {
    if (!this._holdWalk) return;
    this._holdWalk = null;
    this.avatars.moveTarget = null; // 떼면 그 자리에 선다
  }

  _click(x, y) {
    this.sound.init();
    this._setAutoWalk(false);
    const hit = this.world.pick(x, y);
    if (!hit) return;
    if (hit.kind === 'lantern' && hit.id) return this.activate('wish_lantern', { lanternId: hit.id });
    if (hit.kind === 'cushion') return this._sitCushion(hit.index);
    const pt = hit.point;
    // 클릭한 곳 근처의 상호작용 대상
    let best = null, bd = Infinity;
    for (const it of this.temple.interactables) {
      if (it.cushion || it.id === 'wish_lantern' || it.id === 'circumambulate') continue;
      const d = Math.hypot(pt.x - it.pos.x, pt.z - it.pos.z);
      const reach = it.id === 'bell_strike' || it.id === 'wish_tile' ? 3.2 : it.id === 'tea_chat' ? 1.6 : 1.4;
      if (d < reach && d < bd && pt.y > it.pos.y - 0.5) {
        best = it;
        bd = d;
      }
    }
    if (best) return this.activate(best.id);
    if (Math.hypot(pt.x - L.pagoda.x, pt.z - L.pagoda.z) < 2 && pt.y > L.courtyard.y + 0.4) return this.activate('circumambulate');
    const rest = this.temple.trail.spots.find((s) => Math.hypot(pt.x - s.x, pt.z - s.z) < (s.kind === 'lookout' ? 1.6 : 1.1));
    if (rest) return this._sitRest(rest);
    const cn = findJoinable(this.temple.cairns.shown, pt.x, pt.z, 0.6);
    if (cn) {
      // 돌탑을 누르면 그 앞까지 걸어가 돌 올리기
      const p = this.player.root.position, d = Math.hypot(p.x - cn.x, p.z - cn.z) || 1;
      const ax = cn.x + ((p.x - cn.x) / d) * 0.9, az = cn.z + ((p.z - cn.z) / d) * 0.9;
      return this.avatars.moveTo(ax, az, () => {
        this.player.heading = Math.atan2(cn.x - ax, cn.z - az);
        this._stoneHere(cn);
      });
    }
    if (isWalkable(pt.x, pt.z)) {
      this.avatars.moveTo(pt.x, pt.z);
      this.world.ripples.spawn(new THREE.Vector3(pt.x, walkHeight(pt.x, pt.z), pt.z), { color: '#f3ecdc', maxR: 0.6, life: 0.7 });
    }
  }

  _findNearby() {
    const p = this.player.root.position;
    const zone = zoneAt(p.x, p.z);
    let best = null, bd = Infinity;
    for (const it of this.temple.interactables) {
      if (it.cushion) continue;
      if (it.zone !== zone) continue;
      const d = Math.hypot(p.x - it.pos.x, p.z - it.pos.z);
      if (d < it.radius && d < bd) {
        best = it;
        bd = d;
      }
    }
    // 쉼터에 앉아 있으면 그 자리에서 듣기 — 예불(E)과 자연의 소리(R) 알약 둘, 어느 쪽이든 한 번에
    if (!best && this.player.seat?.kind === 'rest') best = { id: 'yebul', label: '예불 듣기', alt: { id: 'nature', label: '자연의 소리 듣기' } };
    // 순환 산책로·서쪽 마당: 쉼터(1.4m 안), 숲길이면 없을 때 멈춰 선 자리의 돌탑
    if (!best && (zone === 'FOREST' || zone === 'COURTYARD') && !this.player.sitting) {
      for (const s of this.temple.trail.spots) {
        const d = Math.min(Math.hypot(p.x - s.stand.x, p.z - s.stand.z), Math.hypot(p.x - s.x, p.z - s.z));
        if (d < 1.4 && (!best || d < bd)) {
          best = { id: `rest:${s.id}`, label: s.label, spot: s };
          bd = d;
        }
      }
      if (!best && zone === 'FOREST') best = this._cairnPrompt(p);
    }
    // 좌복(1.1m 안)과 겨룰 때는 각자 닿는 거리에 견준 가까움으로 — 범위가 넓은 헌향이 앞줄 좌복을 덮지 않게
    if (zone === 'DAEUNGJEON' && !this.player.sitting) {
      const c = this.avatars.freeCushionNear(p.x, p.z);
      const dc = c ? Math.hypot(c.x - p.x, c.z - p.z) : Infinity;
      if (dc < 1.1 && (!best || dc / 1.1 < bd / best.radius)) best = { id: 'cushion', label: '좌복에 앉기', cushionIndex: c.index };
    }
    return best;
  }

  _markCairn(n, t) {
    const at = n?.id === 'stone_pagoda' ? this.temple.cairnPos
      : n?.id?.startsWith('cairn:') && n.id !== 'cairn:new' ? n.at : null;
    if (!at) { if (this._cairnMarker) this._cairnMarker.visible = false; return; }
    if (!this._cairnMarker) {
      const geometry = new THREE.RingGeometry(0.85, 1.05, 48);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({ color: '#f7d689', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
      this._cairnMarker = new THREE.Mesh(geometry, material);
      this.world.scene.add(this._cairnMarker);
    }
    this._cairnMarker.visible = true;
    this._cairnMarker.position.set(at.x, walkHeight(at.x, at.z) + 0.06, at.z);
    this._cairnMarker.material.opacity = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 0.55 + 0.2 * Math.sin(t * 3);
  }

  _activateNearby() {
    const n = this.nearby;
    if (!n) return;
    if (n.id === 'cushion') return this._sitCushion(n.cushionIndex);
    if (n.spot) return this._sitRest(n.spot);
    if (n.at) return this._stoneHere(n.at);
    this.activate(n.id);
  }

  /* ───────── 루프 ───────── */
  _startLoop() {
    if (this._loopRunning) return;
    this._loopRunning = true;
    this.clock.getDelta(); // 대문에 머문 시간을 첫 프레임의 경과 시간으로 세지 않는다
    this._loopRequest = requestAnimationFrame(() => this._loop());
  }

  _stopLoop() {
    this._loopRunning = false;
    if (this._loopRequest !== null) cancelAnimationFrame(this._loopRequest);
    this._loopRequest = null;
  }

  _loop() {
    if (!this._loopRunning) return;
    this._loopRequest = requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.1);
    try {
      this._frame(dt, this.clock.elapsedTime);
    } catch (error) {
      if (this._entryTransition) return this._entryFailed(error);
      throw error;
    }
    this._finishEntry(); // 실제 첫 렌더가 끝난 뒤에만 대문을 전환한다.
    if (PERF) this._perfHud();
  }

  /** 한 프레임 (테스트에서 dt 를 직접 넣어 돌릴 수 있게 분리) */
  _frame(dt, t) {

    // 이동 입력 (카메라 기준)
    let ix = 0, iz = 0;
    if (this.entered && !this._listening && !(this.modals.isOpen && !['practice_108', 'mala', 'tea_chat'].includes(this.modals.current))) {
      const k = this.keys;
      if (k.KeyW || k.ArrowUp) iz -= 1;
      if (k.KeyS || k.ArrowDown) iz += 1;
      if (k.KeyA || k.ArrowLeft) ix -= 1;
      if (k.KeyD || k.ArrowRight) ix += 1;
      if (this.autoWalk) {
        // 자동 걷기: 앞으로. 조이스틱 좌우는 방향 돌리기 (1인칭은 아래 돌아보기가, 3인칭은 카메라 방위를 돌린다)
        iz -= 1;
        if (this.world.cam.mode === 'first') ix += this.joy.x;
        else this.world.cam.yaw -= this.joy.x * AUTO_TURN * dt;
        if (this.player.busy || this.player.sitting) iz = 0; // 절하는 동안·앉으면 멈춰 서 있다 (자동 걷기는 그대로)
      } else {
        ix += this.joy.x;
        iz += this.joy.z;
      }
      if ((ix || iz) && this._teaScene) this.modals.current === 'tea_chat' ? this.modals.close() : this._leaveTea(); // 걸으면 찻자리에서 일어난다
      if ((ix || iz) && this._burnHold) this._endBurnHold(); // 걸으면 소각 구도·합장을 푼다
    }
    // 1인칭: 시선과 몸이 함께 돈다. 좌우 키·조이스틱·끌기는 돌아보기(게걸음 없음),
    // 걷기·탑돌이·좌복에 앉기처럼 몸이 스스로 돌면 시선도 따라 돈다. 앉아 있거나 걸어가는 중에 끌면 고개만 돌린다.
    const cam = this.world.cam, pl = this.player, A = this.avatars;
    const fp = this.entered && cam.mode === 'first' && (!this._listening || !!this._listening.rest); // 쉼터 예불 듣기는 1인칭 그대로 (끌어서 둘러보기)
    let face;
    if (fp) {
      this._fp ||= { off: wrapAngle(cam.yaw - (pl.heading - Math.PI)) };
      const lookTurn = cam.turn || 0;
      const bodyTurn = -ix * FP_TURN * dt;
      cam.turn = 0;
      ix = 0; // 돌아보기는 수행 창을 닫거나 자리에서 일으키지 않는다
      if (!pl.sitting && !pl.busy && !A.moveTarget && !A.circling) {
        pl.heading = wrapAngle(pl.heading + bodyTurn);
        pl.root.rotation.y = pl.heading;
        this._fp.off = wrapAngle(this._fp.off + lookTurn);
        if (!this._lookDragging && !lookTurn && !this._listening) this._fp.off *= Math.exp(-dt * 0.7);
      } else {
        this._fp.off = wrapAngle(this._fp.off + lookTurn + bodyTurn);
        // 탑돌이는 탑 쪽(오른쪽)으로 비스듬히, 걸어가는 중이면 둘러본 시선이 천천히 길 쪽으로 돌아온다
        if (A.circling) this._fp.off += (FP_CIRCLE_LOOK - this._fp.off) * (1 - Math.exp(-dt * 0.8));
        else if (A.moveTarget || (!this._lookDragging && !lookTurn && !this._listening)) this._fp.off *= Math.exp(-dt * 0.7);
      }
      face = pl.heading;
    } else {
      this._fp = null;
      cam.turn = 0;
    }
    // 3인칭: 탑돌이·눌러서 걸어가기 동안 카메라가 등 뒤로 천천히 따라 돈다 (키·조이스틱으로 걸을 때는 사용자가 방위를 쥔다)
    cam.follow = !fp && !this._listening && !this._holdWalk && (A.circling || A.moveTarget) && !ix && !iz ? pl.heading : null;
    this._holdWalkTick(dt);
    this._autoWalkTick(dt, ix || iz);
    const yaw = fp ? pl.heading - Math.PI + this._fp.off : cam.yaw;
    const wx = ix * Math.cos(yaw) + iz * Math.sin(yaw);
    const wz = -ix * Math.sin(yaw) + iz * Math.cos(yaw);
    if ((ix || iz) && this.modals.isOpen && ['practice_108', 'mala'].includes(this.modals.current)) this.modals.close();
    const night = this.world.env.night;
    const fast = !!(this.keys.ShiftLeft || this.keys.ShiftRight || this.fastWalk?.on); // 빠르게 걷기 (FAST_SPEED — 걷기의 2.5배)
    this.avatars.update(dt, t, { x: wx, z: wz, face, fast }, night);
    this.temple.cairns.update(dt, pl.root.position.x, pl.root.position.z);
    this._strollTick(dt);
    if (fp) cam.yaw = pl.root.rotation.y - Math.PI + this._fp.off;
    this.world.update(dt, t, this.player.root, this.player.items.hand_lantern);

    if (this._listening) this._listenTick(dt);
    if (this.entered) {
      this._positionSaveElapsed = (this._positionSaveElapsed || 0) + dt;
      if (this._positionSaveElapsed >= 2) { this._positionSaveElapsed = 0; this._rememberPosition(); }
      this._onZoneChange();
      this._promptTimer = (this._promptTimer || 0) + dt;
      if (this._promptTimer > 0.2) {
        this._promptTimer = 0;
        this._syncMiniMap();
        const n = this.modals.isOpen ? null : this._findNearby();
        this._markCairn(n, t);
        if (n?.id !== this.nearby?.id || n?.cushionIndex !== this.nearby?.cushionIndex) {
          this.nearby = n;
          $('#prompt').classList.toggle('hidden', !n);
          if (n) $('#prompt-text').textContent = n.label;
          $('#prompt-alt').classList.toggle('hidden', !n?.alt);
          if (n?.alt) $('#prompt-alt-text').textContent = n.alt.label;
        }
        $$('[data-gesture]').forEach((b) => b.classList.toggle('active', this.player.state === b.dataset.gesture || (b.dataset.gesture === 'rest' && this.player.seat?.kind === 'rest')));
        this._updateHUD();
      }
      const cam = this.world.camera;
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      this.sound.updateListener(cam.position, fwd);
      // 계절이 바뀌듯 소리도 시간대를 따라간다
      const ph = this.world.phase;
      if (ph !== this._phase) {
        this._phase = ph;
        this.sound.setTimeOfDay(ph);
      }
      this._adaptQuality();
      if (this.live) {
        const pl = this.player;
        if (pl.seq && pl.seq !== this._seqRef) {
          this._seqRef = pl.seq;
          this._actSeq = (this._actSeq || 0) + 1;
        }
        const p = pl.root.position;
        this.live.update({ x: p.x, y: p.y, z: p.z, ry: wrapAngle(pl.root.rotation.y), a: pl.seq?.name || wireState(pl.state) || 'idle', n: this._actSeq || 0 });
      }
    }
    this.world.render();
    if (this._captureRequested) {
      this._captureRequested = false;
      try {
        this.world.renderer.domElement.toBlob((blob) => {
          if (!blob) return this.toast('화면 사진을 저장하지 못했습니다.', 'bell-toast-stack');
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `소리사원-${new Date().toISOString().slice(0, 10)}.png`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          this.toast('산사의 풍경을 사진으로 저장했습니다.', 'bell-toast-stack');
        }, 'image/png');
      } catch { this.toast('화면 사진을 저장하지 못했습니다.', 'bell-toast-stack'); }
    }
  }

  /**
   * 화면 배율 자동 조절 (계속): 실제 프레임 간격 평균(구간 시간 ÷ 프레임 수 — 끊김이 묻히지 않게)이 ADAPT.slow 를 넘는 곳에서는 배율을 0.25 씩 내리고,
   * 넉넉한 곳에서 ADAPT.okFor 동안 ADAPT.ok 안이면 처음 배율까지 0.25 씩 되올린다. 바꾼 뒤 3초는 쉰다 (후처리 버퍼를 다시 잡으니).
   * 올린 지 10초 안에 다시 내려야 하면 1분은 올리지 않는다 — 오르내림이 되풀이되지 않게.
   */
  _adaptQuality() {
    const ADAPT = { slow: 22, ok: 17.5, slowFor: 2000, okFor: 6000, rest: 3000, step: 0.25, min: 1 };
    const now = performance.now();
    const A = (this._adapt ||= { last: now, start: this.world.pixelRatio, changedAt: now, raisedAt: -1e9, noRaiseUntil: 0, ts: [] });
    const gap = now - A.last;
    A.last = now;
    if (document.hidden || gap > 250 || now - this.enteredAt < 1500) return void (A.ts.length = 0); // 탭이 가려졌다 돌아온 틈은 뺀다
    A.ts.push(gap);
    if (A.ts.length > 900) A.ts.splice(0, A.ts.length - 900);
    const span = (ms) => { let t = 0, n = 0; for (let i = A.ts.length - 1; i >= 0 && t < ms; i--) (t += A.ts[i]), n++; return t >= ms ? A.ts.slice(-n) : null; };
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const recent = span(1000);
    if (recent) this.frameMs = avg(recent);
    if (now - A.changedAt < ADAPT.rest) return;
    const W = this.world, set = (pr) => {
      W.setPixelRatio(+pr.toFixed(2));
      A.changedAt = now;
      A.ts.length = 0;
      console.info(`[quality] frame ${this.frameMs?.toFixed(1)}ms → pixelRatio ${W.pixelRatio}`);
    };
    const slow = span(ADAPT.slowFor), ok = span(ADAPT.okFor);
    if (slow && avg(slow) > ADAPT.slow && W.pixelRatio > ADAPT.min) {
      if (now - A.raisedAt < 10000) A.noRaiseUntil = now + 60000;
      set(Math.max(ADAPT.min, W.pixelRatio - ADAPT.step));
    } else if (ok && avg(ok) < ADAPT.ok && W.pixelRatio < A.start && now > A.noRaiseUntil) {
      A.raisedAt = now;
      set(Math.min(A.start, W.pixelRatio + ADAPT.step));
    }
  }

  /** ?perf=1 — 폰에서 직접 볼 수 있는 성능 표: fps · 프레임 ms · 화면 배율 · 그리기 호출 · 삼각형 */
  _perfHud() {
    const R = this.world.renderer;
    if (!this._perfEl) {
      this._perfEl = document.createElement('div');
      this._perfEl.style.cssText = 'position:fixed;left:8px;top:calc(env(safe-area-inset-top) + 64px);z-index:99;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.62);color:#e8f3dc;font:12px/1.45 ui-monospace,monospace;pointer-events:none;white-space:pre';
      document.body.appendChild(this._perfEl);
      R.info.autoReset = false;
      this._perfAt = performance.now();
      this._perfN = 0;
    }
    const info = R.info.render, calls = info.calls, tris = info.triangles;
    R.info.reset();
    this._perfN++;
    const now = performance.now();
    if (now - this._perfAt < 500) return;
    const fps = (this._perfN * 1000) / (now - this._perfAt);
    this._perfAt = now;
    this._perfN = 0;
    this._perfEl.textContent = `${fps.toFixed(0)} fps · ${this.frameMs?.toFixed(1) ?? '-'} ms\npr ${this.world.pixelRatio} (${this.quality})\n${calls} calls · ${Math.round(tris / 1000)}k tri`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.temple = new MetaTempleApp();
});
