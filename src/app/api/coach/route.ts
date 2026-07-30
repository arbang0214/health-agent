import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { kstDayStartUtcIso, runCoach } from '@/lib/coach'
import type { CoachReport, Workout } from '@/lib/types'

// Claude 분석이 10~30초 걸릴 수 있어 Vercel 함수 타임아웃 연장
export const maxDuration = 60

const EIGHT_WEEKS_MS = 56 * 24 * 3600_000

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const anthropic = new Anthropic() // ANTHROPIC_API_KEY 환경변수 사용

  const result = await runCoach({
    async countReportsToday() {
      const { count, error } = await supabase
        .from('coach_reports')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', kstDayStartUtcIso(new Date()))
      if (error) throw new Error(error.message)
      return count ?? 0
    },
    async listRecentWorkouts() {
      const from = new Date(Date.now() - EIGHT_WEEKS_MS)
      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .gte('taken_at', from.toISOString())
        .order('taken_at', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as Workout[]
    },
    async getLastReportContent() {
      const { data, error } = await supabase
        .from('coach_reports')
        .select('content')
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) throw new Error(error.message)
      return data?.[0]?.content ?? null
    },
    async createReport(content) {
      const { data, error } = await supabase
        .from('coach_reports')
        .insert({ content })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as CoachReport
    },
    async generateAnalysis(system, user) {
      const response = await anthropic.beta.messages.create({
        model: 'claude-opus-5',
        max_tokens: 16000,
        system,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default', // 분류기 거부 시 자동 대체 모델 재실행
        messages: [{ role: 'user', content: user }],
      })
      if (response.stop_reason === 'refusal') throw new Error('refused')
      if (response.stop_reason === 'max_tokens') throw new Error('truncated')
      // filter만으로는 union이 좁혀지지 않아 map에서 TS 에러 — 조건부 map으로 처리
      const text = response.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .filter(Boolean)
        .join('\n')
      if (!text) throw new Error('empty response')
      return text
    },
  })

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status })
  }
  return NextResponse.json({ report: result.report })
}
