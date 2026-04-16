/**
 * 動詞の語法デッキにセクション別フィルタサブデッキを一括作成
 *
 * Usage: node data/create-filter-subdecks.mjs
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

// ── セクション定義（セクションタグ → サブデッキ名） ──
const SECTIONS = [
  { tag: '自動詞vs他動詞', name: '1. 自動詞vs他動詞', count: 24 },
  { tag: 'SVO_do', name: '2. SVO_do', count: 39 },
  { tag: 'SVO_to_do', name: '3. SVO_to_do', count: 33 },
  { tag: 'SVO_as_do', name: '4. SVO_as_do', count: 24 },
  { tag: 'SVC', name: '5. SVC', count: 51 },
  { tag: 'SVOO', name: '6. SVOO', count: 39 },
  { tag: '実はSVO', name: '7. 実はSVO', count: 60 },
  { tag: 'tell型/say型', name: '8. tell型/say型', count: 66 },
  { tag: 'rob型/provide型', name: '9. rob型/provide型', count: 48 },
  { tag: 'thank型/persuade型/prevent型', name: '10. thank型/persuade型/prevent型', count: 57 },
  { tag: 'suggest型/think型', name: '11. suggest型/think型', count: 69 },
  { tag: 'その他の語法', name: '12. その他の語法', count: 42 },
  { tag: '言う・貸す借りるの識別', name: '13. 言う・貸す借りるの識別', count: 30 },
]

const PARENT_DECK_NAME = '動詞の語法'

async function main() {
  // 1. 親デッキを検索
  const { data: decks, error: deckError } = await supabase
    .from('decks')
    .select('id, name, owner_id')
    .eq('name', PARENT_DECK_NAME)

  if (deckError || !decks || decks.length === 0) {
    console.error('❌ 親デッキ「動詞の語法」が見つかりません:', deckError)
    process.exit(1)
  }

  const parentDeck = decks[0]
  console.log(`✅ 親デッキ: ${parentDeck.name} (${parentDeck.id})`)

  // 2. 既存のサブデッキを確認
  const { data: existingSubdecks } = await supabase
    .from('decks')
    .select('id, name')
    .eq('parent_deck_id', parentDeck.id)

  if (existingSubdecks && existingSubdecks.length > 0) {
    console.log(`⚠️ 既存のサブデッキが ${existingSubdecks.length} 個あります:`)
    for (const sd of existingSubdecks) {
      console.log(`  - ${sd.name} (${sd.id})`)
    }
    console.log('  → スキップして新規のみ作成します')
  }

  const existingNames = new Set(existingSubdecks?.map(d => d.name) || [])

  // 3. サブデッキ作成
  let created = 0
  let skipped = 0

  for (const section of SECTIONS) {
    if (existingNames.has(section.name)) {
      console.log(`  ⏭ スキップ: ${section.name}（既存）`)
      skipped++
      continue
    }

    const { data: newDeck, error: createError } = await supabase
      .from('decks')
      .insert({
        name: section.name,
        owner_id: parentDeck.owner_id,
        is_distributed: false,
        parent_deck_id: parentDeck.id,
        filter_tags: [section.tag],
        settings: { new_cards_per_day: 20 },
      })
      .select()
      .single()

    if (createError) {
      console.error(`  ❌ 失敗: ${section.name}:`, createError.message)
    } else {
      console.log(`  ✅ 作成: ${section.name} → filter_tags: [${section.tag}] (${newDeck.id})`)
      created++
    }
  }

  console.log(`\n✅ 完了: ${created} 個作成, ${skipped} 個スキップ`)
}

main().catch(console.error)
