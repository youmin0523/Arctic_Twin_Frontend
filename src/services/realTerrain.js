/**
 * realTerrain.js  (선미추적 뷰 실사 지형 — 1단계: 실제 위성 이미지 드레이프)
 * =================================================================
 * 선박 주변 영역의 **실제 위성 이미지**(Esri World Imagery, CORS 허용)를
 * Web Mercator 타일로 받아 하나의 캔버스로 합성하고, THREE 텍스처 + 경위도→UV
 * 변환을 제공한다. ThreeOverlay 의 육지 메쉬 윗면에 입혀 "실제 해안선·지표"가
 * 보이게 한다. (고도 기복은 2단계에서 Cesium World Terrain 으로 추가)
 *
 *  - DEM 무료타일(Terrarium)은 CORS 미지원 → WebGL 텍스처 업로드 불가라 사용 안 함.
 *  - Esri 위성은 ACAO:* 라 crossOrigin='anonymous' 로 안전하게 텍스처화 가능.
 */
import * as THREE from 'three';

const TILE = 256;
const IMAGERY_URL = (z, x, y) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

// ── Web Mercator 헬퍼 ──
const lon2xf = (lon, z) => ((lon + 180) / 360) * Math.pow(2, z);
const lat2yf = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z);
};
const xf2lon = (xf, z) => (xf / Math.pow(2, z)) * 360 - 180;
const yf2lat = (yf, z) => {
  const n = Math.PI - (2 * Math.PI * yf) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

const _cache = new Map(); // key -> {img, t} (간단 LRU 비슷)
function loadTile(z, x, y) {
  const max = Math.pow(2, z);
  const xi = ((x % max) + max) % max;
  if (y < 0 || y >= max) return Promise.resolve(null);
  const key = `${z}/${xi}/${y}`;
  if (_cache.has(key)) return Promise.resolve(_cache.get(key));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (_cache.size > 400) _cache.clear();
      _cache.set(key, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = IMAGERY_URL(z, xi, y);
  });
}

/**
 * 선박 주변 위성 이미지 패치 로드.
 * @returns {Promise<null | {
 *   texture: THREE.CanvasTexture,
 *   z, x0, y0, nx, ny,          // 타일 범위
 *   uvOf: (lat, lon) => [u, v], // 경위도 → 텍스처 UV(0..1, v는 위가 0)
 * }>}
 */
export async function loadImageryAround(centerLat, centerLon, opts = {}) {
  const z = opts.zoom ?? 9;            // 타일 ~0.7°/타일 @z9 (고위도 타일수 폭증 방지)
  const halfLatDeg = opts.halfLat ?? 0.55;
  const cosLat = Math.max(0.18, Math.cos((centerLat * Math.PI) / 180));
  const halfLonDeg = (opts.halfLon ?? 0.55) / cosLat;

  // 타일 인덱스 범위(가시 영역을 덮도록)
  const x0 = Math.floor(lon2xf(centerLon - halfLonDeg, z));
  const x1 = Math.floor(lon2xf(centerLon + halfLonDeg, z));
  const yTop = Math.floor(lat2yf(centerLat + halfLatDeg, z)); // 북=작은 y
  const yBot = Math.floor(lat2yf(centerLat - halfLatDeg, z));
  let nx = x1 - x0 + 1;
  let ny = yBot - yTop + 1;
  // 과대 방지(성능): 최대 7x7
  if (nx < 1) nx = 1;
  if (ny < 1) ny = 1;
  if (nx * ny > 49) return null;

  const canvas = document.createElement('canvas');
  canvas.width = nx * TILE;
  canvas.height = ny * TILE;
  const ctx = canvas.getContext('2d');
  // 로드 실패 타일 대비 바다색 배경
  ctx.fillStyle = '#10324f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const jobs = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      jobs.push(
        loadTile(z, x0 + i, yTop + j).then((img) => {
          if (img) ctx.drawImage(img, i * TILE, j * TILE, TILE, TILE);
        }),
      );
    }
  }
  await Promise.all(jobs);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // 캔버스 행0=북쪽(yTop). uvOf 는 북=v0 이므로 flipY 끄면 정합(v0=캔버스 상단=북).
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // NPOT 캔버스 안전: 밉맵 비활성 + Linear (검은 텍스처 방지)
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  // 합성 캔버스가 덮는 정확한 머케이터 범위(타일 경계 기준)
  const leftXf = x0;
  const topYf = yTop;
  const uvOf = (lat, lon) => {
    const xf = lon2xf(lon, z);
    const yf = lat2yf(lat, z);
    const u = (xf - leftXf) / nx; // 0..1 (좌→우)
    const v = (yf - topYf) / ny;  // 0..1 (위→아래)
    return [u, v];
  };

  return { texture, z, x0, y0: yTop, nx, ny, uvOf };
}

/** 캐시/리소스 정리(선택). */
export function clearTerrainCache() {
  _cache.clear();
}
