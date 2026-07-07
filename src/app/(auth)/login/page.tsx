'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SwallowMark } from '@/components/ui/SwallowMark'
import { Smartphone } from 'lucide-react'

const errorMessages: Record<string, string> = {
  missing_token: '認証トークンがありません。LINEから再度アクセスしてください。',
  invalid_token: '認証トークンが無効または期限切れです。LINEから再度アクセスしてください。',
  server_error: 'サーバーエラーが発生しました。しばらく経ってから再度お試しください。',
  auth: '認証に失敗しました。LINEから再度アクセスしてください。',
}

export default function LoginPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const error = searchParams.get('error')

  const [showTeacherLogin, setShowTeacherLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleTeacherLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoading(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setLoginError('メールアドレスまたはパスワードが正しくありません。')
        return
      }

      router.push('/')
    } catch {
      setLoginError('ログインに失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <SwallowMark className="w-16 h-10 mx-auto mb-3" />
          <h1 className="text-3xl font-extrabold text-ai">つばめSRS</h1>
          <p className="mt-2 text-ink-2">塾向けSRS学習アプリ</p>
        </div>

        {error && (
          <div className="rounded-card bg-again-bg p-4">
            <p className="text-sm text-again">
              {errorMessages[error] || '認証エラーが発生しました。'}
            </p>
          </div>
        )}

        <div className="rounded-card bg-sora-soft p-6 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-white flex items-center justify-center">
            <Smartphone className="w-6 h-6 text-sora" />
          </div>
          <p className="text-lg font-bold text-ai">
            LINEからログインしてください
          </p>
          <p className="text-sm text-ink-2">
            LINEメニューの「学習アプリ」ボタンからアクセスできます。
          </p>
        </div>

        {/* 講師用ログイン */}
        <div className="border-t border-gray-200 pt-6">
          <button
            onClick={() => setShowTeacherLogin(!showTeacherLogin)}
            className="w-full text-sm font-bold text-ink-3 hover:text-ink-2 flex items-center justify-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            講師用ログイン
            <span className={`transition-transform ${showTeacherLogin ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {showTeacherLogin && (
            <form onSubmit={handleTeacherLogin} className="mt-4 space-y-4">
              {loginError && (
                <div className="rounded-2xl bg-again-bg p-3">
                  <p className="text-sm text-again">{loginError}</p>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-ink-2">
                  メールアドレス
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-sora focus:ring-1 focus:ring-sora"
                  placeholder="example@email.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-ink-2">
                  パスワード
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-sora focus:ring-1 focus:ring-sora"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-sora px-4 py-3 text-sm font-bold text-white hover:bg-sora-dark transition-all active:scale-95 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              >
                {loading ? 'ログイン中...' : 'ログイン'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
