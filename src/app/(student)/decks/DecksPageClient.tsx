'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@/contexts/AuthContext'
import { useOnlineStatus, usePrefetchAllDecks } from '@/lib/db/hooks'
import { getDecksWithStatsOffline, db } from '@/lib/db/schema'
import { DeckAdvancedSettings } from '@/components/deck/DeckAdvancedSettings'
import type { DeckSettings } from '@/types/database'

interface DeckWithStats {
  id: string
  name: string
  owner_id: string
  is_distributed: boolean
  parent_deck_id: string | null
  filter_tags?: string[]
  is_own: boolean
  total_cards: number
  new_count: number
  learning_count: number
  review_count: number
  settings?: Partial<DeckSettings>
}

interface DeckTreeNode extends DeckWithStats {
  children: DeckTreeNode[]
  depth: number
  aggregated_total_cards: number
  aggregated_new_count: number
  aggregated_learning_count: number
  aggregated_review_count: number
}

function buildDeckTree(decks: DeckWithStats[]): DeckTreeNode[] {
  const deckMap = new Map<string, DeckTreeNode>()
  const rootNodes: DeckTreeNode[] = []

  // Create nodes
  for (const deck of decks) {
    deckMap.set(deck.id, {
      ...deck,
      children: [],
      depth: 0,
      aggregated_total_cards: deck.total_cards,
      aggregated_new_count: deck.new_count,
      aggregated_learning_count: deck.learning_count,
      aggregated_review_count: deck.review_count,
    })
  }

  // Build tree
  for (const deck of decks) {
    const node = deckMap.get(deck.id)!
    if (deck.parent_deck_id && deckMap.has(deck.parent_deck_id)) {
      const parent = deckMap.get(deck.parent_deck_id)!
      parent.children.push(node)
    } else {
      rootNodes.push(node)
    }
  }

  // Calculate depth and aggregate counts
  function setDepthAndAggregate(node: DeckTreeNode, depth: number) {
    node.depth = depth
    for (const child of node.children) {
      setDepthAndAggregate(child, depth + 1)
      node.aggregated_total_cards += child.aggregated_total_cards
      node.aggregated_new_count += child.aggregated_new_count
      node.aggregated_learning_count += child.aggregated_learning_count
      node.aggregated_review_count += child.aggregated_review_count
    }
  }

  for (const root of rootNodes) {
    setDepthAndAggregate(root, 0)
  }

  return rootNodes
}

function flattenTree(nodes: DeckTreeNode[]): DeckTreeNode[] {
  const result: DeckTreeNode[] = []
  for (const node of nodes) {
    result.push(node)
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children))
    }
  }
  return result
}

/**
 * アコーディオン表示用: 祖先がすべて展開されているノードだけを返す。
 * （ルート=深さ0 は常に表示。サブデッキは親が展開されている時のみ表示）
 * expandAll が true（検索中など）の時は全ノードを返す。
 */
function getVisibleNodes(
  flat: DeckTreeNode[],
  expanded: Set<string>,
  expandAll: boolean,
): DeckTreeNode[] {
  if (expandAll) return flat
  const byId = new Map(flat.map((n) => [n.id, n]))
  return flat.filter((node) => {
    let pid = node.parent_deck_id
    while (pid) {
      if (!expanded.has(pid)) return false
      pid = byId.get(pid)?.parent_deck_id ?? null
    }
    return true
  })
}

