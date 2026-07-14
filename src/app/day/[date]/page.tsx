'use client'
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { deleteWorkout, getPhotoUrl, listWorkouts } from '@/lib/workouts'
import type { Workout } from '@/lib/types'

type Entry = { workout: Workout; url: string }

export default function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const from = new Date(`${date}T00:00:00`)
      const to = new Date(`${date}T23:59:59.999`)
      const workouts = await listWorkouts(from, to)
      const urls = await Promise.all(workouts.map((w) => getPhotoUrl(w.photo_path)))
      setEntries(workouts.map((workout, i) => ({ workout, url: urls[i] })))
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회에 실패했습니다')
    } finally {
      setLoading(false)
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
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{date}</h1>
        <Link href="/" className="text-sm text-gray-500">
          ← 캘린더
        </Link>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {loading && <p className="p-8 text-center text-gray-400">불러오는 중…</p>}
      {!loading && entries.length === 0 && !error && (
        <p className="p-8 text-center text-gray-400">이날의 기록이 없습니다</p>
      )}

      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto">
        {entries.map(({ workout, url }) => (
          <div key={workout.id} className="w-full flex-shrink-0 snap-center space-y-2">
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
              <button onClick={() => handleDelete(workout)} className="text-sm text-red-500">
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
      {entries.length > 1 && (
        <p className="text-center text-xs text-gray-400">← 옆으로 넘겨서 다른 사진 보기 →</p>
      )}
    </main>
  )
}
