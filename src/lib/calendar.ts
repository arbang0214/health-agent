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