/** Filter decks by search query, preserving parent-child relationships */
function filterDecksByQuery(decks: DeckWithStats[], query: string): DeckWithStats[] {
  if (!query) return decks

  const lowerQuery = query.toLowerCase()
  const matchingIds = new Set<string>()

  // Find directly matching decks
  for (const deck of decks) {
    if (deck.name.toLowerCase().includes(lowerQuery)) {
      matchingIds.add(deck.id)
    }
  }

  // Add ancestors of matching decks (so tree structure is preserved)
  const deckMap = new Map(decks.map(d => [d.id, d]))
  const addedAncestors = new Set<string>()
  for (const id of Array.from(matchingIds)) {
    let current = deckMap.get(id)
    while (current?.parent_deck_id) {
      if (addedAncestors.has(current.parent_deck_id)) break
      addedAncestors.add(current.parent_deck_id)
      matchingIds.add(current.parent_deck_id)
      current = deckMap.get(current.parent_deck_id)
    }
  }

  // Add children of matching decks
  const addedChildren = new Set<string>()
  function addDescendants(parentId: string) {
    for (const deck of decks) {
      if (deck.parent_deck_id === parentId && !addedChildren.has(deck.id)) {
        addedChildren.add(deck.id)
        matchingIds.add(deck.id)
        addDescendants(deck.id)
      }
    }
  }
  // Only add descendants of originally matching decks (not ancestors)
  for (const deck of decks) {
    if (deck.name.toLowerCase().includes(lowerQuery)) {
      addDescendants(deck.id)
    }
  }

  return decks.filter(d => matchingIds.has(d.id))
}

interface DecksPageClientProps {
  /** @deprecated kept for backwards compatibility — page now reads from Dexie via liveQuery */
  initialDecks?: DeckWithStats[]
  userProfile?: { id: string; name: string; role: string }
}

