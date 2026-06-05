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
import * as Cesium from 'cesium';

const TILE = 256;

// ── 2단계: 실제 고도(Cesium World Terrain) ──
// 기존 위성뷰가 쓰는 동일 Ion 토큰/지형을 재사용. 새 토큰·프록시 불필요.
let _terrainProvider = null;
let _terrainPromise = null;
function ensureIonToken() {
  if (!Cesium.Ion.defaultAccessToken) {
    Cesium.Ion.defaultAccessToken =
      import.meta.env.VITE_CESIUM_ION_TOKEN ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MTJlMTZiNS02MzQ1LTRmZGMtOWM0Ni1kZWJkMzQxZTJhMTEiLCJpZCI6NDA2NTU5LCJpYXQiOjE3NzM5OTY1Mjl9.lpSbE0Dchaf-IEx0J8MkS6FoisyRwd4nfSZ0GyFciLI';
  }
}
async function getTerrainProvider() {
  if (_terrainProvider) return _terrainProvider;
  if (!_terrainPromise) {
    ensureIonToken();
    _terrainPromise = Cesium.createWorldTerrainAsync()
      .then((tp) => {
        _terrainProvider = tp;
        return tp;
      })
      .catch((e) => {
        console.warn('[realTerrain] World Terrain 로드 실패:', e?.message);
        return null;
      });
  }
  return _terrainPromise;
}

/**
 * 선박 주변 실제 고도(m) 격자 샘플. 위성뷰와 동일한 Cesium World Terrain 사용.
 * @returns {Promise<null | {
 *   N, lat0, lon0, dLat, dLon,
 *   heightAt: (lat, lon) => number,  // 양선형 보간 고도(m)
 * }>}
 */
export async function loadElevationAround(centerLat, centerLon, opts = {}) {
  const tp = await getTerrainProvider();
  if (!tp) return null;
  const N = opts.grid ?? 80;
  const cosLat = Math.max(0.18, Math.cos((centerLat * Math.PI) / 180));
  const halfLat = opts.halfLat ?? 0.6;
  const halfLon = (opts.halfLon ?? 0.6) / cosLat;
  const lat0 = centerLat - halfLat;
  const lon0 = centerLon - halfLon;
  const dLat = (2 * halfLat) / (N - 1);
  const dLon = (2 * halfLon) / (N - 1);
  const carts = new Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      carts[j * N + i] = Cesium.Cartographic.fromDegrees(lon0 + i * dLon, lat0 + j * dLat);
    }
  }
  try {
    await Cesium.sampleTerrain(tp, opts.level ?? 11, carts);
  } catch (e) {
    console.warn('[realTerrain] sampleTerrain 실패:', e?.message);
    return null;
  }
  const heights = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) heights[k] = carts[k].height || 0;
  return {
    N, lat0, lon0, dLat, dLon,
    heightAt(lat, lon) {
      const fj = (lat - lat0) / dLat;
      const fi = (lon - lon0) / dLon;
      if (fj < 0 || fi < 0 || fj > N - 1 || fi > N - 1) return 0;
      const j0 = Math.floor(fj), i0 = Math.floor(fi);
      const j1 = Math.min(N - 1, j0 + 1), i1 = Math.min(N - 1, i0 + 1);
      const tj = fj - j0, ti = fi - i0;
      const h00 = heights[j0 * N + i0], h10 = heights[j0 * N + i1];
      const h01 = heights[j1 * N + i0], h11 = heights[j1 * N + i1];
      const a = h00 + (h10 - h00) * ti;
      const b = h01 + (h11 - h01) * ti;
      return a + (b - a) * tj;
    },
  };
}
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
