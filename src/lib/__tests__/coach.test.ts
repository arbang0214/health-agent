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
    getCurrentGoal: async () => null,
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

  it('설정된 목표를 프롬프트에 반영한다 (generateAnalysis 인자로 전달됨)', async () => {
    let seenUser = ''
    const deps = makeDeps({
      getCurrentGoal: async () => '3km를 걷지 않고 완주하기',
      generateAnalysis: async (_system, user) => {
        seenUser = user
        return '📊 분석'
      },
    })
    await runCoach(deps)
    expect(seenUser).toContain('사용자 설정 목표: 3km를 걷지 않고 완주하기')
  })

  it('목표 조회 실패는 코칭을 막지 않는다 (목표 없이 진행)', async () => {
    const deps = makeDeps({
      getCurrentGoal: async () => {
        throw new Error('db down')
      },
    })
    const result = await runCoach(deps)
    expect(result).toEqual({ ok: true, report: savedReport })
  })

  it('createReport 실패 시 502를 반환한다', async () => {
    const deps = makeDeps({
      createReport: async () => {
        throw new Error('db down')
      },
    })
    const result = await runCoach(deps)
    expect(result).toMatchObject({ ok: false, status: 502 })
  })
})
