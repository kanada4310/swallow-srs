/**
 * 英語構文 暗誦例文デッキ インポートスクリプト
 *
 * Usage:
 *   node data/import-recitation-deck.mjs           # 投入（既存ノートがあれば中断）
 *   node data/import-recitation-deck.mjs --dry-run # 接続・件数・既存状態の確認のみ（書き込みなし）
 *   node data/import-recitation-deck.mjs --force    # 既存ノートがあっても追加投入する
 *
 * .env.local から Supabase 接続情報を読み取り、
 * ノートタイプ「英語構文」＋カードテンプレ＋デッキ作成 → 125ノート(+タグ)+カードをインポート。
 *
 * 元データ: data/英語構文_暗誦_Lesson1-10.tsv
 *   （quiz_generator/scripts/build_recitation_tsv.py が生成。太字は <strong> 済み）
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')
const OWNER_ARG = (process.argv.find(a => a.startsWith('--owner=')) || '').split('=')[1] || ''

// ── .env.local 読み込み ──
function loadEnv() {
  const envPath = path.join(ROOT, '.env.local')
  const content = fs.readFileSync(envPath, 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (val) env[key] = val
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_ROLE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── 定数 ──
const NOTE_TYPE_NAME = '英語構文'
const DECK_NAME = '英語構文 暗誦例文（Lesson1-10）'
const TSV_FILE = path.join(__dirname, '英語構文_暗誦_Lesson1-10.tsv')

const FIELDS = [
  { name: '和訳', ord: 0, settings: {} },
  { name: '構文', ord: 1, settings: {} },
  { name: '語彙パーツ', ord: 2, settings: {} },
  { name: '正解英文', ord: 3, settings: {} },
  { name: 'ページ', ord: 4, settings: {} },
  { name: '問題番号', ord: 5, settings: {} },
]

const FRONT_TEMPLATE = `<div class="prompt">和訳とヒントを手がかりに、英文を暗誦せよ。</div>
<div class="japanese">{{和訳}}</div>
<div class="meta">
  <div class="kobun">構文：<strong>{{構文}}</strong></div>
  <div class="parts">語彙：{{語彙パーツ}}</div>
</div>`

const BACK_TEMPLATE = `{{FrontSide}}
<hr>
<div class="answer">{{正解英文}}</div>
<div class="source">{{ページ}} ・ {{問題番号}}</div>`

const CSS = `.card {
  font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  padding: 24px 20px;
  text-align: center;
  max-width: 640px;
  margin: 0 auto;
}
.prompt {
  color: #6b7280;
  font-size: 13px;
  margin-bottom: 20px;
}
.japanese {
  font-size: 21px;
  line-height: 1.8;
  margin-bottom: 24px;
  color: #1f2937;
}
.japanese strong { color: #dc2626; }
.meta {
  background: #f3f4f6;
  border-radius: 8px;
  padding: 12px 16px;
  text-align: left;
}
.kobun {
  color: #2563eb;
  font-size: 16px;
  margin-bottom: 6px;
}
.parts {
  color: #6b7280;
  font-size: 14px;
}
hr {
  margin: 24px 0;
  border: none;
  border-top: 1px solid #e5e7eb;
}
.answer {
  font-size: 21px;
  color: #059669;
  line-height: 1.8;
}
.answer strong { color: #047857; text-decoration: underline; }
.source {
  margin-top: 12px;
  color: #9ca3af;
  font-size: 12px;
}`

// ── TSV パーサー ──
function parseTsv() {
  const raw = fs.readFileSync(TSV_FILE, 'utf-8').replace(/^﻿/, '')
  const lines = raw.split('\n').map(l => l.replace(/\r$/, ''))
  const rows = []
  // ヘッダー: ID 和訳 構文 語彙パーツ 正解英文 ページ タグ
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const cols = line.split('\t')
    if (cols.length < 7) continue
    rows.push({
      id: cols[0],
      ja: cols[1],
      kobun: cols[2],
      parts: cols[3],
      answer: cols[4],
      page: cols[5],
      tags: cols[6].split('|').map(t => t.trim()).filter(Boolean),
    })
  }
  return rows
}

// ── メイン ──
async function main() {
  console.log(`🔧 mode: ${DRY_RUN ? 'DRY-RUN（書き込みなし）' : FORCE ? 'FORCE（重複ガード無効）' : '通常'}`)
  console.log('🔍 TSV読み込み中...')
  const rows = parseTsv()
  console.log(`   ${rows.length} エントリ検出`)
  if (rows.length === 0) {
    console.error('❌ エントリが0件です。TSVを確認してください。')
    process.exit(1)
  }

  // オーナー取得（teacher or admin）
  console.log('👤 講師アカウント取得中...')
  const { data: teachers, error: tErr } = await supabase
    .from('profiles')
    .select('id, name, role')
    .in('role', ['teacher', 'admin'])
    .limit(5)

  if (tErr || !teachers?.length) {
    console.error('❌ 講師アカウントが見つかりません:', tErr?.message)
    process.exit(1)
  }
  if (teachers.length > 1) {
    console.log('   講師一覧:')
    teachers.forEach((t, i) => console.log(`   [${i}] ${t.name} (${t.role})`))
  }
  let owner = teachers[0]
  if (OWNER_ARG) {
    const match = teachers.find(t => t.name === OWNER_ARG)
    if (!match) {
      console.error(`❌ 指定オーナー「${OWNER_ARG}」が講師一覧に見つかりません`)
      process.exit(1)
    }
    owner = match
  }
  if (teachers.length > 1) console.log(`   → 使用する講師: ${owner.name}`)
  const ownerId = owner.id
  console.log(`   オーナー: ${owner.name} (${owner.role})`)

  // ── 既存デッキの重複チェック ──
  const { data: existingDeck } = await supabase
    .from('decks')
    .select('id')
    .eq('name', DECK_NAME)
    .eq('owner_id', ownerId)
    .maybeSingle()

  if (existingDeck) {
    const { count } = await supabase
      .from('notes')
      .select('id', { count: 'exact', head: true })
      .eq('deck_id', existingDeck.id)
    console.log(`   既存デッキあり (${existingDeck.id}) / 既存ノート ${count ?? 0} 件`)
    if ((count ?? 0) > 0 && !FORCE && !DRY_RUN) {
      console.error('⛔ 既にノートが存在します。重複投入を防ぐため中断します。')
      console.error('   追加投入する場合は --force を付けて再実行してください。')
      process.exit(1)
    }
  }

  if (DRY_RUN) {
    console.log('─────────────────────────────')
    console.log('✅ DRY-RUN 完了（書き込みは行っていません）')
    console.log(`   投入予定: ${rows.length} ノート / ノートタイプ「${NOTE_TYPE_NAME}」/ デッキ「${DECK_NAME}」`)
    console.log('   サンプル(1件目):')
    console.log(`     和訳: ${rows[0].ja}`)
    console.log(`     構文: ${rows[0].kobun}`)
    console.log(`     正解: ${rows[0].answer}`)
    console.log(`     タグ: ${rows[0].tags.join(', ')}`)
    return
  }

  // ── ノートタイプ作成 ──
  console.log('📝 ノートタイプ作成中...')
  const { data: existingNt } = await supabase
    .from('note_types')
    .select('id')
    .eq('name', NOTE_TYPE_NAME)
    .eq('owner_id', ownerId)
    .maybeSingle()

  let noteTypeId
  if (existingNt) {
    noteTypeId = existingNt.id
    console.log(`   既存のノートタイプを使用: ${noteTypeId}`)
  } else {
    const { data: nt, error: ntErr } = await supabase
      .from('note_types')
      .insert({ name: NOTE_TYPE_NAME, owner_id: ownerId, fields: FIELDS, is_system: false })
      .select('id')
      .single()
    if (ntErr) {
      console.error('❌ ノートタイプ作成失敗:', ntErr.message)
      process.exit(1)
    }
    noteTypeId = nt.id
    console.log(`   作成完了: ${noteTypeId}`)

    const { error: tmplErr } = await supabase
      .from('card_templates')
      .insert({
        note_type_id: noteTypeId,
        name: '和訳→英文（暗誦）',
        ordinal: 0,
        front_template: FRONT_TEMPLATE,
        back_template: BACK_TEMPLATE,
        css: CSS,
      })
    if (tmplErr) {
      console.error('❌ テンプレート作成失敗:', tmplErr.message)
      process.exit(1)
    }
    console.log('   テンプレート作成完了')
  }

  // ── デッキ作成 ──
  console.log('📦 デッキ作成中...')
  let deckId
  if (existingDeck) {
    deckId = existingDeck.id
    console.log(`   既存のデッキを使用: ${deckId}`)
  } else {
    const { data: deck, error: deckErr } = await supabase
      .from('decks')
      .insert({
        name: DECK_NAME,
        owner_id: ownerId,
        is_distributed: false,
        settings: { new_cards_per_day: 10 },
      })
      .select('id')
      .single()
    if (deckErr) {
      console.error('❌ デッキ作成失敗:', deckErr.message)
      process.exit(1)
    }
    deckId = deck.id
    console.log(`   作成完了: ${deckId}`)
  }

  // ── ノートインポート ──
  console.log('📥 ノートインポート中...')
  const BATCH_SIZE = 100
  let createdNotes = 0
  let createdCards = 0
  let errorCount = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE)

    const notesToInsert = batch.map(row => ({
      deck_id: deckId,
      note_type_id: noteTypeId,
      field_values: {
        '和訳': row.ja,
        '構文': row.kobun,
        '語彙パーツ': row.parts,
        '正解英文': row.answer,
        'ページ': row.page,
        '問題番号': row.id,
      },
      tags: row.tags,
    }))

    const { data: insertedNotes, error: notesErr } = await supabase
      .from('notes')
      .insert(notesToInsert)
      .select('id')

    if (notesErr) {
      console.error(`   ❌ バッチ ${batchNum}/${totalBatches} ノート挿入エラー:`, notesErr.message)
      errorCount += batch.length
      continue
    }
    createdNotes += insertedNotes.length

    const cardsToInsert = insertedNotes.map(note => ({
      note_id: note.id,
      deck_id: deckId,
      template_index: 0,
    }))

    const { data: insertedCards, error: cardsErr } = await supabase
      .from('cards')
      .insert(cardsToInsert)
      .select('id')

    if (cardsErr) {
      console.error(`   ❌ バッチ ${batchNum}/${totalBatches} カード作成エラー:`, cardsErr.message)
    } else {
      createdCards += insertedCards.length
    }
    process.stdout.write(`   バッチ ${batchNum}/${totalBatches} 完了 (${createdNotes}ノート, ${createdCards}カード)\r`)
  }

  console.log('')
  console.log('─────────────────────────────')
  console.log('✅ インポート完了')
  console.log(`   ノートタイプ: ${noteTypeId}`)
  console.log(`   デッキ:       ${deckId} (${DECK_NAME})`)
  console.log(`   ノート:       ${createdNotes} / ${rows.length}`)
  console.log(`   カード:       ${createdCards}`)
  if (errorCount > 0) console.log(`   エラー:       ${errorCount}`)
}

main().catch(err => {
  console.error('❌ 予期しないエラー:', err)
  process.exit(1)
})
