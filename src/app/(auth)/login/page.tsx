'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">つばめSRS</h1>
          <p className="mt-2 text-gray-600">塾向けSRS学習アプリ</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-700">
              {errorMessages[error] || '認証エラーが発生しました。'}
            </p>
          </div>
        )}

        <div className="rounded-lg bg-blue-50 border border-blue-200 p-6 text-center space-y-3">
          <div className="text-4xl">📱</div>
          <p className="text-lg font-medium text-blue-900">
            LINEからログインしてください
          </p>
          <p className="text-sm text-blue-700">
            LINEメニューの「学習アプリ」ボタンからアクセスできます。
          </p>
        </div>

        {/* 講師用ログイン */}
        <div className="border-t border-gray-200 pt-6">
          <button
            onClick={() => setShowTeacherLogin(!showTeacherLogin)}
            className="w-full text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1"
          >
            講師用ログイン
            <span className={`transition-transform ${showTeacherLogin ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {showTeacherLogin && (
            <form onSubmit={handleTeacherLogin} className="mt-4 space-y-4">
              {loginError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-sm text-red-700">{loginError}</p>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  メールアドレス
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="example@email.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  パスワード
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
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
