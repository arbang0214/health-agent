'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// 이메일 + 6자리 숫자 PIN 로그인.
// 메일 발송이 없어 템플릿·수신 문제에서 자유롭고, 모바일 숫자판으로 입력이 빠르다.
// 계정·PIN은 관리자가 Supabase 대시보드(Authentication > Users > Add user)에서 만들어 전달한다.
// 세션은 supabase-js가 자동 유지 — 기기당 최초 1회만 로그인하면 된다.
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (signing || !email.trim() || pin.length < 6) return
    setSigning(true)
    setError('')
    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pin,
      })
      if (signInError) {
        setError(
          /invalid login credentials/i.test(signInError.message)
            ? '이메일 또는 코드가 맞지 않아요.'
            : `로그인 실패: ${signInError.message}`
        )
        return
      }
      // 성공 시 AuthGate의 onAuthStateChange가 캘린더로 보낸다
    } catch {
      setError('로그인에 실패했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setSigning(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-emerald-100">
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
        <h1 className="mb-1 text-center text-3xl font-extrabold text-emerald-900">🔥 런로그</h1>
        <p className="mb-8 text-center text-sm text-gray-500">러닝머신 기록 캘린더</p>

        <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-5 shadow-sm">
          <label className="mb-1 block text-xs font-bold text-gray-500" htmlFor="email">
            이메일
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mb-3 w-full rounded-xl border border-emerald-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
          />
          <label className="mb-1 block text-xs font-bold text-gray-500" htmlFor="pin">
            6자리 코드
          </label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••••"
            className="mb-4 w-full rounded-xl border border-emerald-200 px-3 py-2.5 text-center text-xl font-bold tracking-[0.4em] outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={signing || pin.length < 6}
            className="w-full rounded-xl bg-emerald-500 py-3 font-bold text-white shadow-sm disabled:opacity-50"
          >
            {signing ? '확인 중…' : '로그인'}
          </button>
          <p className="mt-3 text-center text-xs leading-relaxed text-gray-400">
            한 번 로그인하면 이 기기에서 계속 유지돼요.
            <br />
            코드를 잊었다면 관리자에게 재설정을 요청해주세요.
          </p>
          {error && <p className="mt-3 rounded-xl bg-red-50 p-2.5 text-xs text-red-600">{error}</p>}
        </form>
      </main>
    </div>
  )
}
