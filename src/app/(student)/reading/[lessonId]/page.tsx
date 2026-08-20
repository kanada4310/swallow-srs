'use client'

/**
 * 読解ページ本体 — 1本の流れ（読む→切る→大意→組み立て→全体→まとめ）。
 *
 * 工房の2つのアプリ（文脈読解コーチ／構文分析アプリ）を1本にまとめたもの。
 * 構文はタブではなく「困った1文だけ降りる」形で流れの中に埋め込んでいる。
 * 入力は自動保存され、別の端末でも続きから開ける。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import {
  describeReadingError,
  loadLesson,
  loadLessonIndex,
  lessonTitle,
} from '@/lib/reading/lessons'
import { useReadingProgress } from '@/lib/reading/useReadingProgress'
import {
  arrangeMatchesSegments,
  judgeCuts,
  judgeGlobalArrange,
  judgeRelations,
  judgeReview,
  missingSyms,
  ROLE_LABEL,
  type CutJudgement,
  type GlobalJudgement,
  type RelationJudgement,
  type ReviewJudgement,
} from '@/lib/reading/judge'
import { circled, gistsComplete, gistText, studentSegments } from '@/lib/reading/segments'
import {
  SYM_LABEL,
  STEP_LABEL,
  STEP_ORDER,
  type ArrangeItem,
  type Gist,
  type ParagraphWork,
  type ReadingLessonData,
  type ReadingLessonIndexEntry,
  type ReadingParagraph,
  type ReadingProgressState,
  type ReadingRequiredCut,
  type ReadingStep,
} from '@/lib/reading/types'
import { PassageCutter } from '@/components/reading/PassageCutter'
import { GistEditor } from '@/components/reading/GistEditor'
import { ArrangeCanvas, normalizeArrange } from '@/components/reading/ArrangeCanvas'
import { ChainView } from '@/components/reading/ChainView'
import { SummaryStep } from '@/components/reading/SummaryStep'
import { BlankSentence } from '@/components/reading/BlankSentence'

function symWithLabel(sym: string): string {
  return SYM_LABEL[sym] ? `${sym}（${SYM_LABEL[sym]}）` : sym
}

export default function ReadingLessonPage() {
  const params = useParams()
  const { userId, isLoading: authLoading } = useAuth()

  // 動的ルートのフォールバック（オフライン復帰などで params が空になることがある）
  const lessonId = useMemo(() => {
    const raw = params?.lessonId
    const fromParams = Array.isArray(raw) ? raw[0] : raw
    if (fromParams) return decodeURIComponent(fromParams)
    if (typeof window !== 'undefined') {
      const seg = window.location.pathname.split('/').filter(Boolean).pop()
      return seg ? decodeURIComponent(seg) : null
    }
    return null
  }, [params])

  const [entry, setEntry] = useState<ReadingLessonIndexEntry | null>(null)
  const [data, setData] = useState<ReadingLessonData | null>(null)
  const [loadError, setLoadError] = useState<{ message: string; needsLogin: boolean } | null>(null)

  useEffect(() => {
    if (!lessonId) return
    let cancelled = false
    ;(async () => {
      try {
        const lessons = await loadLessonIndex()
        const found = lessons.find((l) => l.id === lessonId)
        if (!found) throw new Error('not found')
        const lesson = await loadLesson(found)
        if (cancelled) return
        setEntry(found)
        setData(lesson)
        setLoadError(null)
      } catch (err) {
        if (cancelled) return
        setLoadError(
          err instanceof Error && err.message === 'not found'
            ? { message: 'この講は見つかりませんでした。一覧から選び直してください。', needsLogin: false }
            : describeReadingError(err)
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [lessonId])

  const { state, update, status, retry, loaded } = useReadingProgress(userId, lessonId, data)

  if (authLoading || (!data && !loadError)) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="mb-4 h-7 w-40 animate-pulse rounded-xl bg-gray-200" />
          <div className="h-64 animate-pulse rounded-card bg-gray-200" />
        </div>
      </AppLayout>
    )
  }

  if (loadError) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="rounded-card border border-gray-200 bg-white p-5 shadow-card">
            <p className="mb-3 text-sm leading-relaxed text-ink">{loadError.message}</p>
            {loadError.needsLogin ? (
              <a
                href="/login"
                className="inline-block rounded-xl bg-sora px-4 py-2.5 text-sm font-bold text-white"
              >
                ログインし直す
              </a>
            ) : (
              <Link
                href="/reading"
                className="inline-block rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-bold text-ai"
              >
                読解の一覧へ
              </Link>
            )}
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!data || !entry || !state || !loaded) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="h-64 animate-pulse rounded-card bg-gray-200" />
        </div>
      </AppLayout>
    )
  }

  return (
    <LessonFlow
      entry={entry}
      data={data}
      state={state}
      update={update}
      status={status}
      retry={retry}
    />
  )
}

/* =====================================================================
 * 1本の流れ
 * ===================================================================== */

