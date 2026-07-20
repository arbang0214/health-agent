'use client'
import { Suspense, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { extractTakenAt, fallbackTakenAt, resolveTakenAt } from '@/lib/exif'
import { compressImage } from '@/lib/image'
import { recognizeWorkout } from '@/lib/ocr'
import { addWorkout } from '@/lib/workouts'

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function UploadForm() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [takenAt, setTakenAt] = useState('')
  const [exifFound, setExifFound] = useState(true)
  const [durationMin, setDurationMin] = useState('')
  const [distanceKm, setDistanceKm] = useState('')
  const [calories, setCalories] = useState('')
  const [ocrRunning, setOcrRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ocrRun = useRef(0)
  const router = useRouter()
  const dateParam = useSearchParams().get('date')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const run = ++ocrRun.current
    setError('')
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setDurationMin('')
    setDistanceKm('')
    setCalories('')
    setOcrRunning(true)
    try {
      // 중요: 압축 전에 EXIF를 읽는다 (압축하면 EXIF가 사라짐)
      const exifDate = await extractTakenAt(f)
      if (run !== ocrRun.current) return // 그 사이 다른 사진 선택됨
      setExifFound(exifDate !== null)
      setTakenAt(toLocalInputValue(resolveTakenAt(exifDate, fallbackTakenAt(dateParam, new Date()))))

      // OCR 자동 인식 (실패해도 수동 입력으로 진행)
      const stats = await recognizeWorkout(f)
      if (run !== ocrRun.current) return // 그 사이 다른 사진 선택됨
      if (stats.duration_min !== null) setDurationMin(String(stats.duration_min))
      if (stats.distance_km !== null) setDistanceKm(String(stats.distance_km))
      if (stats.calories !== null) setCalories(String(stats.calories))
    } catch {
      // 인식 실패 — 빈 칸 유지
    } finally {
      if (run === ocrRun.current) setOcrRunning(false)
    }
  }

  async function handleSave() {
    if (!file || !takenAt) return
    setSaving(true)
    setError('')
    const toNum = (s: string) => {
      const n = Number(s)
      return s.trim() === '' || !Number.isFinite(n) ? null : n
    }
    try {
      const compressed = await compressImage(file)
      await addWorkout(compressed, new Date(takenAt), {
        duration_min: toNum(durationMin),
        distance_km: toNum(distanceKm),
        calories: toNum(calories),
      })
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-emerald-100">
      <main className="mx-auto max-w-md space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-emerald-900">
            운동 기록 올리기
            {dateParam && <span className="ml-2 text-sm font-normal text-gray-500">{dateParam}</span>}
          </h1>
          <Link href="/" className="text-sm text-gray-500">
            닫기
          </Link>
        </div>

        <label className="block cursor-pointer rounded-2xl bg-white p-6 text-center shadow-sm">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="미리보기" className="mx-auto max-h-80 rounded-xl" />
          ) : (
            <span className="text-gray-500">📷 계기판 사진 선택 (탭하면 촬영/앨범)</span>
          )}
          <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </label>

        {file && (
          <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
            <div>
              <label className="block text-sm font-medium">
                촬영 일시{' '}
                {!exifFound && <span className="text-amber-600">(사진에서 못 읽어서 직접 확인해주세요)</span>}
              </label>
              <input
                type="datetime-local"
                value={takenAt}
                onChange={(e) => setTakenAt(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 p-3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">
                운동 수치{' '}
                {ocrRunning ? (
                  <span className="text-violet-600">✨ 사진에서 인식 중…</span>
                ) : (
                  <span className="text-gray-400">(틀리면 바로 고쳐주세요)</span>
                )}
              </label>
              <div className="mt-1 flex gap-2">
                <label className="flex-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    value={durationMin}
                    onChange={(e) => setDurationMin(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 p-3 text-center"
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
                    className="w-full rounded-xl border border-gray-200 p-3 text-center"
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
                    className="w-full rounded-xl border border-gray-200 p-3 text-center"
                  />
                  <span className="block text-center text-[10px] text-gray-400">kcal</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error} — 다시 시도해주세요.</p>
        )}

        <button
          onClick={handleSave}
          disabled={!file || !takenAt || saving || ocrRunning}
          className="w-full rounded-full bg-emerald-500 p-3 font-bold text-white shadow-lg shadow-emerald-500/40 disabled:opacity-40"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </main>
    </div>
  )
}

export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadForm />
    </Suspense>
  )
}
