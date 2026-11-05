import * as THREE from 'three';
import {
  ZONES,
  INITIAL_LANTERNS,
  INITIAL_TILES,
  INITIAL_STONES,
  generateDharmaName
} from './data/templeData.js';
import { TempleSoundEngine } from './audio/soundEngine.js';
import { TempleScene } from './world/templeScene.js';
import { AvatarManager } from './world/avatarManager.js';
import { ModalManager } from './ui/modalManager.js';

const STORAGE_KEY = 'meta_temple_cheongyeon_state_v1';

class MetaTempleApp {
  constructor() {
    this.store = this._loadOrInitState();
    this.keyState = {};
    this.currentZone = ZONES.FOREST;

    // 1. 사운드 엔진 초기화
    this.soundEngine = new TempleSoundEngine();

    // 2. 3D 씬 및 월드 초기화
    const container = document.getElementById('canvas-container');
    this.templeScene = new TempleScene(container, {
      onGroundClick: (point) => this._handleGroundClick(point),
      onObjectClick: (type, data) => this._handleObjectClick(type, data)
    });

    // 3. 아바타 & 침묵 동석 참배객 초기화
    this.avatarManager = new AvatarManager(this.templeScene.scene, (msg) =>
      this.showToast(msg)
    );
    this.playerGroup = this.avatarManager.initPlayer(
      this.store.profile.avatarStyle,
      this.store.profile.stats,
      { x: 0, y: 0, z: 24 }
    );
    this.avatarManager.spawnAmbientVisitors();

    // 4. 연등 동기화
    this.templeScene.syncLanterns(this.store.lanterns);

    // 5. 모달 매니저 초기화
    this.modalManager = new ModalManager(this.store, {
      onAddLantern: (wishText, color) => this._addLantern(wishText, color),
      onEmpathizeLantern: (id) => this._empathizeLantern(id),
      onAddTile: (wishText) => this._addTile(wishText),
      onAddStone: (wishText) => this._addStone(wishText),
      onBurnWorry: () => this._burnWorry(),
      onPerformBow: () => this._performBow(),
      onRollMala: () => this._rollMala(),
      onCompleteSutra: () => this._completeSutra(),
      onTeaChatTurn: () => this._recordTeaChat(),
      onDrawDharmaCard: () => this.soundEngine.playWindChime(0.15)
    });

    this._bindUIEvents();
    this._updateProfileHUD();
    this._startMainLoop();
  }

