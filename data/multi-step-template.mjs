/**
 * ノートタイプ「識別演習」（多段階設問）のフィールド/カードテンプレート（表/裏/CSS）の唯一の定義元。
 * create-multi-step-notetype.mjs と将来の update / import スクリプトが共有する。
 *
 * 1ノート＝1例文。実際の出題UIは StudyCard ではなく MultiStepCard が
 * 「設問」(JSON)・「傍線」(JSON) から組み立てる（例文プール / 画像マスキングと同じ思想）。
 * カードテンプレート(表/裏)は同期 self-heal とプレビュー用のフォールバック表示でのみ使われる。
 *
 * 保存フィールド:
 *   例文     … 原文（傍線の start/end はこの文字列へのインデックス）
 *   識別対象 … ヘッダーに出す対象語（例: が / けれ / し）
 *   出典     … 例: 源氏物語
 *   現代語訳 … 完了サマリーで確認用に表示
 *   傍線     … JSON配列 [{id,text,start,end}]（任意）
 *   設問     … JSON配列（設問本体。下記スキーマ）
 *   補足     … 任意（全体解説など）
 *
 * 「設問」JSON 1要素のスキーマ（snake_case / camelCase 両対応・元教材データをそのまま使える）:
 *   {
 *     "id" | "q_id",
 *     "highlight_id" | "highlightId",       // 傍線参照（null可）
 *     "question_type" | "questionType",      // バッジ（識別/分解/活用形/和訳…）
 *     "prompt",
 *     "answer_format" | "format",            // "select" | "text"
 *     "choices": [...],                       // select のみ
 *     "correct_answer" | "answer",
 *     "explanation",
 *     "reference_page" | "referencePage",     // 任意
 *     "follow_up" | "followUp": {             // 任意・select のみ（根拠問題）
 *       "prompt", "choices", "correct_answer"|"answer", "explanation"
 *     }
 *   }
 */
export const NOTE_TYPE_NAME = '識別演習'

export const FIELDS = [
  { name: '例文', ord: 0, settings: {} },
  { name: '識別対象', ord: 1, settings: { required: false } },
  { name: '出典', ord: 2, settings: { required: false } },
  { name: '現代語訳', ord: 3, settings: { required: false } },
  { name: '傍線', ord: 4, settings: { required: false } },
  { name: '設問', ord: 5, settings: {} },
  { name: '補足', ord: 6, settings: { required: false } },
]

// MultiStepCard が出題を担うため、表/裏は最小限のフォールバック表示のみ。
export const FRONT_TEMPLATE = `<div class="ms-example">{{例文}}</div>
{{#識別対象}}<div class="ms-target">識別対象：{{識別対象}}</div>{{/識別対象}}
<div class="ms-hint">多段階の識別演習（タップして開始）</div>`

export const BACK_TEMPLATE = `<div class="ms-example">{{例文}}</div>
{{#現代語訳}}<div class="ms-trans">{{現代語訳}}</div>{{/現代語訳}}
{{#出典}}<div class="ms-source">― {{出典}}</div>{{/出典}}
{{#補足}}<div class="ms-note">{{補足}}</div>{{/補足}}`

export const CSS = `.card { font-family:'Shippori Mincho','Noto Serif JP',serif; padding:18px 14px; text-align:center; max-width:720px; margin:0 auto; color:#2a2520; }
.ms-example { font-size:20px; line-height:2.1; padding:14px 12px; background:linear-gradient(180deg,#fdfbf5 0%,#f8f2e4 100%); border:1px solid #d9ccb3; border-radius:4px; }
.ms-target { margin-top:10px; font-size:14px; color:#8b2e2e; }
.ms-hint { margin-top:12px; font-size:13px; color:#7a7264; }
.ms-trans { margin-top:14px; font-size:16px; line-height:1.9; }
.ms-source { margin-top:8px; font-size:13px; color:#7a7264; }
.ms-note { margin-top:12px; font-size:14px; color:#4b5563; line-height:1.7; }
.ms-note:empty,.ms-target:empty,.ms-trans:empty,.ms-source:empty { display:none; }`
