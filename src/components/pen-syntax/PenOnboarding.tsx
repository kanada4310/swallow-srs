'use client'

/**
 * 初回お手本登録の案内（義務化・2026-08-26 塾長指示）。
 *
 * ペン方式の画面（構文の練習。将来の1文画面でも共用できる部品）を初めて使うとき、
 * 必須の記号（括弧8種＋品詞6種＋働き7種）のお手本を1つずつ登録してもらう。
 * - 利用者ごとに初回の1回だけ（完了の印は onboarding.ts が localStorage に持つ）
 * - 途中でやめても登録済みの字は残り、次回は続きから再開する
 * - 登録し直し（mode='redo'）は同じ流れを任意スキップ付きでもう一度通す
 */

import { useMemo, useRef, useState } from 'react'
import type { PenStroke, SymbolId } from '@/lib/pen-syntax/types'
import type { InputPolicy } from '@/lib/pen-syntax/palm'
import type { UserTemplateStore } from '@/lib/pen-syntax/letters'
import {
  POS_STROKE_SOURCES,
  ROLE_STROKE_SOURCES,
  SHAPE_STROKE_SOURCES,
} from '@/lib/pen-syntax/templates'
import {
  missingRequired,
  REQUIRED_SYMBOLS,
  samplesFor,
  saveOnboardingDone,
} from '@/lib/pen-syntax/onboarding'
import { clearUserTemplates, saveUserTemplate } from '@/lib/pen-syntax/user-templates'
import { PEN_UI_ATTR } from '@/lib/pen-syntax/zone-guard'
import { pathLength } from '@/lib/pen-syntax/geometry'
import { POS_LETTER_LEGEND } from '@/lib/reading/syntax'
import { symbolLabel } from './PenSyntaxAnnotator'
import { EnrollCanvas } from './EnrollCanvas'

/** 記号の説明（どこに・何のために書く記号か） */
function symbolHint(symbol: SymbolId): string {
  const bracket: Record<string, string> = {
    'paren-open': '（ ）＝副詞句・副詞節のまとまり（開き）',
    'paren-close': '（ ）＝副詞句・副詞節のまとまり（閉じ）',
    'square-open': '[ ]＝名詞句・名詞節のまとまり（開き）',
    'square-close': '[ ]＝名詞句・名詞節のまとまり（閉じ）',
    'angle-open': '〈 〉＝後置修飾のまとまり（開き）',
    'angle-close': '〈 〉＝後置修飾のまとまり（閉じ）',
    'brace-open': '｛ ｝＝補語のまとまり（開き）',
    'brace-close': '｛ ｝＝補語のまとまり（閉じ）',
  }
  if (bracket[symbol]) return `本文に書く括弧: ${bracket[symbol]}`
  if (POS_LETTER_LEGEND[symbol]) return `単語の上に書く品詞: ${symbol}＝${POS_LETTER_LEGEND[symbol]}`
  const role: Record<string, string> = {
    S: '主語',
    V: '動詞',
    O: '目的語',
    C: '補語',
    P: '前置詞',
    Po: '前置詞の目的語',
    '▷': '従位接続詞の目印',
  }
  if (role[symbol]) return `単語の下に書く働き: ${symbol}＝${role[symbol]}`
  return ''
}

