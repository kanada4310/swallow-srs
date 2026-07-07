/** つばめのシルエット（ブランドマーク）。完了画面・ミッションカード・空状態にだけ登場させる */
export function SwallowMark({ className, fill = '#1C2B4B' }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 100 60" className={className} aria-hidden>
      <path
        d="M2 8 C30 2 50 10 58 22 C70 14 88 14 98 6 C90 22 74 30 62 30 L70 56 L58 34 L46 56 L54 30 C34 30 12 22 2 8 Z"
        fill={fill}
      />
    </svg>
  )
}
