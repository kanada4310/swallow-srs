'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { NoteEditor } from '@/components/deck/NoteEditor'
import type { NoteType } from '@/types/database'

interface Note {
  id: string
  field_values: Record<string, string>
  note_type_id: string
  created_at: string
  cards: Array<{ id: string }>
}

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
  notes: Note[]
  noteTypes: NoteType[]
  canEdit: boolean
}

export function DeckDetailClient({ deckId, notes, noteTypes, canEdit }: DeckDetailClientProps) {
  const router = useRouter()
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [showDistributeModal, setShowDistributeModal] = useState(false)

  const handleNoteAdded = () => {
    setIsAddingNote(false)
    router.refresh() // Refresh to show new note
  }

  // Note type name lookup
  const noteTypeNames: Record<string, string> = {}
  for (const nt of noteTypes) {
    noteTypeNames[nt.id] = nt.name
  }

  return (
    <div>
      {/* Action Buttons for Teachers */}
      {canEdit && (
        <div className="mb-6 flex gap-3">
          <button
            onClick={() => setShowDistributeModal(true)}
            className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            配布設定
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

      {/* Notes List */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          ノート一覧
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({notes.length}件)
          </span>
        </h2>

        {notes.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500">
              {canEdit
                ? 'ノートがありません。上のボタンから追加してください。'
                : 'まだノートがありません。'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                noteTypeName={noteTypeNames[note.note_type_id] || 'Unknown'}
              />
            ))}
          </div>
        )}
      </div>

      {/* Distribution Modal */}
      {showDistributeModal && (
        <DistributeModal
          deckId={deckId}
          onClose={() => setShowDistributeModal(false)}
        />
      )}
    </div>
  )
}

function NoteCard({ note, noteTypeName }: { note: Note; noteTypeName: string }) {
  // Get first two fields for display
  const fieldEntries = Object.entries(note.field_values).slice(0, 2)
  const cardCount = note.cards?.length || 0

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {fieldEntries.map(([key, value], idx) => (
            <div key={key} className={idx === 0 ? 'font-medium text-gray-900 truncate' : 'text-sm text-gray-500 truncate mt-1'}>
              {truncateText(value, 100)}
            </div>
          ))}
        </div>
        <div className="ml-4 flex-shrink-0 text-right">
          <span className="text-xs text-gray-400 block">{noteTypeName}</span>
          <span className="text-xs text-gray-500">{cardCount}枚</span>
        </div>
      </div>
    </div>
  )
}

function truncateText(text: string, maxLength: number): string {
  // Remove HTML tags and cloze markers for display
  const cleanText = text
    .replace(/<[^>]*>/g, '')
    .replace(/\{\{c\d+::(.*?)(?:::[^}]*)?\}\}/g, '[$1]')

  if (cleanText.length <= maxLength) return cleanText
  return cleanText.slice(0, maxLength) + '...'
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
