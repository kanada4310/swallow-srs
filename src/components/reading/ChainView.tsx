'use client'

/**
 * 主張とサポートの骨格。
 * 段落ごとに、主張（中心文）と、それを支える主要サポートだけを取り出す。
 * 主張の行を上から読むと、文章全体の論旨の流れになる。
 */

import { circled } from '@/lib/reading/segments'
import { SYM_LABEL, type ReadingParagraph } from '@/lib/reading/types'

export function ChainView({ paragraphs }: { paragraphs: ReadingParagraph[] }) {
  return (
    <div className="space-y-3">
      <p className="rounded-2xl bg-sora-soft p-3 text-sm leading-relaxed text-ai">
        段落ごとに、主張（中心文）と、それを支える主要サポート（根拠・具体例・結果など）だけを取り出したものです。
        主張の行を上から読むと、文章全体の論旨の流れになります。
      </p>

      {paragraphs.map((p) => {
        const claims = p.kotos.filter((k) => k.role === 'claim')
        const majors = p.kotos.filter((k) => k.role === 'major')
        const minorCount = p.kotos.filter((k) => k.no && k.role === 'minor').length

        return (
          <div key={p.no} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
            <p className="mb-1.5 text-sm font-extrabold text-ai">¶{p.no}</p>
            {p.macro && (
              <p className="mb-2 rounded-xl bg-paper p-2.5 text-sm text-ink-2">
                <span className="mr-1 font-bold text-ai">要旨</span>
                {p.macro}
              </p>
            )}
            {claims.length === 0 && majors.length === 0 ? (
              <p className="text-sm text-ink-3">（この段落は骨格のデータがありません）</p>
            ) : (
              <>
                {claims.map((k) => (
                  <p key={k.no} className="mb-1.5 flex gap-2 text-sm">
                    <span className="inline-flex h-6 flex-shrink-0 items-center rounded-full bg-nodo px-2 text-xs font-bold text-white">
                      {circled(k.no)}
                    </span>
                    <span>
                      <span className="mr-1 font-bold text-nodo">
                        {k.sym === 'TS' ? '主張' : `中心文（${SYM_LABEL[k.sym] || k.sym}）`}
                      </span>
                      {k.t}
                    </span>
                  </p>
                ))}
                {majors.length > 0 && (
                  <ul className="ml-3 space-y-1 border-l-2 border-gray-200 pl-3">
                    {majors.map((k) => (
                      <li key={k.no} className="flex gap-2 text-sm text-ink-2">
                        <span className="inline-flex h-6 flex-shrink-0 items-center rounded-full bg-ai-soft px-2 text-xs font-bold text-white">
                          {circled(k.no)}
                        </span>
                        <span>
                          <span className="mr-1 font-bold text-ai-soft">
                            サポート: {SYM_LABEL[k.sym] || k.sym}
                          </span>
                          {k.t}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {minorCount > 0 && (
                  <p className="mt-2 text-xs text-ink-3">
                    付帯サポート {minorCount} 件（出典・同格・目的・条件の細部など）を畳んでいます
                  </p>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
