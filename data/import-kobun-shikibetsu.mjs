/**
 * 元教材プロトタイプ（つばめ古文 識別演習 index.html）の QUESTION_DATA を読み込み、
 * ノートタイプ「識別演習」のデッキとして投入する。
 *
 * 1例文＝1ノート＝1カード。例文に紐づく全設問（根拠問題・傍線含む）を
 * 「設問」(JSON)・「傍線」(JSON) フィールドにそのまま格納する（パーサが snake_case 対応）。
 *
 * 前提: 先に `node data/create-multi-step-notetype.mjs` でノートタイプを作成しておくこと。
 *
 * Usage:
 *   node data/import-kobun-shikibetsu.mjs --dry-run
 *   node data/import-kobun-shikibetsu.mjs
 *   node data/import-kobun-shikibetsu.mjs "G:\\path\\to\\index.html"
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { NOTE_TYPE_NAME } from './multi-step-template.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DRY_RUN = process.argv.includes('--dry-run')
const DEFAULT_OWNER_EMAIL = 'gaimon.maam@gmail.com'
const DECK_NAME = '識別演習（古文）'
const DEFAULT_HTML =
  'G:\\.shortcut-targets-by-id\\1VHh7Hw_gsOC0bYuPoFjxD5iyQcHO88vV\\合同会社つばめ\\07_プログラム\\SRS\\index.html'

const htmlPathArg = process.argv.find((a) => a.endsWith('.html'))
const HTML_PATH = htmlPathArg || DEFAULT_HTML

function loadEnv() {
  const content = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim()
    if (v) env[k] = v
  }
  return env
}

/** index.html から `const QUESTION_DATA = [ ... ];` の配列リテラルを抽出して評価する。 */
function extractQuestionData(html) {
  const marker = 'const QUESTION_DATA'
  const mi = html.indexOf(marker)
  if (mi === -1) throw new Error('QUESTION_DATA が見つかりません')
  const start = html.indexOf('[', mi)
  if (start === -1) throw new Error('QUESTION_DATA の配列開始が見つかりません')

  let depth = 0
  let inStr = false
  let esc = false
  let end = -1
  for (let i = start; i < html.length; i++) {
    const c = html[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end === -1) throw new Error('QUESTION_DATA の配列終端が見つかりません')
  const arrText = html.slice(start, end + 1)
  // 信頼できるローカルファイルの配列リテラルを評価
  return new Function('return ' + arrText)()
}

const env = loadEnv()
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log(`📜 ${DRY_RUN ? 'DRY-RUN' : '投入'} / "${DECK_NAME}"`)
  console.log(`   元データ: ${HTML_PATH}`)

  const html = fs.readFileSync(HTML_PATH, 'utf-8')
  const data = extractQuestionData(html)

  // ノート化（1例文＝1ノート）
  const noteRows = []
  for (const word of data) {
    for (const ex of word.examples || []) {
      const questions = ex.questions || []
      if (questions.length === 0) continue
      noteRows.push({
        field_values: {
          例文: ex.text || '',
          識別対象: word.target_word || '',
          出典: ex.source || '',
          現代語訳: ex.modern_translation || '',
          傍線: JSON.stringify(ex.highlights || []),
          設問: JSON.stringify(questions),
          補足: '',
        },
        tags: [`識別:${word.target_word || ''}`],
      })
    }
  }
  console.log(`   対象語 ${data.length} 語 / 例文(ノート) ${noteRows.length} 件`)

  if (DRY_RUN) {
    const sample = noteRows[0]
    console.log('   [dry-run] 先頭ノート:', {
      例文: sample.field_values.例文,
      識別対象: sample.field_values.識別対象,
      設問数: JSON.parse(sample.field_values.設問).length,
    })
    return
  }

  // オーナー
  const { data: teachers } = await supabase
    .from('profiles')
    .select('id,name,email,role')
    .in('role', ['teacher', 'admin'])
    .limit(10)
  if (!teachers || teachers.length === 0) {
    console.error('❌ 講師/管理者が見つかりません')
    process.exit(1)
  }
  const owner = teachers.find((t) => t.email === DEFAULT_OWNER_EMAIL) || teachers[0]
  console.log(`   オーナー: ${owner.name} (${owner.email})`)

  // ノートタイプ
  const { data: nt } = await supabase
    .from('note_types')
    .select('id')
    .eq('name', NOTE_TYPE_NAME)
    .maybeSingle()
  if (!nt) {
    console.error(`❌ ノートタイプ「${NOTE_TYPE_NAME}」が見つかりません。先に create-multi-step-notetype.mjs を実行してください。`)
    process.exit(1)
  }

  // デッキ（既存なら再利用）
  let deckId
  const { data: existingDeck } = await supabase
    .from('decks')
    .select('id')
    .eq('name', DECK_NAME)
    .eq('owner_id', owner.id)
    .maybeSingle()
  if (existingDeck) {
    deckId = existingDeck.id
    console.log(`   デッキ再利用 (id=${deckId})`)
  } else {
    const { data: deck, error } = await supabase
      .from('decks')
      .insert({ name: DECK_NAME, owner_id: owner.id, settings: { new_cards_per_day: 10 } })
      .select('id')
      .single()
    if (error) throw error
    deckId = deck.id
    console.log(`   デッキ作成 (id=${deckId})`)
  }

  // ノート＋カードを投入
  let created = 0
  for (const row of noteRows) {
    const { data: note, error: noteErr } = await supabase
      .from('notes')
      .insert({
        deck_id: deckId,
        note_type_id: nt.id,
        field_values: row.field_values,
        tags: row.tags,
      })
      .select('id')
      .single()
    if (noteErr) throw noteErr

    const { error: cardErr } = await supabase.from('cards').insert({
      note_id: note.id,
      deck_id: deckId,
      template_index: 0,
    })
    if (cardErr) throw cardErr
    created++
  }

  console.log(`✅ 完了: ${created} ノート/カードを投入`)
}

main().catch((e) => {
  console.error('❌', e)
  process.exit(1)
})
