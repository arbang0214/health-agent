# 런로그(RunLog) 1차 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 러닝머신 계기판 사진을 올리면 EXIF 촬영 일시로 그날 운동이 기록되고, 캘린더(월/주)에 스티커로 표시되며, 스티커를 누르면 사진을 상세 조회·삭제할 수 있는 개인용 웹 서비스.

**Architecture:** Next.js(App Router) 클라이언트 중심 앱. EXIF 추출·이미지 압축은 브라우저에서 수행하고, Supabase(Postgres + Auth + Storage)가 저장·조회·인증을 담당한다. 미들웨어가 비로그인 접근을 /login으로 돌려보낸다.

**Tech Stack:** Next.js 15 (TypeScript, Tailwind), @supabase/supabase-js + @supabase/ssr, exifr, date-fns, Vitest. 배포는 Vercel.

## Global Constraints

- 비용 0원: Vercel 무료 티어 + Supabase 무료 티어만 사용
- 1차 범위만 구현: OCR/AI 분석 없음 (단, `duration_min`, `distance_km`, `calories`, `analyzed_at` 컬럼은 스키마에 포함)
- 사용자 1명: 회원가입 UI 없음, Supabase 대시보드에서 계정 수동 생성, 이메일 가입 비활성화
- UI 문구는 한국어, 폰 우선 반응형 (폰 기본 = 주 보기, PC 기본 = 월 보기)
- 사진은 비공개 버킷 `photos`에 저장, 조회는 signed URL로만
- EXIF 추출은 반드시 이미지 압축 **전에** 수행 (canvas 압축 시 EXIF가 삭제됨)
- 업로드 사진은 긴 변 1600px, JPEG 품질 0.8로 압축
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 추가
- 실행 환경: Windows / PowerShell / npm

## 파일 구조

```
run-log/
  supabase/schema.sql            -- 테이블 + RLS + 버킷 정책 (대시보드 SQL Editor에서 실행)
  .env.local                     -- Supabase URL/키 (커밋 금지)
  .env.example                   -- 키 이름만 담은 견본
  vitest.config.ts
  src/
    middleware.ts                -- 비로그인 → /login 리다이렉트
    lib/
      types.ts                   -- Workout 타입
      supabase/client.ts         -- 브라우저 Supabase 클라이언트
      supabase/middleware.ts     -- 세션 갱신 + 리다이렉트 로직
      calendar.ts                -- 날짜 그리드·그룹핑 순수 함수
      exif.ts                    -- EXIF 촬영 일시 추출 + 폴백
      image.ts                   -- 브라우저 이미지 압축
      workouts.ts                -- Supabase CRUD (업로드/조회/삭제/signed URL)
      __tests__/calendar.test.ts
      __tests__/exif.test.ts
    app/
      layout.tsx                 -- 한국어 메타데이터 (수정)
      page.tsx                   -- 캘린더 홈
      login/page.tsx             -- 로그인
      upload/page.tsx            -- 업로드 + 촬영 일시 확인 폼
      day/[date]/page.tsx        -- 날짜 상세 (사진 스와이프, 삭제)
```

---

### Task 1: Next.js 스캐폴드 + 의존성 + Vitest 설정

