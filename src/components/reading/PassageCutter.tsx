'use client'

/**
 * ②切る — 意味のまとまり（事柄）で本文を区切る画面。
 *
 * 語と語のあいだをタップすると「／」が入る。切りすぎは減点しない。
 * 指摘するのは「そこで切らないと論理関係が消える切れ目」の見逃しだけ。
 */

import { useMemo } from 'react'
import { circled, cutKey, studentSegments } from '@/lib/reading/segments'
import type { ParagraphWork, ReadingParagraph } from '@/lib/reading/types'

interface PassageCutterProps {
  para: ReadingParagraph
  work: ParagraphWork
  onToggleCut: (key: string) => void
  /** 答えを開示した切れ目（赤枠で場所を示す） */
  revealedKeys: Set<string>
  /** 合格後は自分の区切りに番号を振って見せる */
  showBadges: boolean
  onOpenSyntax?: (sentenceIndex: number) => void
  locked?: boolean
}

export function PassageCutter({
  para,
  work,
  onToggleCut,
  revealedKeys,
  showBadges,
  onOpenSyntax,
  locked = false,
}: PassageCutterProps) {
  const cuts = useMemo(() => new Set(work.cuts), [work.cuts])

  // 合格後のバッジ位置: 生徒自身の区切りに番号を振る（文をまたいだ続きは ' を付ける）
  const badges = useMemo(() => {
    const map = new Map<string, { no: number; cont: boolean }>()
    if (!showBadges) return map
    studentSegments(para, cuts).forEach((s) => {
      map.set(`${s.si}:${s.start}`, { no: s.num, cont: false })
      s.contStarts.forEach((cs) => map.set(`${cs}:0`, { no: s.num, cont: true }))
    })
    return map
  }, [para, cuts, showBadges])

  return (
    <div className="space-y-3">
      {para.sentences.map((sent, si) => (
        <div key={sent.id} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-ink-3">第{si + 1}文</span>
            {onOpenSyntax && (
              <button
                type="button"
                onClick={() => onOpenSyntax(si)}
                className="rounded-full border border-gray-300 px-2.5 py-1 text-[11px] font-semibold text-ai-soft hover:bg-sora-soft"
              >
                この文が読めない
              </button>
            )}
          </div>

          <p className="flex flex-wrap items-center leading-loose">
            {si > 0 && (
              <Gap
                cutKeyStr={cutKey(si, 0)}
                active={cuts.has(cutKey(si, 0))}
                revealed={revealedKeys.has(cutKey(si, 0))}
                onToggle={onToggleCut}
                locked={locked}
                head
              />
            )}
            {badges.has(`${si}:0`) && <Badge {...badges.get(`${si}:0`)!} />}
            {sent.tokens.map((tok, ti) => {
              const badge = ti > 0 ? badges.get(`${si}:${ti}`) : undefined
              return (
                <span key={ti} className="inline-flex items-center">
                  {badge && <Badge {...badge} />}
                  <span className="font-serif text-[17px] text-ink">{tok}</span>
                  {ti < sent.tokens.length - 1 && (
                    <Gap
                      cutKeyStr={cutKey(si, ti + 1)}
                      active={cuts.has(cutKey(si, ti + 1))}
                      revealed={revealedKeys.has(cutKey(si, ti + 1))}
                      onToggle={onToggleCut}
                      locked={locked}
                    />
                  )}
                </span>
              )
            })}
          </p>
        </div>
      ))}
    </div>
  )
}

function Badge({ no, cont }: { no: number; cont: boolean }) {
  return (
    <span className="mr-1 inline-flex h-5 items-center rounded-full bg-good-bg px-1.5 text-[11px] font-bold text-good">
      {circled(no)}
      {cont ? '’' : ''}
    </span>
  )
}

function Gap({
  cutKeyStr,
  active,
  revealed,
  onToggle,
  locked,
  head = false,
}: {
  cutKeyStr: string
  active: boolean
  revealed: boolean
  onToggle: (key: string) => void
  locked: boolean
  head?: boolean
}) {
  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => onToggle(cutKeyStr)}
      aria-label={active ? 'この切れ目を消す' : 'ここで切る'}
      aria-pressed={active}
      className={[
        'mx-0.5 inline-flex h-7 min-w-[18px] items-center justify-center rounded text-base align-middle',
        active ? 'font-bold text-nodo' : 'text-gray-300',
        revealed ? 'ring-2 ring-again' : '',
        head ? 'mr-1' : '',
        locked ? 'cursor-default' : 'hover:bg-sora-soft',
      ].join(' ')}
    >
      {active ? '／' : '·'}
    </button>
  )
}
