import type { Workout } from '@/lib/types'

const SYSTEM = `너는 한국어로 코칭하는 러닝 코치야. 사용자는 러닝머신에서 달리기와 걷기를 섞어 운동하는 초중급 러너 1명이야.
아래 세 섹션의 일반 텍스트로 답해줘. 마크다운 문법(#, *, - 등)은 쓰지 말고 섹션 제목은 이모지로 시작해:
📊 운동 효과 분석
🎯 다음 목표치
🏃 추천 운동 방법
직전 코치 리포트가 있으면 그때 제안 대비 무엇이 달라졌는지 꼭 짚어줘. 일지가 없는 기록은 수치만으로 판단해. 격려하는 톤으로, 과한 인사말 없이 본론부터.`

// 최근 기록(+직전 리포트)을 Claude에 보낼 system/user 프롬프트로 변환하는 순수 함수
export function buildCoachPrompt(
  workouts: Workout[],
  lastReport: string | null
): { system: string; user: string } {
  const lines = workouts.map((w) => {
    const date = w.taken_at.slice(0, 10)
    const dur = w.duration_min !== null ? `${w.duration_min}분` : '?'
    const dist = w.distance_km !== null ? `${w.distance_km}km` : '?'
    const cal = w.calories !== null ? `${w.calories}kcal` : '?'
    const journal = w.journal ? ` | 일지: ${w.journal}` : ''
    return `- ${date}: ${dur} / ${dist} / ${cal}${journal}`
  })
  const parts = [`최근 운동 기록 (${workouts.length}건):`, ...lines]
  if (lastReport) {
    parts.push('', '직전 코치 리포트:', lastReport)
  }
  parts.push('', '위 기록을 분석해서 코칭해줘.')
  return { system: SYSTEM, user: parts.join('\n') }
}
