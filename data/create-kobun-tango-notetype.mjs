/**
 * ノートタイプ「古文単語演習A（単語→意味）」「古文単語演習B（例文→傍線部）」を作成。
 *
 * モードごとにフィールド構成が異なるため A/B を別ノートタイプにする。
 * 全ユーザーで使えるよう is_system: true（Basic/Cloze/識別演習 と同様）。
 * 出題UIは KobunTangoCard が「問題」(JSON) とフラットフィールドから組み立てる。
 *
 * Usage:
 *   node data/create-kobun-tango-notetype.mjs --dry-run
 *   node data/create-kobun-tango-notetype.mjs
 *   node data/create-kobun-tango-notetype.mjs --force   # 既存ならテンプレ/フィールドを更新
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { NOTE_TYPES } from './kobun-tango-template.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')
const DEFAULT_OWNER_EMAIL = 'gaimon.maam@gmail.com'

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

const env = loadEnv()
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function upsertNoteType(owner, def) {
  console.log(`\n— ${def.name}`)
  const { data: existing } = await supabase
    .from('note_types')
    .select('id')
    .eq('name', def.name)
    .maybeSingle()

  if (existing && !FORCE) {
    console.log(`   既に存在します (id=${existing.id})。--force で更新できます。`)
    return existing.id
  }

  if (DRY_RUN) {
    console.log('   [dry-run] note_types + card_templates を作成/更新します')
    console.log('   FIELDS:', def.fields.map((f) => f.name).join(', '))
    return null
  }

  let noteTypeId
  if (existing) {
    noteTypeId = existing.id
    const { error } = await supabase
      .from('note_types')
      .update({ fields: def.fields, is_system: true })
      .eq('id', noteTypeId)
    if (error) throw error
    console.log(`   note_type 更新 (id=${noteTypeId})`)
  } else {
    const { data: nt, error } = await supabase
      .from('note_types')
      .insert({ name: def.name, owner_id: owner.id, fields: def.fields, is_system: true })
      .select('id')
      .single()
    if (error) throw error
    noteTypeId = nt.id
    console.log(`   note_type 作成 (id=${noteTypeId})`)
  }

  const { data: existingTpl } = await supabase
    .from('card_templates')
    .select('id')
    .eq('note_type_id', noteTypeId)
    .order('ordinal')
    .limit(1)
    .maybeSingle()

  if (existingTpl) {
    const { error } = await supabase
      .from('card_templates')
      .update({ front_template: def.front, back_template: def.back, css: def.css })
      .eq('id', existingTpl.id)
    if (error) throw error
    console.log('   card_template 更新')
  } else {
    const { error } = await supabase.from('card_templates').insert({
      note_type_id: noteTypeId,
      name: def.cardName,
      ordinal: 0,
      front_template: def.front,
      back_template: def.back,
      css: def.css,
    })
    if (error) throw error
    console.log('   card_template 作成')
  }
  return noteTypeId
}

async function main() {
  console.log(`🔧 mode: ${DRY_RUN ? 'DRY-RUN' : FORCE ? 'FORCE' : '通常'}`)

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

  for (const def of NOTE_TYPES) {
    await upsertNoteType(owner, def)
  }

  console.log('\n✅ 完了')
}

main().catch((e) => {
  console.error('❌', e)
  process.exit(1)
})
