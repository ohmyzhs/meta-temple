/**
 * 청연산사 — 앱 진입점.
 * 입장 화면 → 월드 생성 → HUD·입력·신행 활동 연결 → 메인 루프.
 */
import * as THREE from 'three';
import { ZONES, RITUALS, generateDharmaName } from './data/templeData.js';
import { TempleStore, kstHour } from './core/state.js';
import { TempleSoundEngine } from './audio/soundEngine.js';
import { TempleScene } from './world/templeScene.js';
import { AvatarManager } from './world/avatarManager.js';
import { L, isWalkable, zoneAt, streamZ, walkHeight } from './world/layout.js';
import { ModalManager } from './ui/modalManager.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function detectQuality() {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low' || q === 'high') return q;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const weak = (navigator.deviceMemory && navigator.deviceMemory < 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  return (coarse && small) || weak ? 'low' : 'high';
}

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
    this.clock = new THREE.Clock();
    this.frameTimes = [];
    this._initIntro();
    this._boot();
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
    $('#intro-rename').addEventListener('click', () => {
      const n = generateDharmaName(p.dharmaName);
      this.store.setDharmaName(n);
      $('#intro-dharma-name').textContent = n;
      this.avatars?.player.setName(n);
    });
    $('#intro-enter').addEventListener('click', () => this._enter());
  }

  async _boot() {
    const container = $('#scene');
    try {
      this.world = new TempleScene(container, {
        quality: this.quality,
        onProgress: (p, label) => {
          $('#intro-progress').style.width = `${Math.round(p * 100)}%`;
          $('#intro-loading-text').textContent = label;
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
      console.error(e);
      $('#intro-loading-text').textContent = '이 브라우저에서는 3D 산사를 열 수 없습니다 (WebGL 필요).';
      return;
    }
    const temple = this.world.temple;
    this.temple = temple;
    this.avatars = new AvatarManager(this.world.scene, temple, {
      onStep: (surface) => this.sound.playFootstep(surface),
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
      onStandUp: () => this.world.setFocusVignette(false)
    });
    this._rebuildPlayer();
    this.avatars.spawnAmbientVisitors();
    temple.lanterns.sync(this.store.state.lanterns);
    await this._brushFont(this.store.state.tiles.map((t) => t.wish).join(''));
    temple.tileRack.sync(this.store.state.tiles);
    temple.cairn.sync(this.store.state.stones.length);

    const s = this.store.state.settings;
    this.world.setTimeOfDay(s.time || 'realtime');
    this.world.hour = this.world.hourTarget;
    this.world.setWeather(s.weather || 'clear');
    this.world.applyEnv(true);

    this.modals = new ModalManager(this.store, this._modalCallbacks(), this.sound);
    this._bindHUD();
    this._bindInput();
    this._syncChips();
    this._updateHUD();
    $('#intro-loading').classList.add('done');
    $('#intro-enter').disabled = false;
    // 입장 전에도 산사 풍경이 뒤에 보이도록 렌더 시작
    this.world.cam.yaw = 0;
    this.world.cam.pitch = 0.22;
    this.world.cam.targetDist = this.world.cam.dist = 9;
    this._loop();
    setInterval(() => this._checkYebul(), 20000);
  }

  /** 붓글씨 서체는 글자 구간별로 내려받으므로, 캔버스에 쓰기 전에 그 글자들을 받아 둔다 */
  _brushFont(text) {
    return Promise.race([document.fonts.load('26px "Nanum Brush Script"', text || '가'), new Promise((r) => setTimeout(r, 2000))]).catch(() => {});
  }

  _rebuildPlayer() {
    const p = this.store.profile;
    const items = Object.fromEntries(['wooden_mala', 'jade_mala', 'hand_lantern'].map((k) => [k, this.store.has(k)]));
    this.player = this.avatars.initPlayer(p.avatarStyle, p.dharmaName, items, L.spawn, Math.PI);
    this.player.restState = null;
  }

  _enter() {
    if (this.entered) return;
    this.entered = true;
    this.sound.init();
    this.sound.setEmitters(this._emitters());
    this.sound.loadRecordings('./assets/audio/'); // 실제 녹음 — 받는 동안은 합성음
    this.sound.setWeather(this.world.weatherName);
    this.sound.setTimeOfDay(this.world.phase);
    $('#intro').classList.add('leaving');
    setTimeout(() => $('#intro').classList.add('hidden'), 1500);
    $('#hud').classList.remove('hidden');
    this._syncSoundButton();
    const { streak, isNewDay } = this.store.checkIn();
    this._applyItems();
    setTimeout(() => {
      this.toast('산문에 들어섰습니다. 천천히 걸어 보세요 · WASD 또는 바닥을 눌러 이동');
      if (isNewDay && streak > 1) setTimeout(() => this.toast(`🍃 ${streak}일째 이어진 발걸음입니다`), 2600);
    }, 900);
    this.zone = null;
    this.enteredAt = performance.now();
  }

  _emitters() {
    const stream = [];
    for (let x = -36; x <= 36; x += 6) stream.push({ x, y: -0.4, z: streamZ(x) });
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
      chant: { x: 0, y: h.floorY + 1.4, z: -26 },
      brazier: { x: L.brazier.x, y: 2, z: L.brazier.z },
      kettle: { x: L.teahouse.x - L.teahouse.halfW - 0.9, y: 2, z: L.teahouse.z + 0.75 },
      bamboo: { x: 34, y: 4, z: -12 },
      bell: { x: L.bell.x, y: 4, z: L.bell.z },
      pond: { x: L.pond.x, y: L.pond.waterY + 0.3, z: L.pond.z }
    };
  }

  /* ───────── 신행 콜백 ───────── */
  _modalCallbacks() {
    return {
      onAddLantern: (wish, color) => {
        const res = this.store.addLantern(wish, color);
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
        return ok;
      },
      onAddTile: (wish) => {
        const t = this.store.addTile(wish);
        this._brushFont(wish).then(() => this.temple.tileRack.sync(this.store.state.tiles));
        this._updateHUD();
        this.toast('🀫 기와에 새긴 서원이 불사대에 봉안되었습니다');
        return t;
      },
      onAddStone: (wish) => {
        const s = this.store.addStone(wish);
        this.temple.cairn.addStone(() => this.sound.playStoneDrop());
        this._updateHUD();
        this.toast(`⛰️ 돌탑에 조약돌 하나를 얹었습니다 · 지금까지 ${this.store.state.stones.length}개`);
        return s;
      },
      onBurnWorry: () => {
        // 내용은 받지 않는다 — 저장·전송하지 않음
        this.temple.flareBrazier();
        this.sound.playFireWhoosh();
      },
      onBow: () => this._doProstration(true),
      onMala: () => {
        const unlocked = this.store.addStat('malaCount');
        this.sound.playBeadClick();
        this._afterUnlock(unlocked);
        this._updateHUD();
      },
      onSutraComplete: () => {
        const unlocked = this.store.addStat('sutraCopiedCount');
        this.sound.playBell(0.6);
        this._afterUnlock(unlocked);
        this._updateHUD();
      },
      onTeaTurn: () => {
        this.store.addStat('teaChats');
        this.temple.teaSteam.userData.uniforms.uIntensity.value = 1;
      },
      onDharmaCard: (card) => {
        this.store.keepDharmaCard(card);
        this.sound.playChukbi();
      },
      onRename: () => {
        const n = generateDharmaName(this.store.profile.dharmaName);
        this.store.setDharmaName(n);
        this.player.setName(n);
        this._updateHUD();
        return n;
      },
      onYebul: () => {
        if (this.player.state !== 'meditate') this.gesture('meditate');
      },
      onPracticeEnd: () => {
        this.avatars.standUp();
        this.world.setFocusVignette(false);
      }
    };
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
    if (fromPractice && pl.seat) pl.sitting = true;
    setTimeout(() => this.sound.playMoktak(), 1400);
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
    if (!sameZone) {
      // 다른 구역이면 순간 이동(가람 이동과 같은 방식)
      this.avatars.teleport(a.x, a.z, a.ry);
      this._onZoneChange(true);
      return setTimeout(run, 250);
    }
    this.avatars.moveTo(a.x, a.z, run);
  }

  activate(id, payload) {
    this.sound.init();
    const def = this._interactable(id);
    switch (id) {
      case 'stone_pagoda':
      case 'wish_tile':
      case 'burn_worry':
      case 'dharma_card':
        return this._goAndDo(def, () => this.modals.open(id));
      case 'wish_lantern':
        return this.modals.open('wish_lantern', payload);
      case 'bell_strike':
        return this._goAndDo(def, () => this._strikeBell());
      case 'circumambulate':
        if (zoneAt(this.player.root.position.x, this.player.root.position.z) !== 'COURTYARD') {
          this.avatars.teleport(0, 1.5, Math.PI);
        }
        this.avatars.triggerAction('circumambulate');
        return this.toast('🙏 두 손을 모으고 석탑을 오른쪽으로 돕니다 · 움직이면 멈춥니다');
      case 'incense':
        return this._goAndDo(def, () => this._offerIncense());
      case 'practice_108':
        return this._sitCushion(payload?.cushion, payload?.mode || 'prostrate');
      case 'sutra_copy':
        return this._goAndDo(def, () => {
          const s = this.temple.sutraSeat;
          this.avatars.sitAt({ ...s, standAt: { x: s.x, z: s.z + 1.0 } }, 'sit');
          this.player.restState = null;
          this.modals.open('sutra_copy');
        });
      case 'tea_chat':
        return this._goAndDo(def, () => this._sitTea());
      case 'yebul':
        return this.modals.open('yebul');
    }
  }

  _strikeBell() {
    const pos = new THREE.Vector3(L.bell.x, L.courtyard.y, L.bell.z);
    this.temple.strikeBell(() => {
      this.sound.playBell(1);
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
      this.sound.playMoktak();
    }, 1400);
    this.store.addStat('incenseCount');
    this.toast('🕯️ 불단 앞에 향 한 대와 초 한 자루를 공손히 올립니다');
  }

  _sitCushion(index, mode) {
    const p = this.player.root.position;
    let c = index != null ? this.temple.cushions[index] : this.avatars.freeCushionNear(p.x, p.z);
    if (!c) return;
    if (c.occupant && c.occupant !== this.player) {
      this.toast('다른 도반이 앉아 있는 좌복입니다. 빈 좌복을 골라 주세요');
      return;
    }
    const seat = this.avatars.cushionSeat(c); // 전개(...)하면 occupant setter 가 사라진다
    seat.kind = 'cushion';
    const go = () => {
      this.avatars.sitAt(seat, mode === 'mala' ? 'meditate' : 'idle');
      this.player.restState = mode === 'mala' ? 'meditate' : 'idle';
      if (mode !== 'mala') this.player.setState('idle');
      this.world.setFocusVignette(mode === 'mala');
      this.modals.open('practice_108', { mode });
    };
    if (zoneAt(p.x, p.z) !== 'DAEUNGJEON') {
      this.avatars.teleport(c.x, c.z + 0.8, Math.PI);
      this._onZoneChange(true);
      return setTimeout(go, 200);
    }
    this.avatars.moveTo(c.x, c.z + 0.75, go);
  }

  _sitTea() {
    const s = L.teaSeat;
    const def = this._interactable('tea_chat');
    this.avatars.sitAt({ x: s.x, y: s.y, z: s.z, ry: Math.PI / 2, standAt: { x: def.approach.x, z: def.approach.z } }, 'sit');
    this.player.restState = null;
    const monk = this.avatars.teaMonk;
    monk.restState = 'sit';
    monk.play('incense'); // 두 손으로 찻잔을 건네는 몸짓
    setTimeout(() => {
      this.sound.playTeaPour();
      this.temple.teaSteam.userData.uniforms.uIntensity.value = 1;
    }, 900);
    setTimeout(() => this.player.setState('tea'), 2400);
    this.modals.open('tea_chat');
  }

  /* ───────── 동작 6종 ───────── */
  gesture(name) {
    this.sound.init();
    const p = this.player.root.position;
    const zone = zoneAt(p.x, p.z);
    switch (name) {
      case 'bow_half': {
        const d = this.avatars.triggerAction('bow_half');
        if (d) {
          this.world.ripples.spawn(p, { maxR: 3.2, life: 2 });
          setTimeout(() => this.sound.playWindChime(0.9), 700);
        }
        break;
      }
      case 'prostrate':
        if (this._doProstration(false)) this.toast('🙇 두 무릎을 꿇고 이마를 바닥에 대어 절을 올립니다');
        break;
      case 'meditate': {
        const pl = this.player;
        if (pl.state === 'meditate') {
          // 가부좌 중에는 한 번 누를 때마다 염주 한 알
          this._modalCallbacks().onMala();
          break;
        }
        this.avatars.triggerAction('meditate');
        pl.restState = 'meditate';
        this.world.setFocusVignette(true);
        this.toast('📿 가부좌로 앉아 숨을 고릅니다 · 3을 다시 누르면 염주 한 알');
        break;
      }
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
  toast(msg) {
    const stack = $('#toast-stack');
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
    $('#hud-dharma-name').textContent = p.dharmaName;
    $('#hud-merit-summary').textContent = `절 ${s.bowCount}배 · 염주 ${s.malaCount}알 · 연등 ${s.lanternCount}등`;
    if (this.avatars) $('#hud-presence').textContent = `도반 ${this.avatars.presenceCount}명 말없이 동석 중`;
  }

  _onZoneChange(force = false) {
    const p = this.player.root.position;
    const z = zoneAt(p.x, p.z);
    if (z === this.zone && !force) return;
    this.zone = z;
    const info = ZONES[z];
    $('#hud-zone-index').textContent = info.index;
    $('#hud-zone-name').textContent = info.name;
    $('#hud-zone-subtitle').textContent = info.subtitle;
    $$('[data-goto-zone]').forEach((b) => b.classList.toggle('active', b.dataset.gotoZone === z));
    const bar = $('#ritual-bar');
    bar.innerHTML = '';
    info.rituals.forEach((id, i) => {
      const r = RITUALS[id];
      const b = document.createElement('button');
      b.className = 'ritual';
      b.style.animationDelay = `${i * 60}ms`;
      b.innerHTML = `<span>${r.icon}</span><span>${r.label}</span>`;
      b.addEventListener('click', () => this.activate(id));
      bar.appendChild(b);
    });
    if (this.entered) this.sound.setZone(z);
    if (z !== 'DAEUNGJEON') this.sound.stopTrack(); // 예불 듣기는 법당 안에서만
  }

  _syncChips() {
    const s = this.store.state.settings;
    $$('[data-time]').forEach((b) => b.classList.toggle('active', b.dataset.time === (s.time || 'realtime')));
    $$('[data-weather]').forEach((b) => b.classList.toggle('active', b.dataset.weather === (s.weather || 'clear')));
    $$('#pop-self [data-avatar]').forEach((b) => b.classList.toggle('active', b.dataset.avatar === this.store.profile.avatarStyle));
    $$('[data-camera]').forEach((b) => b.classList.toggle('active', b.dataset.camera === this.world.cam.mode));
    const v = s.volumes;
    ['nature', 'temple', 'sfx'].forEach((ch) => ($(`#vol-${ch}`).value = v[ch]));
    const h = kstHour();
    $('#realtime-note').textContent = `실시간: 지금 한국 시각 ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}에 맞춰 하늘이 바뀝니다. 매일 05시·18시에 예불 종이 울립니다.`;
  }

  _syncSoundButton() {
    const on = this.sound.isEnabled;
    $('#audio-toggle-btn').textContent = on ? '끄기' : '켜기';
    $('#audio-toggle-btn').classList.toggle('active', on);
    $('#sound-tool').classList.toggle('muted', !on);
  }

  _bindHUD() {
    // 팝오버
    const closePops = (except) => {
      $$('.popover').forEach((p) => p !== except && p.classList.add('hidden'));
      $$('[data-pop]').forEach((b) => b.classList.toggle('active', except && b.dataset.pop === except.id));
    };
    $$('[data-pop]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const pop = $('#' + b.dataset.pop);
        const open = pop.classList.contains('hidden');
        closePops(open ? pop : null);
        if (open) {
          pop.classList.remove('hidden');
          this._syncChips();
        }
        this.sound.playUIClick();
      })
    );
    $$('.popover').forEach((p) => p.addEventListener('pointerdown', (e) => e.stopPropagation()));
    document.addEventListener('pointerdown', () => closePops(null));

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
    $$('#pop-self [data-avatar]').forEach((b) =>
      b.addEventListener('click', () => {
        this.store.setAvatarStyle(b.dataset.avatar);
        this._rebuildPlayer();
        this._applyItems();
        this._syncChips();
      })
    );
    $$('[data-camera]').forEach((b) =>
      b.addEventListener('click', () => {
        this.world.toggleCameraMode(b.dataset.camera);
        this._syncChips();
      })
    );
    $('#audio-toggle-btn').addEventListener('click', () => {
      if (!this.sound.isEnabled && !this._soundStarted) this.sound.init();
      else this.sound.toggleAudio();
      this._soundStarted = true;
      this._syncSoundButton();
    });
    ['nature', 'temple', 'sfx'].forEach((ch) =>
      $(`#vol-${ch}`).addEventListener('input', (e) => {
        const v = Number(e.target.value);
        this.sound.setChannelVolume(ch, v);
        this.store.setSetting('volumes', { ...this.store.state.settings.volumes, [ch]: v });
      })
    );
    $('#record-btn').addEventListener('click', () => this.modals.open('profile'));
    $('#help-btn').addEventListener('click', () => this.modals.open('help'));
    const setPlaque = (collapsed) => {
      $('#hud-plaque').classList.toggle('collapsed', collapsed);
      $('#plaque-toggle').setAttribute('aria-expanded', String(!collapsed));
    };
    let plaqueByUser = false;
    $('#plaque-toggle').addEventListener('click', () => {
      plaqueByUser = true;
      setPlaque(!$('#hud-plaque').classList.contains('collapsed'));
    });
    // 좁거나 낮은 화면(폰 세로·가로)은 현판을 접어 둔다. 회전·폴드로 크기가 바뀌면 따라가되, 직접 접고 편 뒤에는 그대로 둔다.
    const smallQ = matchMedia('(max-width: 599px), (max-height: 519px)');
    setPlaque(smallQ.matches);
    smallQ.addEventListener('change', (e) => !plaqueByUser && setPlaque(e.matches));
    // 중간 너비에서 토스트를 하단 버튼 줄 바로 위에 띄우기 위한 높이
    new ResizeObserver(([e]) => document.documentElement.style.setProperty('--actions-h', `${Math.round(e.contentRect.height)}px`)).observe($('.hud-actions'));

    $$('[data-goto-zone]').forEach((b) =>
      b.addEventListener('click', () => {
        const z = ZONES[b.dataset.gotoZone];
        this.sound.init();
        this.avatars.teleport(z.spawn.x, z.spawn.z, z.spawn.ry);
        this.world.cam.yaw = z.spawn.ry - Math.PI;
        this._onZoneChange(true);
        this.toast(`📍 ${z.name}(으)로 발걸음을 옮겼습니다`);
      })
    );
    $$('[data-gesture]').forEach((b) => b.addEventListener('click', () => this.gesture(b.dataset.gesture)));
    $('#prompt').addEventListener('click', () => this.nearby && this._activateNearby());
  }

  /* ───────── 입력 ───────── */
  _bindInput() {
    const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    window.addEventListener('keydown', (e) => {
      if (typing() || !this.entered) return;
      if (this.modals.isOpen && !this.modals.current?.match(/practice_108|tea_chat/)) return;
      this.keys[e.code] = true;
      const k = e.key;
      // 108배 패널이 열려 있으면 절·염주는 패널이 센다 (오늘 횟수가 어긋나지 않게)
      if (this.modals.isOpen && this.modals.current === 'practice_108' && (k === ' ' || e.code === 'Space' || k === '2' || k === '3')) return;
      if (['1', '2', '3', '4', '5', '6'].includes(k)) {
        this.gesture(['bow_half', 'prostrate', 'meditate', 'incense', 'circumambulate', 'tea'][Number(k) - 1]);
      }
      if (e.code === 'KeyV') {
        this.world.toggleCameraMode();
        this._syncChips();
      }
      if (e.code === 'KeyE' && this.nearby) this._activateNearby();
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => (this.keys[e.code] = false));
    window.addEventListener('blur', () => (this.keys = {}));

    const el = this.world.renderer.domElement;
    const pointers = new Map();
    let down = null, pinch = 0;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      if (pointers.size === 2) {
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
        if (pinch) this.world.zoom((pinch - d) * 0.006);
        pinch = d;
        return;
      }
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      if (!down || down.moved > 5) this.world.orbit(dx, dy);
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (down && down.moved <= 6 && performance.now() - down.t < 450 && this.entered) this._click(e.clientX, e.clientY);
      down = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', (e) => {
      pointers.delete(e.pointerId);
      down = null;
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.world.zoom(e.deltaY * 0.0012);
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
    joy.addEventListener('pointerdown', (e) => {
      jid = e.pointerId;
      joy.setPointerCapture(jid);
      setJoy(e);
      this.sound.init();
    });
    joy.addEventListener('pointermove', (e) => e.pointerId === jid && setJoy(e));
    const jend = () => {
      jid = null;
      this.joy = { x: 0, z: 0 };
      knob.style.transform = '';
    };
    joy.addEventListener('pointerup', jend);
    joy.addEventListener('pointercancel', jend);
  }

  _click(x, y) {
    this.sound.init();
    const hit = this.world.pick(x, y);
    if (!hit) return;
    if (hit.kind === 'lantern' && hit.id) return this.activate('wish_lantern', { lanternId: hit.id });
    if (hit.kind === 'cushion') return this._sitCushion(hit.index, 'prostrate');
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
    if (!best && zone === 'DAEUNGJEON' && !this.player.sitting) {
      const c = this.avatars.freeCushionNear(p.x, p.z);
      if (c && Math.hypot(c.x - p.x, c.z - p.z) < 1.1) best = { id: 'practice_108', label: '좌복에 앉기 · 108배 · 염주', cushionIndex: c.index };
    }
    return best;
  }

  _activateNearby() {
    const n = this.nearby;
    if (!n) return;
    if (n.id === 'practice_108') return this._sitCushion(n.cushionIndex, 'prostrate');
    this.activate(n.id);
  }

  /* ───────── 루프 ───────── */
  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this._frame(dt, this.clock.elapsedTime);
  }

  /** 한 프레임 (테스트에서 dt 를 직접 넣어 돌릴 수 있게 분리) */
  _frame(dt, t) {

    // 이동 입력 (카메라 기준)
    let ix = 0, iz = 0;
    if (this.entered && !(this.modals.isOpen && !['practice_108', 'tea_chat'].includes(this.modals.current))) {
      const k = this.keys;
      if (k.KeyW || k.ArrowUp) iz -= 1;
      if (k.KeyS || k.ArrowDown) iz += 1;
      if (k.KeyA || k.ArrowLeft) ix -= 1;
      if (k.KeyD || k.ArrowRight) ix += 1;
      ix += this.joy.x;
      iz += this.joy.z;
    }
    const yaw = this.world.cam.yaw;
    const wx = ix * Math.cos(yaw) + iz * Math.sin(yaw);
    const wz = -ix * Math.sin(yaw) + iz * Math.cos(yaw);
    if ((ix || iz) && this.modals.isOpen && this.modals.current === 'practice_108') this.modals.close();
    const night = this.world.env.night;
    this.avatars.update(dt, t, { x: wx, z: wz, run: this.keys.ShiftLeft || this.keys.ShiftRight }, night);
    this.world.update(dt, t, this.player.root, this.player.items.hand_lantern);

    if (this.entered) {
      this._onZoneChange();
      this._promptTimer = (this._promptTimer || 0) + dt;
      if (this._promptTimer > 0.2) {
        this._promptTimer = 0;
        const n = this.modals.isOpen ? null : this._findNearby();
        if (n?.id !== this.nearby?.id) {
          this.nearby = n;
          $('#prompt').classList.toggle('hidden', !n);
          if (n) $('#prompt-text').textContent = n.label;
        }
        $$('[data-gesture]').forEach((b) => b.classList.toggle('active', this.player.state === b.dataset.gesture || (b.dataset.gesture === 'meditate' && this.player.state === 'meditate')));
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
      this._adaptQuality(dt);
    }
    this.world.render();
  }

  /** 첫 5초 프레임 시간을 재서 너무 무거우면 해상도를 낮춘다 */
  _adaptQuality(dt) {
    if (this._adapted) return;
    const since = performance.now() - this.enteredAt;
    if (since < 1500) return;
    if (document.hidden) return;
    this.frameTimes.push(dt);
    // 탭이 가려져 프레임이 멈췄던 구간은 표본이 모자라므로 더 모은다
    if (since < 6500 || this.frameTimes.length < 90) return;
    this._adapted = true;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)] * 1000;
    this.medianFrameMs = med;
    if (med > 30 && this.world.pixelRatio > 1) {
      this.world.setPixelRatio(Math.max(1, this.world.pixelRatio - 0.35));
      console.info(`[quality] median ${med.toFixed(1)}ms → pixelRatio ${this.world.pixelRatio}`);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.temple = new MetaTempleApp();
});
