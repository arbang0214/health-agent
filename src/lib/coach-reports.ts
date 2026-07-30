import { createClient } from '@/lib/supabase/client'
import type { CoachReport } from '@/lib/types'

export async function listCoachReports(limit = 20): Promise<CoachReport[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('coach_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`리포트 조회 실패: ${error.message}`)
  return (data ?? []) as CoachReport[]
}
