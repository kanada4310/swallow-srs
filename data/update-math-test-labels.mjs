/**
 * 数式テストデッキに「見出し」フィールドを追加し、各ノートに短い見出しを設定する。
 * 庭の名札を読みやすくするため（pickLabel が「見出し」を最優先で表示）。
 *
 * Usage: node data/update-math-test-labels.mjs
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv() {
  const env = {}
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const v = t.slice(i + 1).trim(); if (v) env[t.slice(0, i).trim()] = v
  }
  return env
}
const env = loadEnv()
const sb = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DECK_NAME = '数式テスト（KaTeX 確認用）'

// 内容のキーワード → 見出し
function headingFor(fv) {
  const s = JSON.stringify(fv)
  if (s.includes('mc^2')) return '質量とエネルギー'
  if (s.includes('解の公式')) return '二次方程式の解の公式'
  if (s.includes('\\\\sum') || s.includes('\\sum')) return '1〜nの和'
  if (s.includes('\\\\sin') || s.includes('\\sin')) return '三角関数の恒等式'
  if (s.includes('pmatrix')) return '単位行列'
  if (s.includes('\\\\int') || s.includes('\\int')) return '定積分'
  if (s.includes('2H_2')) return '水の生成反応'
  if (s.includes('画像表示')) return '図形（三角形）'
  return null
}

;(async () => {
  const { data: deck } = await sb.from('decks').select('id').eq('name', DECK_NAME).maybeSingle()
  if (!deck) { console.error('❌ デッキが見つかりません:', DECK_NAME); process.exit(1) }

  // ノートタイプに「見出し」フィールドを追加（無ければ）
  const { data: notes } = await sb.from('notes').select('id, note_type_id, field_values').eq('deck_id', deck.id)
  if (!notes?.length) { console.error('❌ ノートがありません'); process.exit(1) }
  const noteTypeId = notes[0].note_type_id
  const { data: nt } = await sb.from('note_types').select('id, fields').eq('id', noteTypeId).single()
  const fields = Array.isArray(nt.fields) ? nt.fields : []
  if (!fields.some(f => f.name === '見出し')) {
    const newFields = [{ name: '見出し', ord: 0, settings: {} }, ...fields.map((f, i) => ({ ...f, ord: i + 1 }))]
    const { error } = await sb.from('note_types').update({ fields: newFields }).eq('id', noteTypeId)
    if (error) { console.error('❌ フィールド追加失敗:', error.message); process.exit(1) }
    console.log('📝 「見出し」フィールドを追加')
  } else {
    console.log('📝 「見出し」フィールドは既存')
  }

  // 各ノートに見出しを設定
  let updated = 0
  for (const n of notes) {
    if (n.field_values?.見出し) continue
    const h = headingFor(n.field_values)
    if (!h) { console.warn('   ⚠ 見出し未判定:', JSON.stringify(n.field_values).slice(0, 50)); continue }
    const fv = { ...n.field_values, 見出し: h }
    const { error } = await sb.from('notes').update({ field_values: fv }).eq('id', n.id)
    if (error) { console.error('   ❌ 更新失敗:', error.message); continue }
    updated++
    console.log(`   ✓ ${h}`)
  }
  console.log(`✅ 完了: ${updated} ノート更新 / 全 ${notes.length}`)
  console.log('   ※ 再同期（再ログイン or バックグラウンド同期）で庭の名札に反映')
})()
