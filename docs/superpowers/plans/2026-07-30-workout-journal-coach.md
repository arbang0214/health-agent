# 운동 일지 + AI 코치 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운동 기록에 자유 텍스트 일지를 남기고, 버튼 한 번으로 최근 8주 기록을 Claude가 분석해 다음 목표·운동 방법을 제안하는 `/coach` 기능을 만든다.

**Architecture:** `workouts`에 `journal` 컬럼 추가 + 새 `coach_reports` 테이블. 분석은 Next.js route handler(`POST /api/coach`)가 서버에서 Claude API를 호출하고, 핵심 로직은 의존성 주입된 순수 함수(`runCoach`)로 분리해 Vitest로 테스트한다. 일일 5회 한도는 `coach_reports`의 오늘(KST) 생성 수로 강제.

**Tech Stack:** Next.js 15 (App Router), Supabase(`@supabase/supabase-js`는 서버 라우트에서, `@supabase/ssr` browser client는 페이지에서), `@anthropic-ai/sdk`(신규 설치), Vitest, Tailwind 4.

**스펙:** `docs/superpowers/specs/2026-07-30-workout-journal-coach-design.md`

## Global Constraints

- 로그인 없음. 모든 DB 접근은 anon key (RLS는 anon 전체 허용 정책).
- 모델: `claude-opus-5`, 분류기 거부 대비 `fallbacks: 'default'` + beta `server-side-fallback-2026-07-01`.
- API 키는 환경변수 `ANTHROPIC_API_KEY`만 사용, 코드/리포에 절대 커밋 금지.
- 일일 한도 5회(`DAILY_LIMIT = 5`), "오늘" 판정은 KST(UTC+9) 자정 기준.
- 리포트는 **마크다운 문법 없는 일반 텍스트**(이모지 섹션 제목)로 생성 — md 렌더러 의존성을 피하기 위한 결정. 화면에선 `whitespace-pre-wrap`으로 표시. (스펙의 "마크다운" 표현을 이렇게 구체화함)
- 사용자 문구는 전부 한국어, 기존 앱 톤(이모지 + 존댓말) 유지.
- 테스트 실행: `npm test` (vitest run). 빌드 확인: `npm run build`.
- 마이그레이션 SQL은 파일로만 작성 — 실제 실행은 사용자가 Supabase SQL Editor에서 직접 (프로젝트 wjaifunxiwrunceggmmh).

---

### Task 1: DB 마이그레이션 SQL + 타입 정의

**Files:**
- Create: `docs/migrations/2026-07-30-add-journal-coach.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `Workout.journal: string | null` 필드, `CoachReport` 타입 `{ id: string; created_at: string; content: string }` — 이후 모든 태스크가 사용.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`docs/migrations/2026-07-30-add-journal-coach.sql` 생성:

```sql
-- 런로그: 운동 일지 + AI 코치 (2026-07-30)
-- 실행 위치: Supabase 대시보드 > SQL Editor (프로젝트 wjaifunxiwrunceggmmh)

-- 1) 운동 일지 컬럼 (자유 텍스트, null 허용)
alter table public.workouts add column journal text;

-- 2) 코치 리포트 테이블
create table public.coach_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  content text not null
);

-- 3) 기존 workouts와 동일하게 anon 전체 허용 (2026-07-20-remove-auth.sql 참고)
alter table public.coach_reports enable row level security;

create policy "runlog anon all" on public.coach_reports
  for all to anon, authenticated
  using (true) with check (true);
```

- [ ] **Step 2: 타입 추가**

`src/lib/types.ts`의 `Workout`에 `journal` 필드를 추가하고 `CoachReport`를 새로 정의:

```typescript
export type Workout = {
  id: string
  user_id: string
  taken_at: string // ISO 문자열
  duration_min: number | null
  distance_km: number | null
  calories: number | null
  analyzed_at: string | null
  journal: string | null // 자유 텍스트 운동 일지
  photo_path: string
  created_at: string
}

