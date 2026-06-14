/**
 * 中学英単語 コロケーション構文デッキ（パイロット）インポート
 *
 * colloc_notes.json（コロケーション=1ノート, 例文プールJSON付き）を投入。
 * ノートタイプ「コロケーション構文」: 見出し語/語義/コア/スロット型/例文プール。
 * 表示用フィールド(英文穴埋め/和文/英文)は StudyCard が例文プールから展開する。
 *
 * Usage:
 *   node data/中学英単語/import-colloc-deck.mjs --dry-run
 *   node data/中学英単語/import-colloc-deck.mjs
 *   オプション: --notes=colloc_notes.json --deck="中学英単語 コロケーション（パイロット50語）"
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { FIELDS, FRONT_TEMPLATE, BACK_TEMPLATE, CSS } from './colloc-template.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')
const arg = (k, d = '') => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d
const NOTES_FILE = path.join(__dirname, arg('notes', 'colloc_notes.json'))
const DECK_NAME = arg('deck', '中学英単語 コロケーション（パイロット50語）')
const DEFAULT_OWNER_EMAIL = 'gaimon.maam@gmail.com'

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

const NOTE_TYPE_NAME = 'コロケーション構文'

async function main() {
  console.log(`🔧 mode: ${DRY_RUN ? 'DRY-RUN' : FORCE ? 'FORCE' : '通常'} / deck="${DECK_NAME}"`)
  const notes = JSON.parse(fs.readFileSync(NOTES_FILE, 'utf-8'))
  console.log(`   ノート ${notes.length} 件`)
  if (!notes.length) { console.error('❌ 0件'); process.exit(1) }

  const { data: teachers } = await supabase.from('profiles').select('id,name,email,role').in('role', ['teacher', 'admin']).limit(10)
  const owner = teachers.find(t => t.email === DEFAULT_OWNER_EMAIL) || teachers[0]
  console.log(`   オーナー: ${owner.name} (${owner.email})`)

  const { data: existingDeck } = await supabase.from('decks').select('id').eq('name', DECK_NAME).eq('owner_id', owner.id).maybeSingle()
  if (existingDeck) {
    const { count } = await supabase.from('notes').select('id', { count: 'exact', head: true }).eq('deck_id', existingDeck.id)
    console.log(`   既存デッキ (${existingDeck.id}) / ノート ${count ?? 0}`)
    if ((count ?? 0) > 0 && !FORCE && !DRY_RUN) { console.error('⛔ 既存ノートあり。--force で追加'); process.exit(1) }
  }

  if (DRY_RUN) {
    const s = notes[0]
    const pool = JSON.parse(s['例文プール'])
    console.log('✅ DRY-RUN'); console.log(`   サンプル: ${s['見出し語']} / コア:${s['コア']} / 例文プール ${pool.length}本`)
    console.log(`     穴: ${pool[0].blank}`); console.log(`     答: ${pool[0].en}`)
    return
  }

  // ノートタイプ
  let ntId
  const { data: existingNt } = await supabase.from('note_types').select('id').eq('name', NOTE_TYPE_NAME).eq('owner_id', owner.id).maybeSingle()
  if (existingNt) { ntId = existingNt.id; console.log(`   既存ノートタイプ: ${ntId}`) }
  else {
    const { data: nt, error } = await supabase.from('note_types').insert({ name: NOTE_TYPE_NAME, owner_id: owner.id, fields: FIELDS, is_system: false }).select('id').single()
    if (error) { console.error('❌ ノートタイプ:', error.message); process.exit(1) }
    ntId = nt.id
    const { error: te } = await supabase.from('card_templates').insert({ note_type_id: ntId, name: 'コロケーション暗誦', ordinal: 0, front_template: FRONT_TEMPLATE, back_template: BACK_TEMPLATE, css: CSS })
    if (te) { console.error('❌ テンプレート:', te.message); process.exit(1) }
    console.log(`   ノートタイプ作成: ${ntId}`)
  }

  // デッキ
  let deckId
  if (existingDeck) { deckId = existingDeck.id }
  else {
    const { data: deck, error } = await supabase.from('decks').insert({ name: DECK_NAME, owner_id: owner.id, is_distributed: false, settings: { new_cards_per_day: 10 } }).select('id').single()
    if (error) { console.error('❌ デッキ:', error.message); process.exit(1) }
    deckId = deck.id; console.log(`   デッキ作成: ${deckId}`)
  }

  // ノート+カード
  const BATCH = 100
  let cn = 0, cc = 0
  for (let i = 0; i < notes.length; i += BATCH) {
    const batch = notes.slice(i, i + BATCH)
    const toInsert = batch.map(n => ({
      deck_id: deckId, note_type_id: ntId,
      field_values: { '見出し語': n['見出し語'], '語義': n['語義'], 'コア': n['コア'], 'スロット型': n['スロット型'], '例文プール': n['例文プール'] },
      tags: n.tags || [],
    }))
    const { data: ins, error } = await supabase.from('notes').insert(toInsert).select('id')
    if (error) { console.error('❌ ノート挿入:', error.message); continue }
    cn += ins.length
    const cards = ins.map(x => ({ note_id: x.id, deck_id: deckId, template_index: 0 }))
    const { data: ic, error: ce } = await supabase.from('cards').insert(cards).select('id')
    if (ce) console.error('❌ カード:', ce.message); else cc += ic.length
  }
  console.log('─────────────────────────────')
  console.log(`✅ 完了 / ノートタイプ ${ntId} / デッキ ${deckId} (${DECK_NAME}) / ノート ${cn} カード ${cc}`)
}
main().catch(e => { console.error('❌', e); process.exit(1) })
