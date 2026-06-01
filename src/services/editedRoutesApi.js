/**
 * editedRoutesApi.js — 사용자 편집 항로의 서버 영속(전 사용자 공유) 클라이언트.
 *   GET  /api/routes/edited
 *   POST /api/routes/edited
 * localStorage 는 즉시표시용 캐시일 뿐, 권위 있는 소스는 서버다.
 */
const BASE = '/api/routes/edited';
const CACHE_KEY = 'dt_editedRoutes';

/** 서버에서 전체 편집 항로 조회. 실패 시 null. */
export async function fetchEditedRoutes() {
  try {
    const res = await fetch(BASE);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 전체 편집 항로를 서버에 저장(교체) + localStorage 캐시. */
export async function saveEditedRoutes(obj) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch {
    /* 무시 */
  }
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj),
    });
    return res.ok;
  } catch {
    return false;
  }
}
