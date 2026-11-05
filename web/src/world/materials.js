/**
 * 공용 재질 + 셰이더 주입 (눈 덮임, 젖은 바닥, 바람에 흔들리는 수목).
 * 날씨/시간 상태는 envUniforms 하나로 모든 재질이 공유한다.
 */
import * as THREE from 'three';
import {
  roofTileTextures,
  dancheongBandTexture,
  rafterTexture,
  columnTexture,
  woodTexture,
  plasterTexture,
  graniteTextures,
  floorTexture
} from './textures.js';
import { ROOF_COVER_GLSL } from './layout.js';

export const envUniforms = {
  uTime: { value: 0 },
  uSnow: { value: 0 }, // 0..1 지붕·지면 눈 덮임
  uWet: { value: 0 }, // 0..1 비에 젖음
  uWind: { value: 0.6 }, // 바람 세기
  uNight: { value: 0 } // 0..1 (창호 발광 등)
};

/**
 * 위를 향한 면에 눈을 얹고, 비가 오면 어둡고 매끈하게.
 * instanced 메쉬는 instanceMatrix 를 포함해 월드 노멀을 계산한다.
 */
export function weatherable(mat, { snow = 1, wet = 1 } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    shader.uniforms.uSnow = envUniforms.uSnow;
    shader.uniforms.uWet = envUniforms.uWet;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vUpY;\nvarying float vCover;\n' + ROOF_COVER_GLSL)
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        {
          vec3 wn = normal;
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wn = mat3(instanceMatrix) * wn;
            wp = instanceMatrix * wp;
          #endif
          vUpY = normalize(mat3(modelMatrix) * wn).y;
          vCover = roofCover((modelMatrix * wp).xyz);
        }`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vUpY;\nvarying float vCover;\nuniform float uSnow;\nuniform float uWet;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float dry = 1.0 - vCover; // 지붕 밑은 젖지도, 눈이 쌓이지도 않는다
        float snowMask = uSnow * ${snow.toFixed(2)} * smoothstep(0.25, 0.7, vUpY) * dry;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.92, 0.96), snowMask);
        diffuseColor.rgb *= mix(1.0, 0.62, uWet * ${wet.toFixed(2)} * (1.0 - snowMask) * dry);`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.18, uWet * ${wet.toFixed(2)} * smoothstep(0.5, 0.9, vUpY) * dry);
        roughnessFactor = mix(roughnessFactor, 0.85, snowMask);`
      );
  };
  mat.customProgramCacheKey = () => `weather-${snow}-${wet}-${mat.type}`;
  return mat;
}

/**
 * 인스턴스 수목 흔들림: 높이(position.y)에 비례해 바람 방향으로 휜다.
 */
export function windSway(mat, { strength = 0.12, height = 8, flutter = 0 } = {}) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey?.() || '';
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    shader.uniforms.uTime = envUniforms.uTime;
    shader.uniforms.uWind = envUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec2 ip = vec2(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xz;
          #endif
          float hgt = max(position.y, 0.0) / ${height.toFixed(2)};
          float bend = hgt * hgt * ${strength.toFixed(3)} * uWind;
          float ph = uTime * 0.9 + ip.x * 0.21 + ip.y * 0.17;
          float gust = sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.3 + sin(uTime * 0.23 + ip.x * 0.05) * 0.5;
          transformed.x += bend * gust * ${height.toFixed(2)};
          transformed.z += bend * 0.5 * cos(ph * 1.3) * ${height.toFixed(2)};
          transformed.y += ${flutter.toFixed(3)} * sin(uTime * 6.0 + position.x * 9.0 + ip.y) * hgt;
        }`
      );
  };
  mat.customProgramCacheKey = () => `${prevKey}-wind-${strength}-${height}-${flutter}`;
  return mat;
}

/** 시간대에 따라 발광이 켜지는 재질(창호지, 석등 화사석) */
export function nightGlow(mat, strength = 1) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey?.() || '';
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    shader.uniforms.uNight = envUniforms.uNight;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance *= (0.04 + uNight * ${strength.toFixed(2)});`);
  };
  mat.customProgramCacheKey = () => `${prevKey}-night-${strength}`;
  return mat;
}

let M = null;
/** 공용 재질 묶음 (한 번만 생성) */
export function mats() {
  if (M) return M;
  const roof = roofTileTextures();
  const granite = graniteTextures();
  M = {
    roofTop: weatherable(
      new THREE.MeshStandardMaterial({ map: roof.color, normalMap: roof.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.72, metalness: 0.05 }),
      { snow: 1.2, wet: 1 }
    ),
    roofUnder: new THREE.MeshStandardMaterial({ map: rafterTexture(), roughness: 0.85 }),
    roofEdge: new THREE.MeshStandardMaterial({ color: 0x2c2d2f, roughness: 0.8 }),
    ridge: weatherable(new THREE.MeshStandardMaterial({ color: 0x35373a, roughness: 0.7 }), { snow: 1, wet: 1 }),
    ridgeWhite: new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.9 }),
    dancheong: new THREE.MeshStandardMaterial({ map: dancheongBandTexture(), roughness: 0.8 }),
    green: new THREE.MeshStandardMaterial({ color: 0x2d6a5a, roughness: 0.8 }),
    column: new THREE.MeshStandardMaterial({ map: columnTexture(), roughness: 0.75 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTexture('#6b4a2f', 3), roughness: 0.82 }),
    woodDark: new THREE.MeshStandardMaterial({ map: woodTexture('#4a3020', 4), roughness: 0.85 }),
    woodLight: weatherable(new THREE.MeshStandardMaterial({ map: woodTexture('#9a7550', 6), roughness: 0.78 }), { snow: 0.9, wet: 0.7 }),
    plaster: new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.95 }),
    granite: weatherable(
      new THREE.MeshStandardMaterial({ map: granite.color, normalMap: granite.normal, roughness: 0.88, metalness: 0.02 }),
      { snow: 1, wet: 1 }
    ),
    floor: new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55, metalness: 0.02 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x6a5634, roughness: 0.42, metalness: 0.88 }),
    bronzeGreen: new THREE.MeshStandardMaterial({ color: 0x4f5f48, roughness: 0.55, metalness: 0.7 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd4a447, roughness: 0.28, metalness: 1.0 }),
    red: new THREE.MeshStandardMaterial({ color: 0x8e2f1f, roughness: 0.6 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x8a6f52, roughness: 0.95 }),
    rope: new THREE.MeshStandardMaterial({ color: 0xa08a62, roughness: 0.95 }),
    stoneDark: weatherable(new THREE.MeshStandardMaterial({ color: 0x6e6a62, roughness: 0.92 }), { snow: 1, wet: 1 })
  };
  M.floor.map.repeat.set(1, 1);
  return M;
}
