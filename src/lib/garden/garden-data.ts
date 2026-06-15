/**
 * 庭データ取得（Phase 10.2）— デッキ配下の全カード × ユーザーの card_states を
 * 株データ（PlantCardInput）に変換して返す。derivePlantState の入力になる。
 *
 * 学習エンジンには触れず、IndexedDB（Dexie）から読むだけ。オフライン可。
 */

import { db, getDescendantDeckIds } from '@/lib/db/schema'
import { derivePlantState, type PlantCardInput, type PlantState } from './plant-state'

export interface GardenPlant {
  cardId: string
  noteId: string
  /** 見出し語など、株の名札に使う短いラベル（HTML除去済み） */
  label: string
  /** 学習状態。未学習は null（=種） */
  card: PlantCardInput | null
}

/** field_values から名札ラベルを1つ選ぶ（見出し語優先 → 先頭の非空値） */
function pickLabel(fieldValues: Record<string, unknown> | null | undefined): string {
  if (!fieldValues) return ''
  const priority = ['見出し語', '単語', '英単語', 'word', 'Word', 'Front', '表面']
  for (const key of priority) {
    const v = fieldValues[key]
    if (typeof v === 'string' && v.trim()) return stripHtml(v)
  }
  for (const v of Object.values(fieldValues)) {
    if (typeof v === 'string' && v.trim()) return stripHtml(v)
  }
  return ''
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').trim().slice(0, 40)
}

/**
 * デッキ（とその子孫デッキ）の全カードを株データとして返す。
 * @param deckId 対象デッキ
 * @param userId 対象ユーザー（card_states の所有者）
 */
export async function getGardenForDeck(
  deckId: string,
  userId: string
): Promise<GardenPlant[]> {
  const deckIds = [deckId, ...(await getDescendantDeckIds(deckId))]

  const cards = await db.cards.where('deck_id').anyOf(deckIds).toArray()
  if (cards.length === 0) return []

  // ノート（ラベル用）とユーザーの card_states を取得
  const noteIds = Array.from(new Set(cards.map((c) => c.note_id)))
  const notes = await db.notes.where('id').anyOf(noteIds).toArray()
  const noteMap = new Map(notes.map((n) => [n.id, n]))

  const states = await db.cardStates.where('user_id').equals(userId).toArray()
  const stateByCard = new Map(states.map((s) => [s.card_id, s]))

  return cards.map((card) => {
    const note = noteMap.get(card.note_id)
    const cs = stateByCard.get(card.id)
    const input: PlantCardInput | null = cs
      ? {
          state: cs.state,
          stability: cs.stability ?? null,
          interval: cs.interval,
          due: cs.due,
          lapses: cs.lapses ?? 0,
          difficulty: cs.difficulty ?? null,
        }
      : null
    return {
      cardId: card.id,
      noteId: card.note_id,
      label: pickLabel(note?.field_values as Record<string, unknown> | undefined),
      card: input,
    }
  })
}

/** 枯れ株一覧の1件（Phase 10.3）。復活導線（水やり）に必要な情報を含む。 */
export interface WitheredPlant {
  cardId: string
  noteId: string
  /** 所属デッキ（復活導線 /study?deck=...&card=... に使う） */
  deckId: string
  /** 所属デッキ名（一覧表示用） */
  deckName: string
  /** 見出し語など、株の名札（HTML除去済み） */
  label: string
  /** 導出済みの株状態（グリフ描画用。overdueDays もここに含む） */
  plant: PlantState
}

/**
 * ユーザーの全デッキ横断で「枯れている株（isDead）」を集める（Phase 10.3）。
 * 枯れは見た目のみで card_states は不変。水やり（=復習）で芽吹き直す導線に使う。
 *
 * card_states を走査して derivePlantState で枯れ判定 → デッキ/ノート情報を付与。
 * Dexie のみ・オフライン可。放置日数の降順で返す。
 *
 * @param userId 対象ユーザー
 * @param now    現在時刻（テスト用に注入可）
 */
export async function getWitheredPlants(
  userId: string,
  now: Date = new Date()
): Promise<WitheredPlant[]> {
  const states = await db.cardStates.where('user_id').equals(userId).toArray()
  if (states.length === 0) return []

  // 枯れている card_state だけに絞る（card_states 自体は変更しない）
  const dead = states
    .map((cs) => {
      const input: PlantCardInput = {
        state: cs.state,
        stability: cs.stability ?? null,
        interval: cs.interval,
        due: cs.due,
        lapses: cs.lapses ?? 0,
        difficulty: cs.difficulty ?? null,
      }
      return { cs, plant: derivePlantState(input, now) }
    })
    .filter((d) => d.plant.isDead)
  if (dead.length === 0) return []

  // 枯れカードに対応する cards / notes / decks をまとめて引く
  const cardIds = dead.map((d) => d.cs.card_id)
  const cards = await db.cards.where('id').anyOf(cardIds).toArray()
  const cardMap = new Map(cards.map((c) => [c.id, c]))

  const noteIds = Array.from(new Set(cards.map((c) => c.note_id)))
  const notes = await db.notes.where('id').anyOf(noteIds).toArray()
  const noteMap = new Map(notes.map((n) => [n.id, n]))

  const deckIds = Array.from(new Set(cards.map((c) => c.deck_id)))
  const decks = await db.decks.where('id').anyOf(deckIds).toArray()
  const deckNameMap = new Map(decks.map((d) => [d.id, d.name]))

  const result: WitheredPlant[] = []
  for (const { cs, plant } of dead) {
    const card = cardMap.get(cs.card_id)
    if (!card) continue // カード本体が未同期なら一覧から除外
    const note = noteMap.get(card.note_id)
    result.push({
      cardId: card.id,
      noteId: card.note_id,
      deckId: card.deck_id,
      deckName: deckNameMap.get(card.deck_id) ?? 'デッキ',
      label: pickLabel(note?.field_values as Record<string, unknown> | undefined),
      plant,
    })
  }

  // 放置が長い（=より枯れている）順に
  result.sort((a, b) => b.plant.overdueDays - a.plant.overdueDays)
  return result
}
