'use client'

/**
 * 模範の順序の一覧（講師用・2026-08-26 指示書 2026-08-26-srs-pen-order-hints）。
 *
 * 講師（塾長）がペンで分析した筆順を「模範の順序」として保存したものを表示する。
 * 保存先はこの端末の localStorage（外部送信なし・DB変更なし）。
 * 「コピー」で JSON を書き出し、生徒の並びとの比較・検討順ヒント
 * （order-hints.ts の並び）の調整材料として報告に貼り付けられる。
 */

import { useState } from 'react'
import { deleteModelOrder, type ModelOrder } from '@/lib/pen-syntax/order'

export function ModelOrderPanel({
  orders,
  onOrdersChange,
}: {
  orders: ModelOrder[]
  onOrdersChange: (next: ModelOrder[]) => void
}) {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (payload: string, id: string) => {
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(id)
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000)
    } catch {
      // クリップボードが使えない環境では何もしない（JSON は下の一覧に出ている）
    }
  }

  if (orders.length === 0) {
    return (
      <p className="rounded-card border border-gray-200 bg-white p-3 text-xs leading-relaxed text-ink-3 shadow-card">
        まだ保存されていません。ペンで文を分析して採点したあと、採点結果の下の
        「この筆順を模範の順序として保存」を押すと、ここに並びます。
      </p>
    )
  }

  return (
    <div className="rounded-card border border-gray-200 bg-white p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs leading-relaxed text-ink-3">
          この端末に保存された模範の順序（外部には送られません）。
          「コピー」した内容を報告に貼ると、検討順ヒントの並べ替えの材料になります。
        </p>
        <button
          type="button"
          onClick={() => copy(JSON.stringify(orders, null, 2), 'all')}
          className="ml-2 shrink-0 rounded-lg bg-sora px-3 py-1.5 text-xs font-bold text-white"
        >
          {copied === 'all' ? 'コピーしました' : 'すべてコピー'}
        </button>
      </div>
      <div className="space-y-2">
        {orders.map((o) => (
          <div key={o.id} className="rounded-xl border border-gray-200 bg-paper p-2.5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-ai">{o.problemTitle}</p>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => copy(JSON.stringify(o, null, 2), o.id)}
                  className="rounded-lg border border-sora bg-white px-2 py-1 text-[10px] font-bold text-sora-dark"
                >
                  {copied === o.id ? 'コピーしました' : 'コピー'}
                </button>
                <button
                  type="button"
                  onClick={() => onOrdersChange(deleteModelOrder(o.id))}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[10px] font-bold text-again"
                >
                  削除
                </button>
              </div>
            </div>
            <ol className="list-decimal space-y-0.5 pl-5 text-xs text-ink-2">
              {o.summary.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
            <p className="mt-1 text-[10px] text-ink-3">
              保存: {new Date(o.savedAt).toLocaleString('ja-JP')}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
