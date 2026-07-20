'use client'
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { deleteWorkout, getPhotoUrl, listWorkouts, updateWorkoutStats } from '@/lib/workouts'
import type { Workout } from '@/lib/types'

type Entry = { workout: Workout; url: string }

function statsLabel(w: Workout): string {
  const dur = w.duration_min !== null ? `${w.duration_min}분` : '—'
  const dist = w.distance_km !== null ? `${w.distance_km}km` : '—'
  const cal = w.calories !== null ? `${w.calories}kcal` : '—'
  return `${dur} · ${dist} · ${cal}`
}

export default function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const from = new Date(`${date}T00:00:00`)
      const to = new Date(`${date}T23:59:59.999`)
      const workouts = await listWorkouts(from, to)
      const urls = await Promise.all(workouts.map((w) => getPhotoUrl(w.photo_path)))
      setEntries(workouts.map((workout, i) => ({ workout, url: urls[i] })))
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회에 실패했습니다')
    }
  }, [date])

  useEffect(() => {
    let stale = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const from = new Date(`${date}T00:00:00`)
        const to = new Date(`${date}T23:59:59.999`)
        const workouts = await listWorkouts(from, to)
        const urls = await Promise.all(workouts.map((w) => getPhotoUrl(w.photo_path)))
        if (stale) return
        setEntries(workouts.map((workout, i) => ({ workout, url: urls[i] })))
      } catch (err) {
        if (stale) return
        setError(err instanceof Error ? err.message : '조회에 실패했습니다')
      } finally {
        if (!stale) setLoading(false)
      }
    })()
    return () => {
      stale = true
    }
  }, [date])

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
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-emerald-100">
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-emerald-900">{date}</h1>
          <Link href="/" className="text-sm text-gray-500">
            ← 캘린더
          </Link>
        </div>

        {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {loading && <p className="p-8 text-center text-gray-400">불러오는 중…</p>}
        {!loading && entries.length === 0 && !error && (
          <p className="p-8 text-center text-gray-400">이날의 기록이 없습니다</p>
        )}

        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto">
          {entries.map(({ workout, url }) => (
            <WorkoutCard
              key={workout.id}
              workout={workout}
              url={url}
              onDelete={() => handleDelete(workout)}
              onSaved={load}
              onError={setError}
            />
          ))}
        </div>
        {entries.length > 1 && (
          <p className="text-center text-xs text-gray-400">← 옆으로 넘겨서 다른 사진 보기 →</p>
        )}
      </main>
    </div>
  )
}

function WorkoutCard({
  workout,
  url,
  onDelete,
  onSaved,
  onError,
}: {
  workout: Workout
  url: string
  onDelete: () => void
  onSaved: () => Promise<void>
  onError: (msg: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [durationMin, setDurationMin] = useState(workout.duration_min !== null ? String(workout.duration_min) : '')
  const [distanceKm, setDistanceKm] = useState(workout.distance_km !== null ? String(workout.distance_km) : '')
  const [calories, setCalories] = useState(workout.calories !== null ? String(workout.calories) : '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const toNum = (s: string) => {
      const n = Number(s)
      return s.trim() === '' || !Number.isFinite(n) ? null : n
    }
    try {
      await updateWorkoutStats(workout.id, {
        duration_min: toNum(durationMin),
        distance_km: toNum(distanceKm),
        calories: toNum(calories),
      })
      await onSaved()
      setEditing(false)
    } catch (err) {
      onError(err instanceof Error ? err.message : '수정에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full flex-shrink-0 snap-center space-y-2 rounded-2xl bg-white p-3 shadow-sm">
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
        <button onClick={onDelete} className="text-sm text-red-500">
          삭제
        </button>
      </div>
      {editing ? (
        <div className="space-y-2 px-1">
          <div className="flex gap-2">
            <label className="flex-1">
              <input
                type="number"
                inputMode="numeric"
                placeholder="—"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                className="w-full rounded-xl border border-gray-200 p-2 text-center text-sm"
              />
              <span className="block text-center text-[10px] text-gray-400">분</span>
            </label>
            <label className="flex-1">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="—"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                className="w-full rounded-xl border border-gray-200 p-2 text-center text-sm"
              />
              <span className="block text-center text-[10px] text-gray-400">km</span>
            </label>
            <label className="flex-1">
              <input
                type="number"
                inputMode="numeric"
                placeholder="—"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                className="w-full rounded-xl border border-gray-200 p-2 text-center text-sm"
              />
              <span className="block text-center text-[10px] text-gray-400">kcal</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-full bg-emerald-500 p-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex-1 rounded-full bg-gray-100 p-2 text-sm text-gray-600"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-bold text-emerald-700">{statsLabel(workout)}</span>
          <button onClick={() => setEditing(true)} className="text-sm text-gray-400">
            ✎ 수정
          </button>
        </div>
      )}
    </div>
  )
}
