'use client'

/**
 * 組み立てキャンバス（段落の中・段落どうしの両方で使う）。
 *
 * 工房の読解コーチはドラッグで並べ替え・字下げしていたが、スマホでは取りこぼしが多いため、
 * ボタン（↑↓で順番・→←で字下げ）に置き換えている。判定のしくみは同じ。
 * 置いた場所によって選べる記号が自動で絞られる。
 */

import { symOptionsFor } from '@/lib/reading/judge'
import { SYM_LABEL, type ArrangeItem } from '@/lib/reading/types'
import { circled } from '@/lib/reading/segments'

interface ArrangeCanvasProps {
  items: ArrangeItem[]
  /** 行に出すラベル（no → 文言） */
  labelOf: (item: ArrangeItem) => string
  /** 番号の出し方。'circled' = ①②③ / 'para' = ¶1 */
  numbering?: 'circled' | 'para'
  onChange: (next: ArrangeItem[]) => void
  disabled?: boolean
}

/** 字下げの飛び（いきなり2段下がる等）を詰める */
function normalizeIndents(items: ArrangeItem[]): ArrangeItem[] {
  let prev = -1
  return items.map((it) => {
    const indent = Math.max(0, Math.min(it.indent, prev + 1))
    prev = indent
    return it.indent === indent ? it : { ...it, indent }
  })
}

/** 置き場所が変わると選べる記号も変わるので、選べなくなった記号は外す */
function normalizeSyms(items: ArrangeItem[]): ArrangeItem[] {
  return items.map((it, i) => {
    const opts = symOptionsFor(items, i)
    if (it.sym && !opts.includes(it.sym)) return { ...it, sym: opts[0] === '＋' ? '＋' : '' }
    if (!it.sym && opts[0] === '＋') return { ...it, sym: '＋' }
    return it
  })
}

export function normalizeArrange(items: ArrangeItem[]): ArrangeItem[] {
  return normalizeSyms(normalizeIndents(items))
}

export function ArrangeCanvas({
  items,
  labelOf,
  numbering = 'circled',
  onChange,
  disabled = false,
}: ArrangeCanvasProps) {
  const apply = (next: ArrangeItem[]) => onChange(normalizeArrange(next))

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const [row] = next.splice(idx, 1)
    next.splice(target, 0, row)
    apply(next)
  }

  const indent = (idx: number, dir: -1 | 1) => {
    const next = items.map((it, i) =>
      i === idx ? { ...it, indent: Math.max(0, it.indent + dir) } : it
    )
    apply(next)
  }

  const setSym = (idx: number, sym: string) => {
    apply(items.map((it, i) => (i === idx ? { ...it, sym } : it)))
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const opts = symOptionsFor(items, idx)
        const maxIndent = idx === 0 ? 0 : items[idx - 1].indent + 1
        return (
          <div
            key={item.id}
            className="rounded-2xl border border-gray-200 bg-white p-2.5 shadow-sm"
            style={{ marginLeft: `${Math.min(item.indent, 4) * 16}px` }}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-full bg-ai px-1.5 text-xs font-bold text-white">
                {numbering === 'para' ? `¶${item.no}` : circled(item.no)}
              </span>
              <span className="min-w-0 flex-1 break-words text-sm text-ink">
                {labelOf(item) || <span className="text-ink-3">（未入力）</span>}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <select
                value={item.sym || ''}
                onChange={(e) => setSym(idx, e.target.value)}
                disabled={disabled}
                aria-label="関係の記号"
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">記号を選ぶ</option>
                {opts.map((s) => (
                  <option key={s} value={s}>
                    {s} {SYM_LABEL[s] || ''}
                  </option>
                ))}
              </select>

              <div className="ml-auto flex items-center gap-1">
                <ArrangeButton label="上へ" disabled={disabled || idx === 0} onClick={() => move(idx, -1)}>
                  ↑
                </ArrangeButton>
                <ArrangeButton
                  label="下へ"
                  disabled={disabled || idx === items.length - 1}
                  onClick={() => move(idx, 1)}
                >
                  ↓
                </ArrangeButton>
                <ArrangeButton
                  label="字下げを戻す"
                  disabled={disabled || item.indent === 0}
                  onClick={() => indent(idx, -1)}
                >
                  ←
                </ArrangeButton>
                <ArrangeButton
                  label="字下げする"
                  disabled={disabled || item.indent >= maxIndent}
                  onClick={() => indent(idx, 1)}
                >
                  →
                </ArrangeButton>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ArrangeButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-9 w-9 rounded-lg border border-gray-300 bg-white text-base font-bold text-ai disabled:opacity-30"
    >
      {children}
    </button>
  )
}
