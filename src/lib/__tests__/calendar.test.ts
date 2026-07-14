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
