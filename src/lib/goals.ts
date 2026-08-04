import { createClient } from '@/lib/supabase/client'
import type { Goal } from '@/lib/types'

// 목표는 수정하지 않고 새 행을 삽입한다 — 최신 행 = 현재 목표, 과거 행 = 변경 이력
export async function getCurrentGoal(): Promise<Goal | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`목표 조회 실패: ${error.message}`)
  return (data?.[0] as Goal) ?? null
}

// 일지 텍스트에서 목표 변경을 감지해 서버에서 goals에 반영한다 (Haiku 분류).
// 감지는 부가 기능 — 실패해도 조용히 넘어가 기록 저장 흐름을 막지 않는다.
// 저장 직후 캘린더로 돌아갔을 때 목표 영역이 갱신되어 있도록 완료를 기다린다 (~1초).
export async function detectGoalChangeFromJournal(journal: string | null | undefined): Promise<void> {
  const trimmed = journal?.trim()
  if (!trimmed) return
  try {
    await fetch('/api/goal/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ journal: trimmed }),
    })
  } catch {
    // 무시
  }
}

export async function setGoal(
  content: string,
  source: 'manual' | 'journal' = 'manual'
): Promise<Goal> {
  const trimmed = content.trim()
  if (!trimmed) throw new Error('목표 내용을 입력해주세요')
  const supabase = createClient()
  const { data, error } = await supabase
    .from('goals')
    .insert({ content: trimmed, source })
    .select()
    .single()
  if (error) throw new Error(`목표 저장 실패: ${error.message}`)
  return data as Goal
}