**Files:**
- Create: 프로젝트 루트 전체 (create-next-app), `vitest.config.ts`, `.env.example`
- Modify: `package.json` (test 스크립트), `src/app/layout.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: `@/*` → `src/*` 경로 별칭, `npm test`로 Vitest 실행 가능한 프로젝트

- [ ] **Step 1: Next.js 스캐폴드 생성**

`C:\Users\77096\run-log`에서 실행 (기존 `docs/`, `.git`은 create-next-app 허용 목록에 있어 그대로 진행됨):

```powershell
npx create-next-app@latest . --ts --tailwind --app --src-dir --import-alias "@/*" --use-npm --no-eslint --no-turbopack
```

프롬프트가 나오면 모두 기본값. 완료 후 `npm run dev`가 뜨는지 확인하고 종료.

- [ ] **Step 2: 런타임/테스트 의존성 설치**

```powershell
npm install @supabase/supabase-js @supabase/ssr exifr date-fns
npm install -D vitest
```

- [ ] **Step 3: Vitest 설정 파일 작성**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: { environment: 'node' },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
```

`package.json`의 `scripts`에 추가:

```json
"test": "vitest run"
```

- [ ] **Step 4: 레이아웃 한국어화**

`src/app/layout.tsx`에서 `<html lang="en">`을 `<html lang="ko">`로, metadata를 다음으로 교체:

```ts
export const metadata: Metadata = {
  title: '런로그',
  description: '러닝머신 기록 캘린더',
}
```

- [ ] **Step 5: .env.example 작성**

`.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

- [ ] **Step 6: 동작 확인**

Run: `npm test`
Expected: "No test files found" (에러 아님, exit code 0이 아니어도 무방 — 테스트 파일이 아직 없음을 확인하는 용도)

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "chore: scaffold Next.js app with Supabase deps and Vitest"
```

---

### Task 2: Supabase 스키마 + 프로젝트 설정 (사람 작업 포함)

**Files:**
- Create: `supabase/schema.sql`, `.env.local` (커밋 금지)

**Interfaces:**
- Consumes: 없음
- Produces: `public.workouts` 테이블, 비공개 버킷 `photos`, RLS 정책, `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`

- [ ] **Step 1: 스키마 SQL 작성**

`supabase/schema.sql`:

```sql
-- 운동 기록 테이블 (2차 OCR 확장 대비 수치 컬럼 포함, 1차에서는 항상 null)
create table public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) default auth.uid(),
  taken_at     timestamptz not null,
  duration_min numeric,
  distance_km  numeric,
  calories     integer,
  analyzed_at  timestamptz,
  photo_path   text not null,
  created_at   timestamptz not null default now()
);

alter table public.workouts enable row level security;

create policy "own_select" on public.workouts for select using (auth.uid() = user_id);
create policy "own_insert" on public.workouts for insert with check (auth.uid() = user_id);
create policy "own_update" on public.workouts for update using (auth.uid() = user_id);
create policy "own_delete" on public.workouts for delete using (auth.uid() = user_id);

-- 비공개 사진 버킷: 경로 첫 폴더 = 본인 user_id 일 때만 접근
insert into storage.buckets (id, name, public) values ('photos', 'photos', false);

create policy "own_photos_select" on storage.objects for select
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own_photos_insert" on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own_photos_delete" on storage.objects for delete
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: 사용자(사람) 작업 — Supabase 프로젝트 준비**

이 단계는 브라우저에서 사용자가 직접 해야 한다. 아래를 안내하고 완료를 기다린다:

1. https://supabase.com 가입 → New Project 생성 (Region: Northeast Asia (Seoul) 권장)
2. SQL Editor에서 `supabase/schema.sql` 내용 전체 실행
3. Authentication → Users → "Add user" → 본인 이메일/비밀번호로 계정 생성 ("Auto Confirm User" 체크)
4. Authentication → Sign In / Providers → Email에서 **"Allow new users to sign up" 끄기**
5. Project Settings → API에서 `Project URL`과 `anon public` 키 복사

- [ ] **Step 3: .env.local 작성**

사용자에게 받은 값으로 `.env.local` 생성 (`.gitignore`에 `.env*`가 이미 포함되어 있는지 확인):

```
NEXT_PUBLIC_SUPABASE_URL=<Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public 키>
```

- [ ] **Step 4: Commit**

```powershell
git add supabase/schema.sql
git commit -m "feat: add Supabase schema with RLS and private photos bucket"
```

---

### Task 3: Supabase 클라이언트 + 인증 미들웨어 + 로그인 페이지

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/middleware.ts`, `src/middleware.ts`, `src/app/login/page.tsx`

**Interfaces:**
- Consumes: Task 2의 `.env.local`
- Produces: `createClient(): SupabaseClient` (브라우저용, `@/lib/supabase/client`) — 이후 모든 데이터 접근이 사용

- [ ] **Step 1: 브라우저 클라이언트 작성**

`src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: 미들웨어 세션 로직 작성**

`src/lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

`src/middleware.ts`:

```ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|ico)$).*)'],
}
```

- [ ] **Step 3: 로그인 페이지 작성**

`src/app/login/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-center text-2xl font-bold">🏃 런로그</h1>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          required
          className="w-full rounded-lg border border-gray-300 p-3"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          required
          className="w-full rounded-lg border border-gray-300 p-3"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          className="w-full rounded-lg bg-emerald-500 p-3 font-bold text-white active:bg-emerald-600"
        >
          로그인
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: 수동 확인**

Run: `npm run dev` 후 브라우저에서 `http://localhost:3000` 접속
Expected: 자동으로 `/login`으로 리다이렉트. Task 2에서 만든 계정으로 로그인하면 `/`(아직 Next.js 기본 페이지)로 이동. 틀린 비밀번호면 한국어 에러 메시지 표시.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/supabase src/middleware.ts src/app/login
git commit -m "feat: add Supabase auth with login page and route protection"
```

---

### Task 4: 캘린더 날짜 유틸 (TDD)

**Files:**
- Create: `src/lib/types.ts`, `src/lib/calendar.ts`
- Test: `src/lib/__tests__/calendar.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces:
  - `Workout` 타입 (`@/lib/types`)
  - `toDateKey(d: Date): string` — 로컬 기준 `'yyyy-MM-dd'`
  - `getMonthGrid(year: number, month: number): Date[][]` — month는 1~12, 일요일 시작 주 단위 2차원 배열
  - `getWeekDays(anchor: Date): Date[]` — anchor가 속한 주의 일~토 7일
  - `groupByDateKey<T extends { taken_at: string }>(items: T[]): Map<string, T[]>`

- [ ] **Step 1: Workout 타입 작성**

`src/lib/types.ts`:

```ts
export type Workout = {
  id: string
  user_id: string
  taken_at: string // ISO 문자열
  duration_min: number | null
  distance_km: number | null
  calories: number | null
  analyzed_at: string | null
  photo_path: string
  created_at: string
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/__tests__/calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getMonthGrid, getWeekDays, groupByDateKey, toDateKey } from '@/lib/calendar'

describe('toDateKey', () => {
  it('로컬 날짜를 yyyy-MM-dd로 변환한다', () => {
    expect(toDateKey(new Date(2026, 6, 14, 23, 59))).toBe('2026-07-14')
  })
})

describe('getMonthGrid', () => {
  it('2026년 7월: 1일은 수요일, 첫 주는 6/28(일)부터 시작한다', () => {
    const grid = getMonthGrid(2026, 7)
    expect(grid[0][0]).toEqual(new Date(2026, 5, 28))
    expect(grid[0][3]).toEqual(new Date(2026, 6, 1))
  })

  it('모든 주는 7일이고 마지막 주는 토요일로 끝난다', () => {
    const grid = getMonthGrid(2026, 7)
    for (const week of grid) expect(week).toHaveLength(7)
    const lastWeek = grid[grid.length - 1]
    expect(lastWeek[6].getDay()).toBe(6)
    expect(lastWeek[6] >= new Date(2026, 6, 31)).toBe(true)
  })
})

describe('getWeekDays', () => {
  it('anchor가 속한 주의 일요일부터 7일을 돌려준다', () => {
    const days = getWeekDays(new Date(2026, 6, 14)) // 화요일
    expect(days).toHaveLength(7)
    expect(days[0]).toEqual(new Date(2026, 6, 12)) // 일요일
    expect(days[6]).toEqual(new Date(2026, 6, 18)) // 토요일
  })
})

describe('groupByDateKey', () => {
  it('taken_at의 로컬 날짜별로 묶는다', () => {
    const items = [
      { taken_at: new Date(2026, 6, 14, 7, 0).toISOString() },
      { taken_at: new Date(2026, 6, 14, 20, 0).toISOString() },
      { taken_at: new Date(2026, 6, 15, 7, 0).toISOString() },
    ]
    const map = groupByDateKey(items)
    expect(map.get('2026-07-14')).toHaveLength(2)
    expect(map.get('2026-07-15')).toHaveLength(1)
    expect(map.has('2026-07-13')).toBe(false)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/lib/__tests__/calendar.test.ts`
Expected: FAIL — `@/lib/calendar` 모듈 없음

- [ ] **Step 4: 구현**

`src/lib/calendar.ts`:

```ts
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

export function toDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** month: 1~12. 일요일 시작 주 단위의 2차원 날짜 배열. */
export function getMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month - 1, 1)
  const start = startOfWeek(startOfMonth(first))
  const end = endOfWeek(endOfMonth(first))
  const days = eachDayOfInterval({ start, end })
  const weeks: Date[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return weeks
}

