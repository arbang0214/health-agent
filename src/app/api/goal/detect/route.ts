import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import {
  DETECT_MODEL,
  DETECT_SYSTEM,
  buildDetectUserPrompt,
  parseDetectResponse,
} from '@/lib/goal-detect'
import type { Goal } from '@/lib/types'

export const maxDuration = 30

// 운동 일지에서 목표 변경을 감지해 goals에 반영한다.
// 감지는 부가 기능 — 어떤 실패든 200 + {changed:false}로 응답해 저장 흐름을 막지 않는다.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { journal?: unknown }
    const journal = typeof body.journal === 'string' ? body.journal.trim() : ''
    if (!journal) return NextResponse.json({ changed: false })

    // 호출자의 토큰으로 클라이언트 생성 — 목표 조회·갱신이 그 사용자 것으로만 이뤄진다 (RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: req.headers.get('authorization') ?? '' } } }
    )
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return NextResponse.json({ changed: false })
    const { data: rows, error: goalError } = await supabase
      .from('goals')
      .select('content')
      .order('created_at', { ascending: false })
      .limit(1)
    if (goalError) throw new Error(goalError.message)
    const current = rows?.[0]?.content ?? null

    const anthropic = new Anthropic() // ANTHROPIC_API_KEY 환경변수 사용
    const res = await anthropic.messages.create({
      model: DETECT_MODEL, // 분류 작업 — 최저가 모델로 충분
      max_tokens: 300,
      system: DETECT_SYSTEM,
      messages: [{ role: 'user', content: buildDetectUserPrompt(journal, current) }],
    })
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    const detection = parseDetectResponse(text)

    if (!detection.changed || !detection.newGoal || detection.newGoal === current) {
      return NextResponse.json({ changed: false })
    }
    const { data: inserted, error: insertError } = await supabase
      .from('goals')
      .insert({ content: detection.newGoal, source: 'journal' })
      .select()
      .single()
    if (insertError) throw new Error(insertError.message)
    return NextResponse.json({ changed: true, goal: inserted as Goal })
  } catch (err) {
    console.error('goal detect failed:', err)
    return NextResponse.json({ changed: false })
  }
}
