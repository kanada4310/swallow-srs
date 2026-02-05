'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { NoteEditor } from '@/components/deck/NoteEditor'
import { NoteBrowser } from '@/components/deck/NoteBrowser'
import { NoteEditModal } from '@/components/deck/NoteEditModal'
import { CSVImporter } from '@/components/deck/CSVImporter'
import { BulkExampleGenerator } from '@/components/ai/ExampleGenerator'
import { OCRImporter } from '@/components/ai/OCRImporter'
import { createClient } from '@/lib/supabase/client'
import type { NoteType } from '@/types/database'
import type { BrowsableNote } from '@/components/deck/NoteCard'

interface ClassInfo {
  id: string
  name: string
}

interface StudentInfo {
  id: string
  name: string
  email: string
}

interface Assignment {
  id: string
  deckId: string
  assignedAt: string
  type: 'class' | 'individual'
  target: {
    id: string
    name: string
    email?: string
  }
}

interface DeckDetailClientProps {
  deckId: string
  notes: BrowsableNote[]
  totalNoteCount: number
  noteTypes: NoteType[]
  deckTags?: string[]
  canEdit: boolean
}

export function DeckDetailClient({ deckId, notes: initialNotes, totalNoteCount: initialTotal, noteTypes, deckTags, canEdit }: DeckDetailClientProps) {
  const router = useRouter()
  const [notes, setNotes] = useState<BrowsableNote[]>(initialNotes)
  const [totalNoteCount, setTotalNoteCount] = useState(initialTotal)
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [showDistributeModal, setShowDistributeModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showBulkGenerateModal, setShowBulkGenerateModal] = useState(false)
  const [showOCRModal, setShowOCRModal] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [editingNote, setEditingNote] = useState<BrowsableNote | null>(null)
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null)
  const [showDeckDeleteConfirm, setShowDeckDeleteConfirm] = useState(false)
  const [isDeletingDeck, setIsDeletingDeck] = useState(false)
  const [deckDeleteError, setDeckDeleteError] = useState<string | null>(null)

  const refreshNotes = useCallback(async () => {
    const supabase = createClient()
    // Try with tags column first; fall back without if migration 008 hasn't been run
    const withTags = await supabase
      .from('notes')
      .select(`
        id,
        field_values,
        note_type_id,
        generated_content,
        tags,
        created_at,
        cards (id)
      `, { count: 'exact' })
      .eq('deck_id', deckId)
      .order('created_at', { ascending: false })
      .range(0, 49)

    if (withTags.error && withTags.error.message?.includes('tags')) {
      const fallback = await supabase
        .from('notes')
        .select(`
          id,
          field_values,
          note_type_id,
          generated_content,
          created_at,
          cards (id)
        `, { count: 'exact' })
        .eq('deck_id', deckId)
        .order('created_at', { ascending: false })
        .range(0, 49)

      if (fallback.data) {
        setNotes(fallback.data as unknown as BrowsableNote[])
        setTotalNoteCount(fallback.count || 0)
      }
    } else if (withTags.data) {
      setNotes(withTags.data as BrowsableNote[])
      setTotalNoteCount(withTags.count || 0)
    }
  }, [deckId])

  const handleNoteAdded = () => {
    setIsAddingNote(false)
    refreshNotes()
  }

  const handleImportComplete = () => {
    setShowImportModal(false)
    refreshNotes()
  }

  const handleBulkGenerateComplete = () => {
    setShowBulkGenerateModal(false)
    refreshNotes()
  }

  const handleOCRComplete = () => {
    setShowOCRModal(false)
    refreshNotes()
  }

  const handleDeleteNote = async (noteId: string) => {
    setDeletingNoteId(noteId)
    try {
      const response = await fetch(`/api/notes/${noteId}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '削除に失敗しました')
      }
      // Clean up IndexedDB in background
      import('@/lib/db/schema').then(({ deleteNoteLocally }) => {
        deleteNoteLocally(noteId).catch(console.error)
      })
    } catch (err) {
      throw err
    } finally {
      setDeletingNoteId(null)
    }
  }

  const handleBulkDelete = async (noteIds: string[]) => {
    const response = await fetch('/api/notes/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteIds, deckId }),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || '削除に失敗しました')
    }
    // Clean up IndexedDB in background
    import('@/lib/db/schema').then(({ deleteNotesLocally }) => {
      deleteNotesLocally(noteIds).catch(console.error)
    })
  }

  const handleEditNoteSave = (updatedNote: BrowsableNote) => {
    setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n))
    setEditingNote(null)
  }

  const handleDeleteDeck = async () => {
    setIsDeletingDeck(true)
    setDeckDeleteError(null)
    try {
      const response = await fetch(`/api/decks/${deckId}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'デッキの削除に失敗しました')
      }
      // Clean up IndexedDB in background
      import('@/lib/db/schema').then(({ deleteDeckLocally }) => {
        deleteDeckLocally(deckId).catch(console.error)
      })
      // Navigate to deck list
      router.push('/decks')
    } catch (err) {
      setDeckDeleteError(err instanceof Error ? err.message : 'デッキの削除に失敗しました')
      setIsDeletingDeck(false)
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const response = await fetch(`/api/decks/${deckId}/export`)
      if (!response.ok) {
        const data = await response.json()
        alert(data.error || 'エクスポートに失敗しました')
        return
      }
      const blob = await response.blob()
      const contentDisposition = response.headers.get('Content-Disposition') || ''
      const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+?)(?:;|$)/)
      const filename = filenameMatch
        ? decodeURIComponent(filenameMatch[1])
        : `export_${new Date().toISOString().split('T')[0]}.csv`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert('エクスポートに失敗しました')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div>
      {/* Action Buttons for Teachers */}
      {canEdit && (
        <div className="mb-6 flex flex-wrap gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex-1 min-w-[140px] py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            CSVインポート
          </button>
          <button
            onClick={() => setShowDistributeModal(true)}
            className="flex-1 min-w-[140px] py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            配布設定
          </button>
          <button
            onClick={() => setShowOCRModal(true)}
            className="flex-1 min-w-[140px] py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            写真から読み取り
          </button>
          <button
            onClick={() => setShowBulkGenerateModal(true)}
            disabled={notes.length === 0}
            className="flex-1 min-w-[140px] py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            AI生成
          </button>
          <button
            onClick={handleExport}
            disabled={notes.length === 0 || isExporting}
            className="flex-1 min-w-[140px] py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {isExporting ? 'エクスポート中...' : 'CSVエクスポート'}
          </button>
        </div>
      )}

      {/* Add Note Section */}
      {canEdit && (
        <div className="mb-6">
          {isAddingNote ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">ノートを追加</h2>
              <NoteEditor
                deckId={deckId}
                noteTypes={noteTypes}
                onNoteAdded={handleNoteAdded}
                onCancel={() => setIsAddingNote(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setIsAddingNote(true)}
              className="w-full py-3 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              ノートを追加
            </button>
          )}
        </div>
      )}

      {/* Notes Browser (search, filter, sort, pagination, select/delete) */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">ノート一覧</h2>
        <NoteBrowser
          deckId={deckId}
          initialNotes={notes}
          initialTotal={totalNoteCount}
          noteTypes={noteTypes}
          deckTags={deckTags}
          canEdit={canEdit}
          onEditNote={(note) => setEditingNote(note)}
          onDeleteNote={handleDeleteNote}
          onBulkDelete={handleBulkDelete}
          deletingNoteId={deletingNoteId}
        />
      </div>

      {/* Note Edit Modal */}
      {editingNote && (
        <NoteEditModal
          note={editingNote}
          noteType={noteTypes.find(nt => nt.id === editingNote.note_type_id) || noteTypes[0]}
          deckTags={deckTags}
          onSave={handleEditNoteSave}
          onClose={() => setEditingNote(null)}
        />
      )}

      {/* Distribution Modal */}
      {showDistributeModal && (
        <DistributeModal
          deckId={deckId}
          onClose={() => setShowDistributeModal(false)}
        />
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">CSVインポート</h2>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <CSVImporter
                deckId={deckId}
                noteTypes={noteTypes}
                onImportComplete={handleImportComplete}
                onCancel={() => setShowImportModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Bulk Example Generation Modal */}
      {showBulkGenerateModal && (
        <BulkExampleGenerator
          deckId={deckId}
          notes={notes}
          noteTypes={noteTypes}
          onComplete={handleBulkGenerateComplete}
          onClose={() => setShowBulkGenerateModal(false)}
        />
      )}

      {/* OCR Import Modal */}
      {showOCRModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">写真から単語を読み取り</h2>
                <button
                  onClick={() => setShowOCRModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <OCRImporter
                deckId={deckId}
                noteTypes={noteTypes}
                onImportComplete={handleOCRComplete}
                onCancel={() => setShowOCRModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Deck Delete Section */}
      {canEdit && (
        <div className="mt-10 pt-6 border-t border-gray-200">
          <button
            onClick={() => setShowDeckDeleteConfirm(true)}
            className="text-sm text-red-500 hover:text-red-700 transition-colors"
          >
            このデッキを削除
          </button>
        </div>
      )}

      {/* Deck Delete Confirmation Modal */}
      {showDeckDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">デッキを削除</h3>
            <p className="text-sm text-gray-600 mb-1">
              このデッキを削除しますか？
            </p>
            <p className="text-sm text-red-600 mb-4">
              デッキ内のすべてのノート・カード・学習記録が完全に削除されます。この操作は元に戻せません。
            </p>
            {deckDeleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {deckDeleteError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeckDeleteConfirm(false)
                  setDeckDeleteError(null)
                }}
                disabled={isDeletingDeck}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleDeleteDeck}
                disabled={isDeletingDeck}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeletingDeck ? '削除中...' : 'デッキを削除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DistributeModal({ deckId, onClose }: { deckId: string; onClose: () => void }) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [students, setStudents] = useState<StudentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [assignType, setAssignType] = useState<'class' | 'individual'>('class')
  const [selectedId, setSelectedId] = useState('')
  const [isAssigning, setIsAssigning] = useState(false)
  const [isRemoving, setIsRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  const loadData = async () => {
    setLoading(true)
    try {
      const [assignmentsRes, classesRes, studentsRes] = await Promise.all([
        fetch(`/api/deck-assignments?deckId=${deckId}`),
        fetch('/api/classes'),
        fetch('/api/students'),
      ])

      const assignmentsData = await assignmentsRes.json()
      const classesData = await classesRes.json()
      const studentsData = await studentsRes.json()

      setAssignments(assignmentsData.assignments || [])
      setClasses(classesData.classes || [])
      setStudents(studentsData.students || [])
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAssign = async () => {
    if (!selectedId) return

    setIsAssigning(true)
    setError(null)

    try {
      const body = assignType === 'class'
        ? { deckId, classId: selectedId }
        : { deckId, userId: selectedId }

      const response = await fetch('/api/deck-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to assign deck')
      }

      // Reload data
      await loadData()
      setSelectedId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign deck')
    } finally {
      setIsAssigning(false)
    }
  }

  const handleRemove = async (assignmentId: string) => {
    setIsRemoving(assignmentId)

    try {
      const response = await fetch(`/api/deck-assignments?id=${assignmentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to remove assignment')
      }

      setAssignments(assignments.filter(a => a.id !== assignmentId))
    } catch (err) {
      console.error('Error removing assignment:', err)
    } finally {
      setIsRemoving(null)
    }
  }

  // Filter out already assigned items
  const assignedClassIds = new Set(assignments.filter(a => a.type === 'class').map(a => a.target.id))
  const assignedUserIds = new Set(assignments.filter(a => a.type === 'individual').map(a => a.target.id))
  const availableClasses = classes.filter(c => !assignedClassIds.has(c.id))
  const availableStudents = students.filter(s => !assignedUserIds.has(s.id))

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">デッキの配布設定</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Current Assignments */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">現在の配布先</h3>
                {assignments.length === 0 ? (
                  <p className="text-sm text-gray-500">まだ配布されていません</p>
                ) : (
                  <ul className="space-y-2">
                    {assignments.map((assignment) => (
                      <li
                        key={assignment.id}
                        className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                      >
                        <div>
                          <span className={`text-xs px-2 py-0.5 rounded-full mr-2 ${
                            assignment.type === 'class'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {assignment.type === 'class' ? 'クラス' : '個人'}
                          </span>
                          <span className="text-sm text-gray-900">{assignment.target.name}</span>
                          {assignment.target.email && (
                            <span className="text-xs text-gray-500 ml-1">({assignment.target.email})</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemove(assignment.id)}
                          disabled={isRemoving === assignment.id}
                          className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          {isRemoving === assignment.id ? '削除中...' : '削除'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Add New Assignment */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">新規配布先を追加</h3>

                {error && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                  </div>
                )}

                {/* Type Selector */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => {
                      setAssignType('class')
                      setSelectedId('')
                    }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      assignType === 'class'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    クラスに配布
                  </button>
                  <button
                    onClick={() => {
                      setAssignType('individual')
                      setSelectedId('')
                    }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      assignType === 'individual'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    個人に配布
                  </button>
                </div>

                {/* Selection Dropdown */}
                {assignType === 'class' ? (
                  availableClasses.length === 0 ? (
                    <p className="text-sm text-gray-500 mb-3">配布可能なクラスがありません</p>
                  ) : (
                    <select
                      value={selectedId}
                      onChange={(e) => setSelectedId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
                    >
                      <option value="">クラスを選択</option>
                      {availableClasses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )
                ) : (
                  availableStudents.length === 0 ? (
                    <p className="text-sm text-gray-500 mb-3">配布可能な生徒がいません</p>
                  ) : (
                    <select
                      value={selectedId}
                      onChange={(e) => setSelectedId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
                    >
                      <option value="">生徒を選択</option>
                      {availableStudents.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                      ))}
                    </select>
                  )
                )}

                <button
                  onClick={handleAssign}
                  disabled={!selectedId || isAssigning}
                  className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAssigning ? '配布中...' : '配布する'}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
