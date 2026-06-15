/**
 * 数式テスト用デッキ 投入スクリプト（Phase 13.4 実機確認用）
 *
 * Usage:
 *   node data/create-math-test-deck.mjs --dry-run  # 接続・オーナー確認のみ
 *   node data/create-math-test-deck.mjs            # 投入（既存があれば中断）
 *   node data/create-math-test-deck.mjs --force    # 既存でも追加投入
 *
 * KaTeX 対応デリミタ（\(…\) / \[…\] / $$…$$）と <img> 画像表示を確認するための
 * 小さなデッキ（ノートタイプ「数式テスト」＋ 数問）。オーナー既定= gaimon.maam。
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')

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

const NOTE_TYPE_NAME = '数式テスト'
const DECK_NAME = '数式テスト（KaTeX 確認用）'
const PREFERRED_OWNER_EMAIL = 'gaimon.maam@gmail.com'

const FIELDS = [
  { name: '問題', ord: 0, settings: {} },
  { name: '解答', ord: 1, settings: {} },
]

const FRONT_TEMPLATE = `<div class="q">{{問題}}</div>`
const BACK_TEMPLATE = `{{FrontSide}}\n<hr>\n<div class="a">{{解答}}</div>`
const CSS = `.card { font-family: 'Hiragino Sans','Noto Sans JP',sans-serif; padding: 24px 18px; text-align: center; max-width: 640px; margin: 0 auto; }
.q { font-size: 19px; line-height: 1.9; color: #1f2937; }
hr { margin: 20px 0; border: none; border-top: 1px solid #e5e7eb; }
.a { font-size: 19px; line-height: 1.9; color: #059669; }
.katex-display { margin: 0.6em 0; }`

// 問題/解答に数式デリミタ（\(…\) インライン, \[…\] / $$…$$ ディスプレイ）を含む
const NOTES = [
  { 問題: '質量とエネルギーの等価性を表す式は？', 解答: '\\(E = mc^2\\)' },
  { 問題: '二次方程式 \\(ax^2+bx+c=0\\) の解の公式は？', 解答: '\\[ x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} \\]' },
  { 問題: '1 から n までの自然数の和は？', 解答: '$$\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$$' },
  { 問題: '三角関数の基本（ピタゴラスの）恒等式は？', 解答: '\\(\\sin^2\\theta + \\cos^2\\theta = 1\\)' },
  { 問題: '\\(\\displaystyle\\int_0^1 x^2\\,dx\\) の値は？', 解答: '\\[ \\int_0^1 x^2\\,dx = \\frac{1}{3} \\]' },
  { 問題: '2×2 の単位行列を書け。', 解答: '$$\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}$$' },
  { 問題: '水の生成反応式（化学）を完成させよ。', 解答: '\\(2H_2 + O_2 \\rightarrow 2H_2O\\)' },
  {
    問題: '【画像表示テスト】下の図形は何角形？<br><img src="data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'110\'><polygon points=\'60,8 112,100 8,100\' fill=\'%23bfdbfe\' stroke=\'%232563eb\' stroke-width=\'3\'/></svg>" alt="三角形">',
    解答: '三角形（\\(n = 3\\)）',
  },
]

async function resolveOwner() {
  const { data: byEmail } = await supabase
    .from('profiles')
    .select('id,name,role,email')
    .eq('email', PREFERRED_OWNER_EMAIL)
    .maybeSingle()
  if (byEmail) return byEmail
  const { data: teachers } = await supabase
    .from('profiles')
    .select('id,name,role,email')
    .in('role', ['teacher', 'admin'])
    .limit(1)
  return teachers?.[0]
}

async function main() {
  console.log(`🔧 mode: ${DRY_RUN ? 'DRY-RUN' : FORCE ? 'FORCE' : '通常'}`)
  const owner = await resolveOwner()
  if (!owner) { console.error('❌ オーナー（講師/admin）が見つかりません'); process.exit(1) }
  console.log(`👤 オーナー: ${owner.name} <${owner.email}> (${owner.role})`)

  const { data: existingDeck } = await supabase
    .from('decks').select('id').eq('name', DECK_NAME).eq('owner_id', owner.id).maybeSingle()
  if (existingDeck) {
    const { count } = await supabase.from('notes').select('id', { count: 'exact', head: true }).eq('deck_id', existingDeck.id)
    console.log(`   既存デッキあり (${existingDeck.id}) / ノート ${count ?? 0} 件`)
    if ((count ?? 0) > 0 && !FORCE && !DRY_RUN) {
      console.error('⛔ 既にノートがあります。追加は --force。'); process.exit(1)
    }
  }

  if (DRY_RUN) {
    console.log(`✅ DRY-RUN 完了。投入予定: ${NOTES.length} ノート / 「${NOTE_TYPE_NAME}」/ 「${DECK_NAME}」`)
    return
  }

  // ノートタイプ
  let noteTypeId
  const { data: nt0 } = await supabase.from('note_types').select('id').eq('name', NOTE_TYPE_NAME).eq('owner_id', owner.id).maybeSingle()
  if (nt0) { noteTypeId = nt0.id; console.log(`📝 既存ノートタイプ使用: ${noteTypeId}`) }
  else {
    const { data: nt, error } = await supabase.from('note_types')
      .insert({ name: NOTE_TYPE_NAME, owner_id: owner.id, fields: FIELDS, is_system: false }).select('id').single()
    if (error) { console.error('❌ ノートタイプ作成失敗:', error.message); process.exit(1) }
    noteTypeId = nt.id
    const { error: tErr } = await supabase.from('card_templates').insert({
      note_type_id: noteTypeId, name: '問題→解答', ordinal: 0,
      front_template: FRONT_TEMPLATE, back_template: BACK_TEMPLATE, css: CSS,
    })
    if (tErr) { console.error('❌ テンプレート作成失敗:', tErr.message); process.exit(1) }
    console.log(`📝 ノートタイプ作成: ${noteTypeId}`)
  }

  // デッキ
  let deckId = existingDeck?.id
  if (!deckId) {
    const { data: deck, error } = await supabase.from('decks')
      .insert({ name: DECK_NAME, owner_id: owner.id, is_distributed: false, settings: { new_cards_per_day: 20 } })
      .select('id').single()
    if (error) { console.error('❌ デッキ作成失敗:', error.message); process.exit(1) }
    deckId = deck.id
  }
  console.log(`📦 デッキ: ${deckId}`)

  // ノート＋カード
  const notesToInsert = NOTES.map(n => ({ deck_id: deckId, note_type_id: noteTypeId, field_values: n, tags: ['数式テスト'] }))
  const { data: inserted, error: nErr } = await supabase.from('notes').insert(notesToInsert).select('id')
  if (nErr) { console.error('❌ ノート挿入失敗:', nErr.message); process.exit(1) }
  const cards = inserted.map(note => ({ note_id: note.id, deck_id: deckId, template_index: 0 }))
  const { error: cErr } = await supabase.from('cards').insert(cards)
  if (cErr) { console.error('❌ カード作成失敗:', cErr.message); process.exit(1) }

  console.log('─────────────────────────────')
  console.log(`✅ 完了: ${inserted.length} ノート / ${cards.length} カード`)
  console.log(`   デッキ: ${DECK_NAME} (${deckId})`)
  console.log('   ※ アプリで再ログイン or バックグラウンド同期後、/study で確認')
}

main().catch(e => { console.error('❌ 予期しないエラー:', e); process.exit(1) })
