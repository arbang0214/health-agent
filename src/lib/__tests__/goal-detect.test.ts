import { describe, expect, it } from 'vitest'
import { buildDetectUserPrompt, parseDetectResponse } from '@/lib/goal-detect'

describe('buildDetectUserPrompt', () => {
  it('현재 목표와 일지를 담는다', () => {
    const p = buildDetectUserPrompt('오늘 3km 뛰었다', '3km 무정지 완주')
    expect(p).toContain('현재 설정된 목표: 3km 무정지 완주')
    expect(p).toContain('오늘 3km 뛰었다')
  })

  it('목표가 없으면 (없음)으로 표시한다', () => {
    const p = buildDetectUserPrompt('일지', null)
    expect(p).toContain('현재 설정된 목표: (없음)')
  })
})

describe('parseDetectResponse', () => {
  it('정상 변경 응답을 파싱한다', () => {
    const r = parseDetectResponse('{"changed": true, "new_goal": "5km를 걷지 않고 완주하기"}')
    expect(r).toEqual({ changed: true, newGoal: '5km를 걷지 않고 완주하기' })
  })

  it('JSON 앞뒤에 잡담이 붙어도 파싱한다', () => {
    const r = parseDetectResponse('판정 결과입니다.\n{"changed": false, "new_goal": null}\n감사합니다')
    expect(r).toEqual({ changed: false, newGoal: null })
  })

  it('changed=true인데 new_goal이 비면 변경 없음으로 강등한다', () => {
    expect(parseDetectResponse('{"changed": true, "new_goal": ""}')).toEqual({
      changed: false,
      newGoal: null,
    })
    expect(parseDetectResponse('{"changed": true, "new_goal": null}')).toEqual({
      changed: false,
      newGoal: null,
    })
  })

  it('JSON이 아니거나 깨진 응답은 안전하게 변경 없음 처리한다', () => {
    expect(parseDetectResponse('목표 변경으로 보입니다')).toEqual({ changed: false, newGoal: null })
    expect(parseDetectResponse('{"changed": tru')).toEqual({ changed: false, newGoal: null })
    expect(parseDetectResponse('')).toEqual({ changed: false, newGoal: null })
  })

  it('new_goal 앞뒤 공백을 정리한다', () => {
    const r = parseDetectResponse('{"changed": true, "new_goal": "  10km 완주  "}')
    expect(r).toEqual({ changed: true, newGoal: '10km 완주' })
  })
})