export function getWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function groupByDateKey<T extends { taken_at: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = toDateKey(new Date(item.taken_at))
    const arr = map.get(key) ?? []
    arr.push(item)
    map.set(key, arr)
  }
  return map
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/lib/__tests__/calendar.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```powershell
git add src/lib/types.ts src/lib/calendar.ts src/lib/__tests__/calendar.test.ts
git commit -m "feat: add calendar date utilities with tests"
```

---

### Task 5: EXIF 촬영 일시 유틸 (TDD)

**Files:**
- Create: `src/lib/exif.ts`
- Test: `src/lib/__tests__/exif.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `extractTakenAt(file: File | Blob): Promise<Date | null>` — EXIF DateTimeOriginal/CreateDate, 없거나 파싱 실패면 null
  - `resolveTakenAt(exifDate: Date | null, now: Date): Date` — null이면 now

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/__tests__/exif.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extractTakenAt, resolveTakenAt } from '@/lib/exif'

describe('resolveTakenAt', () => {
  it('EXIF 일시가 있으면 그대로 사용한다', () => {
    const exif = new Date(2026, 6, 10, 19, 30)
    const now = new Date(2026, 6, 14, 9, 0)
    expect(resolveTakenAt(exif, now)).toEqual(exif)
  })

  it('EXIF 일시가 없으면 현재 시각으로 폴백한다', () => {
    const now = new Date(2026, 6, 14, 9, 0)
    expect(resolveTakenAt(null, now)).toEqual(now)
  })
})

describe('extractTakenAt', () => {
  it('EXIF가 없는 데이터에서는 null을 돌려준다 (throw하지 않음)', async () => {
    const junk = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' })
    await expect(extractTakenAt(junk)).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/__tests__/exif.test.ts`
