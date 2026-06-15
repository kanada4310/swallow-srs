'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@/contexts/AuthContext'
import { getDecksWithStatsOffline } from '@/lib/db/schema'
import { getGardenForDeck, getWitheredPlants } from '@/lib/garden/garden-data'
import { derivePlantState, summarizeGarden, type GrowthStage, type CareState } from '@/lib/garden/plant-state'
import { GardenField, type GardenFieldItem } from '@/components/garden/GardenField'
import { IsoTile } from '@/components/garden/IsoTile'
import { WitheredList } from '@/components/garden/WitheredList'
import { AchievementsModal } from '@/components/garden/AchievementsModal'
import { DailyMissionCard } from '@/components/garden/DailyMissionCard'
import { useStreak } from '@/lib/stats/useStreak'
import { AppLayout } from '@/components/layout/AppLayout'

/** これを超えたら PixiJS（WebGL）で全体描画に切替（SVG は重いため） */
const MAX_TILES = 150

/** PixiJS 大規模描画は遅延ロード（バンドル分離・WebGL） */
const GardenFieldPixi = dynamic(
  () => import('@/components/garden/GardenFieldPixi').then((m) => m.GardenFieldPixi),
  {
    ssr: false,
    loading: () => (
      <div className="h-[460px] flex items-center justify-center text-sm text-gray-500">庭を描画中…</div>
    ),
  },
)

const GROWTH_LABEL: Record<GrowthStage, string> = {
  seed: '種', sprout: '芽', seedling: '苗', mature: '成株', blooming: '開花・結実',
}
const CARE_LABEL: Record<CareState, string> = {
  healthy: '健やか', thirsty: '乾き気味', wilting: 'しおれ', dryingOut: '枯れかけ', withered: '枯れ',
}

