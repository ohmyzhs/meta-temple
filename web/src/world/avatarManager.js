import * as THREE from 'three';
import { generateDharmaName } from '../data/templeData.js';

/**
 * 청연산사 (清蓮山寺) — 아바타(3종 외형) 및 침묵의 동석 참배객(Co-presence) 매니저
 * - 외형 3종:
 *   1) monk: 목각·백자 질감의 단정한 동자승/행자
 *   2) ink_wanderer: 댓잎 삿갓과 먹빛 도포를 걸친 수묵 행자
 *   3) lantern_spirit: 은은한 빛 입자를 머금은 연꽃 등불 정령
 * - 비언어 동작 6종:
 *   1) bow_half (합장 반배)
 *   2) prostrate (큰절 / 108배 오체투지)
 *   3) meditate (가부좌 명상 & 염주 굴리기)
 *   4) incense (헌향·헌촉)
 *   5) circumambulate (석탑 탑돌이)
 *   6) tea (다실 차 마시기)
 */
export class AvatarManager {
  constructor(scene, onToastCallback) {
    this.scene = scene;
    this.onToast = onToastCallback;

    this.playerGroup = null;
    this.playerParts = {};
    this.playerStyle = 'monk';
    this.actionState = 'idle';
    this.actionTimer = 0;

    // 이동 및 탑돌이 상태
    this.targetPosition = new THREE.Vector3(0, 0, 24);
    this.isMoving = false;
    this.orbitAngle = 0;
    this.pagodaCenter = new THREE.Vector3(0, 0.4, -2);

    // 침묵의 동석 참배객(NPC / Realtime 피어) 목록
    this.visitors = [];
  }

  initPlayer(style = 'monk', meritStats = {}, initialPos = { x: 0, y: 0, z: 24 }) {
    this.playerStyle = style;
    const prevPos = this.playerGroup
      ? this.playerGroup.position.clone()
      : new THREE.Vector3(initialPos.x, initialPos.y, initialPos.z);
    const prevRotY = this.playerGroup ? this.playerGroup.rotation.y : Math.PI;

    if (this.playerGroup) {
      this.scene.remove(this.playerGroup);
    }

    const built = this._buildAvatarCharacter(style, meritStats, true);
    this.playerGroup = built.group;
    this.playerParts = built.parts;
    this.playerGroup.position.copy(prevPos);
    this.playerGroup.rotation.y = prevRotY;
    this.targetPosition.copy(prevPos);

    this.scene.add(this.playerGroup);
    return this.playerGroup;
  }

  updatePlayerMeritVisuals(meritStats = {}) {
    if (!this.playerParts) return;
    const hasMala = (meritStats.bowCount || 0) >= 7 || (meritStats.malaCount || 0) >= 21;
    const hasHandLantern = (meritStats.lanternCount || 0) >= 1 || (meritStats.sutraCopiedCount || 0) >= 1;

    if (this.playerParts.wristMala) {
      this.playerParts.wristMala.visible = hasMala;
    }
    if (this.playerParts.handLantern) {
      this.playerParts.handLantern.visible = hasHandLantern;
    }
  }

  /**
   * 아바타 3D 메쉬 생성 (목각·백자 동자승 / 삿갓 수묵 행자 / 연꽃 등불 정령)
   */
  _buildAvatarCharacter(style = 'monk', meritStats = {}, isPlayer = false) {
    const group = new THREE.Group();
    const parts = {};

    // 발밑 은은한 원형 오라 (합장 파동 및 플레이어 식별용)
    const ringGeo = new THREE.RingGeometry(0.42, 0.56, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: isPlayer ? 0xf5d78e : 0xa5b8c8,
      transparent: true,
      opacity: isPlayer ? 0.45 : 0.18,
      side: THREE.DoubleSide
    });
    const baseRing = new THREE.Mesh(ringGeo, ringMat);
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = 0.03;
    group.add(baseRing);
    parts.baseRing = baseRing;

    const bodyRoot = new THREE.Group();
    group.add(bodyRoot);
    parts.bodyRoot = bodyRoot;