export type CoachReport = {
  id: string
  created_at: string // ISO 문자열
  content: string // 분석 리포트 (일반 텍스트, 이모지 섹션 제목)
}
```

- [ ] **Step 3: 기존 테스트가 깨지지 않는지 확인**

Run: `npm test`
Expected: 전부 PASS (기존 테스트는 `Workout`을 리터럴로 만들지 않으므로 영향 없음. 만약 타입 에러가 나는 테스트 픽스처가 있으면 `journal: null`을 추가)

- [ ] **Step 4: Commit**

```bash
git add docs/migrations/2026-07-30-add-journal-coach.sql src/lib/types.ts
git commit -m "feat: add journal column and coach_reports migration + types"
```

---

### Task 2: 프롬프트 빌더 (`coach-prompt.ts`) — TDD

**Files:**
- Create: `src/lib/coach-prompt.ts`
- Test: `src/lib/__tests__/coach-prompt.test.ts`

**Interfaces:**
- Consumes: `Workout` (Task 1)
- Produces: `buildCoachPrompt(workouts: Workout[], lastReport: string | null): { system: string; user: string }` — Task 3의 `runCoach`가 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/__tests__/coach-prompt.test.ts` 생성:

```typescript
import { describe, expect, it } from 'vitest'
import { buildCoachPrompt } from '@/lib/coach-prompt'
import type { Workout } from '@/lib/types'

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'w1',
    user_id: 'u1',
    taken_at: '2026-07-28T10:30:00.000Z',
    duration_min: 30,
    distance_km: 3.2,
    calories: 250,
    analyzed_at: null,
    journal: null,
    photo_path: 'public/x.jpg',
    created_at: '2026-07-28T10:31:00.000Z',
    ...overrides,
  }
}

describe('buildCoachPrompt', () => {
  it('기록의 날짜와 수치를 한 줄씩 담는다', () => {
    const { user } = buildCoachPrompt([makeWorkout()], null)
    expect(user).toContain('2026-07-28')
    expect(user).toContain('30분')
    expect(user).toContain('3.2km')
    expect(user).toContain('250kcal')
  })

  it('일지가 있으면 포함하고 없으면 일지 라벨을 넣지 않는다', () => {
    const withJournal = buildCoachPrompt(
      [makeWorkout({ journal: '300m 뛰고 200m 걷기 5번' })],
      null
    )
    expect(withJournal.user).toContain('일지: 300m 뛰고 200m 걷기 5번')

    const withoutJournal = buildCoachPrompt([makeWorkout()], null)
    expect(withoutJournal.user).not.toContain('일지:')
  })

  it('수치가 null이면 ?로 표시한다', () => {
    const { user } = buildCoachPrompt(
      [makeWorkout({ duration_min: null, distance_km: null, calories: null })],
      null
    )
    expect(user).toContain('? / ? / ?')
  })

  it('직전 리포트가 있으면 포함하고 없으면 섹션을 넣지 않는다', () => {
    const withPrev = buildCoachPrompt([makeWorkout()], '지난 리포트 본문')
    expect(withPrev.user).toContain('직전 코치 리포트:')
    expect(withPrev.user).toContain('지난 리포트 본문')

    const withoutPrev = buildCoachPrompt([makeWorkout()], null)
    expect(withoutPrev.user).not.toContain('직전 코치 리포트:')
  })

  it('시스템 프롬프트에 3개 섹션 제목이 들어 있다', () => {
    const { system } = buildCoachPrompt([makeWorkout()], null)
    expect(system).toContain('운동 효과 분석')
    expect(system).toContain('다음 목표치')
    expect(system).toContain('추천 운동 방법')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test -- coach-prompt`
Expected: FAIL — `Cannot find module '@/lib/coach-prompt'` 류의 에러

- [ ] **Step 3: 구현**

`src/lib/coach-prompt.ts` 생성:

