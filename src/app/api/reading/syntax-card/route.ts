/**
 * 確定した構文分析を復習カードにする（POST /api/reading/syntax-card）。
 *
 * - 保存するのは英文と確定済みの構文分析だけ（訳文は保存しない・裁定2）
 * - 保存先は生徒本人の個人デッキ「構文分析カード」（初回に自動作成）
 * - ノートタイプ「構文分析」は is_system として初回に自動作成（既存の Basic/Cloze と同様の扱い）
 * - 同じ文を確定し直したら既存ノートを上書きする（source_info で同一判定）
 * - 学習エンジン（card_states / review_logs）には触れない。新規カードとして普通に流れる
 * - AIは呼ばない（費用0円）。ゲートは通さないが、教材の文かどうかの照合だけ行う
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import { createAdminClient, verifySentenceTokens } from '@/lib/syntax-ai/server'
import { buildCardFields } from '@/lib/syntax-ai/card'
import {
  SYNTAX_BACK_TEMPLATE,
  SYNTAX_CSS,
  SYNTAX_DECK_NAME,
  SYNTAX_FIELDS,
  SYNTAX_FRONT_TEMPLATE,
  SYNTAX_NOTE_TYPE_NAME,
} from '@/lib/syntax-ai/card-template'
import { isSentenceKey, validateAnswer, validateTokens } from '@/lib/syntax-ai/validate'
import type { SentenceSyntaxWork } from '@/lib/reading/types'
import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_OWNER_EMAIL = 'gaimon.maam@gmail.com'

/** ノートタイプ「構文分析」を取得（無ければ is_system で作成。オーナーは講師） */
async function ensureNoteType(admin: SupabaseClient): Promise<string | null> {
  const { data: existing } = await admin
    .from('note_types')
    .select('id')
    .eq('name', SYNTAX_NOTE_TYPE_NAME)
    .eq('is_system', true)
    .maybeSingle()
  if (existing) return existing.id as string

  const { data: teachers } = await admin
    .from('profiles')
    .select('id, email')
    .in('role', ['teacher', 'admin'])
    .limit(10)
  const owner = teachers?.find((t) => t.email === DEFAULT_OWNER_EMAIL) || teachers?.[0]
  if (!owner) return null

  const { data: created, error } = await admin
    .from('note_types')
    .insert({
      name: SYNTAX_NOTE_TYPE_NAME,
      owner_id: owner.id,
      fields: SYNTAX_FIELDS,
      is_system: true,
    })
    .select('id')
    .single()
  if (error || !created) return null

  const { error: tplError } = await admin.from('card_templates').insert({
    note_type_id: created.id,
    name: '構文分析',
    ordinal: 0,
    front_template: SYNTAX_FRONT_TEMPLATE,
    back_template: SYNTAX_BACK_TEMPLATE,
    css: SYNTAX_CSS,
  })
  if (tplError) {
    console.error('構文分析テンプレートの作成に失敗:', tplError.message)
    return null
  }
  return created.id as string
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError

  let body: {
    lessonId?: unknown
    sentenceKey?: unknown
    tokens?: unknown
    answer?: unknown
    source?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { lessonId, sentenceKey, tokens, answer } = body
  if (typeof lessonId !== 'string' || !lessonId || lessonId.length > 200) {
    return NextResponse.json({ error: 'lessonId が必要です' }, { status: 400 })
  }
  if (!isSentenceKey(sentenceKey)) {
    return NextResponse.json({ error: 'sentenceKey が必要です' }, { status: 400 })
  }
  const tokensError = validateTokens(tokens)
  if (tokensError) return NextResponse.json({ error: tokensError }, { status: 400 })
  const answerError = validateAnswer(tokens as string[], answer)
  if (answerError) return NextResponse.json({ error: answerError }, { status: 400 })
  const source =
    typeof body.source === 'string' && body.source.length <= 200 ? body.source : lessonId

  const verified = verifySentenceTokens(lessonId, sentenceKey, tokens as string[])
  if (!verified) {
    return NextResponse.json({ error: '教材の文と一致しません' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'サーバの設定が不足しています' }, { status: 503 })
  }

  const noteTypeId = await ensureNoteType(admin)
  if (!noteTypeId) {
    return NextResponse.json({ error: 'ノートタイプの用意に失敗しました' }, { status: 500 })
  }

  // 個人デッキ「構文分析カード」（生徒本人がオーナー。RLSの範囲内で操作する）
  const { data: existingDeck } = await supabase
    .from('decks')
    .select('id')
    .eq('owner_id', user.id)
    .eq('name', SYNTAX_DECK_NAME)
    .is('parent_deck_id', null)
    .maybeSingle()

  let deckId = existingDeck?.id as string | undefined
  if (!deckId) {
    const { data: newDeck, error: deckError } = await supabase
      .from('decks')
      .insert({ name: SYNTAX_DECK_NAME, owner_id: user.id, is_distributed: false })
      .select('id')
      .single()
    if (deckError || !newDeck) {
      return NextResponse.json({ error: 'デッキの作成に失敗しました' }, { status: 500 })
    }
    deckId = newDeck.id as string
  }

  const fieldValues = buildCardFields(
    tokens as string[],
    answer as SentenceSyntaxWork['answer'],
    source
  )
  const sourceInfo = { reading: { lessonId, sentenceKey } }

  // 同じ文の確定し直しは上書き（カードと学習履歴はそのまま生きる）
  const { data: existingNote } = await supabase
    .from('notes')
    .select('id')
    .eq('deck_id', deckId)
    .contains('source_info', sourceInfo)
    .maybeSingle()

  if (existingNote) {
    const { error: updateError } = await supabase
      .from('notes')
      .update({ field_values: fieldValues, updated_at: new Date().toISOString() })
      .eq('id', existingNote.id)
    if (updateError) {
      return NextResponse.json({ error: 'カードの更新に失敗しました' }, { status: 500 })
    }
    return NextResponse.json({ noteId: existingNote.id, deckId, updated: true })
  }

  const { data: note, error: noteError } = await supabase
    .from('notes')
    .insert({
      deck_id: deckId,
      note_type_id: noteTypeId,
      field_values: fieldValues,
      source_info: sourceInfo,
    })
    .select('id')
    .single()
  if (noteError || !note) {
    return NextResponse.json({ error: 'カードの作成に失敗しました' }, { status: 500 })
  }

  const { error: cardError } = await supabase
    .from('cards')
    .insert({ note_id: note.id, deck_id: deckId, template_index: 0 })
  if (cardError) {
    return NextResponse.json({ error: 'カードの作成に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ noteId: note.id, deckId, updated: false })
}
