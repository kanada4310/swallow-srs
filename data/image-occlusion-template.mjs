/**
 * ノートタイプ「画像マスキング」のフィールド/カードテンプレート（表/裏/CSS）の唯一の定義元。
 * create-image-occlusion-notetype.mjs（新規投入）と将来の update スクリプトが共有する。
 *
 * 表示用フィールド {{画像表}}/{{画像裏}} は StudyCard が「マスク領域」(JSON) から
 * レビューごとに合成する（ノートの保存フィールドではない＝コロケーションの例文プールと同じ思想）。
 * 保存フィールド: 画像(URL) / マスク領域(JSON) / 毎回隠す数 / 見出し / 補足
 */
export const NOTE_TYPE_NAME = '画像マスキング'

export const FIELDS = [
  { name: '画像', ord: 0, settings: {} },
  { name: 'マスク領域', ord: 1, settings: {} },
  { name: '毎回隠す数', ord: 2, settings: { required: false } },
  { name: '見出し', ord: 3, settings: { required: false } },
  { name: '補足', ord: 4, settings: { required: false } },
]

export const FRONT_TEMPLATE = `{{#見出し}}<div class="io-heading">{{見出し}}</div>{{/見出し}}
<div class="io-img">{{画像表}}</div>`

export const BACK_TEMPLATE = `{{#見出し}}<div class="io-heading">{{見出し}}</div>{{/見出し}}
<div class="io-img">{{画像裏}}</div>
{{#補足}}<div class="io-note">{{補足}}</div>{{/補足}}`

export const CSS = `.card { font-family:'Hiragino Sans','Noto Sans JP',sans-serif; padding:16px 12px; text-align:center; max-width:720px; margin:0 auto; }
.io-heading { font-size:16px; font-weight:700; color:#1f2937; margin-bottom:12px; }
.io-img { display:flex; justify-content:center; }
.io-note { margin-top:16px; font-size:14px; color:#4b5563; line-height:1.7; text-align:left; background:#f9fafb; border-radius:8px; padding:10px 14px; }
.io-note:empty { display:none; }`