  _loadOrInitState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.profile) return parsed;
      }
    } catch (e) {
      console.warn('LocalStorage load fallback:', e);
    }

    const initial = {
      profile: {
        dharmaName: generateDharmaName(),
        avatarStyle: 'monk',
        stats: {
          bowCount: 0,
          malaCount: 0,
          lanternCount: 0,
          tileCount: 0,
          stoneCount: 0,
          sutraCopiedCount: 0
        }
      },
      lanterns: [...INITIAL_LANTERNS],
      tiles: [...INITIAL_TILES],
      stones: [...INITIAL_STONES]
    };
    this._saveState(initial);
    return initial;
  }

  _saveState(state = this.store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  _handleGroundClick(point) {
    this.soundEngine.init();
    this.avatarManager.moveTo(point);
  }

  _handleObjectClick(type, data) {
    this.soundEngine.init();

    if (type === 'bell_strike') {
      this.soundEngine.playTempleBell();
      this.templeScene.triggerBellStrikeVisual();
      this.showToast('🔔 청동 범종의 묵직한 울림이 산사 전체에 퍼져 나갑니다.');
      return;
    }

    if (type === 'incense') {
      this.avatarManager.triggerAction('incense', this.soundEngine);
      this.showToast('🕯️ 불단 앞에 마음의 향과 촛불을 공손히 올렸습니다.');
      return;
    }

    if (type === 'circumambulate') {
      this.avatarManager.triggerAction('circumambulate', this.soundEngine);
      this.showToast('🙏 두 손을 모으고 천년 삼층석탑 주위를 천천히 탑돌이합니다.');
      return;
    }

    this.modalManager.open(type, data);
  }

  _addLantern(wishText, color) {
    const idx = this.store.lanterns.length;
    const col = (idx % 5) - 2;
    const row = Math.floor(idx / 5);
    const newLantern = {
      id: `lantern_${Date.now()}`,
      author: this.store.profile.dharmaName,
      color,
      wish: wishText,
      empathy: 1,
      pos: {
        x: col * 2.2 + (Math.random() - 0.5) * 0.4,
        y: 4.85 + Math.random() * 0.3,
        z: -3.5 - row * 2.6
      }
    };

    this.store.lanterns.push(newLantern);
    this.store.profile.stats.lanternCount += 1;
    this._saveState();

    this.templeScene.syncLanterns(this.store.lanterns);
    this.avatarManager.updatePlayerMeritVisuals(this.store.profile.stats);
    this._updateProfileHUD();
    this.soundEngine.playWindChime(0.18);
    this.showToast('🏮 마당 하늘에 나의 소원 연등이 따뜻하게 밝혀졌습니다.');
  }

  _empathizeLantern(id) {
    const target = this.store.lanterns.find((l) => l.id === id);
    if (target) {
      target.empathy = (target.empathy || 0) + 1;
      this._saveState();
      this.soundEngine.playWindChime(0.12);
    }
  }

  _addTile(wishText) {
    this.store.tiles.push({
      id: `tile_${Date.now()}`,
      author: this.store.profile.dharmaName,
      wish: wishText,
      date: '2026.11.05'
    });
    this.store.profile.stats.tileCount += 1;
    this._saveState();
    this._updateProfileHUD();
    this.soundEngine.playBeadClick();
    this.showToast('🪨 천년 기와에 도반의 서원이 정성껏 각인되었습니다.');
  }

  _addStone(wishText) {
    this.store.stones.push({
      author: this.store.profile.dharmaName,
      wish: wishText,
      date: '방금 전'
    });
    this.store.profile.stats.stoneCount += 1;
    this._saveState();
    this.templeScene.addStoneToPagoda();
    this._updateProfileHUD();
    this.soundEngine.playBeadClick();
    this.showToast('🪨 숲길 소원 돌탑 꼭대기에 조약돌 하나를 얹었습니다.');
  }

  _burnWorry() {
    this.soundEngine.playFireWhoosh();
    this.templeScene.triggerBrazierFlare();
  }

  _performBow() {
    this.store.profile.stats.bowCount += 1;
    this._saveState();
    this.avatarManager.triggerAction('prostrate', this.soundEngine);
    this.avatarManager.updatePlayerMeritVisuals(this.store.profile.stats);
    this._updateProfileHUD();
  }

  _rollMala() {
    this.store.profile.stats.malaCount += 1;
    this._saveState();
    this.avatarManager.triggerAction('meditate', this.soundEngine);
    this.avatarManager.updatePlayerMeritVisuals(this.store.profile.stats);
    this._updateProfileHUD();
  }

  _completeSutra() {
    this.store.profile.stats.sutraCopiedCount += 1;
    this._saveState();
    this.avatarManager.updatePlayerMeritVisuals(this.store.profile.stats);
    this._updateProfileHUD();
    this.soundEngine.playTempleBell();
    this.showToast('🖌️ 경전 사경 공덕으로 야간 손연등이 밝혀졌습니다.');
  }

  _recordTeaChat() {
    this.avatarManager.triggerAction('tea', this.soundEngine);
  }

  _updateProfileHUD() {
    const nameEl = document.getElementById('hud-dharma-name');
    const meritEl = document.getElementById('hud-merit-summary');
    const s = this.store.profile.stats;
    if (nameEl) nameEl.textContent = `법명: ${this.store.profile.dharmaName}`;
    if (meritEl) {
      meritEl.textContent = `절 ${s.bowCount}배 · 염주 ${s.malaCount}알 · 연등 ${s.lanternCount}등`;
    }
  }

  showToast(message) {
    const toast = document.getElementById('toast-banner');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 3400);
  }

  _bindUIEvents() {
    // 1. 오디오 토글 및 3채널 슬라이더
    const audioBtn = document.getElementById('audio-toggle-btn');
    audioBtn?.addEventListener('click', () => {
      const on = this.soundEngine.toggleAudio();
      audioBtn.textContent = on ? '🔊 산사 ASMR 켜짐' : '🔇 ASMR 음소거';
    });

    ['nature', 'temple', 'sfx'].forEach((ch) => {
      const slider = document.getElementById(`vol-${ch}`);
      slider?.addEventListener('input', (e) => {
        this.soundEngine.init();
        this.soundEngine.setChannelVolume(ch, Number(e.target.value));
      });
    });

    // 2. 시간대 전환 버튼
    document.querySelectorAll('[data-time]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-time]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.templeScene.setTimeOfDay(btn.dataset.time);
      });
    });

    // 3. 날씨 전환 버튼
    document.querySelectorAll('[data-weather]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-weather]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const w = btn.dataset.weather;
        this.templeScene.setWeather(w);
        this.soundEngine.setWeatherAcoustics(w);
      });
    });

    // 4. 아바타 외형 3종 전환
    document.querySelectorAll('[data-avatar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-avatar]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const style = btn.dataset.avatar;
        this.store.profile.avatarStyle = style;
        this._saveState();
        this.playerGroup = this.avatarManager.initPlayer(style, this.store.profile.stats);
      });
    });

    // 5. 카메라 3인칭 / 1인칭 시점 전환
    const camBtn = document.getElementById('camera-toggle-btn');
    camBtn?.addEventListener('click', () => {
      const mode = this.templeScene.toggleCameraMode();
      camBtn.textContent = mode === 'first' ? '👁️ 시점: 1인칭 몰입뷰' : '🎥 시점: 3인칭 동석뷰';
    });

    // 6. 좌측 하단 전각 빠른 이동 나침반
    document.querySelectorAll('[data-goto-zone]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.soundEngine.init();
        const zoneKey = btn.dataset.gotoZone;
        const zInfo = ZONES[zoneKey];
        if (!zInfo) return;
        this.playerGroup.position.set(zInfo.center.x, zInfo.center.y, zInfo.center.z);
        this.avatarManager.moveTo(this.playerGroup.position);
        this.showToast(`📍 ${zInfo.name}(으)로 발걸음을 옮겼습니다.`);
      });
    });

    // 7. 하단 비언어 동작 6종 버튼
    document.querySelectorAll('[data-gesture]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.soundEngine.init();
        const g = btn.dataset.gesture;
        if (g === 'prostrate') {
          this._performBow();
          this.showToast('🙇 두 무릎을 꿇고 공손히 절을 올립니다.');
        } else {
          this.avatarManager.triggerAction(g, this.soundEngine);
        }
      });
    });

    // 8. 하단 주요 사찰 신행 모달 버튼
    document.querySelectorAll('[data-open-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.soundEngine.init();
        const m = btn.dataset.openModal;
        if (m === 'bell_strike') {
          this._handleObjectClick('bell_strike');
        } else {
          this.modalManager.open(m);
        }
      });
    });

    // 9. 키보드 이동 및 단축키 1~6, V(시점 전환)
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      this.keyState[e.code] = true;

      if (e.key === '1') this.avatarManager.triggerAction('bow_half', this.soundEngine);
      if (e.key === '2') this._performBow();
      if (e.key === '3') this._rollMala();
      if (e.key === '4') this._handleObjectClick('incense');
      if (e.key === '5') this._handleObjectClick('circumambulate');
      if (e.key === '6') this.avatarManager.triggerAction('tea', this.soundEngine);
      if (e.code === 'KeyV') camBtn?.click();
    });

    window.addEventListener('keyup', (e) => {
      this.keyState[e.code] = false;
    });
  }

  _startMainLoop() {
    const clock = new THREE.Clock();

    const animate = () => {
      requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      this.avatarManager.update(delta, elapsed, this.keyState);

      // 현재 구역(Zone) 감지 및 HUD/오디오 자동 갱신
      const detected = this.templeScene.detectZone(this.playerGroup.position);
      if (detected.id !== this.currentZone.id) {
        this.currentZone = detected;
        document.getElementById('hud-zone-name').textContent = detected.name;
        document.getElementById('hud-zone-subtitle').textContent = detected.subtitle;
        this.soundEngine.updateZoneAcoustics(detected.id);

        document.querySelectorAll('[data-goto-zone]').forEach((b) => {
          b.classList.toggle('active', b.dataset.gotoZone === detected.id);
        });
      }

      this.templeScene.renderFrame(delta, elapsed, this.playerGroup);
    };

    requestAnimationFrame(animate);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new MetaTempleApp();
});
