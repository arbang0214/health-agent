'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError('')
    try {
      const supabase = createClient()
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          // 가입 개방 안 함 — 사전 등록된 이메일만 로그인 가능 (사용자 추가는 Supabase 대시보드)
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin,
        },
      })
      if (otpError) {
        // Supabase는 미등록 이메일 + shouldCreateUser:false 조합에서 signups not allowed 오류를 낸다
        setError(
          /signup|not allowed|not found/i.test(otpError.message)
            ? '등록되지 않은 이메일이에요. 관리자에게 등록을 요청해주세요.'
            : `로그인 메일 발송 실패: ${otpError.message}`
        )
        return
      }
      setSent(true)
    } catch {
      setError('로그인 메일 발송에 실패했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-emerald-100">
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
        <h1 className="mb-1 text-center text-3xl font-extrabold text-emerald-900">🔥 런로그</h1>
        <p className="mb-8 text-center text-sm text-gray-500">러닝머신 기록 캘린더</p>

        {sent ? (
          <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
            <p className="text-4xl">📮</p>
            <p className="mt-3 font-bold text-emerald-900">로그인 링크를 보냈어요</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              <span className="font-bold">{email.trim()}</span> 메일함에서 링크를 눌러주세요.
              <br />
              지금 이 브라우저에서 열어야 로그인돼요.
            </p>
            <button
              onClick={() => setSent(false)}
              className="mt-4 text-xs font-bold text-emerald-600"
            >
              다른 이메일로 다시 보내기
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-5 shadow-sm">
            <label className="mb-1 block text-xs font-bold text-gray-500" htmlFor="email">
              이메일
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mb-3 w-full rounded-xl border border-emerald-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-xl bg-emerald-500 py-3 font-bold text-white shadow-sm disabled:opacity-50"
            >
              {sending ? '보내는 중…' : '로그인 링크 받기'}
            </button>
            <p className="mt-3 text-center text-xs leading-relaxed text-gray-400">
              비밀번호 없이 메일 링크로 로그인해요.
              <br />한 번 로그인하면 이 기기에서 계속 유지돼요.
            </p>
            {error && <p className="mt-3 rounded-xl bg-red-50 p-2.5 text-xs text-red-600">{error}</p>}
          </form>
        )}
      </main>
    </div>
  )
}