export function DecksPageClient({ userProfile: userProfileProp }: DecksPageClientProps) {
  const isOnline = useOnlineStatus()
  const { userId: authUserId, profile: authProfile } = useAuth()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [isDeletingDeck, setIsDeletingDeck] = useState(false)
  const [deckDeleteError, setDeckDeleteError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  // アコーディオン: 展開中の親デッキ id 集合（既定は空＝サブデッキは折りたたみ）
  const [expandedDecks, setExpandedDecks] = useState<Set<string>>(new Set())

  // Settings modal state
  const [settingsDeckId, setSettingsDeckId] = useState<string | null>(null)
  const [settingsValues, setSettingsValues] = useState<Partial<DeckSettings>>({})
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [isSavingSettings, setIsSavingSettings] = useState(false)

  // Resolved profile (auth context, prop fallback, or first IndexedDB profile via liveQuery)
  const fallbackProfile = useLiveQuery(
    async () => {
      if (authProfile || userProfileProp) return null
      const p = await db.profiles.toCollection().first()
      return p ? { id: p.id, name: p.name, role: p.role } : null
    },
    [authProfile?.id, userProfileProp?.id],
  )
  const userProfile =
    userProfileProp ||
    (authProfile ? { id: authProfile.id, name: authProfile.name, role: authProfile.role } : null) ||
    fallbackProfile ||
    null

  const userId = authUserId || userProfile?.id || null

  // Live query: re-runs whenever decks/cards/cardStates/notes change in IndexedDB.
  // This is what makes the page auto-refresh when fullSync writes new data.
  const decks = useLiveQuery(
    async () => {
      if (!userId) return null
      return await getDecksWithStatsOffline(userId)
    },
    [userId],
  )

  // Prefetch deck data for offline use
  const deckIds = decks?.map(d => d.id) || []
  usePrefetchAllDecks(deckIds)

  const handleDeleteDeck = async (deckId: string) => {
    setIsDeletingDeck(true)
    setDeckDeleteError(null)
    try {
      const response = await fetch(`/api/decks/${deckId}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'デッキの削除に失敗しました')
      }
      setShowDeleteConfirm(null)
      // Delete from IndexedDB; liveQuery re-renders the list automatically.
      const { deleteDeckLocally } = await import('@/lib/db/schema')
      await deleteDeckLocally(deckId).catch(console.error)
    } catch (err) {
      setDeckDeleteError(err instanceof Error ? err.message : 'デッキの削除に失敗しました')
    } finally {
      setIsDeletingDeck(false)
    }
  }

  const handleOpenSettings = (deckId: string) => {
    const deck = decks?.find(d => d.id === deckId)
    setSettingsDeckId(deckId)
    setSettingsValues(deck?.settings || {})
    setSettingsError(null)
  }

  const handleSaveSettings = async () => {
    if (!settingsDeckId) return
    setIsSavingSettings(true)
    setSettingsError(null)
    try {
      const response = await fetch(`/api/decks/${settingsDeckId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settingsValues }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || '設定の保存に失敗しました')
      }
      // Update Dexie; liveQuery picks up the change automatically.
      if (data.deck) {
        try { await db.decks.put(data.deck) } catch { /* ignore */ }
      }
      setSettingsDeckId(null)
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : '設定の保存に失敗しました')
    } finally {
      setIsSavingSettings(false)
    }
  }

  const deletingDeckName = showDeleteConfirm
    ? decks?.find(d => d.id === showDeleteConfirm)?.name || ''
    : ''

  const settingsDeckName = settingsDeckId
    ? decks?.find(d => d.id === settingsDeckId)?.name || ''
    : ''

  if (decks === undefined) {
    return <DecksLoadingSkeleton />
  }
  if (decks === null) {
    // No userId yet — AuthContext is still resolving or user is logged out
    return <DecksLoadingSkeleton />
  }

  // Apply search filter
  const filteredDecks = searchQuery ? filterDecksByQuery(decks, searchQuery) : decks

  const ownDecks = filteredDecks.filter(d => d.is_own)
  const assignedDecks = filteredDecks.filter(d => !d.is_own)

  // 講師は他講師のデッキを共同編集できる（自動共有）。非自分デッキの扱いを役割で分岐。
  const isTeacher = userProfile?.role === 'teacher' || userProfile?.role === 'admin'

  // Build tree for own decks
  const ownDeckTree = buildDeckTree(ownDecks)
  const flatOwnDecks = flattenTree(ownDeckTree)

  // Build tree for assigned/shared decks (includes subdecks)
  const assignedDeckTree = buildDeckTree(assignedDecks)
  const flatAssignedDecks = flattenTree(assignedDeckTree)

  // 検索中は折りたたみを無視して全件表示（一致が見えるように）
  const expandAll = !!searchQuery
  const visibleOwnDecks = getVisibleNodes(flatOwnDecks, expandedDecks, expandAll)
  const visibleAssignedDecks = getVisibleNodes(flatAssignedDecks, expandedDecks, expandAll)

  const toggleExpand = (id: string) => {
    setExpandedDecks(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const hasResults = flatOwnDecks.length > 0 || flatAssignedDecks.length > 0
  const hasDecks = decks.length > 0
  const assignedSectionTitle = isTeacher ? '講師共有デッキ' : '配布デッキ'

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-extrabold text-ai">デッキ一覧</h1>
        {userProfile && (
          <Link
            href="/decks/new"
            className="px-4 py-2 bg-sora text-white rounded-2xl hover:bg-sora-dark transition-colors text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            新規作成
          </Link>
        )}
      </div>

      {/* Search filter */}
      {hasDecks && (
        <div className="relative mb-6">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="デッキ名で検索..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sora focus:border-sora"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="検索をクリア"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {!isOnline && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-hard-bg rounded-xl text-sm text-hard">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21" />
          </svg>
          オフラインモード - キャッシュされたデータを表示中
        </div>
      )}

      {/* 自分のデッキ */}
      {flatOwnDecks.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-ai mb-4">マイデッキ</h2>
          <div className="space-y-3">
            {visibleOwnDecks.map((deck) => (
              <DeckCard
                key={deck.id}
                deck={deck}
                depth={deck.depth}
                aggregatedStats={deck.children.length > 0 ? {
                  total_cards: deck.aggregated_total_cards,
                  new_count: deck.aggregated_new_count,
                  learning_count: deck.aggregated_learning_count,
                  review_count: deck.aggregated_review_count,
                } : undefined}
                hasChildren={deck.children.length > 0}
                isExpanded={expandAll || expandedDecks.has(deck.id)}
                onToggleExpand={() => toggleExpand(deck.id)}
                canDelete={true}
                onDelete={() => setShowDeleteConfirm(deck.id)}
                canSettings={true}
                onSettings={() => handleOpenSettings(deck.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 配布／講師共有デッキ */}
      {flatAssignedDecks.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-ai mb-4">{assignedSectionTitle}</h2>
          <div className="space-y-3">
            {visibleAssignedDecks.map((node) => (
              <DeckCard
                key={node.id}
                deck={node}
                depth={node.depth}
                aggregatedStats={node.children.length > 0 ? {
                  total_cards: node.aggregated_total_cards,
                  new_count: node.aggregated_new_count,
                  learning_count: node.aggregated_learning_count,
                  review_count: node.aggregated_review_count,
                } : undefined}
                hasChildren={node.children.length > 0}
                isExpanded={expandAll || expandedDecks.has(node.id)}
                onToggleExpand={() => toggleExpand(node.id)}
                canDelete={isTeacher}
                onDelete={isTeacher ? () => setShowDeleteConfirm(node.id) : undefined}
                canSettings={true}
                onSettings={() => handleOpenSettings(node.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 検索結果なし */}
      {searchQuery && !hasResults && (
        <div className="bg-white rounded-card border border-gray-200 p-8 text-center">
          <p className="text-ink-2">「{searchQuery}」に一致するデッキが見つかりません</p>
        </div>
      )}

      {/* デッキがない場合 */}
      {!searchQuery && !hasDecks && (
        <div className="bg-white rounded-card border border-gray-200 p-8 text-center">
          <div className="text-ink-3 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-ai mb-2">
            {!isOnline ? 'オフラインデータがありません' : 'デッキがありません'}
          </h2>
          <p className="text-ink-2">
            {!isOnline
              ? 'オンライン時にデッキを開くと、データが自動的にキャッシュされます。'
              : userProfile?.role === 'student'
                ? '新しいデッキを作成して学習を始めましょう！'
                : 'デッキを作成して、生徒に配布しましょう。'}
          </p>
        </div>
      )}

      {/* Deck Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-card shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-ai mb-2">デッキを削除</h3>
            <p className="text-sm text-ink-2 mb-1">
              「{deletingDeckName}」を削除しますか？
            </p>
            <p className="text-sm text-again mb-4">
              デッキ内のすべてのノート・カード・学習記録が完全に削除されます。この操作は元に戻せません。
            </p>
            {deckDeleteError && (
              <div className="mb-4 p-3 bg-again-bg rounded-xl text-again text-sm">
                {deckDeleteError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(null)
                  setDeckDeleteError(null)
                }}
                disabled={isDeletingDeck}
                className="px-4 py-2 text-sm font-bold text-ink-2 border border-gray-300 rounded-2xl hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleDeleteDeck(showDeleteConfirm)}
                disabled={isDeletingDeck}
                className="px-4 py-2 text-sm font-bold text-white bg-again rounded-2xl hover:opacity-90 disabled:opacity-50 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              >
                {isDeletingDeck ? '削除中...' : 'デッキを削除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {settingsDeckId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-card shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-ai">デッキ設定</h2>
                <p className="text-sm text-ink-3 mt-1">{settingsDeckName}</p>
                {settingsDeckId && !isTeacher && decks?.find(d => d.id === settingsDeckId && !d.is_own) && (
                  <p className="text-sm text-sora mt-1">
                    この設定はあなたの学習にのみ影響します。
                  </p>
                )}
              </div>
              <button
                onClick={() => setSettingsDeckId(null)}
                aria-label="閉じる"
                className="p-1 text-ink-3 hover:text-ink-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <DeckAdvancedSettings
                settings={settingsValues}
                onChange={setSettingsValues}
              />
              {settingsError && (
                <div className="mt-4 p-3 bg-again-bg rounded-xl text-again text-sm">
                  {settingsError}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setSettingsDeckId(null)}
                disabled={isSavingSettings}
                className="px-4 py-2 text-sm font-bold text-ink-2 border border-gray-300 rounded-2xl hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="px-4 py-2 text-sm font-bold text-white bg-sora rounded-2xl hover:bg-sora-dark disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              >
                {isSavingSettings ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DeckCard({ deck, depth = 0, aggregatedStats, canDelete, onDelete, canSettings, onSettings, hasChildren, isExpanded, onToggleExpand }: {
  deck: DeckWithStats
  depth?: number
  aggregatedStats?: { total_cards: number; new_count: number; learning_count: number; review_count: number }
  canDelete?: boolean
  onDelete?: () => void
  canSettings?: boolean
  onSettings?: () => void
  hasChildren?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
}) {
  const stats = aggregatedStats || deck
  const hasDueCards = stats.review_count > 0 || stats.learning_count > 0 || stats.new_count > 0

  return (
    <div
      className="bg-white rounded-2xl border border-gray-200 p-4 hover:border-gray-300 transition-colors"
      style={depth > 0 ? { marginLeft: depth * 24 } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        {/* 展開トグル（サブデッキを持つデッキのみ） */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleExpand?.()
            }}
            className="p-1 -ml-1 text-ink-3 hover:text-ink hover:bg-gray-100 rounded-full flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            title={isExpanded ? 'サブデッキを折りたたむ' : 'サブデッキを展開'}
            aria-label={isExpanded ? '折りたたむ' : '展開'}
          >
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          depth > 0 && <span className="w-4 flex-shrink-0" />
        )}
        <Link
          href={`/decks/${deck.id}`}
          className="flex-1 min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai rounded-lg"
        >
          <div className="flex items-center gap-1.5">
            {depth > 0 && (
              <svg className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            )}
            <h3 className="font-bold text-ai">{deck.name}</h3>
          </div>
          {deck.filter_tags && deck.filter_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="px-2 py-0.5 bg-sora-soft text-sora rounded-full text-xs font-bold">
                フィルタ
              </span>
              {deck.filter_tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 bg-gray-100 text-ink-2 rounded-full text-xs">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm text-ink-3 mt-1 tabular-nums">
            {aggregatedStats
              ? `${deck.total_cards} 枚 (計 ${aggregatedStats.total_cards} 枚)`
              : `${deck.total_cards} 枚のカード`}
            {!deck.is_own && <span className="ml-2 text-sora">（配布）</span>}
          </p>
        </Link>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Badge section - visible on mobile too */}
          <div className="flex flex-wrap items-center justify-end gap-1">
            {stats.new_count > 0 && (
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-easy-bg text-easy tabular-nums whitespace-nowrap">
                新規 {stats.new_count}
              </span>
            )}
            {stats.learning_count > 0 && (
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-hard-bg text-hard tabular-nums whitespace-nowrap">
                学習中 {stats.learning_count}
              </span>
            )}
            {stats.review_count > 0 && (
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-good-bg text-good tabular-nums whitespace-nowrap">
                復習 {stats.review_count}
              </span>
            )}
            {!hasDueCards && stats.total_cards > 0 && (
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-gray-100 text-ink-3 whitespace-nowrap">
                完了
              </span>
            )}
          </div>

          {/* Action buttons */}
          {hasDueCards ? (
            <Link
              href={`/study?deck=${deck.id}`}
              onClick={(e) => e.stopPropagation()}
              className="w-9 h-9 flex items-center justify-center bg-sora text-white rounded-full hover:bg-sora-dark active:scale-95 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              title="学習開始"
              aria-label="学習開始"
            >
              <svg className="w-5 h-5 translate-x-[1px]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </Link>
          ) : (
            <span
              className="w-9 h-9 flex items-center justify-center bg-gray-100 text-gray-300 rounded-full cursor-default"
              title="学習するカードがありません"
            >
              <svg className="w-5 h-5 translate-x-[1px]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          )}

          {canSettings && onSettings && (
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSettings()
              }}
              className="p-1.5 text-ink-3 hover:text-ink-2 hover:bg-gray-50 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              title="デッキ設定"
              aria-label="デッキ設定"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}

          {canDelete && onDelete ? (
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDelete()
              }}
              className="p-1.5 text-ink-3 hover:text-again hover:bg-again-bg rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              title="デッキを削除"
              aria-label="デッキを削除"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          ) : !canSettings && (
            <svg className="w-5 h-5 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}

function DecksLoadingSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="h-8 w-32 bg-gray-200 rounded-xl animate-pulse" />
        <div className="h-10 w-20 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
      <div className="h-10 w-full bg-gray-200 rounded-xl animate-pulse mb-6" />
      <div className="h-5 w-24 bg-gray-200 rounded-xl animate-pulse mb-4" />
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="h-5 w-40 bg-gray-200 rounded-xl animate-pulse" />
                <div className="h-4 w-24 bg-gray-100 rounded-xl animate-pulse mt-2" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-7 w-16 bg-gray-100 rounded-full animate-pulse" />
                <div className="h-7 w-16 bg-gray-100 rounded-full animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
