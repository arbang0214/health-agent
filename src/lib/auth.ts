import { createClient } from '@/lib/supabase/client'

// 서버 API 라우트(/api/coach, /api/goal/detect) 호출 시 첨부할 인증 헤더.
// 서버는 이 토큰으로 supabase 클라이언트를 만들어 RLS가 호출자 기준으로 적용된다.
export async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function signOut(): Promise<void> {
  const supabase = createClient()
  await supabase.auth.signOut()
}
