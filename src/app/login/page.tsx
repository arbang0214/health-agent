'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  // 메일 앱이 링크를 다른 브라우저로 여는 문제 대응: 같은 메일의 6자리 코드를
  // 이 화면에 입력하면 요청한 브라우저에서 바로 로그인된다 (verifyOtp).
  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    const token = code.trim()
    if (token.length < 6 || verifying) return
    setVerifying(true)
    setError('')
    try {
      const supabase = createClient()
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: 'email',
      })
      if (verifyError) {
        setError(
          /expired|invalid/i.test(verifyError.message)
            ? '코드가 틀렸거나 만료됐어요. 다시 확인하거나 새 메일을 요청해주세요.'
            : `로그인 실패: ${verifyError.message}`
        )
        return
      }
      // 성공 시 AuthGate의 onAuthStateChange가 캘린더로 보낸다
    } catch {
      setError('로그인에 실패했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setVerifying(false)
    }
  }

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
            <p className="mt-3 font-bold text-emerald-900">로그인 메일을 보냈어요</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              <span className="font-bold">{email.trim()}</span> 메일에 적힌
              <br />
              <span className="font-bold text-emerald-700">6자리 코드</span>를 입력해주세요.
            </p>
            <form onSubmit={handleVerifyCode} className="mt-4">
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-40 rounded-xl border border-emerald-200 px-3 py-2.5 text-center text-xl font-bold tracking-[0.3em] outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={verifying || code.length < 6}
                className="mt-3 w-full rounded-xl bg-emerald-500 py-3 font-bold text-white shadow-sm disabled:opacity-50"
              >
                {verifying ? '확인 중…' : '로그인'}
              </button>
            </form>
            <p className="mt-3 text-xs text-gray-400">
              메일의 링크를 이 브라우저에서 열어도 로그인돼요.
            </p>
            {error && (
              <p className="mt-3 rounded-xl bg-red-50 p-2.5 text-xs text-red-600">{error}</p>
            )}
            <button
              onClick={() => {
                setSent(false)
                setCode('')
                setError('')
              }}
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
              비밀번호 없이 메일로 받은 코드로 로그인해요.
              <br />한 번 로그인하면 이 기기에서 계속 유지돼요.
            </p>
            {error && <p className="mt-3 rounded-xl bg-red-50 p-2.5 text-xs text-red-600">{error}</p>}
          </form>
        )}
      </main>
    </div>
  )
}
