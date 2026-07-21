# OCR 정확도 개선 (실험 검증 파이프라인 포팅) Implementation Plan

**Goal:** 실험으로 검증된 전처리 파이프라인(LED 마스크 → 기울기 보정 → 그룹 분할 → 그룹별 인식)을 브라우저로 포팅해 주력 기계 기준 그룹 정확도 ~75%를 달성한다.

**근거 실험:** scratchpad ocr-exp1~5 (2026-07-21). 원본→7seg 0% → v5 파이프라인 초록 기계 15/20(75%), 1장 5/5. 모델은 ssd_int(정수 LSTM, 1.4MB)가 최고. letsgodigital(legacy)은 유해해서 제거.

**Architecture:** 순수 배열 로직(밴드 탐색·기울기 추정·구분선 제거·그룹 분할·필드 매핑)은 `ocr-segment.ts`/`ocr-parse.ts`에 두고 Vitest로 TDD. 캔버스 픽셀 조작만 `ocr-preprocess.ts`(브라우저 전용). `recognizeWorkout` 시그니처 불변 — UI 3페이지 무수정.

## Tasks

1. **`src/lib/ocr-segment.ts`** (TDD): `findBand`, `estimateSkewDeg`, `removeDividers`, `splitGroups` — 실험 v5 로직의 순수 함수화
2. **`src/lib/ocr-parse.ts` 재작성** (TDD): `parseWorkoutStats` 제거 → `mapGroupsToStats(groups: string[]): ParsedStats`
   - 5그룹 패턴 [경사2, 칼로리3, 시간4(mmss), 거리4(/1000=km), 속도2]만 매핑, 그 외(파란 기계 등)는 전부 null(수동)
   - leading-'1' 복구(구분선 오인): 기대 자릿수+1이고 '1'로 시작하면 첫 자 제거
   - 유효성: ss<60, 시간 1~300분, 거리 0.1~99.9, 칼로리 50~2000
3. **`src/lib/ocr-preprocess.ts`**: 캔버스 파이프라인 `preprocessDashboard(image: Blob): Promise<Blob[] | null>` — 마스크(mx>120 && mx-mn>60) → 밴드 → 기울기 회귀 → 회전 → 재마스크 → 구분선 제거 → 그룹 분할 → 그룹별 크롭·높이 60px 업스케일·blur 1px·임계값(정규화 후 43%)·반전 PNG
4. **`src/lib/ocr.ts` 교체**: ssd_int(langPath /tessdata, gzip false, legacyCore true, PSM 7, whitelist '0123456789:.') 단일 모델. 전처리 실패 시 all-null 반환(수동 폴백). 에셋: `public/tessdata/ssd_int.traineddata` 추가, `letsgodigital.traineddata` 삭제
5. **검증·배포**: `npm test` + `npm run build`, 실사진 5장 노드 검증 스크립트로 회귀 확인(포팅 로직 대조), master 푸시

## 알려진 한계 (사용자 인지)
- 반사 얼룩이 숫자를 덮은 사진은 복구 불가
- 파란 LCD 기계는 자동 인식 안 됨(수동 입력)
- 5그룹 패턴이 아닌 표시 상태(쿨다운 화면 등)는 null
- 시간 그룹 크롭 왼쪽에 라벨/구분선 잔여물이 붙으면 시간이 틀린 값으로 프리필될 수 있음(실사진 5장 중 2장, 예: 35:42→16:12). 가로 패딩 제거로도 해소 안 됨 — 프리필은 저장 전 수정 가능하므로 수용

## 검증 결과 (2026-07-21, 실사진 5장 노드 회귀)
- 초록 기계 그룹 정확도 14/20 — 실험 v5(병합 채점 포함 15/20)와 실질 동등
- 7/16 사진: 병합(mergeSplitGroups) 덕에 3필드 모두 정확 인식
- 7/18 사진·파란 기계: 전부 null → 수동 입력 폴백 정상 동작
