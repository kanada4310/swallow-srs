/**
 * 単語帳（定着度ビュー）データ取得 — デッキ配下の全カード × ユーザーの card_states を
 * 「単語」単位にまとめ、定着度を付けて返す。IndexedDB（Dexie）から読むだけ・オフライン可。
 *
 * 1単語 = 見出し語（等）でまとめた 1行。古文モードA/B のように 1見出し語が複数ノート・
 * 複数カードを持つ場合は、一番弱いカードの定着度を採用する（aggregateMastery）。
 */

import { db, getDescendantDeckIds } from '@/lib/db/schema'
import { pickLabel } from '@/lib/garden/garden-data'
import {
  deriveMastery,
  aggregateMastery,
  MASTERY_ORDER,
  type MasteryLevel,
  type MasteryCardInput,
} from './mastery'

/** 単語帳の1行 */
export interface WordbookEntry {
  /** グルーピングキー（見出し語 or note id） */
  key: string
  /** 見出し語（表示） */
  label: string
  /** 補足（漢字・読み・意味など。無ければ空） */
  sub: string
  /** 品詞（無ければ空） */
  pos: string
  /** 単語の定着度（一番弱いカードを採用） */
  mastery: MasteryLevel
  /** この単語のノート数 */
  noteCount: number
  /** 復習導線用：一番弱いカードの id（/study?deck=X&card=cardId で最優先出題） */
  reviewCardId: string
  /** reviewCardId が属するデッキ id */
  reviewDeckId: string
}

/** グルーピングに使う見出し語フィールドの優先順位。 */
const WORD_KEY_FIELDS = ['見出し語', '単語', '英単語', 'word', 'Word', 'Front', '表面', '語']
/** 補足テキスト（意味・読み等）の優先順位。 */
const SUB_FIELDS = ['意味', '和訳', '訳', '語義', 'Back', '裏', '裏面', 'meaning', 'Meaning', '漢字', '読み']

function pickField(fieldValues: Record<string, unknown> | undefined, keys: string[]): string {
  if (!fieldValues) return ''
  for (const k of keys) {
    const v = fieldValues[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

/**
 * デッキ（とその子孫デッキ）の単語帳を返す。
 * @param deckId 対象デッキ
 * @param userId 対象ユーザー（card_states の所有者＝マイ単語帳）
 */
export async function getWordbookForDeck(
  deckId: string,
  userId: string
): Promise<WordbookEntry[]> {
  const deckIds = [deckId, ...(await getDescendantDeckIds(deckId))]

  const cards = await db.cards.where('deck_id').anyOf(deckIds).toArray()
  if (cards.length === 0) return []

  const noteIds = Array.from(new Set(cards.map((c) => c.note_id)))
  const notes = await db.notes.where('id').anyOf(noteIds).toArray()
  const noteMap = new Map(notes.map((n) => [n.id, n]))

  const states = await db.cardStates.where('user_id').equals(userId).toArray()
  const stateByCard = new Map(states.map((s) => [s.card_id, s]))

  // 見出し語（等）でグループ化。キーが取れないノートは note 単位で独立させる。
  interface Group {
    key: string
    label: string
    sub: string
    pos: string
    noteIds: Set<string>
    /** { cardId, deckId, mastery, order } 一番弱いカードを選ぶために保持 */
    weakest: { cardId: string; deckId: string; mastery: MasteryLevel; order: number } | null
    levels: MasteryLevel[]
  }
  const groups = new Map<string, Group>()

  for (const card of cards) {
    const note = noteMap.get(card.note_id)
    const fv = note?.field_values as Record<string, unknown> | undefined
    const wordRaw = pickField(fv, WORD_KEY_FIELDS)
    // グループキー: 見出し語があればそれ、無ければ note 単位
    const key = wordRaw ? `w:${wordRaw}` : `n:${card.note_id}`

    let g = groups.get(key)
    if (!g) {
      g = {
        key,
        label: wordRaw ? stripHtml(wordRaw) : pickLabel(fv),
        sub: stripHtml(pickField(fv, SUB_FIELDS)),
        pos: pickField(fv, ['品詞']),
        noteIds: new Set(),
        weakest: null,
        levels: [],
      }
      groups.set(key, g)
    }
    g.noteIds.add(card.note_id)

    const cs = stateByCard.get(card.id)
    const input: MasteryCardInput | null = cs
      ? {
          state: cs.state,
          stability: cs.stability ?? null,
          interval: cs.interval,
          lapses: cs.lapses ?? 0,
        }
      : null
    const level = deriveMastery(input)
    g.levels.push(level)

    // 復習導線には一番弱いカードを使う（苦手=最優先）
    const order = MASTERY_ORDER[level]
    if (!g.weakest || order < g.weakest.order) {
      g.weakest = { cardId: card.id, deckId: card.deck_id, mastery: level, order }
    }
  }

  const result: WordbookEntry[] = []
  for (const g of Array.from(groups.values())) {
    if (!g.weakest) continue
    result.push({
      key: g.key,
      label: g.label,
      sub: g.sub,
      pos: g.pos,
      mastery: aggregateMastery(g.levels),
      noteCount: g.noteIds.size,
      reviewCardId: g.weakest.cardId,
      reviewDeckId: g.weakest.deckId,
    })
  }
  return result
}
