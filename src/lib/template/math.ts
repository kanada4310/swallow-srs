/**
 * 数式レンダリング（Phase 13.4）— KaTeX で TeX を HTML に変換する。
 *
 * カードは iframe(sandbox) 内で隔離描画されるため、サニタイズと衝突しない。
 * KaTeX の出力（span/MathML）をそのまま iframe に渡し、KaTeX CSS は iframe 側で読み込む。
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

/** 数式デリミタを含むか（KaTeX を読み込む前の安価な判定） */
export function containsMath(html: string): boolean {
  return /\\\(|\\\[|\$\$/.test(html)
}

function renderOne(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode,
      throwOnError: false,
      output: 'htmlAndMathml',
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