    if (style === 'lantern_spirit') {
      // 3. 연꽃 등불 정령 (부유하는 혼불·연등 아바타)
      const coreGeo = new THREE.SphereGeometry(0.34, 24, 24);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xffe4b5,
        emissive: 0xff9e44,
        emissiveIntensity: 1.4,
        roughness: 0.2
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.y = 1.25;
      bodyRoot.add(core);
      parts.head = core;

      // 연꽃 잎 장식
      const petalGroup = new THREE.Group();
      petalGroup.position.y = 1.15;
      const petalGeo = new THREE.ConeGeometry(0.18, 0.48, 5);
      const petalMat = new THREE.MeshStandardMaterial({
        color: 0xff8a80,
        emissive: 0xd84315,
        emissiveIntensity: 0.45,
        roughness: 0.4
      });
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const petal = new THREE.Mesh(petalGeo, petalMat);
        petal.position.set(Math.cos(angle) * 0.28, 0.05, Math.sin(angle) * 0.28);
        petal.rotation.z = -Math.cos(angle) * 0.55;
        petal.rotation.x = Math.sin(angle) * 0.55;
        petalGroup.add(petal);
      }
      bodyRoot.add(petalGroup);
      parts.torso = petalGroup;

      const light = new THREE.PointLight(0xffb74d, 1.4, 7.5);
      light.position.set(0, 1.3, 0);
      bodyRoot.add(light);
      parts.spiritLight = light;
    } else {
      // 1. 목각·백자 동자승 (monk) 또는 2. 삿갓 수묵 행자 (ink_wanderer)
      const isInk = style === 'ink_wanderer';

      const robeMat = new THREE.MeshStandardMaterial({
        color: isInk ? 0x1e242b : 0x767b82,
        roughness: 0.85,
        metalness: 0.05
      });

      const kasayaMat = new THREE.MeshStandardMaterial({
        color: isInk ? 0x2f3842 : 0x8d5b3e, // 가사/수련복 띠 색상
        roughness: 0.78,
        metalness: 0.06
      });

      const porcelainSkinMat = new THREE.MeshStandardMaterial({
        color: isInk ? 0xd8dde2 : 0xf3e8da, // 백자·황양목 톤
        roughness: 0.48,
        metalness: 0.04
      });

      // 몸통 (장삼 자락)
      const torsoGeo = new THREE.CylinderGeometry(0.24, 0.42, 1.05, 18);
      const torso = new THREE.Mesh(torsoGeo, robeMat);
      torso.position.y = 0.56;
      torso.castShadow = true;
      torso.receiveShadow = true;
      bodyRoot.add(torso);
      parts.torso = torso;

      // 가사(어깨 띠)
      const sashGeo = new THREE.TorusGeometry(0.28, 0.055, 10, 24);
      const sash = new THREE.Mesh(sashGeo, kasayaMat);
      sash.position.set(0, 0.78, 0);
      sash.rotation.set(Math.PI / 2.6, 0.35, 0);
      bodyRoot.add(sash);

      // 머리 (단정한 동자승 두상)
      const headGroup = new THREE.Group();
      headGroup.position.y = 1.32;
      bodyRoot.add(headGroup);
      parts.head = headGroup;

      const headGeo = new THREE.SphereGeometry(0.27, 24, 24);
      const headMesh = new THREE.Mesh(headGeo, porcelainSkinMat);
      headMesh.castShadow = true;
      headGroup.add(headMesh);

      // 고요히 감은 눈썹/눈매 표현
      const eyeGeo = new THREE.BoxGeometry(0.065, 0.014, 0.02);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x3b322c });
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-0.085, 0.02, 0.255);
      leftEye.rotation.z = 0.06;
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.085, 0.02, 0.255);
      rightEye.rotation.z = -0.06;
      headGroup.add(leftEye, rightEye);

      // 삿갓 수묵 행자일 경우 댓잎 삿갓 추가
      if (isInk) {
        const hatGeo = new THREE.ConeGeometry(0.62, 0.32, 24);
        const hatMat = new THREE.MeshStandardMaterial({
          color: 0x26292e,
          roughness: 0.9,
          side: THREE.DoubleSide
        });
        const hat = new THREE.Mesh(hatGeo, hatMat);
        hat.position.y = 0.22;
        hat.castShadow = true;
        headGroup.add(hat);
      }

      // 양손 및 합장 관절 그룹
      const handsGroup = new THREE.Group();
      handsGroup.position.set(0, 0.82, 0.28);
      bodyRoot.add(handsGroup);
      parts.hands = handsGroup;

      const palmGeo = new THREE.BoxGeometry(0.055, 0.16, 0.09);
      const leftHand = new THREE.Mesh(palmGeo, porcelainSkinMat);
      leftHand.position.set(-0.035, 0, 0);
      leftHand.rotation.z = -0.18;
      const rightHand = new THREE.Mesh(palmGeo, porcelainSkinMat);
      rightHand.position.set(0.035, 0, 0);
      rightHand.rotation.z = 0.18;
      handsGroup.add(leftHand, rightHand);

      // 손목 단주(염주) 보상 메쉬
      const malaRingGeo = new THREE.TorusGeometry(0.075, 0.018, 8, 16);
      const malaRingMat = new THREE.MeshStandardMaterial({
        color: 0x8d2d1e,
        roughness: 0.4
      });
      const wristMala = new THREE.Mesh(malaRingGeo, malaRingMat);
      wristMala.position.set(0, -0.05, -0.02);
      wristMala.rotation.x = Math.PI / 2;
      wristMala.visible = (meritStats.bowCount || 0) >= 7 || (meritStats.malaCount || 0) >= 21;
      handsGroup.add(wristMala);
      parts.wristMala = wristMala;

      // 야간/공덕 보상용 작은 손연등(제등)
      const handLanternGroup = new THREE.Group();
      handLanternGroup.position.set(0.36, 0.78, 0.22);
      const hlGeo = new THREE.SphereGeometry(0.11, 12, 12);
      const hlMat = new THREE.MeshStandardMaterial({
        color: 0xffcc80,
        emissive: 0xff8f00,
        emissiveIntensity: 1.2
      });
      const hlMesh = new THREE.Mesh(hlGeo, hlMat);
      handLanternGroup.add(hlMesh);
      if (isPlayer) {
        const hlLight = new THREE.PointLight(0xffa726, 0.85, 5.5);
        handLanternGroup.add(hlLight);
      }
      handLanternGroup.visible = (meritStats.lanternCount || 0) >= 1 || (meritStats.sutraCopiedCount || 0) >= 1;
      bodyRoot.add(handLanternGroup);
      parts.handLantern = handLanternGroup;
    }

    return { group, parts };
  }

  /**
   * 침묵의 동석 참배객(Co-presence Visitors) 배치
   * - 법당 안 좌복에서 절하거나 명상하는 도반들
   * - 석탑 주위를 탑돌이하는 도반들
   * - 숲길과 다실에 머무는 도반들
   */
  spawnAmbientVisitors() {
    const configs = [
      // 대웅전 법당 내부 수행 도반들
      { pos: { x: -2.2, y: 1.52, z: -20.5 }, rotY: 0, style: 'monk', behavior: 'prostrate_loop' },
      { pos: { x: 2.2, y: 1.52, z: -20.5 }, rotY: 0, style: 'monk', behavior: 'meditate_loop' },
      { pos: { x: -1.1, y: 1.52, z: -18.5 }, rotY: 0, style: 'ink_wanderer', behavior: 'prostrate_loop' },
      { pos: { x: 1.1, y: 1.52, z: -18.5 }, rotY: 0, style: 'monk', behavior: 'meditate_loop' },
      // 대웅전 앞마당 석탑 탑돌이 도반들
      { pos: { x: 4.5, y: 0.4, z: -2.0 }, rotY: 0, style: 'monk', behavior: 'circumambulate', angle: 0.3 },
      { pos: { x: -4.5, y: 0.4, z: -2.0 }, rotY: 0, style: 'ink_wanderer', behavior: 'circumambulate', angle: 3.4 },
      // 일주문 숲길 및 다실 도반들
      { pos: { x: -1.8, y: 0.0, z: 17.5 }, rotY: 2.6, style: 'monk', behavior: 'idle_bow' },
      { pos: { x: 16.8, y: 0.65, z: -6.2 }, rotY: 1.2, style: 'lantern_spirit', behavior: 'tea_loop' }
    ];

    configs.forEach((cfg, idx) => {
      const dharmaName = generateDharmaName();
      const built = this._buildAvatarCharacter(cfg.style, { bowCount: 10 }, false);
      built.group.position.set(cfg.pos.x, cfg.pos.y, cfg.pos.z);
      built.group.rotation.y = cfg.rotY;
      this.scene.add(built.group);

      this.visitors.push({
        id: `visitor_${idx}`,
        dharmaName,
        group: built.group,
        parts: built.parts,
        style: cfg.style,
        behavior: cfg.behavior,
        phase: idx * 1.7,
        angle: cfg.angle || 0,
        replyBowTimer: 0
      });
    });
  }

  /**
   * 플레이어 이동 목표 지점 설정
   */
  moveTo(targetVec3) {
    if (!this.playerGroup) return;
    if (this.actionState === 'circumambulate') {
      this.actionState = 'idle';
    }
    this.targetPosition.copy(targetVec3);
    this.isMoving = true;
  }

  /**
   * 비언어 인터랙션 동작 6종 트리거
   */
  triggerAction(actionName, soundEngine) {
    if (!this.playerGroup) return;
    this.isMoving = false;
    this.actionState = actionName;
    this.actionTimer = 0;

    if (actionName === 'bow_half') {
      soundEngine?.playWindChime(0.16);
      this._createGoldenRipple(this.playerGroup.position);
      this._checkNearbyVisitorBowReply(soundEngine);
    } else if (actionName === 'prostrate') {
      soundEngine?.playMoktak();
    } else if (actionName === 'meditate') {
      soundEngine?.playBeadClick();
    } else if (actionName === 'incense') {
      soundEngine?.playWindChime(0.12);
    } else if (actionName === 'circumambulate') {
      // 석탑 중심으로 탑돌이 궤도 진입
      const dx = this.playerGroup.position.x - this.pagodaCenter.x;
      const dz = this.playerGroup.position.z - this.pagodaCenter.z;
      this.orbitAngle = Math.atan2(dz, dx);
      soundEngine?.playMoktak();
    } else if (actionName === 'tea') {
      soundEngine?.playBeadClick();
    }
  }

  _createGoldenRipple(position) {
    const geo = new THREE.RingGeometry(0.3, 0.45, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd54f,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, position.y + 0.05, position.z);
    this.scene.add(mesh);

    const start = performance.now();
    const animateRipple = (now) => {
      const elapsed = (now - start) / 1000;
      if (elapsed > 1.2) {
        this.scene.remove(mesh);
        geo.dispose();
        mat.dispose();
        return;
      }
      const scale = 1 + elapsed * 4.5;
      mesh.scale.set(scale, scale, 1);
      mat.opacity = 0.75 * (1 - elapsed / 1.2);
      requestAnimationFrame(animateRipple);
    };
    requestAnimationFrame(animateRipple);
  }

  /**
   * 반경 7m 이내의 동석 참배객이 합장 인사에 비언어적으로 답례
   */
  _checkNearbyVisitorBowReply(soundEngine) {
    if (!this.playerGroup) return;
    let closest = null;
    let minDist = 7.5;

    for (const v of this.visitors) {
      const d = v.group.position.distanceTo(this.playerGroup.position);
      if (d < minDist) {
        minDist = d;
        closest = v;
      }
    }

    if (closest) {
      setTimeout(() => {
        closest.replyBowTimer = 1.8;
        // 플레이어 방향 바라보기
        const dx = this.playerGroup.position.x - closest.group.position.x;
        const dz = this.playerGroup.position.z - closest.group.position.z;
        closest.group.rotation.y = Math.atan2(dx, dz);
        this._createGoldenRipple(closest.group.position);
        soundEngine?.playWindChime(0.11);
        if (this.onToast) {
          this.onToast(`🙏 곁에 있던 『${closest.dharmaName}』 도반이 조용히 합장으로 답례합니다.`);
        }
      }, 550);
    }
  }

  /**
   * 매 프레임 애니메이션 업데이트
   */
  update(delta, elapsedTime, keyState = {}) {
    if (!this.playerGroup) return;

    // 1. 키보드(WASD/화살표) 수동 이동 처리
    const moveSpeed = 5.2;
    let moveX = 0;
    let moveZ = 0;
    if (keyState.KeyW || keyState.ArrowUp) moveZ -= 1;
    if (keyState.KeyS || keyState.ArrowDown) moveZ += 1;
    if (keyState.KeyA || keyState.ArrowLeft) moveX -= 1;
    if (keyState.KeyD || keyState.ArrowRight) moveX += 1;

    if (moveX !== 0 || moveZ !== 0) {
      this.isMoving = false;
      if (this.actionState !== 'idle') this.actionState = 'idle';
      const len = Math.hypot(moveX, moveZ);
      moveX /= len;
      moveZ /= len;

      this.playerGroup.position.x = THREE.MathUtils.clamp(
        this.playerGroup.position.x + moveX * moveSpeed * delta,
        -24,
        26
      );
      this.playerGroup.position.z = THREE.MathUtils.clamp(
        this.playerGroup.position.z + moveZ * moveSpeed * delta,
        -26,
        32
      );
      this.playerGroup.position.y = this._getTerrainHeight(
        this.playerGroup.position.x,
        this.playerGroup.position.z
      );
      this.playerGroup.rotation.y = Math.atan2(moveX, moveZ);
      this.targetPosition.copy(this.playerGroup.position);

      // 걷기 바운스 애니메이션
      this.playerParts.bodyRoot.position.y = Math.abs(Math.sin(elapsedTime * 9)) * 0.08;
      this.playerParts.bodyRoot.rotation.x = 0.05;
    } else if (this.isMoving) {
      // 2. 마우스 바닥 클릭 이동 보간
      const currentPos = this.playerGroup.position;
      const dx = this.targetPosition.x - currentPos.x;
      const dz = this.targetPosition.z - currentPos.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 0.15) {
        const step = Math.min(dist, moveSpeed * delta);
        currentPos.x += (dx / dist) * step;
        currentPos.z += (dz / dist) * step;
        currentPos.y = this._getTerrainHeight(currentPos.x, currentPos.z);
        this.playerGroup.rotation.y = Math.atan2(dx, dz);
        this.playerParts.bodyRoot.position.y = Math.abs(Math.sin(elapsedTime * 9)) * 0.08;
      } else {
        this.isMoving = false;
        this.playerParts.bodyRoot.position.y = 0;
      }
    } else {
      // 3. 비언어 인터랙션 상태 머신 애니메이션
      this._animateActionState(this.playerParts, this.actionState, delta, elapsedTime);
    }

    // 4. 동석 참배객(Visitors) 애니메이션 업데이트
    this._updateVisitors(delta, elapsedTime);
  }

  _getTerrainHeight(x, z) {
    // Zone 3 대웅전 마룻바닥 영역
    if (z < -13.5 && Math.abs(x) < 9.5) {
      return 1.52;
    }
    // Zone 4 후원 다실 마루 영역
    if (x > 13.0 && z < -1.0 && z > -11.5) {
      return 0.65;
    }
    // Zone 2 대웅전 앞마당 영역
    if (z <= 8.5) {
      return 0.4;
    }
    // Zone 1 숲길 경사로
    if (z < 12.5) {
      return THREE.MathUtils.lerp(0.4, 0.0, (z - 8.5) / 4.0);
    }
    return 0.0;
  }

  _animateActionState(parts, state, delta, elapsedTime) {
    if (!parts || !parts.bodyRoot) return;
    this.actionTimer += delta;

    if (state === 'bow_half') {
      // 합장 반배 (1.6초 동안 35도 숙였다가 복귀)
      const progress = Math.min(this.actionTimer / 1.6, 1.0);
      const bend = Math.sin(progress * Math.PI) * 0.52;
      parts.bodyRoot.rotation.x = bend;
      if (parts.hands) parts.hands.position.y = 0.82 + Math.sin(progress * Math.PI) * 0.12;
      if (progress >= 1.0) {
        parts.bodyRoot.rotation.x = 0;
        this.actionState = 'idle';
      }
    } else if (state === 'prostrate') {
      // 큰절 (오체투지: 무릎 꿇고 상체 숙임)
      const cycle = Math.min(this.actionTimer / 2.6, 1.0);
      const curve = Math.sin(cycle * Math.PI);
      parts.bodyRoot.position.y = -curve * 0.36;
      parts.bodyRoot.rotation.x = curve * 1.15;
      if (parts.hands) {
        parts.hands.position.y = 0.82 + Math.sin(cycle * Math.PI * 2) * 0.22;
        parts.hands.position.z = 0.28 + curve * 0.25;
      }
      if (cycle >= 1.0) {
        parts.bodyRoot.position.y = 0;
        parts.bodyRoot.rotation.x = 0;
        if (parts.hands) {
          parts.hands.position.set(0, 0.82, 0.28);
        }
        this.actionState = 'idle';
      }
    } else if (state === 'meditate') {
      // 가부좌 명상 & 염주 굴리기
      parts.bodyRoot.position.y = -0.26 + Math.sin(elapsedTime * 2.0) * 0.015;
      parts.bodyRoot.rotation.x = 0.06;
      if (parts.hands) {
        parts.hands.position.y = 0.65 + Math.sin(elapsedTime * 5.0) * 0.025;
      }
    } else if (state === 'incense') {
      // 헌향 (두 손 높이 들어 향 올리기)
      const progress = Math.min(this.actionTimer / 2.0, 1.0);
      const wave = Math.sin(progress * Math.PI);
      parts.bodyRoot.rotation.x = wave * 0.35;
      if (parts.hands) {
        parts.hands.position.y = 0.82 + wave * 0.35;
      }
      if (progress >= 1.0) {
        parts.bodyRoot.rotation.x = 0;
        if (parts.hands) parts.hands.position.y = 0.82;
        this.actionState = 'idle';
      }
    } else if (state === 'circumambulate') {
      // 삼층석탑 주위 탑돌이 순환 보행
      this.orbitAngle += delta * 0.48;
      const radius = 4.6;
      const nx = this.pagodaCenter.x + Math.cos(this.orbitAngle) * radius;
      const nz = this.pagodaCenter.z + Math.sin(this.orbitAngle) * radius;
      this.playerGroup.position.set(nx, 0.4, nz);
      // 진행 방향 바라보기
      this.playerGroup.rotation.y = Math.atan2(-Math.sin(this.orbitAngle), Math.cos(this.orbitAngle));
      parts.bodyRoot.position.y = Math.abs(Math.sin(elapsedTime * 6.5)) * 0.05;
      parts.bodyRoot.rotation.x = 0.08;
    } else if (state === 'tea') {
      // 다실 차 마시기
      parts.bodyRoot.position.y = -0.22;
      parts.bodyRoot.rotation.x = 0.04;
      if (parts.hands) {
        parts.hands.position.y = 0.88 + Math.sin(elapsedTime * 1.8) * 0.08;
      }
    } else {
      // 기본 호흡 대기
      parts.bodyRoot.position.y = Math.sin(elapsedTime * 2.2) * 0.02;
      parts.bodyRoot.rotation.x = THREE.MathUtils.lerp(parts.bodyRoot.rotation.x, 0, 0.15);
      if (parts.hands) {
        parts.hands.position.set(0, 0.82, 0.28);
      }
    }
  }

  _updateVisitors(delta, elapsedTime) {
    for (const v of this.visitors) {
      if (v.replyBowTimer > 0) {
        v.replyBowTimer -= delta;
        v.parts.bodyRoot.rotation.x = Math.sin((v.replyBowTimer / 1.8) * Math.PI) * 0.55;
        continue;
      }

      if (v.behavior === 'prostrate_loop') {
        const cycle = (elapsedTime * 0.25 + v.phase) % 1;
        const bow = cycle < 0.45 ? Math.sin((cycle / 0.45) * Math.PI) : 0;
        v.parts.bodyRoot.position.y = -bow * 0.34;
        v.parts.bodyRoot.rotation.x = bow * 1.05;
      } else if (v.behavior === 'meditate_loop') {
        v.parts.bodyRoot.position.y = -0.26 + Math.sin(elapsedTime * 1.8 + v.phase) * 0.015;
        v.parts.bodyRoot.rotation.x = 0.05;
      } else if (v.behavior === 'circumambulate') {
        v.angle += delta * 0.36;
        const r = 4.6;
        v.group.position.x = this.pagodaCenter.x + Math.cos(v.angle) * r;
        v.group.position.z = this.pagodaCenter.z + Math.sin(v.angle) * r;
        v.group.rotation.y = Math.atan2(-Math.sin(v.angle), Math.cos(v.angle));
        v.parts.bodyRoot.position.y = Math.abs(Math.sin(elapsedTime * 5.5 + v.phase)) * 0.04;
      } else {
        v.parts.bodyRoot.position.y = Math.sin(elapsedTime * 2.0 + v.phase) * 0.02;
      }
    }
  }
}
