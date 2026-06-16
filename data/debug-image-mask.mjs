// 画像マスキングノートの実データ調査（前面空白の切り分け用）
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
function loadEnv() {
  const content = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}
const env = loadEnv()
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], {
  auth: { autoRefreshToken: false, persistSession: false },
})

const NAME = '画像マスキング'

const { data: nts } = await supabase.from('note_types').select('id,name,fields,is_system').eq('name', NAME)
console.log(`note_types named "${NAME}": ${nts?.length || 0}`)
for (const nt of nts || []) {
  console.log(`  id=${nt.id} is_system=${nt.is_system}`)
  console.log(`  fields=${JSON.stringify(nt.fields.map((f) => f.name))}`)
  const { data: tpls } = await supabase
    .from('card_templates')
    .select('ordinal,front_template,back_template')
    .eq('note_type_id', nt.id)
    .order('ordinal')
  console.log(`  templates: ${tpls?.length || 0}`)
  for (const t of tpls || []) {
    console.log(`    [ord ${t.ordinal}] front="${t.front_template}"`)
  }
  // 最新のこのノートタイプのノート
  const { data: notes } = await supabase
    .from('notes')
    .select('id,field_values,created_at')
    .eq('note_type_id', nt.id)
    .order('created_at', { ascending: false })
    .limit(3)
  console.log(`  recent notes: ${notes?.length || 0}`)
  for (const n of notes || []) {
    const fv = n.field_values || {}
    const img = fv['画像'] || ''
    const mask = fv['マスク領域'] || ''
    let regionCount = 'parse-fail'
    try {
      const arr = JSON.parse(mask)
      regionCount = Array.isArray(arr) ? arr.length : 'not-array'
    } catch {}
    console.log(`    note ${n.id} @${n.created_at}`)
    console.log(`      画像: ${img ? img.slice(0, 80) : '(EMPTY)'}`)
    console.log(`      マスク領域: regions=${regionCount} keys=${Object.keys(fv).join(',')}`)
    // card 確認
    const { data: cards } = await supabase.from('cards').select('id,template_index').eq('note_id', n.id)
    console.log(`      cards: ${JSON.stringify(cards)}`)
  }
}
