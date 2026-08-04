// AI 코치 품질 eval 러너 — 실 API 호출 (비용 발생). CI에 넣지 말 것. 실행:
//   npm run eval:coach               (전체 8사례)
//   npm run eval:coach -- goal-5k    (특정 사례만)
//   npm run eval:coach -- --baseline (목표 미전달 시뮬레이션 — goal-* 사례가 실패해야 eval에 변별력이 있음)
import Anthropic from '@anthropic-ai/sdk'
import { buildCoachPrompt } from '../src/lib/coach-prompt'
import { COACH_CASES, type CoachCase } from './coach-cases'
import { loadEnvLocal } from './env'
import { judgeCoaching, type ItemResult } from './judge'

loadEnvLocal()

type CaseResult = { c: CoachCase; output: string; items: ItemResult[] }

// [eval-first] buildCoachPrompt는 아직 goal 파라미터가 없어 세 번째 인자는 무시된다.
// → 베이스라인에서 목표 사례가 실패하는 것이 "정상"이며, 이것이 eval의 변별력 증명이다.
// 목표 인지 기능 구현 시 시그니처가 (workouts, lastReport, goal)로 확장되면 캐스트를 제거한다.
// --baseline: 구현 후에도 목표 미전달 상태를 시뮬레이션 (변별력 비교용)
function buildInput(c: CoachCase, baseline: boolean): { system: string; user: string } {
  type WithGoal = (
    w: CoachCase['workouts'],
    r: string | null,
    g: string | null
  ) => { system: string; user: string }
  return (buildCoachPrompt as unknown as WithGoal)(
    c.workouts,
    c.lastReport,
    baseline ? null : c.goal
  )
}

async function runCase(client: Anthropic, c: CoachCase, baseline: boolean): Promise<CaseResult> {
  const { system, user } = buildInput(c, baseline)
  // 운영 route.ts와 동일 조건으로 호출해야 측정이 의미 있다
  const res = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 16000,
    system,
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content: user }],
  })
  const output = res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('\n')

  const codeResults: ItemResult[] = c.rubric
    .filter((i) => i.type === 'code')
    .map((i) => ({ id: i.id, pass: i.check(output), reason: `코드 채점: ${i.desc}` }))
  const judgeItems = c.rubric.filter((i) => i.type === 'judge')
  const judgeResults = await judgeCoaching(client, c, output, judgeItems)
  // rubric 순서대로 정렬
  const byId = new Map([...codeResults, ...judgeResults].map((r) => [r.id, r]))
  return { c, output, items: c.rubric.map((i) => byId.get(i.id)!) }
}

async function main() {
  const args = process.argv.slice(2)
  const baseline = args.includes('--baseline')
  const filter = args.find((a) => !a.startsWith('--'))
  const cases = filter ? COACH_CASES.filter((c) => c.id === filter) : COACH_CASES
  if (cases.length === 0) {
    console.error(`사례 없음: ${filter}`)
    process.exit(1)
  }
  const client = new Anthropic()
  console.log(
    `코치 eval 시작 — ${cases.length}사례 (실 API 호출)${baseline ? ' [베이스라인: 목표 미전달]' : ''}\n`
  )

  // 3개씩 동시 실행 (rate limit 배려)
  const results: CaseResult[] = []
  for (let i = 0; i < cases.length; i += 3) {
    const batch = cases.slice(i, i + 3)
    const settled = await Promise.all(
      batch.map((c) =>
        runCase(client, c, baseline).catch((e) => {
          console.error(`✗ ${c.id} 실행 오류: ${e instanceof Error ? e.message : e}`)
          return null
        })
      )
    )
    for (const r of settled) if (r) results.push(r)
    for (const r of settled) if (r) printCase(r)
  }

  // 집계: 목표 사례(goal-*) vs 품질 사례 분리 보고
  const all = results.flatMap((r) => r.items)
  const goalItems = results.filter((r) => r.c.id.startsWith('goal-')).flatMap((r) => r.items)
  const qualItems = results.filter((r) => !r.c.id.startsWith('goal-')).flatMap((r) => r.items)
  const rate = (xs: ItemResult[]) =>
    xs.length === 0 ? '—' : `${xs.filter((x) => x.pass).length}/${xs.length} (${Math.round((100 * xs.filter((x) => x.pass).length) / xs.length)}%)`
  console.log('\n========== 집계 ==========')
  console.log(`목표 인지 사례: ${rate(goalItems)}`)
  console.log(`일반 품질 사례: ${rate(qualItems)}`)
  console.log(`전체:           ${rate(all)}`)
}

function printCase(r: CaseResult) {
  const ok = r.items.every((i) => i.pass)
  console.log(`${ok ? '✅' : '❌'} [${r.c.id}] ${r.c.name}`)
  for (const item of r.items) {
    const mark = item.pass ? '  ○' : '  ✗'
    console.log(`${mark} ${item.id}${item.reason ? ` — ${item.reason}` : ''}`)
  }
  console.log()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
