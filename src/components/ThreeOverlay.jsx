import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import * as THREE from 'three';
// sea-state 합성 모델은 shipSimulator 단일 출처를 재사용 (중복 정의 제거)
import { getSeaState } from '../services/shipSimulator';
// 회피 로직이 쓰는 전역 0.05° 육지 마스크(섬·내륙 포함)를 그대로 샘플링하여
// 선미추적 뷰의 실제 해안선을 그린다 → 회피 경계와 시각이 100% 일치.
import { isLandGlobal, isGlobalLandMaskReady } from '../services/landMaskGlobal';
// 실사 지형: 실제 위성 이미지(1단계) + 실제 고도(2단계, Cesium DEM)
import { loadImageryAround, loadElevationAround } from '../services/realTerrain';
// ── Constants ────────────────────────────────────────────────────────────────
const MOUSE_SENS = 0.0004;
const MAX_ROT = 0.03;
const ZOOM_MIN = 300;
const ZOOM_MAX = 5000;

const BASE_GM = 3.2;
const BASE_OMEGA_R = 0.176;
const BASE_OMEGA_P = 0.21;

const METERS_PER_DEGREE_LAT = 111132.954;
const METERS_PER_DEGREE_LON_AT_EQUATOR = 111319.491;

const FOAM_COUNT = 60;
const MAX_LOCAL_ICEBERGS = 180;
const SHIP_BASE_Y = 5; // 선체 기본 수선 높이 (수면 위로 올리기)

// ── 육지(해안선) 렌더 파라미터 ──
// 씬 스케일: 1 unit ≈ 1.5 m. 셀 1개 ≈ 3704 units(5.5km). 멀리서도 보이도록
// 실제 지형 수준 높이를 줘야 함(과거 11 units≈16m 는 16km 거리에서 ~1px 띠로 보임).
const LAND_RES = 0.05; // 전역 마스크 해상도(°) — isLandGlobal 격자와 동일
const LAND_RADIUS_DEG = 1.1; // 위도 기준 샘플 반경(화면 가시영역 + 이동 여유)
const LAND_COAST_H = 40; // 해안 저지 기본 높이(units, ~60m)
const LAND_HILL_H = 30; // 육지 이웃 1개당 가산(내륙으로 갈수록 고지)
const LAND_NOISE_H = 34; // 셀별 결정적 기복(자연스러운 능선)
const LAND_BOTTOM = -10; // 수면 아래 바닥(바다와 틈새 방지)
const LAND_SCENE_SCALE = 1.5; // 선박 좌표계와 동일한 압축비
const LAND_REBUILD_DEG = 0.35; // 이 거리(°≈39km) 이상 이동 시 주변 육지 재생성

// //! [Original Code] 기존 빙산 종류별 크기 (높이가 비현실적으로 높게 설정됨)
// const ICE_TYPES = [
//   { name: 'tabular', prob: 0.08, w: [400, 900], d: [350, 800], h: [120, 250], subRatio: 5 },
//   { name: 'large',   prob: 0.12, w: [200, 500], d: [180, 450], h: [400, 800], subRatio: 6 },
//   { name: 'medium',  prob: 0.30, w: [80, 200],  d: [70, 180],  h: [180, 400], subRatio: 7 },
//   { name: 'small',   prob: 0.35, w: [25, 80],   d: [22, 70],   h: [60, 160],  subRatio: 5 },
//   { name: 'growler', prob: 0.15, w: [6, 25],    d: [5, 22],    h: [15, 50],   subRatio: 4 },
// ];

// //* [Modified Code] 현실적인 스케일에 맞춘 빙상 스케일 및 무작위성 부여(난수 분산)
const ICE_TYPES = [
  {
    name: 'tabular',
    prob: 0.1,
    w: [400, 900],
    d: [300, 800],
    h: [40, 80],
    subRatio: 5,
  },
  {
    name: 'large',
    prob: 0.15,
    w: [200, 450],
    d: [150, 400],
    h: [60, 140],
    subRatio: 6,
  },
  {
    name: 'medium',
    prob: 0.25,
    w: [80, 200],
    d: [60, 180],
    h: [25, 60],
    subRatio: 7,
  },
  {
    name: 'small',
    prob: 0.35,
    w: [25, 80],
    d: [20, 60],
    h: [10, 25],
    subRatio: 5,
  },
  {
    name: 'growler',
    prob: 0.15,
    w: [6, 25],
    d: [5, 20],
    h: [2, 8],
    subRatio: 4,
  },
];

// ── Utility ──────────────────────────────────────────────────────────────────
function rng(a, b) {
  return a + Math.random() * (b - a);
}

function pickType() {
  let r = Math.random(),
    cum = 0;
  for (const t of ICE_TYPES) {
    cum += t.prob;
    if (r < cum) return t;
  }
  return ICE_TYPES[ICE_TYPES.length - 1];
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Bathymetry / color mapping ───────────────────────────────────────────────
function estimateBathymetry(lon, lat) {
  const latN = Math.max(0, Math.min(1, (lat - 60) / 30));
  let depth;
  if (latN < 0.3) depth = 60 + (latN / 0.3) * 250;
  else if (latN < 0.5) depth = 310 + ((latN - 0.3) / 0.2) * 2200;
  else depth = 2500 + ((latN - 0.5) / 0.5) * 1500;
  const ridgeLon = -40 + (lat - 78) * 5;
  const dRidge = Math.abs(lon - ridgeLon);
  if (dRidge < 15 && lat > 78) depth = Math.min(depth, 1200 + dRidge * 100);
  depth +=
    Math.sin(lon * 0.8 + lat * 0.3) * 200 +
    Math.cos(lon * 0.3 - lat * 0.6) * 150 +
    Math.sin((lon + lat) * 0.5) * 100;
  return Math.max(10, Math.min(6500, depth));
}

function depthToRGB(d) {
  let r, g, b;
  if (d < 50) {
    const t = d / 50;
    r = 255;
    g = 51 + t * 119;
    b = 0;
  } else if (d < 200) {
    const t = (d - 50) / 150;
    r = 255 - t * 51;
    g = 170 + t * 85;
    b = 0;
  } else if (d < 1000) {
    const t = (d - 200) / 800;
    r = 204 - t * 204;
    g = 255 - t * 51;
    b = t * 102;
  } else if (d < 2000) {
    const t = (d - 1000) / 1000;
    r = 0;
    g = 204 - t * 51;
    b = 102 + t * 153;
  } else if (d < 4000) {
    const t = (d - 2000) / 2000;
    r = 0;
    g = 153 - t * 153;
    b = 255;
  } else {
    const t = Math.min(1, (d - 4000) / 2000);
    r = t * 102;
    g = 0;
    b = 255 - t * 51;
  }
  return [r / 255, g / 255, b / 255];
}

// 자연색 해빙 팔레트 — 위성사진 스타일 (흰색 얼음, 투명 바다)
function naturalIceRGBA(conc) {
  if (conc < 0.15) {
    // 15% 미만 → 완전 투명 (아래 Cesium 위성영상 노출)
    return [0, 0, 0, 0];
  }
  // 15%~100% → 반투명 회백색 → 불투명 순백
  const t = (conc - 0.15) / 0.85; // 0.0 ~ 1.0 정규화
  const alpha = Math.round((0.4 + t * 0.6) * 255); // 102 ~ 255
  const brightness = Math.round(200 + t * 55); // 200 ~ 255
  return [brightness, brightness, brightness, alpha];
}

// iceToRGB 호환 래퍼 (thickness/edge 모드 fallback용)
function iceToRGB(conc) {
  const [r, g, b] = naturalIceRGBA(Math.max(0, Math.min(1, conc)));
  return [r / 255, g / 255, b / 255];
}

// 해빙 두께 색상 (Copernicus 팔레트: 남색→보라→연보라→흰)
function thicknessToRGB(thickM) {
  if (thickM < 0.1) return [13 / 255, 79 / 255, 139 / 255]; // 바다
  const t = Math.min(1, thickM / 5);
  const r = 30 + t * 225;
  const g = 27 + t * 180;
  const b = 75 + t * 180;
  return [r / 255, g / 255, b / 255];
}

// 해빙 경계선 색상 — 전체 주황 계열 그라데이션
function edgeToRGB(conc) {
  if (conc < 0.05) return [13 / 255, 79 / 255, 139 / 255]; // 바다
  const t = Math.min(1, (conc - 0.05) / 0.95);
  // 어두운 주황 → 밝은 주황 → 흰주황
  return [0.8 + t * 0.2, 0.3 + t * 0.5, t * 0.3];
}

// ── Sea state / ship motion helpers ──────────────────────────────────────────
function fovFromSpeed(kn) {
  if (kn <= 0) return 85;
  if (kn <= 8) return 85 + (kn / 8) * 3;
  if (kn <= 15) return 88 + ((kn - 8) / 7) * 4;
  if (kn <= 20) return 92 + ((kn - 15) / 5) * 5;
  return Math.min(103, 97 + (kn - 20) * 0.6);
}

// ── 3D value noise (hash-based) ─────────────────────────────────────────────
function hash3(ix, iy, iz) {
  let h = ix * 374761393 + iy * 668265263 + iz * 1274126177;
  h = (h ^ (h >> 13)) * 1103515245;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function noise3D(x, y, z) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const fx = smoothstep(x - ix),
    fy = smoothstep(y - iy),
    fz = smoothstep(z - iz);
  return lerp(
    lerp(
      lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx),
      lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx),
      fy,
    ),
    lerp(
      lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx),
      lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx),
      fy,
    ),
    fz,
  );
}

// 다중 옥타브 fBm 노이즈 — 자연스러운 불규칙 표면 생성
function fbm3D(x, y, z, octaves) {
  let val = 0,
    amp = 1,
    freq = 1,
    total = 0;
  for (let o = 0; o < octaves; o++) {
    val += noise3D(x * freq, y * freq, z * freq) * amp;
    total += amp;
    amp *= 0.45;
    freq *= 2.2;
  }
  return val / total;
}

