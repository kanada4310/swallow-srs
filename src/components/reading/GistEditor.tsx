'use client'

/**
 * ③大意を書く — 生徒自身の区切りごとに、自分の言葉で一言にする（DEC-033 の関門）。
 *
 * 判定はしない。全部書けたら「模範と見比べる」で自己照合し、組み立てへ進む。
 * 一言で言えないまとまりがあったら、切れ目を見直す合図になる。
 */

import { useState } from 'react'
import { circled, gistText, studentSegments } from '@/lib/reading/segments'
import { kotoForSegment } from '@/lib/reading/segments'
import type { Gist, ParagraphWork, ReadingParagraph } from '@/lib/reading/types'

interface GistEditorProps {
  para: ReadingParagraph
  work: ParagraphWork
  onChange: (segId: string, gist: Gist) => void
}

export function GistEditor({ para, work, onChange }: GistEditorProps) {
  const [showModel, setShowModel] = useState(false)
  const segs = studentSegments(para, work.cuts)

  return (
    <div className="space-y-3">
      <p className="rounded-2xl bg-sora-soft p-3 text-sm leading-relaxed text-ai">
        番号は<b>自分で入れた切れ目</b>に沿っています。それぞれを<b>自分の言葉で一言</b>にしてください（体言止めで構いません）。
        まとまりの中に因果が畳まれているときは「<b>A → B</b>」の形が便利です。
      </p>

      {segs.map((s) => {
        const g = work.gists[s.id]
        const structured = g != null && typeof g === 'object'
        const kno = kotoForSegment(para, s)
        const koto = para.kotos.find((x) => x.no === kno)
        return (
          <div key={s.id} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
            <p className="mb-2 flex gap-2 text-sm">
              <span className="inline-flex h-6 flex-shrink-0 items-center rounded-full bg-ai px-2 text-xs font-bold text-white">
                {circled(s.num)}
              </span>
              <span className="font-serif text-[15px] text-ink-2">{s.text}</span>
            </p>

            {!structured ? (
              <input
                type="text"
                data-gist={s.id}
                value={(g as string) || ''}
                placeholder="このまとまりを一言で"
                onChange={(e) => onChange(s.id, e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base focus:border-sora focus:outline-none"
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={g.a || ''}
                  placeholder="原因・〜すると"
                  onChange={(e) => onChange(s.id, { a: e.target.value, b: g.b || '' })}
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2.5 text-base focus:border-sora focus:outline-none"
                />
                <span className="text-lg font-bold text-ink-3">→</span>
                <input
                  type="text"
                  value={g.b || ''}
                  placeholder="結果・〜が起こる"
                  onChange={(e) => onChange(s.id, { a: g.a || '', b: e.target.value })}
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2.5 text-base focus:border-sora focus:outline-none"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                onChange(
                  s.id,
                  structured ? gistText(g) : { a: typeof g === 'string' ? g : '', b: '' }
                )
              }
              className="mt-2 text-xs font-semibold text-sora-dark underline"
            >
              {structured ? '1つの文に戻す' : 'A → B の形で書く'}
            </button>

            {showModel && koto && (
              <div className="mt-2 rounded-xl bg-paper p-2.5 text-sm text-ink-2">
                <span className="font-bold text-ai">模範: </span>
                {koto.t}
                {koto.expand && (
                  <span className="mt-1 block text-xs text-ink-3">
                    中に畳まれた因果: {koto.expand}
                    {koto.packed ? `（${koto.packed} が運んでいます）` : ''}
                  </span>
                )}
                {koto.expand && typeof g === 'string' && (
                  <span className="mt-1 block text-xs text-hard">
                    このまとまりは「A → B」の形でも書けます。試してみてください。
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={() => setShowModel((v) => !v)}
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-ai"
      >
        {showModel ? '模範の大意を隠す' : '模範の大意と見比べる'}
      </button>
      {showModel && (
        <p className="text-xs leading-relaxed text-ink-3">
          自分の大意と意味がずれているまとまりは、読み（または切れ目）を見直してください。
          自分の区切りが模範より細かい場合、複数のまとまりに同じ模範が付きます。
        </p>
      )}
    </div>
  )
}
