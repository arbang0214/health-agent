// 목표 변경 감지기(Haiku) eval — 실 API 호출. 실행: npm run eval:detect
// judge가 필요 없다: 기대값(changed 여부 + 새 목표에 포함될 키워드)이 결정적이라 코드 채점으로 충분.
import Anthropic from '@anthropic-ai/sdk'
import {
  DETECT_MODEL,
  DETECT_SYSTEM,
  buildDetectUserPrompt,
  parseDetectResponse,
} from '../src/lib/goal-detect'
import { loadEnvLocal } from './env'

loadEnvLocal()

type DetectCase = {
  id: string
  journal: string
  currentGoal: string | null
  expectChanged: boolean
  expectGoalIncludes?: string // changed=true 기대 시 새 목표에 포함돼야 하는 키워드
}

const CASES: DetectCase[] = [
  {
    id: 'explicit-upgrade',
    journal: '오늘 3.5km까지 달렸다. 3km는 이제 익숙해져서 목표를 5km 완주로 올렸다',
    currentGoal: '3km를 걷지 않고 완주하기',
    expectChanged: true,
    expectGoalIncludes: '5km',
  },
  {
    id: 'explicit-new',
    journal: '다음 목표는 30분 동안 쉬지 않고 달리기로 정했다',
    currentGoal: null,
    expectChanged: true,
    expectGoalIncludes: '30분',
  },
  {
    id: 'plain-record',
    journal: '5km 뛰었다. 오늘은 다리가 가벼웠다',
    currentGoal: '3km를 걷지 않고 완주하기',
    expectChanged: false,
  },
  {
    id: 'vague-wish',
    journal: '언젠가 10km 마라톤도 뛰어보고 싶다',
    currentGoal: '3km를 걷지 않고 완주하기',
    expectChanged: false,
  },
  {
    id: 'same-goal-restate',
    journal: '3km를 안 걷고 완주하는 게 목표라서 오늘도 인터벌 연습',
    currentGoal: '3km를 걷지 않고 완주하기',
    expectChanged: false,
  },
  {
    id: 'no-goal-talk',
    journal: '무릎이 좀 아파서 일찍 끝냈다',
    currentGoal: '3km를 걷지 않고 완주하기',
    expectChanged: false,
  },
]

async function main() {
  const client = new Anthropic()
  console.log(`감지기 eval 시작 — ${CASES.length}사례 (실 API 호출, ${DETECT_MODEL})\n`)
  let pass = 0
  for (const c of CASES) {
    const res = await client.messages.create({
      model: DETECT_MODEL,
      max_tokens: 300,
      system: DETECT_SYSTEM,
      messages: [{ role: 'user', content: buildDetectUserPrompt(c.journal, c.currentGoal) }],
    })
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    const d = parseDetectResponse(text)
    const changedOk = d.changed === c.expectChanged
    const goalOk =
      !c.expectChanged || !c.expectGoalIncludes || (d.newGoal ?? '').includes(c.expectGoalIncludes)
    const ok = changedOk && goalOk
    if (ok) pass += 1
    console.log(
      `${ok ? '✅' : '❌'} [${c.id}] changed=${d.changed} (기대 ${c.expectChanged})` +
        (d.newGoal ? ` | 새 목표: ${d.newGoal}` : '')
    )
  }
  console.log(`\n========== 집계 ==========\n${pass}/${CASES.length} 통과`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
