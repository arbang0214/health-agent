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
