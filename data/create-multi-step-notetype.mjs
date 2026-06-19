/**
 * ノートタイプ「識別演習」（多段階設問）を作成。
 *
 * 全ユーザーで使えるよう is_system: true で作成する（Basic/Cloze/画像マスキング と同様）。
 * 出題UIは MultiStepCard が「設問」(JSON)・「傍線」(JSON) から組み立てる。
 *
 * Usage:
 *   node data/create-multi-step-notetype.mjs --dry-run
 *   node data/create-multi-step-notetype.mjs
 *   node data/create-multi-step-notetype.mjs --force   # 既存ならテンプレ/フィールドを更新
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { NOTE_TYPE_NAME, FIELDS, FRONT_TEMPLATE, BACK_TEMPLATE, CSS } from './multi-step-template.mjs'

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

async function main() {
  console.log(`🔧 mode: ${DRY_RUN ? 'DRY-RUN' : FORCE ? 'FORCE' : '通常'} / "${NOTE_TYPE_NAME}"`)

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

  const { data: existing } = await supabase
    .from('note_types')
    .select('id')
    .eq('name', NOTE_TYPE_NAME)
    .maybeSingle()

  if (existing && !FORCE) {
    console.log(`   既に存在します (id=${existing.id})。--force で更新できます。`)
    return
  }

  if (DRY_RUN) {
    console.log('   [dry-run] note_types + card_templates を作成/更新します')
    console.log('   FIELDS:', FIELDS.map((f) => f.name).join(', '))
    return
  }

  let noteTypeId
  if (existing) {
    noteTypeId = existing.id
    const { error } = await supabase
      .from('note_types')
      .update({ fields: FIELDS, is_system: true })
      .eq('id', noteTypeId)
    if (error) throw error
    console.log(`   note_type 更新 (id=${noteTypeId})`)
  } else {
    const { data: nt, error } = await supabase
      .from('note_types')
      .insert({ name: NOTE_TYPE_NAME, owner_id: owner.id, fields: FIELDS, is_system: true })
      .select('id')
      .single()
    if (error) throw error
    noteTypeId = nt.id
    console.log(`   note_type 作成 (id=${noteTypeId})`)
  }

  // card_templates（1枚）
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
      .update({ front_template: FRONT_TEMPLATE, back_template: BACK_TEMPLATE, css: CSS })
      .eq('id', existingTpl.id)
    if (error) throw error
    console.log('   card_template 更新')
  } else {
    const { error } = await supabase.from('card_templates').insert({
      note_type_id: noteTypeId,
      name: '識別演習',
      ordinal: 0,
      front_template: FRONT_TEMPLATE,
      back_template: BACK_TEMPLATE,
      css: CSS,
    })
    if (error) throw error
    console.log('   card_template 作成')
  }

  console.log('✅ 完了')
}

main().catch((e) => {
  console.error('❌', e)
  process.exit(1)
})
