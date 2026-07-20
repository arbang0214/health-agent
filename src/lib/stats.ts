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