```typescript
import type { Workout } from '@/lib/types'

const SYSTEM = `너는 한국어로 코칭하는 러닝 코치야. 사용자는 러닝머신에서 달리기와 걷기를 섞어 운동하는 초중급 러너 1명이야.
아래 세 섹션의 일반 텍스트로 답해줘. 마크다운 문법(#, *, - 등)은 쓰지 말고 섹션 제목은 이모지로 시작해:
📊 운동 효과 분석
🎯 다음 목표치
🏃 추천 운동 방법
직전 코치 리포트가 있으면 그때 제안 대비 무엇이 달라졌는지 꼭 짚어줘. 일지가 없는 기록은 수치만으로 판단해. 격려하는 톤으로, 과한 인사말 없이 본론부터.`

// 최근 기록(+직전 리포트)을 Claude에 보낼 system/user 프롬프트로 변환하는 순수 함수
export function buildCoachPrompt(
  workouts: Workout[],
  lastReport: string | null
): { system: string; user: string } {
  const lines = workouts.map((w) => {
    const date = w.taken_at.slice(0, 10)
    const dur = w.duration_min !== null ? `${w.duration_min}분` : '?'
    const dist = w.distance_km !== null ? `${w.distance_km}km` : '?'
    const cal = w.calories !== null ? `${w.calories}kcal` : '?'
    const journal = w.journal ? ` | 일지: ${w.journal}` : ''
    return `- ${date}: ${dur} / ${dist} / ${cal}${journal}`
  })
  const parts = [`최근 운동 기록 (${workouts.length}건):`, ...lines]
  if (lastReport) {
    parts.push('', '직전 코치 리포트:', lastReport)
  }
  parts.push('', '위 기록을 분석해서 코칭해줘.')
  return { system: SYSTEM, user: parts.join('\n') }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- coach-prompt`
Expected: 5개 테스트 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach-prompt.ts src/lib/__tests__/coach-prompt.test.ts
git commit -m "feat: add coach prompt builder"
```

---

### Task 3: 코치 코어 로직 (`coach.ts`) — TDD

**Files:**
- Create: `src/lib/coach.ts`
- Test: `src/lib/__tests__/coach.test.ts`

**Interfaces:**
- Consumes: `buildCoachPrompt` (Task 2), `Workout`/`CoachReport` (Task 1)
- Produces (Task 4의 라우트가 사용):
  - `DAILY_LIMIT: number` (= 5)
  - `kstDayStartUtcIso(now: Date): string`
  - `type CoachDeps` (아래 정의 그대로)
  - `runCoach(deps: CoachDeps): Promise<CoachResult>` — `CoachResult`는 `{ ok: true; report: CoachReport } | { ok: false; status: 400 | 429 | 502; message: string }`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/__tests__/coach.test.ts` 생성:

```typescript
import { describe, expect, it } from 'vitest'
import { kstDayStartUtcIso, runCoach, type CoachDeps } from '@/lib/coach'
import type { CoachReport, Workout } from '@/lib/types'

function makeWorkout(): Workout {
  return {
    id: 'w1',
    user_id: 'u1',
    taken_at: '2026-07-28T10:30:00.000Z',
    duration_min: 30,
    distance_km: 3.2,
    calories: 250,
    analyzed_at: null,
    journal: '300m 뛰고 200m 걷기',
    photo_path: 'public/x.jpg',
    created_at: '2026-07-28T10:31:00.000Z',
  }
}

const savedReport: CoachReport = {
  id: 'r1',
  created_at: '2026-07-30T01:00:00.000Z',
  content: '📊 분석 내용',
}

function makeDeps(overrides: Partial<CoachDeps> = {}): CoachDeps & {
  created: string[]
} {
  const created: string[] = []
  return {
    created,
    countReportsToday: async () => 0,
    listRecentWorkouts: async () => [makeWorkout()],
    getLastReportContent: async () => null,
    createReport: async (content: string) => {
      created.push(content)
      return savedReport
    },
    generateAnalysis: async () => '📊 분석 내용',
    ...overrides,
  }
}

describe('kstDayStartUtcIso', () => {
  it('KST 자정 직후(UTC 15:00)는 그 시각이 곧 하루 시작', () => {
    expect(kstDayStartUtcIso(new Date('2026-07-30T15:00:00Z'))).toBe(
      '2026-07-30T15:00:00.000Z'
    )
  })

  it('KST 자정 직전(UTC 14:59)은 전날 15:00 UTC가 하루 시작', () => {
    expect(kstDayStartUtcIso(new Date('2026-07-30T14:59:00Z'))).toBe(
      '2026-07-29T15:00:00.000Z'
    )
  })
})

describe('runCoach', () => {
  it('오늘 5회 이상이면 429, 생성/호출 안 함', async () => {
    const deps = makeDeps({ countReportsToday: async () => 5 })
    const result = await runCoach(deps)
    expect(result).toEqual({
      ok: false,
      status: 429,
      message: expect.stringContaining('오늘'),
    })
    expect(deps.created).toHaveLength(0)
  })

  it('기록이 0건이면 400', async () => {
    const result = await runCoach(makeDeps({ listRecentWorkouts: async () => [] }))
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('Claude 호출 실패 시 502, 리포트 저장 안 함', async () => {
    const deps = makeDeps({
      generateAnalysis: async () => {
        throw new Error('api down')
      },
    })
    const result = await runCoach(deps)
    expect(result).toMatchObject({ ok: false, status: 502 })
    expect(deps.created).toHaveLength(0)
  })

  it('성공 시 분석 결과를 저장하고 리포트를 반환한다', async () => {
    const deps = makeDeps()
    const result = await runCoach(deps)
    expect(result).toEqual({ ok: true, report: savedReport })
    expect(deps.created).toEqual(['📊 분석 내용'])
  })

  it('직전 리포트를 프롬프트에 반영한다 (generateAnalysis 인자로 전달됨)', async () => {
    let seenUser = ''
    const deps = makeDeps({
      getLastReportContent: async () => '지난번 목표: 3.5km',
      generateAnalysis: async (_system, user) => {
        seenUser = user
        return '📊 분석'
      },
    })
    await runCoach(deps)
    expect(seenUser).toContain('지난번 목표: 3.5km')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test -- coach.test`
Expected: FAIL — `Cannot find module '@/lib/coach'`

- [ ] **Step 3: 구현**

`src/lib/coach.ts` 생성:

```typescript
import { buildCoachPrompt } from '@/lib/coach-prompt'
import type { CoachReport, Workout } from '@/lib/types'

export const DAILY_LIMIT = 5

// KST(UTC+9) 기준 '오늘 0시'를 UTC ISO 문자열로.
// coach_reports.created_at >= 이 값 이면 "오늘 생성분"
export function kstDayStartUtcIso(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 3600_000)
  const dayStartUtcMs =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600_000
  return new Date(dayStartUtcMs).toISOString()
}

export type CoachDeps = {
  countReportsToday(): Promise<number>
  listRecentWorkouts(): Promise<Workout[]>
  getLastReportContent(): Promise<string | null>
  createReport(content: string): Promise<CoachReport>
  generateAnalysis(system: string, user: string): Promise<string>
}

export type CoachResult =
  | { ok: true; report: CoachReport }
  | { ok: false; status: 400 | 429 | 502; message: string }

export async function runCoach(deps: CoachDeps): Promise<CoachResult> {
  if ((await deps.countReportsToday()) >= DAILY_LIMIT) {
    return {
      ok: false,
      status: 429,
      message: '오늘 분석 횟수를 다 썼어요. 내일 다시 만나요!',
    }
  }
  const workouts = await deps.listRecentWorkouts()
  if (workouts.length === 0) {
    return {
      ok: false,
      status: 400,
      message: '분석할 기록이 아직 없어요. 먼저 운동을 기록해주세요!',
    }
  }
  const lastReport = await deps.getLastReportContent()
  const { system, user } = buildCoachPrompt(workouts, lastReport)
  let content: string
  try {
    content = await deps.generateAnalysis(system, user)
  } catch {
    return {
      ok: false,
      status: 502,
      message: '분석에 실패했어요. 잠시 후 다시 시도해주세요.',
    }
  }
  const report = await deps.createReport(content)
  return { ok: true, report }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- coach.test`
Expected: 7개 테스트 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach.ts src/lib/__tests__/coach.test.ts
git commit -m "feat: add coach core logic with daily limit and DI"
```

---

### Task 4: Anthropic SDK 설치 + `POST /api/coach` 라우트

**Files:**
- Modify: `package.json` (`npm install @anthropic-ai/sdk`)
- Create: `src/app/api/coach/route.ts`
- Create: `.env.local`에 `ANTHROPIC_API_KEY=...` 항목 (값은 사용자가 채움 — **커밋 금지**, `.gitignore`에 이미 `.env*` 있는지 확인)

**Interfaces:**
- Consumes: `runCoach`, `kstDayStartUtcIso` (Task 3), `Workout`/`CoachReport` (Task 1)
- Produces: `POST /api/coach` → 성공 `200 { report: CoachReport }`, 실패 `{ message: string }` + 400/429/502 — Task 7의 `/coach` 페이지가 호출.

- [ ] **Step 1: SDK 설치**

Run: `npm install @anthropic-ai/sdk`
Expected: package.json dependencies에 추가됨

- [ ] **Step 2: `.gitignore` 확인**

Run: `git check-ignore .env.local`
Expected: `.env.local` 출력 (무시됨). 아니라면 `.gitignore`에 `.env*.local` 추가.

- [ ] **Step 3: 라우트 구현**

`src/app/api/coach/route.ts` 생성:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { kstDayStartUtcIso, runCoach } from '@/lib/coach'
import type { CoachReport, Workout } from '@/lib/types'

// Claude 분석이 10~30초 걸릴 수 있어 Vercel 함수 타임아웃 연장
export const maxDuration = 60

const EIGHT_WEEKS_MS = 56 * 24 * 3600_000

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const anthropic = new Anthropic() // ANTHROPIC_API_KEY 환경변수 사용

  const result = await runCoach({
    async countReportsToday() {
      const { count, error } = await supabase
        .from('coach_reports')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', kstDayStartUtcIso(new Date()))
      if (error) throw new Error(error.message)
      return count ?? 0
    },
    async listRecentWorkouts() {
      const from = new Date(Date.now() - EIGHT_WEEKS_MS)
      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .gte('taken_at', from.toISOString())
        .order('taken_at', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as Workout[]
    },
    async getLastReportContent() {
      const { data, error } = await supabase
        .from('coach_reports')
        .select('content')
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) throw new Error(error.message)
      return data?.[0]?.content ?? null
    },
    async createReport(content) {
      const { data, error } = await supabase
        .from('coach_reports')
        .insert({ content })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as CoachReport
    },
    async generateAnalysis(system, user) {
      const response = await anthropic.beta.messages.create({
        model: 'claude-opus-5',
        max_tokens: 16000,
        system,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default', // 분류기 거부 시 자동 대체 모델 재실행
        messages: [{ role: 'user', content: user }],
      })
      if (response.stop_reason === 'refusal') throw new Error('refused')
      // filter만으로는 union이 좁혀지지 않아 map에서 TS 에러 — 조건부 map으로 처리
      const text = response.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .filter(Boolean)
        .join('\n')
      if (!text) throw new Error('empty response')
      return text
    },
  })

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status })
  }
  return NextResponse.json({ report: result.report })
}
```

주의: SDK 버전에 따라 `fallbacks: 'default'`가 아직 타입에 없을 수 있음. TS 에러가 나면 해당 라인 위에 `// @ts-expect-error fallbacks scalar form not yet in SDK types`를 추가 (런타임은 정상 동작).

- [ ] **Step 4: 타입/빌드 확인**

Run: `npx tsc --noEmit` 후 `npm run build`
Expected: 에러 없음 (env 값 없이도 빌드는 통과 — 라우트는 요청 시에만 실행됨)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/app/api/coach/route.ts
git commit -m "feat: add /api/coach route calling Claude with daily limit"
```

---

### Task 5: 업로드 화면에 일지 입력 추가

**Files:**
- Modify: `src/lib/workouts.ts` (`addWorkout`에 journal 파라미터)
- Modify: `src/app/upload/page.tsx`

**Interfaces:**
- Consumes: `Workout.journal` (Task 1)
- Produces: `addWorkout(photo: Blob, takenAt: Date, stats?: WorkoutStats, journal?: string): Promise<void>` — 빈 문자열/공백은 null로 저장.

- [ ] **Step 1: `addWorkout` 확장**

`src/lib/workouts.ts`의 `addWorkout`을 다음으로 교체:

```typescript
export async function addWorkout(
  photo: Blob,
  takenAt: Date,
  stats?: WorkoutStats,
  journal?: string
): Promise<void> {
  const supabase = createClient()
  const path = `public/${crypto.randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, photo, { contentType: 'image/jpeg' })
  if (uploadError) throw new Error(`사진 업로드 실패: ${uploadError.message}`)

  const row: Record<string, unknown> = { taken_at: takenAt.toISOString(), photo_path: path }
  if (stats) Object.assign(row, stats, { analyzed_at: new Date().toISOString() })
  const trimmed = journal?.trim()
  if (trimmed) row.journal = trimmed

  const { error: insertError } = await supabase.from('workouts').insert(row)
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(`기록 저장 실패: ${insertError.message}`)
  }
}
```

- [ ] **Step 2: 업로드 페이지에 입력칸 추가**

`src/app/upload/page.tsx`:

(a) 상태 추가 — `const [calories, setCalories] = useState('')` 아래에:

```typescript
const [journal, setJournal] = useState('')
```

(b) `handleFile`의 초기화 블록(`setCalories('')` 다음)에 추가:

```typescript
setJournal('')
```

(c) `handleSave`의 `addWorkout` 호출을 다음으로 교체:

```typescript
await addWorkout(
  file,
  new Date(takenAt),
  {
    duration_min: toNum(durationMin),
    distance_km: toNum(distanceKm),
    calories: toNum(calories),
  },
  journal
)
```

(d) JSX — 운동 수치 `<div>` 블록이 닫힌 직후(스탯 3칸 div 다음, 흰 카드 안)에 추가:

```tsx
<div>
  <label className="block text-sm font-medium">
    오늘 어떻게 뛰었나요? <span className="text-gray-400">(선택)</span>
  </label>
  <textarea
    value={journal}
    onChange={(e) => setJournal(e.target.value)}
    placeholder="예: 300m 뛰고 200m 걷기 5번 반복"
    rows={2}
    className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-sm"
  />
</div>
```

- [ ] **Step 3: 수동 확인 + 빌드**

Run: `npm run build`
Expected: 에러 없음. (로컬 `npm run dev`로 업로드 화면에 입력칸이 보이는지 확인 — 실제 저장은 마이그레이션 실행 후에만 성공)

- [ ] **Step 4: Commit**

```bash
git add src/lib/workouts.ts src/app/upload/page.tsx
git commit -m "feat: add journal input to upload flow"
```

---

### Task 6: 날짜 상세 화면에 일지 표시 + 인라인 수정

**Files:**
- Modify: `src/lib/workouts.ts` (`updateWorkoutStats`에 journal 파라미터)
- Modify: `src/app/day/[date]/page.tsx`

**Interfaces:**
- Consumes: `Workout.journal` (Task 1)
- Produces: `updateWorkoutStats(id: string, stats: WorkoutStats, journal?: string | null): Promise<void>` — `journal === undefined`면 건드리지 않고, `null` 또는 빈 문자열이면 null로 저장.

- [ ] **Step 1: `updateWorkoutStats` 확장**

`src/lib/workouts.ts`의 `updateWorkoutStats`를 다음으로 교체:

```typescript
export async function updateWorkoutStats(
  id: string,
  stats: WorkoutStats,
  journal?: string | null
): Promise<void> {
  const supabase = createClient()
  const row: Record<string, unknown> = { ...stats, analyzed_at: new Date().toISOString() }
  if (journal !== undefined) row.journal = journal?.trim() ? journal.trim() : null
  const { error } = await supabase.from('workouts').update(row).eq('id', id)
  if (error) throw new Error(`기록 수정 실패: ${error.message}`)
}
```

(기존 호출부 — `/analyze` 페이지 등 — 는 journal 인자를 안 넘기므로 동작 불변)

- [ ] **Step 2: WorkoutCard에 일지 표시/수정 추가**

`src/app/day/[date]/page.tsx`의 `WorkoutCard`:

(a) 상태 추가 — `const [calories, setCalories] = useState('')` 아래에:

```typescript
const [journal, setJournal] = useState('')
```

(b) `startEditing`에 추가 (`setCalories(...)` 다음, `setEditing(true)` 전):

```typescript
setJournal(workout.journal ?? '')
```

(c) `handleSave`의 `updateWorkoutStats` 호출을 다음으로 교체:

```typescript
await updateWorkoutStats(
  workout.id,
  {
    duration_min: toNum(durationMin),
    distance_km: toNum(distanceKm),
    calories: toNum(calories),
  },
  journal
)
```

(d) 편집 모드 JSX — 스탯 3칸 `<div className="flex gap-2">`가 닫힌 직후, 저장/취소 버튼 div 전에 추가:

```tsx
<textarea
  value={journal}
  onChange={(e) => setJournal(e.target.value)}
  placeholder="오늘 어떻게 뛰었나요? (선택)"
  rows={2}
  className="w-full rounded-xl border border-gray-200 p-2 text-sm"
/>
```

(e) 보기 모드 JSX — 스탯/수정 버튼 `<div className="flex items-center justify-between px-1">` 블록 **다음**에 (같은 else 분기 안에서 fragment로 묶어) 추가:

```tsx
) : (
  <>
    <div className="flex items-center justify-between px-1">
      <span className="text-sm font-bold text-emerald-700">{statsLabel(workout)}</span>
      <button onClick={startEditing} className="text-sm text-gray-400">
        ✎ 수정
      </button>
    </div>
    {workout.journal && (
      <p className="whitespace-pre-wrap px-1 text-sm text-gray-600">📝 {workout.journal}</p>
    )}
  </>
)}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add src/lib/workouts.ts src/app/day/[date]/page.tsx
git commit -m "feat: show and edit journal on day detail"
```

---

### Task 7: `/coach` 페이지 + 홈 링크

**Files:**
- Create: `src/lib/coach-reports.ts`
- Create: `src/app/coach/page.tsx`
- Modify: `src/app/page.tsx` (코치 링크)

**Interfaces:**
- Consumes: `CoachReport` (Task 1), `POST /api/coach` (Task 4)
- Produces: `listCoachReports(limit?: number): Promise<CoachReport[]>` (최신순)

- [ ] **Step 1: 리포트 조회 lib**

`src/lib/coach-reports.ts` 생성:

```typescript
import { createClient } from '@/lib/supabase/client'
import type { CoachReport } from '@/lib/types'

export async function listCoachReports(limit = 20): Promise<CoachReport[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('coach_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`리포트 조회 실패: ${error.message}`)
  return (data ?? []) as CoachReport[]
}
```

- [ ] **Step 2: `/coach` 페이지**

`src/app/coach/page.tsx` 생성:

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listCoachReports } from '@/lib/coach-reports'
import type { CoachReport } from '@/lib/types'

function reportDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CoachPage() {
  const [reports, setReports] = useState<CoachReport[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let stale = false
    listCoachReports()
      .then((rs) => {
        if (!stale) setReports(rs)
      })
      .catch((err) => {
        if (!stale) setError(err instanceof Error ? err.message : '조회에 실패했습니다')
      })
      .finally(() => {
        if (!stale) setLoading(false)
      })
    return () => {
      stale = true
    }
  }, [])

  async function handleAnalyze() {
    setAnalyzing(true)
    setError('')
    try {
      const res = await fetch('/api/coach', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        setError(body.message ?? '분석에 실패했어요. 잠시 후 다시 시도해주세요.')
        return
      }
      setReports((prev) => [body.report, ...prev])
    } catch {
      setError('분석에 실패했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setAnalyzing(false)
    }
  }

  const [latest, ...older] = reports

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-emerald-100">
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-emerald-900">🧑‍🏫 AI 코치</h1>
          <Link href="/" className="text-sm text-gray-500">
            ← 캘린더
          </Link>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="w-full rounded-full bg-amber-500 p-3 font-bold text-white shadow-lg shadow-amber-500/40 disabled:opacity-40"
        >
          {analyzing ? '분석 중… (최대 1분 걸려요)' : '✨ 최근 기록 분석해줘'}
        </button>

        {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {loading && <p className="p-8 text-center text-gray-400">불러오는 중…</p>}
        {!loading && reports.length === 0 && !error && (
          <p className="p-8 text-center text-gray-400">
            아직 리포트가 없어요. 버튼을 눌러 첫 분석을 받아보세요!
          </p>
        )}

        {latest && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold text-amber-600">{reportDate(latest.created_at)}</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
              {latest.content}
            </p>
          </div>
        )}

        {older.length > 0 && (
          <div className="space-y-2">
            <p className="px-1 text-xs font-bold text-gray-400">지난 리포트</p>
            {older.map((r) => (
              <details key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <summary className="cursor-pointer text-sm font-bold text-gray-600">
                  {reportDate(r.created_at)}
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                  {r.content}
                </p>
              </details>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: 홈에 코치 링크 추가**

`src/app/page.tsx` — `unanalyzedCount > 0 && (...)` AI 분석 링크 블록 **바로 다음**에 추가 (항상 표시):

```tsx
<Link
  href="/coach"
  className="mb-3 block rounded-2xl bg-amber-500 p-3 text-center text-sm font-bold text-white shadow-sm"
>
  🧑‍🏫 AI 코치에게 분석받기
</Link>
```

- [ ] **Step 4: 테스트 + 빌드 확인**

Run: `npm test` 후 `npm run build`
Expected: 전부 PASS, 빌드 에러 없음

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach-reports.ts src/app/coach/page.tsx src/app/page.tsx
git commit -m "feat: add coach page with report history and home link"
```

---

### Task 8: 최종 검증 + 배포 전 사용자 액션 정리

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트/빌드**

Run: `npm test && npm run build`
Expected: 전부 PASS, 빌드 성공

- [ ] **Step 2: 로컬 스모크 (마이그레이션 실행 후에만 가능)**

`.env.local`에 `ANTHROPIC_API_KEY` 넣고 `npm run dev` →
1. 업로드에서 일지 포함 저장 → 날짜 상세에서 일지 확인·수정
2. `/coach`에서 분석 버튼 → 리포트 생성 확인
3. 6번째 분석 시도 → "오늘 분석 횟수를 다 썼어요" 확인

- [ ] **Step 3: 사용자에게 남은 액션 보고 (구현 완료 보고에 포함)**

1. Supabase SQL Editor에서 `docs/migrations/2026-07-30-add-journal-coach.sql` 실행
2. Anthropic API 키 발급 → 로컬 `.env.local`과 Vercel 환경변수에 `ANTHROPIC_API_KEY` 등록
3. master 푸시 → Vercel 자동 배포 → 폰에서 확인

**주의: 마이그레이션(1)을 실행하기 전에 master에 푸시하면 배포된 앱의 업로드가 깨질 수 있음** (`journal` 컬럼 없는 상태에서 insert 시도). 순서는 반드시 ① SQL 실행 → ② env 등록 → ③ 푸시.
