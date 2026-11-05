/**
 * 청연산사 (清蓮山寺) — Web Audio API 기반 입체 공간 ASMR & 전통 사찰 음향 합성 엔진
 * 외부 오디오 에셋 의존 없이 브라우저 네이티브 오실레이터/노이즈 필터/공명기로
 * 1) 자연 환경음 (솔바람, 계곡 물소리, 산새, 봄비)
 * 2) 사찰 공간음 (처마 끝 청동 풍경, 대웅전 독송 공명, 범종 타종)
 * 3) 수행 효과음 (목탁, 죽비/인경, 염주 알, 화로 불꽃)을 실시간 합성합니다.
 */

export class TempleSoundEngine {
  constructor() {
    this.ctx = null;
    this.isEnabled = false;
    this.currentZone = 'FOREST';
    this.weather = 'clear';

    this.volumes = {
      nature: 0.7,
      temple: 0.65,
      sfx: 0.8
    };

    this.nodes = {};
    this.timers = [];
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      this.isEnabled = true;
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    // 마스터 및 3채널 버스
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;
    this.masterGain.connect(this.ctx.destination);

    this.natureBus = this.ctx.createGain();
    this.natureBus.gain.value = this.volumes.nature;
    this.natureBus.connect(this.masterGain);

    this.templeBus = this.ctx.createGain();
    this.templeBus.gain.value = this.volumes.temple;
    this.templeBus.connect(this.masterGain);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.volumes.sfx;
    this.sfxBus.connect(this.masterGain);

    this._setupContinuousAmbience();
    this._setupPeriodicSounds();

    this.isEnabled = true;
    this.updateZoneAcoustics(this.currentZone);
  }

  toggleAudio() {
    if (!this.ctx) {
      this.init();
      return true;
    }
    if (this.isEnabled) {
      this.masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
      this.isEnabled = false;
    } else {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.masterGain.gain.setTargetAtTime(0.85, this.ctx.currentTime, 0.35);
      this.isEnabled = true;
    }
    return this.isEnabled;
  }

  setChannelVolume(channel, value) {
    this.volumes[channel] = value;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (channel === 'nature' && this.natureBus) {
      this.natureBus.gain.setTargetAtTime(value, now, 0.15);
    } else if (channel === 'temple' && this.templeBus) {
      this.templeBus.gain.setTargetAtTime(value, now, 0.15);
    } else if (channel === 'sfx' && this.sfxBus) {
      this.sfxBus.gain.setTargetAtTime(value, now, 0.15);
    }
  }

  /**
   * 핑크/브라운 노이즈 버퍼 생성을 통한 자연 바람·계곡물·빗소리 구현
   */
  _createNoiseBuffer(seconds = 4, type = 'pink') {
    const bufferSize = this.ctx.sampleRate * seconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);

