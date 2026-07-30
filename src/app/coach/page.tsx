'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listCoachReports } from '@/lib/coach-reports'
import type { CoachReport } from '@/lib/types'

function reportDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CoachPage() {
  const [reports, setReports] = useState<CoachReport[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let stale = false
    listCoachReports()
      .then((rs) => {
        if (!stale) setReports(rs)
      })
      .catch((err) => {
        if (!stale) setError(err instanceof Error ? err.message : '조회에 실패했습니다')
      })
      .finally(() => {
        if (!stale) setLoading(false)
      })
    return () => {
      stale = true
    }
  }, [])

  async function handleAnalyze() {
    setAnalyzing(true)
    setError('')
    try {
      const res = await fetch('/api/coach', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.message ?? '분석에 실패했어요. 잠시 후 다시 시도해주세요.')
        return
      }
      setReports((prev) => [body.report, ...prev])
    } catch {
      setError('분석에 실패했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setAnalyzing(false)
    }
  }

  const [latest, ...older] = reports

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-emerald-100">
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-emerald-900">🧑‍🏫 AI 코치</h1>
          <Link href="/" className="text-sm text-gray-500">
            ← 캘린더
          </Link>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="w-full rounded-full bg-amber-500 p-3 font-bold text-white shadow-lg shadow-amber-500/40 disabled:opacity-40"
        >
          {analyzing ? '분석 중… (최대 1분 걸려요)' : '✨ 최근 기록 분석해줘'}
        </button>

        {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {loading && <p className="p-8 text-center text-gray-400">불러오는 중…</p>}
        {!loading && reports.length === 0 && !error && (
          <p className="p-8 text-center text-gray-400">
            아직 리포트가 없어요. 버튼을 눌러 첫 분석을 받아보세요!
          </p>
        )}

        {latest && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold text-amber-600">{reportDate(latest.created_at)}</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
              {latest.content}
            </p>
          </div>
        )}

        {older.length > 0 && (
          <div className="space-y-2">
            <p className="px-1 text-xs font-bold text-gray-400">지난 리포트</p>
            {older.map((r) => (
              <details key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <summary className="cursor-pointer text-sm font-bold text-gray-600">
                  {reportDate(r.created_at)}
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                  {r.content}
                </p>
              </details>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
