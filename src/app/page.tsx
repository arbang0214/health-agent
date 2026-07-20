'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { getMonthGrid, groupByDateKey, toDateKey } from '@/lib/calendar'
import { summarizeMonth } from '@/lib/stats'
import { listUnanalyzed, listWorkouts } from '@/lib/workouts'
import type { Workout } from '@/lib/types'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}분`
}

export default function CalendarPage() {
  const [anchor, setAnchor] = useState(() => new Date())
  const [byDay, setByDay] = useState<Map<string, Workout[]>>(new Map())
  const [unanalyzedCount, setUnanalyzedCount] = useState(0)
  const [error, setError] = useState('')
  const touchStart = useRef<{ x: number; y: number } | null>(null)

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

  useEffect(() => {
    let stale = false
    listUnanalyzed()
      .then((ws) => {
        if (!stale) setUnanalyzedCount(ws.length)
      })
      .catch(() => {}) // 배지 실패는 치명적이지 않음
    return () => {
      stale = true
    }
  }, [])

  const summary = summarizeMonth(byDay, format(anchor, 'yyyy-MM'))
  const isCurrentMonth = isSameMonth(anchor, new Date())
  const weeks = getMonthGrid(anchor.getFullYear(), anchor.getMonth() + 1)

  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    // 가로 우세(세로의 2배 이상) + 60px 이상일 때만 월 이동
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
      setAnchor((a) => addMonths(a, dx < 0 ? 1 : -1))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-emerald-100">
      <main
        className="mx-auto max-w-2xl p-4 pb-28"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <header className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-emerald-900">🏃 런로그</h1>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm">
            이번 달 {summary.days}회
          </span>
        </header>

        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setAnchor((a) => addMonths(a, -1))} className="p-2 text-emerald-800">
            ◀
          </button>
          <div className="flex items-center gap-2">
            <span className="font-bold text-emerald-950">{format(anchor, 'yyyy년 M월')}</span>
            {!isCurrentMonth && (
              <button
                onClick={() => setAnchor(new Date())}
                className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white"
              >
                오늘
              </button>
            )}
          </div>
          <button onClick={() => setAnchor((a) => addMonths(a, 1))} className="p-2 text-emerald-800">
            ▶
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          <StatCard value={summary.distanceKm !== null ? `${summary.distanceKm.toFixed(1)}km` : '—'} label="거리" />
          <StatCard value={summary.durationMin !== null ? formatDuration(summary.durationMin) : '—'} label="시간" />
          <StatCard value={summary.calories !== null ? summary.calories.toLocaleString() : '—'} label="kcal" />
        </div>

        {unanalyzedCount > 0 && (
          <Link
            href="/analyze"
            className="mb-3 block rounded-2xl bg-violet-500 p-3 text-center text-sm font-bold text-white shadow-sm"
          >
            ✨ AI 분석 (사진 {unanalyzedCount}장)
          </Link>
        )}

        {error && <p className="mb-2 rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <div className="rounded-2xl bg-white p-3 shadow-sm">
          <div className="grid grid-cols-7 text-center text-xs text-gray-400">
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
                  inMonth={day.getMonth() === anchor.getMonth()}
                />
              ))}
            </div>
          ))}
        </div>

        <Link
          href="/upload"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-500/40"
        >
          ＋ 기록하기
        </Link>
      </main>
    </div>
  )
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 rounded-2xl bg-white p-3 text-center shadow-sm">
      <div className="text-base font-extrabold text-emerald-600">{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  )
}

function DayCell({ day, workouts, inMonth }: { day: Date; workouts: Workout[]; inMonth: boolean }) {
  const key = toDateKey(day)
  const isToday = key === toDateKey(new Date())
  const cell = (
    <div
      className={`flex h-16 flex-col items-center rounded-xl p-1 ${inMonth ? '' : 'opacity-30'} ${
        isToday ? 'bg-emerald-500' : ''
      }`}
    >
      <span className={`text-xs ${isToday ? 'font-bold text-white' : 'text-gray-600'}`}>{day.getDate()}</span>
      {workouts.length > 0 && (
        <span className="relative mt-1 text-2xl leading-none">
          🏃
          {workouts.length > 1 && (
            <span className="absolute -right-2 -top-1 rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">
              {workouts.length}
            </span>
          )}
        </span>
      )}
    </div>
  )
  // 기록 있는 날 → 상세보기, 없는 날 → 그 날짜로 기록 등록
  return workouts.length > 0 ? (
    <Link href={`/day/${key}`}>{cell}</Link>
  ) : (
    <Link href={`/upload?date=${key}`}>{cell}</Link>
  )
}
