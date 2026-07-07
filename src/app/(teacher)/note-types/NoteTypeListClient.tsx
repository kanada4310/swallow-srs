'use client'

import { useState } from 'react'
import Link from 'next/link'

interface NoteTypeWithCount {
  id: string
  name: string
  owner_id: string | null
  fields: Array<{ name: string; ord: number }>
  is_system: boolean
  template_count: number
  created_at: string
}

interface NoteTypeListClientProps {
  initialNoteTypes: NoteTypeWithCount[]
}

export function NoteTypeListClient({ initialNoteTypes }: NoteTypeListClientProps) {
  const [noteTypes, setNoteTypes] = useState(initialNoteTypes)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const systemNoteTypes = noteTypes.filter(nt => nt.is_system)
  const customNoteTypes = noteTypes.filter(nt => !nt.is_system)

  const handleDelete = async (noteTypeId: string) => {
    setDeletingId(noteTypeId)
    setDeleteError(null)
    try {
      const response = await fetch(`/api/note-types/${noteTypeId}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || '削除に失敗しました')
      }
      // Optimistic update
      setNoteTypes(prev => prev.filter(nt => nt.id !== noteTypeId))
      setShowDeleteConfirm(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '削除に失敗しました')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      {/* Delete Error */}
      {deleteError && (
        <div className="mb-4 p-3 bg-again-bg border border-again/20 rounded-2xl text-again text-sm flex items-center justify-between">
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="text-again hover:opacity-70 ml-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* System Note Types */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-ai mb-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          システムノートタイプ
        </h2>
        <div className="space-y-3">
          {systemNoteTypes.map(noteType => (
            <NoteTypeCard key={noteType.id} noteType={noteType} isSystem />
          ))}
        </div>
      </section>

      {/* Custom Note Types */}
      <section>
        <h2 className="text-lg font-bold text-ai mb-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
          </svg>
          カスタムノートタイプ
        </h2>
        {customNoteTypes.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-card border-2 border-dashed border-gray-200">
            <svg className="w-12 h-12 mx-auto text-ink-3 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-ink-2 mb-4">カスタムノートタイプがありません</p>
            <Link
              href="/note-types/new"
              className="inline-flex items-center gap-2 px-4 py-2 text-sora hover:text-sora-dark font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新しいノートタイプを作成
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {customNoteTypes.map(noteType => (
              <NoteTypeCard
                key={noteType.id}
                noteType={noteType}
                onDelete={() => setShowDeleteConfirm(noteType.id)}
                isDeleting={deletingId === noteType.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-card shadow-card max-w-md w-full p-6">
            <h3 className="text-lg font-extrabold text-ai mb-2">ノートタイプを削除</h3>
            <p className="text-sm text-ink-2 mb-4">
              このノートタイプを削除しますか？この操作は元に戻せません。
            </p>
            <p className="text-xs text-ink-3 mb-4">
              ノートタイプを使用しているノートがある場合、削除できません。
            </p>
            {deleteError && (
              <div className="mb-4 p-3 bg-again-bg border border-again/20 rounded-2xl text-again text-sm">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(null)
                  setDeleteError(null)
                }}
                disabled={deletingId !== null}
                className="px-4 py-2 text-sm font-bold text-ink-2 border border-gray-300 rounded-2xl hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                disabled={deletingId !== null}
                className="px-4 py-2 text-sm font-bold text-white bg-again rounded-2xl hover:opacity-90 disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              >
                {deletingId !== null ? '削除中...' : '削除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function NoteTypeCard({
  noteType,
  isSystem = false,
  onDelete,
  isDeleting,
}: {
  noteType: NoteTypeWithCount
  isSystem?: boolean
  onDelete?: () => void
  isDeleting?: boolean
}) {
  const fieldNames = noteType.fields.map(f => f.name).join(', ')

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:border-sora transition-colors">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-ai">{noteType.name}</h3>
            {isSystem && (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold bg-gray-100 text-ink-2">
                システム
              </span>
            )}
          </div>
          <p className="text-sm text-ink-2 mt-1">
            フィールド: {fieldNames}
          </p>
          <p className="text-xs text-ink-3 mt-1 tabular-nums">
            テンプレート数: {noteType.template_count}
          </p>
        </div>
        <div className="flex gap-2">
          {isSystem ? (
            <Link
              href={`/note-types/${noteType.id}`}
              className="px-3 py-1.5 text-sm font-bold text-ink-2 hover:text-ai border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              詳細を見る
            </Link>
          ) : (
            <>
              <Link
                href={`/note-types/${noteType.id}`}
                className="px-3 py-1.5 text-sm font-bold text-sora hover:text-sora-dark border-2 border-sora rounded-2xl hover:bg-sora-soft transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              >
                編集
              </Link>
              <button
                onClick={onDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 text-sm font-bold bg-again-bg text-again rounded-2xl hover:opacity-80 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              >
                {isDeleting ? '削除中...' : '削除'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
