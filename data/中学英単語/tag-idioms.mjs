/**
 * 中学英単語デッキの「イディオム」ノートに タグ付与 + イディオム用フィルタサブデッキ作成
 *
 * idioms.json（[{ "w": 単語, "c": コロケーション }, ...]）に該当するノートへ
 * タグ「イディオム」を追加（既存タグは保持）。さらに親デッキ配下に
 * filter_tags=["イディオム"] のフィルタサブデッキ「★ イディオム（推測困難）」を作成する。
 *
 * Usage:
 *   node data/中学英単語/tag-idioms.mjs --dry-run
 *   node data/中学英単語/tag-idioms.mjs
 *   オプション: --idioms=idioms.json --deck="中学英単語 暗誦例文（学習指導要領2286語）"
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const DRY_RUN = process.argv.includes('--dry-run')
const arg = (k, d = '') => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d
const IDIOMS_FILE = path.join(__dirname, arg('idioms', 'idioms.json'))
const DECK_NAME = arg('deck', '中学英単語 暗誦例文（学習指導要領2286語）')
const SUBDECK_NAME = '★ イディオム（推測困難）'
const TAG = 'イディオム'

function loadEnv() {
  const content = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i).trim(), v = t.slice(i + 1).trim(); if (v) env[k] = v
  }
  return env
}
const env = loadEnv()
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function fetchAllNotes(deckId) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('notes').select('id, field_values, tags').eq('deck_id', deckId)
      .order('id', { ascending: true }).range(from, from + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

async function pool(items, n, fn) {
  let i = 0, done = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx]); done++
      if (done % 200 === 0) process.stdout.write(`   更新 ${done}/${items.length}\r`)
    }
  }))
}

async function main() {
  console.log(`🔧 mode: ${DRY_RUN ? 'DRY-RUN' : '通常'} / deck="${DECK_NAME}"`)
  const idioms = JSON.parse(fs.readFileSync(IDIOMS_FILE, 'utf-8'))
  const idiomSet = new Set(idioms.map(d => `${d.w}\t${d.c}`))
  console.log(`   idioms.json: ${idioms.length} 件（イディオム指定）`)

  const { data: decks } = await supabase.from('decks').select('id, owner_id').eq('name', DECK_NAME)
  if (!decks?.length) { console.error(`❌ 親デッキ「${DECK_NAME}」なし`); process.exit(1) }
  const deck = decks[0]
  console.log(`   親デッキ: ${deck.id}`)

  const notes = await fetchAllNotes(deck.id)
  console.log(`   ノート総数: ${notes.length}`)

  const toUpdate = []
  for (const note of notes) {
    const fv = note.field_values || {}
    const key = `${fv['単語']}\t${fv['コロケーション']}`
    if (!idiomSet.has(key)) continue
    const tags = Array.isArray(note.tags) ? note.tags : []
    if (tags.includes(TAG)) continue
    toUpdate.push({ id: note.id, tags: [...tags, TAG] })
  }
  console.log(`   タグ付与対象: ${toUpdate.length} ノート`)

  if (DRY_RUN) {
    console.log('✅ DRY-RUN（書き込みなし）')
  } else {
    await pool(toUpdate, 12, async (u) => {
      const { error } = await supabase.from('notes').update({ tags: u.tags }).eq('id', u.id)
      if (error) console.error(`\n   ❌ ${u.id}: ${error.message}`)
    })
    console.log(`\n   ✅ ${toUpdate.length} ノートにタグ「${TAG}」付与`)
  }

  // イディオム用フィルタサブデッキ
  const { data: existing } = await supabase
    .from('decks').select('id').eq('parent_deck_id', deck.id).eq('name', SUBDECK_NAME).maybeSingle()
  if (existing) {
    console.log(`   サブデッキ既存: ${existing.id}`)
  } else if (DRY_RUN) {
    console.log(`   📝 サブデッキ作成予定: ${SUBDECK_NAME} → filter_tags: [${TAG}]`)
  } else {
    const { data: nd, error } = await supabase.from('decks').insert({
      name: SUBDECK_NAME, owner_id: deck.owner_id, is_distributed: false,
      parent_deck_id: deck.id, filter_tags: [TAG], settings: { new_cards_per_day: 20 },
    }).select('id').single()
    if (error) console.error(`   ❌ サブデッキ作成失敗: ${error.message}`)
    else console.log(`   ✅ サブデッキ作成: ${SUBDECK_NAME} (${nd.id})`)
  }
  console.log('─────────────────────────────\n完了')
}

main().catch(e => { console.error('❌', e); process.exit(1) })
