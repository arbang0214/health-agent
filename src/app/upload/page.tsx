'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { extractTakenAt, resolveTakenAt } from '@/lib/exif'
import { compressImage } from '@/lib/image'
import { addWorkout } from '@/lib/workouts'

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [takenAt, setTakenAt] = useState('')
  const [exifFound, setExifFound] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError('')
    setFile(f)
    setPreview(URL.createObjectURL(f))
    // 중요: 압축 전에 EXIF를 읽는다 (압축하면 EXIF가 사라짐)
    const exifDate = await extractTakenAt(f)
    setExifFound(exifDate !== null)
    setTakenAt(toLocalInputValue(resolveTakenAt(exifDate, new Date())))
  }

  async function handleSave() {
    if (!file || !takenAt) return
    setSaving(true)
    setError('')
    try {
      const compressed = await compressImage(file)
      await addWorkout(compressed, new Date(takenAt))
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다')
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">운동 기록 올리기</h1>
        <Link href="/" className="text-sm text-gray-500">
          닫기
        </Link>
      </div>

      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-6 text-center">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="미리보기" className="mx-auto max-h-80 rounded-lg" />
        ) : (
          <span className="text-gray-500">📷 계기판 사진 선택 (탭하면 촬영/앨범)</span>
        )}
        <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </label>

      {file && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            촬영 일시 {!exifFound && <span className="text-amber-600">(사진에서 못 읽어서 직접 확인해주세요)</span>}
          </label>
          <input
            type="datetime-local"
            value={takenAt}
            onChange={(e) => setTakenAt(e.target.value)}
            className="w-full rounded-lg border border-gray-300 p-3"
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error} — 다시 시도해주세요.
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={!file || !takenAt || saving}
        className="w-full rounded-lg bg-emerald-500 p-3 font-bold text-white disabled:opacity-40"
      >
        {saving ? '저장 중…' : '저장'}
      </button>
    </main>
  )
}
