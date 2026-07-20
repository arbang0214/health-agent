'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { recognizeWorkout } from '@/lib/ocr'
import { getPhotoUrl, listUnanalyzed, updateWorkoutStats } from '@/lib/workouts'
import type { Workout } from '@/lib/types'

type ItemStatus = 'pending' | 'running' | 'done' | 'failed'
type Item = {
  workout: Workout
  url: string
  status: ItemStatus
  durationMin: string
  distanceKm: string
  calories: string
}

export default function AnalyzePage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const started = useRef(false)
  const router = useRouter()

  useEffect(() => {
    if (started.current) return // StrictMode 재실행 방지
    started.current = true
    ;(async () => {
      try {
        const workouts = await listUnanalyzed()
        const urls = await Promise.all(workouts.map((w) => getPhotoUrl(w.photo_path)))
        const initial: Item[] = workouts.map((workout, i) => ({
          workout,
          url: urls[i],
          status: 'pending',
          durationMin: '',
          distanceKm: '',
          calories: '',
        }))
        setItems(initial)
        setLoading(false)

        // 순차 OCR (WASM 워커 1개 재사용)
        for (let i = 0; i < initial.length; i++) {
          setItems((prev) => prev.map((it, j) => (j === i ? { ...it, status: 'running' } : it)))
          try {
            const blob = await fetch(initial[i].url).then((r) => {
              if (!r.ok) throw new Error(`사진 다운로드 실패 (${r.status})`)
              return r.blob()
            })
            const stats = await recognizeWorkout(blob)
            setItems((prev) =>
              prev.map((it, j) =>
                j === i
                  ? {
                      ...it,
                      status: 'done',
                      durationMin: stats.duration_min !== null ? String(stats.duration_min) : '',
                      distanceKm: stats.distance_km !== null ? String(stats.distance_km) : '',
                      calories: stats.calories !== null ? String(stats.calories) : '',
                    }
                  : it
              )
            )
          } catch {
            setItems((prev) => prev.map((it, j) => (j === i ? { ...it, status: 'failed' } : it)))
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '조회에 실패했습니다')
        setLoading(false)
      }
    })()
  }, [])

  const analyzing = items.some((it) => it.status === 'pending' || it.status === 'running')

  function updateField(index: number, field: 'durationMin' | 'distanceKm' | 'calories', value: string) {
    setItems((prev) => prev.map((it, j) => (j === index ? { ...it, [field]: value } : it)))
  }

  async function handleSaveAll() {
    setSaving(true)
    setError('')
    const toNum = (s: string) => {
      const n = Number(s)
      return s.trim() === '' || !Number.isFinite(n) ? null : n
    }
    try {
      for (const it of items) {
        await updateWorkoutStats(it.workout.id, {
          duration_min: toNum(it.durationMin),
          distance_km: toNum(it.distanceKm),
          calories: toNum(it.calories),
        })
      }
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-emerald-100">
      <main className="mx-auto max-w-md space-y-4 p-4 pb-24">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-emerald-900">✨ AI 분석</h1>
          <Link href="/" className="text-sm text-gray-500">
            닫기
          </Link>
        </div>

        {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {loading && <p className="p-8 text-center text-gray-400">불러오는 중…</p>}
        {!loading && items.length === 0 && !error && (
          <p className="p-8 text-center text-gray-400">분석할 사진이 없습니다</p>
        )}

        {items.map((it, i) => (
          <div key={it.workout.id} className="space-y-2 rounded-2xl bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.url} alt="운동 기록 사진" className="h-14 w-14 rounded-xl object-cover" />
              <div className="flex-1 text-sm">
                <div className="font-bold text-gray-700">
                  {new Date(it.workout.taken_at).toLocaleDateString('ko-KR', {
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
                <div className="text-xs">
                  {it.status === 'pending' && <span className="text-gray-400">대기 중</span>}
                  {it.status === 'running' && <span className="text-violet-600">✨ 인식 중…</span>}
                  {it.status === 'done' && <span className="text-emerald-600">✓ 인식 완료 — 확인해주세요</span>}
                  {it.status === 'failed' && <span className="text-amber-600">인식 실패 — 직접 입력해주세요</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <label className="flex-1">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="—"
                  value={it.durationMin}
                  onChange={(e) => updateField(i, 'durationMin', e.target.value)}
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
                  value={it.distanceKm}
                  onChange={(e) => updateField(i, 'distanceKm', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-2 text-center text-sm"
                />
                <span className="block text-center text-[10px] text-gray-400">km</span>
              </label>
              <label className="flex-1">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="—"
                  value={it.calories}
                  onChange={(e) => updateField(i, 'calories', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-2 text-center text-sm"
                />
                <span className="block text-center text-[10px] text-gray-400">kcal</span>
              </label>
            </div>
          </div>
        ))}

        {items.length > 0 && (
          <button
            onClick={handleSaveAll}
            disabled={analyzing || saving}
            className="fixed bottom-6 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-full bg-emerald-500 p-3 font-bold text-white shadow-lg shadow-emerald-500/40 disabled:opacity-40"
          >
            {analyzing ? '분석 중…' : saving ? '저장 중…' : `모두 저장 (${items.length}건)`}
          </button>
        )}
      </main>
    </div>
  )
}
