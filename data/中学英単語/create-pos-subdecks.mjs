/**
 * 中学英単語 暗誦例文デッキに「品詞別」フィルタサブデッキを一括作成
 *
 * 親デッキ「中学英単語 暗誦例文（学習指導要領2286語）」配下に、各品詞タグ
 * (品詞:名詞 など) で絞り込むフィルタサブデッキを作る。
 * 新規カードはタグでフィルタ、復習カードは親デッキ全体から（フィルタデッキ仕様）。
 *
 * Usage:
 *   node data/中学英単語/create-pos-subdecks.mjs            # 実行
 *   node data/中学英単語/create-pos-subdecks.mjs --dry-run  # 確認のみ
 *   オプション: --parent="..." で親デッキ名を上書き
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

const DRY_RUN = process.argv.includes('--dry-run')
const arg = (k, d = '') => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d
const PARENT_DECK_NAME = arg('parent', '中学英単語 暗誦例文（学習指導要領2286語）')

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

// 品詞 → サブデッキ名（番号ゼロ埋めで一覧ソートを安定化）。文法的な並び順。
const SECTIONS = [
  { pos: '名詞', name: '01. 名詞' },
  { pos: '代名詞', name: '02. 代名詞' },
  { pos: '動詞', name: '03. 動詞' },
  { pos: '助動詞', name: '04. 助動詞' },
  { pos: '形容詞', name: '05. 形容詞' },
  { pos: '副詞', name: '06. 副詞' },
  { pos: '前置詞', name: '07. 前置詞' },
  { pos: '接続詞', name: '08. 接続詞' },
  { pos: '冠詞', name: '09. 冠詞' },
  { pos: '間投詞', name: '10. 間投詞' },
]

async function main() {
  console.log(`🔧 mode: ${DRY_RUN ? 'DRY-RUN（書き込みなし）' : '通常'} / parent="${PARENT_DECK_NAME}"`)

  const { data: decks, error: deckError } = await supabase
    .from('decks').select('id, name, owner_id').eq('name', PARENT_DECK_NAME)
  if (deckError || !decks?.length) {
    console.error(`❌ 親デッキ「${PARENT_DECK_NAME}」が見つかりません:`, deckError?.message)
    process.exit(1)
  }
  const parentDeck = decks[0]
  console.log(`✅ 親デッキ: ${parentDeck.name} (${parentDeck.id})`)

  const { data: existingSubdecks } = await supabase
    .from('decks').select('id, name').eq('parent_deck_id', parentDeck.id)
  const existingNames = new Set(existingSubdecks?.map(d => d.name) || [])
  if (existingSubdecks?.length) {
    console.log(`⚠️ 既存サブデッキ ${existingSubdecks.length} 個 → 同名はスキップ`)
  }

  let created = 0, skipped = 0
  for (const section of SECTIONS) {
    if (existingNames.has(section.name)) {
      console.log(`  ⏭ スキップ: ${section.name}（既存）`); skipped++; continue
    }
    const tag = `品詞:${section.pos}`
    if (DRY_RUN) {
      console.log(`  📝 作成予定: ${section.name} → filter_tags: [${tag}]`); created++; continue
    }
    const { data: newDeck, error: e } = await supabase
      .from('decks').insert({
        name: section.name,
        owner_id: parentDeck.owner_id,
        is_distributed: false,
        parent_deck_id: parentDeck.id,
        filter_tags: [tag],
        settings: { new_cards_per_day: 20 },
      }).select().single()
    if (e) console.error(`  ❌ 失敗: ${section.name}:`, e.message)
    else { console.log(`  ✅ 作成: ${section.name} → filter_tags: [${tag}] (${newDeck.id})`); created++ }
  }

  console.log('─────────────────────────────')
  console.log(`✅ ${DRY_RUN ? 'DRY-RUN ' : ''}完了: ${created} 個${DRY_RUN ? '作成予定' : '作成'}, ${skipped} 個スキップ`)
}

main().catch(console.error)
