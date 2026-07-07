# つばめSRS デザインシステム「藍・空・喉の橙」

つばめの羽色（藍）・空・喉の橙をブランドにした、生徒（中高生・スマホ）向けのデザイン言語。
汎用Tailwind管理画面トーンからの脱却が目的。**アプリのシェル（画面・ナビ・ボタン・カード枠）に適用する。
カード内部の世界観（ノートタイプのテンプレートCSS、KobunTangoCard の paper/indigo/enji、MultiStepCard の古文様式）は
独立したテーマとして温存し、このシステムを持ち込まない。**

## トークン（tailwind.config.ts 定義済み）

| トークン | 値 | 用途 |
|---|---|---|
| `ai` / `ai-deep` / `ai-soft` | #1C2B4B / #131E36 / #27407A | 見出し文字・濃い地（ヒーローカード）・グラデーション終点 |
| `sora` / `sora-dark` / `sora-soft` | #3E8EF7 / #2D74D6 / #E8F1FE | 主要アクション（ボタン・リンク・アクティブ状態）と淡地 |
| `nodo` / `nodo-dark` / `nodo-soft` | #FF7849 / #F05E2E / #FFEFE7 | 最重要CTA・ストリーク・お祝い（多用しない、1画面1箇所まで） |
| `paper` | #F7F8FA | ページ背景（body 既定） |
| `ink` / `ink-2` / `ink-3` | #1A1D24 / #5A6272 / #9AA1B0 | 本文 / 補足 / 弱い文字 |
| `again`/`hard`/`good`/`easy` (+`-bg`) | 赤/琥珀/緑/青 | SRS評価専用。汎用の成功/警告にも good/hard を流用可 |
| `rounded-card` | 18px | 大きなカード・セクション |
| `shadow-card` | 2層の柔らかい影 | 浮かせたいカードのみ（多用しない） |

## コンポーネント慣用句

- **ページ見出し**: `text-2xl font-extrabold text-ai`（旧: text-gray-900 font-bold）
- **セクションカード**: `bg-white border border-gray-200 rounded-card p-6`（影は原則なし。ヒーローだけ `shadow-card`）
- **小さめカード/行**: `bg-white border border-gray-200 rounded-2xl`
- **主ボタン**: `bg-sora text-white font-bold rounded-2xl hover:bg-sora-dark transition-colors px-6 py-3`
- **最重要CTA（1画面1つ）**: `bg-nodo text-white font-extrabold rounded-2xl hover:bg-nodo-dark shadow-[0_4px_14px_rgba(255,120,73,.35)]`
- **副ボタン**: `bg-white border-2 border-sora text-sora font-bold rounded-2xl hover:bg-sora-soft`
- **静かなボタン/リンク**: `text-ink-3 hover:text-ink-2 font-bold`（枠なし）
- **破壊ボタン**: `bg-again-bg text-again`（確認モーダル内の実行だけ `bg-again text-white`）
- **バッジ/チップ**: `rounded-full px-2.5 py-0.5 text-xs font-bold` ＋ 意味色の `-bg`×濃字（例: 新規=`bg-easy-bg text-easy`、復習=`bg-good-bg text-good`、学習中=`bg-hard-bg text-hard`）
- **入力**: `rounded-xl border-gray-300 focus:border-sora focus:ring-sora`
- **フォーカス**: 操作要素に `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai`
- **押し心地**: タップ主体のボタンに `active:scale-95 transition-all`
- **数字**: 集計値には `tabular-nums`、強調は `font-extrabold text-ai`
- **ブランドマーク**: `SwallowMark`（`src/components/ui/SwallowMark.tsx`）。空状態・完了・お祝いにだけ登場（乱用しない）

## 置換マップ（機械的に読み替える）

| 旧 | 新 |
|---|---|
| `bg-blue-600 text-white` (主ボタン) | `bg-sora text-white` |
| `hover:bg-blue-700` | `hover:bg-sora-dark` |
| `text-blue-600`（リンク/アクティブ） | `text-sora` |
| `bg-blue-50/100 text-blue-700`（情報バッジ） | `bg-sora-soft text-sora` |
| `text-gray-900`（見出し） | `text-ai` |
| `text-gray-500/600`（補足） | `text-ink-2`（本文寄り）/ `text-ink-3`（弱め） |
| `rounded-lg`（カード・ボタン） | カード=`rounded-card` or `rounded-2xl`、ボタン=`rounded-2xl`、バッジ=`rounded-full` |
| `shadow-sm`（カード） | 原則削除（border のみ）。ヒーローだけ `shadow-card` |
| 絵文字アイコン（📱🔥⚙️等のUI用途） | lucide-react か既存SVGに置換（本文・お祝いの絵文字は可） |

## してはいけないこと

- カードテンプレート（DB内 front/back/css）・`KobunTangoCard`・`MultiStepCard` の**カード内部様式**を変えない
- `PlantSprite`/`IsoTile` 等の庭アートを変えない
- 1画面に nodo（橙）を2箇所以上置かない
- 色を新規のハードコード hex で足さない（必ずトークン経由）
- レイアウト構造・ロジック・文言の意味を変えない（見た目の置換に徹する。明らかな文言の不統一だけ「です・ます＋前向き」トーンに揃えるのは可）
