export type Workout = {
  id: string
  user_id: string
  taken_at: string // ISO 문자열
  duration_min: number | null
  distance_km: number | null
  calories: number | null
  analyzed_at: string | null
  photo_path: string
  created_at: string
}
