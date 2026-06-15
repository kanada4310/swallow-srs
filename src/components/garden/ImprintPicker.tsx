'use client'

import { VARIETIES, type Variety } from '@/lib/garden/varieties'

/**
 * 初回インプリント（Phase 10.4）— そのノートに初めて触れた時、
 * 「この単語をどの植物で覚える？」と品種を選ぶ。視覚化記憶術としても機能する。
 *
 * 学習をブロックしすぎないよう「おまかせ」「あとで」も用意（スキップ可能）。
 */
export function ImprintPicker({
  word,
  onSelect,
  onAuto,
  onSkip,
}: {
  word: string
  /** 品種を選んだ（id を保存） */
  onSelect: (variety: Variety) => void
  /** おまかせ（noteId から決定的に割り当て） */
  onAuto: () => void
  /** あとで（今回はスキップ。汎用の姿で学習を続ける） */
  onSkip: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5">
        <div className="text-center mb-1">
          <span className="text-2xl" aria-hidden>🌱</span>
        </div>
        <h2 className="text-center text-base font-bold text-gray-900 mb-1">
          「{word || 'この単語'}」をどの植物で育てる？
        </h2>
        <p className="text-center text-xs text-gray-500 mb-4">
          選んだ植物が、この単語のいきものになります。
        </p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {VARIETIES.map((v) => (
            <button
              key={v.id}
              onClick={() => onSelect(v)}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-gray-200 hover:border-green-400 hover:bg-green-50 transition-colors"
            >
              <span className="text-2xl" aria-hidden>{v.emoji}</span>
              <span className="text-xs text-gray-700">{v.name}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onAuto}
            className="flex-1 px-3 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700"
          >
            おまかせ
          </button>
          <button
            onClick={onSkip}
            className="flex-1 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            あとで
          </button>
        </div>
      </div>
    </div>
  )
}
