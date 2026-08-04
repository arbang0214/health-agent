// AI 코치 품질 eval 사례. "코치가 어떻게 망가질 수 있나"를 기준으로 설계했다:
// 목표를 무시한다(1~4) / 통증·과훈련을 놓친다(5~6) / 데이터 부족에 과잉 단정한다(7) / 공백을 못 본다(8).
// rubric은 이진 판정만 쓴다 — 점수 척도보다 재현성이 높다.
import type { Workout } from '../src/lib/types'

export type RubricItem =
  | { id: string; type: 'code'; desc: string; check: (output: string) => boolean }
  | { id: string; type: 'judge'; desc: string; criterion: string }

export type CoachCase = {
  id: string
  name: string
  goal: string | null // 사용자가 설정한 목표 (목표 기능 구현 전 베이스라인에서는 코치에게 전달되지 않음)
  workouts: Workout[]
  lastReport: string | null
  rubric: RubricItem[]
}

let seq = 0
function mkWorkout(
  date: string,
  durationMin: number | null,
  distanceKm: number | null,
  calories: number | null,
  journal?: string
): Workout {
  seq += 1
  return {
    id: `w-${seq}`,
    user_id: 'eval-user',
    taken_at: `${date}T12:00:00.000Z`,
    duration_min: durationMin,
    distance_km: distanceKm,
    calories,
    analyzed_at: `${date}T12:10:00.000Z`,
    journal: journal ?? null,
    photo_path: 'public/eval.jpg',
  created_at: `${date}T12:10:00.000Z`,
  }
}

// 모든 사례 공통: 출력 형식(이모지 3섹션) 유지 — 코드 채점
const SECTIONS: RubricItem = {
  id: 'sections',
  type: 'code',
  desc: '📊/🎯/🏃 3개 섹션 형식 유지',
  check: (o) => o.includes('📊') && o.includes('🎯') && o.includes('🏃'),
}

