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

  it('목표가 있으면 user 프롬프트 맨 앞에 목표를 넣고 목표 중심 지시로 끝난다', () => {
    const { user } = buildCoachPrompt([makeWorkout()], null, '3km를 걷지 않고 완주하기')
    expect(user.startsWith('사용자 설정 목표: 3km를 걷지 않고 완주하기')).toBe(true)
    expect(user).toContain('목표 달성을 중심으로 코칭해줘')
  })

  it('목표가 없으면 목표 라벨을 넣지 않는다 (기존 동작 유지)', () => {
    const { user } = buildCoachPrompt([makeWorkout()], null)
    expect(user).not.toContain('사용자 설정 목표:')
    expect(user).toContain('위 기록을 분석해서 코칭해줘.')
  })

  it('목표 텍스트는 system이 아니라 user에 들어간다 (system은 고정 유지)', () => {
    const withGoal = buildCoachPrompt([makeWorkout()], null, '5km 완주')
    const withoutGoal = buildCoachPrompt([makeWorkout()], null)
    expect(withGoal.system).toBe(withoutGoal.system)
    expect(withGoal.system).not.toContain('5km 완주')
  })
})
