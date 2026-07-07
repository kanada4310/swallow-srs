'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, GraduationCap } from 'lucide-react'

type Role = 'student' | 'teacher'

export default function SetupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('student')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email!,
        name,
        role,
      })

    if (insertError) {
      setError('プロフィールの作成に失敗しました')
      setIsLoading(false)
      return
    }

    router.push('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-ai">初回設定</h1>
          <p className="mt-2 text-ink-2">プロフィールを設定してください</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-ink-2">
              名前
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-sora focus:border-sora"
              placeholder="山田 太郎"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-2 mb-2">
              役割
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setRole('student')}
                className={`p-4 border rounded-2xl text-center transition-colors ${
                  role === 'student'
                    ? 'border-sora bg-sora-soft text-sora'
                    : 'border-gray-300 text-ink-2 hover:border-gray-400'
                }`}
              >
                <BookOpen className="w-7 h-7 mx-auto mb-1" />
                <div className="font-bold">生徒</div>
              </button>
              <button
                type="button"
                onClick={() => setRole('teacher')}
                className={`p-4 border rounded-2xl text-center transition-colors ${
                  role === 'teacher'
                    ? 'border-sora bg-sora-soft text-sora'
                    : 'border-gray-300 text-ink-2 hover:border-gray-400'
                }`}
              >
                <GraduationCap className="w-7 h-7 mx-auto mb-1" />
                <div className="font-bold">講師</div>
              </button>
            </div>
          </div>

          {error && (
            <p className="text-again text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading || !name}
            className="w-full py-3 px-4 rounded-2xl font-bold text-white bg-sora hover:bg-sora-dark transition-all active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '設定中...' : '設定を完了'}
          </button>
        </form>
      </div>
    </div>
  )
}
