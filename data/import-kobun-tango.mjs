/**
 * 古文単語315.json を読み込み、ノートタイプ「古文単語演習A／B」のデッキとして投入する。
 *
 * tango.html のモードA/B を SRS カードに統合（モードごとに別ノートタイプ）：
 *   モードA「古文単語演習A」: 1見出し語 = 1ノート（見出し語 → 該当する意味をすべて選ぶ・複数選択）
 *   モードB「古文単語演習B」: 1例文 = 1ノート（例文の傍線部 → 意味を四択で選ぶ）
 *
 * ダミー選択肢は tango.html と同じく「同品詞・正解と非類似」の語義プールを生成し、
 * 各ノートの「問題.distractors」に焼き込む（カードが毎レビューで抽出）。
 *
 * デッキ構成：親「古文単語315」（全カード）＋ フィルタサブデッキ
 *   「モードA（単語→意味）」filter_tags=['モードA'] / 「モードB（例文→意味）」filter_tags=['モードB']
 *
 * 前提: 先に `node data/create-kobun-tango-notetype.mjs` でノートタイプを作成しておくこと。
 *
 * Usage:
 *   node data/import-kobun-tango.mjs --dry-run
 *   node data/import-kobun-tango.mjs            # 既存デッキがあれば再利用（重複投入注意）
 *   node data/import-kobun-tango.mjs --reset    # 既存デッキ/旧単一ノートタイプを削除してから投入
 *   node data/import-kobun-tango.mjs "C:\\path\\to\\古文単語315.json"
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { NOTE_TYPE_A, NOTE_TYPE_B, LEGACY_NOTE_TYPE_NAME } from './kobun-tango-template.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DRY_RUN = process.argv.includes('--dry-run')
const RESET = process.argv.includes('--reset')
const DEFAULT_OWNER_EMAIL = 'gaimon.maam@gmail.com'
const DECK_NAME = '古文単語315'
const DEFAULT_JSON = 'C:\\Users\\gaimo\\source\\repos\\quiz_generator\\data\\古文\\古文単語315.json'

const MODE_A_DISTRACTOR_POOL = 12 // モードA に焼き込むダミー候補の最大数
const MODE_B_DISTRACTOR_POOL = 10 // モードB に焼き込むダミー候補の最大数

const jsonArg = process.argv.find((a) => a.endsWith('.json'))
const JSON_PATH = jsonArg || DEFAULT_JSON

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

/** 「・／」区切りの語義片どうしに共通要素があれば類似とみなす（tango.html と同一）。 */
function glossSim(a, b) {
  if (a === b) return true
  const pa = a.split(/[・／]/).map((s) => s.trim()).filter(Boolean)
  const pb = b.split(/[・／]/).map((s) => s.trim()).filter(Boolean)
  return pa.some((x) =>
    pb.some((y) => x === y || (x.length >= 3 && y.includes(x)) || (y.length >= 3 && x.includes(y)))
  )
}

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** エントリの全語義を返す（gloss の配列） */
function sensesOf(entry) {
  return (entry.senses || []).map((s) => s.gloss).filter(Boolean)
}

