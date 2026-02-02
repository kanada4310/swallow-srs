'use client'

import { useState } from 'react'
import Link from 'next/link'

interface ClassData {
  id: string
  name: string
  memberCount: number
  created_at: string
}

interface StudentsClientProps {
  initialClasses: ClassData[]
}

export function StudentsClient({ initialClasses }: StudentsClientProps) {
  const [classes, setClasses] = useState<ClassData[]>(initialClasses)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClassName.trim()) return

    setIsCreating(true)
    setError(null)

    try {
      const response = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClassName.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create class')
      }

      setClasses([{ ...data.class, memberCount: 0 }, ...classes])
      setNewClassName('')
      setShowCreateModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create class')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">クラス管理</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          新規クラス作成
        </button>
      </div>

      {/* Class List */}
      {classes.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-gray-900 mb-2">クラスがありません</h2>
          <p className="text-gray-500 mb-4">
            新規クラスを作成して、生徒を追加しましょう。
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            最初のクラスを作成
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {classes.map((classData) => (
            <Link
              key={classData.id}
              href={`/students/class/${classData.id}`}
              className="block bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-blue-300 hover:shadow transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{classData.name}</h3>
                  <p className="text-sm text-gray-500">
                    {classData.memberCount}人の生徒
                  </p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Class Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">新規クラス作成</h2>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateClass}>
                <div className="mb-4">
                  <label htmlFor="className" className="block text-sm font-medium text-gray-700 mb-1">
                    クラス名
                  </label>
                  <input
                    type="text"
                    id="className"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="例: 高3理系A"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                    required
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false)
                      setNewClassName('')
                      setError(null)
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                    disabled={isCreating}
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    disabled={isCreating || !newClassName.trim()}
                  >
                    {isCreating ? '作成中...' : '作成'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
