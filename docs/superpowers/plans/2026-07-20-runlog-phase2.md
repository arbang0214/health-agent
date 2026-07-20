# 런로그 2차 (홈 리디자인 + OCR + 로그인 제거) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈을 "플레이풀 카드" 스타일로 리디자인(월 고정 + 통계 카드 + 스와이프)하고, Tesseract.js OCR로 계기판 수치를 자동 인식하며, 로그인을 완전히 제거한다.

**Architecture:** 순수 함수(통계 합산, OCR 텍스트 파싱)는 `src/lib`에 두고 Vitest로 TDD. OCR 엔진(WASM)은 dynamic import 래퍼로 격리. UI는 기존 페이지 3개 수정 + 일괄 분석 페이지 1개 신설. 인증 제거는 코드 삭제 + Supabase RLS 마이그레이션 SQL(사용자가 대시보드에서 실행).

**Tech Stack:** Next.js 15, React 19, Supabase(Postgres/Storage), Tailwind 4, tesseract.js(신규), date-fns, Vitest

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-20-runlog-phase2-design.md`
- 디자인 토큰: 페이지 배경 `bg-gradient-to-b from-emerald-50 to-emerald-100`, 카드 `rounded-2xl bg-white shadow-sm`, 포인트 컬러 emerald-500, AI 관련 버튼 violet-500
- 스탯 값이 없으면 항상 `—` 표시 (카드/줄 숨기지 않음)
- OCR은 무료 브라우저 전용(tesseract.js). LLM/외부 API 금지
- 테스트 명령: `npm test` (vitest run), 빌드: `npm run build`
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 저장소는 `C:\Users\77096\run-log`, 원격 `arbang0214/health-agent`, master 푸시 시 Vercel 자동 배포 — **최종 태스크 전까지 push 금지**

---

### Task 1: 월 통계 합산 함수 `summarizeMonth`

**Files:**
- Create: `src/lib/stats.ts`
- Test: `src/lib/__tests__/stats.test.ts`

**Interfaces:**
- Consumes: `Workout` 타입 (`src/lib/types.ts`), `groupByDateKey`가 만드는 `Map<string, Workout[]>` (키: `yyyy-MM-dd`)
- Produces: `summarizeMonth(byDay: Map<string, Workout[]>, monthPrefix: string): MonthSummary` — `MonthSummary = { days: number; distanceKm: number | null; durationMin: number | null; calories: number | null }`. Task 6(홈)이 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/__tests__/stats.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { summarizeMonth } from '@/lib/stats'
import type { Workout } from '@/lib/types'

function w(over: Partial<Workout>): Workout {
  return {
    id: 'id',
    user_id: 'u',
    taken_at: '2026-07-01T07:00:00Z',
    duration_min: null,
    distance_km: null,
    calories: null,
    analyzed_at: null,
    photo_path: 'p.jpg',
    created_at: '2026-07-01T07:00:00Z',
    ...over,
  }
}

describe('summarizeMonth', () => {
  it('해당 월의 운동한 날 수와 수치 합계를 구한다', () => {
    const byDay = new Map<string, Workout[]>([
      ['2026-07-01', [w({ duration_min: 30, distance_km: 5.2, calories: 320 })]],
      ['2026-07-03', [w({ duration_min: 28, distance_km: 4.1, calories: 290 }), w({ duration_min: 10 })]],
      ['2026-06-30', [w({ duration_min: 99, distance_km: 9.9, calories: 999 })]], // 다른 달
    ])
    const s = summarizeMonth(byDay, '2026-07')
    expect(s.days).toBe(2)
    expect(s.durationMin).toBe(68)
    expect(s.distanceKm).toBeCloseTo(9.3)
    expect(s.calories).toBe(610)
  })

  it('값이 하나도 없는 항목은 null (0이 아님)', () => {
    const byDay = new Map<string, Workout[]>([['2026-07-01', [w({ duration_min: 30 })]]])
    const s = summarizeMonth(byDay, '2026-07')
    expect(s.days).toBe(1)
    expect(s.durationMin).toBe(30)
    expect(s.distanceKm).toBeNull()
    expect(s.calories).toBeNull()
  })

  it('빈 달은 days 0, 수치 전부 null', () => {
    const s = summarizeMonth(new Map(), '2026-07')
    expect(s).toEqual({ days: 0, distanceKm: null, durationMin: null, calories: null })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/lib/__tests__/stats.test.ts`
Expected: FAIL — `Cannot find module '@/lib/stats'` 또는 유사 오류

- [ ] **Step 3: 구현**

`src/lib/stats.ts`:

```ts
import type { Workout } from '@/lib/types'

export type MonthSummary = {
  days: number
  distanceKm: number | null
  durationMin: number | null
  calories: number | null
}

/** monthPrefix: 'yyyy-MM'. 해당 월 기록의 운동한 날 수 + 수치 합계(값이 하나도 없으면 null). */
export function summarizeMonth(byDay: Map<string, Workout[]>, monthPrefix: string): MonthSummary {
  const entries = [...byDay.entries()].filter(([key]) => key.startsWith(monthPrefix))
  const all = entries.flatMap(([, ws]) => ws)
  const sum = (pick: (w: Workout) => number | null): number | null => {
    const vals = all.map(pick).filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null
  }
  return {
    days: entries.length,
    distanceKm: sum((w) => w.distance_km),
    durationMin: sum((w) => w.duration_min),
    calories: sum((w) => w.calories),
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- src/lib/__tests__/stats.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/stats.ts src/lib/__tests__/stats.test.ts
git commit -m "feat: add monthly workout summary aggregation"
```

---

### Task 2: OCR 텍스트 파서 `parseWorkoutStats`