// ── Iceberg geometry builder ─────────────────────────────────────────────────
function makeIceGeo(typeName, w, h, d) {
  // 세그먼트 — 불규칙 표면을 표현하려면 충분한 해상도 필요
  let wSegs, hSegs;
  switch (typeName) {
    case 'tabular':
      wSegs = 20;
      hSegs = 10;
      break;
    case 'large':
      wSegs = 18;
      hSegs = 14;
      break;
    case 'growler':
      wSegs = 12;
      hSegs = 8;
      break;
    default:
      wSegs = 16;
      hSegs = 12;
      break; // medium, small
  }

  const g = new THREE.SphereGeometry(1, wSegs, hSegs);
  const pos = g.attributes.position;

  // 시드 기반 난수 — 빙하마다 고유한 오프셋으로 완전히 다른 형태
  const rand = mulberry32(((w * 7.13 + h * 13.37 + d * 19.91) * 1000) | 0);

  // ── 난수로 프로파일 파라미터 자체를 생성 (정형화 제거) ──
  const peakT = 0.15 + rand() * 0.3; // 최대 폭 높이 (0.15~0.45)
  const topTaper = 0.3 + rand() * 0.5; // 상단 좁아지는 정도 (0.3~0.8)
  const topPow = 1.0 + rand() * 1.5; // 상단 커브 지수 (1.0~2.5)
  const baseWidth = 0.4 + rand() * 0.5; // 바닥 폭 비율 (0.4~0.9)
  const asymX = (rand() - 0.5) * 0.4; // 좌우 비대칭 (-0.2~0.2)
  const asymZ = (rand() - 0.5) * 0.4; // 전후 비대칭
  const flatTop = typeName === 'tabular' ? 0.7 + rand() * 0.25 : rand() * 0.15;
  const warpAmt = 0.08 + rand() * 0.2; // 대규모 뒤틀림 강도
  const noiseScale = 1.5 + rand() * 3.0; // 노이즈 주파수
  // //! [Original Code] 노이즈 강도 설정 (비교적 밋밋한 표면)
  // const noiseAmt  = 0.08 + rand() * 0.18;         // 노이즈 강도

  // //* [Modified Code] 지형 노이즈를 강하게 주어 빙하 표면이 울퉁불퉁하도록 상향 조정
  const noiseAmt = 0.2 + rand() * 0.35; // 노이즈 강도 대폭 상향

  // 빙하별 고유 3D 노이즈 오프셋 (같은 함수여도 완전 다른 결과)
  const ox = rand() * 100,
    oy = rand() * 100,
    oz = rand() * 100;

  // 랜덤 돌기/능선 최대 4개
  const bumpCount = Math.floor(rand() * 4) + 1;
  const bumps = [];
  for (let b = 0; b < bumpCount; b++) {
    bumps.push({
      angle: rand() * Math.PI * 2,
      tCenter: 0.3 + rand() * 0.5,
      width: 0.15 + rand() * 0.3,
      height: 0.05 + rand() * 0.2,
    });
  }

  // 능선 (길게 이어지는 돌출)
  const ridgeCount = Math.floor(rand() * 3);
  const ridges = [];
  for (let r = 0; r < ridgeCount; r++) {
    ridges.push({
      angle: rand() * Math.PI * 2,
      spread: 0.2 + rand() * 0.5,
      strength: 0.06 + rand() * 0.15,
    });
  }

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // t = 정규화 높이 [0=바닥, 1=꼭대기]
    const t = y * 0.5 + 0.5;
    // 정점의 수평 각도
    const theta = Math.atan2(z, x);

    // ── 1) 난수 기반 프로파일 (매 빙하마다 다른 실루엣) ──
    let rProfile;
    if (t < 0.05) {
      rProfile = baseWidth * (t / 0.05); // 바닥 끝 수렴
    } else if (t < peakT) {
      // 바닥 → 최대폭 구간
      const s = (t - 0.05) / (peakT - 0.05);
      rProfile = baseWidth + (1.0 - baseWidth) * smoothstep(s);
    } else if (flatTop > 0.3 && t > 1.0 - flatTop * 0.3) {
      // 평평한 상단 (tabular에서 강하게, 나머지는 약하게)
      const edge = 1.0 - flatTop * 0.3;
      const s = (t - edge) / (1.0 - edge);
      rProfile =
        (1.0 - topTaper * Math.pow((edge - peakT) / (1.0 - peakT), topPow)) *
        (1.0 - s * 0.15);
    } else {
      // 최대폭 → 상단 테이퍼
      const s = (t - peakT) / (1.0 - peakT);
      rProfile = 1.0 - topTaper * Math.pow(s, topPow);
    }
    rProfile = Math.max(0.02, rProfile);

    // ── 2) 방향별 비대칭 (한쪽이 더 넓거나 좁음) ──
    const asymFactor = 1.0 + asymX * Math.cos(theta) + asymZ * Math.sin(theta);

    // ── 3) 대규모 뒤틀림 (저주파 변형) ──
    const warp = fbm3D(x * 2.0 + ox, y * 2.0 + oy, z * 2.0 + oz, 2) * 2.0 - 1.0;

    // ── 4) 다중 옥타브 표면 노이즈 (미세한 불규칙) ──
    const surfNoise =
      fbm3D(
        x * noiseScale + ox + 50,
        y * noiseScale + oy + 50,
        z * noiseScale + oz + 50,
        4,
      ) *
        2.0 -
      1.0;

    // ── 5) 돌기 (bumps) ──
    let bumpVal = 0;
    for (const bump of bumps) {
      let angleDiff = Math.abs(theta - bump.angle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      const angFalloff = Math.exp(-angleDiff * angleDiff * 4);
      const tDiff = (t - bump.tCenter) / bump.width;
      const tFalloff = Math.exp(-tDiff * tDiff * 2);
      bumpVal += bump.height * angFalloff * tFalloff;
    }

    // ── 6) 능선 (ridges) ──
    let ridgeVal = 0;
    for (const ridge of ridges) {
      let angleDiff = Math.abs(theta - ridge.angle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      const falloff = Math.exp(
        (-angleDiff * angleDiff) / (ridge.spread * ridge.spread),
      );
      ridgeVal +=
        ridge.strength * falloff * (0.5 + 0.5 * Math.sin(t * Math.PI));
    }

    // ── 최종 반경 합산 ──
    const rFinal =
      rProfile * asymFactor +
      warp * warpAmt +
      surfNoise * noiseAmt +
      bumpVal +
      ridgeVal;

    // XZ 평면 적용
    const r0 = Math.sqrt(x * x + z * z) || 0.001;
    x = (x / r0) * Math.max(0.01, rFinal) * (w * 0.5);
    z = (z / r0) * Math.max(0.01, rFinal) * (d * 0.5);

    // Y 스케일링
    y = y * h * 0.5;

    // 바닥 평탄화
    const flatY = -h * 0.38;
    if (y < flatY) {
      y = flatY + (y - flatY) * 0.1;
    }

    // Y 방향 노이즈 (표면 울퉁불퉁)
    const yNoise =
      fbm3D(x * 0.02 + ox + 200, y * 0.02 + oy + 200, z * 0.02 + oz + 200, 3) *
        2.0 -
      1.0;
    y += yNoise * h * 0.06 * Math.sin(t * Math.PI);

    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// 항로별 호위 쇄빙선 3D 모델 기본 시각 특성 (asset.visual 미지정 시 = 아라온)
const ESCORT_DEFAULT_VISUAL = {
  hull: 0xc0392b, deck: 0x6b1e17, sup: 0xecf0f1, window: 0x1a365d,
  accent: 0xe67e22, gray: 0x4a5568, funnelBand: 0xc0392b,
  helideck: true, crane: true, stripe: null, reactor: false,
};

// 자산 visual 에 맞춰 쇄빙선 3D 그룹을 생성. { group, mesh } 반환.
//  · 공통: flared 쇄빙 선체 + 브리지 + 마스트 + 펀넬
//  · crane=true  → 후방 A-프레임 크레인(아라온)
//  · stripe!=null → 선체 양현 사선 흰 스트라이프(캐나다 해안경비대)
//  · reactor=true → 원자로 격납 돔(원자력 쇄빙선)
function buildIcebreakerMesh(matScale, trackDisposable, visual) {
  const V = visual || ESCORT_DEFAULT_VISUAL;
  const group = new THREE.Group();
  const mesh = new THREE.Group();
  const mk = (geo, mat, px, py, pz, rx = 0, ry = 0) => {
    trackDisposable(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.rotation.x = rx;
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    mesh.add(m);
  };
  const hull = matScale(V.hull, 0.6, 0.3);
  const dark = matScale(V.deck, 0.7, 0.25);
  const white = matScale(V.sup, 0.2, 0.15);
  const win = matScale(V.window, 0.9, 0.1);
  const accent = matScale(V.accent, 0.3, 0.5);
  const gray = matScale(V.gray, 0.7, 0.3);

  // ── 선체 (flared icebreaker bow) ──
  mk(new THREE.BoxGeometry(20, 10, 115), hull, 0, 0, 0);
  mk(new THREE.BoxGeometry(21, 4, 118), dark, 0, -6, 0);
  for (let i = 0; i < 4; i++) {
    const s = 1 - i * 0.18;
    mk(new THREE.BoxGeometry(20 * s, 2.5, 10), hull, 0, -1 - i * 1.2, -55 - i * 4);
  }
  mk(new THREE.CylinderGeometry(0, 11, 22, 4), hull, 0, 0, -66, 0, Math.PI / 4);

  // ── 캐나다 해안경비대 사선 흰 스트라이프 (양현) ──
  if (V.stripe) {
    const stripeMat = matScale(V.stripe, 0.2, 0.4);
    mk(new THREE.BoxGeometry(0.8, 6, 40), stripeMat, 10.4, 1, -8, 0, 0.16);
    mk(new THREE.BoxGeometry(0.8, 6, 40), stripeMat, -10.4, 1, -8, 0, -0.16);
  }

  // ── 상부구조(브리지 블록) ──
  mk(new THREE.BoxGeometry(16, 8, 28), white, 0, 9, -8);
  mk(new THREE.BoxGeometry(15, 6, 18), white, 0, 16, -12);
  mk(new THREE.BoxGeometry(18, 4, 14), white, 0, 21, -16);
  mk(new THREE.BoxGeometry(17, 2.5, 12), win, 0, 21.2, -17);

  // ── 마스트 & 안테나 ──
  mk(new THREE.CylinderGeometry(0.5, 0.7, 18, 8), gray, 0, 30, -14);
  mk(new THREE.BoxGeometry(7, 0.4, 2), gray, 0, 27, -14);
  mk(new THREE.BoxGeometry(5, 0.4, 2), gray, 0, 31, -14);

  // ── 선수 보강선 ──
  mk(new THREE.BoxGeometry(10, 0.3, 1), white, 0, 2, -45);

  // ── 전방 헬리데크 ──
  if (V.helideck) {
    mk(new THREE.CylinderGeometry(7, 7, 0.5, 16), white, 0, 6, -32);
    mk(new THREE.BoxGeometry(5, 0.1, 1), dark, 0, 6.3, -32);
    mk(new THREE.BoxGeometry(1, 0.1, 5), dark, 0, 6.3, -32);
  }

  // ── 후방 갑판 ──
  mk(new THREE.BoxGeometry(18, 0.5, 30), gray, 0, 5.5, 25);

  // ── 후방 A-프레임 크레인 (아라온 트레이드마크) ──
  if (V.crane) {
    mk(new THREE.BoxGeometry(1.5, 15, 1.5), accent, -7, 13, 25);
    mk(new THREE.BoxGeometry(1.5, 15, 1.5), accent, 7, 13, 25);
    mk(new THREE.BoxGeometry(16, 1.5, 1.5), accent, 0, 20, 25);
    mk(new THREE.BoxGeometry(1.2, 1.2, 20), accent, 0, 18, 30, 0.3);
    mk(new THREE.BoxGeometry(10, 3, 6), accent, 0, 7.5, 20);
  }

  // ── 원자로 격납 블록 (원자력 쇄빙선) ──
  if (V.reactor) {
    mk(new THREE.CylinderGeometry(5, 5, 8, 16), gray, 0, 10, 22);
    mk(
      new THREE.SphereGeometry(5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      accent,
      0,
      14,
      22,
    );
    mk(new THREE.CylinderGeometry(0.5, 0.6, 12, 8), gray, 0, 22, 22);
  }

  // ── 펀넬(연돌) + 상단 띠 ──
  mk(new THREE.BoxGeometry(4, 8, 5), white, 0, 14, -2);
  mk(new THREE.BoxGeometry(4.2, 1.2, 5.2), matScale(V.funnelBand, 0.4, 0.4), 0, 17.5, -2);

  // ── 구명정 데이빗 ──
  mk(new THREE.BoxGeometry(4, 1.5, 1.5), accent, -8, 12, -5);
  mk(new THREE.BoxGeometry(4, 1.5, 1.5), accent, 8, 12, -5);

  // 시각 가독성을 위해 본선(2.8x)보다 큰 스케일로 부스트
  mesh.scale.set(4.5, 4.5, 4.5);
  mesh.position.y = SHIP_BASE_Y;
  group.add(mesh);
  return { group, mesh };
}

// =============================================================================
// ThreeOverlay Component
// =============================================================================
const ThreeOverlay = forwardRef(function ThreeOverlay(
  { visible, shipState, specs, mode, baseRef, manualMode, escortAsset },
  ref,
) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  // All Three.js objects stored in a mutable ref so they survive re-renders
  // without triggering them.
  const ctx = useRef({
    renderer: null,
    scene: null,
    camera: null,
    // ocean
    waveGeo: null,
    waveMesh: null,
    // ship
    shipGroup3: null,
    shipMesh3: null,
    shipUpper3: null,
    cameraPivot3: null,
    // icebergs
    tIcebergs: [],
    realBergs: [],
    // foam
    foamGeo: null,
    foamPoints: null,
    // lighting (kept for night mode)
    ambientLight: null,
    sunLight: null,
    // land
    landGroup: null,
    // time accumulator
    tTime: 0,
    // motion state
    shipRoll: 0,
    shipRollVel: 0,
    shipPitch: 0,
    shipPitchVel: 0,
    shipHeave: 0,
    shipHeaveVel: 0,
    motionWavePhase: Math.random() * Math.PI * 2,
    impactRoll: 0,
    impactPitch: 0,
    impactActive: false,
    // Voyage Playback 거동 bias — 외부에서 매 tick 주입 (두께·파고 유도)
    voyagePitchBias: 0,
    voyageRollBias: 0,
    voyageHeaveBias: 0,
    voyagePitchBiasTarget: 0,
    voyageRollBiasTarget: 0,
    voyageHeaveBiasTarget: 0,
    // Voyage 얼음 컨텍스트 — 매 voyage tick 업데이트, 렌더 루프가 시간 기반 거동 계산
    voyageIceContext: null, // { thicknessM, speedKn, isEscorted }
    iceMotionPhase: Math.random() * Math.PI * 2, // 램 사이클 위상
    // 아라온 배치 상태 — 렌더 루프가 매 프레임 참조·lerp
    araonMode: null,        // 'escort' | 'dock' | null
    araonEscortConfig: null, // { forwardM, sideM }
    araonDockDelta: null,    // { deltaLatDeg, deltaLonDeg, refLat, headingDeg }
    // 전환 애니메이션 상태 (모드 바뀔 때 시작)
    araonTransitionStart: null, // { x, z, rotY } — 전환 시작 시점의 아라온 위치
    araonTransitionStartTime: 0,
    araonTransitionDuration: 2500, // ms
    // Real wave 오버라이드 — { Hs, Tp, dirDeg, headingDeg } | null
    realWaveInput: null,
    screenShakeT: 0,
    fovImpactBoost: 0,
    nightFactor: 0,
    nearestIceDist: Infinity,
    omegaR: BASE_OMEGA_R,
    omegaP: BASE_OMEGA_P,
    shipGM: 3.2,
    // ocean overlay
    oceanColorMode: 'none',
    overlayFrame: 119,
    // shared materials (created once)
    iceMat: null,
    subMat: null,
    realBergMat: null,
    discMat: null,
    ringMat: null,
    // disposables tracking
    disposables: [],
  });

  // ── Build helpers (closures over ctx) ────────────────────────────────────

  const trackDisposable = useCallback((obj) => {
    ctx.current.disposables.push(obj);
    return obj;
  }, []);

  // -- Sky dome --
  const buildSky = useCallback(() => {
    const { scene } = ctx.current;
    const skyGeo = trackDisposable(new THREE.SphereGeometry(400000, 16, 8));
    const skyMat = trackDisposable(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          skyTop: { value: new THREE.Color(0x3a6080) },
          skyMid: { value: new THREE.Color(0x6a9ab8) },
          skyHorizon: { value: new THREE.Color(0x8ab0c8) },
        },
        vertexShader: `varying float vH;void main(){vH=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `varying float vH;uniform vec3 skyTop,skyMid,skyHorizon;void main(){if(vH<0.0) discard; float t1=clamp(vH/400000.0,0.0,1.0);float t2=clamp(vH/80000.0,0.0,1.0);vec3 c=mix(skyHorizon,skyMid,t2);gl_FragColor=vec4(mix(c,skyTop,t1*t1),1.0);}`,
      }),
    );
    scene.add(new THREE.Mesh(skyGeo, skyMat));
  }, [trackDisposable]);

  // -- Lighting --
  const buildLighting = useCallback(() => {
    const { scene } = ctx.current;

    const ambient = new THREE.AmbientLight(0x8aaabb, 1.1);
    scene.add(ambient);
    ctx.current.ambientLight = ambient;

    const sun = new THREE.DirectionalLight(0xffeedd, 0.65);
    sun.position.set(500, 200, -800);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 100000;
    sun.shadow.camera.left = -40000;
    sun.shadow.camera.right = 40000;
    sun.shadow.camera.top = 40000;
    sun.shadow.camera.bottom = -40000;
    scene.add(sun);
    ctx.current.sunLight = sun;

    const sky = new THREE.DirectionalLight(0x6699bb, 0.45);
    sky.position.set(-300, 800, 400);
    scene.add(sky);
  }, []);

  // -- Ocean --
  const buildOcean = useCallback(() => {
    const { scene } = ctx.current;
    const waveGeo = trackDisposable(
      new THREE.PlaneGeometry(80000, 80000, 128, 128),
    );
    waveGeo.rotateX(-Math.PI / 2);
    const mat = trackDisposable(
      new THREE.MeshPhongMaterial({
        color: 0x0d4f8b,
        specular: 0x4a8aaa,
        shininess: 80,
        transparent: true,
        depthWrite: false,
        opacity: 1.0,
        vertexColors: true,
      }),
    );
    const waveMesh = new THREE.Mesh(waveGeo, mat);
    waveMesh.receiveShadow = true;
    scene.add(waveMesh);
    ctx.current.waveGeo = waveGeo;
    ctx.current.waveMesh = waveMesh;
  }, [trackDisposable]);

  // -- Icebergs --
  const placeOnWater = useCallback((mesh, x, z) => {
    mesh.position.set(x, 0, z);
    const box = new THREE.Box3().setFromObject(mesh);
    mesh.position.y = -box.min.y;
  }, []);

  const spawnIceberg = useCallback(
    (ox, oz, type) => {
      const { scene, tIcebergs, iceMat, discMat, ringMat } = ctx.current;
      // 불규칙 크기/비율 — 타입 범위 내에서도 폭/높이/깊이 비율이 매번 다름
      const wBase = rng(type.w[0], type.w[1]);
      const hBase = rng(type.h[0], type.h[1]);
      const dBase = rng(type.d[0], type.d[1]);
      // //! [Original Code] 기존 빙산 난수 변수 (변동성이 비교적 약함)
      // const sizeJitter = 0.7 + Math.random() * 0.6;  // 0.7~1.3 크기 변동
      // const ratioJitter = 0.6 + Math.random() * 0.8; // 0.6~1.4 종횡비 변동
      // const w = wBase * sizeJitter;
      // const h = hBase * sizeJitter * ratioJitter;
      // const d = dBase * sizeJitter * (0.5 + Math.random() * 1.0);

      // //* [Modified Code] 무작위 난수 범위를 확장하여 보다 다양한 형태, 크기의 빙산 표현
      const sizeJitter = 0.4 + Math.random() * 1.2; // 0.4~1.6 크기 변동 (범위 확장)
      const ratioJitter = 0.4 + Math.random() * 1.5; // 0.4~1.9 높이 종횡비 변동
      const w = wBase * sizeJitter * (0.8 + Math.random() * 0.4);
      const h = hBase * sizeJitter * ratioJitter * (0.6 + Math.random() * 0.8);
      const d = dBase * sizeJitter * (0.4 + Math.random() * 1.2);
      const bR = Math.max(Math.max(w, d) * 0.45, 3);

      const geo = trackDisposable(makeIceGeo(type.name, w, h, d));
      const mesh = new THREE.Mesh(geo, iceMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.rotation.y = Math.random() * Math.PI * 2;
      // 모든 타입에 불규칙 기울기 (tabular 포함)
      mesh.rotation.z = (Math.random() - 0.5) * 0.12;
      mesh.rotation.x = (Math.random() - 0.5) * 0.1;
      placeOnWater(mesh, ox, oz);

      const grp = new THREE.Group();
      grp.add(mesh);

      // Water-line contact layers (skip for growler / tiny small w<=40)
      if (w > 40) {
        const rr = Math.max(w, d) * 0.5;
        // Dark disc shadow beneath iceberg base
        const discGeo = trackDisposable(new THREE.CircleGeometry(rr * 0.9, 16));
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(ox, 0.1, oz);
        grp.add(disc);
        // Foam ring at waterline
        const ringGeo = trackDisposable(
          new THREE.RingGeometry(
            rr * 0.93,
            rr * 1.09,
            type.name === 'tabular' ? 20 : 14,
          ),
        );
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(ox, 0.3, oz);
        grp.add(ring);
      }

      scene.add(grp);
      tIcebergs.push({ grp, ox, oz, cx: ox, cz: oz, r: bR });
    },
    [trackDisposable, placeOnWater],
  );

  const buildIcebergs = useCallback((centerX = 0, centerZ = 0) => {
    const { scene, tIcebergs } = ctx.current;

    // Clear existing icebergs
    for (const ice of tIcebergs) {
      if (ice.grp.parent) ice.grp.parent.remove(ice.grp);
    }
    tIcebergs.length = 0;

    // 빙하 생성 중심점 저장 (재생성 판단용)
    ctx.current.icebergCenterX = centerX;
    ctx.current.icebergCenterZ = centerZ;

    // Close range: small/medium only
    const closeRanges = [60, 100, 155, 220, 310, 420];
    for (const dist of closeRanges) {
      const angle = Math.PI / 3 + Math.random() * ((Math.PI * 4) / 3);
      const closeType = dist < 180 ? ICE_TYPES[3] : ICE_TYPES[2];
      spawnIceberg(centerX + Math.cos(angle) * dist, centerZ + Math.sin(angle) * dist, closeType);
    }
    // Mid range: all types mixed
    for (let i = 0; i < 55; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = rng(500, 5000);
      spawnIceberg(centerX + Math.cos(angle) * dist, centerZ + Math.sin(angle) * dist, pickType());
    }
    // Far range: tabular/large 45% priority
    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = rng(5000, 90000);
      const farType =
        Math.random() < 0.45
          ? Math.random() < 0.4
            ? ICE_TYPES[0]
            : ICE_TYPES[1]
          : pickType();
      spawnIceberg(centerX + Math.cos(angle) * dist, centerZ + Math.sin(angle) * dist, farType);
    }
  }, [spawnIceberg]);

  // -- Real iceberg data (yellow) --
  const updateRealBergs = useCallback((bergs, shipLat, shipLon) => {
    const { scene, realBergs, realBergMat } = ctx.current;
    if (!scene || !realBergMat) {
      console.warn('[updateRealBergs] SKIP: scene=', !!scene, 'realBergMat=', !!realBergMat);
      return;
    }

    // Remove previous real berg meshes
    for (const grp of realBergs) {
      if (grp.parent) grp.parent.remove(grp);
    }
    realBergs.length = 0;

    if (!bergs || bergs.length === 0) {
      console.warn('[updateRealBergs] SKIP: no bergs data');
      return;
    }

    const bRefLat = baseRef?.lat ?? 35.1;
    const bRefLon = baseRef?.lon ?? 129.0;
    const mPerDegLon = 111319.491 * Math.cos((bRefLat * Math.PI) / 180);
    const VISIBLE_RANGE = 50000; // 50km

    const shipX = ctx.current.shipGroup3?.position.x ?? 0;
    const shipZ = ctx.current.shipGroup3?.position.z ?? 0;
    console.log('[updateRealBergs] bergs:', bergs.length,
      'baseRef:', bRefLat, bRefLon,
      'shipPos:', shipX.toFixed(1), shipZ.toFixed(1),
      'shipLatLon:', shipLat, shipLon,
      'first berg:', bergs[0]?.lat, bergs[0]?.lon);

    let filteredCount = 0;

    // 실시간 빙산의 로컬 좌표 변환: 출발항 기준 고정 월드 축 사용
    for (const berg of bergs) {
      const x = ((berg.lon - bRefLon) * mPerDegLon) / 1.5;
      const z = (-(berg.lat - bRefLat) * METERS_PER_DEGREE_LAT) / 1.5;
      const dist = Math.sqrt(
        Math.pow(x - shipX, 2) + Math.pow(z - shipZ, 2),
      );
      if (dist > VISIBLE_RANGE) { filteredCount++; continue; }

      // //* [Modified Code] 실측 길이·폭 + 추정 수면위 높이(freeboard) 반영.
      //   실제 빙산(lengthM/widthM 보유)은 실측 풋프린트로, 대리(고농도 해빙
      //   셀)는 기존 size 기반으로 렌더. 월드 스케일은 미터/1.5.
      let bw, h, bd, iceShape;
      if (berg.lengthM && berg.widthM) {
        const WS = 1.5; // 월드 스케일(미터→월드 유닛)
        // 풋프린트: 폭/길이를 실측대로 (가시성·성능 위해 상·하한 클램프)
        bw = Math.min(Math.max(berg.widthM / WS, 30), 8000);
        bd = Math.min(Math.max(berg.lengthM / WS, 30), 8000);
        // 수면 위 높이 = 추정 freeboard (작은 빙산도 보이도록 하한)
        h = Math.min(Math.max((berg.freeboardM || 10) / WS, 8), 600);
        iceShape = berg.type === 'tabular' ? 'tabular'
          : berg.type === 'large' ? 'large' : 'medium';
      } else {
        const size = Math.max(berg.size || 5000, 500);
        h = size * 0.15;
        bw = ((size * 0.3) / 1.5) * 2;
        bd = bw * 0.85;
        iceShape = 'medium';
      }
      const geo = makeIceGeo(iceShape, bw, h, bd);
      const mesh = new THREE.Mesh(geo, realBergMat);
      mesh.castShadow = true;
      const grp = new THREE.Group();
      grp.add(mesh);
      grp.position.set(x, h / 2, z);
      scene.add(grp);
      realBergs.push(grp);
    }
    console.log('[updateRealBergs] RESULT: added=', realBergs.length,
      'filtered(>50km)=', filteredCount, 'of total=', bergs.length);
  }, []);

  // -- Ship --
  const buildShip = useCallback(
    (shipType = 'bulk') => {
      const { scene } = ctx.current;
      if (ctx.current.shipGroup3) {
        scene.remove(ctx.current.shipGroup3);
      }

      const shipGroup3 = new THREE.Group();
      const shipMesh3 = new THREE.Group();
      const shipUpper3 = new THREE.Group(); // 상부구조 — BRIDGE 모드에서 숨김
      const cameraPivot3 = new THREE.Object3D();

      // 선체 파트를 shipMesh3에 직접 추가 (BRIDGE 모드에서도 표시)
      const mkH = (geo, mat, px, py, pz, rx = 0, ry = 0) => {
        trackDisposable(geo);
        trackDisposable(mat);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(px, py, pz);
        m.rotation.x = rx;
        m.rotation.y = ry;
        m.castShadow = true;
        m.receiveShadow = true;
        shipMesh3.add(m);
      };
      // 상부구조 파트를 shipUpper3에 추가 (BRIDGE 모드에서 숨김)
      const mkU = (geo, mat, px, py, pz, rx = 0, ry = 0) => {
        trackDisposable(geo);
        trackDisposable(mat);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(px, py, pz);
        m.rotation.x = rx;
        m.rotation.y = ry;
        m.castShadow = true;
        m.receiveShadow = true;
        shipUpper3.add(m);
      };

      // ── 프리미엄 머티리얼 팔레트 (Standard Material + Environment Reflection) ──
      const matScale = (c, met = 0.5, rog = 0.4) => {
        const m = new THREE.MeshStandardMaterial({
          color: c,
          metalness: met,
          roughness: rog,
          envMapIntensity: 1.2,
        });
        trackDisposable(m);
        return m;
      };

      const C = {
        iceRed: matScale(0x9b1c1c, 0.6, 0.3),
        iceDark: matScale(0x4a1212, 0.7, 0.2),
        lngHull: matScale(0x1e3a8a, 0.5, 0.4),
        conHull: matScale(0x334155, 0.4, 0.5),
        white: matScale(0xf8fafc, 0.2, 0.1),
        deck: matScale(0x334155, 0.3, 0.6),
        window: matScale(0x0f172a, 0.9, 0.1), // 반사율 높은 창문
        tank: matScale(0xe2e8f0, 0.4, 0.3),
        tankPipe: matScale(0x64748b, 0.8, 0.2),
        box1: matScale(0x0284c7, 0.3, 0.6),
        box2: matScale(0xd97706, 0.3, 0.6),
        box3: matScale(0x059669, 0.3, 0.6),
        dark: matScale(0x0f172a, 0.8, 0.1),
        gold: matScale(0xb45309, 0.9, 0.1), // 안테나/센서용
      };

      if (shipType === 'bulk') {
        // 🚢 [BULK CARRIER] 대형 벌크선 — 빨간 선체 + 화물창 커버 + 선미 거주구역
        // 사진 레퍼런스: Capesize/Supramax 벌크 캐리어

        // ── 선체 (짙은 빨강/검정, 넓고 낮음) ──
        const bulkHull = matScale(0x8b1a1a, 0.5, 0.4);    // 짙은 빨강
        const bulkBottom = matScale(0x3a0e0e, 0.6, 0.3);  // 흘수선 아래 어두운 빨강
        const bulkDeck = matScale(0x2d3748, 0.3, 0.6);    // 갑판 회색
        const holdCover = matScale(0xb91c1c, 0.3, 0.5);   // 화물창 커버 빨강
        const holdFrame = matScale(0x1e293b, 0.4, 0.4);   // 화물창 프레임

        // 메인 선체
        mkH(new THREE.BoxGeometry(36, 14, 230), bulkHull, 0, 0, 0);
        mkH(new THREE.BoxGeometry(37, 6, 235), bulkBottom, 0, -8, 0);

        // 선수 (일반 상선 뱃머리 — V형)
        mkH(new THREE.CylinderGeometry(0, 20, 40, 4), bulkHull, 0, -2, -120, 0, Math.PI / 4);
        mkH(new THREE.BoxGeometry(30, 8, 20), bulkHull, 0, 3, -115);
        // 선수루 (forecastle)
        mkH(new THREE.BoxGeometry(34, 5, 25), bulkDeck, 0, 9, -105);

        // 갑판
        mkH(new THREE.BoxGeometry(36, 1, 230), bulkDeck, 0, 7.5, 0);

        // ── 화물창 커버 (6개, 빨간 직사각형 해치) ──
        for (let i = 0; i < 6; i++) {
          const pz = -80 + i * 30;
          // 화물창 커버 본체
          mkH(new THREE.BoxGeometry(28, 3, 24), holdCover, 0, 9.5, pz);
          // 커버 프레임 (테두리)
          mkH(new THREE.BoxGeometry(30, 0.5, 26), holdFrame, 0, 11.2, pz);
          // 커버 중앙선
          mkH(new THREE.BoxGeometry(0.8, 3.5, 24), holdFrame, 0, 9.5, pz);
        }

        // ── 갑판 통로 (좌우 난간) ──
        for (let i = -1; i <= 1; i += 2) {
          mkH(new THREE.BoxGeometry(0.5, 2.5, 200), C.dark, 17 * i, 9, -10);
        }

        // ── 선미 거주구역 (흰색, 다층) ──
        mkU(new THREE.BoxGeometry(34, 20, 40), C.white, 0, 18, 85);
        mkU(new THREE.BoxGeometry(36, 3, 38), C.white, 0, 30, 84);  // 브릿지 데크
        mkU(new THREE.BoxGeometry(38, 5, 22), C.white, 0, 33, 78);  // 브릿지 윙
        mkU(new THREE.BoxGeometry(36, 3, 20), C.window, 0, 33.5, 77); // 브릿지 창

        // 층간 라인 (각 층 구분)
        for (let i = 0; i < 4; i++) {
          mkU(new THREE.BoxGeometry(34.5, 0.5, 40), bulkDeck, 0, 10 + i * 5, 85);
        }

        // ── 펀넬 (연돌) ──
        mkU(new THREE.BoxGeometry(8, 14, 8), C.white, 0, 38, 95);
        mkU(new THREE.BoxGeometry(8.5, 2, 8.5), C.dark, 0, 44.5, 95);  // 상단 검정 띠
        mkU(new THREE.BoxGeometry(6, 1, 6), matScale(0xef4444, 0.3, 0.5), 0, 42, 95);  // 빨간 라인

        // ── 마스트 ──
        mkU(new THREE.CylinderGeometry(0.6, 0.8, 20, 8), C.dark, 0, 43, 78);
        mkU(new THREE.BoxGeometry(8, 0.5, 2), C.dark, 0, 50, 78);   // 레이더 가이드
        mkU(new THREE.BoxGeometry(6, 0.5, 1.5), C.gold, 0, 53, 78); // 안테나

        // 선수 마스트
        mkH(new THREE.CylinderGeometry(0.5, 0.7, 15, 8), C.dark, 0, 16, -100);
      } else if (shipType === 'lng') {
        // 🛢 [LNG CARRIER] 압도적인 크기의 에너지 운반선
        // 거대 선체 (Freeboard가 높음)
        mkH(new THREE.BoxGeometry(48, 22, 320), C.lngHull, 0, 0, 0);
        mkH(new THREE.BoxGeometry(49, 8, 322), C.dark, 0, -12, 0);

        // LNG 탱크 보호 커버 (Membrane 돔 스타일)
        for (let i = 0; i < 4; i++) {
          const pz = -120 + i * 75;
          mkH(
            new THREE.SphereGeometry(
              22,
              32,
              16,
              0,
              Math.PI * 2,
              0,
              Math.PI / 2,
            ),
            C.tank,
            0,
            11,
            pz,
          );
          // 탱크 베이스 사각형 구조
          mkH(new THREE.BoxGeometry(44, 5, 60), C.white, 0, 12, pz);
          // 파이프 라인 시스템
          mkH(
            new THREE.CylinderGeometry(1.2, 1.2, 310, 8),
            C.tankPipe,
            12,
            16,
            0,
            Math.PI / 2,
          );
          mkH(
            new THREE.CylinderGeometry(0.8, 0.8, 44, 8),
            C.tankPipe,
            0,
            18,
            pz,
            0,
            0,
            Math.PI / 2,
          );
        }

        // 거주구역 (고층 빌딩 스타일)
        mkU(new THREE.BoxGeometry(44, 35, 60), C.white, 0, 28, 130);
        for (let i = 0; i < 5; i++) {
          mkU(new THREE.BoxGeometry(44.5, 2, 55), C.deck, 0, 15 + i * 7, 130); // 층간 구분선
        }
        mkU(new THREE.BoxGeometry(40, 8, 30), C.white, 0, 50, 120); // 최상단 브릿지
        mkU(new THREE.BoxGeometry(42, 4, 28), C.window, 0, 51, 108); // 전면 대형창

        // 트윈 연돌 (웅장함 강조)
        mkU(new THREE.BoxGeometry(8, 25, 12), C.dark, -10, 55, 145);
        mkU(new THREE.BoxGeometry(8, 25, 12), C.dark, 10, 55, 145);
      } else {
        // 📦 [CONTAINER SHIP] 촘촘하고 빈틈없는 적재 위용
        mkH(new THREE.BoxGeometry(42, 16, 280), C.conHull, 0, 0, 0);
        mkH(new THREE.BoxGeometry(44, 1, 280), C.deck, 0, 8.5, 0);

        // 컨테이너 멀티 스택 (박스 수 대폭 증가 -> 하지만 시야 확보를 위해 층수 제한)
        const colors = [C.box1, C.box2, C.box3];
        for (let row = 0; row < 8; row++) {
          const pz = -120 + row * 34;
          if (row === 5) continue; // 브릿지 공간 비움
          for (let col = -1; col <= 1; col++) {
            // //* [Modified Code] 최대 4층(2 + (0~2))으로 제한하여 선교에서 뱃머리를 볼 때 가리지 않도록 물리량 하향
            const height = 2 + Math.floor(Math.random() * 3);
            for (let h = 0; h < height; h++) {
              const color = colors[(row + col + h) % 3];
              mkH(
                new THREE.BoxGeometry(12, 6, 30),
                color,
                col * 13,
                11.5 + h * 6.2,
                pz,
              );
            }
          }
        }

        // 거주구역 (중앙 집중형)
        mkU(new THREE.BoxGeometry(40, 45, 35), C.white, 0, 30, 50);
        mkU(new THREE.BoxGeometry(46, 6, 25), C.white, 0, 48, 45); // 브릿지 윙
        mkU(new THREE.BoxGeometry(45, 3.5, 23), C.window, 0, 48.5, 44);

        // 대형 마스트 및 통신 그리드
        mkU(new THREE.BoxGeometry(2, 20, 2), C.dark, 0, 60, 55);
        mkU(new THREE.BoxGeometry(20, 1, 1), C.dark, 0, 65, 55);
        mkU(new THREE.BoxGeometry(15, 1, 1), C.dark, 0, 72, 55);
      }

      // //! [Original Code] 작은 선박 스케일
      // shipMesh3.scale.set(1.4, 1.4, 1.4);

      // //* [Modified Code] 주변 배경(빙하 등)에 대비되어 너무 작게 느껴지지 않도록 선박 크기 상향 커스텀
      shipMesh3.scale.set(2.8, 2.8, 2.8);
      shipMesh3.position.y = SHIP_BASE_Y;
      shipMesh3.add(shipUpper3);
      shipGroup3.add(shipMesh3);
      shipGroup3.add(cameraPivot3);
      scene.add(shipGroup3);

      ctx.current.shipGroup3 = shipGroup3;
      ctx.current.shipMesh3 = shipMesh3;
      ctx.current.shipUpper3 = shipUpper3;
      ctx.current.cameraPivot3 = cameraPivot3;

      // ── Wake ribbon (선미뷰 궤적 리본) — FOLLOW 뷰 전용 ─────────────
      // 선박 뒤에 남는 쇄빙 궤적. 최신 포인트일수록 밝고, 꼬리로 갈수록 페이드.
      const WAKE_MAX = 240;
      const wakePositions = new Float32Array(WAKE_MAX * 3);
      const wakeColors = new Float32Array(WAKE_MAX * 3);
      const wakeGeo = new THREE.BufferGeometry();
      wakeGeo.setAttribute('position', new THREE.BufferAttribute(wakePositions, 3));
      wakeGeo.setAttribute('color', new THREE.BufferAttribute(wakeColors, 3));
      wakeGeo.setDrawRange(0, 0);
      trackDisposable(wakeGeo);
      const wakeMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        linewidth: 2,
        depthWrite: false,
      });
      trackDisposable(wakeMat);
      const wakeLine = new THREE.Line(wakeGeo, wakeMat);
      wakeLine.frustumCulled = false;
      wakeLine.renderOrder = 5;
      wakeLine.visible = false; // 기본 숨김 (FOLLOW 진입 시 활성화)
      scene.add(wakeLine);

      ctx.current.wakeLine = wakeLine;
      ctx.current.wakeGeo = wakeGeo;
      ctx.current.wakePositions = wakePositions;
      ctx.current.wakeColors = wakeColors;
      ctx.current.wakeMaxPoints = WAKE_MAX;
      ctx.current.wakeCount = 0;        // 현재 저장된 포인트 수
      ctx.current.wakeLastT = 0;        // 마지막 push 시각 (ms)
      ctx.current.wakeLastPos = null;   // 마지막 push 위치 (중복 방지)

      // ── 호위 쇄빙선 3D 모델 (항로별 자산 특성 반영, 재구성 가능) ──
      // matScale 을 ctx 에 보관 → 자산 전환 시 setEscortAsset 이 재사용해 재구성.
      ctx.current.matScale = matScale;
      const { group: araonGroup, mesh: araonMesh } = buildIcebreakerMesh(
        matScale,
        trackDisposable,
        ctx.current.escortVisual || ESCORT_DEFAULT_VISUAL,
      );
      araonGroup.visible = false;
      scene.add(araonGroup);

      ctx.current.araonGroup = araonGroup;
      ctx.current.araonMesh = araonMesh;
    },
    [trackDisposable],
  );

  // -- Foam wake particles --
  const buildFoam = useCallback(() => {
    const { scene } = ctx.current;
    const foamGeo = trackDisposable(new THREE.BufferGeometry());
    const pos = new Float32Array(FOAM_COUNT * 3);
    for (let i = 0; i < FOAM_COUNT; i++) {
      pos[i * 3] = 0;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = 0;
    }
    foamGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = trackDisposable(
      new THREE.PointsMaterial({
        color: 0xddf4ff,
        size: 4,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    const foamPoints = new THREE.Points(foamGeo, mat);
    scene.add(foamPoints);
    ctx.current.foamGeo = foamGeo;
    ctx.current.foamPoints = foamPoints;
  }, [trackDisposable]);

  // -- Land masses (실제 0.05° 전역 마스크 기반 해안선) --
  // 선박 현재 위치(centerLat/Lon) 주변 ±LAND_RADIUS_DEG 영역을 마스크에서 샘플링하여
  // 섬·반도·내륙을 '수면 위 입체 지면'으로 렌더. 패치는 선박의 현재 scene 위치를
  // 원점으로 배치 → 장거리 항해의 투영 누적오차 없이 육지가 항상 배 밑에 정확히 옴.
  // 선박이 LAND_REBUILD_DEG 이상 이동하면 위 effect가 본 함수를 재호출(재중심화).
  const buildLandMasses = useCallback(
    (centerLat, centerLon, imagery = null, elev = null) => {
      const { scene } = ctx.current;
      if (!scene) return;

      // 이전 육지 정리 (재빌드 시 메모리 누수 방지 — 텍스처 포함)
      if (ctx.current.landGroup) {
        scene.remove(ctx.current.landGroup);
        ctx.current.landGroup.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (o.material.map) o.material.map.dispose();
            o.material.dispose();
          }
        });
        ctx.current.landGroup = null;
      }

      // 마스크 미로드 시 육지 없이 종료 — 로드 완료 후 재호출됨(1회 경고)
      if (!isGlobalLandMaskReady()) {
        if (!ctx.current._landMaskWarned) {
          ctx.current._landMaskWarned = true;
          console.warn('[land] 전역 마스크 미로드 — 육지 렌더 대기(로드 완료 후 자동 빌드)');
        }
        return;
      }

      // 패치 원점 = 선박 현재 scene 위치(없으면 0,0). 셀은 선박 기준 미터 오프셋으로 배치.
      const ship = ctx.current.shipGroup3;
      const sx = ship ? ship.position.x : 0;
      const sz = ship ? ship.position.z : 0;
      const mPerDegLon =
        METERS_PER_DEGREE_LON_AT_EQUATOR * Math.cos((centerLat * Math.PI) / 180);
      const ll = (lat, lon) => ({
        x: sx + ((lon - centerLon) * mPerDegLon) / LAND_SCENE_SCALE,
        z: sz + (-(lat - centerLat) * METERS_PER_DEGREE_LAT) / LAND_SCENE_SCALE,
      });

      // ── 실사 지형(2단계): 실제 고도(Cesium DEM) + 위성 텍스처 스무스 하이트필드 ──
      // elev 격자를 연속 삼각망으로 만들고 실제 높이로 변위, 정점법선으로 매끈한 음영.
      // 바다(고도≤SEA)는 y=0(수면), 전부 바다인 사각형은 스킵(Three 바다 노출).
      if (elev) {
        const N = elev.N;
        const SEA = 0.8; // m 이상이면 육지
        const latOf = (j) => elev.lat0 + j * elev.dLat;
        const lonOf = (i) => elev.lon0 + i * elev.dLon;
        const pos = [];
        const uv = [];
        const col = [];
        const mkV = (lat, lon) => {
          const p = ll(lat, lon);
          const h = elev.heightAt(lat, lon);
          const land = h > SEA;
          return {
            x: p.x,
            y: land ? Math.max(3, h / LAND_SCENE_SCALE) : 0,
            z: p.z,
            lat,
            lon,
            land,
          };
        };
        const push = (v) => {
          pos.push(v.x, v.y, v.z);
          const t = imagery ? imagery.uvOf(v.lat, v.lon) : [0, 0];
          uv.push(t[0], t[1]);
          col.push(1, 1, 1);
        };
        for (let j = 0; j < N - 1; j++) {
          for (let i = 0; i < N - 1; i++) {
            const a = mkV(latOf(j), lonOf(i));
            const b = mkV(latOf(j), lonOf(i + 1));
            const c = mkV(latOf(j + 1), lonOf(i + 1));
            const d = mkV(latOf(j + 1), lonOf(i));
            if (!(a.land || b.land || c.land || d.land)) continue; // 전부 바다 → 스킵
            push(a); push(b); push(c);
            push(a); push(c); push(d);
          }
        }
        if (pos.length === 0) return; // 주변 전부 바다
        const geo = trackDisposable(new THREE.BufferGeometry());
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.computeVertexNormals(); // 매끈한 음영(faceting 제거)
        const mat = trackDisposable(
          new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 1.0,
            metalness: 0.0,
            side: THREE.DoubleSide,
            fog: false,
            map: imagery ? imagery.texture : null,
            emissive: 0x1c1c1c,
            emissiveIntensity: 0.14,
          }),
        );
        const grp = new THREE.Group();
        grp.add(new THREE.Mesh(geo, mat));
        scene.add(grp);
        ctx.current.landGroup = grp;
        console.info(`[land] REAL terrain N=${N} verts=${pos.length / 3}`);
        return;
      }

      // 가시 영역: 경도는 cos(lat)로 보정해 화면 폭을 채움
      const cosC = Math.max(0.18, Math.cos((centerLat * Math.PI) / 180));
      const latR = LAND_RADIUS_DEG;
      const lonR = LAND_RADIUS_DEG / cosC;
      const snap = (v) => Math.round(v / LAND_RES) * LAND_RES;
      const lat0 = snap(centerLat - latR);
      const lon0 = snap(centerLon - lonR);
      const nLat = Math.round((2 * latR) / LAND_RES) + 1;
      const nLon = Math.round((2 * lonR) / LAND_RES) + 1;
      if (nLat <= 0 || nLon <= 0 || nLat * nLon > 60000) return; // 안전 가드

      const wrap = (x) => (((x + 180) % 360) + 360) % 360 - 180;
      const latAt = (j) => lat0 + j * LAND_RES;
      const lonAt = (i) => lon0 + i * LAND_RES;

      // 1) 육지 여부 + 셀별 고도(해안 저지 → 내륙 고지, 자연 기복)
      const isL = new Uint8Array(nLat * nLon);
      for (let j = 0; j < nLat; j++) {
        const la = latAt(j);
        if (la < -90 || la > 90) continue;
        for (let i = 0; i < nLon; i++) {
          if (isLandGlobal(la, wrap(lonAt(i)))) isL[j * nLon + i] = 1;
        }
      }
      const cellAt = (j, i) =>
        j < 0 || j >= nLat || i < 0 || i >= nLon ? 0 : isL[j * nLon + i];
      // 결정적 의사난수(재빌드 시 높이 안정 — Math.random 미사용)
      const hash = (i, j) => {
        const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
        return s - Math.floor(s); // 0..1
      };
      // 고도: 해안 기본 + (육지 이웃 수 × 가산) + 셀 기복 → 안쪽일수록 높음
      const H = new Float32Array(nLat * nLon);
      for (let j = 0; j < nLat; j++) {
        for (let i = 0; i < nLon; i++) {
          if (!isL[j * nLon + i]) continue;
          const nb =
            cellAt(j + 1, i) + cellAt(j - 1, i) + cellAt(j, i + 1) + cellAt(j, i - 1);
          H[j * nLon + i] =
            LAND_COAST_H + nb * LAND_HILL_H + hash(i, j) * LAND_NOISE_H;
        }
      }
      // 이웃 바닥높이: 육지면 그 고도, 바다/패치밖이면 수면 아래(LAND_BOTTOM)
      const floorAt = (j, i) =>
        j < 0 || j >= nLat || i < 0 || i >= nLon
          ? LAND_BOTTOM
          : isL[j * nLon + i] ? H[j * nLon + i] : LAND_BOTTOM;

      // 2) 메쉬: 셀 윗면 + 이웃보다 높은 변에 측벽. imagery 있으면 실제 위성 UV 입힘.
      const positions = [];
      const normals = [];
      const colors = [];
      const uvs = [];
      const half = LAND_RES / 2;
      const uvOf = imagery ? imagery.uvOf : null;
      // 정점 = {x,y,z, lat,lon}(UV 계산용)
      const V = (lat, lon, y) => {
        const p = ll(lat, lon);
        return { x: p.x, y, z: p.z, lat, lon };
      };
      const pushTri = (a, b, c, n, col) => {
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        for (const p of [a, b, c]) {
          normals.push(n.x, n.y, n.z);
          colors.push(col[0], col[1], col[2]);
          if (uvOf) {
            const uv = uvOf(p.lat, p.lon);
            uvs.push(uv[0], uv[1]);
          } else uvs.push(0, 0);
        }
      };
      const pushQuad = (p0, p1, p2, p3, n, col) => {
        pushTri(p0, p1, p2, n, col);
        pushTri(p0, p2, p3, n, col);
      };
      // 고도별 색(폴백): 저지 올리브 → 구릉 녹색 → 산지 황갈 → 설선 설백
      const colorFor = (h) =>
        h < 70 ? [0.46, 0.5, 0.3]
          : h < 120 ? [0.38, 0.54, 0.28]
            : h < 165 ? [0.58, 0.56, 0.46]
              : [0.95, 0.97, 1.0];
      // imagery 면: 윗면=흰색(위성 그대로), 측벽=약간 어둡게(음영). 폴백: 고도색/흙색.
      const topColFor = (h) => (imagery ? [1, 1, 1] : colorFor(h));
      const CLIFF = imagery ? [0.6, 0.56, 0.5] : [0.33, 0.3, 0.23];
      const UP = { x: 0, y: 1, z: 0 };

      for (let j = 0; j < nLat; j++) {
        const la = latAt(j);
        if (la < -90 || la > 90) continue;
        for (let i = 0; i < nLon; i++) {
          if (!isL[j * nLon + i]) continue;
          const lo = lonAt(i);
          const h = H[j * nLon + i];
          const la0 = la - half, la1 = la + half, lo0 = lo - half, lo1 = lo + half;
          // 윗면(법선 +y)
          pushQuad(
            V(la0, lo0, h), V(la0, lo1, h), V(la1, lo1, h), V(la1, lo0, h),
            UP, topColFor(h),
          );
          // 각 변: 이웃이 더 낮으면 그 차이만큼 측벽(coastal cliff/terrace)
          let nh;
          nh = floorAt(j, i + 1); // +lon (east)
          if (nh < h) pushQuad(
            V(la0, lo1, h), V(la1, lo1, h), V(la1, lo1, nh), V(la0, lo1, nh),
            { x: 1, y: 0, z: 0 }, CLIFF,
          );
          nh = floorAt(j, i - 1); // -lon (west)
          if (nh < h) pushQuad(
            V(la1, lo0, h), V(la0, lo0, h), V(la0, lo0, nh), V(la1, lo0, nh),
            { x: -1, y: 0, z: 0 }, CLIFF,
          );
          nh = floorAt(j + 1, i); // +lat (north)
          if (nh < h) pushQuad(
            V(la1, lo1, h), V(la1, lo0, h), V(la1, lo0, nh), V(la1, lo1, nh),
            { x: 0, y: 0, z: -1 }, CLIFF,
          );
          nh = floorAt(j - 1, i); // -lat (south)
          if (nh < h) pushQuad(
            V(la0, lo0, h), V(la0, lo1, h), V(la0, lo1, nh), V(la0, lo0, nh),
            { x: 0, y: 0, z: 1 }, CLIFF,
          );
        }
      }

      if (positions.length === 0) return; // 주변이 전부 바다 → 육지 없음
      // 진단: 육지가 안 보이면 콘솔에서 빌드 여부/규모 확인
      console.info(
        `[land] center=${centerLat.toFixed(2)},${centerLon.toFixed(2)} tris=${positions.length / 9}`,
      );

      const geo = trackDisposable(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      const mat = trackDisposable(
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 1.0,
          metalness: 0.0,
          side: THREE.DoubleSide,
          // 안개 워시아웃 차단 — 바다(안개 유지)와 대비되어 먼 육지도 또렷이 구분됨.
          fog: false,
          // imagery 있으면 실제 위성 텍스처를 입힘(정점색 흰색과 곱). 없으면 고도색.
          map: imagery ? imagery.texture : null,
          // 저조도/극야 대비 약한 자발광. 위성 텍스처일 땐 더 약하게(원색 보존).
          emissive: imagery ? 0x202020 : 0x2a2c26,
          emissiveIntensity: imagery ? 0.18 : 0.45,
        }),
      );
      const landGroup = new THREE.Group();
      landGroup.add(new THREE.Mesh(geo, mat));
      scene.add(landGroup);
      ctx.current.landGroup = landGroup;
    },
    [trackDisposable],
  );

  // ── Imperative methods exposed to parent via ref ──────────────────────────

  // animateOcean: wave vertex animation
  // //* [Modified Code] 수면을 실데이터 + 전진감으로 구동:
  //   1) 파고(Hs)·주기(Tp)·파향(dirDeg) 반영 — updateShipMotion 이 매 프레임 공유하는
  //      c.seaHs/seaTp/seaDirRad 값을 그대로 사용(실값 있으면 weather 데이터, 없으면 위도 합성).
  //        · Hs  → 파 진폭(시각적으로 자연스러운 범위로 압축)
  //        · Tp  → 시간 위상속도(긴 주기 = 느린 파)
  //        · dir → 방향성 swell(파가 진행하는 방향으로 마루가 이동)
  //   2) 선체 전방(bow) 방향으로 샘플 좌표를 누적 이동(flow)시켜 수면이 선미 쪽으로
  //      흘러가도록 → 순항 중인 배가 물살을 가르며 전진하는 시각. 정지 시 흐름 멈춤.
  const animateOcean = useCallback((t, shipRef) => {
    const c = ctx.current;
    const { waveGeo, waveMesh } = c;
    if (!waveGeo || !waveMesh) return;
    const sx = shipRef ? shipRef.x : 0;
    const sz = shipRef ? shipRef.z : 0;
    waveMesh.position.x = sx;
    waveMesh.position.z = sz;

    // ── 전진감 flow: 선체 전방(bow) 방향으로 샘플 좌표 누적 이동 ──
    // bow = (-sin ry, -cos ry) — 호위/카메라 규약과 동일.
    const ry = c.shipGroup3 ? c.shipGroup3.rotation.y : 0;
    const bowX = -Math.sin(ry);
    const bowZ = -Math.cos(ry);
    const dt = c.oceanLastT ? Math.min(0.1, t - c.oceanLastT) : 0.016;
    c.oceanLastT = t;
    // seaFlowSpeed: 렌더 루프가 매 프레임 선박 실제 이동속도(units/s)로 갱신.
    // 1x 순항(≈5 units/s) → factor≈1, 고배율/수동 가속 → 1.5 로 클램프, 정지 → 0.
    const SPEED_REF = 5;
    const CRUISE_FLOW = 150; // 화면상 수면 흐름속도(units/s)
    const factor = Math.min(1.5, (c.seaFlowSpeed || 0) / SPEED_REF);
    c.oceanFlow = (c.oceanFlow || 0) + CRUISE_FLOW * factor * dt;
    const fX = bowX * c.oceanFlow;
    const fZ = bowZ * c.oceanFlow;

    // ── 실데이터 반영: 파고(Hs)·주기(Tp)·파향(dirRad) ──
    const Hs = typeof c.seaHs === 'number' ? c.seaHs : 1.2;
    const Tp = typeof c.seaTp === 'number' && c.seaTp > 0 ? c.seaTp : 8;
    // 파고 → 진폭 게인 (실제 m 를 월드 유닛 파고로 자연스럽게 압축, 선체높이 대비 과하지 않게)
    const amp = Math.min(2.0, Math.max(0.35, Hs * 0.5));
    const omega = (2 * Math.PI) / Tp; // 주기 → 위상속도
    const dirRad = typeof c.seaDirRad === 'number' ? c.seaDirRad : null;

    const pos = waveGeo.attributes.position;
    if (dirRad !== null) {
      // 방향성 swell — 파가 "오는" 방위 dir → 진행방향 = dir+180 = (-sin, +cos)
      const pX = -Math.sin(dirRad);
      const pZ = Math.cos(dirRad);
      const qX = pZ; // 진행축 직교(가로)
      const qZ = -pX;
      const kMain = 0.00016; // 주 파장(렌더 가능 대역)
      const kDet = 0.0013;
      const kCross = 0.0019;
      for (let i = 0; i < pos.count; i++) {
        const wx = pos.getX(i) + sx + fX;
        const wz = pos.getZ(i) + sz + fZ;
        const dp = wx * pX + wz * pZ; // 진행축 좌표
        const dq = wx * qX + wz * qZ; // 가로축 좌표
        // -t*omega: 마루가 진행방향(+P)으로 이동
        pos.setY(
          i,
          amp * Math.sin(dp * kMain - t * omega * 1.1) +
            amp * 0.4 * Math.sin(dp * kDet - t * omega * 2.0) +
            amp * 0.25 * Math.cos(dq * kCross + t * omega * 1.6) +
            amp * 0.15 * Math.sin((dp - dq) * 0.0026 - t * omega * 2.6),
        );
      }
    } else {
      // 파향 정보 없음 — 등방성 합성(파고·주기 스케일만 반영)
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + sx + fX;
        const z = pos.getZ(i) + sz + fZ;
        pos.setY(
          i,
          amp * 0.42 * Math.sin(x * 0.00012 + t * omega * 0.9) +
            amp * 0.3 * Math.cos(z * 0.00015 + t * omega * 0.7) +
            amp * 0.24 * Math.sin((x + z) * 0.00008 + t * omega * 0.5) +
            amp * 0.16 * Math.sin(x * 0.0012 + t * 0.9) +
            amp * 0.12 * Math.cos(z * 0.0016 + t * 1.1) +
            amp * 0.08 * Math.sin((x - z) * 0.0026 + t * 1.4),
        );
      }
    }
    pos.needsUpdate = true;
    waveGeo.computeVertexNormals();
  }, []);

  // updateOceanOverlay: DataTexture 방식 — GPU 선형 필터로 부드러운 그라데이션
  const ICE_TEX_SIZE = 256;

  const updateOceanOverlay = useCallback(
    (colorMode, shipLon, shipLat, sampleIceConcentrationFn) => {
      const { waveGeo, waveMesh } = ctx.current;
      if (!waveMesh || !waveGeo) return;

      const modeChanged = ctx.current.oceanColorMode !== colorMode;
      ctx.current.oceanColorMode = colorMode;
      ctx.current.overlayFrame++;
      if (!modeChanged && ctx.current.overlayFrame % 120 !== 0) return;

      console.log(
        '[OceanOverlay]',
        colorMode,
        'lat:',
        shipLat?.toFixed(1),
        'lon:',
        shipLon?.toFixed(1),
      );

      const mat = waveMesh.material;
      if (!mat) return;

      // ── none 모드: 텍스처 제거, 원래 바다색 복원 ──
      if (colorMode === 'none') {
        mat.map = null;
        mat.vertexColors = false;
        mat.color.setHex(0x0d4f8b);
        mat.needsUpdate = true;
        return;
      }

      // ── ice/depth 모드: DataTexture 생성 또는 재사용 ──
      if (!ctx.current.iceTexData) {
        ctx.current.iceTexData = new Uint8Array(
          ICE_TEX_SIZE * ICE_TEX_SIZE * 4,
        );
        ctx.current.iceTex = new THREE.DataTexture(
          ctx.current.iceTexData,
          ICE_TEX_SIZE,
          ICE_TEX_SIZE,
        );
        ctx.current.iceTex.magFilter = THREE.LinearFilter;
        ctx.current.iceTex.minFilter = THREE.LinearFilter;
        ctx.current.iceTex.wrapS = THREE.ClampToEdgeWrapping;
        ctx.current.iceTex.wrapT = THREE.ClampToEdgeWrapping;
      }

      const data = ctx.current.iceTexData;
      const tex = ctx.current.iceTex;
      const metersPerDeg = 111320;
      const cosLat = Math.cos((shipLat * Math.PI) / 180);
      // 바다 메시 크기 80000 × 80000, 스케일 1.5
      const halfSize = 40000;

      for (let ty = 0; ty < ICE_TEX_SIZE; ty++) {
        for (let tx = 0; tx < ICE_TEX_SIZE; tx++) {
          // 텍셀 → 로컬 좌표 → 위경도
          const localX = (tx / (ICE_TEX_SIZE - 1) - 0.5) * 2 * halfSize;
          const localZ = (ty / (ICE_TEX_SIZE - 1) - 0.5) * 2 * halfSize;
          const vLon = shipLon + (localX * 1.5) / (metersPerDeg * cosLat);
          const vLat = shipLat - (localZ * 1.5) / metersPerDeg;

          const conc = sampleIceConcentrationFn
            ? sampleIceConcentrationFn(vLon, vLat)
            : 0;
          const idx = (ty * ICE_TEX_SIZE + tx) * 4;

          if (colorMode === 'ice') {
            // 자연색 모드: naturalIceRGBA가 RGBA 직접 반환
            const [r, g, b, a] = naturalIceRGBA(conc || 0);
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
          } else {
            let rgb;
            if (colorMode === 'thickness') {
              const thickM = (conc || 0) * 5.0;
              rgb = thicknessToRGB(thickM);
            } else if (colorMode === 'edge') {
              rgb = edgeToRGB(conc || 0);
            } else {
              rgb = depthToRGB(estimateBathymetry(vLon, vLat));
            }
            data[idx] = Math.round(rgb[0] * 255);
            data[idx + 1] = Math.round(rgb[1] * 255);
            data[idx + 2] = Math.round(rgb[2] * 255);
            data[idx + 3] = 255;
          }
        }
      }

      tex.needsUpdate = true;
      mat.map = tex;
      mat.vertexColors = false;
      mat.color.setHex(0xffffff);
      mat.needsUpdate = true;
    },
    [],
  );

  // updateFoam: animate bow-spray particles
  const updateFoam = useCallback((dt, heading, speedMS, shipPosVec) => {
    const { foamGeo, foamPoints } = ctx.current;
    if (!foamGeo || !foamPoints) return;
    if (speedMS < 0.1) {
      foamPoints.visible = false;
      return;
    }
    foamPoints.visible = true;
    const fwdX = Math.sin(heading);
    const fwdZ = -Math.cos(heading);
    const bowX = shipPosVec.x + fwdX * 85;
    const bowZ = shipPosVec.z + fwdZ * 85;
    const pa = foamGeo.attributes.position;
    for (let i = 0; i < FOAM_COUNT; i++) {
      let px = pa.getX(i);
      let py = pa.getY(i);
      let pz = pa.getZ(i);
      px -= fwdX * speedMS * dt * (0.6 + Math.random() * 0.4);
      pz -= fwdZ * speedMS * dt * (0.6 + Math.random() * 0.4);
      py = Math.max(0, py - dt * 1.5);
      const dx = px - shipPosVec.x;
      const dz = pz - shipPosVec.z;
      const dotFwd = dx * fwdX + dz * fwdZ;
      if (dotFwd < -280 || Math.sqrt(dx * dx + dz * dz) > 380) {
        px = bowX + (Math.random() - 0.5) * 18;
        py = 0.5 + Math.random() * 2.5;
        pz = bowZ + (Math.random() - 0.5) * 18;
      }
      pa.setXYZ(i, px, py, pz);
    }
    pa.needsUpdate = true;
  }, []);

  // updateShipPosition: move ship group position + heading (smooth lerp)
  const updateShipPosition = useCallback((posVec, targetHeading) => {
    const { shipGroup3 } = ctx.current;
    if (!shipGroup3) return;
    shipGroup3.position.copy(posVec);

    // Smooth heading rotation (lerp with wrapping)
    let diff = -targetHeading - shipGroup3.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    shipGroup3.rotation.y += diff * 0.05;
  }, []);

  // updateShipMotion: roll, pitch, heave based on sea state
  // realWaveInput 가 설정돼 있으면 실제 파고·파향·주기로 대체 (파향 있으면 축 분리).
  const updateShipMotion = useCallback((dt, lat) => {
    const c = ctx.current;
    let Hs;
    let Tp;
    let rollAxis = 1;   // roll 축 가중 (0..1)
    let pitchAxis = 1;  // pitch 축 가중 (0..1)
    let waveSource = 'synthetic';

    if (c.realWaveInput && typeof c.realWaveInput.Hs === 'number') {
      Hs = c.realWaveInput.Hs;
      Tp = c.realWaveInput.Tp > 0 ? c.realWaveInput.Tp : 8;
      const dirDeg = c.realWaveInput.dirDeg;
      const headingDeg = c.realWaveInput.headingDeg;
      if (
        typeof dirDeg === 'number' &&
        typeof headingDeg === 'number'
      ) {
        // 상대각: 파가 오는 방향 vs 뱃머리
        const rel = (((dirDeg - headingDeg + 540) % 360) - 180) * (Math.PI / 180);
        rollAxis = Math.abs(Math.sin(rel));   // 횡파=1, 종파=0
        pitchAxis = Math.abs(Math.cos(rel));  // 종파=1, 횡파=0
        waveSource = 'real+directed';
      } else {
        // 방향 없음 — 기본 비율 유지
        waveSource = 'real+scalar';
      }
    } else {
      const st = getSeaState(lat);
      Hs = st.Hs;
      Tp = st.Tp;
    }
    c.lastWaveSource = waveSource;
    // //* [Modified Code] 수면 렌더(animateOcean)가 동일한 파고/주기/파향을 쓰도록 공유.
    //   파향은 실데이터(dirDeg)가 있을 때만 방향성 swell 로 반영, 없으면 등방성.
    c.seaHs = Hs;
    c.seaTp = Tp;
    c.seaDirRad =
      c.realWaveInput && typeof c.realWaveInput.dirDeg === 'number'
        ? (c.realWaveInput.dirDeg * Math.PI) / 180
        : null;
    c.motionWavePhase = (c.motionWavePhase + dt * ((2 * Math.PI) / Tp)) % (Math.PI * 200);

    const zetaR = 0.05;
    const zetaP = 0.04;
    const rollAmpScale = Math.sqrt(BASE_GM / Math.max(0.5, c.shipGM));

    const aR =
      Hs *
      rollAmpScale *
      rollAxis *
      (0.018 * Math.sin(c.motionWavePhase + 0.3) +
        0.008 * Math.sin(c.motionWavePhase * 1.7 + 1.1));
    const aP =
      Hs *
      pitchAxis *
      (0.008 * Math.sin(c.motionWavePhase * 1.3 + 2.0) +
        0.004 * Math.sin(c.motionWavePhase * 0.8 + 0.5));
    const aH = Hs * 0.3 * Math.sin(c.motionWavePhase * 0.9 + 0.7);

    c.shipRollVel +=
      (-2 * zetaR * c.omegaR * c.shipRollVel -
        c.omegaR * c.omegaR * c.shipRoll +
        aR) *
      dt;
    c.shipRoll += c.shipRollVel * dt;

    c.shipPitchVel +=
      (-2 * zetaP * c.omegaP * c.shipPitchVel -
        c.omegaP * c.omegaP * c.shipPitch +
        aP) *
      dt;
    c.shipPitch += c.shipPitchVel * dt;

    c.shipHeaveVel +=
      (-0.08 * c.shipHeaveVel - c.omegaR * c.omegaR * c.shipHeave + aH) * dt;
    c.shipHeave += c.shipHeaveVel * dt;

    if (c.impactActive) {
      c.impactRoll *= 0.9;
      c.impactPitch *= 0.9;
      if (Math.abs(c.impactRoll) < 0.0005 && Math.abs(c.impactPitch) < 0.0005) {
        c.impactActive = false;
      }
    }
    if (c.screenShakeT > 0) c.screenShakeT = Math.max(0, c.screenShakeT - dt);
    if (c.fovImpactBoost > 0) {
      c.fovImpactBoost *= 0.92;
      if (c.fovImpactBoost < 0.05) c.fovImpactBoost = 0;
    }

    // ── 얼음 두께 기반 거동 (voyage 전용, 현실 쇄빙선 모델) ──
    // 비선형 커브 + 시간 기반 램 사이클.
    // < 0.8m: 미미 / 0.8~1.5m: bow-up 약 / 1.5~2.5m: 램 진동 / > 2.5m: 드라마틱 ride-up
    let icePitch = 0;
    let iceHeave = 0;
    let iceRoll = 0;
    if (c.voyageIceContext && typeof c.voyageIceContext.thicknessM === 'number') {
      const h = Math.max(0, c.voyageIceContext.thicknessM);
      const isEscorted = !!c.voyageIceContext.isEscorted;
      // 호위 받으면 effective thickness 가 낮아졌을 것 — 추가 감쇠
      const effH = isEscorted ? h * 0.55 : h;

      c.iceMotionPhase = (c.iceMotionPhase + dt * 1.2) % (Math.PI * 200);

      if (effH < 0.8) {
        // 얇은 얼음: 거의 자연 항해
        icePitch = effH * 0.015;
      } else if (effH < 1.5) {
        // 중간 두께: 점진적 bow-up, 약한 출렁임
        icePitch = 0.012 + (effH - 0.8) * 0.085;
        iceHeave = Math.sin(c.iceMotionPhase * 0.8) * (effH - 0.8) * 0.15;
      } else if (effH < 2.5) {
        // 두꺼움: 램 주기 진동
        const base = 0.072 + (effH - 1.5) * 0.11;
        const ramCycle = Math.sin(c.iceMotionPhase * 1.4);
        // 램 진동: 기준 pitch 주변 ±0.05 rad 오실레이션, 강도가 t 에 따라 증가
        icePitch = base + ramCycle * 0.045 * (effH - 1.5);
        iceHeave = Math.sin(c.iceMotionPhase * 1.4 + 1.2) * 0.25;
        // 간헐적 좌우 롤 (얼음에 한쪽이 걸릴 때)
        iceRoll = Math.sin(c.iceMotionPhase * 0.6 + 0.5) * 0.02 * (effH - 1.5);
      } else {
        // 매우 두꺼움: 드라마틱 ride-up + 강한 램 사이클
        const base = 0.182 + (effH - 2.5) * 0.14;
        const ramCycle = Math.sin(c.iceMotionPhase * 1.0);
        icePitch = base + ramCycle * 0.08;
        iceHeave = Math.sin(c.iceMotionPhase + 0.8) * 0.5;
        iceRoll = Math.sin(c.iceMotionPhase * 0.5) * 0.035;
      }
    }

    // Voyage bias 부드러운 추종 (target → current). 얼음 거동을 target 에 실시간 주입.
    const iceTargetPitch = (c.voyagePitchBiasTarget || 0) + icePitch;
    const iceTargetRoll = (c.voyageRollBiasTarget || 0) + iceRoll;
    const iceTargetHeave = (c.voyageHeaveBiasTarget || 0) + iceHeave;
    c.voyageRollBias += (iceTargetRoll - c.voyageRollBias) * Math.min(1, dt * 2.5);
    c.voyagePitchBias += (iceTargetPitch - c.voyagePitchBias) * Math.min(1, dt * 2.5);
    c.voyageHeaveBias += (iceTargetHeave - c.voyageHeaveBias) * Math.min(1, dt * 2.5);

    // Apply roll/pitch to shipMesh3
    if (c.shipMesh3) {
      c.shipMesh3.rotation.z = c.shipRoll + c.impactRoll + c.voyageRollBias;
      c.shipMesh3.rotation.x = c.shipPitch + c.impactPitch + c.voyagePitchBias;
      c.shipMesh3.position.y = SHIP_BASE_Y + c.shipHeave + c.voyageHeaveBias;
    }
  }, []);

  // 아라온 Three.js 3D 모델 위치/가시성 업데이트.
  // 두 가지 모드:
  //   1) trace 기반: { deltaLatDeg, deltaLonDeg, refLat, headingDeg, visible }
  //   2) escort override: { escortOverride: {forwardM, sideM}, headingDeg, visible }
  //      → trace 무시, 본선 heading 기준 앞/옆 offset으로 강제 배치
  // setAraonState: 모드·config 만 갱신. 실제 위치 이동은 렌더 루프가 매 프레임 lerp.
  // 모드가 바뀌면 전환 애니메이션 시작 (현재 아라온 위치 → 새 타겟으로 easeInOut)
  // 항로별 호위 자산 전환 — FOLLOW 모드 3D 쇄빙선 모델을 자산 특성으로 재구성.
  // (아라온/CCGS/원자력 쇄빙선이 색상·형태가 다르므로 mesh 자체를 교체)
  const setEscortAsset = useCallback((asset) => {
    const visual = asset?.visual || ESCORT_DEFAULT_VISUAL;
    const c = ctx.current;
    c.escortVisual = visual; // init 전이면 저장만 (init 이 이 값으로 빌드)
    if (!c.scene || !c.matScale) return;
    // 동일 자산이면 재구성 불필요
    if (c.escortAssetId === (asset?.id || 'araon') && c.araonGroup) return;
    c.escortAssetId = asset?.id || 'araon';

    const wasVisible = c.araonGroup ? c.araonGroup.visible : false;
    const prevPos = c.araonGroup ? c.araonGroup.position.clone() : null;
    // 기존 모델 제거 + dispose
    if (c.araonGroup) {
      c.scene.remove(c.araonGroup);
      c.araonGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    const { group, mesh } = buildIcebreakerMesh(c.matScale, trackDisposable, visual);
    group.visible = wasVisible;
    if (prevPos) group.position.copy(prevPos);
    c.scene.add(group);
    c.araonGroup = group;
    c.araonMesh = mesh;
  }, [trackDisposable]);

  // 활성 호위 자산(escortAsset) 변경 시 3D 모델 재구성 (FOLLOW 모드 반영)
  useEffect(() => {
    setEscortAsset(escortAsset);
  }, [escortAsset?.id, setEscortAsset]);

  const setAraonState = useCallback((input) => {
    const c = ctx.current;
    const group = c.araonGroup;
    if (!group) return;

    if (!input || !input.visible) {
      group.visible = false;
      c.araonMode = null;
      c.araonEscortConfig = null;
      c.araonDockDelta = null;
      c.araonTransitionStart = null;
      return;
    }

    const prevMode = c.araonMode;
    let nextMode = null;
    if (input.escortOverride) {
      nextMode = 'escort';
      c.araonEscortConfig = {
        forwardM: input.escortOverride.forwardM || 0,
        sideM: input.escortOverride.sideM || 0,
      };
    } else if (
      typeof input.deltaLatDeg === 'number' &&
      typeof input.deltaLonDeg === 'number'
    ) {
      nextMode = 'dock';
      c.araonDockDelta = {
        deltaLatDeg: input.deltaLatDeg,
        deltaLonDeg: input.deltaLonDeg,
        refLat: input.refLat || 70,
        headingDeg: input.headingDeg || 0,
      };
    }

    if (!nextMode) return;

    // 모드 변경 감지 → 전환 애니메이션 시작
    if (prevMode !== nextMode) {
      // 처음 등장(이전이 null) 또는 모드 전환
      if (group.visible && prevMode) {
        // 이전 상태에서 전환: 현재 위치를 시작점으로
        c.araonTransitionStart = {
          x: group.position.x,
          z: group.position.z,
          rotY: group.rotation.y,
        };
      } else {
        // 첫 등장 — 시작점 없음(즉시 타겟에 찍힘)
        c.araonTransitionStart = null;
      }
      c.araonTransitionStartTime = performance.now();
    }
    c.araonMode = nextMode;
    group.visible = true;
  }, []);

  // 실제 파고·파향·주기 주입 (weather_latest.json 에서 최근접 waypoint 기반).
  // null 전달 시 latitude 기반 합성으로 복귀.
  const setRealWaveInput = useCallback((input) => {
    const c = ctx.current;
    if (!input) {
      c.realWaveInput = null;
      return;
    }
    c.realWaveInput = {
      Hs: typeof input.Hs === 'number' ? input.Hs : 0,
      Tp: typeof input.Tp === 'number' ? input.Tp : 8,
      dirDeg: typeof input.dirDeg === 'number' ? input.dirDeg : null,
      headingDeg: typeof input.headingDeg === 'number' ? input.headingDeg : null,
    };
  }, []);

  // 매 voyage tick 마다 현재 얼음 컨텍스트 주입 (렌더 루프의 시간 기반 거동 로직이 사용)
  const setVoyageIceContext = useCallback((ctxInput) => {
    const c = ctx.current;
    if (!ctxInput) {
      c.voyageIceContext = null;
      return;
    }
    c.voyageIceContext = {
      thicknessM: ctxInput.thicknessM || 0,
      speedKn: ctxInput.speedKn || 0,
      isEscorted: !!ctxInput.isEscorted,
    };
  }, []);

  // Voyage Playback 이 외부에서 거동 bias 주입
  const setVoyageMotionBias = useCallback((bias) => {
    const c = ctx.current;
    if (!bias) {
      c.voyageRollBiasTarget = 0;
      c.voyagePitchBiasTarget = 0;
      c.voyageHeaveBiasTarget = 0;
      return;
    }
    c.voyageRollBiasTarget = bias.rollRad || 0;
    c.voyagePitchBiasTarget = bias.pitchRad || 0;
    c.voyageHeaveBiasTarget = bias.heaveM || 0;
  }, []);

  // 상부구조는 FOLLOW/위성 뷰 모두 항시 표시 (BRIDGE 모드 제거됨)
  useEffect(() => {
    if (ctx.current.shipUpper3) {
      ctx.current.shipUpper3.visible = true;
    }
  }, [mode]);

  // 실제 날씨(가시거리·기온·파고) 주입 — App 이 최근접 weather waypoint 기준으로 호출.
  // null 전달 시 '맑음' 기본값으로 복귀. 실제 시각 적용은 updateNightMode 가 매 프레임 lerp.
  const setWeatherVisuals = useCallback((input) => {
    const c = ctx.current;
    if (!input) {
      c.weatherVisibilityKm = null;
      c.weatherTempC = null;
      c.weatherHs = null;
      return;
    }
    c.weatherVisibilityKm =
      typeof input.visibilityKm === 'number' ? input.visibilityKm : null;
    c.weatherTempC =
      typeof input.temperatureC === 'number' ? input.temperatureC : null;
    c.weatherHs = typeof input.Hs === 'number' ? input.Hs : null;
  }, []);

  // updateNightMode: polar night lighting transition + 실제 날씨 반영
  // //* [Modified Code] 가시거리 → 안개 밀도/연무, 파고·저가시 → 흐림(overcast)으로
  //   하늘 배경/안개색 회색화 + 광량 감소. 극야(nightFactor)와 자연스럽게 합성.
  const updateNightMode = useCallback((lat) => {
    const c = ctx.current;
    const tgt = lat > 82 ? 1 : 0;
    c.nightFactor += (tgt - c.nightFactor) * 0.005;

    // ── 실제 날씨 타겟 (없으면 맑음 가정) ──
    const visKm =
      typeof c.weatherVisibilityKm === 'number' ? c.weatherVisibilityKm : 18;
    const Hs = typeof c.weatherHs === 'number' ? c.weatherHs : 1.0;
    const visNorm = Math.max(0.05, Math.min(1, visKm / 20));
    // 거친 바다(Hs↑) 또는 낮은 가시거리 → 흐림(0..1)
    const overcast = Math.max(
      0,
      Math.min(1, Math.max((Hs - 1.0) / 4.0, 1 - visNorm)),
    );
    c.weatherOvercast = overcast;
    const dim = 1 - overcast * 0.45; // 흐릴수록 광량 감소

    if (c.ambientLight) {
      const tgtA = (0.15 + 0.55 * (1 - c.nightFactor)) * dim;
      c.ambientLight.intensity += (tgtA - c.ambientLight.intensity) * 0.02;
    }
    if (c.sunLight) {
      const tgtS = (0.3 + 1.1 * (1 - c.nightFactor)) * dim;
      c.sunLight.intensity += (tgtS - c.sunLight.intensity) * 0.02;
    }
    if (c.scene && c.scene.fog) {
      const nightC = new THREE.Color(0x050d18);
      const clearC = new THREE.Color(0x7a9fb5);
      const overcastC = new THREE.Color(0x9aa6ad);
      const dayC = clearC.clone().lerp(overcastC, overcast);
      c.scene.fog.color.lerp(c.nightFactor > 0.5 ? nightC : dayC, 0.02);
      // 가시거리 낮을수록 짙은 안개/연무 (FogExp2 density)
      const densTarget = 0.00009 + (1 - visNorm) * 0.0006;
      c.scene.fog.density += (densTarget - c.scene.fog.density) * 0.02;
    }
    // 하늘 배경(clear color)도 밤/흐림에 맞춰 부드럽게 전환
    if (c.renderer) {
      const nightBg = new THREE.Color(0x070f1c);
      const clearBg = new THREE.Color(0x1a3a5c);
      const overcastBg = new THREE.Color(0x55606a);
      const dayBg = clearBg.clone().lerp(overcastBg, overcast);
      const target = c.nightFactor > 0.5 ? nightBg : dayBg;
      if (!c.bgColor) c.bgColor = clearBg.clone();
      c.bgColor.lerp(target, 0.02);
      c.renderer.setClearColor(c.bgColor, 1);
    }
  }, []);

  // syncThreeIcebergs: show/hide icebergs based on ice concentration
  const syncThreeIcebergs = useCallback(
    (conc, shipPosVec, headingFn, cachedIceData) => {
      const c = ctx.current;
      const activeCount = Math.floor(conc * MAX_LOCAL_ICEBERGS);

      for (let i = 0; i < c.tIcebergs.length; i++) {
        const ice = c.tIcebergs[i];
        ice.grp.visible = i < activeCount;

        if (ice.grp.visible && shipPosVec) {
          const dx = ice.cx - shipPosVec.x;
          const dz = ice.cz - shipPosVec.z;
          const heading =
            typeof headingFn === 'function' ? headingFn() : headingFn;
          const dotFwd = dx * Math.sin(heading) + -dz * Math.cos(heading);

          if (dotFwd < -8000 || Math.sqrt(dx * dx + dz * dz) > 25000) {
            const angle = (Math.random() - 0.5) * Math.PI * 0.8;
            const h = heading + angle;
            const spawnDist = rng(8000, 20000);
            ice.cx = shipPosVec.x + Math.sin(h) * spawnDist;
            ice.cz = shipPosVec.z - Math.cos(h) * spawnDist;
            ice.grp.position.set(ice.cx, 0, ice.cz);
          }
        }
      }
    },
    [],
  );

  // checkAutoCollisions: iceberg collision detection
  const checkAutoCollisions = useCallback((shipPosVec, collisionOffset) => {
    const c = ctx.current;
    if (!c.shipGroup3) return;
    const SHIP_R = 20;
    const sx = c.shipGroup3.position.x;
    const sz = c.shipGroup3.position.z;
    let minD2 = Infinity;

    for (const ice of c.tIcebergs) {
      if (!ice.grp.visible || !ice.grp.parent) continue;
      const dx = sx - ice.cx;
      const dz = sz - ice.cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD2) minD2 = d2;
      const minDist = SHIP_R + (ice.r || 20);
      if (d2 < minDist * minDist && d2 > 0.01) {
        const dist = Math.sqrt(d2);
        const overlap = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        if (collisionOffset) {
          collisionOffset.x += nx * overlap * 0.85;
          collisionOffset.z += nz * overlap * 0.85;
        }
        ice.cx -= nx * overlap * 0.15;
        ice.cz -= nz * overlap * 0.15;
        ice.grp.position.set(ice.cx, 0, ice.cz);
        if (!c.impactActive) {
          c.impactActive = true;
          c.impactRoll = (Math.random() > 0.5 ? 1 : -1) * 0.26;
          c.impactPitch = -0.14;
          c.screenShakeT = 0.5;
          c.fovImpactBoost = 15;
        }
      }
    }
    c.nearestIceDist = Math.sqrt(minD2);

    if (collisionOffset) {
      c.shipGroup3.position.x = shipPosVec.x + collisionOffset.x;
      c.shipGroup3.position.z = shipPosVec.z + collisionOffset.z;
    }
  }, []);

  // computeFovTarget
  const computeFovTarget = useCallback(
    (
      currentModeStr,
      isManual,
      binocularsActive,
      shipSpeedVal,
      shipThrottleVal,
      fovSliderOverride,
      fovBaseVal,
    ) => {
      // BRIDGE 모드 제거됨. FOLLOW + 수동 + 쌍안경일 때만 줌 FOV 허용.
      if (isManual && binocularsActive) return 15;
      return 90;
    },
    [],
  );

  // render: single-frame render
  const render = useCallback(() => {
    const { renderer, scene, camera } = ctx.current;
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }, []);

  // ── Expose API via ref ────────────────────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      get scene() {
        return ctx.current.scene;
      },
      get camera() {
        return ctx.current.camera;
      },
      get renderer() {
        return ctx.current.renderer;
      },
      get shipPivot() {
        return ctx.current.shipGroup3;
      },
      get shipMesh() {
        return ctx.current.shipMesh3;
      },
      get cameraPivot() {
        return ctx.current.cameraPivot3;
      },
      get tIcebergs() {
        return ctx.current.tIcebergs;
      },
      get motionState() {
        const c = ctx.current;
        return {
          shipRoll: c.shipRoll,
          shipPitch: c.shipPitch,
          shipHeave: c.shipHeave,
          impactRoll: c.impactRoll,
          impactPitch: c.impactPitch,
          impactActive: c.impactActive,
          screenShakeT: c.screenShakeT,
          fovImpactBoost: c.fovImpactBoost,
          nightFactor: c.nightFactor,
          nearestIceDist: c.nearestIceDist,
        };
      },
      updateShipPosition,
      animateOcean,
      updateOceanOverlay,
      updateFoam,
      updateShipMotion,
      setVoyageMotionBias,
      setVoyageIceContext,
      setRealWaveInput,
      setWeatherVisuals,
      setAraonState,
      setEscortAsset,
      updateNightMode,
      syncThreeIcebergs,
      checkAutoCollisions,
      computeFovTarget,
      buildIcebergs,
      buildLandMasses,
      updateRealBergs,
      render,
    }),
    [
      updateShipPosition,
      animateOcean,
      updateOceanOverlay,
      updateFoam,
      updateShipMotion,
      setVoyageMotionBias,
      setVoyageIceContext,
      setRealWaveInput,
      setWeatherVisuals,
      setAraonState,
      setEscortAsset,
      updateNightMode,
      syncThreeIcebergs,
      checkAutoCollisions,
      computeFovTarget,
      buildIcebergs,
      buildLandMasses,
      updateRealBergs,
      render,
    ],
  );

  // ── Initialization on mount ───────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    renderer.setClearColor(0x1a3a5c, 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    ctx.current.renderer = renderer;

    // Scene
    const scene = new THREE.Scene();
    // 수평선 안개 — 먼 거리 자연스럽게 흐려지고 북극 분위기 연출
    scene.fog = new THREE.FogExp2(0x7a9fb5, 0.00012);
    ctx.current.scene = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      90,
      window.innerWidth / window.innerHeight,
      0.01,
      500000,
    );
    ctx.current.camera = camera;

    // IBL environment map (arctic sky gradient for iceberg reflections)
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const cv = Object.assign(document.createElement('canvas'), {
      width: 64,
      height: 32,
    });
    const cvCtx = cv.getContext('2d');
    const g = cvCtx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, '#07101e');
    g.addColorStop(0.38, '#0d2040');
    g.addColorStop(0.5, '#1a4a72');
    g.addColorStop(0.62, '#2a6a90');
    g.addColorStop(1, '#091420');
    cvCtx.fillStyle = g;
    cvCtx.fillRect(0, 0, 64, 32);
    const envTex = new THREE.CanvasTexture(cv);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    const envRT = pmrem.fromEquirectangular(envTex);
    scene.environment = envRT.texture;
    envTex.dispose();
    pmrem.dispose();

    // Shared iceberg materials (created once)
    // //! [Original Code] 빙하 매터리얼 속성 (부드러운 음영)
    // ctx.current.iceMat = new THREE.MeshStandardMaterial({
    //   color: 0xd8e8f0,
    //   roughness: 0.65,
    //   metalness: 0.02,
    //   envMapIntensity: 0.6,
    // });

    // //* [Modified Code] flatShading 옵션과 roughness를 상향하여 각지고 투박한 빙하 질감(Faceted) 구현
    ctx.current.iceMat = new THREE.MeshStandardMaterial({
      color: 0xd8e8f0,
      roughness: 0.9,
      metalness: 0.05,
      envMapIntensity: 0.6,
      flatShading: true,
    });
    ctx.current.realBergMat = new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      roughness: 0.7,
      metalness: 0.0,
      envMapIntensity: 0.4,
    });
    ctx.current.subMat = new THREE.MeshBasicMaterial({
      color: 0x224466,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    ctx.current.discMat = new THREE.MeshBasicMaterial({
      color: 0x07141e,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    ctx.current.ringMat = new THREE.MeshBasicMaterial({
      color: 0xbad4e4,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 카메라 초기 위치 설정 (선박 뒤쪽 위에서 전방을 바라봄)
    camera.position.set(0, 60, 200);
    camera.lookAt(0, 10, -200);

    // Build scene elements
    buildSky();
    buildLighting();
    buildOcean();
    buildIcebergs();
    buildShip(specs.type);
    buildFoam();
    buildLandMasses(baseRef?.lat ?? 35.1, baseRef?.lon ?? 129.0);

    // ── 수동 조종 시각 참조용 해상 부표 그리드 ──
    // 고정 위치 마커를 배치하여 선박 이동을 눈으로 확인 가능하게 함
    const buoyGroup = new THREE.Group();
    buoyGroup.name = 'buoyGrid';
    const buoyGeo = new THREE.CylinderGeometry(3, 3, 12, 8);
    const buoyTopGeo = new THREE.SphereGeometry(4, 8, 8);
    const buoyMat = new THREE.MeshStandardMaterial({ color: 0xff4444, roughness: 0.6 });
    const buoyTopMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });
    const BUOY_SPACING = 2000;
    const BUOY_GRID = 40; // -40 ~ +40 → 80x80 그리드
    for (let gx = -BUOY_GRID; gx <= BUOY_GRID; gx++) {
      for (let gz = -BUOY_GRID; gz <= BUOY_GRID; gz++) {
        // 밀도 조절: 5칸마다 하나만 배치
        if (gx % 5 !== 0 || gz % 5 !== 0) continue;
        const bx = gx * BUOY_SPACING;
        const bz = gz * BUOY_SPACING;
        const pole = new THREE.Mesh(buoyGeo, buoyMat);
        pole.position.set(bx, 6, bz);
        buoyGroup.add(pole);
        const top = new THREE.Mesh(buoyTopGeo, buoyTopMat);
        top.position.set(bx, 14, bz);
        buoyGroup.add(top);
      }
    }
    scene.add(buoyGroup);
    ctx.current.buoyGroup = buoyGroup;

    // Resize handler
    const handleResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    canvas.style.cursor = 'grab';

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize);

      // Dispose all tracked geometries and materials
      for (const obj of ctx.current.disposables) {
        if (obj && typeof obj.dispose === 'function') {
          obj.dispose();
        }
      }
      ctx.current.disposables.length = 0;

      // Dispose shared materials
      if (ctx.current.iceMat) ctx.current.iceMat.dispose();
      if (ctx.current.subMat) ctx.current.subMat.dispose();
      if (ctx.current.realBergMat) ctx.current.realBergMat.dispose();
      if (ctx.current.discMat) ctx.current.discMat.dispose();
      if (ctx.current.ringMat) ctx.current.ringMat.dispose();

      // Dispose renderer
      renderer.dispose();

      ctx.current.renderer = null;
      ctx.current.scene = null;
      ctx.current.camera = null;
    };
  }, [
    buildSky,
    buildLighting,
    buildOcean,
    buildIcebergs,
    buildShip,
    buildFoam,
    buildLandMasses,
    specs.type,
  ]);

  // ── Update ship position/heading from props ───────────────────────────────
  useEffect(() => {
    if (!shipState || !ctx.current.shipGroup3) return;
    const { lat, lon, heading } = shipState;
    if (lat != null && lon != null && heading != null) {
      // 위도 기반 빙산 표시 — 수동 모드에서는 항상 표시, 자동 모드에서는 60°N 이상
      const showIce = manualMode || lat >= 60;
      for (const ice of ctx.current.tIcebergs) {
        ice.grp.visible = showIce;
      }
      for (const berg of ctx.current.realBergs) {
        if (berg.grp) berg.grp.visible = showIce;
      }

      // 선박 주변 해안선(육지) 갱신:
      //   · 마스크 로드 완료 후 첫 실데이터 빌드(needFirstReal)
      //   · 또는 마지막 빌드 중심에서 LAND_REBUILD_DEG 이상 이동 시 재생성
      // 패치는 buildLandMasses 내부에서 선박 현재 scene 위치 기준으로 재중심화.
      const lc = ctx.current.landCenter;
      const maskReady = isGlobalLandMaskReady();
      let dLon = lon - (lc ? lc.lon : lon);
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;
      const cosLat = Math.cos((lat * Math.PI) / 180);
      const movedFar =
        !lc ||
        Math.abs(lc.lat - lat) > LAND_REBUILD_DEG ||
        Math.abs(dLon) * cosLat > LAND_REBUILD_DEG;
      const needFirstReal = maskReady && !ctx.current.landBuiltReady;
      if (movedFar || needFirstReal) {
        buildLandMasses(lat, lon, null); // 즉시 표시(고도색 폴백)
        ctx.current.landCenter = { lat, lon };
        if (maskReady) ctx.current.landBuiltReady = true;
        // 실제 위성 이미지 비동기 로드 후 텍스처 입혀 재빌드(최신 요청만 반영)
        const token = (ctx.current.terrainToken = (ctx.current.terrainToken || 0) + 1);
        const clat = lat;
        const clon = lon;
        // 실제 위성 이미지 + 실제 고도(Cesium DEM) 병렬 로드 → 실사 지형 재빌드.
        Promise.all([
          loadImageryAround(clat, clon, { halfLat: 0.6, halfLon: 0.6 }),
          loadElevationAround(clat, clon),
        ])
          .then(([imagery, elev]) => {
            if (ctx.current.terrainToken !== token || !ctx.current.scene) return;
            if (elev) buildLandMasses(clat, clon, imagery, elev); // 실사(고도+위성)
            else if (imagery) buildLandMasses(clat, clon, imagery); // 위성만 폴백
          })
          .catch(() => {});
      }
    }
  }, [shipState, mode, manualMode, buildLandMasses]);

  // ── FOLLOW 줌 상태 (스크롤) ──────────────────────────────────────────────
  const followZoomTargetRef = useRef(600);
  const followZoomCurrentRef = useRef(600);

  useEffect(() => {
    function handleWheel(e) {
      if (mode !== 'FOLLOW') return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 50 : -50;
      followZoomTargetRef.current = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, followZoomTargetRef.current + delta),
      );
    }
    const el = wrapRef.current;
    if (el) el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      if (el) el.removeEventListener('wheel', handleWheel);
    };
  }, [mode]);

  // ── FOLLOW 오빗 상태 (드래그 회전) ────────────────────────────────────────
  const orbitRef = useRef({
    yaw: 0,
    pitch: 0.06,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

  useEffect(() => {
    if (mode !== 'FOLLOW') return;
    const el = wrapRef.current;
    if (!el) return;
    const orbit = orbitRef.current;

    const onDown = (e) => {
      orbit.dragging = true;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      el.style.cursor = 'grabbing';
    };
    const onMove = (e) => {
      if (!orbit.dragging) return;
      const dx = e.clientX - orbit.lastX;
      const dy = e.clientY - orbit.lastY;
      orbit.yaw -= dx * 0.006;
      orbit.pitch = Math.max(-0.05, Math.min(0.9, orbit.pitch - dy * 0.004));
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
    };
    const onUp = () => {
      orbit.dragging = false;
      el.style.cursor = 'grab';
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      orbit.yaw = 0;
      orbit.pitch = 0.06;
      orbit.dragging = false;
    };
  }, [mode]);

  // ── Adjust camera for different modes ─────────────────────────────────────
  useEffect(() => {
    const { camera } = ctx.current;
    if (!camera) return;
    if (mode === 'FOLLOW') {
      // //! [Original Code]
      //       followZoomTargetRef.current = 220;
      //       followZoomCurrentRef.current = 220;
      // //* [Modified Code] 대형 상선(Scale 2.8)에 맞춰 초기 선미 추적 거리를 대폭 확장
      let defaultDist = 600;
      if (specs?.type === 'lng') defaultDist = 1200;
      else if (specs?.type === 'container') defaultDist = 1000;

      followZoomTargetRef.current = defaultDist;
      followZoomCurrentRef.current = defaultDist;
      camera.fov = 75;
      camera.near = 0.5; // Near clipping plane 조정
      camera.position.set(0, 150, defaultDist);
      camera.lookAt(0, 30, -100);
      camera.updateProjectionMatrix();
    }
  }, [mode]);

  // ── 자체 렌더 루프: visible일 때만 실행 ────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    // 육지 다시 표시 (높이 6~15 로 낮춰 해안선 실루엣으로 정리됨)
    if (ctx.current.landGroup) ctx.current.landGroup.visible = true;
    let rafId;
    let lastMotionTs = 0;
    function loop(now) {
      rafId = requestAnimationFrame(loop);
      const { renderer, scene, camera, shipGroup3 } = ctx.current;
      if (!renderer || !scene || !camera) return;
      try {
        const t = now * 0.001;
        // //* [Modified Code] 바다(파도) 평면이 선박의 물리 이동을 따라다니도록 shipGroup3.position 위치 전달
        animateOcean(t, shipGroup3 ? shipGroup3.position : null);

        // Ship motion (roll/pitch/heave) — 모드와 무관하게 항상 업데이트.
        // realWaveInput 이 있으면 실제 파고/파향 사용, 없으면 위도 합성.
        const motionDt = lastMotionTs === 0 ? 0.016 : Math.min(0.1, (now - lastMotionTs) / 1000);
        lastMotionTs = now;
        const shipLat = (shipState && typeof shipState.lat === 'number')
          ? shipState.lat
          : 70;
        updateShipMotion(motionDt, shipLat);

        // Foam (뱃머리 물보라) — 선박 이동 시 스프레이 파티클
        if (shipGroup3) {
          const hdg = shipGroup3.rotation.y;
          // 속도 추정: 수동이면 manualSpeed, 아니면 hud 기반 (~15kn ≈ 7.7 m/s)
          const speedMS = manualMode
            ? Math.abs(parseFloat(shipState?.manualSpeed) || 0) * 0.5
            : 7.7;
          updateFoam(motionDt, -hdg, speedMS, shipGroup3.position);

          // //* [Modified Code] 수면 흐름(전진감)용 실제 이동속도 측정 (units/s, 평활화).
          //   lat/lon→world 직접 set/수동 이동을 모두 포착 → 정지 시 0(흐름 멈춤),
          //   시간배율↑/가속 시 커진다(animateOcean 에서 자연스러운 범위로 클램프).
          const sp = shipGroup3.position;
          const lp = ctx.current.flowLastPos;
          if (lp && motionDt > 1e-3) {
            const dxp = sp.x - lp.x;
            const dzp = sp.z - lp.z;
            const inst = Math.sqrt(dxp * dxp + dzp * dzp) / motionDt;
            ctx.current.seaFlowSpeed =
              (ctx.current.seaFlowSpeed || 0) * 0.85 + inst * 0.15;
            // //* [Modified Code] 실제 이동 벡터(EMA) — heading 을 "가는 방향"에서 직접 유도해
            //   crab(옆으로 미끄러짐) 을 원천 차단하기 위함. 정지 시엔 갱신 안 함(노이즈 방지).
            const vx = dxp / motionDt;
            const vz = dzp / motionDt;
            ctx.current.velX = (ctx.current.velX || 0) * 0.8 + vx * 0.2;
            ctx.current.velZ = (ctx.current.velZ || 0) * 0.8 + vz * 0.2;
          }
          ctx.current.flowLastPos = { x: sp.x, z: sp.z };
        }

        // Night mode (극야) — 고위도(82°N+)에서 조명 어둡게
        updateNightMode(shipLat);

        // 부표 그리드를 선박 주변으로 재중심화 (이동해도 항상 부표가 보이도록)
        if (ctx.current.buoyGroup && shipGroup3) {
          const sp = shipGroup3.position;
          const BUOY_SPACING = 2000;
          const snapX = Math.round(sp.x / BUOY_SPACING) * BUOY_SPACING;
          const snapZ = Math.round(sp.z / BUOY_SPACING) * BUOY_SPACING;
          const bg = ctx.current.buoyGroup;
          if (Math.abs(bg.position.x - snapX) > BUOY_SPACING ||
              Math.abs(bg.position.z - snapZ) > BUOY_SPACING) {
            bg.position.x = snapX;
            bg.position.z = snapZ;
          }
        }

        // 빙하 재생성: 선박이 빙하 중심에서 60km 이상 떨어지면 선박 주변에 다시 생성
        if (shipGroup3 && ctx.current.tIcebergs) {
          const sp = shipGroup3.position;
          const cx = ctx.current.icebergCenterX || 0;
          const cz = ctx.current.icebergCenterZ || 0;
          const d2 = (sp.x - cx) * (sp.x - cx) + (sp.z - cz) * (sp.z - cz);
          if (d2 > 60000 * 60000) {
            buildIcebergs(sp.x, sp.z);
            // 위도 60°N 이상일 때만 빙하 표시 (저위도 깜빡임 방지)
            const curLat = (shipState && typeof shipState.lat === 'number')
              ? shipState.lat
              : 70;
            const showIce = manualMode || curLat >= 60;
            for (const ice of ctx.current.tIcebergs) {
              ice.grp.visible = showIce;
            }
          }
        }

        // 배 heading 보간 (FOLLOW/자동 모드 — 수동 모드는 App.jsx에서 직접 설정)
        // //* [Modified Code] 뱃머리가 "실제 가는 방향"을 바라보도록:
        //   충분히 이동 중이면 이동 벡터(velX,velZ)에서 target heading 을 유도(crab 차단),
        //   거의 정지면 props(shipState.heading) 로 폴백. 보간 속도도 0.03→0.08 로 올려 lag 감소.
        if (shipGroup3 && shipState && !manualMode) {
          const c = ctx.current;
          const speed = Math.hypot(c.velX || 0, c.velZ || 0);
          let headingRad;
          if (speed > 0.8) {
            // bow = (-sin ry, -cos ry) 를 이동 벡터에 맞춤 → ry = atan2(-vx, -vz)
            headingRad = Math.atan2(-(c.velX || 0), -(c.velZ || 0));
          } else {
            headingRad = (-(shipState.heading || 0) * Math.PI) / 180;
          }
          let diff = headingRad - shipGroup3.rotation.y;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          shipGroup3.rotation.y += diff * 0.08;
        }

        // ── 아라온 위치/rotation 매 프레임 갱신 (모드별 타겟 계산 + 전환 lerp) ──
        {
          const c = ctx.current;
          const aGrp = c.araonGroup;
          if (aGrp && aGrp.visible && c.shipGroup3 && c.araonMode) {
            const sp = c.shipGroup3.position;
            const shipRy = c.shipGroup3.rotation.y;

            // 1) 현재 타겟 위치/회전 계산 (모드별)
            let targetX = 0;
            let targetZ = 0;
            let targetRy = 0;
            if (c.araonMode === 'escort' && c.araonEscortConfig) {
              const cfg = c.araonEscortConfig;
              const fx = -Math.sin(shipRy);
              const fz = -Math.cos(shipRy);
              const rx = Math.cos(shipRy);
              const rz = -Math.sin(shipRy);
              // //* [Modified Code] 정면 앞 선도 대형:
              //   본선 정면 앞쪽에 충분한 간격(lead)을 두고 배치 → 아라온이 앞장서
              //   얼음을 깨며 길을 내고 본선이 그 항로를 따라 진행하는 모습.
              //   선박이 클수록(=카메라 거리 큼) 간격도 비례해 키워 '바짝 붙은' 느낌 제거.
              let lead = cfg.forwardM;
              if (specs?.type === 'lng') lead *= 1.6;
              else if (specs?.type === 'container') lead *= 1.35;
              targetX = sp.x + fx * lead + rx * cfg.sideM;
              targetZ = sp.z + fz * lead + rz * cfg.sideM;
              targetRy = shipRy;
            } else if (c.araonMode === 'dock' && c.araonDockDelta) {
              const dd = c.araonDockDelta;
              const M_PER_LAT = 111132.954;
              const M_PER_LON = 111319.491 * Math.cos((dd.refLat * Math.PI) / 180);
              const SCALE = 1.5;
              targetX = sp.x + (dd.deltaLonDeg * M_PER_LON) / SCALE;
              targetZ = sp.z + (-dd.deltaLatDeg * M_PER_LAT) / SCALE;
              targetRy = -(dd.headingDeg * Math.PI) / 180;
            }

            // 2) 전환 진행도 계산
            const dur = c.araonTransitionDuration || 2500;
            const startSnap = c.araonTransitionStart;
            if (startSnap) {
              const elapsed = now - c.araonTransitionStartTime;
              let t = Math.min(1, elapsed / dur);
              // easeInOutCubic
              const eased =
                t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
              aGrp.position.x = startSnap.x + (targetX - startSnap.x) * eased;
              aGrp.position.z = startSnap.z + (targetZ - startSnap.z) * eased;
              // rotation은 각도 wrap 고려
              let rotDiff = targetRy - startSnap.rotY;
              while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
              while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
              aGrp.rotation.y = startSnap.rotY + rotDiff * eased;
              if (t >= 1) {
                c.araonTransitionStart = null; // 전환 완료
              }
            } else {
              // 전환 없음 — 직접 타겟으로
              aGrp.position.x = targetX;
              aGrp.position.z = targetZ;
              aGrp.rotation.y = targetRy;
            }
          }
        }

        // ── Wake ribbon (선미뷰 전용 궤적 리본) 업데이트 ────────────
        // FOLLOW 모드에서만 visible + 포인트 push.
        // 다른 모드로 나가면 정리하고 숨김.
        {
          const c = ctx.current;
          const wake = c.wakeLine;
          if (wake) {
            if (mode === 'FOLLOW' && shipGroup3) {
              wake.visible = true;
              // 0.12s 마다 포인트 추가 (너무 조밀하지 않게)
              const nowMs = now;
              if (nowMs - c.wakeLastT > 120) {
                const sp = shipGroup3.position;
                // 선미 방향으로 선체 뒤에 살짝 오프셋
                const ry = shipGroup3.rotation.y;
                const backOff = 30; // 선박 길이의 반 정도
                const px = sp.x + Math.sin(ry) * backOff;
                const pz = sp.z + Math.cos(ry) * backOff;
                const py = SHIP_BASE_Y + 0.3;
                const last = c.wakeLastPos;
                const moved = !last ||
                  Math.abs(last.x - px) + Math.abs(last.z - pz) > 1.0;
                if (moved) {
                  const positions = c.wakePositions;
                  const colors = c.wakeColors;
                  const max = c.wakeMaxPoints;
                  // Shift 하지 않고 ring-buffer 스타일로 처리하되,
                  // Line 렌더는 index 0..count 순서를 기대하므로 shift 방식 유지.
                  // count < max: append
                  // count == max: 앞 한 포인트 제거 후 append
                  if (c.wakeCount < max) {
                    const idx = c.wakeCount * 3;
                    positions[idx] = px;
                    positions[idx + 1] = py;
                    positions[idx + 2] = pz;
                    c.wakeCount += 1;
                  } else {
                    for (let i = 0; i < max - 1; i += 1) {
                      const dst = i * 3;
                      const src = (i + 1) * 3;
                      positions[dst] = positions[src];
                      positions[dst + 1] = positions[src + 1];
                      positions[dst + 2] = positions[src + 2];
                    }
                    const idx = (max - 1) * 3;
                    positions[idx] = px;
                    positions[idx + 1] = py;
                    positions[idx + 2] = pz;
                  }
                  // Color: 꼬리로 갈수록 페이드 (cyan → dark)
                  for (let i = 0; i < c.wakeCount; i += 1) {
                    const t = i / Math.max(1, c.wakeCount - 1); // 0(tail)..1(head)
                    const idx = i * 3;
                    colors[idx] = 0.1 + t * 0.15;         // R
                    colors[idx + 1] = 0.55 + t * 0.35;    // G
                    colors[idx + 2] = 0.70 + t * 0.25;    // B
                  }
                  c.wakeGeo.attributes.position.needsUpdate = true;
                  c.wakeGeo.attributes.color.needsUpdate = true;
                  c.wakeGeo.setDrawRange(0, c.wakeCount);
                  c.wakeGeo.computeBoundingSphere();
                  c.wakeLastT = nowMs;
                  c.wakeLastPos = { x: px, z: pz };
                }
              }
            } else if (wake.visible) {
              // FOLLOW 벗어남 → 숨김 + 버퍼 리셋 (다음 진입 시 새 궤적)
              wake.visible = false;
              c.wakeCount = 0;
              c.wakeLastPos = null;
              c.wakeGeo.setDrawRange(0, 0);
            }
          }
        }

        // FOLLOW 카메라 — 오빗 드래그 + 부드러운 줌
        if (mode === 'FOLLOW' && camera && shipGroup3) {
          followZoomCurrentRef.current +=
            (followZoomTargetRef.current - followZoomCurrentRef.current) * 0.06;
          const dist = followZoomCurrentRef.current;
          const shipPos = shipGroup3.position;
          const ry = shipGroup3.rotation.y; // 선박 회전각
          const orbit = orbitRef.current;

          // //* [Modified Code] 드래그 중이 아니면 yaw 를 천천히 0(정선미)으로 복귀
          //   → 카메라가 항상 진행방향 뒤에 정렬되어, 전진이 화면 안쪽으로 들어오고
          //   배가 옆으로 미끄러져 보이지 않는다. (드래그로 둘러보기는 그대로 가능)
          if (!orbit.dragging) {
            orbit.yaw *= 0.96;
            if (Math.abs(orbit.yaw) < 0.002) orbit.yaw = 0;
          }

          // 선미 기준 월드 각도 + 오빗 yaw 오프셋
          // //* [Modified Code] Math.PI/2 오프셋을 제거하고 선박의 -Z(Front) 기준 일치하도록 삼각함수 위상(Math.sin/cos) 교정
          const angle = ry + orbit.yaw;
          const pitch = orbit.pitch; // 0=수평, 양수=위

          // //! [Original Code]
          //           let followHeightOffset = 15;
          //           let lookAtYOffset = 35;
          //           if (specs?.type === 'lng') {
          //             followHeightOffset = 55; lookAtYOffset = 80;
          //           } else if (specs?.type === 'container') {
          //             followHeightOffset = 70; lookAtYOffset = 75;
          //           }
          // //* [Modified Code] 선미 추적 모드 시점(높이 및 주시점) 2차 상향 조정 (쾌적한 시야 확보)
          let followHeightOffset = 50;
          let lookAtYOffset = 60;
          if (specs?.type === 'lng') {
            followHeightOffset = 120;
            lookAtYOffset = 180;
          } else if (specs?.type === 'container') {
            followHeightOffset = 100;
            lookAtYOffset = 140;
          }

          const MathMax = Math.max;
          const camX = shipPos.x + Math.sin(angle) * dist * Math.cos(pitch);
          const camZ = shipPos.z + Math.cos(angle) * dist * Math.cos(pitch);
          const camY =
            shipPos.y +
            SHIP_BASE_Y +
            dist * 0.04 +
            followHeightOffset +
            Math.sin(pitch) * dist * 0.5;

          camera.position.set(
            camX,
            MathMax(SHIP_BASE_Y + followHeightOffset * 0.5, camY),
            camZ,
          );
          camera.lookAt(
            shipPos.x,
            shipPos.y + SHIP_BASE_Y * 1.4 + lookAtYOffset,
            shipPos.z,
          );

          const pitchLerp = Math.min(1, dist / 1500);
          camera.fov = 75 - pitchLerp * 20;
          camera.updateProjectionMatrix();
        }

        renderer.render(scene, camera);
      } catch (e) {
        /* ignore */
      }
    }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [visible, animateOcean, mode, shipState, manualMode, buildIcebergs]);

  // ── Render ────────────────────────────────────────────────────────────────
  const isVisible = visible === true;

  return (
    <div
      ref={wrapRef}
      id="three-wrap"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 2,
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
});

ThreeOverlay.displayName = 'ThreeOverlay';

export default ThreeOverlay;