interface LessonFlowProps {
  entry: ReadingLessonIndexEntry
  data: ReadingLessonData
  state: ReadingProgressState
  update: (fn: (prev: ReadingProgressState) => ReadingProgressState) => void
  status: string
  retry: () => void
}

function LessonFlow({ entry, data, state, update, status, retry }: LessonFlowProps) {
  const paraIdx = Math.min(state.paraIdx, data.paragraphs.length - 1)
  const para = data.paragraphs[paraIdx]
  const work = state.paragraphs[paraIdx]

  const [cutFeedback, setCutFeedback] = useState<CutJudgement | null>(null)
  const [reviewFeedback, setReviewFeedback] = useState<ReviewJudgement | null>(null)
  const [relFeedback, setRelFeedback] = useState<RelationJudgement | null>(null)
  const [relError, setRelError] = useState<string | null>(null)
  const [globalFeedback, setGlobalFeedback] = useState<GlobalJudgement | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [globalSub, setGlobalSub] = useState<'gists' | 'arrange'>('gists')
  const [showChain, setShowChain] = useState(false)
  const [syntaxSentence, setSyntaxSentence] = useState<number | null>(null)
  const [dirtyNote, setDirtyNote] = useState(false)

  const segs = useMemo(() => studentSegments(para, work.cuts), [para, work.cuts])
  const segmentCounts = useMemo(
    () => data.paragraphs.map((p, i) => studentSegments(p, state.paragraphs[i].cuts).length),
    [data.paragraphs, state.paragraphs]
  )

  const setStep = useCallback(
    (step: ReadingStep) => update((prev) => ({ ...prev, step })),
    [update]
  )

  const updateParaAt = useCallback(
    (idx: number, fn: (w: ParagraphWork) => ParagraphWork) =>
      update((prev) => ({
        ...prev,
        paragraphs: prev.paragraphs.map((w, i) => (i === idx ? fn(w) : w)),
      })),
    [update]
  )

  const updatePara = useCallback(
    (fn: (w: ParagraphWork) => ParagraphWork) => updateParaAt(paraIdx, fn),
    [updateParaAt, paraIdx]
  )

  /* ---------------- ②切る ---------------- */

  const toggleCut = useCallback(
    (key: string) => {
      updatePara((w) => {
        const has = w.cuts.includes(key)
        return { ...w, cuts: has ? w.cuts.filter((c) => c !== key) : [...w.cuts, key] }
      })
      if (work.committed && !work.passed) {
        setCutFeedback(null)
        setDirtyNote(true)
      }
    },
    [updatePara, work.committed, work.passed]
  )

  const commitCuts = useCallback(() => {
    const result = judgeCuts(para, work.cuts)
    setDirtyNote(false)
    setCutFeedback(result)
    updatePara((w) => {
      const cutStats = { ...w.cutStats }
      if (result.passed) {
        Object.keys(cutStats).forEach((k) => {
          cutStats[k] = { ...cutStats[k], resolved: true }
        })
      } else {
        // カードを出した時点で「文の指定」まで降りたものとして数える
        result.missed.forEach((c) => {
          const k = `${c.sentence}:${c.gap}`
          cutStats[k] = { ...cutStats[k], hint: Math.max(cutStats[k]?.hint ?? 0, 2) }
        })
      }
      return {
        ...w,
        committed: true,
        attempts: w.attempts + 1,
        passed: result.passed,
        extraCount: result.extra.length,
        cutStats,
      }
    })
  }, [para, work.cuts, updatePara])

  const runReview = useCallback(() => {
    const result = judgeReview(data, state.paragraphs)
    setReviewFeedback(result)
    if (result.passed) {
      update((prev) => ({
        ...prev,
        paragraphs: prev.paragraphs.map((w) => ({ ...w, passed: true, committed: true })),
      }))
      return
    }
    // 上位2件だけ「段落の指定」まで降ろす
    result.missed.slice(0, 2).forEach((m) => {
      updateParaAt(m.paraIdx, (w) => {
        const k = `${m.cut.sentence}:${m.cut.gap}`
        return {
          ...w,
          cutStats: { ...w.cutStats, [k]: { ...w.cutStats[k], hint: Math.max(w.cutStats[k]?.hint ?? 0, 1) } },
        }
      })
    })
  }, [data, state.paragraphs, update, updateParaAt])

  const revealHint = useCallback(
    (idx: number, cut: ReadingRequiredCut, level: number) => {
      updateParaAt(idx, (w) => {
        const k = `${cut.sentence}:${cut.gap}`
        return {
          ...w,
          cutStats: {
            ...w.cutStats,
            [k]: { ...w.cutStats[k], hint: Math.max(w.cutStats[k]?.hint ?? 0, level) },
          },
        }
      })
    },
    [updateParaAt]
  )

  const revealedKeys = useMemo(() => {
    const set = new Set<string>()
    Object.entries(work.cutStats).forEach(([k, st]) => {
      if (st.hint >= 4) set.add(k)
    })
    return set
  }, [work.cutStats])

  /* ---------------- ③大意 ---------------- */

  const setGist = useCallback(
    (segId: string, gist: Gist) => updatePara((w) => ({ ...w, gists: { ...w.gists, [segId]: gist } })),
    [updatePara]
  )

  const gistsDone = gistsComplete(para, work)

  /* ---------------- ④組み立て ---------------- */

  const arrange: ArrangeItem[] = useMemo(() => {
    if (arrangeMatchesSegments(work.arrange, segs)) return work.arrange as ArrangeItem[]
    return normalizeArrange(segs.map((s) => ({ no: s.num, id: s.id, indent: 0, sym: '' })))
  }, [work.arrange, segs])

  const setArrange = useCallback(
    (next: ArrangeItem[]) => updatePara((w) => ({ ...w, arrange: next })),
    [updatePara]
  )

  const commitRelations = useCallback(() => {
    const missing = missingSyms(arrange)
    if (missing.length > 0) {
      setRelError(
        `まだ記号を選んでいないまとまりが ${missing.length} 個あります（${missing
          .map((it) => circled(it.no))
          .join(' ')}）。全部選んでから判定してください。`
      )
      setRelFeedback(null)
      return
    }
    setRelError(null)
    const result = judgeRelations(para, { ...work, arrange })
    setRelFeedback(result)
    updatePara((w) => ({
      ...w,
      arrange,
      relAttempts: w.relAttempts + 1,
      relPassed: result.passed,
    }))
  }, [arrange, para, work, updatePara])

  /* ---------------- ⑤全体 ---------------- */

  const globalGistsComplete = data.paragraphs.every(
    (p) => (state.global.gists[String(p.no)] || '').trim().length > 0
  )

  const globalArrange: ArrangeItem[] = useMemo(() => {
    const saved = state.global.arrange
    if (saved && saved.length === data.paragraphs.length) return saved
    return normalizeArrange(
      data.paragraphs.map((p) => ({ no: p.no, id: String(p.no), indent: 0, sym: '' }))
    )
  }, [state.global.arrange, data.paragraphs])

  const commitGlobal = useCallback(() => {
    const missing = missingSyms(globalArrange)
    if (missing.length > 0) {
      setGlobalError(
        `まだ記号を選んでいない段落があります（${missing.map((it) => '¶' + it.no).join(' ')}）。`
      )
      setGlobalFeedback(null)
      return
    }
    setGlobalError(null)
    const result = judgeGlobalArrange(data.paragraphs, globalArrange)
    setGlobalFeedback(result)
    update((prev) => ({
      ...prev,
      global: {
        ...prev.global,
        arrange: globalArrange,
        attempts: prev.global.attempts + 1,
        passed: result.passed,
      },
    }))
  }, [globalArrange, data.paragraphs, update])

  /* ---------------- 画面 ---------------- */

  const allParagraphsPassed = state.paragraphs.every((w) => w.passed)

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-4 pb-24">
        {/* 見出し */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href="/reading" className="text-xs font-semibold text-sora-dark">
              ← 読解の一覧
            </Link>
            <h1 className="truncate text-lg font-extrabold text-ai">{lessonTitle(entry)}</h1>
          </div>
          <SaveBadge status={status} onRetry={retry} />
        </div>

        <StepBar step={state.step} />

        {state.step !== 'read' && state.step !== 'global' && state.step !== 'summary' && (
          <ParagraphNav
            total={data.paragraphs.length}
            current={paraIdx}
            passed={state.paragraphs.map((w) => w.passed)}
            onSelect={(i) => update((prev) => ({ ...prev, paraIdx: i }))}
          />
        )}

        {/* ---------- ①読む ---------- */}
        {state.step === 'read' && (
          <section className="space-y-3">
            <div className="rounded-card border border-gray-200 bg-white p-4 shadow-card">
              <p className="mb-1 text-sm text-ink-2">{entry.source}</p>
              <p className="text-sm text-ink-2">
                全 {entry.paragraphs} 段落 / 必須の切れ目 {entry.requiredCuts} か所
                {data.meta.target_time_min ? ` / 目安 ${data.meta.target_time_min} 分` : ''}
              </p>
            </div>

            <div className="rounded-card border border-gray-200 bg-white p-4 shadow-card">
              <p className="mb-2 text-sm font-bold text-ai">まず通して読みます</p>
              <p className="mb-3 text-sm leading-relaxed text-ink-2">
                辞書を引かずに、分からない語があっても最後まで目を通してください。
                このあと、意味のまとまりで区切っていきます。
              </p>
              {data.paragraphs.map((p) => (
                <div key={p.no} className="mb-3 last:mb-0">
                  <p className="mb-1 text-xs font-bold text-ink-3">¶{p.no}</p>
                  <p className="font-serif text-[16px] leading-loose text-ink">
                    {p.sentences.map((s) => s.text).join(' ')}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-card border border-gray-200 bg-white p-4 shadow-card">
              <p className="mb-2 text-sm font-bold text-ai">進め方を選ぶ</p>
              <div className="space-y-2">
                <ModeOption
                  selected={state.mode === 'drill'}
                  title="1段落ずつ確かめる（おすすめ）"
                  description="段落ごとに切って、その場で見逃しを教えてもらいます。"
                  onSelect={() => update((prev) => ({ ...prev, mode: 'drill' }))}
                />
                <ModeOption
                  selected={state.mode === 'review'}
                  title="全部切ってから講評を受ける"
                  description="本番と同じ形。全段落を切り終えてから、影響の大きい2件だけ指摘します。"
                  onSelect={() => update((prev) => ({ ...prev, mode: 'review' }))}
                />
              </div>
              <button
                type="button"
                onClick={() => setStep('cut')}
                className="mt-3 w-full rounded-xl bg-nodo px-4 py-3 text-base font-bold text-white"
              >
                切る作業を始める
              </button>
            </div>
          </section>
        )}

        {/* ---------- ②切る ---------- */}
        {state.step === 'cut' && (
          <section className="space-y-3">
            <p className="rounded-2xl bg-sora-soft p-3 text-sm leading-relaxed text-ai">
              切れ目だと思う語と語の間をタップしてください（<b className="text-nodo">／</b> が入ります）。
              もう一度タップすると消えます。<b>切りすぎは減点しません。</b>
              「そこで切らないと論理関係が消える切れ目」の見逃しだけをお知らせします。
            </p>

            <PassageCutter
              para={para}
              work={work}
              onToggleCut={toggleCut}
              revealedKeys={revealedKeys}
              showBadges={work.passed}
              onOpenSyntax={setSyntaxSentence}
            />

            {dirtyNote && (
              <p className="rounded-xl bg-paper p-3 text-sm text-ink-2">
                切れ目を変えました。もう一度判定してください。
              </p>
            )}

            {state.mode === 'drill' ? (
              <>
                {!work.passed && (
                  <button
                    type="button"
                    onClick={commitCuts}
                    className="w-full rounded-xl bg-nodo px-4 py-3 text-base font-bold text-white"
                  >
                    {work.attempts === 0 ? 'この段落を確定' : '再判定する'}
                  </button>
                )}

                {cutFeedback && !cutFeedback.passed && (
                  <div className="space-y-2">
                    {cutFeedback.missed.map((c) => (
                      <MissedCutCard
                        key={`${c.sentence}:${c.gap}`}
                        cut={c}
                        hint={work.cutStats[`${c.sentence}:${c.gap}`]?.hint ?? 0}
                        onReveal={(level) => revealHint(paraIdx, c, level)}
                      />
                    ))}
                    {cutFeedback.hitCount > 0 && (
                      <FeedbackCard tone="ok">
                        必須の切れ目のうち {cutFeedback.hitCount} か所は正しく入れられています。
                      </FeedbackCard>
                    )}
                    {cutFeedback.extra.length > 0 && (
                      <FeedbackCard tone="neutral">
                        必須以外の切れ目が {cutFeedback.extra.length} か所あります。切りすぎは減点しません。
                      </FeedbackCard>
                    )}
                  </div>
                )}

                {work.passed && (
                  <>
                    <FeedbackCard tone="ok">
                      <b>この段落の必須の切れ目は、すべて入れられています。</b>
                      <br />
                      あなたの区切りに沿って ①〜{circled(segs.length)} の番号を付けました。
                      続けて、それぞれの大意を自分の言葉で書いてください。
                      {work.extraCount > 0 && (
                        <span className="mt-1 block text-ink-3">
                          必須以外の切れ目が {work.extraCount} か所ありますが、切りすぎは問題ありません。
                        </span>
                      )}
                    </FeedbackCard>
                    {(cutFeedback?.foldsKept ?? []).map((f) => (
                      <FeedbackCard key={`${f.sentence}:${f.gap}`} tone="ok">
                        第{f.sentence}文と第{f.sentence + 1}文を1つの意味のまとまりとして読めています。
                        後の文は前の文の言い換え・説明の続きで、新しい内容ではありません。
                      </FeedbackCard>
                    ))}
                    <button
                      type="button"
                      onClick={() => setStep('gist')}
                      className="w-full rounded-xl bg-nodo px-4 py-3 text-base font-bold text-white"
                    >
                      大意を書く
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={runReview}
                  className="w-full rounded-xl bg-nodo px-4 py-3 text-base font-bold text-white"
                >
                  講評を受ける
                </button>
                {reviewFeedback && (
                  <div className="space-y-2">
                    {reviewFeedback.passed ? (
                      <>
                        <FeedbackCard tone="ok">
                          <b>
                            講評完了です。必須の切れ目 {reviewFeedback.totalHit}/
                            {reviewFeedback.totalRequired} をすべて入れられています。
                          </b>
                          {reviewFeedback.foldsKept > 0 && (
                            <span className="mt-1 block">
                              2文を1つのまとまりとして読めた箇所が {reviewFeedback.foldsKept} か所あります。
                            </span>
                          )}
                        </FeedbackCard>
                        <button
                          type="button"
                          onClick={() => setStep('gist')}
                          className="w-full rounded-xl bg-nodo px-4 py-3 text-base font-bold text-white"
                        >
                          大意を書く
                        </button>
                      </>
                    ) : (
                      <>
                        <FeedbackCard tone="neutral">
                          全体: 必須の切れ目 {reviewFeedback.totalHit}/{reviewFeedback.totalRequired}。
                          影響の大きい順に2件だけ確認します。直したら、もう一度「講評を受ける」を押してください。
                        </FeedbackCard>
                        {reviewFeedback.missed.slice(0, 2).map((m) => (
                          <ReviewMissCard
                            key={`${m.paraIdx}-${m.cut.sentence}:${m.cut.gap}`}
                            paraNo={m.paraNo}
                            roleLabel={ROLE_LABEL[m.rank]}
                            cut={m.cut}
                            hint={state.paragraphs[m.paraIdx].cutStats[`${m.cut.sentence}:${m.cut.gap}`]?.hint ?? 0}
                            onOpen={() => update((prev) => ({ ...prev, paraIdx: m.paraIdx }))}
                            onReveal={(level) => revealHint(m.paraIdx, m.cut, level)}
                          />
                        ))}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ---------- ③大意 ---------- */}
        {state.step === 'gist' && (
          <section className="space-y-3">
            <GistEditor para={para} work={work} onChange={setGist} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('cut')}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-ai"
              >
                切るに戻る
              </button>
              <button
                type="button"
                disabled={!gistsDone}
                onClick={() => setStep('arrange')}
                className="flex-1 rounded-xl bg-nodo px-4 py-3 text-base font-bold text-white disabled:bg-gray-300"
              >
                組み立てへ
              </button>
            </div>
            {!gistsDone && (
              <p className="text-center text-xs text-ink-3">
                まだ書いていないまとまりがあります。全部書くと次に進めます。
              </p>
            )}
          </section>
        )}

        {/* ---------- ④組み立て ---------- */}
        {state.step === 'arrange' && (
          <section className="space-y-3">
            <p className="rounded-2xl bg-sora-soft p-3 text-sm leading-relaxed text-ai">
              <b>↑↓</b> で順番を、<b>→←</b> で字下げを変えます。字下げすると、上のまとまりの下に付きます。
              段落の中心は一番左に置いてください。置いた場所によって、選べる記号が絞られます。
            </p>

            <ArrangeCanvas
              items={arrange}
              labelOf={(it) => gistText(work.gists[it.id])}
              onChange={setArrange}
            />

            <button
              type="button"
              onClick={commitRelations}
              className="w-full rounded-xl bg-nodo px-4 py-3 text-base font-bold text-white"
            >
              {work.relAttempts === 0 ? '組み立てを判定' : '組み立てを再判定'}
            </button>

            {relError && <FeedbackCard tone="neutral">{relError}</FeedbackCard>}

            {relFeedback && (
              <div className="space-y-2">
                {relFeedback.passed ? (
                  <FeedbackCard tone="ok">
                    <b>
                      組み立て {relFeedback.okCount}/{relFeedback.total} — すべて正しく付けられています。
                    </b>
                  </FeedbackCard>
                ) : (
                  <>
                    <FeedbackCard tone="neutral">
                      組み立て {relFeedback.okCount}/{relFeedback.total}。影響の大きい順に2件だけ確認します。
                      置き場所か記号を直して再判定してください。
                    </FeedbackCard>
                    {relFeedback.wrong.slice(0, 2).map((w2) => (
                      <RelationWrongCard
                        key={w2.item.no}
                        no={w2.item.no}
                        cue={w2.koto.cue || ''}
                        pairs={w2.pairs}
                        firstSegOfKoto={relFeedback.firstSegOfKoto}
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('gist')}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-ai"
              >
                大意に戻る
              </button>
              {paraIdx < data.paragraphs.length - 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    update((prev) => ({ ...prev, paraIdx: paraIdx + 1, step: 'cut' }))
                  }
                  className="flex-1 rounded-xl bg-ai px-4 py-3 text-base font-bold text-white"
                >
                  次の段落へ（¶{data.paragraphs[paraIdx + 1].no}）
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!allParagraphsPassed}
                  onClick={() => setStep('global')}
                  className="flex-1 rounded-xl bg-ai px-4 py-3 text-base font-bold text-white disabled:bg-gray-300"
                >
                  全体の組み立てへ
                </button>
              )}
            </div>
            {paraIdx === data.paragraphs.length - 1 && !allParagraphsPassed && (
              <p className="text-center text-xs text-ink-3">
                まだ切り終えていない段落があります。上の ¶ から戻って仕上げてください。
              </p>
            )}
          </section>
        )}

        {/* ---------- ⑤全体 ---------- */}
        {state.step === 'global' && (
          <section className="space-y-3">
            <div className="flex gap-1.5">
              <SubTab active={globalSub === 'gists'} onClick={() => setGlobalSub('gists')}>
                ① 各段落の要旨
              </SubTab>
              <SubTab
                active={globalSub === 'arrange'}
                onClick={() => globalGistsComplete && setGlobalSub('arrange')}
                disabled={!globalGistsComplete}
              >
                ② 段落を組む
              </SubTab>
            </div>

            {globalSub === 'gists' ? (
              <GlobalGists
                paragraphs={data.paragraphs}
                gists={state.global.gists}
                onChange={(no, value) =>
                  update((prev) => ({
                    ...prev,
                    global: { ...prev.global, gists: { ...prev.global.gists, [no]: value } },
                  }))
                }
                complete={globalGistsComplete}
                onNext={() => setGlobalSub('arrange')}
              />
            ) : (
              <>
                <p className="rounded-2xl bg-sora-soft p-3 text-sm leading-relaxed text-ai">
                  段落チップ（ラベルは自分の要旨）を <b>↑↓</b> で並べ、<b>→</b> で字下げすると
                  「上の段落の下に付く」形になります。行頭の記号は上の段落（＋は並びの仲間）との関係です。
                </p>
                <ArrangeCanvas
                  items={globalArrange}
                  numbering="para"
                  labelOf={(it) => state.global.gists[String(it.no)] || ''}
                  onChange={(next) =>
                    update((prev) => ({ ...prev, global: { ...prev.global, arrange: next } }))
                  }
                />
                <button
                  type="button"
                  onClick={commitGlobal}
                  className="w-full rounded-xl bg-nodo px-4 py-3 text-base font-bold text-white"
                >
                  {state.global.attempts === 0 ? '全体の組み立てを判定' : '全体の組み立てを再判定'}
                </button>
                {globalError && <FeedbackCard tone="neutral">{globalError}</FeedbackCard>}
                {globalFeedback && (
                  <div className="space-y-2">
                    {globalFeedback.passed ? (
                      <FeedbackCard tone="ok">
                        <b>全体の組み立て、段落間の記号はすべて妥当です。</b>
                        <br />
                        自分の要旨の連鎖を上から読み下ろして、論旨として通るかを最後に確認してください。
                      </FeedbackCard>
                    ) : (
                      <>
                        <FeedbackCard tone="neutral">
                          段落間の関係 {globalFeedback.okCount}/{globalFeedback.total}。
                          影響の大きい順に2件だけ確認します。
                        </FeedbackCard>
                        {globalFeedback.wrong.slice(0, 2).map((w2) => (
                          <GlobalWrongCard key={w2.paraNo} paraNo={w2.paraNo} macro={w2.macro} expected={w2.expected} />
                        ))}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => setStep('summary')}
              className="w-full rounded-xl bg-ai px-4 py-3 text-base font-bold text-white"
            >
              今日のまとめへ
            </button>
          </section>
        )}

        {/* ---------- ⑥まとめ ---------- */}
        {state.step === 'summary' && (
          <section className="space-y-3">
            <SummaryStep data={data} state={state} segmentCounts={segmentCounts} />

            <button
              type="button"
              onClick={() => setShowChain((v) => !v)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-ai"
            >
              {showChain ? '骨格を隠す' : '主張とサポートの骨格を見る'}
            </button>
            {showChain && <ChainView paragraphs={data.paragraphs} />}

            {!state.completedAt && (
              <button
                type="button"
                onClick={() =>
                  update((prev) => ({ ...prev, completedAt: new Date().toISOString() }))
                }
                className="w-full rounded-xl bg-nodo px-4 py-3 text-base font-bold text-white"
              >
                この講を終える
              </button>
            )}
            {state.completedAt && (
              <FeedbackCard tone="ok">
                この講は終了しています。いつでも戻って読み直せます。
              </FeedbackCard>
            )}
            <Link
              href="/reading"
              className="block rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-sm font-bold text-ai"
            >
              読解の一覧へ
            </Link>
          </section>
        )}

        {/* 下部の共通導線 */}
        {state.step !== 'read' && state.step !== 'summary' && (
          <div className="mt-6 flex gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setStep('summary')}
              className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs font-bold text-ink-2"
            >
              今日のまとめを見る
            </button>
            {state.step !== 'global' && (
              <button
                type="button"
                disabled={!allParagraphsPassed}
                onClick={() => setStep('global')}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs font-bold text-ink-2 disabled:opacity-40"
              >
                全体の組み立てへ
              </button>
            )}
          </div>
        )}
      </div>

      {syntaxSentence != null && (
        <BlankSentence
          para={para}
          sentenceIndex={syntaxSentence}
          onClose={() => setSyntaxSentence(null)}
        />
      )}
    </AppLayout>
  )
}

/* =====================================================================
 * 小さな部品
 * ===================================================================== */

function StepBar({ step }: { step: ReadingStep }) {
  const currentIdx = STEP_ORDER.indexOf(step)
  return (
    <ol className="mb-3 flex items-center gap-1 overflow-x-auto pb-1">
      {STEP_ORDER.map((s, i) => (
        <li key={s} className="flex flex-shrink-0 items-center">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              i === currentIdx
                ? 'bg-ai text-white'
                : i < currentIdx
                  ? 'bg-good-bg text-good'
                  : 'bg-gray-100 text-ink-3'
            }`}
          >
            {STEP_LABEL[s]}
          </span>
          {i < STEP_ORDER.length - 1 && <span className="px-0.5 text-ink-3">›</span>}
        </li>
      ))}
    </ol>
  )
}

function ParagraphNav({
  total,
  current,
  passed,
  onSelect,
}: {
  total: number
  current: number
  passed: boolean[]
  onSelect: (i: number) => void
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          className={`h-9 min-w-9 rounded-lg px-2 text-sm font-bold ${
            i === current
              ? 'bg-ai text-white'
              : passed[i]
                ? 'bg-good-bg text-good'
                : 'border border-gray-300 bg-white text-ink-2'
          }`}
        >
          ¶{i + 1}
        </button>
      ))}
    </div>
  )
}

function FeedbackCard({
  tone,
  children,
}: {
  tone: 'ok' | 'neutral' | 'ask'
  children: React.ReactNode
}) {
  const cls =
    tone === 'ok'
      ? 'border-good bg-good-bg text-ink'
      : tone === 'ask'
        ? 'border-hard bg-hard-bg text-ink'
        : 'border-gray-200 bg-paper text-ink-2'
  return <div className={`rounded-2xl border-l-4 p-3 text-sm leading-relaxed ${cls}`}>{children}</div>
}

function MissedCutCard({
  cut,
  hint,
  onReveal,
}: {
  cut: ReadingRequiredCut
  hint: number
  onReveal: (level: number) => void
}) {
  return (
    <FeedbackCard tone="ask">
      {cut.gap === 0 ? (
        <>
          <b>
            第{cut.sentence}文と第{cut.sentence + 1}文の間
          </b>
          で事柄が変わっています。文の頭の切れ目を入れて、「再判定する」を押してください。
        </>
      ) : (
        <>
          <b>第{cut.sentence + 1}文</b>に、必須の切れ目の見逃しが1つあります。
          この文の中で、論理関係が切り替わる場所を探して、切ってから「再判定する」を押してください。
        </>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {hint < 3 && <HintButton onClick={() => onReveal(3)}>ヒント（手がかり語）</HintButton>}
        {hint >= 3 && hint < 4 && <HintButton onClick={() => onReveal(4)}>答えを見る</HintButton>}
      </div>

      {hint >= 3 && (
        <p className="mt-2 text-sm">
          手がかり語:{' '}
          <b className="text-nodo">
            {cut.cue || '（この境界に固有の合図語はありません。意味のまとまりで考えてください）'}
          </b>
        </p>
      )}
      {hint >= 4 && (
        <p className="mt-1 text-sm">
          「{cut.tBefore}」と「{cut.tAfter}」の間で切ります。関係は {symWithLabel(cut.sym)} です。
          本文の該当の位置に赤い枠を出しました。自分でタップして切ってから、再判定してください。
        </p>
      )}
    </FeedbackCard>
  )
}

function ReviewMissCard({
  paraNo,
  roleLabel,
  cut,
  hint,
  onOpen,
  onReveal,
}: {
  paraNo: number
  roleLabel: string
  cut: ReadingRequiredCut
  hint: number
  onOpen: () => void
  onReveal: (level: number) => void
}) {
  return (
    <FeedbackCard tone="ask">
      <b>¶{paraNo}</b>（{roleLabel}）: 意味のまとまりの切れ目の見逃しがあります。
      この段落をもう一度見直して、もっと割れないか考えてください。
      <div className="mt-2 flex flex-wrap gap-1.5">
        <HintButton onClick={onOpen}>この段落を開く</HintButton>
        {hint < 2 && <HintButton onClick={() => onReveal(2)}>ヒント: 文の指定</HintButton>}
        {hint >= 2 && hint < 3 && <HintButton onClick={() => onReveal(3)}>ヒント: 手がかり語</HintButton>}
        {hint >= 3 && hint < 4 && <HintButton onClick={() => onReveal(4)}>答えを見る</HintButton>}
      </div>
      {hint >= 2 && (
        <p className="mt-2 text-sm">
          {cut.gap === 0
            ? `第${cut.sentence}文と第${cut.sentence + 1}文の間を見てください。`
            : `第${cut.sentence + 1}文の中を見てください。`}
        </p>
      )}
      {hint >= 3 && (
        <p className="mt-1 text-sm">
          手がかり語: <b className="text-nodo">{cut.cue || '（固有の合図語はありません）'}</b>
        </p>
      )}
      {hint >= 4 && (
        <p className="mt-1 text-sm">
          「{cut.tBefore}」と「{cut.tAfter}」の間で切ります。関係は {symWithLabel(cut.sym)} です。
        </p>
      )}
    </FeedbackCard>
  )
}

function RelationWrongCard({
  no,
  cue,
  pairs,
  firstSegOfKoto,
}: {
  no: number
  cue: string
  pairs: Array<[number | null, string]>
  firstSegOfKoto: Record<number, number>
}) {
  const [level, setLevel] = useState(0)
  return (
    <FeedbackCard tone="ask">
      <b>{circled(no)}</b> の置き場所と記号をもう一度考えてください。
      このまとまりは、何に対して・何をしていますか。
      <div className="mt-2 flex flex-wrap gap-1.5">
        {level < 1 && <HintButton onClick={() => setLevel(1)}>ヒント（手がかり語）</HintButton>}
        {level === 1 && <HintButton onClick={() => setLevel(2)}>答えを見る</HintButton>}
      </div>
      {level >= 1 && (
        <p className="mt-2 text-sm">
          手がかり語: <b className="text-nodo">{cue || '（固有の合図語はありません。意味の役割で考えてください）'}</b>
        </p>
      )}
      {level >= 2 && (
        <p className="mt-1 text-sm">
          {circled(no)} の付け方の正解:{' '}
          {pairs
            .map(([pk, ps]) =>
              pk == null
                ? `相手なし（段落の中心）として ${symWithLabel(ps)}`
                : `${firstSegOfKoto[pk] !== undefined ? circled(firstSegOfKoto[pk]) + ' ' : ''}に ${symWithLabel(ps)}`
            )
            .join(' ／ ')}
        </p>
      )}
    </FeedbackCard>
  )
}

function GlobalWrongCard({
  paraNo,
  macro,
  expected,
}: {
  paraNo: number
  macro: string
  expected: string
}) {
  const [level, setLevel] = useState(0)
  return (
    <FeedbackCard tone="ask">
      <b>¶{paraNo}</b> の記号をもう一度考えてください。前の段落に対してこの段落は何をしていますか。
      <div className="mt-2 flex flex-wrap gap-1.5">
        {level < 1 && <HintButton onClick={() => setLevel(1)}>ヒント（要旨の模範）</HintButton>}
        {level === 1 && <HintButton onClick={() => setLevel(2)}>答えを見る</HintButton>}
      </div>
      {level >= 1 && <p className="mt-2 text-sm">要旨の模範: {macro || '（模範なし）'}</p>}
      {level >= 2 && <p className="mt-1 text-sm">¶{paraNo} は {symWithLabel(expected)} で付きます。</p>}
    </FeedbackCard>
  )
}

function HintButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-ai"
    >
      {children}
    </button>
  )
}

function ModeOption({
  selected,
  title,
  description,
  onSelect,
}: {
  selected: boolean
  title: string
  description: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-3 text-left ${
        selected ? 'border-sora bg-sora-soft' : 'border-gray-200 bg-white'
      }`}
    >
      <span className="block text-sm font-bold text-ai">{title}</span>
      <span className="mt-0.5 block text-xs text-ink-2">{description}</span>
    </button>
  )
}

function SubTab({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-bold ${
        active ? 'bg-ai text-white' : 'border border-gray-300 bg-white text-ai'
      } disabled:opacity-40`}
    >
      {children}
    </button>
  )
}

function GlobalGists({
  paragraphs,
  gists,
  onChange,
  complete,
  onNext,
}: {
  paragraphs: ReadingParagraph[]
  gists: Record<string, string>
  onChange: (no: string, value: string) => void
  complete: boolean
  onNext: () => void
}) {
  const [showModel, setShowModel] = useState(false)
  return (
    <div className="space-y-3">
      <p className="rounded-2xl bg-sora-soft p-3 text-sm leading-relaxed text-ai">
        各段落の要旨（言いたいこと）を、<b>自分の言葉で1文</b>にしてください。
        「〜が増えたので、…への警戒が広がった」のように、因果や対比は<b>畳んで1文</b>にして構いません。
      </p>
      {paragraphs.map((p) => (
        <div key={p.no} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <p className="mb-1.5 text-sm font-extrabold text-ai">¶{p.no}</p>
          <input
            type="text"
            value={gists[String(p.no)] || ''}
            placeholder="この段落の要旨を1文で"
            onChange={(e) => onChange(String(p.no), e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base focus:border-sora focus:outline-none"
          />
          {showModel && (
            <p className="mt-2 rounded-xl bg-paper p-2.5 text-sm text-ink-2">
              <span className="font-bold text-ai">模範: </span>
              {p.macro || '（模範なし）'}
            </p>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setShowModel((v) => !v)}
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-ai"
      >
        {showModel ? '模範の要旨を隠す' : '模範の要旨と見比べる'}
      </button>
      <button
        type="button"
        disabled={!complete}
        onClick={onNext}
        className="w-full rounded-xl bg-nodo px-4 py-3 text-base font-bold text-white disabled:bg-gray-300"
      >
        ② 段落を組み立てる
      </button>
      {!complete && (
        <p className="text-center text-xs text-ink-3">
          まだ書いていない段落があります。全部書くと次に進めます。
        </p>
      )}
    </div>
  )
}

function SaveBadge({ status, onRetry }: { status: string; onRetry: () => void }) {
  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex-shrink-0 rounded-full bg-again-bg px-2.5 py-1 text-[11px] font-bold text-again"
      >
        保存できません・再試行
      </button>
    )
  }
  const label =
    status === 'saving'
      ? '保存中…'
      : status === 'saved'
        ? '保存しました'
        : status === 'local-only'
          ? 'この端末に保存'
          : '自動保存'
  return (
    <span className="flex-shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-ink-3">
      {label}
    </span>
  )
}
