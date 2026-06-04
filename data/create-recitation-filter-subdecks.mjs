/**
 * 英語構文 暗誦例文デッキに Lesson 別フィルタサブデッキを一括作成
 *
 * 親デッキ「英語構文 暗誦例文（Lesson1-10）」配下に、各 Lesson タグ
 * (Lesson1〜Lesson10 / Review1) で絞り込むフィルタサブデッキを作る。
 *
 * Usage:
 *   node data/create-recitation-filter-subdecks.mjs            # 実行
 *   node data/create-recitation-filter-subdecks.mjs --dry-run  # 確認のみ
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const DRY_RUN = process.argv.includes('--dry-run')

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

// ── セクション定義（タグ → サブデッキ名）。教材の並び順（L1-5 → R1 → L6-10）に合わせ
//    名前は 2 桁ゼロ埋めの番号付きで一覧表示時のソートを安定させる ──
const SECTIONS = [
  { tag: 'Lesson1', name: '01. Lesson 1' },
  { tag: 'Lesson2', name: '02. Lesson 2' },
  { tag: 'Lesson3', name: '03. Lesson 3' },
  { tag: 'Lesson4', name: '04. Lesson 4' },
  { tag: 'Lesson5', name: '05. Lesson 5' },
  { tag: 'Review1', name: '06. Review 1' },
  { tag: 'Lesson6', name: '07. Lesson 6' },
  { tag: 'Lesson7', name: '08. Lesson 7' },
  { tag: 'Lesson8', name: '09. Lesson 8' },
  { tag: 'Lesson9', name: '10. Lesson 9' },
  { tag: 'Lesson10', name: '11. Lesson 10' },
]

const PARENT_DECK_NAME = '英語構文 暗誦例文（Lesson1-10）'

async function main() {
  console.log(`🔧 mode: ${DRY_RUN ? 'DRY-RUN（書き込みなし）' : '通常'}`)

  // 1. 親デッキを検索
  const { data: decks, error: deckError } = await supabase
    .from('decks')
    .select('id, name, owner_id')
    .eq('name', PARENT_DECK_NAME)

  if (deckError || !decks || decks.length === 0) {
    console.error(`❌ 親デッキ「${PARENT_DECK_NAME}」が見つかりません:`, deckError)
    process.exit(1)
  }

  const parentDeck = decks[0]
  console.log(`✅ 親デッキ: ${parentDeck.name} (${parentDeck.id})`)

  // 2. 既存のサブデッキを確認（重複作成を防ぐ）
  const { data: existingSubdecks } = await supabase
    .from('decks')
    .select('id, name')
    .eq('parent_deck_id', parentDeck.id)

  if (existingSubdecks && existingSubdecks.length > 0) {
    console.log(`⚠️ 既存のサブデッキが ${existingSubdecks.length} 個あります:`)
    for (const sd of existingSubdecks) {
      console.log(`  - ${sd.name} (${sd.id})`)
    }
    console.log('  → 同名はスキップして新規のみ作成します')
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

    if (DRY_RUN) {
      console.log(`  📝 作成予定: ${section.name} → filter_tags: [${section.tag}]`)
      created++
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

  console.log('─────────────────────────────')
  if (DRY_RUN) {
    console.log(`✅ DRY-RUN 完了（書き込みなし）: ${created} 個作成予定, ${skipped} 個スキップ`)
  } else {
    console.log(`✅ 完了: ${created} 個作成, ${skipped} 個スキップ`)
  }
}

main().catch(console.error)