function buildNoteRows(entries) {
  // 品詞ごとの語義インデックス（ダミー候補の母集合）
  const byPos = new Map() // pos -> [{no, gloss}]
  const allGlosses = []
  for (const e of entries) {
    for (const g of sensesOf(e)) {
      allGlosses.push(g)
      if (!byPos.has(e.pos)) byPos.set(e.pos, [])
      byPos.get(e.pos).push({ no: e.no, gloss: g })
    }
  }

  const rowsA = []
  const rowsB = []

  for (const e of entries) {
    const correctA = sensesOf(e)
    if (correctA.length === 0) continue
    const pos = e.pos || ''
    const chapterTag = (e.chapter || '').trim()

    const tagsBase = ['古文単語315']
    if (chapterTag) tagsBase.push(chapterTag)
    if (pos) tagsBase.push(`品詞:${pos}`)

    // ── モードA ダミー：同品詞・他語・正解と非類似 ──
    const seenA = new Set(correctA)
    const distA = []
    for (const cand of byPos.get(pos) || []) {
      if (cand.no === e.no) continue
      if (seenA.has(cand.gloss)) continue
      if (correctA.some((c) => glossSim(c, cand.gloss))) continue
      seenA.add(cand.gloss)
      distA.push(cand.gloss)
    }
    const distractorsA = shuffle(distA).slice(0, MODE_A_DISTRACTOR_POOL)

    rowsA.push({
      noteType: 'A',
      field_values: {
        通し番号: e.no || '',
        品詞: pos,
        見出し語: e.headword || '',
        漢字: e.kanji || '',
        問題: JSON.stringify({ mode: 'A', correct: correctA, distractors: distractorsA }),
      },
      tags: ['モードA', ...tagsBase],
    })

    // ── モードB：語義ごとの例文（傍線が引けるものだけ） ──
    for (const sense of e.senses || []) {
      const correctB = sense.gloss
      if (!correctB) continue
      for (const ex of sense.examples || []) {
        const text = ex.text || ''
        const form = ex.headword_form || ''
        if (!text || !form || text.indexOf(form) < 0) continue // 傍線が引けない例文は除外

        // ダミー：同語の他語義 → 同品詞他語 →（保険）全品詞。正解と非類似。
        const seenB = new Set([correctB])
        const distB = []
        const tryAdd = (g) => {
          if (!g || seenB.has(g)) return
          if (glossSim(correctB, g)) return
          seenB.add(g)
          distB.push(g)
        }
        for (const g of correctA) tryAdd(g) // 同語の他語義（correctA = この語の全語義）
        for (const cand of shuffle(byPos.get(pos) || [])) {
          if (cand.no === e.no) continue
          tryAdd(cand.gloss)
          if (distB.length >= MODE_B_DISTRACTOR_POOL) break
        }
        if (distB.length < 3) {
          for (const g of shuffle(allGlosses)) {
            tryAdd(g)
            if (distB.length >= MODE_B_DISTRACTOR_POOL) break
          }
        }
        if (distB.length < 3) continue // 四択にできない例文は除外（ごく稀）

        rowsB.push({
          noteType: 'B',
          field_values: {
            通し番号: e.no || '',
            品詞: pos,
            見出し語: e.headword || '',
            漢字: e.kanji || '',
            例文: text,
            傍線形: form,
            出典: ex.source || '',
            現代語訳: ex.translation || '',
            問題: JSON.stringify({
              mode: 'B',
              correct: correctB,
              distractors: distB.slice(0, MODE_B_DISTRACTOR_POOL),
            }),
          },
          tags: ['モードB', ...tagsBase],
        })
      }
    }
  }

  return { rowsA, rowsB }
}

const env = loadEnv()
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** 既存デッキ「古文単語315」（＋サブデッキ）と旧単一ノートタイプを削除する。 */
async function resetExisting(ownerId) {
  console.log('🧹 --reset: 既存データを削除します')
  const { data: deck } = await supabase
    .from('decks')
    .select('id')
    .eq('name', DECK_NAME)
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (deck) {
    // サブデッキ（子）を先に削除（parent_deck_id は cascade ではないため）
    const { data: subs } = await supabase.from('decks').select('id').eq('parent_deck_id', deck.id)
    for (const s of subs || []) {
      await supabase.from('decks').delete().eq('id', s.id)
    }
    // 親デッキ削除（notes/cards は ON DELETE CASCADE）
    await supabase.from('decks').delete().eq('id', deck.id)
    console.log(`   デッキ「${DECK_NAME}」＋サブデッキ ${(subs || []).length} 個を削除`)
  } else {
    console.log('   既存デッキなし')
  }

  // 旧単一ノートタイプ（A/B 混在）を削除（参照ノートが無くなった後）
  const { data: legacy } = await supabase
    .from('note_types')
    .select('id')
    .eq('name', LEGACY_NOTE_TYPE_NAME)
    .maybeSingle()
  if (legacy) {
    const { count } = await supabase
      .from('notes')
      .select('id', { count: 'exact', head: true })
      .eq('note_type_id', legacy.id)
    if ((count || 0) === 0) {
      await supabase.from('note_types').delete().eq('id', legacy.id) // card_templates は cascade
      console.log(`   旧ノートタイプ「${LEGACY_NOTE_TYPE_NAME}」を削除`)
    } else {
      console.log(`   ⚠ 旧ノートタイプ「${LEGACY_NOTE_TYPE_NAME}」は ${count} ノートが残るため削除しません`)
    }
  }
}

