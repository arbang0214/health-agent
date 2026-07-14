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
