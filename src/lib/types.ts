export type Workout = {
  id: string
  user_id: string
  taken_at: string // ISO 문자열
  duration_min: number | null
  distance_km: number | null
  calories: number | null
  analyzed_at: string | null
  journal: string | null // 자유 텍스트 운동 일지
  photo_path: string
  created_at: string
}

export type Goal = {
  id: string
  created_at: string // ISO 문자열
  content: string // 목표 자유 텍스트 (예: "3km를 걷지 않고 완주하기")
  source: 'manual' | 'journal' // 직접 설정 | 운동 일지에서 변경 감지
}

export type CoachReport = {
  id: string
  created_at: string // ISO 문자열
  content: string // 분석 리포트 (일반 텍스트, 이모지 섹션 제목)
}
