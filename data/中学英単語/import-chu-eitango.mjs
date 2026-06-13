/**
 * 中学英単語 暗誦例文デッキ インポートスクリプト
 *
 * Usage:
 *   node import-chu-eitango.mjs --tsv=deck_pilot.tsv --deck="中学英単語 暗誦例文（パイロット）" --dry-run
 *   node import-chu-eitango.mjs --tsv=deck_full.tsv  --deck="中学英単語 暗誦例文（学習指導要領2286語）"
 *   オプション: --force（既存ノートがあっても追加投入）, --owner=講師名
 *
 * .env.local から Supabase 接続情報を読み取り、
 * ノートタイプ「中学英単語（暗誦）」＋カードテンプレ＋デッキ作成 → ノート(+タグ)+カードをインポート。
 *
 * 元データ TSV 列: ID  単語  品詞  意味  コロケーション  和文  英文  タグ
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..') // data/中学英単語 -> repo root

const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')
const arg = (k, d = '') => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d
const OWNER_ARG = arg('owner')
const TSV_ARG = arg('tsv', 'deck_full.tsv')
const DECK_NAME = arg('deck', '中学英単語 暗誦例文（学習指導要領2286語）')

function loadEnv() {
  const content = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim(), v = t.slice(i + 1).trim()
    if (v) env[k] = v
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

const NOTE_TYPE_NAME = '中学英単語（暗誦）'
const TSV_FILE = path.isAbsolute(TSV_ARG) ? TSV_ARG : path.join(__dirname, TSV_ARG)

const FIELDS = [
  { name: '単語', ord: 0, settings: {} },
  { name: '品詞', ord: 1, settings: {} },
  { name: '意味', ord: 2, settings: {} },
  { name: 'コロケーション', ord: 3, settings: {} },
  { name: '和文', ord: 4, settings: {} },
  { name: '英文', ord: 5, settings: {} },
  { name: '英文穴埋め', ord: 6, settings: {} },
]

// 表面: 穴埋め英文 ＋ 和訳ヒント（暗誦させたい表現を空所に）
const FRONT_TEMPLATE = `<div class="prompt">空所に入る表現を考え、英文を声に出して暗誦しよう。</div>
<div class="cloze">{{英文穴埋め}}</div>
<div class="hint">{{和文}}</div>`

// 裏面: 完成英文（答えを強調）＋ 和訳 ＋ 語の参照情報
const BACK_TEMPLATE = `<div class="answer">{{英文}}</div>
<div class="ja">{{和文}}</div>
<hr>
<div class="ref">
  <span class="w">{{単語}}</span><span class="pos">（{{品詞}}）</span> … {{意味}}
  <div class="collo">表現：{{コロケーション}}</div>
</div>`

const CSS = `.card {
  font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  padding: 24px 20px; text-align: center; max-width: 640px; margin: 0 auto;
}
.prompt { color: #6b7280; font-size: 13px; margin-bottom: 20px; }
.cloze { font-size: 21px; line-height: 2.0; color: #1f2937; margin-bottom: 18px; }
.cloze .blank {
  color: #2563eb; font-weight: 700; letter-spacing: 1px;
  border-bottom: 2px solid #93c5fd; padding: 0 2px;
}
.hint { font-size: 16px; color: #6b7280; line-height: 1.7; }
.answer { font-size: 21px; color: #059669; line-height: 1.9; margin-bottom: 10px; }
.answer strong { color: #047857; text-decoration: underline; font-weight: 700; }
.ja { font-size: 16px; color: #4b5563; line-height: 1.7; }
hr { margin: 20px 0; border: none; border-top: 1px solid #e5e7eb; }
.ref { color: #6b7280; font-size: 14px; text-align: left; background: #f9fafb; border-radius: 8px; padding: 10px 14px; }
.ref .w { color: #374151; font-weight: 600; }
.ref .pos { color: #9ca3af; font-size: 12px; }
.ref .collo { margin-top: 4px; color: #2563eb; font-size: 13px; }`

function parseTsv() {
  const raw = fs.readFileSync(TSV_FILE, 'utf-8').replace(/^﻿/, '')
  const lines = raw.split('\n').map(l => l.replace(/\r$/, ''))
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const c = line.split('\t')
    if (c.length < 9) continue
    rows.push({
      id: c[0], word: c[1], pos: c[2], meaning: c[3],
      collo: c[4], ja: c[5], en: c[6], blank: c[7],
      tags: c[8].split('|').map(t => t.trim()).filter(Boolean),
    })
  }
  return rows
}

async function main() {
  console.log(`🔧 mode: ${DRY_RUN ? 'DRY-RUN' : FORCE ? 'FORCE' : '通常'} / deck="${DECK_NAME}" / tsv=${TSV_FILE}`)
  const rows = parseTsv()
  console.log(`   ${rows.length} ノート検出`)
  if (rows.length === 0) { console.error('❌ 0件です'); process.exit(1) }

  const { data: teachers, error: tErr } = await supabase
    .from('profiles').select('id, name, email, role').in('role', ['teacher', 'admin']).limit(10)
  if (tErr || !teachers?.length) { console.error('❌ 講師アカウントなし:', tErr?.message); process.exit(1) }
  // 既定オーナーは運用アカウント（gaimon.maam）を優先。--owner=名前 で上書き可。
  const DEFAULT_OWNER_EMAIL = 'gaimon.maam@gmail.com'
  let owner = teachers.find(t => t.email === DEFAULT_OWNER_EMAIL) || teachers[0]
  if (OWNER_ARG) {
    const m = teachers.find(t => t.name === OWNER_ARG || t.email === OWNER_ARG)
    if (!m) { console.error(`❌ 指定オーナー「${OWNER_ARG}」なし`); process.exit(1) }
    owner = m
  }
  const ownerId = owner.id
  console.log(`   オーナー: ${owner.name} (${owner.role})`)

  const { data: existingDeck } = await supabase
    .from('decks').select('id').eq('name', DECK_NAME).eq('owner_id', ownerId).maybeSingle()
  if (existingDeck) {
    const { count } = await supabase.from('notes').select('id', { count: 'exact', head: true }).eq('deck_id', existingDeck.id)
    console.log(`   既存デッキあり (${existingDeck.id}) / 既存ノート ${count ?? 0} 件`)
    if ((count ?? 0) > 0 && !FORCE && !DRY_RUN) {
      console.error('⛔ 既にノートが存在します。--force で追加投入できます。'); process.exit(1)
    }
  }

  if (DRY_RUN) {
    console.log('─────────────────────────────')
    console.log(`✅ DRY-RUN 完了 / 投入予定 ${rows.length} ノート`)
    const s = rows[0]
    console.log(`   サンプル: [${s.id}] ${s.word}（${s.pos}）`)
    console.log(`     和文: ${s.ja}`)
    console.log(`     英文: ${s.en}`)
    console.log(`     表現: ${s.collo} / タグ: ${s.tags.join(', ')}`)
    return
  }

  // ノートタイプ
  const { data: existingNt } = await supabase
    .from('note_types').select('id').eq('name', NOTE_TYPE_NAME).eq('owner_id', ownerId).maybeSingle()
  let noteTypeId
  if (existingNt) {
    noteTypeId = existingNt.id
    console.log(`   既存ノートタイプ使用: ${noteTypeId}`)
  } else {
    const { data: nt, error: e } = await supabase
      .from('note_types').insert({ name: NOTE_TYPE_NAME, owner_id: ownerId, fields: FIELDS, is_system: false })
      .select('id').single()
    if (e) { console.error('❌ ノートタイプ作成失敗:', e.message); process.exit(1) }
    noteTypeId = nt.id
    const { error: te } = await supabase.from('card_templates').insert({
      note_type_id: noteTypeId, name: '和文→英文（暗誦）', ordinal: 0,
      front_template: FRONT_TEMPLATE, back_template: BACK_TEMPLATE, css: CSS,
    })
    if (te) { console.error('❌ テンプレート作成失敗:', te.message); process.exit(1) }
    console.log(`   ノートタイプ＋テンプレート作成: ${noteTypeId}`)
  }

  // デッキ
  let deckId
  if (existingDeck) { deckId = existingDeck.id; console.log(`   既存デッキ使用: ${deckId}`) }
  else {
    const { data: deck, error: e } = await supabase
      .from('decks').insert({ name: DECK_NAME, owner_id: ownerId, is_distributed: false, settings: { new_cards_per_day: 10 } })
      .select('id').single()
    if (e) { console.error('❌ デッキ作成失敗:', e.message); process.exit(1) }
    deckId = deck.id
    console.log(`   デッキ作成: ${deckId}`)
  }

  // ノート＋カード
  const BATCH = 100
  let createdNotes = 0, createdCards = 0, errors = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const bn = Math.floor(i / BATCH) + 1, tb = Math.ceil(rows.length / BATCH)
    const notesToInsert = batch.map(r => ({
      deck_id: deckId, note_type_id: noteTypeId,
      field_values: { '単語': r.word, '品詞': r.pos, '意味': r.meaning, 'コロケーション': r.collo, '和文': r.ja, '英文': r.en, '英文穴埋め': r.blank },
      tags: r.tags,
    }))
    const { data: ins, error: ne } = await supabase.from('notes').insert(notesToInsert).select('id')
    if (ne) { console.error(`   ❌ バッチ ${bn}/${tb} ノート挿入エラー:`, ne.message); errors += batch.length; continue }
    createdNotes += ins.length
    const cards = ins.map(n => ({ note_id: n.id, deck_id: deckId, template_index: 0 }))
    const { data: ic, error: ce } = await supabase.from('cards').insert(cards).select('id')
    if (ce) console.error(`   ❌ バッチ ${bn}/${tb} カード作成エラー:`, ce.message)
    else createdCards += ic.length
    process.stdout.write(`   バッチ ${bn}/${tb} (${createdNotes}ノート, ${createdCards}カード)\r`)
  }
  console.log('\n─────────────────────────────')
  console.log('✅ インポート完了')
  console.log(`   ノートタイプ: ${noteTypeId}`)
  console.log(`   デッキ:       ${deckId} (${DECK_NAME})`)
  console.log(`   ノート:       ${createdNotes} / ${rows.length} / カード: ${createdCards}`)
  if (errors) console.log(`   エラー:       ${errors}`)
}

main().catch(e => { console.error('❌ 予期しないエラー:', e); process.exit(1) })
