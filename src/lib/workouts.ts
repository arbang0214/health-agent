import { createClient } from '@/lib/supabase/client'
import type { Workout } from '@/lib/types'

const BUCKET = 'photos'

export async function addWorkout(photo: Blob, takenAt: Date): Promise<void> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다')

  const path = `${user.id}/${crypto.randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, photo, { contentType: 'image/jpeg' })
  if (uploadError) throw new Error(`사진 업로드 실패: ${uploadError.message}`)

  const { error: insertError } = await supabase
    .from('workouts')
    .insert({ taken_at: takenAt.toISOString(), photo_path: path })
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(`기록 저장 실패: ${insertError.message}`)
  }
}

export async function listWorkouts(from: Date, to: Date): Promise<Workout[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .gte('taken_at', from.toISOString())
    .lte('taken_at', to.toISOString())
    .order('taken_at', { ascending: true })
  if (error) throw new Error(`기록 조회 실패: ${error.message}`)
  return (data ?? []) as Workout[]
}

export async function deleteWorkout(w: Workout): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('workouts').delete().eq('id', w.id)
  if (error) throw new Error(`삭제 실패: ${error.message}`)
  await supabase.storage.from(BUCKET).remove([w.photo_path])
}

export async function getPhotoUrl(path: string): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !data) throw new Error(`사진 URL 생성 실패: ${error?.message ?? '알 수 없는 오류'}`)
  return data.signedUrl
}
