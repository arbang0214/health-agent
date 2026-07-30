import { buildCoachPrompt } from '@/lib/coach-prompt'
import type { CoachReport, Workout } from '@/lib/types'

export const DAILY_LIMIT = 5

// KST(UTC+9) 기준 '오늘 0시'를 UTC ISO 문자열로.
// coach_reports.created_at >= 이 값 이면 "오늘 생성분"
export function kstDayStartUtcIso(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 3600_000)
  const dayStartUtcMs =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600_000
  return new Date(dayStartUtcMs).toISOString()
}

export type CoachDeps = {
  countReportsToday(): Promise<number>
  listRecentWorkouts(): Promise<Workout[]>
  getLastReportContent(): Promise<string | null>
  createReport(content: string): Promise<CoachReport>
  generateAnalysis(system: string, user: string): Promise<string>
}

export type CoachResult =
  | { ok: true; report: CoachReport }
  | { ok: false; status: 400 | 429 | 502; message: string }

export async function runCoach(deps: CoachDeps): Promise<CoachResult> {
  if ((await deps.countReportsToday()) >= DAILY_LIMIT) {
    return {
      ok: false,
      status: 429,
      message: '오늘 분석 횟수를 다 썼어요. 내일 다시 만나요!',
    }
  }
  const workouts = await deps.listRecentWorkouts()
  if (workouts.length === 0) {
    return {
      ok: false,
      status: 400,
      message: '분석할 기록이 아직 없어요. 먼저 운동을 기록해주세요!',
    }
  }
  const lastReport = await deps.getLastReportContent()
  const { system, user } = buildCoachPrompt(workouts, lastReport)
  let content: string
  try {
    content = await deps.generateAnalysis(system, user)
  } catch {
    return {
      ok: false,
      status: 502,
      message: '분석에 실패했어요. 잠시 후 다시 시도해주세요.',
    }
  }
  try {
    const report = await deps.createReport(content)
    return { ok: true, report }
  } catch {
    console.error('coach report save failed, content:', content)
    return {
      ok: false,
      status: 502,
      message: '분석은 됐는데 저장에 실패했어요. 잠시 후 다시 시도해주세요.',
    }
  }
}
