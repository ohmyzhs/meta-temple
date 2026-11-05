import * as THREE from 'three';
import { ZONES } from '../data/templeData.js';

/**
 * 청연산사 (清蓮山寺) — 3D 산사 월드 빌더, 실시간 시간대·날씨 조명 및 1/3인칭 카메라 컨트롤러
 * - Zone 1: 일주문(Iljumun), 전나무 숲길, 계곡 물줄기 & 돌다리, 소원 돌탑
 * - Zone 2: 대웅전 앞마당, 천년 삼층석탑, 소원 연등 군락, 범종각(청동 범종), 번뇌 소각 화로, 기와 불사대
 * - Zone 3: 대웅전 법당 내부(팔작지붕 목조건축, 금동 삼존불, 후불탱화, 청동 향로 & 쌍촛대, 좌복 방석, 사경 서안)
 * - Zone 4: 후원 다실(심검당), 대나무 숲, 연꽃 연못 & 수중 정자
 */
export class TempleScene {
  constructor(canvasContainer, callbacks = {}) {
    this.container = canvasContainer;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      220
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);

    // 카메라 제어 상태 (3인칭 숄더/오빗 뷰 ↔ 1인칭 몰입 뷰)
    this.cameraMode = 'third'; // 'third' | 'first'
    this.orbitYaw = 0;
    this.orbitPitch = 0.42;
    this.orbitDistance = 8.5;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    // 레이캐스터 및 인터랙티브 오브젝트 레지스트리
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.walkableMeshes = [];
    this.interactiveObjects = [];

    // 환경 상태
    this.timeMode = 'sunset'; // 'realtime' | 'dawn' | 'day' | 'sunset' | 'night'
    this.weatherMode = 'clear'; // 'clear' | 'rain' | 'snow'
    this.lanternMeshes = [];
    this.stoneMeshes = [];
    this.incenseParticles = [];
    this.fireParticles = [];
    this.bellSwingTimer = 0;

    this._initLights();
    this._buildTerrainAndMountains();
    this._buildZone1ForestAndIljumun();
    this._buildZone2CourtyardAndPagoda();
    this._buildZone3DaeungjeonHall();
    this._buildZone4TeahouseAndPond();
    this._initWeatherParticles();
    this._bindPointerEvents();