    if (type === 'brown') {
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 3.2;
      }
    } else {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.08;
        b6 = white * 0.115926;
      }
    }
    return buffer;
  }

  _setupContinuousAmbience() {
    const pinkBuffer = this._createNoiseBuffer(5, 'pink');
    const brownBuffer = this._createNoiseBuffer(5, 'brown');

    // 1. 솔바람 소리 (Wind in Pine Trees)
    const windSource = this.ctx.createBufferSource();
    windSource.buffer = pinkBuffer;
    windSource.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 340;
    windFilter.Q.value = 2.4;

    const windLfo = this.ctx.createOscillator();
    windLfo.frequency.value = 0.14;
    const windLfoGain = this.ctx.createGain();
    windLfoGain.gain.value = 160;
    windLfo.connect(windFilter.frequency);
    windLfo.start();

    this.nodes.windGain = this.ctx.createGain();
    this.nodes.windGain.gain.value = 0.18;
    windSource.connect(windFilter);
    windFilter.connect(this.nodes.windGain);
    this.nodes.windGain.connect(this.natureBus);
    windSource.start();

    // 2. 계곡 여울물 소리 (Mountain Stream)
    const streamSource = this.ctx.createBufferSource();
    streamSource.buffer = brownBuffer;
    streamSource.loop = true;

    const streamFilter = this.ctx.createBiquadFilter();
    streamFilter.type = 'lowpass';
    streamFilter.frequency.value = 720;

    this.nodes.streamGain = this.ctx.createGain();
    this.nodes.streamGain.gain.value = 0.14;
    streamSource.connect(streamFilter);
    streamFilter.connect(this.nodes.streamGain);
    this.nodes.streamGain.connect(this.natureBus);
    streamSource.start();

    // 3. 봄비 ASMR 레이어 (날씨가 rain일 때 활성화)
    const rainSource = this.ctx.createBufferSource();
    rainSource.buffer = pinkBuffer;
    rainSource.loop = true;

    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 950;

    this.nodes.rainGain = this.ctx.createGain();
    this.nodes.rainGain.gain.value = 0.0001;
    rainSource.connect(rainFilter);
    rainFilter.connect(this.nodes.rainGain);
    this.nodes.rainGain.connect(this.natureBus);
    rainSource.start();

    // 4. 대웅전 독송/명상 배음 드론 (Warm Sanctuary Singing Bowl / Chant Pad)
    const droneOsc1 = this.ctx.createOscillator();
    const droneOsc2 = this.ctx.createOscillator();
    droneOsc1.type = 'sine';
    droneOsc2.type = 'triangle';
    droneOsc1.frequency.value = 136.1; // 명상 주파수 (Om / C#3)
    droneOsc2.frequency.value = 204.15; // 완전 5도 배음

    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 280;

    this.nodes.chantDroneGain = this.ctx.createGain();
    this.nodes.chantDroneGain.gain.value = 0.04;

    droneOsc1.connect(droneFilter);
    droneOsc2.connect(droneFilter);
    droneFilter.connect(this.nodes.chantDroneGain);
    this.nodes.chantDroneGain.connect(this.templeBus);
    droneOsc1.start();
    droneOsc2.start();
  }

  _setupPeriodicSounds() {
    // 처마 끝 풍경(풍탁) 소리 간헐적 재생
    const chimeTimer = setInterval(() => {
      if (!this.isEnabled) return;
      if (Math.random() < 0.65) {
        this.playWindChime();
      }
    }, 5200);

    // 산새 지저귐 간헐적 재생 (숲길 및 다실 주변)
    const birdTimer = setInterval(() => {
      if (!this.isEnabled) return;
      if ((this.currentZone === 'FOREST' || this.currentZone === 'TEAHOUSE') && Math.random() < 0.55) {
        this.playMountainBird();
      }
    }, 6800);

    this.timers.push(chimeTimer, birdTimer);
  }

  /**
   * 구역(Zone) 이동 및 날씨 변화에 따른 공간 음향 자동 믹싱
   */
  updateZoneAcoustics(zoneId) {
    this.currentZone = zoneId;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (zoneId === 'FOREST') {
      this.nodes.windGain?.gain.setTargetAtTime(0.22, now, 0.8);
      this.nodes.streamGain?.gain.setTargetAtTime(0.24, now, 0.8);
      this.nodes.chantDroneGain?.gain.setTargetAtTime(0.015, now, 0.8);
    } else if (zoneId === 'COURTYARD') {
      this.nodes.windGain?.gain.setTargetAtTime(0.18, now, 0.8);
      this.nodes.streamGain?.gain.setTargetAtTime(0.08, now, 0.8);
      this.nodes.chantDroneGain?.gain.setTargetAtTime(0.045, now, 0.8);
    } else if (zoneId === 'DAEUNGJEON') {
      // 대웅전 실내 진입 시 외부 바람·계곡 소리는 아득해지고 법당 공명이 깊어짐
      this.nodes.windGain?.gain.setTargetAtTime(0.06, now, 0.8);
      this.nodes.streamGain?.gain.setTargetAtTime(0.02, now, 0.8);
      this.nodes.chantDroneGain?.gain.setTargetAtTime(0.11, now, 0.8);
    } else if (zoneId === 'TEAHOUSE') {
      this.nodes.windGain?.gain.setTargetAtTime(0.20, now, 0.8);
      this.nodes.streamGain?.gain.setTargetAtTime(0.16, now, 0.8);
      this.nodes.chantDroneGain?.gain.setTargetAtTime(0.03, now, 0.8);
    }
  }

  setWeatherAcoustics(weather) {
    this.weather = weather;
    if (!this.ctx || !this.nodes.rainGain) return;
    const now = this.ctx.currentTime;
    if (weather === 'rain') {
      this.nodes.rainGain.gain.setTargetAtTime(0.22, now, 0.6);
    } else {
      this.nodes.rainGain.gain.setTargetAtTime(0.0001, now, 0.6);
    }
  }

  /**
   * 1. 처마 끝 풍경(풍탁) 소리 — 동양 5음계(궁상각치우) 배음 합성
   */
  playWindChime(customVolume = 0.12) {
    if (!this.ctx || !this.isEnabled) return;
    const pentatonic = [1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0];
    const baseFreq = pentatonic[Math.floor(Math.random() * pentatonic.length)];
    const now = this.ctx.currentTime;

    [1, 2.756, 4.1].forEach((ratio, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * ratio, now);

      const amp = (customVolume / (idx * 2 + 1)) * (this.currentZone === 'DAEUNGJEON' ? 0.45 : 1.0);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(amp, 0.001), now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.6 - idx * 0.5);

      osc.connect(gain);
      gain.connect(this.templeBus);
      osc.start(now);
      osc.stop(now + 2.7);
    });
  }

  /**
   * 2. 목탁(Moktak) 타격음 — 따뜻한 나무 공명통 합성
   */
  playMoktak() {
    if (!this.ctx) this.init();
    if (!this.isEnabled) return;
    const now = this.ctx.currentTime;

    // 나무 통 공명 주파수 (약 F4 ~ G4 대역)
    const osc = this.ctx.createOscillator();
    const subOsc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(385, now);
    osc.frequency.exponentialRampToValueAtTime(348, now + 0.09);

    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(770, now);
    subOsc.frequency.exponentialRampToValueAtTime(696, now + 0.06);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.Q.setValueAtTime(4.5, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.45, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.24);

    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);

    osc.start(now);
    subOsc.start(now);
    osc.stop(now + 0.26);
    subOsc.stop(now + 0.26);
  }

  /**
   * 3. 청동 범종(Temple Bell) 타종음 — 웅장한 저음과 맥놀이(Beating) 여운
   */
  playTempleBell() {
    if (!this.ctx) this.init();
    if (!this.isEnabled) return;
    const now = this.ctx.currentTime;

    // 한국 전통 범종(성덕대왕신종 유사 배음 및 맥놀이 주파수 쌍)
    const partials = [
      { freq: 110.0, amp: 0.38, decay: 6.5 },
      { freq: 112.4, amp: 0.32, decay: 6.2 }, // 맥놀이(Beating) 유발
      { freq: 294.0, amp: 0.18, decay: 4.5 },
      { freq: 440.0, amp: 0.10, decay: 3.2 },
      { freq: 659.2, amp: 0.05, decay: 2.0 }
    ];

    partials.forEach((p) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.freq, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(p.amp, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

      osc.connect(gain);
      gain.connect(this.templeBus);
      osc.start(now);
      osc.stop(now + p.decay + 0.1);
    });
  }

  /**
   * 4. 염주(Mala Bead) 굴리기 및 돌탑 조약돌 얹기 사운드
   */
  playBeadClick() {
    if (!this.ctx) this.init();
    if (!this.isEnabled) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(210, now + 0.045);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.055);

    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /**
   * 5. 산새 지저귐 합성
   */
  playMountainBird() {
    if (!this.ctx || !this.isEnabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const startFreq = 2100 + Math.random() * 500;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 1.28, now + 0.09);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 0.92, now + 0.22);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.natureBus);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  /**
   * 6. 번뇌 소각 화로 불꽃 소리
   */
  playFireWhoosh() {
    if (!this.ctx) this.init();
    if (!this.isEnabled) return;
    const now = this.ctx.currentTime;
    const noiseBuffer = this._createNoiseBuffer(1.5, 'pink');
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(220, now);
    filter.frequency.exponentialRampToValueAtTime(880, now + 0.35);
    filter.frequency.exponentialRampToValueAtTime(180, now + 1.3);
    filter.Q.value = 1.8;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.38, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.4);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    source.start(now);
    source.stop(now + 1.45);
  }
}
