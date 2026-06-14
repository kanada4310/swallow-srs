/**
 * ノートタイプ「コロケーション構文」のカードテンプレート（表/裏/CSS）の唯一の定義元。
 * import-colloc-deck.mjs（新規投入）と update-colloc-template.mjs（既存DBパッチ）が共有する。
 *
 * 表示用フィールド {{文脈}}/{{英文穴埋め}}/{{和文}}/{{英文}} は StudyCard が
 * 例文プール(JSON)からレビューごとに合成する（ノートの保存フィールドではない）。
 */
export const FIELDS = [
  { name: '見出し語', ord: 0, settings: {} },
  { name: '語義', ord: 1, settings: {} },
  { name: 'コア', ord: 2, settings: {} },
  { name: 'スロット型', ord: 3, settings: {} },
  { name: '例文プール', ord: 4, settings: {} },
]

export const FRONT_TEMPLATE = `<div class="context">{{文脈}}</div>
<div class="prompt">和訳を手がかりに、空所のまとまり（表現）を声に出して暗誦しよう。</div>
<div class="cloze">{{英文穴埋め}}</div>
<div class="hint">{{和文}}</div>`

export const BACK_TEMPLATE = `<div class="answer">{{英文}}</div>
<div class="ja">{{和文}}</div>
<hr>
<div class="ref">
  <span class="core">{{コア}}</span> <span class="slot">{{スロット型}}</span>
  <div class="sense"><span class="w">{{見出し語}}</span> … {{語義}}</div>
</div>`

export const CSS = `.card { font-family:'Hiragino Sans','Noto Sans JP',sans-serif; padding:24px 20px; text-align:center; max-width:640px; margin:0 auto; }
.context { font-size:15px; color:#374151; line-height:1.7; margin-bottom:14px; }
.context:empty { display:none; }
.prompt { color:#6b7280; font-size:13px; margin-bottom:20px; }
.cloze { font-size:21px; line-height:2.0; color:#1f2937; margin-bottom:18px; }
.cloze .blank { color:#2563eb; font-weight:700; letter-spacing:1px; border-bottom:2px solid #93c5fd; padding:0 2px; }
.hint { font-size:16px; color:#6b7280; line-height:1.7; }
.answer { font-size:21px; color:#059669; line-height:1.9; margin-bottom:10px; }
.answer strong { color:#047857; text-decoration:underline; font-weight:700; }
.ja { font-size:16px; color:#4b5563; line-height:1.7; }
hr { margin:20px 0; border:none; border-top:1px solid #e5e7eb; }
.ref { color:#6b7280; font-size:14px; text-align:left; background:#f9fafb; border-radius:8px; padding:10px 14px; }
.ref .core { color:#2563eb; font-weight:700; font-size:16px; }
.ref .slot { color:#9ca3af; font-size:13px; }
.ref .sense { margin-top:6px; }
.ref .w { color:#374151; font-weight:600; }`
