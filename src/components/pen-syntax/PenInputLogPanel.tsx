'use client'

/**
 * 「入力の記録」表示（実機不具合の報告用・2026-08-26）。
 *
 * ペン入力の受理/拒否・座標・画面の移動を時系列で表示し、
 * ワンタップでコピーできるようにする。塾長が実機で症状を起こし、
 * この記録を貼り付けるだけで原因が特定できる形にする。
 */

import { useEffect, useState } from 'react'
import { formatInputLog, type PenInputLog } from '@/lib/pen-syntax/input-log'

export function PenInputLogPanel({ log }: { log: PenInputLog }) {
  const [, setTick] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => log.subscribe(() => setTick((n) => n + 1)), [log])

  const text = formatInputLog(log.entries(), {
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    visualViewportSupported: typeof window !== 'undefined' && !!window.visualViewport,
  })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // クリップボードが使えない環境では手動で全選択してもらう
      const el = document.getElementById('pen-input-log-textarea') as HTMLTextAreaElement | null
      el?.select()
    }
  }

  return (
    <div className="rounded-card border border-gray-200 bg-white p-3 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-bold text-ai">入力の記録（不具合の報告用）</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copy}
            className="rounded-lg bg-sora px-3 py-1.5 text-xs font-bold text-white"
          >
            {copied ? 'コピーしました' : '記録をコピー'}
          </button>
          <button
            type="button"
            onClick={() => log.clear()}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-again"
          >
            クリア
          </button>
        </div>
      </div>
      <p className="mb-2 text-xs leading-relaxed text-ink-3">
        ペン・指の接触を受け付けたか捨てたかと、線を描いている最中に画面が動いたかを自動で記録します。
        症状が出たら「記録をコピー」を押して、そのまま報告に貼り付けてください。記録は端末の外に出ません。
      </p>
      <textarea
        id="pen-input-log-textarea"
        readOnly
        value={text}
        rows={8}
        className="w-full rounded-xl border border-gray-200 bg-paper p-2 font-mono text-[10px] leading-relaxed text-ink-2"
      />
    </div>
  )
}