**Files:**
- Create: `src/lib/ocr-parse.ts`
- Test: `src/lib/__tests__/ocr-parse.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces: `parseWorkoutStats(text: string): ParsedStats` — `ParsedStats = { duration_min: number | null; distance_km: number | null; calories: number | null }`. Task 3(OCR 엔진)이 사용.

**매핑 규칙 (스펙):** `mm:ss`/`h:mm:ss` → 시간(분, 반올림), 소수점 0.1~99.9 → 거리 km, 정수 50~2000 → kcal. 후보가 2개 이상이거나 범위 밖이면 null(사용자 확인에 맡김). 시간/거리 매치에 포함된 숫자는 칼로리 후보에서 제외.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/__tests__/ocr-parse.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseWorkoutStats } from '@/lib/ocr-parse'

describe('parseWorkoutStats', () => {
  it('시간/거리/칼로리가 하나씩 있으면 모두 매핑한다', () => {
    expect(parseWorkoutStats('TIME 32:15 DIST 5.2 CAL 320')).toEqual({
      duration_min: 32,
      distance_km: 5.2,
      calories: 320,
    })
  })

  it('h:mm:ss 형식을 분으로 환산한다', () => {
    expect(parseWorkoutStats('1:02:30').duration_min).toBe(63)
  })

  it('소수점 숫자가 2개 이상이면 거리는 null (속도/경사도와 구분 불가)', () => {
    const r = parseWorkoutStats('SPEED 8.5 DIST 5.2')
    expect(r.distance_km).toBeNull()
  })

  it('범위 내 정수가 2개 이상이면 칼로리는 null', () => {
    expect(parseWorkoutStats('320 450').calories).toBeNull()
  })

  it('시간 매치 안의 숫자는 칼로리 후보에서 제외한다', () => {
    expect(parseWorkoutStats('45:30 CAL 380')).toEqual({
      duration_min: 46,
      distance_km: null,
      calories: 380,
    })
  })

  it('빈 문자열은 전부 null', () => {
    expect(parseWorkoutStats('')).toEqual({ duration_min: null, distance_km: null, calories: null })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/lib/__tests__/ocr-parse.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/ocr-parse.ts`:

```ts
export type ParsedStats = {
  duration_min: number | null
  distance_km: number | null
  calories: number | null
}

const TIME_RE = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g
const DECIMAL_RE = /\b(\d{1,2}\.\d{1,2})\b/g
const INT_RE = /\b(\d{2,4})\b/g

type Span = readonly [number, number]

function outside(spans: Span[], index: number, len: number): boolean {
  return spans.every(([s, e]) => index + len <= s || index >= e)
}

/** OCR 텍스트에서 시간/거리/칼로리 추출. 애매하면(후보 2개 이상, 범위 밖) null. */
export function parseWorkoutStats(text: string): ParsedStats {
  const times = [...text.matchAll(TIME_RE)]
  const timeSpans: Span[] = times.map((m) => [m.index, m.index + m[0].length])

  let duration_min: number | null = null
  if (times.length === 1) {
    const [, a, b, c] = times[0]
    const secs =
      c !== undefined
        ? Number(a) * 3600 + Number(b) * 60 + Number(c)
        : Number(a) * 60 + Number(b)
    const min = Math.round(secs / 60)
    duration_min = min > 0 ? min : null
  }

  const decimals = [...text.matchAll(DECIMAL_RE)].filter((m) => outside(timeSpans, m.index, m[0].length))
  const decimalSpans: Span[] = decimals.map((m) => [m.index, m.index + m[0].length])

  let distance_km: number | null = null
  if (decimals.length === 1) {
    const v = Number(decimals[0][1])
    if (v >= 0.1 && v <= 99.9) distance_km = v
  }

  const ints = [...text.matchAll(INT_RE)].filter((m) => {
    const v = Number(m[1])
    return (
      v >= 50 &&
      v <= 2000 &&
      outside(timeSpans, m.index, m[0].length) &&
      outside(decimalSpans, m.index, m[0].length)
    )
  })
  const calories = ints.length === 1 ? Number(ints[0][1]) : null

  return { duration_min, distance_km, calories }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- src/lib/__tests__/ocr-parse.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/ocr-parse.ts src/lib/__tests__/ocr-parse.test.ts
git commit -m "feat: add OCR text parser for treadmill stats"
```

---

### Task 3: OCR 엔진 래퍼 `recognizeWorkout`

**Files:**
- Create: `src/lib/ocr.ts`
- Create: `public/tessdata/letsgodigital.traineddata` (다운로드; 실패 시 생략 가능)
- Modify: `package.json` (tesseract.js 추가)

**Interfaces:**
- Consumes: `parseWorkoutStats`, `ParsedStats` (Task 2)
- Produces: `recognizeWorkout(image: Blob | string): Promise<ParsedStats>` — Task 7(업로드), Task 9(일괄 분석)가 사용. 워커는 모듈 레벨에서 1회 생성 후 재사용.

브라우저 WASM이라 단위 테스트 불가 — `npm run build` 통과와 이후 수동 확인으로 검증.

- [ ] **Step 1: tesseract.js 설치**

Run: `npm install tesseract.js`
Expected: package.json dependencies에 `tesseract.js` 추가됨

- [ ] **Step 2: 7-세그먼트 모델 다운로드 (실패해도 진행)**

```bash
mkdir -p public/tessdata
curl -fL -o public/tessdata/letsgodigital.traineddata https://raw.githubusercontent.com/arturaugusto/display_ocr/master/letsgodigital/letsgodigital.traineddata
```

