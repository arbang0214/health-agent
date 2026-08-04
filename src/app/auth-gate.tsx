'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Status = 'loading' | 'authed' | 'anon'

// 전 페이지 클라이언트 인증 가드. 세션은 supabase-js가 localStorage에 보관·자동 갱신하므로
// 기기당 최초 1회 로그인 후에는 계속 유지된다.
// 실제 데이터 보호는 RLS(서버)가 담당 — 이 가드는 UX용 관문일 뿐이다.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    // 매직링크로 돌아온 직후에는 URL의 code 교환이 끝나야 세션이 생긴다 —
    // onAuthStateChange가 SIGNED_IN을 쏠 때까지 loading을 유지해 /login으로 튕기지 않게 한다.
    const hasAuthCode =
      typeof window !== 'undefined' &&
      (window.location.search.includes('code=') || window.location.hash.includes('access_token'))
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStatus('authed')
      else if (!hasAuthCode) setStatus('anon')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? 'authed' : 'anon')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (status === 'anon' && pathname !== '/login') router.replace('/login')
    if (status === 'authed' && pathname === '/login') router.replace('/')
  }, [status, pathname, router])

  if (pathname === '/login') return <>{children}</>
  if (status !== 'authed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50 to-emerald-100">
        <p className="text-sm text-gray-400">확인 중…</p>
      </div>
    )
  }
  return <>{children}</>
}
