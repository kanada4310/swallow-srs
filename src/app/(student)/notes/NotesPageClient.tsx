'use client'

import { useState, useMemo } from 'react'
import { NoteBrowser } from '@/components/deck/NoteBrowser'
import { NoteEditModal } from '@/components/deck/NoteEditModal'
import { NoteEditor } from '@/components/deck/NoteEditor'
import type { NoteType } from '@/types/database'
import type { BrowsableNote } from '@/components/deck/NoteCard'

interface NotesPageClientProps {
  initialNotes?: BrowsableNote[]
  initialTotal?: number
  noteTypes?: NoteType[]
  deckNameEntries?: [string, string][]
  userProfile?: { id: string; name: string; role: string }
}

export function NotesPageClient({
  initialNotes,
  initialTotal,
  noteTypes: noteTypesProp,
  deckNameEntries,
  userProfile,
}: NotesPageClientProps) {
  const [notes, setNotes] = useState<BrowsableNote[]>(initialNotes || [])
  const [total, setTotal] = useState(initialTotal || 0)
  const [editingNote, setEditingNote] = useState<BrowsableNote | null>(null)
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null)
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [selectedDeckId, setSelectedDeckId] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const noteTypes = noteTypesProp || []

  const deckNameMap = useMemo(() => {
    const map = new Map<string, string>()
    if (deckNameEntries) {
      for (const [id, name] of deckNameEntries) {
        map.set(id, name)
      }
    }
    return map
  }, [deckNameEntries])

  const canEdit = userProfile?.role !== 'student'

  const handleDeleteNote = async (noteId: string) => {
    setDeletingNoteId(noteId)
    try {
      const response = await fetch(`/api/notes/${noteId}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '削除に失敗しました')
      }
      setNotes(prev => prev.filter(n => n.id !== noteId))
      setTotal(prev => Math.max(0, prev - 1))
      import('@/lib/db/schema').then(({ deleteNoteLocally }) => {
        deleteNoteLocally(noteId).catch(console.error)
      })
    } finally {
      setDeletingNoteId(null)
    }
  }

  const handleBulkDelete = async (noteIds: string[]) => {
    const response = await fetch('/api/notes/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteIds }),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || '削除に失敗しました')
    }
    setNotes(prev => prev.filter(n => !noteIds.includes(n.id)))
    setTotal(prev => Math.max(0, prev - noteIds.length))
    import('@/lib/db/schema').then(({ deleteNotesLocally }) => {
      deleteNotesLocally(noteIds).catch(console.error)
    })
  }

  const handleCopyNotes = async (noteIds: string[], targetDeckId: string) => {
    const response = await fetch('/api/notes/copy-move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteIds, targetDeckId, action: 'copy' }),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'コピーに失敗しました')
    }
  }

  const handleMoveNotes = async (noteIds: string[], targetDeckId: string) => {
    const response = await fetch('/api/notes/copy-move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteIds, targetDeckId, action: 'move' }),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || '移動に失敗しました')
    }
    // Update local state: change deck_id for moved notes
    setNotes(prev => prev.map(n =>
      noteIds.includes(n.id) ? { ...n, deck_id: targetDeckId } : n
    ))
  }

  const handleEditNoteSave = (updatedNote: BrowsableNote) => {
    setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n))
    setEditingNote(null)
  }

  const handleNoteAdded = async () => {
    setIsAddingNote(false)
    setSelectedDeckId('')
    // Refresh notes list
    try {
      const res = await fetch('/api/notes/search?limit=50')
      if (res.ok) {
        const data = await res.json()
        setNotes(data.notes || [])
        setTotal(data.total || 0)
      }
    } catch {
      // ignore refresh error
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const response = await fetch('/api/notes/export', { method: 'POST' })
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
        : `ノート検索結果_${new Date().toISOString().split('T')[0]}.csv`

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

  if (!userProfile) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="text-center text-gray-500 py-12">
          ログインが必要です
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ノート</h1>
          <p className="text-sm text-gray-500 mt-1">全デッキのノートを検索・管理</p>
        </div>
        {canEdit && !isAddingNote && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddingNote(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              + ノートを追加
            </button>
            <button
              onClick={handleExport}
              disabled={notes.length === 0 || isExporting}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {isExporting ? 'エクスポート中...' : 'CSV'}
            </button>
          </div>
        )}
      </div>

      {isAddingNote && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">ノートを追加</h2>
            <button
              onClick={() => { setIsAddingNote(false); setSelectedDeckId('') }}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              &times;
            </button>
          </div>

          {/* Deck selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              追加先デッキ
            </label>
            <select
              value={selectedDeckId}
              onChange={(e) => setSelectedDeckId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">デッキを選択...</option>
              {deckNameEntries?.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          {selectedDeckId && (
            <NoteEditor
              deckId={selectedDeckId}
              noteTypes={noteTypes}
              onNoteAdded={handleNoteAdded}
              onCancel={() => { setIsAddingNote(false); setSelectedDeckId('') }}
            />
          )}
        </div>
      )}

      <NoteBrowser
        initialNotes={notes}
        initialTotal={total}
        noteTypes={noteTypes}
        deckNameMap={deckNameMap}
        canEdit={canEdit}
        onEditNote={(note) => setEditingNote(note)}
        onDeleteNote={handleDeleteNote}
        onBulkDelete={handleBulkDelete}
        onCopyNotes={canEdit ? handleCopyNotes : undefined}
        onMoveNotes={canEdit ? handleMoveNotes : undefined}
        deletingNoteId={deletingNoteId}
      />

      {editingNote && (
        <NoteEditModal
          note={editingNote}
          noteType={noteTypes.find(nt => nt.id === editingNote.note_type_id) || noteTypes[0]}
          onSave={handleEditNoteSave}
          onClose={() => setEditingNote(null)}
        />
      )}

    </div>
  )
}
