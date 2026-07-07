/**
 * チュートリアルデッキ「つばめSRSのつかいかた」を作成・投入する。
 *
 * アプリの使い方を "SRSのカードで" 学ぶデッキ（設計: docs 2026-07-07 セッション）。
 * - ノートタイプ: システムの Basic（Front/Back）を再利用
 * - カードは template_index 0 のみ生成（Basic が reversed 付きでも逆カードは作らない）
 * - 既定オーナー: gaimon.maam@gmail.com
 * - 配布はしない（講師が UI からクラスへ配布する）
 *
 * Usage:
 *   node data/create-tutorial-deck.mjs --dry-run
 *   node data/create-tutorial-deck.mjs
 *   node data/create-tutorial-deck.mjs --reset   # 既存の同名デッキを削除して再投入
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const DRY_RUN = process.argv.includes('--dry-run')
const RESET = process.argv.includes('--reset')

const DECK_NAME = 'つばめSRSのつかいかた'
const OWNER_EMAIL = 'gaimon.maam@gmail.com'

/** [Front, Back] の順。学びながら操作を練習させる並び */
const CARDS = [
  [
    'ようこそ！このデッキは「つばめSRS」の使い方を練習するデッキです。<br><br>まずは下の<b>「答えを見る」</b>を押してみよう',
    'できましたね！カードは<b>表＝問題、裏＝答え</b>。<br>裏を見たら、思い出せたかどうかを下のボタンで答えます。<br><br>今回は<b>「正解」</b>を押して次へ！',
  ],
  [
    '下に並んでいる<b>4つのボタン</b>の意味は？',
    '<b>もう一度</b>＝思い出せなかった<br><b>難しい</b>＝ギリギリ思い出せた<br><b>正解</b>＝思い出せた<br><b>簡単</b>＝余裕だった<br><br>迷ったら<b>「正解」</b>でOK！',
  ],
  [
    '「正解」を押したカードは、次はいつ出てくる？',
    '最初は数分後 → 翌日 → 数日後 → 数週間後…と、<b>間隔がどんどん伸びていきます</b>。<br><br>「忘れかけた頃にまた出る」のがSRS（間隔反復）のしくみです。',
  ],
  [
    '「もう一度」を押すとどうなる？<br>（押すと損……？）',
    '少し後に同じカードがもう一度出ます。<br><br><b>ペナルティではありません！</b>「覚え直しのチャンス」です。自分の記憶に正直に押すほど、復習のタイミングが正確になって効率が上がります。',
  ],
  [
    'なぜ「毎日ちょっとずつ」が最強なの？',
    '記憶は<b>思い出した瞬間に強くなる</b>から。<br><br>1日20分×7日は、週1回140分のまとめ勉強より圧倒的に定着します。テスト前の一夜漬けが消えやすいのはこのためです。',
  ],
  [
    '画面の上にある<b>3色の数字</b>（青・オレンジ・緑）は何？',
    '<span style="color:#3E8EF7"><b>青＝今日の新規</b></span>・<span style="color:#D97706"><b>オレンジ＝学習中</b></span>（すぐ再出題）・<span style="color:#17925F"><b>緑＝復習</b></span>。<br><br>ぜんぶ0になったら今日のノルマ完了です！',
  ],
  [
    'カードの左上に出る <b>🆕 / 🔁 / 📖</b> のバッジは？',
    '<b>🆕新規</b>＝はじめて見るカード<br><b>🔁復習</b>＝期限が来たカード<br><b>📖学習中</b>＝覚えたてで再確認中のカード',
  ],
  [
    'まちがえてボタンを押しちゃった！どうする？',
    '回答直後に出る<b>「取り消し」</b>を押せば、直前の回答をやり直せます。<br>（10秒たつと消えるので早めに！）',
  ],
  [
    '今日のノルマが終わったけど、もっとやりたい！',
    '完了画面の<b>「もう少しだけ練習する」</b>を押すと、未来のカードを先取りして練習できます。<br><br>練習の結果は記録されないので、復習スケジュールが乱れる心配はありません。',
  ],
  [
    'ボタンを押すのがめんどう。もっと速く答えたい',
    'カードは<b>スワイプ</b>でも答えられます！<br><br>表で<b>上スワイプ＝めくる</b><br>めくった後：<b>左＝もう一度／下＝難しい／右＝正解／上＝簡単</b>',
  ],
  [
    '英単語の発音も覚えたい',
    '🔊ボタンがあるカードは<b>音声を再生</b>できます。<br>目だけでなく耳でも覚えると定着が段違いです。',
  ],
  [
    '学習を忘れちゃいそうで不安……',
    '設定で通知をONにすると<b>毎朝リマインド</b>が届きます。<br><br>ホーム画面の<b>🔥連続日数</b>を切らさないことが上達のいちばんの近道！',
  ],
  [
    '自分がどれくらい成長したか見たい',
    '下メニューの<b>「統計」</b>で、毎日の学習量・正答率・連続記録が見られます。<br>グラフが積み上がっていくのは気持ちいいですよ。',
  ],
  [
    'わからない単語だらけで心が折れそう……',
    '大丈夫。<b>最初はみんな「もう一度」だらけ</b>です。<br><br>SRSは苦手なカードほど頻繁に出して、覚えたカードは邪魔をしません。続けていれば「もう一度」は必ず減っていきます。',
  ],
  [
    'このデッキが終わったら、次は？',
    'ホームの<b>「学習をはじめる」</b>を押すだけ！<br>配布されたデッキの今日のノルマが自動で始まります。<br><br>それでは、よい学習を！🐦',
  ],
]

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
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'])