Expected: 파일 생성 (약 900KB). **404/네트워크 오류로 실패하면 이 파일 없이 진행** — 코드가 eng 모델로 폴백하므로 기능은 동작한다. 실패 시 파일이 남지 않았는지 확인(`ls public/tessdata`)하고 0바이트 파일이면 삭제.

- [ ] **Step 3: 래퍼 구현**

`src/lib/ocr.ts`:

```ts
import { parseWorkoutStats, type ParsedStats } from '@/lib/ocr-parse'
import type { Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null

async function createOcrWorker(): Promise<Worker> {
  const { createWorker, OEM } = await import('tesseract.js')
  try {
    // 7-세그먼트 전용 모델 (public/tessdata/letsgodigital.traineddata, legacy 엔진)
    return await createWorker('letsgodigital', OEM.TESSERACT_ONLY, {
      langPath: '/tessdata',
      gzip: false,
      legacyCore: true,
      legacyLang: true,
    })
  } catch {
    // 폴백: 기본 영어 모델 + 숫자 화이트리스트
    const worker = await createWorker('eng')
    await worker.setParameters({ tessedit_char_whitelist: '0123456789:. ' })
    return worker
  }
}

/** 계기판 사진에서 시간/거리/칼로리 인식. 실패 시 throw — 호출부에서 수동 입력으로 폴백. */
export async function recognizeWorkout(image: Blob | string): Promise<ParsedStats> {
  if (!workerPromise) {
    workerPromise = createOcrWorker().catch((err) => {
      workerPromise = null // 다음 호출에서 재시도
      throw err
    })
  }
  const worker = await workerPromise
  const { data } = await worker.recognize(image)
  return parseWorkoutStats(data.text)
}
```

- [ ] **Step 4: 빌드로 타입/번들 확인**

Run: `npm run build`
Expected: 성공. `createWorker` 옵션 타입 오류가 나면 해당 옵션 객체에 `as Partial<Tesseract.WorkerOptions>` 캐스팅 대신 옵션 이름을 tesseract.js 설치 버전의 `WorkerOptions` 타입 정의(`node_modules/tesseract.js/src/index.d.ts`)와 대조해 수정한다.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/ocr.ts package.json package-lock.json public/tessdata
git commit -m "feat: add tesseract.js OCR wrapper with 7-segment model"
```

---

### Task 4: workouts 데이터 계층 확장

**Files:**
- Modify: `src/lib/workouts.ts`

**Interfaces:**
- Consumes: 기존 `createClient`, `Workout`
- Produces (Task 6·7·8·9가 사용):
  - `type WorkoutStats = { duration_min: number | null; distance_km: number | null; calories: number | null }`
  - `addWorkout(photo: Blob, takenAt: Date, stats?: WorkoutStats): Promise<void>` — stats가 있으면 `analyzed_at`도 기록
  - `updateWorkoutStats(id: string, stats: WorkoutStats): Promise<void>` — `analyzed_at` 갱신 포함
  - `listUnanalyzed(): Promise<Workout[]>` — `analyzed_at is null`, taken_at 오름차순

단위 테스트 없음(전부 Supabase 호출 래퍼) — 빌드로 타입 검증. **이 태스크에서는 auth 코드를 아직 건드리지 않는다** (로그인 제거는 Task 5).

- [ ] **Step 1: workouts.ts 수정**

`src/lib/workouts.ts`에서 `addWorkout`을 아래로 교체하고, `deleteWorkout` 뒤에 두 함수를 추가:

```ts
export type WorkoutStats = {
  duration_min: number | null
  distance_km: number | null
  calories: number | null
}

export async function addWorkout(photo: Blob, takenAt: Date, stats?: WorkoutStats): Promise<void> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다')

  const path = `${user.id}/${crypto.randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, photo, { contentType: 'image/jpeg' })
  if (uploadError) throw new Error(`사진 업로드 실패: ${uploadError.message}`)

  const row: Record<string, unknown> = { taken_at: takenAt.toISOString(), photo_path: path }
  if (stats) Object.assign(row, stats, { analyzed_at: new Date().toISOString() })

  const { error: insertError } = await supabase.from('workouts').insert(row)
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(`기록 저장 실패: ${insertError.message}`)
  }
}

export async function updateWorkoutStats(id: string, stats: WorkoutStats): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('workouts')
    .update({ ...stats, analyzed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`기록 수정 실패: ${error.message}`)
}

export async function listUnanalyzed(): Promise<Workout[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .is('analyzed_at', null)
    .order('taken_at', { ascending: true })
  if (error) throw new Error(`기록 조회 실패: ${error.message}`)
  return (data ?? []) as Workout[]
}
```

- [ ] **Step 2: 빌드 + 기존 테스트 확인**

Run: `npm run build; if ($?) { npm test }`
Expected: 빌드 성공, 기존 테스트 전체 PASS

- [ ] **Step 3: 커밋**

```bash
git add src/lib/workouts.ts
git commit -m "feat: extend workout data layer with stats and unanalyzed queries"
```

---

### Task 5: 로그인 제거 + RLS 마이그레이션 SQL

**Files:**
- Delete: `src/app/login/page.tsx`, `src/middleware.ts`, `src/lib/supabase/middleware.ts`
- Modify: `src/lib/workouts.ts` (`addWorkout`의 auth 체크 제거)
- Create: `docs/migrations/2026-07-20-remove-auth.sql`

**Interfaces:**
- Consumes: Task 4의 `addWorkout`
- Produces: 인증 없이 동작하는 앱. `addWorkout`의 시그니처는 그대로, 내부에서 `getUser` 제거. 사진 경로는 `public/<uuid>.jpg`로 변경(기존 경로 사진은 저장된 `photo_path`로 계속 조회되므로 영향 없음).

