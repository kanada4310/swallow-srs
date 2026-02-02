'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Member {
  id: string
  name: string
  email: string
  joinedAt: string
}

interface Student {
  id: string
  name: string
  email: string
}

interface ClassDetailClientProps {
  classId: string
  className: string
  initialMembers: Member[]
  availableStudents: Student[]
}

export function ClassDetailClient({
  classId,
  className,
  initialMembers,
  availableStudents: initialAvailableStudents,
}: ClassDetailClientProps) {
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [availableStudents, setAvailableStudents] = useState<Student[]>(initialAvailableStudents)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [isRemoving, setIsRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(className)
  const [isSavingName, setIsSavingName] = useState(false)

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStudentId && !emailInput.trim()) return

    setIsAdding(true)
    setError(null)

    try {
      const body = selectedStudentId
        ? { userId: selectedStudentId }
        : { email: emailInput.trim() }

      const response = await fetch(`/api/classes/${classId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add member')
      }

      // Add to members list
      setMembers([
        ...members,
        {
          id: data.member.id,
          name: data.member.name,
          email: data.member.email,
          joinedAt: new Date().toISOString(),
        },
      ])

      // Remove from available students
      setAvailableStudents(availableStudents.filter(s => s.id !== data.member.id))

      setSelectedStudentId('')
      setEmailInput('')
      setShowAddModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setIsAdding(false)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    setIsRemoving(memberId)

    try {
      const response = await fetch(`/api/classes/${classId}/members?userId=${memberId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to remove member')
      }

      // Find the removed member to add back to available
      const removedMember = members.find(m => m.id === memberId)

      // Remove from members
      setMembers(members.filter(m => m.id !== memberId))

      // Add back to available students
      if (removedMember) {
        setAvailableStudents([
          ...availableStudents,
          { id: removedMember.id, name: removedMember.name, email: removedMember.email },
        ].sort((a, b) => a.name.localeCompare(b.name)))
      }
    } catch (err) {
      console.error('Error removing member:', err)
    } finally {
      setIsRemoving(null)
    }
  }

  const handleDeleteClass = async () => {
    setIsDeleting(true)

    try {
      const response = await fetch(`/api/classes/${classId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete class')
      }

      router.push('/students')
    } catch (err) {
      console.error('Error deleting class:', err)
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleSaveName = async () => {
    if (!newName.trim() || newName === className) {
      setEditingName(false)
      return
    }

    setIsSavingName(true)

    try {
      const response = await fetch(`/api/classes/${classId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update class name')
      }

      router.refresh()
      setEditingName(false)
    } catch (err) {
      console.error('Error updating class name:', err)
    } finally {
      setIsSavingName(false)
    }
  }

  return (
    <div>
      {/* Class Info Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between">
          {editingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 px-3 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              <button
                onClick={handleSaveName}
                disabled={isSavingName}
                className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                保存
              </button>
              <button
                onClick={() => {
                  setEditingName(false)
                  setNewName(className)
                }}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                キャンセル
              </button>
            </div>
          ) : (
            <>
              <div>
                <p className="text-lg font-medium text-gray-900">{members.length}人の生徒</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingName(true)}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  名前を編集
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-700 border border-red-300 rounded-lg hover:bg-red-50"
                >
                  クラスを削除
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Members Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">生徒一覧</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            生徒を追加
          </button>
        </div>

        {members.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-gray-500">まだ生徒がいません</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              最初の生徒を追加
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {members.map((member) => (
              <li key={member.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{member.name}</p>
                  <p className="text-sm text-gray-500">{member.email}</p>
                </div>
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  disabled={isRemoving === member.id}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-700 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
                >
                  {isRemoving === member.id ? '削除中...' : '削除'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">生徒を追加</h2>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleAddMember}>
                {availableStudents.length > 0 && (
                  <div className="mb-4">
                    <label htmlFor="student" className="block text-sm font-medium text-gray-700 mb-1">
                      登録済みの生徒から選択
                    </label>
                    <select
                      id="student"
                      value={selectedStudentId}
                      onChange={(e) => {
                        setSelectedStudentId(e.target.value)
                        if (e.target.value) setEmailInput('')
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">選択してください</option>
                      {availableStudents.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name} ({student.email})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="mb-4">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    {availableStudents.length > 0 ? 'または、メールアドレスで追加' : 'メールアドレス'}
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value)
                      if (e.target.value) setSelectedStudentId('')
                    }}
                    placeholder="student@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={!!selectedStudentId}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false)
                      setSelectedStudentId('')
                      setEmailInput('')
                      setError(null)
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                    disabled={isAdding}
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    disabled={isAdding || (!selectedStudentId && !emailInput.trim())}
                  >
                    {isAdding ? '追加中...' : '追加'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">クラスを削除</h2>
              <p className="text-gray-600 mb-6">
                「{className}」を削除しますか？この操作は取り消せません。
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={isDeleting}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleDeleteClass}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  disabled={isDeleting}
                >
                  {isDeleting ? '削除中...' : '削除'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
