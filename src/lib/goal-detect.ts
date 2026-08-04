// 운동 일지에서 "목표 변경 선언"을 감지하는 분류기의 순수 로직 (프롬프트 조립 + 응답 파싱).
// 실제 모델 호출은 /api/goal/detect 라우트가 담당한다.
// 자유 텍스트에서 의도를 읽는 판단이라 코드(정규식)가 아닌 모델에 맡기되,
// 단순 분류 작업이므로 최저가 모델(Haiku)로 충분하다.

export type GoalDetection = { changed: boolean; newGoal: string | null }

export const DETECT_MODEL = 'claude-haiku-4-5'

export const DETECT_SYSTEM = `너는 운동 일지 텍스트에서 "운동 목표 변경 선언"을 감지하는 분류기다.
반드시 JSON만 출력한다. 다른 텍스트 금지. 형식: {"changed": true 또는 false, "new_goal": "목표 한 문장" 또는 null}

changed=true 조건 — 다음일 때만:
- 새 목표를 세웠거나 기존 목표를 바꿨다는 명시적 서술이 있을 때
- 예: "이제 5km 완주로 목표를 올렸다", "다음 목표는 10km", "목표를 30분 무정지 달리기로 바꿈"

changed=false 조건:
- 막연한 희망이나 감상 ("언젠가 10km 뛰어보고 싶다")
- 오늘 운동 내용의 단순 서술 ("5km 뛰었다")
- 현재 목표와 사실상 같은 내용의 반복

new_goal은 changed=true일 때만, 목표를 자연스러운 한 문장으로 정규화해 담는다.`

export function buildDetectUserPrompt(journal: string, currentGoal: string | null): string {
  return [
    `현재 설정된 목표: ${currentGoal ?? '(없음)'}`,
    '',
    '운동 일지:',
    journal,
  ].join('\n')
}

// 모델 응답에서 판정을 안전하게 추출한다. 파싱 실패 시 "변경 없음"으로 처리 —
// 감지는 부가 기능이므로 어떤 경우에도 기록 저장 흐름을 깨면 안 된다.
export function parseDetectResponse(text: string): GoalDetection {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return { changed: false, newGoal: null }
  try {
    const parsed = JSON.parse(m[0]) as { changed?: unknown; new_goal?: unknown }
    const newGoal = typeof parsed.new_goal === 'string' ? parsed.new_goal.trim() : ''
    if (parsed.changed === true && newGoal) {
      return { changed: true, newGoal }
    }
    return { changed: false, newGoal: null }
  } catch {
    return { changed: false, newGoal: null }
  }
}