- [ ] **Step 1: 파일 삭제**

```bash
git rm src/app/login/page.tsx src/middleware.ts src/lib/supabase/middleware.ts
```

- [ ] **Step 2: addWorkout에서 auth 제거**

`src/lib/workouts.ts`의 `addWorkout` 상단을 아래로 교체 (getUser 블록과 user.id 경로 제거):

```ts
export async function addWorkout(photo: Blob, takenAt: Date, stats?: WorkoutStats): Promise<void> {
  const supabase = createClient()
  const path = `public/${crypto.randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, photo, { contentType: 'image/jpeg' })
  if (uploadError) throw new Error(`사진 업로드 실패: ${uploadError.message}`)

  const row: Record<string, unknown> = { taken_at: takenAt.toISOString(), photo_path: path }
  if (stats) Object.assign(row, stats, { analyzed_at: new Date().toISOString() })

  const { error: insertError } = await supabase.from('workouts').insert(row)
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(`기록 저장 실패: ${insertError.message}`)
  }
}
```

- [ ] **Step 3: 남은 auth 참조 검색**

Run: `grep -rn "auth\.\|/login\|updateSession" src/`
Expected: 매치 없음 (있으면 해당 참조 제거)

- [ ] **Step 4: 마이그레이션 SQL 작성**

`docs/migrations/2026-07-20-remove-auth.sql`:

```sql
-- 런로그 2차: 로그인 제거 마이그레이션
-- 실행 위치: Supabase 대시보드 > SQL Editor (프로젝트 wjaifunxiwrunceggmmh)
-- 효과: anon key만으로 workouts/photos 전체 접근 허용 (개인용 앱, 사용자 확인됨)

-- 1) user_id 기본값을 기존 계정 UUID로 고정 (인증 없는 insert 대비)
do $$
declare uid uuid;
begin
  select id into uid from auth.users order by created_at limit 1;
  if uid is null then
    raise exception 'auth.users가 비어 있습니다 — 기존 계정을 찾을 수 없음';
  end if;
  execute format('alter table public.workouts alter column user_id set default %L', uid);
end $$;

-- 2) workouts: 기존 정책 전부 제거 후 anon 전체 허용
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'workouts'
  loop
    execute format('drop policy %I on public.workouts', p.policyname);
  end loop;
end $$;

create policy "runlog anon all" on public.workouts
  for all to anon, authenticated
  using (true) with check (true);

-- 3) storage.objects: 기존 정책 전부 제거 후 photos 버킷 anon 허용
--    (이 프로젝트의 버킷은 photos 하나뿐)
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy "runlog photos anon all" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'photos') with check (bucket_id = 'photos');
```

- [ ] **Step 5: 빌드 + 테스트**

Run: `npm run build; if ($?) { npm test }`
Expected: 빌드 성공(middleware 없이), 테스트 전체 PASS

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat: remove login flow, add anon RLS migration"
```

- [ ] **Step 7: 사용자 액션 (블로킹)**

사용자에게 요청: Supabase 대시보드 > SQL Editor에서 `docs/migrations/2026-07-20-remove-auth.sql` 전체를 실행. **실행 완료 확인 전에는 로컬 수동 테스트(dev 서버에서 업로드)와 최종 push를 진행하지 않는다** (RLS가 막고 있어 anon 접근이 전부 실패함).

---

### Task 6: 홈 리디자인

**Files:**
- Modify: `src/app/page.tsx` (전체 교체)

**Interfaces:**
- Consumes: `summarizeMonth`/`MonthSummary` (Task 1), `listUnanalyzed`, `listWorkouts` (Task 4), 기존 `getMonthGrid`, `groupByDateKey`, `toDateKey`
- Produces: `/analyze` 링크 (Task 9가 해당 페이지 구현)

변경: B 플레이풀 스타일, 월/주 토글 제거(월 고정), "이번 달 n회" 배지, 스탯 카드 3칸(—폴백), 오늘 버튼, 스와이프 월 이동, 미분석 있을 때 AI 분석 버튼.

