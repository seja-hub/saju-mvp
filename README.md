# 오늘의 사주 한 잔 — 현장 MVP

QR → 생년월일 입력 → 기본 성향 묘사 → 운별(총운·연애·결혼·금전·직업·건강) AI 풀이.

- **8글자(사주팔자)**: `@fullstackfamily/manseryeok`(한국천문연구원 데이터, 진태양시 보정)로 **정확히 계산**
- **오행·십신**: 코드로 확정 도출 (계산 오류 없음)
- **해석만** Gemini(Flash 계열, 자동 선택)가 담당
- API 키는 코드에 없음 → **Vercel 환경변수**로만 주입

---

## ⚠️ 시작 전 딱 하나
**기존에 노출된 API 키는 폐기하고 새 키를 발급하세요.** (Google AI Studio → 기존 키 삭제 → 새 키 생성)
새 키는 어디에도 적지 말고, 아래 5번 단계에서 Vercel에만 붙여넣습니다.

---

## 배포 방법 A — GitHub 업로드 → Vercel (터미널 불필요, 추천)

1. **GitHub 가입/로그인** (github.com) → 우상단 **＋ → New repository** → 이름 `saju-mvp` → (Private 가능) → Create.
2. 새 저장소 화면에서 **uploading an existing file** 클릭.
3. 압축을 푼 폴더에서 **`api` 폴더, `public` 폴더, `package.json`, `.gitignore`** 를 드래그해서 업로드 → **Commit changes**.
   - ⚠️ `node_modules` 폴더는 올리지 마세요 (Vercel이 자동 설치).
4. **Vercel** → **Add New… → Project** → 방금 만든 GitHub 저장소 **Import**.
5. 배포 화면에서 **Environment Variables** 펼치기 →
   - Name: `GEMINI_API_KEY`
   - Value: **(새로 발급한 Gemini 키)**
   - Add → **Deploy**.
6. 1~2분 후 `https://saju-mvp-xxxx.vercel.app` 주소가 나옵니다. 끝.

> 이미 키 없이 배포해버렸다면: Vercel 프로젝트 → Settings → Environment Variables 에 추가 후 **Deployments → 최신 빌드 → Redeploy** 하면 적용됩니다.

## 배포 방법 B — Vercel CLI (터미널이 편하면)
```bash
npm i -g vercel
cd saju-mvp
vercel                       # 안내 따라 로그인·프로젝트 생성
vercel env add GEMINI_API_KEY   # 새 키 붙여넣기 (Production 선택)
vercel --prod
```

---

## QR 코드
배포된 `.vercel.app` 주소를 QR 생성기(예: qr-code-generator 류)에 넣으면 됩니다.
주소가 나오면 알려주세요 — 인쇄용 QR/포스터로 정리해 드릴게요.

## 비용 / 한도 (현장 운영)
- Gemini Flash 무료 등급 ≈ 하루 1,500요청. 한 명이 평균 4~7회 호출 → **무료로 하루 약 200명** 처리 가능.
- 더 큰 행사면 Google AI Studio에서 결제(billing)만 켜면 됩니다 (Flash-Lite 100만 토큰당 입력 $0.25 수준 — 수백 명 써도 몇 달러).

## 사용량(관심도) 확인
호출마다 어떤 운을 골랐는지 서버 로그에 남습니다: **Vercel → 프로젝트 → Logs**.
정확한 클릭 수·인기 항목 집계가 필요하면 가벼운 카운터를 붙여 드릴 수 있어요(추가 작업).

## 손볼 곳 (참고)
- 운 항목 추가/삭제, 문구 톤, 답변 길이 → `api/reading.js` 의 `SECTION_PROMPT`, `SYSTEM`, `maxOutputTokens`
- 화면 색/문구 → `public/index.html`
- 음력 입력, 브랜드(좋은데이) 카피 통합은 제안서 단계에서 확장
