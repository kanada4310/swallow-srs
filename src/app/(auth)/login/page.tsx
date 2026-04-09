'use client'

import { useSearchParams } from 'next/navigation'

const errorMessages: Record<string, string> = {
  missing_token: '認証トークンがありません。LINEから再度アクセスしてください。',
  invalid_token: '認証トークンが無効または期限切れです。LINEから再度アクセスしてください。',
  server_error: 'サーバーエラーが発生しました。しばらく経ってから再度お試しください。',
  auth: '認証に失敗しました。LINEから再度アクセスしてください。',
}

export default function LoginPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

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
      </div>
    </div>
  )
}
