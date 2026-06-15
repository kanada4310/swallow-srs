/**
 * 数式レンダリング（Phase 13.4）— KaTeX で TeX を HTML に変換する。
 *
 * カードは iframe(sandbox) 内で隔離描画されるため、サニタイズと衝突しない。
 * 出力は **MathML のみ**（`output: 'mathml'`）。ブラウザがネイティブ描画するため
 * KaTeX の CSS / Web フォントが不要 → iframe 内での CSS 読込・フォント CORS・高さ計測の
 * 問題を回避でき、最も壊れにくい（モダンブラウザは MathML Core 対応）。
 *
 * 対応デリミタ（Anki 互換）:
 *   - `\( ... \)`  インライン
 *   - `\[ ... \]`  ディスプレイ
 *   - `$$ ... $$`  ディスプレイ
 * （誤検出を避けるため、単一 `$ ... $` は対象外）
 *
 * KaTeX 本体は重い（~270KB）ため、このモジュールは**数式を含むカードでのみ**
 * 動的 import される（`containsMath` で事前判定）。
 */

import katex from 'katex'

const MATHML_OUTPUT = 'mathml'

/** 数式デリミタを含むか（KaTeX を読み込む前の安価な判定） */
export function containsMath(html: string): boolean {
  return /\\\(|\\\[|\$\$/.test(html)
}

function renderOne(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode,
      throwOnError: false,
      output: MATHML_OUTPUT,
    })
  } catch {
    // 想定外の失敗時は元のテキストを残す（カードを壊さない）
    return displayMode ? `\\[${tex}\\]` : `\\(${tex}\\)`
  }
}

/**
 * HTML 文字列内の数式デリミタを KaTeX 出力に置換する。
 * ディスプレイ（$$, \[ \]）→ インライン（\( \)）の順で処理する。
 */
export function renderMath(html: string): string {
  if (!containsMath(html)) return html
  return html
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex) => renderOne(tex, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, tex) => renderOne(tex, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, tex) => renderOne(tex, false))
}