async function main() {
  // オーナー
  const { data: owner, error: ownerErr } = await supabase
    .from('profiles')
    .select('id, name, email')
    .eq('email', OWNER_EMAIL)
    .single()
  if (ownerErr || !owner) throw new Error(`オーナー ${OWNER_EMAIL} が見つかりません: ${ownerErr?.message}`)

  // Basic ノートタイプ（システム）
  const { data: noteTypes, error: ntErr } = await supabase
    .from('note_types')
    .select('id, name, is_system')
    .eq('is_system', true)
    .ilike('name', 'Basic%')
  if (ntErr) throw ntErr
  const basic = (noteTypes || []).find(nt => nt.name === 'Basic') || (noteTypes || [])[0]
  if (!basic) throw new Error('システムの Basic ノートタイプが見つかりません')

  // 既存デッキ
  const { data: existing } = await supabase
    .from('decks')
    .select('id, name')
    .eq('name', DECK_NAME)
    .eq('owner_id', owner.id)

  console.log(`オーナー: ${owner.name} / ノートタイプ: ${basic.name} (${basic.id})`)
  console.log(`カード枚数: ${CARDS.length}`)
  if (existing && existing.length > 0) {
    console.log(`既存デッキ: ${existing.map(d => d.id).join(', ')} ${RESET ? '→ 削除して再投入' : '→ 中断（--reset で再投入）'}`)
    if (!RESET && !DRY_RUN) {
      console.log('❌ 同名デッキが存在します。--reset を付けるか手動で削除してください')
      process.exit(1)
    }
  }
  if (DRY_RUN) {
    console.log('--dry-run のためここで終了')
    return
  }

  if (RESET && existing) {
    for (const d of existing) {
      await supabase.from('decks').delete().eq('id', d.id) // notes/cards は CASCADE
      console.log(`🗑  削除: ${d.id}`)
    }
  }

  // デッキ作成（未配布・新規5枚/日=チュートリアルを2〜3日で消化する想定）
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .insert({
      name: DECK_NAME,
      owner_id: owner.id,
      is_distributed: false,
      settings: { new_cards_per_day: 5 },
    })
    .select()
    .single()
  if (deckErr) throw deckErr
  console.log(`📦 デッキ作成: ${deck.id}`)

  // ノート＋カード（template_index 0 のみ＝逆カードなし）
  // created_at を1秒刻みで明示し、「順番どおり」出題で作成順＝台本順になるようにする
  const base = Date.now() - CARDS.length * 1000
  const noteRows = CARDS.map(([front, back], i) => ({
    deck_id: deck.id,
    note_type_id: basic.id,
    field_values: { Front: front, Back: back },
    tags: ['チュートリアル'],
    created_at: new Date(base + i * 1000).toISOString(),
  }))
  const { data: notes, error: notesErr } = await supabase
    .from('notes')
    .insert(noteRows)
    .select('id, created_at')
  if (notesErr) throw notesErr

  const sortedNotes = [...notes].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  const cardRows = sortedNotes.map((n, i) => ({
    note_id: n.id,
    deck_id: deck.id,
    template_index: 0,
    created_at: new Date(base + i * 1000).toISOString(),
  }))
  const { error: cardsErr } = await supabase.from('cards').insert(cardRows)
  if (cardsErr) throw cardsErr

  console.log(`✅ ${notes.length}ノート＋${cardRows.length}カード投入完了`)
  console.log('次: 講師UIからクラス/生徒に配布してください（デッキ詳細 → 配布）')
}

main().catch(e => {
  console.error('❌', e.message || e)
  process.exit(1)
})