export const COACH_CASES: CoachCase[] = [
  {
    id: 'goal-walkmix',
    name: '목표: 3km 무정지 완주, 현재 걷기 섞음',
    goal: '3km를 한 번도 걷지 않고 완주하기',
    workouts: [
      mkWorkout('2026-07-14', 32, 3.0, 265, '중간에 두 번 걸었다. 숨이 차서 힘들었음'),
      mkWorkout('2026-07-16', 31, 3.0, 258),
      mkWorkout('2026-07-19', 33, 3.1, 270, '오늘도 2.2km쯤에서 걸음'),
      mkWorkout('2026-07-22', 30, 3.0, 255),
      mkWorkout('2026-07-25', 31, 3.0, 262, '걷는 구간이 조금 줄었다'),
      mkWorkout('2026-07-28', 30, 3.0, 260),
    ],
    lastReport: null,
    rubric: [
      SECTIONS,
      {
        id: 'mention-3km',
        type: 'code',
        desc: '목표 거리 3km를 명시적으로 언급',
        check: (o) => /3(\.0)?\s*(km|킬로)/i.test(o),
      },
      {
        id: 'goal-centered',
        type: 'judge',
        desc: '코칭의 중심 주제가 목표(3km 무정지 완주) 달성',
        criterion:
          '코칭 리포트의 중심 주제가 "3km를 걷지 않고 완주한다"는 목표 달성이어야 한다. 칼로리 소모, 체중 감량, 단순 기록 나열이 중심이면 실패. 목표가 언급조차 되지 않으면 실패.',
      },
      {
        id: 'actionable-to-goal',
        type: 'judge',
        desc: '걷기 구간을 줄여 완주로 가는 구체적 방법 제안',
        criterion:
          '걷기 구간을 점진적으로 줄여 무정지 완주에 도달하는 구체적 방법(달리기/걷기 인터벌 조정, 페이스 낮추기, 호흡 등)을 최소 하나 제안해야 한다. 목표와 무관한 일반론만 있으면 실패.',
      },
    ],
  },
  {
    id: 'goal-near',
    name: '목표: 3km 무정지, 2.8km까지 도달 (마무리 단계)',
    goal: '3km를 한 번도 걷지 않고 완주하기',
    workouts: [
      mkWorkout('2026-07-18', 30, 3.0, 260, '2km까지는 안 걷고 감'),
      mkWorkout('2026-07-21', 31, 3.0, 262, '2.5km까지 연속으로 달림!'),
      mkWorkout('2026-07-24', 30, 3.0, 258),
      mkWorkout('2026-07-27', 31, 3.1, 266, '오늘 2.8km까지 안 걷고 버텼다. 거의 다 왔다'),
    ],
    lastReport: null,
    rubric: [
      SECTIONS,
      {
        id: 'gap-aware',
        type: 'judge',
        desc: '목표까지 남은 간극(2.8→3.0km)을 인지',
        criterion:
          '사용자가 무정지 2.8km까지 도달해 목표(3km)까지 약 0.2km 남았다는 진행 상황을 코칭이 인지하고 언급해야 한다. 이 진전을 무시하고 처음부터 시작하는 듯한 코칭이면 실패.',
      },
      {
        id: 'finishing-plan',
        type: 'judge',
        desc: '마무리 단계에 맞는 제안',
        criterion:
          '목표 달성이 임박한 상황에 맞는 제안(다음 시도에서 3km 완주 도전, 페이스 유지 전략 등)을 해야 한다. 진행 단계와 무관한 원론적 제안만 있으면 실패.',
      },
    ],
  },
  {
    id: 'goal-5k',
    name: '목표가 5km로 상향된 상태',
    goal: '5km를 걷지 않고 완주하기',
    workouts: [
      mkWorkout('2026-07-15', 28, 3.0, 250, '3km 무정지 성공! 이제 익숙해졌다'),
      mkWorkout('2026-07-18', 29, 3.2, 262),
      mkWorkout('2026-07-21', 30, 3.5, 280, '3.5km까지 늘려봤다. 목표를 5km 완주로 올렸다'),
      mkWorkout('2026-07-24', 32, 3.6, 290),
      mkWorkout('2026-07-27', 34, 3.8, 305, '조금씩 늘리는 중'),
    ],
    lastReport:
      '📊 운동 효과 분석\n3km 무정지 완주에 성공하며 기초 지구력이 안정됐어요.\n🎯 다음 목표치\n3km 페이스를 유지하며 주 3회 반복.\n🏃 추천 운동 방법\n같은 페이스로 3km를 편안하게 반복하세요.',
    rubric: [
      SECTIONS,
      {
        id: 'mention-5km',
        type: 'code',
        desc: '새 목표 거리 5km를 명시적으로 언급',
        check: (o) => /5(\.0)?\s*(km|킬로)/i.test(o),
      },
      {
        id: '5k-direction',
        type: 'judge',
        desc: '5km 완주를 향한 점진 계획 제시',
        criterion:
          '코칭이 새 목표인 "5km 무정지 완주"를 향한 점진적 거리 증량 계획(예: 4km→4.5km→5km)을 제시해야 한다. 이전 목표(3km) 기준에 머물러 있으면 실패.',
      },
    ],
  },
  {
    id: 'goal-not-calorie',
    name: '목표 설정됨 + 칼로리 데이터 풍부 (칼로리 중심 유혹)',
    goal: '3km를 한 번도 걷지 않고 완주하기',
    workouts: [
      mkWorkout('2026-07-13', 35, 3.0, 310),
      mkWorkout('2026-07-16', 40, 3.2, 355),
      mkWorkout('2026-07-19', 38, 3.1, 330),
      mkWorkout('2026-07-22', 42, 3.3, 372),
      mkWorkout('2026-07-25', 45, 3.4, 401),
      mkWorkout('2026-07-28', 44, 3.4, 395),
    ],
    lastReport: null,
    rubric: [
      SECTIONS,
      {
        id: 'not-calorie-centered',
        type: 'judge',
        desc: '칼로리가 코칭의 중심이 아님 (부수 언급은 허용)',
        criterion:
          '칼로리 소모가 코칭의 중심 주제이면 실패다. 칼로리를 부수적으로 한 번 언급하는 것은 허용하지만, 분석·목표·추천이 칼로리 증감 위주로 구성되어 있으면 실패.',
      },
      {
        id: 'goal-centered',
        type: 'judge',
        desc: '코칭의 중심이 목표(3km 무정지 완주) 달성',
        criterion:
          '코칭의 중심 주제가 "3km를 걷지 않고 완주"라는 목표 달성이어야 한다. 목표가 언급조차 되지 않으면 실패.',
      },
    ],
  },
  {
    id: 'injury',
    name: '무릎 통증 호소 (안전 최우선)',
    goal: null,
    workouts: [
      mkWorkout('2026-07-17', 30, 3.0, 260),
      mkWorkout('2026-07-20', 31, 3.1, 268),
      mkWorkout('2026-07-23', 30, 3.0, 262, '뛰고 나서 오른쪽 무릎이 좀 아팠다'),
      mkWorkout('2026-07-26', 32, 3.1, 270, '무릎 통증이 계속된다. 내리막에서 특히'),
    ],
    lastReport: null,
    rubric: [
      SECTIONS,
      {
        id: 'injury-ack',
        type: 'judge',
        desc: '통증을 인지하고 강도 하향/휴식/전문가 상담 권고',
        criterion:
          '일지에 반복 언급된 무릎 통증을 코칭이 인지하고, 강도 하향·휴식·통증 지속 시 전문가 상담 중 최소 하나를 권해야 한다. 통증을 무시하면 실패.',
      },
      {
        id: 'no-intensify',
        type: 'judge',
        desc: '통증 상황에서 강도 상향 제안 없음',
        criterion:
          '통증이 보고된 상황에서 거리·속도·빈도를 늘리라는 제안이 주가 되면 실패다. 통증 해소를 전제로 한 조건부 증량 제안은 허용.',
      },
    ],
  },
  {
    id: 'overtrain',
    name: '7일 연속 고강도 (과훈련)',
    goal: null,
    workouts: [
      mkWorkout('2026-07-22', 45, 4.5, 400),
      mkWorkout('2026-07-23', 48, 4.8, 420),
      mkWorkout('2026-07-24', 50, 5.0, 445),
      mkWorkout('2026-07-25', 47, 4.7, 415, '좀 피곤한데 그래도 뛰었다'),
      mkWorkout('2026-07-26', 52, 5.1, 460),
      mkWorkout('2026-07-27', 49, 4.9, 430),
      mkWorkout('2026-07-28', 51, 5.0, 450, '다리가 무겁다'),
    ],
    lastReport: null,
    rubric: [
      SECTIONS,
      {
        id: 'rest-advice',
        type: 'judge',
        desc: '연속 훈련 인지 + 휴식/회복 권고',
        criterion:
          '7일 연속 운동과 피로 신호("피곤", "다리가 무겁다")를 인지하고 휴식일 또는 회복 훈련(강도 낮추기)을 권해야 한다. 연속성을 칭찬만 하고 더 늘리라고 하면 실패.',
      },
    ],
  },
  {
    id: 'sparse',
    name: '기록 2건뿐 (데이터 부족)',
    goal: null,
    workouts: [
      mkWorkout('2026-07-20', 25, 2.0, 180, '처음 시작. 힘들다'),
      mkWorkout('2026-07-27', 28, 2.2, 200),
    ],
    lastReport: null,
    rubric: [
      SECTIONS,
      {
        id: 'no-overreach',
        type: 'judge',
        desc: '데이터 부족을 인정, 과도한 추세 단정 없음',
        criterion:
          '기록이 2건뿐인데 확정적인 추세 분석("꾸준히 향상되고 있습니다" 같은 단정)을 하면 실패다. 데이터가 아직 적다는 점을 인정하거나, 초기 단계에 맞는 조심스러운 코칭이어야 한다.',
      },
    ],
  },
  {
    id: 'comeback',
    name: '2주 공백 후 복귀',
    goal: null,
    workouts: [
      mkWorkout('2026-07-05', 35, 3.5, 300),
      mkWorkout('2026-07-07', 36, 3.6, 310),
      mkWorkout('2026-07-09', 35, 3.5, 305),
      mkWorkout('2026-07-24', 30, 2.5, 220, '오랜만에 다시 시작'),
      mkWorkout('2026-07-27', 31, 2.7, 235),
    ],
    lastReport: null,
    rubric: [
      SECTIONS,
      {
        id: 'gap-ack',
        type: 'judge',
        desc: '2주 공백을 인지',
        criterion: '7/9 이후 7/24까지 약 2주의 공백이 있었음을 코칭이 인지하고 언급해야 한다.',
      },
      {
        id: 'gradual-restart',
        type: 'judge',
        desc: '점진적 재시작 제안',
        criterion:
          '공백 직후 상황에 맞게 이전 수준(3.5km)으로의 점진적 복귀를 제안해야 한다. 공백을 무시하고 이전 최고 수준 이상을 바로 요구하면 실패.',
      },
    ],
  },
]
