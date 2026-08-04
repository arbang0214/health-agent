// LLM-as-judge: 코칭 출력을 rubric 항목별 이진(통과/실패) 판정한다.
// 기준(criterion)은 사례에 사람이 명시한다 — 기준 없는 채점은 매번 다른 잣대가 되기 때문.
import Anthropic from '@anthropic-ai/sdk'
import type { CoachCase, RubricItem } from './coach-cases'

export type ItemResult = { id: string; pass: boolean; reason: string }

const JUDGE_SYSTEM = `너는 러닝 코칭 리포트를 채점하는 엄격한 심사관이다.
주어진 각 항목의 기준을 문자 그대로 적용해 통과(true)/실패(false)만 판정한다.
- 기준에 애매하게 걸치면 보수적으로 실패 처리한다.
- 리포트의 문체나 길이는 판정에 반영하지 않는다. 기준에 적힌 내용만 본다.
- 반드시 JSON만 출력한다. 다른 텍스트 금지. 형식:
{"items":[{"id":"항목id","pass":true,"reason":"한 문장 근거"}]}`

export async function judgeCoaching(
  client: Anthropic,
  c: CoachCase,
  coachOutput: string,
  items: Extract<RubricItem, { type: 'judge' }>[]
): Promise<ItemResult[]> {
  if (items.length === 0) return []
  const workoutLines = c.workouts
    .map((w) => {
      const j = w.journal ? ` | 일지: ${w.journal}` : ''
      return `- ${w.taken_at.slice(0, 10)}: ${w.duration_min}분 / ${w.distance_km}km / ${w.calories}kcal${j}`
    })
    .join('\n')
  const user = [
    '## 사용자 목표',
    c.goal ?? '(설정된 목표 없음)',
    '',
    '## 운동 기록',
    workoutLines,
    '',
    '## 채점 대상: 코칭 리포트',
    coachOutput,
    '',
    '## 채점 항목',
    ...items.map((i) => `- id: ${i.id}\n  기준: ${i.criterion}`),
  ].join('\n')

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      system: JUDGE_SYSTEM,
      output_config: { effort: 'low' }, // 이진 판정 — 저비용으로 충분
      messages: [{ role: 'user', content: user }],
    })
    const text = res.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) continue
    try {
      const parsed = JSON.parse(m[0]) as { items: ItemResult[] }
      // 요청한 항목이 전부 판정됐는지 확인 — 누락되면 재시도
      if (items.every((i) => parsed.items.some((r) => r.id === i.id))) {
        return items.map((i) => parsed.items.find((r) => r.id === i.id)!)
      }
    } catch {
      // JSON 파싱 실패 → 재시도
    }
  }
  throw new Error(`judge 응답 파싱 실패 (case: ${c.id})`)
}
