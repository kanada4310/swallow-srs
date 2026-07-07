---
date: 2026-06-15
tags: [content, ui-ux]
phase: 13
slug: math-mathml
---

# 数式は KaTeX の MathML 出力でブラウザネイティブ描画する

## 背景
カードは iframe（sandbox・allow-same-origin なし＝opaque origin）で隔離描画している。KaTeX-HTML を使うと iframe 内で CSS/Webフォントの読込・CORS・高さ計測が壊れ、二重表示や積分カードの空欄が頻発した。

## 決定
KaTeX の出力を `output:'mathml'` にする。ブラウザがネイティブ描画するため**外部 CSS もフォントも不要**で、sandbox iframe と最も相性が良い。数式は重い（~270KB）ので、数式を含むカードでのみ動的 import する（`/study` の初期バンドルは不変）。

## 結果
二重表示・空欄が根本解消。旧 KaTeX-HTML 用の `public/katex/` ＋ `/katex` publicPath/CORS/SW キャッシュは撤去。`katex` npm は MathML 生成に引き続き使用。
