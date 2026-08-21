/**
 * ノートタイプ「構文分析」の定義（カードAPIが初回に自動作成する）。
 *
 * 表 = 白文（生徒は声に出して再分析。訳は口頭）
 * 裏 = 確定済みの構文分析（分析表示HTML）＋出典
 * 訳文フィールドは持たない（裁定2: カードに訳を保存しない）。
 */

export const SYNTAX_NOTE_TYPE_NAME = '構文分析'
export const SYNTAX_DECK_NAME = '構文分析カード'

export const SYNTAX_FIELDS = [
  { name: '英文', ord: 0 },
  { name: '分析表示', ord: 1 },
  { name: '構文データ', ord: 2 },
  { name: '出典', ord: 3 },
]

export const SYNTAX_FRONT_TEMPLATE = `<div class="syn-card">
  <div class="syn-sentence">{{英文}}</div>
  <div class="syn-guide">品詞・働き・まとまりを声に出して分析してから、めくって確定した分析と見比べる。訳は口頭で。</div>
</div>`

export const SYNTAX_BACK_TEMPLATE = `<div class="syn-card">
  <div class="syn-sentence">{{英文}}</div>
  <hr class="syn-hr">
  {{分析表示}}
  <div class="syn-source">{{出典}}</div>
</div>`

export const SYNTAX_CSS = `.syn-card { padding: 8px 4px; }
.syn-sentence { font-family: Georgia, 'Times New Roman', serif; font-size: 20px; line-height: 1.7; }
.syn-guide { margin-top: 14px; font-size: 12px; color: #667; background: #f4f6f8; border-radius: 10px; padding: 10px; }
.syn-hr { margin: 14px 0; border: none; border-top: 1px solid #ddd; }
.syn-source { margin-top: 14px; font-size: 11px; color: #889; }
.syn-row { display: flex; flex-wrap: wrap; align-items: flex-end; row-gap: 14px; }
.syn-col { display: inline-flex; align-items: flex-end; }
.syn-br { font-size: 18px; font-weight: bold; color: #55617f; padding-bottom: 20px; }
.syn-tok { display: inline-flex; flex-direction: column; align-items: center; margin: 0 2px; }
.syn-pos { min-height: 16px; font-size: 11px; color: #2a6db0; white-space: nowrap; }
.syn-word { font-family: Georgia, 'Times New Roman', serif; font-size: 19px; padding: 0 3px; border-bottom: 3px solid transparent; white-space: nowrap; }
.syn-word.syn-ul { border-bottom-color: #333; }
.syn-role { min-height: 18px; font-size: 12px; font-weight: bold; color: #1d3a5f; }`
