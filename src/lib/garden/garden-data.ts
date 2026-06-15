/**
 * 庭データ取得（Phase 10.2）— デッキ配下の全カード × ユーザーの card_states を
 * 株データ（PlantCardInput）に変換して返す。derivePlantState の入力になる。
 *
 * 学習エンジンには触れず、IndexedDB（Dexie）から読むだけ。オフライン可。
 */

import { db, getDescendantDeckIds } from '@/lib/db/schema'
import type { PlantCardInput } from './plant-state'

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
