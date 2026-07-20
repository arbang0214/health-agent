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
