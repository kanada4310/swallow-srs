'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { NoteCard } from './NoteCard'
import { DeckSelectorModal } from './DeckSelectorModal'
import type { BrowsableNote } from './NoteCard'
import type { NoteType } from '@/types/database'

interface NoteBrowserProps {
  deckId?: string
  allDeckIds?: string[]
  initialNotes: BrowsableNote[]
  initialTotal: number
  noteTypes: NoteType[]
  deckTags?: string[]
  deckNameMap?: Map<string, string>
  canEdit: boolean
  onEditNote: (note: BrowsableNote) => void
  onDeleteNote: (noteId: string) => Promise<void>
  onBulkDelete: (noteIds: string[]) => Promise<void>
  onCopyNotes?: (noteIds: string[], targetDeckId: string) => Promise<void>
  onMoveNotes?: (noteIds: string[], targetDeckId: string) => Promise<void>
  deletingNoteId: string | null
}

const PAGE_SIZE = 50

export function NoteBrowser({
  deckId,
  allDeckIds,
  initialNotes,
  initialTotal,
  noteTypes,
  deckTags,
  deckNameMap,
  canEdit,
  onEditNote,
  onDeleteNote,
  onBulkDelete,
  onCopyNotes,
  onMoveNotes,
  deletingNoteId,
}: NoteBrowserProps) {
  const [notes, setNotes] = useState<BrowsableNote[]>(initialNotes)
  const [total, setTotal] = useState(initialTotal)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterNoteTypeId, setFilterNoteTypeId] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set())
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showBulkTagModal, setShowBulkTagModal] = useState(false)
  const [showBulkTagRemoveModal, setShowBulkTagRemoveModal] = useState(false)
  const [bulkTagInput, setBulkTagInput] = useState('')
  const [isBulkTagging, setIsBulkTagging] = useState(false)
  const [localDeckTags, setLocalDeckTags] = useState<string[]>(deckTags || [])
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSearchActive = searchQuery.trim() !== '' || filterNoteTypeId !== '' || filterTag !== '' || sortOrder !== 'desc'

  // Build note type lookup
  const noteTypeMap = new Map<string, NoteType>()
  for (const nt of noteTypes) {
    noteTypeMap.set(nt.id, nt)
  }

  // Get unique note types used in current notes (for filter dropdown)
  const usedNoteTypeIds = new Set(initialNotes.map(n => n.note_type_id))
  const filterableNoteTypes = noteTypes.filter(nt => usedNoteTypeIds.has(nt.id))

  const fetchNotes = useCallback(async (query: string, noteTypeId: string, order: string, offset: number, tag?: string) => {
    const params = new URLSearchParams({
      q: query,
      noteTypeId,
      sort: 'created_at',
      order,
      offset: String(offset),
      limit: String(PAGE_SIZE),
    })
    if (deckId) {
      params.set('deckId', deckId)
    }
    if (tag) {
      params.set('tag', tag)
    }
    // Include subdeck IDs for search
    if (allDeckIds && allDeckIds.length > 1) {
      params.set('deckIds', allDeckIds.join(','))
    }

    const response = await fetch(`/api/notes/search?${params}`)
    if (!response.ok) {
      throw new Error('検索に失敗しました')
    }
    return response.json() as Promise<{ notes: BrowsableNote[]; total: number }>
  }, [deckId, allDeckIds])

  // Search with debounce
  const triggerSearch = useCallback((query: string, noteTypeId: string, order: string, tag?: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true)
      try {
        const result = await fetchNotes(query, noteTypeId, order, 0, tag)
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
    triggerSearch(searchQuery, filterNoteTypeId, sortOrder, filterTag)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filterNoteTypeId, filterTag, sortOrder])

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
      const result = await fetchNotes(searchQuery, filterNoteTypeId, sortOrder, notes.length, filterTag)
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

  const handleBulkTag = async (addTags: string[]) => {
    const noteIds = Array.from(selectedNotes)
    if (noteIds.length === 0 || addTags.length === 0) return

    setIsBulkTagging(true)
    try {
      const body: Record<string, unknown> = { noteIds, addTags }
      if (deckId) body.deckId = deckId
      const response = await fetch('/api/notes/bulk-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'タグの更新に失敗しました')
      }
      // Update local notes state
      setNotes(prev => prev.map(n => {
        if (selectedNotes.has(n.id)) {
          const existingTags = n.tags || []
          const merged = Array.from(new Set([...existingTags, ...addTags])).sort()
          return { ...n, tags: merged }
        }
        return n
      }))
      // Update local deck tags
      setLocalDeckTags(prev => Array.from(new Set([...prev, ...addTags])).sort())
      setShowBulkTagModal(false)
      setBulkTagInput('')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'タグの更新に失敗しました')
    } finally {
      setIsBulkTagging(false)
    }
  }

  const handleBulkTagRemove = async (removeTags: string[]) => {
    const noteIds = Array.from(selectedNotes)
    if (noteIds.length === 0 || removeTags.length === 0) return

    setIsBulkTagging(true)
    try {
      const body: Record<string, unknown> = { noteIds, removeTags }
      if (deckId) body.deckId = deckId
      const response = await fetch('/api/notes/bulk-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'タグの削除に失敗しました')
      }
      // Update local notes state
      const removeSet = new Set(removeTags)
      setNotes(prev => prev.map(n => {
        if (selectedNotes.has(n.id)) {
          const filtered = (n.tags || []).filter(t => !removeSet.has(t))
          return { ...n, tags: filtered }
        }
        return n
      }))
      setShowBulkTagRemoveModal(false)
      setBulkTagInput('')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'タグの削除に失敗しました')
    } finally {
      setIsBulkTagging(false)
    }
  }

  const handleCopyToTarget = async (targetDeckId: string) => {
    const noteIds = Array.from(selectedNotes)
    if (noteIds.length === 0 || !onCopyNotes) return
    await onCopyNotes(noteIds, targetDeckId)
    setSelectedNotes(new Set())
    setIsSelectMode(false)
  }

  const handleMoveToTarget = async (targetDeckId: string) => {
    const noteIds = Array.from(selectedNotes)
    if (noteIds.length === 0 || !onMoveNotes) return
    await onMoveNotes(noteIds, targetDeckId)
    // Remove moved notes from local state
    const movedSet = new Set(noteIds)
    setNotes(prev => prev.filter(n => !movedSet.has(n.id)))
    setTotal(prev => prev - noteIds.length)
    setSelectedNotes(new Set())
    setIsSelectMode(false)
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

  // Determine which deck IDs to exclude from the deck selector (current deck context)
  const excludeDeckIds = deckId ? [deckId] : []

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
              placeholder={deckId ? 'ノートを検索...' : '全デッキからノートを検索...'}
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

          {/* Tag Filter */}
          {localDeckTags.length > 0 && (
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            >
              <option value="">全タグ</option>
              {localDeckTags.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
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
              className="text-sm text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              選択して操作
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
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setIsSelectMode(false)
                setSelectedNotes(new Set())
              }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            {onCopyNotes && (
              <button
                onClick={() => setShowCopyModal(true)}
                disabled={selectedNotes.size === 0}
                className="px-3 py-1.5 text-sm text-green-600 border border-green-300 rounded-lg hover:bg-green-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed transition-colors"
              >
                コピー
              </button>
            )}
            {onMoveNotes && (
              <button
                onClick={() => setShowMoveModal(true)}
                disabled={selectedNotes.size === 0}
                className="px-3 py-1.5 text-sm text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed transition-colors"
              >
                移動
              </button>
            )}
            <button
              onClick={() => setShowBulkTagModal(true)}
              disabled={selectedNotes.size === 0}
              className="px-3 py-1.5 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed transition-colors"
            >
              タグ追加
            </button>
            <button
              onClick={() => setShowBulkTagRemoveModal(true)}
              disabled={selectedNotes.size === 0}
              className="px-3 py-1.5 text-sm text-orange-600 border border-orange-300 rounded-lg hover:bg-orange-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed transition-colors"
            >
              タグ削除
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
              deckName={!deckId && deckNameMap && note.deck_id ? deckNameMap.get(note.deck_id) : undefined}
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

      {/* Bulk Tag Modal */}
      {showBulkTagModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">タグを追加</h3>
            <p className="text-sm text-gray-600 mb-4">
              {selectedNotes.size}件のノートにタグを追加します。
            </p>
            <div className="mb-4">
              <input
                type="text"
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && bulkTagInput.trim()) {
                    e.preventDefault()
                    handleBulkTag([bulkTagInput.trim()])
                  }
                }}
                placeholder="タグ名を入力..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                autoFocus
              />
              {localDeckTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {localDeckTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleBulkTag([tag])}
                      disabled={isBulkTagging}
                      className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 text-gray-600 hover:text-blue-700 transition-colors disabled:opacity-50"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowBulkTagModal(false)
                  setBulkTagInput('')
                }}
                disabled={isBulkTagging}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => bulkTagInput.trim() && handleBulkTag([bulkTagInput.trim()])}
                disabled={isBulkTagging || !bulkTagInput.trim()}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isBulkTagging ? '追加中...' : 'タグを追加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Tag Remove Modal */}
      {showBulkTagRemoveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">タグを削除</h3>
            <p className="text-sm text-gray-600 mb-4">
              {selectedNotes.size}件のノートからタグを削除します。
            </p>
            <div className="mb-4">
              <input
                type="text"
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && bulkTagInput.trim()) {
                    e.preventDefault()
                    handleBulkTagRemove([bulkTagInput.trim()])
                  }
                }}
                placeholder="削除するタグ名を入力..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm"
                autoFocus
              />
              {localDeckTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {localDeckTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleBulkTagRemove([tag])}
                      disabled={isBulkTagging}
                      className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-orange-50 hover:border-orange-300 text-gray-600 hover:text-orange-700 transition-colors disabled:opacity-50"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowBulkTagRemoveModal(false)
                  setBulkTagInput('')
                }}
                disabled={isBulkTagging}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => bulkTagInput.trim() && handleBulkTagRemove([bulkTagInput.trim()])}
                disabled={isBulkTagging || !bulkTagInput.trim()}
                className="px-4 py-2 text-sm text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                {isBulkTagging ? '削除中...' : 'タグを削除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy to Deck Modal */}
      {showCopyModal && (
        <DeckSelectorModal
          title="ノートをコピー"
          description={`${selectedNotes.size}件のノートをコピー先デッキを選択してください。`}
          confirmLabel="コピー"
          excludeDeckIds={excludeDeckIds}
          onSelect={handleCopyToTarget}
          onClose={() => setShowCopyModal(false)}
        />
      )}

      {/* Move to Deck Modal */}
      {showMoveModal && (
        <DeckSelectorModal
          title="ノートを移動"
          description={`${selectedNotes.size}件のノートを移動先デッキを選択してください。学習記録は保持されます。`}
          confirmLabel="移動"
          excludeDeckIds={excludeDeckIds}
          onSelect={handleMoveToTarget}
          onClose={() => setShowMoveModal(false)}
        />
      )}
    </div>
  )
}