- [ ] **Step 1: page.tsx 전체 교체**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { getMonthGrid, groupByDateKey, toDateKey } from '@/lib/calendar'
import { summarizeMonth } from '@/lib/stats'
import { listUnanalyzed, listWorkouts } from '@/lib/workouts'
import type { Workout } from '@/lib/types'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}분`
}

export default function CalendarPage() {
  const [anchor, setAnchor] = useState(() => new Date())
  const [byDay, setByDay] = useState<Map<string, Workout[]>>(new Map())
  const [unanalyzedCount, setUnanalyzedCount] = useState(0)
  const [error, setError] = useState('')
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    let stale = false
    const from = startOfWeek(startOfMonth(anchor))
    const to = endOfWeek(endOfMonth(anchor))
    listWorkouts(from, to)
      .then((ws) => {
        if (stale) return
        setByDay(groupByDateKey(ws))
        setError('')
      })
      .catch((err) => {
        if (stale) return
        setError(err instanceof Error ? err.message : '조회 실패')
      })
    return () => {
      stale = true
    }
  }, [anchor])

  useEffect(() => {
    let stale = false
    listUnanalyzed()
      .then((ws) => {
        if (!stale) setUnanalyzedCount(ws.length)
      })
      .catch(() => {}) // 배지 실패는 치명적이지 않음
    return () => {
      stale = true
    }
  }, [])

  const summary = summarizeMonth(byDay, format(anchor, 'yyyy-MM'))
  const isCurrentMonth = isSameMonth(anchor, new Date())
  const weeks = getMonthGrid(anchor.getFullYear(), anchor.getMonth() + 1)

  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    // 가로 우세(세로의 2배 이상) + 60px 이상일 때만 월 이동
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
      setAnchor((a) => addMonths(a, dx < 0 ? 1 : -1))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-emerald-100">
      <main
        className="mx-auto max-w-2xl p-4 pb-28"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <header className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-emerald-900">🏃 런로그</h1>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm">
            이번 달 {summary.days}회
          </span>
        </header>

        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setAnchor((a) => addMonths(a, -1))} className="p-2 text-emerald-800">
            ◀
          </button>
          <div className="flex items-center gap-2">
            <span className="font-bold text-emerald-950">{format(anchor, 'yyyy년 M월')}</span>
            {!isCurrentMonth && (
              <button
                onClick={() => setAnchor(new Date())}
                className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white"
              >
                오늘
              </button>
            )}
          </div>
          <button onClick={() => setAnchor((a) => addMonths(a, 1))} className="p-2 text-emerald-800">
            ▶
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          <StatCard value={summary.distanceKm !== null ? `${summary.distanceKm.toFixed(1)}km` : '—'} label="거리" />
          <StatCard value={summary.durationMin !== null ? formatDuration(summary.durationMin) : '—'} label="시간" />
          <StatCard value={summary.calories !== null ? summary.calories.toLocaleString() : '—'} label="kcal" />
        </div>

        {unanalyzedCount > 0 && (
          <Link
            href="/analyze"
            className="mb-3 block rounded-2xl bg-violet-500 p-3 text-center text-sm font-bold text-white shadow-sm"
          >
            ✨ AI 분석 (사진 {unanalyzedCount}장)
          </Link>
        )}

        {error && <p className="mb-2 rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <div className="rounded-2xl bg-white p-3 shadow-sm">
          <div className="grid grid-cols-7 text-center text-xs text-gray-400">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>
          {weeks.map((week, i) => (
            <div key={i} className="grid grid-cols-7">
              {week.map((day) => (
                <DayCell
                  key={day.toISOString()}
                  day={day}
                  workouts={byDay.get(toDateKey(day)) ?? []}
                  inMonth={day.getMonth() === anchor.getMonth()}
                />
              ))}
            </div>
          ))}
        </div>

        <Link
          href="/upload"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-500/40"
        >
          ＋ 기록하기
        </Link>
      </main>
    </div>
  )
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 rounded-2xl bg-white p-3 text-center shadow-sm">
      <div className="text-base font-extrabold text-emerald-600">{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  )
}

function DayCell({ day, workouts, inMonth }: { day: Date; workouts: Workout[]; inMonth: boolean }) {
  const key = toDateKey(day)
  const isToday = key === toDateKey(new Date())
  const cell = (
    <div
      className={`flex h-16 flex-col items-center rounded-xl p-1 ${inMonth ? '' : 'opacity-30'} ${
        isToday ? 'bg-emerald-500' : ''
      }`}
    >
      <span className={`text-xs ${isToday ? 'font-bold text-white' : 'text-gray-600'}`}>{day.getDate()}</span>
      {workouts.length > 0 && (
        <span className="relative mt-1 text-2xl leading-none">
          🏃
          {workouts.length > 1 && (
            <span className="absolute -right-2 -top-1 rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">
              {workouts.length}
            </span>
          )}
        </span>
      )}
    </div>
  )
  // 기록 있는 날 → 상세보기, 없는 날 → 그 날짜로 기록 등록
  return workouts.length > 0 ? (
    <Link href={`/day/${key}`}>{cell}</Link>
  ) : (
    <Link href={`/upload?date=${key}`}>{cell}</Link>
  )
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공. `/analyze` 페이지는 아직 없지만 `<Link>`는 빌드를 깨지 않음.

- [ ] **Step 3: 커밋**

```bash
git add src/app/page.tsx
git commit -m "feat: redesign home with stats cards, today button, and swipe navigation"
```

---

### Task 7: 업로드 화면 — OCR 자동 분석 + 스타일 통일

**Files:**
- Modify: `src/app/upload/page.tsx` (전체 교체)

**Interfaces:**
- Consumes: `recognizeWorkout` (Task 3), `addWorkout(photo, takenAt, stats)` (Task 4·5), 기존 exif/image 유틸
- Produces: 없음

변경: 사진 선택 시 EXIF와 함께 OCR 자동 실행 → 시간/거리/칼로리 필드 프리필(사용자 수정 가능) → 저장 시 stats 포함(`analyzed_at` 기록됨). B 톤 스타일.

- [ ] **Step 1: upload/page.tsx 전체 교체**

```tsx
'use client'
import { Suspense, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { extractTakenAt, fallbackTakenAt, resolveTakenAt } from '@/lib/exif'
import { compressImage } from '@/lib/image'
import { recognizeWorkout } from '@/lib/ocr'
import { addWorkout } from '@/lib/workouts'

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function UploadForm() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [takenAt, setTakenAt] = useState('')
  const [exifFound, setExifFound] = useState(true)
  const [durationMin, setDurationMin] = useState('')
  const [distanceKm, setDistanceKm] = useState('')
  const [calories, setCalories] = useState('')
  const [ocrRunning, setOcrRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ocrRun = useRef(0)
  const router = useRouter()
  const dateParam = useSearchParams().get('date')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError('')
    setFile(f)
    setPreview(URL.createObjectURL(f))
    // 중요: 압축 전에 EXIF를 읽는다 (압축하면 EXIF가 사라짐)
    const exifDate = await extractTakenAt(f)
    setExifFound(exifDate !== null)
    setTakenAt(toLocalInputValue(resolveTakenAt(exifDate, fallbackTakenAt(dateParam, new Date()))))

    // OCR 자동 인식 (실패해도 수동 입력으로 진행)
    const run = ++ocrRun.current
    setDurationMin('')
    setDistanceKm('')
    setCalories('')
    setOcrRunning(true)
    try {
      const stats = await recognizeWorkout(f)
      if (run !== ocrRun.current) return // 그 사이 다른 사진 선택됨
      if (stats.duration_min !== null) setDurationMin(String(stats.duration_min))
      if (stats.distance_km !== null) setDistanceKm(String(stats.distance_km))
      if (stats.calories !== null) setCalories(String(stats.calories))
    } catch {
      // 인식 실패 — 빈 칸 유지
    } finally {
      if (run === ocrRun.current) setOcrRunning(false)
    }
  }

  async function handleSave() {
    if (!file || !takenAt) return
    setSaving(true)
    setError('')
    const toNum = (s: string) => (s.trim() === '' ? null : Number(s))
    try {
      const compressed = await compressImage(file)
      await addWorkout(compressed, new Date(takenAt), {
        duration_min: toNum(durationMin),
        distance_km: toNum(distanceKm),
        calories: toNum(calories),
      })
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-emerald-100">
      <main className="mx-auto max-w-md space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-emerald-900">
            운동 기록 올리기
            {dateParam && <span className="ml-2 text-sm font-normal text-gray-500">{dateParam}</span>}
          </h1>
          <Link href="/" className="text-sm text-gray-500">
            닫기
          </Link>
        </div>

        <label className="block cursor-pointer rounded-2xl bg-white p-6 text-center shadow-sm">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="미리보기" className="mx-auto max-h-80 rounded-xl" />
          ) : (
            <span className="text-gray-500">📷 계기판 사진 선택 (탭하면 촬영/앨범)</span>
          )}
          <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </label>

        {file && (
          <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
            <div>
              <label className="block text-sm font-medium">
                촬영 일시{' '}
                {!exifFound && <span className="text-amber-600">(사진에서 못 읽어서 직접 확인해주세요)</span>}
              </label>
              <input
                type="datetime-local"
                value={takenAt}
                onChange={(e) => setTakenAt(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 p-3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">
                운동 수치{' '}
                {ocrRunning ? (
                  <span className="text-violet-600">✨ 사진에서 인식 중…</span>
                ) : (
                  <span className="text-gray-400">(틀리면 바로 고쳐주세요)</span>
                )}
              </label>
              <div className="mt-1 flex gap-2">
                <label className="flex-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    value={durationMin}
                    onChange={(e) => setDurationMin(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 p-3 text-center"
                  />
                  <span className="block text-center text-[10px] text-gray-400">분</span>
                </label>
                <label className="flex-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="—"
                    value={distanceKm}
                    onChange={(e) => setDistanceKm(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 p-3 text-center"
                  />
                  <span className="block text-center text-[10px] text-gray-400">km</span>
                </label>
                <label className="flex-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 p-3 text-center"
                  />
                  <span className="block text-center text-[10px] text-gray-400">kcal</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error} — 다시 시도해주세요.</p>
        )}

        <button
          onClick={handleSave}
          disabled={!file || !takenAt || saving}
          className="w-full rounded-full bg-emerald-500 p-3 font-bold text-white shadow-lg shadow-emerald-500/40 disabled:opacity-40"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </main>
    </div>
  )
}

export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadForm />
    </Suspense>
  )
}
```

- [ ] **Step 2: 빌드 + 테스트**

Run: `npm run build; if ($?) { npm test }`
Expected: 모두 성공

- [ ] **Step 3: 커밋**

```bash
git add src/app/upload/page.tsx
git commit -m "feat: auto-run OCR on photo select in upload flow"
```

---

### Task 8: 날짜 상세 — 수치 표시 + 인라인 수정

**Files:**
- Modify: `src/app/day/[date]/page.tsx` (전체 교체)

**Interfaces:**
- Consumes: `updateWorkoutStats` (Task 4), 기존 `deleteWorkout`, `getPhotoUrl`, `listWorkouts`
- Produces: 없음

변경: 사진 아래 `32분 · 5.2km · 320kcal`(없는 값 —) 표시 + "수정" 버튼 → 인라인 3필드 편집 → 저장. B 톤 스타일.

- [ ] **Step 1: day/[date]/page.tsx 전체 교체**

```tsx
'use client'
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { deleteWorkout, getPhotoUrl, listWorkouts, updateWorkoutStats } from '@/lib/workouts'
import type { Workout } from '@/lib/types'

type Entry = { workout: Workout; url: string }

function statsLabel(w: Workout): string {
  const dur = w.duration_min !== null ? `${w.duration_min}분` : '—'
  const dist = w.distance_km !== null ? `${w.distance_km}km` : '—'
  const cal = w.calories !== null ? `${w.calories}kcal` : '—'
  return `${dur} · ${dist} · ${cal}`
}

export default function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const from = new Date(`${date}T00:00:00`)
      const to = new Date(`${date}T23:59:59.999`)
      const workouts = await listWorkouts(from, to)
      const urls = await Promise.all(workouts.map((w) => getPhotoUrl(w.photo_path)))
      setEntries(workouts.map((workout, i) => ({ workout, url: urls[i] })))
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회에 실패했습니다')
    }
  }, [date])

  useEffect(() => {
    let stale = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const from = new Date(`${date}T00:00:00`)
        const to = new Date(`${date}T23:59:59.999`)
        const workouts = await listWorkouts(from, to)
        const urls = await Promise.all(workouts.map((w) => getPhotoUrl(w.photo_path)))
        if (stale) return
        setEntries(workouts.map((workout, i) => ({ workout, url: urls[i] })))
      } catch (err) {
        if (stale) return
        setError(err instanceof Error ? err.message : '조회에 실패했습니다')
      } finally {
        if (!stale) setLoading(false)
      }
    })()
    return () => {
      stale = true
    }
  }, [date])

  async function handleDelete(w: Workout) {
    if (!window.confirm('이 기록을 삭제할까요?')) return
    try {
      await deleteWorkout(w)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-emerald-100">
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-emerald-900">{date}</h1>
          <Link href="/" className="text-sm text-gray-500">
            ← 캘린더
          </Link>
        </div>

        {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {loading && <p className="p-8 text-center text-gray-400">불러오는 중…</p>}
        {!loading && entries.length === 0 && !error && (
          <p className="p-8 text-center text-gray-400">이날의 기록이 없습니다</p>
        )}

        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto">
          {entries.map(({ workout, url }) => (
            <WorkoutCard
              key={workout.id}
              workout={workout}
              url={url}
              onDelete={() => handleDelete(workout)}
              onSaved={load}
              onError={setError}
            />
          ))}
        </div>
        {entries.length > 1 && (
          <p className="text-center text-xs text-gray-400">← 옆으로 넘겨서 다른 사진 보기 →</p>
        )}
      </main>
    </div>
  )
}

function WorkoutCard({
  workout,
  url,
  onDelete,
  onSaved,
  onError,
}: {
  workout: Workout
  url: string
  onDelete: () => void
  onSaved: () => Promise<void>
  onError: (msg: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [durationMin, setDurationMin] = useState(workout.duration_min !== null ? String(workout.duration_min) : '')
  const [distanceKm, setDistanceKm] = useState(workout.distance_km !== null ? String(workout.distance_km) : '')
  const [calories, setCalories] = useState(workout.calories !== null ? String(workout.calories) : '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const toNum = (s: string) => (s.trim() === '' ? null : Number(s))
    try {
      await updateWorkoutStats(workout.id, {
        duration_min: toNum(durationMin),
        distance_km: toNum(distanceKm),
        calories: toNum(calories),
      })
      await onSaved()
      setEditing(false)
    } catch (err) {
      onError(err instanceof Error ? err.message : '수정에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full flex-shrink-0 snap-center space-y-2 rounded-2xl bg-white p-3 shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="운동 기록 사진" className="w-full rounded-xl" />
      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-gray-600">
          🕐{' '}
          {new Date(workout.taken_at).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        <button onClick={onDelete} className="text-sm text-red-500">
          삭제
        </button>
      </div>
      {editing ? (
        <div className="space-y-2 px-1">
          <div className="flex gap-2">
            <label className="flex-1">
              <input
                type="number"
                inputMode="numeric"
                placeholder="—"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                className="w-full rounded-xl border border-gray-200 p-2 text-center text-sm"
              />
              <span className="block text-center text-[10px] text-gray-400">분</span>
            </label>
            <label className="flex-1">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="—"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                className="w-full rounded-xl border border-gray-200 p-2 text-center text-sm"
              />
              <span className="block text-center text-[10px] text-gray-400">km</span>
            </label>
            <label className="flex-1">
              <input
                type="number"
                inputMode="numeric"
                placeholder="—"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                className="w-full rounded-xl border border-gray-200 p-2 text-center text-sm"
              />
              <span className="block text-center text-[10px] text-gray-400">kcal</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-full bg-emerald-500 p-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex-1 rounded-full bg-gray-100 p-2 text-sm text-gray-600"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-bold text-emerald-700">{statsLabel(workout)}</span>
          <button onClick={() => setEditing(true)} className="text-sm text-gray-400">
            ✎ 수정
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 빌드 + 테스트**

Run: `npm run build; if ($?) { npm test }`
Expected: 모두 성공

- [ ] **Step 3: 커밋**

```bash
git add "src/app/day/[date]/page.tsx"
git commit -m "feat: show and edit workout stats on day detail"
```

---

### Task 9: 일괄 분석 페이지 `/analyze`

**Files:**
- Create: `src/app/analyze/page.tsx`

**Interfaces:**
- Consumes: `listUnanalyzed`, `updateWorkoutStats`, `getPhotoUrl` (Task 4), `recognizeWorkout` (Task 3)
- Produces: 없음 (홈의 `✨ AI 분석` 버튼이 이 페이지로 링크)

동작: 진입 시 미분석 기록 로드 → 순차 OCR(진행 표시) → 건별 편집 가능한 결과 목록 → "모두 저장" 시 전 건 `updateWorkoutStats`(OCR 실패 건도 analyzed_at이 기록되어 다시 뜨지 않음 — 사용자가 확인했으므로 의도된 동작) → 홈으로.

- [ ] **Step 1: analyze/page.tsx 작성**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { recognizeWorkout } from '@/lib/ocr'
import { getPhotoUrl, listUnanalyzed, updateWorkoutStats } from '@/lib/workouts'
import type { Workout } from '@/lib/types'

type ItemStatus = 'pending' | 'running' | 'done' | 'failed'
type Item = {
  workout: Workout
  url: string
  status: ItemStatus
  durationMin: string
  distanceKm: string
  calories: string
}

export default function AnalyzePage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const started = useRef(false)
  const router = useRouter()

  useEffect(() => {
    if (started.current) return // StrictMode 재실행 방지
    started.current = true
    ;(async () => {
      try {
        const workouts = await listUnanalyzed()
        const urls = await Promise.all(workouts.map((w) => getPhotoUrl(w.photo_path)))
        const initial: Item[] = workouts.map((workout, i) => ({
          workout,
          url: urls[i],
          status: 'pending',
          durationMin: '',
          distanceKm: '',
          calories: '',
        }))
        setItems(initial)
        setLoading(false)

        // 순차 OCR (WASM 워커 1개 재사용)
        for (let i = 0; i < initial.length; i++) {
          setItems((prev) => prev.map((it, j) => (j === i ? { ...it, status: 'running' } : it)))
          try {
            const blob = await fetch(initial[i].url).then((r) => {
              if (!r.ok) throw new Error(`사진 다운로드 실패 (${r.status})`)
              return r.blob()
            })
            const stats = await recognizeWorkout(blob)
            setItems((prev) =>
              prev.map((it, j) =>
                j === i
                  ? {
                      ...it,
                      status: 'done',
                      durationMin: stats.duration_min !== null ? String(stats.duration_min) : '',
                      distanceKm: stats.distance_km !== null ? String(stats.distance_km) : '',
                      calories: stats.calories !== null ? String(stats.calories) : '',
                    }
                  : it
              )
            )
          } catch {
            setItems((prev) => prev.map((it, j) => (j === i ? { ...it, status: 'failed' } : it)))
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '조회에 실패했습니다')
        setLoading(false)
      }
    })()
  }, [])

  const analyzing = items.some((it) => it.status === 'pending' || it.status === 'running')

  function updateField(index: number, field: 'durationMin' | 'distanceKm' | 'calories', value: string) {
    setItems((prev) => prev.map((it, j) => (j === index ? { ...it, [field]: value } : it)))
  }

  async function handleSaveAll() {
    setSaving(true)
    setError('')
    const toNum = (s: string) => (s.trim() === '' ? null : Number(s))
    try {
      for (const it of items) {
        await updateWorkoutStats(it.workout.id, {
          duration_min: toNum(it.durationMin),
          distance_km: toNum(it.distanceKm),
          calories: toNum(it.calories),
        })
      }
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-emerald-100">
      <main className="mx-auto max-w-md space-y-4 p-4 pb-24">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-emerald-900">✨ AI 분석</h1>
          <Link href="/" className="text-sm text-gray-500">
            닫기
          </Link>
        </div>

        {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {loading && <p className="p-8 text-center text-gray-400">불러오는 중…</p>}
        {!loading && items.length === 0 && !error && (
          <p className="p-8 text-center text-gray-400">분석할 사진이 없습니다</p>
        )}

        {items.map((it, i) => (
          <div key={it.workout.id} className="space-y-2 rounded-2xl bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.url} alt="운동 기록 사진" className="h-14 w-14 rounded-xl object-cover" />
              <div className="flex-1 text-sm">
                <div className="font-bold text-gray-700">
                  {new Date(it.workout.taken_at).toLocaleDateString('ko-KR', {
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
                <div className="text-xs">
                  {it.status === 'pending' && <span className="text-gray-400">대기 중</span>}
                  {it.status === 'running' && <span className="text-violet-600">✨ 인식 중…</span>}
                  {it.status === 'done' && <span className="text-emerald-600">✓ 인식 완료 — 확인해주세요</span>}
                  {it.status === 'failed' && <span className="text-amber-600">인식 실패 — 직접 입력해주세요</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <label className="flex-1">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="—"
                  value={it.durationMin}
                  onChange={(e) => updateField(i, 'durationMin', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-2 text-center text-sm"
                />
                <span className="block text-center text-[10px] text-gray-400">분</span>
              </label>
              <label className="flex-1">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="—"
                  value={it.distanceKm}
                  onChange={(e) => updateField(i, 'distanceKm', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-2 text-center text-sm"
                />
                <span className="block text-center text-[10px] text-gray-400">km</span>
              </label>
              <label className="flex-1">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="—"
                  value={it.calories}
                  onChange={(e) => updateField(i, 'calories', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-2 text-center text-sm"
                />
                <span className="block text-center text-[10px] text-gray-400">kcal</span>
              </label>
            </div>
          </div>
        ))}

        {items.length > 0 && (
          <button
            onClick={handleSaveAll}
            disabled={analyzing || saving}
            className="fixed bottom-6 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-full bg-emerald-500 p-3 font-bold text-white shadow-lg shadow-emerald-500/40 disabled:opacity-40"
          >
            {analyzing ? '분석 중…' : saving ? '저장 중…' : `모두 저장 (${items.length}건)`}
          </button>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 + 테스트**

Run: `npm run build; if ($?) { npm test }`
Expected: 모두 성공, 빌드 출력에 `/analyze` 라우트 표시

- [ ] **Step 3: 커밋**

```bash
git add src/app/analyze/page.tsx
git commit -m "feat: add batch AI analysis page for unanalyzed photos"
```

---

### Task 10: 최종 검증 + 배포

**Files:** 없음 (검증만)

**Interfaces:** 없음

- [ ] **Step 1: 전체 테스트 + 빌드**

Run: `npm test; if ($?) { npm run build }`
Expected: 테스트 전체 PASS, 빌드 성공 (라우트: `/`, `/upload`, `/day/[date]`, `/analyze` — `/login` 없음)

- [ ] **Step 2: 로컬 수동 확인 (마이그레이션 SQL 실행 후에만)**

Task 5 Step 7의 SQL이 실행됐는지 사용자에게 재확인. 실행됐다면 `npm run dev`로:
- 홈: 배지/스탯 카드/월 이동/오늘 버튼 동작, 로그인 화면 안 뜸
- 업로드: 사진 선택 → OCR 프리필 → 저장
- 미분석 사진 있으면 ✨ AI 분석 버튼 → /analyze 동작

- [ ] **Step 3: 푸시 (사용자 확인 후)**

```bash
git push origin master
```

Expected: Vercel 자동 배포. 배포 후 https://health-agent-beta.vercel.app 에서 로그인 없이 접속되는지 사용자 확인 요청.