Expected: FAIL — `@/lib/exif` 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/exif.ts`:

```ts
import exifr from 'exifr'

/** EXIF에서 촬영 일시를 추출한다. 없거나 읽기 실패면 null. */
export async function extractTakenAt(file: File | Blob): Promise<Date | null> {
  try {
    const data = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
    const d = data?.DateTimeOriginal ?? data?.CreateDate
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null
  } catch {
    return null
  }
}

export function resolveTakenAt(exifDate: Date | null, now: Date): Date {
  return exifDate ?? now
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/__tests__/exif.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```powershell
git add src/lib/exif.ts src/lib/__tests__/exif.test.ts
git commit -m "feat: add EXIF taken-at extraction with fallback"
```

---

### Task 6: 이미지 압축 유틸 (브라우저 전용)

**Files:**
- Create: `src/lib/image.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `compressImage(file: File, maxDim?: number, quality?: number): Promise<Blob>` — 긴 변 1600px, JPEG 0.8 기본값

canvas API는 Node 테스트 환경에 없으므로 단위 테스트 대신 Task 8에서 실제 브라우저로 검증한다.

- [ ] **Step 1: 구현**

`src/lib/image.ts`:

```ts
/**
 * 브라우저에서 이미지를 리사이즈·JPEG 압축한다.
 * 주의: canvas를 거치며 EXIF가 삭제되므로, EXIF 추출은 반드시 이 함수 호출 전에 할 것.
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이미지 처리를 지원하지 않는 브라우저입니다')
  ctx.drawImage(bitmap, 0, 0, width, height)

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('이미지 압축에 실패했습니다'))),
      'image/jpeg',
      quality
    )
  )
}
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```powershell
git add src/lib/image.ts
git commit -m "feat: add browser-side image resize and JPEG compression"
```

---

### Task 7: 워크아웃 데이터 레이어

**Files:**
- Create: `src/lib/workouts.ts`

**Interfaces:**
- Consumes: `createClient()` (Task 3), `Workout` 타입 (Task 4)
- Produces:
  - `addWorkout(photo: Blob, takenAt: Date): Promise<void>` — Storage 업로드 성공 후 DB 삽입, 삽입 실패 시 업로드 파일 삭제 (반쪽 저장 방지)
  - `listWorkouts(from: Date, to: Date): Promise<Workout[]>` — taken_at 오름차순
  - `deleteWorkout(w: Workout): Promise<void>` — DB 행 삭제 후 Storage 파일 삭제
  - `getPhotoUrl(path: string): Promise<string>` — 1시간 signed URL

- [ ] **Step 1: 구현**

`src/lib/workouts.ts`:

```ts
import { createClient } from '@/lib/supabase/client'
import type { Workout } from '@/lib/types'

const BUCKET = 'photos'

export async function addWorkout(photo: Blob, takenAt: Date): Promise<void> {
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

  const { error: insertError } = await supabase
    .from('workouts')
    .insert({ taken_at: takenAt.toISOString(), photo_path: path })
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(`기록 저장 실패: ${insertError.message}`)
  }
}

export async function listWorkouts(from: Date, to: Date): Promise<Workout[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .gte('taken_at', from.toISOString())
    .lte('taken_at', to.toISOString())
    .order('taken_at', { ascending: true })
  if (error) throw new Error(`기록 조회 실패: ${error.message}`)
  return (data ?? []) as Workout[]
}

export async function deleteWorkout(w: Workout): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('workouts').delete().eq('id', w.id)
  if (error) throw new Error(`삭제 실패: ${error.message}`)
  await supabase.storage.from(BUCKET).remove([w.photo_path])
}

export async function getPhotoUrl(path: string): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !data) throw new Error(`사진 URL 생성 실패: ${error?.message ?? '알 수 없는 오류'}`)
  return data.signedUrl
}
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```powershell
git add src/lib/workouts.ts
git commit -m "feat: add workout data layer with atomic upload and signed URLs"
```

---

### Task 8: 업로드 화면

**Files:**
- Create: `src/app/upload/page.tsx`

**Interfaces:**
- Consumes: `extractTakenAt`/`resolveTakenAt` (Task 5), `compressImage` (Task 6), `addWorkout` (Task 7)
- Produces: `/upload` 라우트 — 사진 선택 → EXIF 일시 확인 폼 → 저장 → `/` 복귀

- [ ] **Step 1: 구현**

`src/app/upload/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { extractTakenAt, resolveTakenAt } from '@/lib/exif'
import { compressImage } from '@/lib/image'
import { addWorkout } from '@/lib/workouts'

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [takenAt, setTakenAt] = useState('')
  const [exifFound, setExifFound] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError('')
    setFile(f)
    setPreview(URL.createObjectURL(f))
    // 중요: 압축 전에 EXIF를 읽는다 (압축하면 EXIF가 사라짐)
    const exifDate = await extractTakenAt(f)
    setExifFound(exifDate !== null)
    setTakenAt(toLocalInputValue(resolveTakenAt(exifDate, new Date())))
  }

  async function handleSave() {
    if (!file || !takenAt) return
    setSaving(true)
    setError('')
    try {
      const compressed = await compressImage(file)
      await addWorkout(compressed, new Date(takenAt))
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다')
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">운동 기록 올리기</h1>
        <Link href="/" className="text-sm text-gray-500">
          닫기
        </Link>
      </div>

      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-6 text-center">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="미리보기" className="mx-auto max-h-80 rounded-lg" />
        ) : (
          <span className="text-gray-500">📷 계기판 사진 선택 (탭하면 촬영/앨범)</span>
        )}
        <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </label>

      {file && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            촬영 일시 {!exifFound && <span className="text-amber-600">(사진에서 못 읽어서 직접 확인해주세요)</span>}
          </label>
          <input
            type="datetime-local"
            value={takenAt}
            onChange={(e) => setTakenAt(e.target.value)}
            className="w-full rounded-lg border border-gray-300 p-3"
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error} — 다시 시도해주세요.
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={!file || !takenAt || saving}
        className="w-full rounded-lg bg-emerald-500 p-3 font-bold text-white disabled:opacity-40"
      >
        {saving ? '저장 중…' : '저장'}
      </button>
    </main>
  )
}
```

- [ ] **Step 2: 수동 확인**

Run: `npm run dev` 후 `/upload` 접속
Expected:
1. 폰으로 찍은 JPEG(EXIF 있음) 선택 → 촬영 일시가 자동으로 채워짐
2. 스크린샷(EXIF 없음) 선택 → 현재 시각 + "직접 확인해주세요" 안내 표시
3. 저장 → `/`로 이동, Supabase 대시보드 Table Editor에서 workouts 행 + Storage에 압축된 jpg 확인 (원본보다 작은 용량)

- [ ] **Step 3: Commit**

```powershell
git add src/app/upload
git commit -m "feat: add upload page with EXIF date confirmation"
```

---

### Task 9: 캘린더 홈 (월/주 보기 + 스티커)

**Files:**
- Create: `src/app/page.tsx` (기본 페이지 덮어쓰기)

**Interfaces:**
- Consumes: `getMonthGrid`/`getWeekDays`/`groupByDateKey`/`toDateKey` (Task 4), `listWorkouts` (Task 7)
- Produces: `/` 라우트 — 월/주 토글, 스티커(🏃)+개수 배지, 이번 달 요약, + 버튼, 날짜 → `/day/[yyyy-MM-dd]` 링크

- [ ] **Step 1: 구현**

`src/app/page.tsx` 전체를 다음으로 교체:

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { addDays, addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns'
import { getMonthGrid, getWeekDays, groupByDateKey, toDateKey } from '@/lib/calendar'
import { listWorkouts } from '@/lib/workouts'
import type { Workout } from '@/lib/types'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export default function CalendarPage() {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [byDay, setByDay] = useState<Map<string, Workout[]>>(new Map())
  const [error, setError] = useState('')

  useEffect(() => {
    if (window.innerWidth < 640) setView('week')
  }, [])

  useEffect(() => {
    const from = startOfWeek(startOfMonth(anchor))
    const to = endOfWeek(endOfMonth(anchor))
    listWorkouts(from, to)
      .then((ws) => setByDay(groupByDateKey(ws)))
      .catch((err) => setError(err instanceof Error ? err.message : '조회 실패'))
  }, [anchor])

  function move(dir: 1 | -1) {
    setAnchor((a) => (view === 'month' ? addMonths(a, dir) : addDays(a, dir * 7)))
  }

  const monthPrefix = format(anchor, 'yyyy-MM')
  const daysThisMonth = [...byDay.keys()].filter((k) => k.startsWith(monthPrefix)).length
  const weeks =
    view === 'month'
      ? getMonthGrid(anchor.getFullYear(), anchor.getMonth() + 1)
      : [getWeekDays(anchor)]

  return (
    <main className="mx-auto max-w-2xl p-4 pb-24">
      <header className="mb-4 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">🏃 런로그</h1>
          <div className="rounded-lg border border-gray-300 text-sm">
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1 ${view === 'month' ? 'rounded-l-lg bg-emerald-500 text-white' : ''}`}
            >
              월
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1 ${view === 'week' ? 'rounded-r-lg bg-emerald-500 text-white' : ''}`}
            >
              주
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button onClick={() => move(-1)} className="p-2 text-lg">
            ◀
          </button>
          <div className="text-center">
            <div className="font-bold">{format(anchor, 'yyyy년 M월')}</div>
            <div className="text-xs text-gray-500">이번 달 {daysThisMonth}회 운동</div>
          </div>
          <button onClick={() => move(1)} className="p-2 text-lg">
            ▶
          </button>
        </div>
      </header>

      {error && <p className="mb-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-7 text-center text-xs text-gray-500">
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
              inMonth={view === 'week' || day.getMonth() === anchor.getMonth()}
            />
          ))}
        </div>
      ))}

      <Link
        href="/upload"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-8 py-4 text-lg font-bold text-white shadow-lg"
      >
        ＋ 기록하기
      </Link>
    </main>
  )
}

function DayCell({ day, workouts, inMonth }: { day: Date; workouts: Workout[]; inMonth: boolean }) {
  const isToday = toDateKey(day) === toDateKey(new Date())
  const cell = (
    <div
      className={`flex h-16 flex-col items-center rounded-lg p-1 ${inMonth ? '' : 'opacity-30'} ${
        isToday ? 'bg-emerald-50' : ''
      }`}
    >
      <span className={`text-xs ${isToday ? 'font-bold text-emerald-600' : ''}`}>{day.getDate()}</span>
      {workouts.length > 0 && (
        <span className="relative mt-1 text-2xl leading-none">
          🏃
          {workouts.length > 1 && (
            <span className="absolute -right-2 -top-1 rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
              {workouts.length}
            </span>
          )}
        </span>
      )}
    </div>
  )
  return workouts.length > 0 ? <Link href={`/day/${toDateKey(day)}`}>{cell}</Link> : cell
}
```

- [ ] **Step 2: 수동 확인**

Run: `npm run dev` 후 `/` 접속
Expected:
1. Task 8에서 올린 기록 날짜에 🏃 스티커 표시, 같은 날 2건이면 숫자 배지
2. 월/주 토글 동작, ◀▶으로 이동, "이번 달 N회 운동" 표시
3. 브라우저 창을 폰 크기(640px 미만)로 줄이고 새로고침 → 주 보기가 기본
4. 스티커 클릭 → `/day/2026-07-14` 형태 URL로 이동 (아직 404 — Task 10에서 구현)

- [ ] **Step 3: Commit**

```powershell
git add src/app/page.tsx
git commit -m "feat: add calendar home with month/week views and stickers"
```

---

### Task 10: 날짜 상세 화면 (사진 보기 + 삭제)

**Files:**
- Create: `src/app/day/[date]/page.tsx`

**Interfaces:**
- Consumes: `listWorkouts`/`deleteWorkout`/`getPhotoUrl` (Task 7), `Workout` 타입 (Task 4)
- Produces: `/day/[date]` 라우트 (date = `yyyy-MM-dd`) — 그날 사진 가로 스와이프, 촬영 시각 표시, 삭제

- [ ] **Step 1: 구현**

`src/app/day/[date]/page.tsx`:

```tsx
'use client'
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { deleteWorkout, getPhotoUrl, listWorkouts } from '@/lib/workouts'
import type { Workout } from '@/lib/types'

type Entry = { workout: Workout; url: string }

export default function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const from = new Date(`${date}T00:00:00`)
      const to = new Date(`${date}T23:59:59.999`)
      const workouts = await listWorkouts(from, to)
      const urls = await Promise.all(workouts.map((w) => getPhotoUrl(w.photo_path)))
      setEntries(workouts.map((workout, i) => ({ workout, url: urls[i] })))
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    void load()
  }, [load])

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
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{date}</h1>
        <Link href="/" className="text-sm text-gray-500">
          ← 캘린더
        </Link>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {loading && <p className="p-8 text-center text-gray-400">불러오는 중…</p>}
      {!loading && entries.length === 0 && !error && (
        <p className="p-8 text-center text-gray-400">이날의 기록이 없습니다</p>
      )}

      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto">
        {entries.map(({ workout, url }) => (
          <div key={workout.id} className="w-full flex-shrink-0 snap-center space-y-2">
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
              <button onClick={() => handleDelete(workout)} className="text-sm text-red-500">
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
      {entries.length > 1 && (
        <p className="text-center text-xs text-gray-400">← 옆으로 넘겨서 다른 사진 보기 →</p>
      )}
    </main>
  )
}
```

- [ ] **Step 2: 수동 확인**

Run: `npm run dev` 후 캘린더에서 스티커 클릭
Expected:
1. 그날 사진이 크게 표시, 촬영 시각 표시
2. 같은 날 2건이면 가로 스와이프(스냅)로 넘김
3. 삭제 → 확인 창 → 목록에서 사라짐, 캘린더로 돌아가면 스티커도 갱신됨 (기록 0건이 되면 스티커 제거)
4. Supabase 대시보드에서 DB 행과 Storage 파일이 함께 삭제됐는지 확인

- [ ] **Step 3: 전체 테스트 + 빌드 확인**

Run: `npm test`
Expected: PASS (calendar 5 + exif 3 = 8 tests)

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 4: Commit**

```powershell
git add src/app/day
git commit -m "feat: add day detail page with photo swipe and delete"
```

---

### Task 11: Vercel 배포 (사람 작업 포함)

**Files:**
- Modify: 없음 (배포 설정은 Vercel 대시보드/CLI)

**Interfaces:**
- Consumes: 완성된 앱 (Task 1~10)
- Produces: 폰/PC에서 접속 가능한 공개 URL

- [ ] **Step 1: 사용자(사람) 작업 — GitHub 리포지토리 + Vercel 연결**

아래를 안내하고 완료를 기다린다 (GitHub 계정으로 `gh auth login`이 되어 있으면 1~2는 대신 실행 가능):

1. GitHub에 비공개 리포지토리 생성: `gh repo create run-log --private --source . --push`
2. https://vercel.com 가입(GitHub 연동) → "Add New Project" → run-log 리포지토리 import
3. Environment Variables에 `.env.local`의 두 값(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) 입력 → Deploy

- [ ] **Step 2: Supabase에 배포 URL 등록 (사람 작업)**

Supabase 대시보드 → Authentication → URL Configuration → Site URL에 Vercel 배포 URL(`https://run-log-xxx.vercel.app`) 입력.

- [ ] **Step 3: 스모크 테스트**

폰 브라우저에서 배포 URL 접속:
1. 로그인 → 캘린더 표시
2. 카메라로 사진 찍어 업로드 → 오늘 날짜에 스티커
3. 스티커 탭 → 사진 상세 확인
4. PC 브라우저에서도 같은 기록이 보이는지 확인 (기기 간 공유)

- [ ] **Step 4: 완료 커밋 (README)**

`README.md`를 다음으로 교체 후 커밋:

```markdown
# 런로그 (RunLog)

러닝머신 계기판 사진을 올리면 캘린더에 스티커로 표시되는 개인용 운동 기록 서비스.

- 설계: docs/superpowers/specs/2026-07-14-run-log-design.md
- 스택: Next.js + Supabase (무료 티어) + Vercel
- 로컬 실행: `.env.local` 설정 후 `npm run dev`
- 테스트: `npm test`
```

```powershell
git add README.md
git commit -m "docs: add project README"
git push
```