export default function GardenPage() {
  const { userId: authUserId, profile } = useAuth()
  const userId = authUserId || profile?.id || null

  const [deckId, setDeckId] = useState<string | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [showWithered, setShowWithered] = useState(false)
  const [showAchievements, setShowAchievements] = useState(false)
  // 選択した時刻。Pixi のタップ（pointerup）直後に来る合成 click が背景に当たって
  // 即座に閉じる「ゴーストクリック」を抑止するためのガード。
  const selectedAtRef = useRef(0)
  const selectCard = (id: string) => {
    selectedAtRef.current = Date.now()
    setSelectedCardId(id)
  }
  const closeSelected = () => {
    if (Date.now() - selectedAtRef.current < 400) return // 直後の合成クリックは無視
    setSelectedCardId(null)
  }

  // 学習完了の「庭で見る」等から ?deck= で対象デッキを指定可能（クライアントのみ）
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('deck')
    if (p) setDeckId(p)
  }, [])

  const decks = useLiveQuery(
    async () => (userId ? await getDecksWithStatsOffline(userId) : null),
    [userId],
  )

  // デッキ未選択ならカードのあるデッキを既定にする
  const effectiveDeckId = deckId ?? decks?.find((d) => d.total_cards > 0)?.id ?? decks?.[0]?.id ?? null

  const plants = useLiveQuery(
    async () => (userId && effectiveDeckId ? await getGardenForDeck(effectiveDeckId, userId) : null),
    [userId, effectiveDeckId],
  )

  // 枯れ株は複数デッキに散るため全デッキ横断で取得（Phase 10.3）
  const withered = useLiveQuery(
    async () => (userId ? await getWitheredPlants(userId) : null),
    [userId],
  )
  const witheredCount = withered?.length ?? 0

  // 学習ストリーク（Phase 10.5）
  const { current: streak } = useStreak(userId)

  const { items, summary, total } = useMemo(() => {
    if (!plants) return { items: [] as GardenFieldItem[], summary: null, total: 0 }
    const now = new Date()
    // 全株を items 化（SVG は MAX_TILES まで／超過は Pixi で全件描画）
    const items: GardenFieldItem[] = plants.map((p) => ({
      id: p.cardId,
      label: p.label,
      plant: derivePlantState(p.card, now),
      variety: p.variety,
    }))
    return {
      items,
      summary: summarizeGarden(plants.map((p) => p.card), now),
      total: plants.length,
    }
  }, [plants])

  const selected = selectedCardId
    ? items.find((it) => it.id === selectedCardId) ?? null
    : null

  if (!userId || decks === undefined) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-10 text-gray-500">読み込み中…</div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">
            <span className="mr-2" aria-hidden>🌱</span>わたしの庭
          </h1>
          {streak > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-orange-100 text-orange-700 text-sm font-medium whitespace-nowrap">
              🔥 {streak}日
            </span>
          )}
          <button
            onClick={() => setShowAchievements(true)}
            className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-sm font-medium whitespace-nowrap hover:bg-amber-200"
          >
            🏅 実績
          </button>
        </div>
        {decks && decks.length > 0 && (
          <select
            value={effectiveDeckId ?? ''}
            onChange={(e) => { setDeckId(e.target.value); setSelectedCardId(null) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white max-w-[60%]"
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}（{d.total_cards}株）</option>
            ))}
          </select>
        )}
      </div>

      <DailyMissionCard userId={userId} />

      {summary && (
        <div className="flex flex-wrap gap-2 mb-4 text-sm">
          <span className="px-3 py-1 rounded-lg bg-gray-100 text-gray-700">株 {summary.total}</span>
          <span className="px-3 py-1 rounded-lg bg-sky-100 text-sky-700">水やりが必要 {summary.needWater}</span>
          <span className="px-3 py-1 rounded-lg bg-green-100 text-green-700">開花・結実 {summary.byStage.blooming}</span>
          {witheredCount > 0 && (
            <button
              onClick={() => setShowWithered(true)}
              className="px-3 py-1 rounded-lg bg-amber-100 text-amber-800 font-medium hover:bg-amber-200"
            >
              🍂 枯れ株 {witheredCount}（全デッキ）
            </button>
          )}
          {effectiveDeckId && summary.needWater > 0 && (
            <Link
              href={`/study?deck=${effectiveDeckId}`}
              className="px-3 py-1 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
            >
              水やりする（学習）
            </Link>
          )}
        </div>
      )}

      {total > MAX_TILES && (
        <p className="text-xs text-gray-500 mb-3">
          {total}株を高速描画で表示しています。
        </p>
      )}

      <div className="bg-green-50/40 border border-green-100 rounded-xl p-2">
        {items.length > MAX_TILES ? (
          <GardenFieldPixi items={items} onSelect={selectCard} />
        ) : (
          <GardenField items={items} onSelect={selectCard} />
        )}
      </div>

      {/* 枯れ株一覧（全デッキ横断・復活導線） */}
      {showWithered && (
        <WitheredList plants={withered ?? []} onClose={() => setShowWithered(false)} />
      )}

      {/* 実績（アチーブメントバッジ） */}
      {showAchievements && (
        <AchievementsModal userId={userId} onClose={() => setShowAchievements(false)} />
      )}

      {/* 個別画面（1ブロック） */}
      {selected && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={closeSelected}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-xs w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-2">
              <svg viewBox="-70 -75 140 130" width="170" height="120" role="img" aria-label="株の個別表示">
                <IsoTile plant={selected.plant} variety={selected.variety} />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-900 break-words">{selected.label || '（名札なし）'}</div>
              <div className="text-sm text-gray-600 mt-1">
                {selected.variety ? `${selected.variety.name} ・ ` : ''}{GROWTH_LABEL[selected.plant.growth]} ・ {CARE_LABEL[selected.plant.care]}
              </div>
              {selected.plant.isDead && (
                <div className="text-xs text-amber-700 mt-1">水やり（復習）で芽吹き直します</div>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setSelectedCardId(null)}
                className="flex-1 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                閉じる
              </button>
              {effectiveDeckId && (
                <Link
                  href={`/study?deck=${effectiveDeckId}`}
                  className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 text-center"
                >
                  水やり（学習）
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </AppLayout>
  )
}