/** 内蔵お手本の1つ目を手本の見本として SVG で描く */
function ReferenceGlyph({ symbol }: { symbol: SymbolId }) {
  const strokes = useMemo(() => {
    const src =
      SHAPE_STROKE_SOURCES.find((s) => s.symbol === symbol) ??
      POS_STROKE_SOURCES.find((s) => s.symbol === symbol) ??
      ROLE_STROKE_SOURCES.find((s) => s.symbol === symbol)
    return src?.strokes ?? []
  }, [symbol])
  if (strokes.length === 0) return null
  return (
    <svg viewBox="-6 -6 112 112" className="h-16 w-16 rounded-lg border border-gray-200 bg-white">
      {strokes.map((stroke, i) => (
        <polyline
          key={i}
          points={stroke.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#1C2B4B"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}

interface QueueItem {
  symbol: SymbolId
  /** この記号であと何本書いてもらうか */
  take: number
}

interface PenOnboardingProps {
  userId: string | null | undefined
  store: UserTemplateStore
  onStoreChange: (next: UserTemplateStore) => void
  policy: InputPolicy
  /** first=初回（未登録分だけ） / redo=登録し直し（全種・スキップ可） */
  mode: 'first' | 'redo'
  /** 必須の登録が終わり「はじめる」を押したとき（完了の印は保存済み） */
  onFinish: () => void
  /** 途中でやめたとき（登録済み分は残る・次回は続きから） */
  onExit: () => void
}

export function PenOnboarding({
  userId,
  store,
  onStoreChange,
  policy,
  mode,
  onFinish,
  onExit,
}: PenOnboardingProps) {
  // 開いた時点の店構えで手順を組む（登録のたびに並び直さない）
  const [queue] = useState<QueueItem[]>(() =>
    mode === 'redo'
      ? REQUIRED_SYMBOLS.map((symbol) => ({ symbol, take: samplesFor(symbol) }))
      : missingRequired(store).map((symbol) => ({
          symbol,
          take: samplesFor(symbol) - (store[symbol]?.length ?? 0),
        })),
  )
  const [queueIdx, setQueueIdx] = useState(0)
  const [sampleNo, setSampleNo] = useState(0)
  const [resetToken, setResetToken] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const strokesRef = useRef<PenStroke[]>([])
  // 登録し直しでは、その記号への最初の保存時に古い登録を消して置き換える
  const replacedRef = useRef<Set<string>>(new Set())

  const current = queue[queueIdx] ?? null
  const doneCount = REQUIRED_SYMBOLS.length - missingRequired(store).length

  const advance = () => {
    strokesRef.current = []
    setResetToken((n) => n + 1)
    setToast(null)
    if (current && sampleNo + 1 < current.take) {
      setSampleNo((n) => n + 1)
    } else {
      setQueueIdx((i) => i + 1)
      setSampleNo(0)
    }
  }

  const register = () => {
    if (!current) return
    const strokes = strokesRef.current
    const total = strokes.reduce((sum, s) => sum + pathLength(s), 0)
    if (strokes.length === 0 || total < 12) {
      setToast('枠の中に、ふだんの大きさで書いてください')
      return
    }
    if (mode === 'redo' && !replacedRef.current.has(current.symbol)) {
      replacedRef.current.add(current.symbol)
      clearUserTemplates(current.symbol)
    }
    onStoreChange(saveUserTemplate(current.symbol, strokes))
    advance()
  }

  if (!current) {
    return (
      <div className="mb-3 rounded-card border border-gray-200 bg-white p-4 shadow-card" {...{ [PEN_UI_ATTR]: '' }}>
        <p className="mb-1 text-base font-extrabold text-ai">✅ お手本の登録が終わりました</p>
        <p className="mb-3 text-sm leading-relaxed text-ink-2">
          これで、あなたの字に合わせて記号を判別できます。
          下線・波線・＋・○で囲む漢字（仮・真・強調・同格）のお手本は任意です。
          登録し直し・追加は、いつでも「ペン判別の計測」ページ下部の「お手本登録」からできます。
        </p>
        <button
          type="button"
          onClick={() => {
            saveOnboardingDone(userId)
            onFinish()
          }}
          className="rounded-xl bg-nodo px-4 py-3 text-base font-bold text-white"
        >
          ペンで書きはじめる
        </button>
      </div>
    )
  }

  return (
    // ペン用の操作部品（登録の流れはペンだけで完結できるようにする）
    <div className="mb-3 rounded-card border border-sora bg-white p-4 shadow-card" {...{ [PEN_UI_ATTR]: '' }}>
      <p className="mb-1 text-base font-extrabold text-ai">
        {mode === 'redo' ? 'お手本の登録し直し' : 'はじめに: 記号のお手本登録（1回だけ・2〜4分）'}
      </p>
      <p className="mb-2 text-xs leading-relaxed text-ink-3">
        あなたの字を登録すると、ペンで書いた記号の判別が当たりやすくなります。
        登録した字はこの端末の中だけに保存され、外には送られません。
      </p>
      <p className="mb-2 text-xs font-bold text-ink-3">
        登録済み {doneCount} / {REQUIRED_SYMBOLS.length} 種
      </p>

      <div className="mb-2 flex items-center gap-3 rounded-xl bg-sora-soft p-3">
        <ReferenceGlyph symbol={current.symbol} />
        <div>
          <p className="text-lg font-extrabold text-ai">
            「{symbolLabel(current.symbol)}」を書いてください
            {current.take > 1 && (
              <span className="ml-1 text-sm font-bold text-ink-3">
                （{sampleNo + 1}本目 / {current.take}本）
              </span>
            )}
          </p>
          <p className="text-xs text-ink-2">{symbolHint(current.symbol)}</p>
        </div>
      </div>

      <EnrollCanvas
        policy={policy}
        resetToken={resetToken}
        onStrokesChange={(s) => {
          strokesRef.current = s
        }}
      />
      {toast && <p className="mt-1 text-xs font-bold text-again">{toast}</p>}

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={register}
          className="rounded-xl bg-sora px-4 py-2.5 text-sm font-bold text-white"
        >
          この字を登録して次へ
        </button>
        <button
          type="button"
          onClick={() => {
            strokesRef.current = []
            setResetToken((n) => n + 1)
          }}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-ai"
        >
          書き直す
        </button>
        {mode === 'redo' && (
          <button
            type="button"
            onClick={advance}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-ink-3"
          >
            この字はそのまま（次へ）
          </button>
        )}
        <button
          type="button"
          onClick={onExit}
          className="ml-auto rounded-xl px-3 py-2.5 text-xs font-bold text-ink-3"
        >
          途中でやめる（次回は続きから）
        </button>
      </div>
    </div>
  )
}
