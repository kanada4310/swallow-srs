'use client'

/**
 * コーチマーク: 画面ごとの初回1回だけ出す小さなヒントカード。
 * スポットライト式のオーバーレイではなく、対象のすぐ近くに置く非モーダルの
 * 吹き出し（学習フローを止めない）。既読管理は src/lib/tutorial/coach.ts。
 */
export function CoachTip({
  title,
  children,
  onDismiss,
}: {
  title: string
  children: React.ReactNode
  onDismiss: () => void
}) {
  return (
    <div className="rounded-2xl border border-sora bg-sora-soft p-4 text-left" role="note">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-ai">{title}</p>
          <div className="mt-1 text-[13px] leading-relaxed text-ink-2">{children}</div>
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 rounded-full bg-sora px-3.5 py-1.5 text-xs font-bold text-white hover:bg-sora-dark transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        >
          OK
        </button>
      </div>
    </div>
  )
}
