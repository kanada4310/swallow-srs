/**
 * ノートタイプ「古文単語演習A／B」（tango.html モードA/B 相当）の定義の唯一の元。
 * create-kobun-tango-notetype.mjs と import-kobun-tango.mjs が共有する。
 *
 * 1ノート＝1問（1カード）。モードごとにノートタイプを分ける（フィールド構成が異なるため）。
 * 出題UIは StudyCard ではなく KobunTangoCard が「問題」(JSON) とフラットフィールドから組み立てる
 * （識別演習＝多段階設問 / 例文プール / 画像マスキングと同じ思想）。
 * カードテンプレート(表/裏)は同期 self-heal とプレビュー用のフォールバック表示でのみ使う。
 *
 * 「問題」(JSON) には採点に必要な配列だけを入れる：
 *   モードA: { "mode":"A", "correct":[語義…], "distractors":[ダミー候補…] }
 *   モードB: { "mode":"B", "correct":語義, "distractors":[ダミー候補…] }
 * 表示用テキスト（例文・傍線形・出典・訳）は標準エディタで編集できるようフラットフィールドに持つ。
 */

// 旧・単一ノートタイプ（A/B 混在）。--reset 時に削除する対象。
export const LEGACY_NOTE_TYPE_NAME = '古文単語演習'

const FRONT_A = `<div class="kt-fallback">
  <div class="kt-fb-head">{{見出し語}}{{#漢字}}（{{漢字}}）{{/漢字}}</div>
  <div class="kt-fb-hint">単語→意味（タップして開始）</div>
</div>`
const BACK_A = `<div class="kt-fallback">
  <div class="kt-fb-head">{{見出し語}}{{#漢字}}（{{漢字}}）{{/漢字}}</div>
</div>`

const FRONT_B = `<div class="kt-fallback">
  {{#例文}}<div class="kt-fb-passage">{{例文}}</div>{{/例文}}
  <div class="kt-fb-hint">例文→傍線部の意味（タップして開始）</div>
</div>`
const BACK_B = `<div class="kt-fallback">
  {{#例文}}<div class="kt-fb-passage">{{例文}}</div>{{/例文}}
  {{#現代語訳}}<div class="kt-fb-trans">{{現代語訳}}</div>{{/現代語訳}}
  {{#出典}}<div class="kt-fb-source">― {{出典}}</div>{{/出典}}
</div>`

export const CSS = `.card { font-family:"Hiragino Mincho ProN","Yu Mincho",serif; padding:18px 14px; text-align:center; max-width:680px; margin:0 auto; color:#26303a; }
.kt-fb-head { font-size:1.6rem; font-weight:600; letter-spacing:.05em; }
.kt-fb-passage { margin-top:14px; font-size:1.1rem; line-height:1.95; }
.kt-fb-trans { margin-top:14px; font-size:1rem; color:#4a5560; line-height:1.8; }
.kt-fb-source { margin-top:8px; font-size:.8rem; color:#a9852f; }
.kt-fb-hint { margin-top:12px; font-size:.8rem; color:#7a7264; font-family:system-ui,sans-serif; }
.kt-fb-passage:empty,.kt-fb-trans:empty { display:none; }`

/** モードA：見出し語 → 該当する意味をすべて選ぶ（複数選択） */
export const NOTE_TYPE_A = {
  name: '古文単語演習A（単語→意味）',
  fields: [
    { name: '通し番号', ord: 0, settings: { required: false } },
    { name: '品詞', ord: 1, settings: { required: false } },
    { name: '見出し語', ord: 2, settings: {} },
    { name: '漢字', ord: 3, settings: { required: false } },
    { name: '問題', ord: 4, settings: {} },
  ],
  front: FRONT_A,
  back: BACK_A,
  css: CSS,
  cardName: '単語→意味',
}

/** モードB：例文の傍線部 → 意味を四択で選ぶ（単一選択） */
export const NOTE_TYPE_B = {
  name: '古文単語演習B（例文→傍線部）',
  fields: [
    { name: '通し番号', ord: 0, settings: { required: false } },
    { name: '品詞', ord: 1, settings: { required: false } },
    { name: '見出し語', ord: 2, settings: { required: false } },
    { name: '漢字', ord: 3, settings: { required: false } },
    { name: '例文', ord: 4, settings: {} },
    { name: '傍線形', ord: 5, settings: { required: false } },
    { name: '出典', ord: 6, settings: { required: false } },
    { name: '現代語訳', ord: 7, settings: { required: false } },
    { name: '問題', ord: 8, settings: {} },
  ],
  front: FRONT_B,
  back: BACK_B,
  css: CSS,
  cardName: '例文→傍線部',
}

export const NOTE_TYPES = [NOTE_TYPE_A, NOTE_TYPE_B]