async function main() {
  console.log(`📜 ${DRY_RUN ? 'DRY-RUN' : '投入'} / "${DECK_NAME}"`)
  console.log(`   元データ: ${JSON_PATH}`)

  const json = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'))
  const entries = json.entries || []
  console.log(`   エントリ: ${entries.length} 語`)

  const { rowsA, rowsB } = buildNoteRows(entries)
  console.log(`   モードA ノート: ${rowsA.length} 件`)
  console.log(`   モードB ノート: ${rowsB.length} 件`)
  console.log(`   合計: ${rowsA.length + rowsB.length} ノート/カード`)

  if (DRY_RUN) {
    const a = rowsA[0]
    const b = rowsB[0]
    if (a) {
      const qa = JSON.parse(a.field_values.問題)
      console.log('   [dry-run] モードA 先頭:', {
        見出し語: a.field_values.見出し語,
        正解数: qa.correct.length,
        ダミー数: qa.distractors.length,
      })
    }
    if (b) {
      const qb = JSON.parse(b.field_values.問題)
      console.log('   [dry-run] モードB 先頭:', {
        見出し語: b.field_values.見出し語,
        例文: b.field_values.例文.slice(0, 24) + '…',
        傍線形: b.field_values.傍線形,
        正解: qb.correct,
        ダミー数: qb.distractors.length,
      })
    }
    return
  }

  // オーナー
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

  if (RESET) await resetExisting(owner.id)

  // ノートタイプ（A/B）
  const { data: ntList } = await supabase
    .from('note_types')
    .select('id,name')
    .in('name', [NOTE_TYPE_A.name, NOTE_TYPE_B.name])
  const ntA = (ntList || []).find((n) => n.name === NOTE_TYPE_A.name)
  const ntB = (ntList || []).find((n) => n.name === NOTE_TYPE_B.name)
  if (!ntA || !ntB) {
    console.error(
      `❌ ノートタイプが見つかりません（A=${!!ntA} / B=${!!ntB}）。先に create-kobun-tango-notetype.mjs を実行してください。`
    )
    process.exit(1)
  }
  const noteTypeIdByMode = { A: ntA.id, B: ntB.id }

  // 親デッキ（既存なら再利用）
  let deckId
  const { data: existingDeck } = await supabase
    .from('decks')
    .select('id')
    .eq('name', DECK_NAME)
    .eq('owner_id', owner.id)
    .maybeSingle()
  if (existingDeck) {
    deckId = existingDeck.id
    console.log(`   親デッキ再利用 (id=${deckId})`)
  } else {
    const { data: deck, error } = await supabase
      .from('decks')
      .insert({ name: DECK_NAME, owner_id: owner.id, settings: { new_cards_per_day: 15 } })
      .select('id')
      .single()
    if (error) throw error
    deckId = deck.id
    console.log(`   親デッキ作成 (id=${deckId})`)
  }

  // ノート＋カード投入
  let created = 0
  const allRows = [...rowsA, ...rowsB]
  for (const row of allRows) {
    const { data: note, error: noteErr } = await supabase
      .from('notes')
      .insert({
        deck_id: deckId,
        note_type_id: noteTypeIdByMode[row.noteType],
        field_values: row.field_values,
        tags: row.tags,
      })
      .select('id')
      .single()
    if (noteErr) throw noteErr

    const { error: cardErr } = await supabase.from('cards').insert({
      note_id: note.id,
      deck_id: deckId,
      template_index: 0,
    })
    if (cardErr) throw cardErr
    created++
    if (created % 100 === 0) console.log(`   ... ${created}/${allRows.length}`)
  }
  console.log(`   ノート/カード投入: ${created} 件`)

  // フィルタサブデッキ（モードA / モードB）
  const SUBDECKS = [
    { name: 'モードA（単語→意味）', tag: 'モードA' },
    { name: 'モードB（例文→意味）', tag: 'モードB' },
  ]
  const { data: existingSubs } = await supabase
    .from('decks')
    .select('name')
    .eq('parent_deck_id', deckId)
  const existingNames = new Set((existingSubs || []).map((d) => d.name))
  for (const sd of SUBDECKS) {
    if (existingNames.has(sd.name)) {
      console.log(`   ⏭ サブデッキ既存: ${sd.name}`)
      continue
    }
    const { error } = await supabase.from('decks').insert({
      name: sd.name,
      owner_id: owner.id,
      is_distributed: false,
      parent_deck_id: deckId,
      filter_tags: [sd.tag],
      settings: { new_cards_per_day: 15 },
    })
    if (error) throw error
    console.log(`   ✅ サブデッキ作成: ${sd.name} (filter_tags=[${sd.tag}])`)
  }

  console.log(`✅ 完了: ${created} ノート/カード ＋ モード別サブデッキ`)
}

main().catch((e) => {
  console.error('❌', e)
  process.exit(1)
})