    this.setTimeOfDay('sunset');
  }

  _initLights() {
    this.ambientLight = new THREE.AmbientLight(0xd8e2ec, 0.55);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0x9ec5e8, 0x3a3228, 0.5);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffdfba, 1.35);
    this.sunLight.position.set(24, 34, 18);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 110;
    const d = 38;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    this.scene.fog = new THREE.FogExp2(0x1f2633, 0.015);
  }

  /**
   * 전체 산사 지형, 계곡 물줄기 및 원경 산봉우리 생성
   */
  _buildTerrainAndMountains() {
    // 1. 기본 숲 지면 (Zone 1)
    const groundGeo = new THREE.PlaneGeometry(130, 130, 32, 32);
    this.groundMat = new THREE.MeshStandardMaterial({
      color: 0x3b4436,
      roughness: 0.92,
      metalness: 0.04
    });
    const ground = new THREE.Mesh(groundGeo, this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.walkableMeshes.push(ground);

    // 2. 대웅전 앞마당 백색 마사토 기단 (Zone 2)
    const courtyardGeo = new THREE.BoxGeometry(30, 0.4, 24);
    this.courtyardMat = new THREE.MeshStandardMaterial({
      color: 0xc2b9a7,
      roughness: 0.84,
      metalness: 0.05
    });
    const courtyard = new THREE.Mesh(courtyardGeo, this.courtyardMat);
    courtyard.position.set(0, 0.2, -3.5);
    courtyard.receiveShadow = true;
    this.scene.add(courtyard);
    this.walkableMeshes.push(courtyard);

    // 3. 숲길 포석 산책로
    const pathGeo = new THREE.BoxGeometry(4.4, 0.08, 26);
    const pathMat = new THREE.MeshStandardMaterial({
      color: 0x8a8479,
      roughness: 0.88
    });
    const pathMesh = new THREE.Mesh(pathGeo, pathMat);
    pathMesh.position.set(0, 0.04, 21);
    pathMesh.receiveShadow = true;
    this.scene.add(pathMesh);
    this.walkableMeshes.push(pathMesh);

    // 4. 원경 산봉우리 실루엣 (중첩 산세)
    const mountainMat = new THREE.MeshStandardMaterial({
      color: 0x1c2826,
      roughness: 0.95
    });
    const peaks = [
      { x: 0, z: -58, r: 34, h: 28 },
      { x: -34, z: -48, r: 28, h: 22 },
      { x: 36, z: -46, r: 30, h: 24 },
      { x: -46, z: -12, r: 24, h: 18 },
      { x: 48, z: -10, r: 25, h: 19 }
    ];
    peaks.forEach((p) => {
      const mGeo = new THREE.ConeGeometry(p.r, p.h, 9);
      const mMesh = new THREE.Mesh(mGeo, mountainMat);
      mMesh.position.set(p.x, p.h / 2 - 2, p.z);
      this.scene.add(mMesh);
    });
  }

  /**
   * Zone 1: 전통 일주문, 전나무 숲길, 계곡 돌다리(석교), 소원 돌탑
   */
  _buildZone1ForestAndIljumun() {
    const woodRedMat = new THREE.MeshStandardMaterial({ color: 0x6e2c23, roughness: 0.65 });
    const dancheongMat = new THREE.MeshStandardMaterial({ color: 0x2f5d50, roughness: 0.6 });
    const roofTileMat = new THREE.MeshStandardMaterial({ color: 0x26292e, roughness: 0.72 });

    // 1. 전통 일주문 (Iljumun Gate, Z = +28)
    const iljumun = new THREE.Group();
    iljumun.position.set(0, 0, 28);

    const pillarGeo = new THREE.CylinderGeometry(0.32, 0.36, 4.6, 16);
    const leftPillar = new THREE.Mesh(pillarGeo, woodRedMat);
    leftPillar.position.set(-2.9, 2.3, 0);
    leftPillar.castShadow = true;
    const rightPillar = new THREE.Mesh(pillarGeo, woodRedMat);
    rightPillar.position.set(2.9, 2.3, 0);
    rightPillar.castShadow = true;

    const beam = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.55, 0.8), dancheongMat);
    beam.position.set(0, 4.4, 0);
    beam.castShadow = true;

    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 1.8, 4), roofTileMat);
    roof.position.set(0, 5.5, 0);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.35, 1, 0.55);
    roof.castShadow = true;

    // 현판 (청연산사)
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.72, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.5 })
    );
    plaque.position.set(0, 4.55, 0.45);

    iljumun.add(leftPillar, rightPillar, beam, roof, plaque);
    this.scene.add(iljumun);

    // 2. 계곡 물줄기 & 무지개 돌다리 (Z = +19)
    const streamGeo = new THREE.PlaneGeometry(55, 3.4);
    const streamMat = new THREE.MeshStandardMaterial({
      color: 0x2b5870,
      roughness: 0.18,
      metalness: 0.65,
      transparent: true,
      opacity: 0.88
    });
    const stream = new THREE.Mesh(streamGeo, streamMat);
    stream.rotation.x = -Math.PI / 2;
    stream.position.set(0, 0.05, 19);
    this.scene.add(stream);

    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.32, 4.0),
      new THREE.MeshStandardMaterial({ color: 0x999388, roughness: 0.82 })
    );
    bridge.position.set(0, 0.16, 19);
    bridge.receiveShadow = true;
    this.scene.add(bridge);
    this.walkableMeshes.push(bridge);

    // 3. 소원 돌탑 (Stone Pagoda, X = -3.8, Z = +15)
    this.stonePagodaGroup = new THREE.Group();
    this.stonePagodaGroup.position.set(-3.8, 0, 15);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7d7a72, roughness: 0.88 });

    const baseRadii = [1.1, 0.92, 0.76, 0.62, 0.48, 0.36, 0.25];
    let currentY = 0.18;
    baseRadii.forEach((r) => {
      const sMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), stoneMat);
      sMesh.scale.y = 0.52;
      sMesh.position.y = currentY;
      sMesh.castShadow = true;
      this.stonePagodaGroup.add(sMesh);
      currentY += r * 0.55;
    });
    this.stoneTopY = currentY;
    this.scene.add(this.stonePagodaGroup);
    this._registerInteractive(this.stonePagodaGroup, 'stone_pagoda', '소원 돌탑 쌓기');

    // 4. 아름드리 전나무·소나무 숲 군락 배치
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3525, roughness: 0.9 });
    const pineLeafMat = new THREE.MeshStandardMaterial({ color: 0x254232, roughness: 0.82 });

    const treeCoords = [
      [-6, 26], [6, 26], [-8, 22], [8, 22], [-5.5, 16], [5.8, 16],
      [-10, 12], [10, 12], [-14, 18], [14, 18], [-16, 6], [16, 6],
      [-18, -6], [-17, -16], [18, -16], [-12, -26], [12, -26]
    ];
    treeCoords.forEach(([tx, tz], idx) => {
      const tree = new THREE.Group();
      const h = 4.5 + (idx % 3) * 1.2;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, h, 8), trunkMat);
      trunk.position.y = h / 2;
      trunk.castShadow = true;
      tree.add(trunk);

      for (let layer = 0; layer < 3; layer++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(2.1 - layer * 0.45, 2.6, 9),
          pineLeafMat
        );
        cone.position.y = h - 0.8 + layer * 1.35;
        cone.castShadow = true;
        tree.add(cone);
      }
      tree.position.set(tx, 0, tz);
      this.scene.add(tree);
    });
  }

  /**
   * Zone 2: 대웅전 앞마당, 천년 삼층석탑, 소원 연등 군락, 범종각, 번뇌 소각 화로, 기와 불사대
   */
  _buildZone2CourtyardAndPagoda() {
    const graniteMat = new THREE.MeshStandardMaterial({
      color: 0xa8a296,
      roughness: 0.78,
      metalness: 0.08
    });

    // 1. 중앙 천년 삼층석탑 (Three-Story Stone Pagoda, X = 0, Z = -2)
    this.pagodaGroup = new THREE.Group();
    this.pagodaGroup.position.set(0, 0.4, -2);

    // 기단부
    const base1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.55, 3.4), graniteMat);
    base1.position.y = 0.275;
    const base2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.65, 2.6), graniteMat);
    base2.position.y = 0.85;
    this.pagodaGroup.add(base1, base2);

    // 1~3층 탑신 및 옥개석
    let py = 1.2;
    [1.8, 1.45, 1.15].forEach((w) => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, w * 0.72, w * 0.78), graniteMat);
      body.position.y = py + (w * 0.72) / 2;
      body.castShadow = true;
      py += w * 0.72;

      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.28, 0.32, w * 1.28), graniteMat);
      roof.position.y = py + 0.16;
      roof.castShadow = true;
      py += 0.34;
      this.pagodaGroup.add(body, roof);
    });

    // 상륜부 (보주)
    const finial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.22, 1.1, 12),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.7 })
    );
    finial.position.y = py + 0.55;
    this.pagodaGroup.add(finial);
    this.scene.add(this.pagodaGroup);
    this._registerInteractive(this.pagodaGroup, 'circumambulate', '천년 삼층석탑 탑돌이');

    // 2. 우측 범종각 & 청동 범종 (Bell Pavilion, X = 9.5, Z = -3)
    const bellPavilion = new THREE.Group();
    bellPavilion.position.set(9.5, 0.4, -3);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c261e, roughness: 0.68 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.7 });

    [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]].forEach(([px, pz]) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 4.2, 12), woodMat);
      col.position.set(px, 2.1, pz);
      col.castShadow = true;
      bellPavilion.add(col);
    });

    const bellRoof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2.1, 4), roofMat);
    bellRoof.position.y = 5.1;
    bellRoof.rotation.y = Math.PI / 4;
    bellRoof.castShadow = true;
    bellPavilion.add(bellRoof);

    // 청동 범종
    const bronzeMat = new THREE.MeshStandardMaterial({
      color: 0x524632,
      roughness: 0.38,
      metalness: 0.75
    });
    this.bronzeBell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.88, 1.75, 24),
      bronzeMat
    );
    this.bronzeBell.position.y = 2.45;
    this.bronzeBell.castShadow = true;
    bellPavilion.add(this.bronzeBell);

    this.scene.add(bellPavilion);
    this._registerInteractive(bellPavilion, 'bell_strike', '범종각 타종 체험');

    // 3. 좌측 번뇌 소각 화로 (Worry Brazier, X = -9.2, Z = -1.5)
    this.brazierGroup = new THREE.Group();
    this.brazierGroup.position.set(-9.2, 0.4, -1.5);

    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.68, 1.1, 20),
      new THREE.MeshStandardMaterial({ color: 0x2e2a27, roughness: 0.7, metalness: 0.5 })
    );
    pot.position.y = 0.55;
    pot.castShadow = true;
    this.brazierGroup.add(pot);

    // 타오르는 불꽃 코어 & 광원
    const flameGeo = new THREE.ConeGeometry(0.52, 0.95, 10);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7043 });
    this.brazierFlame = new THREE.Mesh(flameGeo, flameMat);
    this.brazierFlame.position.y = 1.25;
    this.brazierGroup.add(this.brazierFlame);

    this.brazierLight = new THREE.PointLight(0xff6d00, 1.8, 9);
    this.brazierLight.position.y = 1.6;
    this.brazierGroup.add(this.brazierLight);

    this.scene.add(this.brazierGroup);
    this._registerInteractive(this.brazierGroup, 'burn_worry', '번뇌 소각 화로 (고민 태우기)');

    // 4. 좌측 기와 불사대 (Wish Tile Stand, X = -9.2, Z = -6.2)
    const tileStand = new THREE.Group();
    tileStand.position.set(-9.2, 0.4, -6.2);

    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.9, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.75 })
    );
    desk.position.y = 0.45;
    tileStand.add(desk);

    // 검은 기와 샘플들
    for (let i = -2; i <= 2; i++) {
      const tile = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.55, 12, 1, false, 0, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.6 })
      );
      tile.position.set(i * 0.48, 1.05, 0);
      tile.rotation.z = 0.2;
      tileStand.add(tile);
    }
    this.scene.add(tileStand);
    this._registerInteractive(tileStand, 'wish_tile', '기와 불사 각인');

    // 5. 소원 연등 컨테이너 그룹
    this.lanternContainer = new THREE.Group();
    this.scene.add(this.lanternContainer);
  }

  /**
   * Zone 3: 대웅전 법당 본당, 금동 삼존불, 청동 향로(헌향), 수행 좌복, 사경 서안
   */
  _buildZone3DaeungjeonHall() {
    this.hallGroup = new THREE.Group();
    this.hallGroup.position.set(0, 0.4, -21);

    // 1. 화강암 기단 및 돌계단
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(20, 1.12, 14),
      new THREE.MeshStandardMaterial({ color: 0x9e978b, roughness: 0.82 })
    );
    platform.position.y = 0.56;
    platform.receiveShadow = true;
    this.hallGroup.add(platform);

    // 마룻바닥 (실내 수행 공간)
    const woodFloor = new THREE.Mesh(
      new THREE.BoxGeometry(18.6, 0.08, 12.6),
      new THREE.MeshStandardMaterial({ color: 0x4a2f1d, roughness: 0.45 })
    );
    woodFloor.position.y = 1.14;
    woodFloor.receiveShadow = true;
    this.hallGroup.add(woodFloor);
    this.walkableMeshes.push(woodFloor);

    // 중앙 돌계단
    for (let s = 0; s < 4; s++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 0.28, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xb0a99d, roughness: 0.8 })
      );
      step.position.set(0, 0.14 + s * 0.28, 7.2 - s * 0.45);
      this.hallGroup.add(step);
    }

    // 2. 대웅전 기둥 및 후벽·측벽 (전면 개방형으로 카메라 시야 확보)
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x6b281e, roughness: 0.65 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3b261a, roughness: 0.8 });

    const pillarPositions = [
      [-8.5, 5.5], [-4.2, 5.5], [4.2, 5.5], [8.5, 5.5],
      [-8.5, 0], [8.5, 0],
      [-8.5, -5.5], [-4.2, -5.5], [4.2, -5.5], [8.5, -5.5]
    ];
    pillarPositions.forEach(([px, pz]) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 5.6, 16), pillarMat);
      p.position.set(px, 3.9, pz);
      p.castShadow = true;
      this.hallGroup.add(p);
    });

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(17.4, 5.4, 0.4), wallMat);
    backWall.position.set(0, 3.8, -5.5);
    this.hallGroup.add(backWall);

    // 팔작지붕 처마
    const mainRoof = new THREE.Mesh(
      new THREE.ConeGeometry(14.5, 3.8, 4),
      new THREE.MeshStandardMaterial({ color: 0x1f2328, roughness: 0.7 })
    );
    mainRoof.position.set(0, 8.5, 0);
    mainRoof.rotation.y = Math.PI / 4;
    mainRoof.scale.set(1.25, 1, 0.92);
    mainRoof.castShadow = true;
    this.hallGroup.add(mainRoof);

    // 3. 수미단 & 금동 삼존불 (Golden Triad Buddhas)
    const altar = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 1.25, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x382014, roughness: 0.55 })
    );
    altar.position.set(0, 1.75, -3.8);
    this.hallGroup.add(altar);

    // 후불탱화 배경판
    const taenghwa = new THREE.Mesh(
      new THREE.BoxGeometry(8.2, 3.8, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x5c1d18,
        emissive: 0x2a0c08,
        roughness: 0.65
      })
    );
    taenghwa.position.set(0, 3.8, -5.1);
    this.hallGroup.add(taenghwa);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffcf52,
      emissive: 0x422a00,
      roughness: 0.24,
      metalness: 0.88
    });

    [-2.4, 0, 2.4].forEach((bx, idx) => {
      const scale = idx === 1 ? 1.25 : 0.92;
      const buddhaGroup = new THREE.Group();
      buddhaGroup.position.set(bx, 2.4, -3.8);
      buddhaGroup.scale.setScalar(scale);

      // 연화좌
      const lotusPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.52, 0.35, 18), goldMat);
      // 결가부좌 몸체
      const bBody = new THREE.Mesh(new THREE.ConeGeometry(0.58, 1.15, 16), goldMat);
      bBody.position.y = 0.72;
      // 불두
      const bHead = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 20), goldMat);
      bHead.position.y = 1.42;
      // 광배 (Halo)
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.82, 28), goldMat);
      halo.position.set(0, 1.15, -0.25);

      buddhaGroup.add(lotusPedestal, bBody, bHead, halo);
      this.hallGroup.add(buddhaGroup);
    });

    // 불단 성스러운 금빛 스포트라이트
    const buddhaLight = new THREE.PointLight(0xffca64, 2.2, 12);
    buddhaLight.position.set(0, 4.8, -2.2);
    this.hallGroup.add(buddhaLight);

    // 4. 헌향 청동 향로 & 쌍촛대 (Z = -1.8)
    const burnerGroup = new THREE.Group();
    burnerGroup.position.set(0, 1.18, -1.8);
    const burnerTable = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.75, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x3e2518, roughness: 0.6 })
    );
    burnerTable.position.y = 0.38;
    const incensePot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.2, 0.32, 16),
      new THREE.MeshStandardMaterial({ color: 0x8d7648, metalness: 0.7, roughness: 0.35 })
    );
    incensePot.position.y = 0.9;
    burnerGroup.add(burnerTable, incensePot);
    this.hallGroup.add(burnerGroup);
    this._registerInteractive(burnerGroup, 'incense', '불단 헌향·헌촉 올리기');

    // 5. 수행 좌복(방석) 배열
    const cushionMat = new THREE.MeshStandardMaterial({ color: 0x6e6a63, roughness: 0.88 });
    const cushionCoords = [
      [-3.3, 0.5], [-1.1, 0.5], [1.1, 0.5], [3.3, 0.5],
      [-3.3, 2.5], [-1.1, 2.5], [1.1, 2.5], [3.3, 2.5],
      [-3.3, 4.3], [-1.1, 4.3], [1.1, 4.3], [3.3, 4.3]
    ];
    cushionCoords.forEach(([cx, cz]) => {
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.95), cushionMat);
      cushion.position.set(cx, 1.2, cz);
      cushion.receiveShadow = true;
      this.hallGroup.add(cushion);
      this._registerInteractive(cushion, 'prostrate_108', '좌복에 앉아 108배·명상 수행');
    });

    // 6. 우측 반야심경 디지털 사경 서안(책상)
    const sutraDesk = new THREE.Group();
    sutraDesk.position.set(6.4, 1.18, 1.5);
    const deskMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.45, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x4e301d, roughness: 0.6 })
    );
    deskMesh.position.y = 0.22;
    const hanjiPaper = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.55),
      new THREE.MeshBasicMaterial({ color: 0xf5ebd6 })
    );
    hanjiPaper.rotation.x = -Math.PI / 2;
    hanjiPaper.position.y = 0.46;
    sutraDesk.add(deskMesh, hanjiPaper);
    this.hallGroup.add(sutraDesk);
    this._registerInteractive(sutraDesk, 'sutra_copy', '반야심경·법구경 디지털 사경(필사)');

    this.scene.add(this.hallGroup);
  }

  /**
   * Zone 4: 후원 다실(심검당), 대나무 숲 및 연꽃 연못
   */
  _buildZone4TeahouseAndPond() {
    this.teahouseGroup = new THREE.Group();
    this.teahouseGroup.position.set(18, 0, -6);

    // 1. 연꽃 연못 (Lotus Pond)
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(4.8, 32),
      new THREE.MeshStandardMaterial({
        color: 0x204d48,
        roughness: 0.12,
        metalness: 0.72
      })
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(-1.5, 0.06, 4.8);
    this.teahouseGroup.add(pond);

    // 연잎과 연꽃
    const padMat = new THREE.MeshStandardMaterial({ color: 0x3b6e4c, roughness: 0.8 });
    [[-2.5, 4.2], [-0.5, 5.5], [-1.8, 6.0], [0.8, 4.0]].forEach(([lx, lz]) => {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.03, 16), padMat);
      pad.position.set(lx, 0.08, lz);
      this.teahouseGroup.add(pad);
    });

    // 2. 다실 툇마루 (심검당)
    const maru = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.65, 6.2),
      new THREE.MeshStandardMaterial({ color: 0x5c3c24, roughness: 0.58 })
    );
    maru.position.set(0, 0.325, 0);
    maru.receiveShadow = true;
    this.teahouseGroup.add(maru);
    this.walkableMeshes.push(maru);

    const teaRoof = new THREE.Mesh(
      new THREE.ConeGeometry(5.6, 2.2, 4),
      new THREE.MeshStandardMaterial({ color: 0x25282c, roughness: 0.75 })
    );
    teaRoof.position.set(0, 4.4, 0);
    teaRoof.rotation.y = Math.PI / 4;
    this.teahouseGroup.add(teaRoof);

    // 낮은 찻상과 다기 세트
    const teaTable = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.35, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x3b2313, roughness: 0.5 })
    );
    teaTable.position.set(0, 0.82, 0);
    this.teahouseGroup.add(teaTable);

    const teaLight = new THREE.PointLight(0xffb74d, 1.5, 9);
    teaLight.position.set(0, 2.8, 0);
    this.teahouseGroup.add(teaLight);

    // 3. 대나무 숲 군락
    const bambooMat = new THREE.MeshStandardMaterial({ color: 0x4b7340, roughness: 0.55 });
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 1.2 - 0.8;
      const dist = 4.5 + (i % 3) * 0.8;
      const bamboo = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6.5, 8), bambooMat);
      bamboo.position.set(Math.cos(angle) * dist, 3.2, Math.sin(angle) * dist - 1.5);
      this.teahouseGroup.add(bamboo);
    }

    this.scene.add(this.teahouseGroup);
    this._registerInteractive(this.teahouseGroup, 'ai_tea_chat', '다실(심검당) AI 스님과 1:1 차담');
  }

  /**
   * 소원 연등 3D 오브젝트 렌더링 및 실시간 추가
   */
  syncLanterns(lanternList = []) {
    while (this.lanternContainer.children.length > 0) {
      this.lanternContainer.remove(this.lanternContainer.children[0]);
    }
    this.lanternMeshes = [];

    lanternList.forEach((item, idx) => {
      const group = new THREE.Group();
      const px = item.pos?.x ?? ((idx % 5) - 2) * 2.4;
      const py = item.pos?.y ?? 4.9;
      const pz = item.pos?.z ?? -4.0 - Math.floor(idx / 5) * 3.2;
      group.position.set(px, py, pz);

      const lanternMat = new THREE.MeshStandardMaterial({
        color: item.color || 0xff9e80,
        emissive: item.color || 0xff6e40,
        emissiveIntensity: 0.85,
        roughness: 0.35
      });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 14), lanternMat);
      body.scale.y = 1.15;
      group.add(body);

      // 아래로 늘어진 소원지(꼬리표)
      const tag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, 0.55),
        new THREE.MeshBasicMaterial({ color: 0xfff3e0, side: THREE.DoubleSide })
      );
      tag.position.y = -0.58;
      group.add(tag);

      group.userData = {
        interactiveType: 'lantern_view',
        lanternData: item,
        label: `소원 연등 (${item.author})`,
        phase: idx * 0.9
      };

      this.lanternContainer.add(group);
      this.lanternMeshes.push(group);
      this.interactiveObjects.push(body);
      body.userData = group.userData;
    });
  }

  /**
   * 소원 돌탑에 새 조약돌 얹기 시각 연출
   */
  addStoneToPagoda() {
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.18, 1),
      new THREE.MeshStandardMaterial({ color: 0xbdb7ab, roughness: 0.75 })
    );
    stone.scale.y = 0.55;
    stone.position.set(
      (Math.random() - 0.5) * 0.14,
      this.stoneTopY,
      (Math.random() - 0.5) * 0.14
    );
    this.stoneTopY += 0.14;
    this.stonePagodaGroup.add(stone);
  }

  /**
   * 범종 타종 시각 파동 및 종 흔들림 트리거
   */
  triggerBellStrikeVisual() {
    this.bellSwingTimer = 3.5;
  }

  /**
   * 번뇌 소각 화로 불꽃 타오름 연출
   */
  triggerBrazierFlare() {
    if (!this.brazierFlame || !this.brazierLight) return;
    this.brazierFlame.scale.set(1.8, 2.3, 1.8);
    this.brazierLight.intensity = 4.2;
    setTimeout(() => {
      this.brazierFlame.scale.set(1, 1, 1);
      this.brazierLight.intensity = 1.8;
    }, 1400);
  }

  _initWeatherParticles() {
    const count = 900;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 70;
      positions[i * 3 + 1] = Math.random() * 22 + 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.particleMat = new THREE.PointsMaterial({
      color: 0xffe082,
      size: 0.16,
      transparent: true,
      opacity: 0.75
    });
    this.weatherParticles = new THREE.Points(geo, this.particleMat);
    this.scene.add(this.weatherParticles);
  }

  /**
   * 시간대(새벽/낮/노을/밤/실시간) 전환
   */
  setTimeOfDay(mode) {
    this.timeMode = mode;
    let effective = mode;
    if (mode === 'realtime') {
      const hr = new Date().getHours();
      if (hr >= 4 && hr < 7) effective = 'dawn';
      else if (hr >= 7 && hr < 17) effective = 'day';
      else if (hr >= 17 && hr < 20) effective = 'sunset';
      else effective = 'night';
    }

    const presets = {
      dawn: {
        sky: 0x162234,
        fogDensity: 0.022,
        sunColor: 0x8ab4f8,
        sunIntensity: 0.65,
        ambientIntensity: 0.45,
        lanternGlow: 1.1
      },
      day: {
        sky: 0x7da4c4,
        fogDensity: 0.009,
        sunColor: 0xfff5e4,
        sunIntensity: 1.55,
        ambientIntensity: 0.75,
        lanternGlow: 0.35
      },
      sunset: {
        sky: 0x3b2431,
        fogDensity: 0.014,
        sunColor: 0xff8a50,
        sunIntensity: 1.25,
        ambientIntensity: 0.55,
        lanternGlow: 1.25
      },
      night: {
        sky: 0x090d16,
        fogDensity: 0.016,
        sunColor: 0x4a6588,
        sunIntensity: 0.28,
        ambientIntensity: 0.32,
        lanternGlow: 1.65
      }
    };

    const p = presets[effective] || presets.sunset;
    this.scene.background = new THREE.Color(p.sky);
    this.scene.fog.color.setHex(p.sky);
    this.scene.fog.density = p.fogDensity;
    this.sunLight.color.setHex(p.sunColor);
    this.sunLight.intensity = p.sunIntensity;
    this.ambientLight.intensity = p.ambientIntensity;

    this.lanternMeshes.forEach((g) => {
      const body = g.children[0];
      if (body && body.material) {
        body.material.emissiveIntensity = p.lanternGlow;
      }
    });
  }

  /**
   * 날씨(맑음/봄비/설경) 전환
   */
  setWeather(weather) {
    this.weatherMode = weather;
    if (weather === 'rain') {
      this.particleMat.color.setHex(0x90caf9);
      this.particleMat.size = 0.14;
      this.courtyardMat.roughness = 0.22; // 젖은 마당 반사광 연출
    } else if (weather === 'snow') {
      this.particleMat.color.setHex(0xffffff);
      this.particleMat.size = 0.24;
      this.courtyardMat.roughness = 0.9;
    } else {
      this.particleMat.color.setHex(0xffe082);
      this.particleMat.size = 0.16;
      this.courtyardMat.roughness = 0.84;
    }
  }

  toggleCameraMode() {
    this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
    return this.cameraMode;
  }

  _registerInteractive(object3D, type, label) {
    object3D.traverse((child) => {
      if (child.isMesh) {
        child.userData = { interactiveType: type, label };
        this.interactiveObjects.push(child);
      }
    });
  }

  _bindPointerEvents() {
    const dom = this.renderer.domElement;

    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.isDragging = false;
      this.dragStart.x = e.clientX;
      this.dragStart.y = e.clientY;
    });

    dom.addEventListener('pointermove', (e) => {
      if (e.buttons === 1) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        if (Math.hypot(dx, dy) > 5) {
          this.isDragging = true;
          this.orbitYaw -= dx * 0.0055;
          this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dy * 0.004, 0.12, 1.15);
          this.dragStart.x = e.clientX;
          this.dragStart.y = e.clientY;
        }
      }
    });

    dom.addEventListener('pointerup', (e) => {
      if (this.isDragging) return;
      const rect = dom.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);

      // 1. 인터랙티브 사찰 오브젝트 클릭 여부 확인
      const hits = this.raycaster.intersectObjects(this.interactiveObjects, false);
      if (hits.length > 0) {
        const data = hits[0].object.userData;
        if (data && data.interactiveType && this.callbacks.onObjectClick) {
          this.callbacks.onObjectClick(data.interactiveType, data);
          return;
        }
      }

      // 2. 바닥 클릭 시 해당 지점으로 아바타 산책 이동
      const groundHits = this.raycaster.intersectObjects(this.walkableMeshes, false);
      if (groundHits.length > 0 && this.callbacks.onGroundClick) {
        this.callbacks.onGroundClick(groundHits[0].point);
      }
    });

    dom.addEventListener(
      'wheel',
      (e) => {
        this.orbitDistance = THREE.MathUtils.clamp(this.orbitDistance + e.deltaY * 0.006, 3.8, 18.0);
      },
      { passive: true }
    );

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /**
   * 플레이어 위치 기준 현재 구역(Zone 1 ~ 4) 판별
   */
  detectZone(pos) {
    if (pos.x > 11.5 && pos.z < 2) return ZONES.TEAHOUSE;
    if (pos.z < -13.0 && Math.abs(pos.x) < 10.5) return ZONES.DAEUNGJEON;
    if (pos.z <= 8.5) return ZONES.COURTYARD;
    return ZONES.FOREST;
  }

  /**
   * 매 프레임 파티클, 연등 흔들림, 카메라 추적 및 렌더링
   */
  renderFrame(delta, elapsedTime, playerGroup) {
    // 1. 연등 바람 흔들림
    this.lanternMeshes.forEach((g) => {
      g.position.y = 4.9 + Math.sin(elapsedTime * 1.6 + (g.userData.phase || 0)) * 0.08;
      g.rotation.z = Math.sin(elapsedTime * 1.2 + (g.userData.phase || 0)) * 0.06;
    });

    // 2. 범종 흔들림
    if (this.bellSwingTimer > 0 && this.bronzeBell) {
      this.bellSwingTimer -= delta;
      this.bronzeBell.rotation.z = Math.sin(elapsedTime * 8) * 0.08 * (this.bellSwingTimer / 3.5);
    }

    // 3. 화로 불꽃 일렁임
    if (this.brazierFlame) {
      this.brazierFlame.scale.y = 1.0 + Math.sin(elapsedTime * 11) * 0.16;
    }

    // 4. 날씨 파티클 업데이트
    if (this.weatherParticles) {
      const posAttr = this.weatherParticles.geometry.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i);
        if (this.weatherMode === 'rain') {
          y -= delta * 15.5;
          if (y < 0) y = 22;
        } else if (this.weatherMode === 'snow') {
          y -= delta * 2.4;
          if (y < 0) y = 22;
        } else {
          // 반딧불/향 입자 부유
          y += Math.sin(elapsedTime * 1.5 + i) * delta * 0.35;
          if (y > 16) y = 0.8;
        }
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    // 5. 카메라 추적 (3인칭 숄더/오빗 뷰 vs 1인칭 몰입 뷰)
    if (playerGroup) {
      const pPos = playerGroup.position;
      if (this.cameraMode === 'first') {
        const eyePos = new THREE.Vector3(pPos.x, pPos.y + 1.48, pPos.z);
        this.camera.position.lerp(eyePos, 0.18);
        const lookTarget = new THREE.Vector3(
          pPos.x - Math.sin(this.orbitYaw) * 8,
          pPos.y + 1.5 - (this.orbitPitch - 0.35) * 4,
          pPos.z - Math.cos(this.orbitYaw) * 8
        );
        this.camera.lookAt(lookTarget);
      } else {
        const offsetX = Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDistance;
        const offsetY = Math.sin(this.orbitPitch) * this.orbitDistance + 1.4;
        const offsetZ = Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDistance;

        const desiredCamPos = new THREE.Vector3(pPos.x + offsetX, pPos.y + offsetY, pPos.z + offsetZ);
        this.camera.position.lerp(desiredCamPos, 0.12);
        this.camera.lookAt(pPos.x, pPos.y + 1.25, pPos.z);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
