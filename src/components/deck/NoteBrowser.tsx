'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { NoteCard } from './NoteCard'
import type { BrowsableNote } from './NoteCard'
import type { NoteType } from '@/types/database'

interface NoteBrowserProps {
  deckId: string
  initialNotes: BrowsableNote[]
  initialTotal: number
  noteTypes: NoteType[]
  canEdit: boolean
  onEditNote: (note: BrowsableNote) => void
  onDeleteNote: (noteId: string) => Promise<void>
  onBulkDelete: (noteIds: string[]) => Promise<void>
  deletingNoteId: string | null
}

const PAGE_SIZE = 50

export function NoteBrowser({
  deckId,
  initialNotes,
  initialTotal,
  noteTypes,
  canEdit,
  onEditNote,
  onDeleteNote,
  onBulkDelete,
  deletingNoteId,
}: NoteBrowserProps) {
  const [notes, setNotes] = useState<BrowsableNote[]>(initialNotes)
  const [total, setTotal] = useState(initialTotal)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterNoteTypeId, setFilterNoteTypeId] = useState('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set())
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSearchActive = searchQuery.trim() !== '' || filterNoteTypeId !== '' || sortOrder !== 'desc'

  // Build note type lookup
  const noteTypeMap = new Map<string, NoteType>()
  for (const nt of noteTypes) {
    noteTypeMap.set(nt.id, nt)
  }

  // Get unique note types used in current notes (for filter dropdown)
  const usedNoteTypeIds = new Set(initialNotes.map(n => n.note_type_id))
  const filterableNoteTypes = noteTypes.filter(nt => usedNoteTypeIds.has(nt.id))

  const fetchNotes = useCallback(async (query: string, noteTypeId: string, order: string, offset: number) => {
    const params = new URLSearchParams({
      deckId,
      q: query,
      noteTypeId,
      sort: 'created_at',
      order,
      offset: String(offset),
      limit: String(PAGE_SIZE),
    })

    const response = await fetch(`/api/notes/search?${params}`)
    if (!response.ok) {
      throw new Error('検索に失敗しました')
    }
    return response.json() as Promise<{ notes: BrowsableNote[]; total: number }>
  }, [deckId])

  // Search with debounce
  const triggerSearch = useCallback((query: string, noteTypeId: string, order: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true)
      try {
        const result = await fetchNotes(query, noteTypeId, order, 0)
        setNotes(result.notes)
        setTotal(result.total)
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setIsLoading(false)
      }
    }, 300)
  }, [fetchNotes])

  // When search/filter/sort changes, re-fetch
  useEffect(() => {
    if (!isSearchActive) {
      // Reset to initial data
      setNotes(initialNotes)
      setTotal(initialTotal)
      return
    }
    triggerSearch(searchQuery, filterNoteTypeId, sortOrder)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filterNoteTypeId, sortOrder])

  // Sync with parent when initialNotes changes (e.g., after note add/edit/delete)
  useEffect(() => {
    if (!isSearchActive) {
      setNotes(initialNotes)
      setTotal(initialTotal)
    }
  }, [initialNotes, initialTotal, isSearchActive])

  const handleLoadMore = async () => {
    setIsLoadingMore(true)
    try {
      const result = await fetchNotes(searchQuery, filterNoteTypeId, sortOrder, notes.length)
      setNotes(prev => [...prev, ...result.notes])
      setTotal(result.total)
    } catch (err) {
      console.error('Load more error:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const toggleNoteSelection = (noteId: string) => {
    setSelectedNotes(prev => {
      const next = new Set(prev)
      if (next.has(noteId)) {
        next.delete(noteId)
      } else {
        next.add(noteId)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedNotes.size === notes.length) {
      setSelectedNotes(new Set())
    } else {
      setSelectedNotes(new Set(notes.map(n => n.id)))
    }
  }

  const handleBulkDeleteConfirm = async () => {
    const noteIds = Array.from(selectedNotes)
    if (noteIds.length === 0) return

    setIsBulkDeleting(true)
    setDeleteError(null)
    try {
      await onBulkDelete(noteIds)
      // Remove deleted notes from local state
      const deletedSet = new Set(noteIds)
      setNotes(prev => prev.filter(n => !deletedSet.has(n.id)))
      setTotal(prev => prev - noteIds.length)
      setSelectedNotes(new Set())
      setIsSelectMode(false)
      setShowDeleteConfirm(false)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '削除に失敗しました')
    } finally {
      setIsBulkDeleting(false)
    }
  }

  // Remove a note from local state (called after successful single delete)
  const handleNoteDeleted = (noteId: string) => {
    setNotes(prev => prev.filter(n => n.id !== noteId))
    setTotal(prev => prev - 1)
  }

  const handleDeleteNote = async (noteId: string) => {
    try {
      await onDeleteNote(noteId)
      handleNoteDeleted(noteId)
    } catch {
      // Error handled by parent
    }
  }

  // Refresh a single note after generation (re-fetch its field_values)
  const handleNoteGenerated = async (noteId: string) => {
    try {
      const result = await fetchNotes('', '', 'desc', 0)
      const updatedNote = result.notes.find(n => n.id === noteId)
      if (updatedNote) {
        setNotes(prev => prev.map(n =>
          n.id === noteId ? updatedNote : n
        ))
      }
    } catch {
      // Silent - note will show stale data until page refresh
    }
  }

  const hasMore = notes.length < total

  return (
    <div>
      {/* Search & Filter Bar */}
      <div className="mb-4 space-y-3">
        <div className="flex gap-2">
          {/* Search Input */}
          <div className="flex-1 relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ノートを検索..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Note Type Filter */}
          {filterableNoteTypes.length > 1 && (
            <select
              value={filterNoteTypeId}
              onChange={(e) => setFilterNoteTypeId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            >
              <option value="">全タイプ</option>
              {filterableNoteTypes.map(nt => (
                <option key={nt.id} value={nt.id}>{nt.name}</option>
              ))}
            </select>
          )}

          {/* Sort Toggle */}
          <button
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm text-gray-600 flex items-center gap-1"
            title={sortOrder === 'desc' ? '新しい順' : '古い順'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {sortOrder === 'desc' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
              )}
            </svg>
            {sortOrder === 'desc' ? '新→古' : '古→新'}
          </button>
        </div>

        {/* Count Display */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            {isSearchActive
              ? `検索結果: ${total}件中${Math.min(notes.length, total)}件表示`
              : `全${total}件`
            }
          </span>
          {canEdit && !isSelectMode && notes.length > 0 && (
            <button
              onClick={() => {
                setIsSelectMode(true)
                setSelectedNotes(new Set())
              }}
              className="text-sm text-red-500 hover:text-red-700 transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              選択して削除
            </button>
          )}
        </div>
      </div>

      {/* Delete Error */}
      {deleteError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="text-red-500 hover:text-red-700 ml-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Select Mode Bar */}
      {isSelectMode && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="text-sm text-blue-700 hover:text-blue-900 font-medium"
            >
              {selectedNotes.size === notes.length ? 'すべて解除' : 'すべて選択'}
            </button>
            <span className="text-sm text-blue-600">
              {selectedNotes.size}件選択中
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsSelectMode(false)
                setSelectedNotes(new Set())
              }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={selectedNotes.size === 0}
              className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {selectedNotes.size}件を削除
            </button>
          </div>
        </div>
      )}

      {/* Notes List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-500">
            {isSearchActive
              ? '検索条件に一致するノートがありません。'
              : canEdit
                ? 'ノートがありません。上のボタンから追加してください。'
                : 'まだノートがありません。'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              noteType={noteTypeMap.get(note.note_type_id)}
              canEdit={canEdit}
              isSelectMode={isSelectMode}
              isSelected={selectedNotes.has(note.id)}
              onToggleSelect={() => toggleNoteSelection(note.id)}
              onEdit={() => onEditNote(note)}
              onDelete={() => handleDeleteNote(note.id)}
              isDeleting={deletingNoteId === note.id}
              onGenerate={handleNoteGenerated}
            />
          ))}

          {/* Load More */}
          {hasMore && (
            <div className="text-center pt-4">
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="px-6 py-2 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoadingMore ? '読み込み中...' : `もっと読み込む（残り${total - notes.length}件）`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">ノートを削除</h3>
            <p className="text-sm text-gray-600 mb-4">
              {selectedNotes.size}件のノートを削除しますか？関連するカード・学習記録もすべて削除されます。この操作は元に戻せません。
            </p>
            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteError(null)
                }}
                disabled={isBulkDeleting}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleBulkDeleteConfirm}
                disabled={isBulkDeleting}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isBulkDeleting ? '削除中...' : `${selectedNotes.size}件を削除`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
