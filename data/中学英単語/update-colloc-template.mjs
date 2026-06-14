/**
 * 既存の「コロケーション構文」ノートタイプの card_template（表/CSS）を最新定義に更新する。
 * 文脈アシスト {{文脈}} を表面に追加するため。テンプレ定義は colloc-template.mjs を共有。
 *
 * Usage:
 *   node data/中学英単語/update-colloc-template.mjs --dry-run
 *   node data/中学英単語/update-colloc-template.mjs
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { FRONT_TEMPLATE, BACK_TEMPLATE, CSS } from './colloc-template.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const DRY_RUN = process.argv.includes('--dry-run')
const DEFAULT_OWNER_EMAIL = 'gaimon.maam@gmail.com'
const NOTE_TYPE_NAME = 'コロケーション構文'

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

async function main() {
  console.log(`🔧 mode: ${DRY_RUN ? 'DRY-RUN' : '更新'} / noteType="${NOTE_TYPE_NAME}"`)
  const { data: teachers } = await supabase.from('profiles').select('id,email,role').in('role', ['teacher', 'admin']).limit(10)
  const owner = teachers.find(t => t.email === DEFAULT_OWNER_EMAIL) || teachers[0]

  const { data: nt } = await supabase.from('note_types').select('id').eq('name', NOTE_TYPE_NAME).eq('owner_id', owner.id).maybeSingle()
  if (!nt) { console.error('❌ ノートタイプが見つかりません'); process.exit(1) }

  const { data: tpls, error } = await supabase.from('card_templates').select('id,name,front_template,css').eq('note_type_id', nt.id)
  if (error) { console.error('❌ テンプレ取得:', error.message); process.exit(1) }
  console.log(`   ノートタイプ ${nt.id} / テンプレ ${tpls.length} 件`)

  for (const t of tpls) {
    const willChange = t.front_template !== FRONT_TEMPLATE || t.css !== CSS
    console.log(`   - ${t.name}: ${willChange ? '更新あり' : '変更なし'}`)
  }
  if (DRY_RUN) { console.log('✅ DRY-RUN（書き込みなし）'); return }

  for (const t of tpls) {
    const { error: ue } = await supabase.from('card_templates')
      .update({ front_template: FRONT_TEMPLATE, back_template: BACK_TEMPLATE, css: CSS }).eq('id', t.id)
    if (ue) console.error(`❌ 更新失敗 ${t.id}`, ue.message)
  }
  console.log(`─────────────────────────────\n✅ 完了 / テンプレ ${tpls.length} 件更新`)
}
main().catch(e => { console.error('❌', e); process.exit(1) })
