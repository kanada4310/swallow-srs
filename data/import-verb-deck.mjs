/**
 * 動詞の語法デッキ インポートスクリプト
 *
 * Usage: node data/import-verb-deck.mjs
 *
 * .env.local から Supabase 接続情報を読み取り、
 * ノートタイプ・デッキ作成 → 582ノート+タグをインポート
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

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
    if (val) env[key] = val  // 空値は無視（重複キー対策）
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
const NOTE_TYPE_NAME = '動詞の語法'
const DECK_NAME = '動詞の語法'
const TSV_FILE = path.join(__dirname, '動詞の語法_統合.tsv')

const FIELDS = [
  { name: '日本語文', ord: 0, settings: {} },
  { name: '指定動詞', ord: 1, settings: {} },
  { name: 'パーツ', ord: 2, settings: {} },
  { name: '正答', ord: 3, settings: {} },
  { name: 'ID', ord: 4, settings: {} },
]

const FRONT_TEMPLATE = `<div class="prompt">次の日本語を、指定動詞を使って英訳せよ。</div>
<div class="japanese">{{日本語文}}</div>
<div class="meta">
  <div class="verb">指定動詞：<strong>{{指定動詞}}</strong></div>
  <div class="parts">パーツ：{{パーツ}}</div>
</div>`

const BACK_TEMPLATE = `{{FrontSide}}
<hr>
<div class="answer">{{正答}}</div>`

const CSS = `.card {
  font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  padding: 24px 20px;
  text-align: center;
  max-width: 600px;
  margin: 0 auto;
}
.prompt {
  color: #6b7280;
  font-size: 13px;
  margin-bottom: 20px;
}
.japanese {
  font-size: 21px;
  line-height: 1.7;
  margin-bottom: 24px;
  color: #1f2937;
}
.meta {
  background: #f3f4f6;
  border-radius: 8px;
  padding: 12px 16px;
  text-align: left;
}
.verb {
  color: #2563eb;
  font-size: 17px;
  margin-bottom: 6px;
}
.parts {
  color: #6b7280;
  font-size: 15px;
}
hr {
  margin: 24px 0;
  border: none;
  border-top: 1px solid #e5e7eb;
}
.answer {
  font-size: 21px;
  color: #059669;
  line-height: 1.7;
}`

// ── TSV パーサー ──
function parseTsv() {
  const raw = fs.readFileSync(TSV_FILE, 'utf-8').replace(/^\uFEFF/, '')
  const lines = raw.split('\n').map(l => l.replace(/\r$/, ''))
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = line.split('\t')
    if (cols.length < 6) continue

    rows.push({
      id: cols[0],
      japanese: cols[1],
      verb: cols[2],
      parts: cols[3],
      answer: cols[4],
      tags: cols[5].split('|').filter(t => t.trim()),
    })
  }
  return rows
}

// ── メイン ──
async function main() {
  console.log('🔍 TSV読み込み中...')
  const rows = parseTsv()
  console.log(`   ${rows.length} エントリ検出`)

  // オーナーを取得（teacher or admin）
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

  // 複数いる場合はリスト表示
  if (teachers.length > 1) {
    console.log('   講師一覧:')
    teachers.forEach((t, i) => console.log(`   [${i}] ${t.name} (${t.role})`))
    console.log(`   → 最初の講師を使用: ${teachers[0].name}`)
  }

  const ownerId = teachers[0].id
  console.log(`   オーナー: ${teachers[0].name} (${teachers[0].role})`)

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
      .insert({
        name: NOTE_TYPE_NAME,
        owner_id: ownerId,
        fields: FIELDS,
        is_system: false,
      })
      .select('id')
      .single()

    if (ntErr) {
      console.error('❌ ノートタイプ作成失敗:', ntErr.message)
      process.exit(1)
    }
    noteTypeId = nt.id
    console.log(`   作成完了: ${noteTypeId}`)

    // テンプレート作成
    const { error: tmplErr } = await supabase
      .from('card_templates')
      .insert({
        note_type_id: noteTypeId,
        name: '日本語→英語',
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
  const { data: existingDeck } = await supabase
    .from('decks')
    .select('id')
    .eq('name', DECK_NAME)
    .eq('owner_id', ownerId)
    .maybeSingle()

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
        '日本語文': row.japanese,
        '指定動詞': row.verb,
        'パーツ': row.parts,
        '正答': row.answer,
        'ID': row.id,
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

    // カード作成（1ノート = 1カード）
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
  console.log(`   デッキ:       ${deckId}`)
  console.log(`   ノート:       ${createdNotes} / ${rows.length}`)
  console.log(`   カード:       ${createdCards}`)
  if (errorCount > 0) {
    console.log(`   エラー:       ${errorCount}`)
  }
}

main().catch(err => {
  console.error('❌ 予期しないエラー:', err)
  process.exit(1)
})
