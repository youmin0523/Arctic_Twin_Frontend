# 🚀 Frontend 배포 가이드 — Vercel

이 레포는 **독립 레포**(`Arctic_Twin_Frontend`)이므로 Vercel 의 **Root Directory 는 `/`**(레포 루트)다.
프론트는 모든 백엔드 호출을 **상대경로**(`/api/*`, `/data/*`, `/nsidc-proxy/` …)로 하고,
`vercel.json` 의 `rewrites` 가 이를 AWS 백엔드로 프록시한다. (CORS 불필요)

---

## 1. 백엔드 주소 입력 (배포 전 1단계만 수정)

`vercel.json` 안의 호스트 토큰을 실제 백엔드 주소로 **찾아바꾸기**:

```
https://CHANGE-ME-AWS-BACKEND-HOST   →   https://api.arctictwin.com
                                      (또는  http://<EC2-Elastic-IP>:8000)
```

> 9개 rewrite 의 호스트가 전부 동일 토큰이라 **한 번의 find/replace** 로 끝난다.
> (Vercel `vercel.json` 은 환경변수 치환을 지원하지 않아 문자열 교체 방식 사용.)

---

## 2. Vercel 프로젝트 생성

1. Vercel → **Add New → Project** → `Arctic_Twin_Frontend` 레포 import.
2. 설정 자동 감지 (vercel.json 에 명시됨):
   - Framework: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - **Root Directory: `/`** (그대로)
3. (선택) Environment Variables:
   - `VITE_CESIUM_ION_TOKEN` — 본인 Cesium ion 토큰. 미설정 시 코드 기본값 사용.
4. **Deploy**.

> **CI/CD = Vercel 네이티브 Git 연동**: 한 번 import 해두면 이후 `main` 에 push 할 때마다
> Vercel 이 자동 빌드·배포한다(PR 은 Preview URL 자동 생성). **GitHub Actions 워크플로 파일 불필요**
> — backend 처럼 `.github/workflows` 를 따로 둘 필요 없다(이중 배포 방지). 롤백도 대시보드에서 1클릭.

---

## 3. 커스텀 도메인 (선택)

- Vercel Project → Settings → Domains → `arctictwin.com` 추가 후 DNS 연결.
- 백엔드 도메인(`api.arctictwin.com`)은 EC2 쪽에서 별도 연결
  (backend `deploy/DEPLOY.md` 3번 참고).

---

## 4. 배포 후 점검

브라우저 DevTools Network 탭에서:
- `/api/health` → 200, `/api/ice/...` `/api/weather/latest` 등 200
- `/data/landMask.json` → 200
- Cesium 지도 + 빙산/항로 레이어 정상 렌더

문제 시:
| 증상 | 원인 |
|------|------|
| API 502/504 | 백엔드 미기동 또는 `vercel.json` 호스트 토큰 미교체 |
| 모든 `/api/*` 404 | rewrite 미적용 — `vercel.json` 이 레포 루트에 있는지 확인 |
| AI(RL/Report/Fuel) 503 | 백엔드 AI 서버 기동 중(모델 로드 1~3분) 또는 키 누락 |
| Cesium 지도 안 뜸 | ion 토큰 만료 → `VITE_CESIUM_ION_TOKEN` 갱신 |
