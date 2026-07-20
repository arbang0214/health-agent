# 런로그 2차 업데이트 설계 — 홈 리디자인 + AI 분석(OCR) + 로그인 제거

날짜: 2026-07-20
상태: 사용자 승인됨 (브라우저 시안 B "플레이풀 카드" 선택)

## 배경

1차(2026-07-14)로 업로드(EXIF 날짜), 월/주 캘린더+🏃 스티커, 날짜 상세/삭제, 빈 날짜 탭→과거 기록 등록까지 배포 완료. 이번 2차는 (1) 홈 리디자인, (2) Tesseract.js 기반 무료 OCR("AI 분석"), (3) 로그인 제거를 다룬다.

## 결정 사항 (브레인스토밍 결과)

| 항목 | 결정 |
|---|---|
| 디자인 방향 | B. 플레이풀 카드 — 연그린 그라데이션 배경 + 흰 카드 + 그림자 |
| 스트릭 배지 | 넣지 않음 → 대신 "이번 달 n회" 배지 (운동한 날 수) |
| 월/주 토글 | 제거, 월 보기 고정 |
| 스탯 카드 | 거리/시간/kcal 3칸, 월 합산, 값 없으면 "—" 표시 (카드 항상 노출) |
| 인터랙션 | 오늘로 돌아가기 버튼, 좌우 스와이프 월 이동 (스켈레톤·하단 탭은 제외) |
| OCR 흐름 | B. 업로드 시 자동 분석 + 홈에 미분석분 일괄 분석 버튼 + 날짜 상세 수동 수정 백업 |
| OCR 엔진 | Tesseract.js (브라우저 WASM, 무료) + 7-세그먼트 모델(letsgodigital). LLM API 사용 안 함 |
| 로그인 | 완전 제거. 공개 URL 노출 리스크 사용자 인지 후 확정 |

## 1. 홈 리디자인 (`src/app/page.tsx`)

- 배경: 연그린 그라데이션(`ecfdf5→d1fae5` 계열), 콘텐츠는 흰 카드(`rounded-2xl`, 얕은 그림자)
- 헤더: `🏃 런로그` + 우상단 흰 알약 배지 `이번 달 n회` (해당 월 운동한 날 수)
- 월 네비: `◀ yyyy년 M월 ▶`. 현재 월이 아닐 때만 "오늘" 버튼 노출 → 탭하면 이번 달로 복귀
- 스탯 카드 3칸(거리 km / 시간 h m / kcal): 표시 중인 달의 `distance_km`·`duration_min`·`calories` 합산. 합산할 값이 하나도 없으면 해당 칸 "—"
- 캘린더: 월 그리드 고정(주 보기·토글 삭제), 흰 카드 컨테이너 안에 배치. 🏃 스티커, 오늘 강조(그린 채움), 기록 있는 날→상세, 없는 날→`/upload?date=` 링크는 기존 동작 유지
- 스와이프: `touchstart`/`touchend` deltaX(가로 우세 + 임계값)로 이전/다음 달 이동. 라이브러리 미사용
- 기록하기: 하단 고정 그린 알약 버튼 + 그림자 (기존 위치 유지)

## 2. AI 분석 — OCR

### 엔진 (`src/lib/ocr.ts` 신규)

- Tesseract.js를 dynamic import로 로드(초기 번들 영향 최소화)
- 7-세그먼트 traineddata(letsgodigital)를 우선 시도, 실패 시 기본 eng 모델 폴백
- 파싱(`parseWorkoutStats`, 순수 함수): OCR 텍스트에서 숫자 후보 추출 후 형식으로 매핑
  - `mm:ss` 또는 `h:mm:ss` → 시간(duration_min, 분 단위 반올림)
  - 소수점 숫자(0.1~99.9) → 거리(distance_km)
  - 정수(50~2000, 시간/거리로 안 쓰인 것) → 칼로리(calories)
  - 확신 없는 값은 null로 두고 사용자 확인에 맡김

### 흐름

1. **업로드 화면** (`src/app/upload/page.tsx`): 사진 선택 시 EXIF 날짜 추출과 함께 OCR 자동 실행. 시간/거리/칼로리 입력칸에 결과 프리필(인식 중 표시), 사용자가 확인·수정 후 저장. 저장 시 `analyzed_at = now()`
2. **홈 일괄 분석**: `analyzed_at is null`인 기록이 있으면 홈에 `✨ AI 분석 (n장)` 버튼 노출 → 각 사진을 순차 OCR → 결과 목록(썸네일 + 편집 가능한 3개 필드) → "모두 저장". 저장된 건마다 `analyzed_at` 기록
3. **날짜 상세** (`src/app/day/[date]/page.tsx`): 사진 아래 시간/거리/칼로리 표시(없으면 "—") + 수정 버튼 → 인라인 편집 → 저장. OCR 오인식 백업 경로

### 데이터

- 기존 스키마 그대로 사용: `duration_min`, `distance_km`, `calories`, `analyzed_at` (DB 변경 없음)
- `workouts.ts`에 `updateWorkoutStats(id, {duration_min, distance_km, calories})` 추가 (`analyzed_at` 함께 갱신), `addWorkout`은 수치 인자 확장

## 3. 로그인 제거

- 삭제: `src/app/login/page.tsx`, `src/middleware.ts`, `src/lib/supabase/middleware.ts`, 코드 내 auth 의존(`getUser` 체크 등)
- `addWorkout`의 user 조회 제거 → `user_id`는 DB 기본값으로 처리
- 마이그레이션 SQL 제공 (사용자가 Supabase SQL Editor에서 실행):
  - `workouts.user_id`에 기존 계정 UUID를 default로 설정
  - `workouts` RLS 정책을 anon 허용(select/insert/update/delete)으로 교체
  - `storage.objects`(photos 버킷) 정책도 anon 허용으로 교체
- ⚠️ 이후 anon key + URL만으로 데이터 접근 가능. 개인용 앱으로서 사용자가 리스크 인지하고 확정함

## 4. 전반 폴리싱

- 업로드/날짜 상세 페이지를 홈과 같은 톤으로 통일: 연그린 배경, 흰 카드, rounded-2xl, 그린 포인트 컬러
- 기능 변화 없는 순수 스타일 정리

## 범위 밖 (백로그 유지)

- 로딩 스켈레톤, 하단 탭 네비, 다크모드/PWA
- object URL revoke, 같은 파일 재선택, deleteWorkout 고아 파일, workouts 인덱스

## 테스트 / 검증

- `parseWorkoutStats` 순수 함수 Vitest 단위 테스트 (시간/거리/칼로리 매핑, 애매한 값 null 처리)
- 월 통계 합산 함수 단위 테스트 (null 섞인 데이터, 빈 달)
- `npm run build` + 기존 테스트 전체 통과 확인 후 master 푸시 → Vercel 자동 배포
- 실기기(모바일)에서 스와이프·OCR 확인은 배포 후 사용자 수동 확인
