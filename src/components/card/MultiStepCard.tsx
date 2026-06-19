'use client'

import { useState, useMemo, useRef } from 'react'
import {
  parseQuestions,
  parseHighlights,
  gradeSelect,
  gradeText,
  shuffle,
  computeScore,
  deriveEase,
  UNKNOWN_ANSWER,
  UNKNOWN_LABEL,
  QUESTIONS_FIELD,
  HIGHLIGHTS_FIELD,
  type MultiStepQuestion,
  type Highlight,
  type StepResult,
  type ExampleScore,
  type EaseValue,
} from '@/lib/multi-step'

interface MultiStepCardProps {
  /** カードが変わったらリマウントされる前提（StudySession が key を付ける） */
  fieldValues: Record<string, string>
  /** 4段階の次回間隔プレビュー（1=Again..4=Easy） */
  intervalPreviews: Record<EaseValue, string>
  /** 全設問完了後に1回だけ呼ぶ。ease は例文単位の SRS 評価。 */
  onComplete: (ease: EaseValue, extra: { score: number; stepResults: StepResult[] }) => void
}

const CIRCLED = (i: number) => String.fromCharCode(0x2460 + i) // ①②③…

export function MultiStepCard({ fieldValues, intervalPreviews, onComplete }: MultiStepCardProps) {
  const questions = useMemo(() => parseQuestions(fieldValues[QUESTIONS_FIELD]), [fieldValues])
  const highlights = useMemo(() => parseHighlights(fieldValues[HIGHLIGHTS_FIELD]), [fieldValues])
  const exampleText = fieldValues['例文'] || ''
  const targetWord = fieldValues['識別対象'] || ''
  const source = fieldValues['出典'] || ''
  const modernTranslation = fieldValues['現代語訳'] || ''

  const [currentIdx, setCurrentIdx] = useState(0)
  const [results, setResults] = useState<StepResult[]>([])
  const [phase, setPhase] = useState<'answering' | 'summary'>('answering')
  const startRef = useRef<number>(Date.now())

  const total = questions.length
  const current = questions[currentIdx]
  const activeHighlightId = phase === 'summary' ? null : current?.highlightId ?? null

  const handleQuestionComplete = (result: StepResult) => {
    const newResults = [...results, result]
    setResults(newResults)
    if (currentIdx + 1 >= total) {
      setPhase('summary')
    } else {
      setCurrentIdx(currentIdx + 1)
    }
  }

  // ステップドットの状態
  const stepStatuses = questions.map((q, i) => {
    if (i < results.length) return results[i].overallCorrect ? 'done' : 'done mistake'
    if (i === currentIdx && phase === 'answering') return 'current'
    return ''
  })

  if (total === 0) {
    return (
      <div className="ms-root">
        <div className="ms-question">この演習には設問がありません。</div>
        <style jsx>{styles}</style>
      </div>
    )
  }

  return (
    <div className="ms-root">
      {/* ヘッダー */}
      <div className="ms-header">
        <div className="ms-title">識別演習</div>
        <div className="ms-meta">
          {targetWord && (
            <div className="ms-word">
              識別対象<span className="ms-word-chip">{targetWord}</span>
            </div>
          )}
          {phase === 'answering' && (
            <div className="ms-step">
              {currentIdx + 1} / {total} 問目
            </div>
          )}
        </div>
        <div className="ms-dots">
          {questions.map((q, i) => (
            <div
              key={i}
              className={`ms-dot ${stepStatuses[i]} ${q.format === 'text' ? 'final' : ''}`}
              title={q.questionType || ''}
            />
          ))}
        </div>
      </div>

      {/* 原文（傍線表示） */}
      <div className="ms-example-wrap">
        <div className="ms-example">
          <HighlightedText text={exampleText} highlights={highlights} activeId={activeHighlightId} />
        </div>
        {source && <div className="ms-source">{source}</div>}
      </div>

      {/* 設問 or サマリー */}
      {phase === 'answering' ? (
        <QuestionBlock
          key={current.id}
          question={current}
          questionIndex={currentIdx}
          totalQuestions={total}
          onComplete={handleQuestionComplete}
        />
      ) : (
        <SummaryBlock
          results={results}
          elapsedMs={Date.now() - startRef.current}
          modernTranslation={modernTranslation}
          intervalPreviews={intervalPreviews}
          onComplete={onComplete}
        />
      )}

      <style jsx>{styles}</style>
    </div>
  )
}

/* ───────────────────────── 原文ハイライト ───────────────────────── */
function HighlightedText({
  text,
  highlights,
  activeId,
}: {
  text: string
  highlights: Highlight[]
  activeId: string | null
}) {
  if (!activeId) return <>{text}</>
  const target = highlights.find((h) => h.id === activeId)
  if (!target || target.start < 0 || target.end > text.length || target.start >= target.end) {
    return <>{text}</>
  }
  return (
    <>
      {text.slice(0, target.start)}
      <span className="ms-hl">{text.slice(target.start, target.end)}</span>
      {text.slice(target.end)}
    </>
  )
}

/* ───────────────────────── 1設問の出題 ───────────────────────── */
function QuestionBlock({
  question,
  questionIndex,
  totalQuestions,
  onComplete,
}: {
  question: MultiStepQuestion
  questionIndex: number
  totalQuestions: number
  onComplete: (r: StepResult) => void
}) {
  const isSelect = question.format === 'select'
  const hasFollowUp = !!question.followUp

  const [mainSelected, setMainSelected] = useState<string | null>(null)
  const [followSelected, setFollowSelected] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [result, setResult] = useState<StepResult | null>(null)

  // 記述式
  const [textAnswer, setTextAnswer] = useState('')
  const [textRevealed, setTextRevealed] = useState(false)

  // 選択肢は設問内で固定（q.id 単位で1回シャッフル）。「わからない」は末尾固定。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shuffledMain = useMemo(() => shuffle(question.choices), [question.id])
  const shuffledFollow = useMemo(
    () => (question.followUp ? shuffle(question.followUp.choices) : []),
    [question.id] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const canReveal = isSelect && !!mainSelected && (!hasFollowUp || !!followSelected)

  const handleReveal = () => {
    const r = gradeSelect(question, mainSelected, hasFollowUp ? followSelected : null)
    setResult(r)
    setRevealed(true)
  }

  const handleTextJudge = (selfCorrect: boolean) => {
    onComplete(gradeText(question, selfCorrect))
  }

  const choiceClass = (choice: string, selected: string | null, correct: string) => {
    let cls = 'ms-choice'
    if (revealed) {
      if (choice === correct) cls += ' correct'
      else if (choice === selected) cls += ' incorrect'
    } else if (choice === selected) {
      cls += ' selected'
    }
    return cls
  }

  return (
    <div className="ms-qarea">
      <div className="ms-qhead">
        <div className="ms-qindex">
          問 {questionIndex + 1} / {totalQuestions}
        </div>
        <div className="ms-badges">
          {question.questionType && <span className="ms-badge">{question.questionType}</span>}
          {hasFollowUp && <span className="ms-badge follow">+根拠</span>}
        </div>
      </div>

      <div className="ms-prompt">{question.prompt}</div>

      {/* 選択式 */}
      {isSelect && (
        <div className="ms-choices">
          {shuffledMain.map((choice, idx) => (
            <button
              key={idx}
              className={choiceClass(choice, mainSelected, question.answer)}
              onClick={() => !revealed && setMainSelected(choice)}
              disabled={revealed}
            >
              <span className="ms-marker">{CIRCLED(idx)}</span>
              <span>{choice}</span>
            </button>
          ))}
          <button
            className={
              'ms-choice unknown' +
              (revealed && mainSelected === UNKNOWN_ANSWER
                ? ' incorrect'
                : mainSelected === UNKNOWN_ANSWER
                  ? ' selected'
                  : '')
            }
            onClick={() => !revealed && setMainSelected(UNKNOWN_ANSWER)}
            disabled={revealed}
          >
            <span className="ms-marker">?</span>
            <span>{UNKNOWN_LABEL}</span>
          </button>
        </div>
      )}

      {/* 根拠問題（follow-up） */}
      {isSelect && hasFollowUp && question.followUp && (
        <>
          <div className="ms-prompt follow">
            <div className="ms-prompt-label">根拠を答えよ</div>
            {question.followUp.prompt}
          </div>
          <div className="ms-choices">
            {shuffledFollow.map((choice, idx) => (
              <button
                key={idx}
                className={choiceClass(choice, followSelected, question.followUp!.answer)}
                onClick={() => !revealed && setFollowSelected(choice)}
                disabled={revealed}
              >
                <span className="ms-marker">{CIRCLED(idx)}</span>
                <span>{choice}</span>
              </button>
            ))}
            <button
              className={
                'ms-choice unknown' +
                (revealed && followSelected === UNKNOWN_ANSWER
                  ? ' incorrect'
                  : followSelected === UNKNOWN_ANSWER
                    ? ' selected'
                    : '')
              }
              onClick={() => !revealed && setFollowSelected(UNKNOWN_ANSWER)}
              disabled={revealed}
            >
              <span className="ms-marker">?</span>
              <span>{UNKNOWN_LABEL}</span>
            </button>
          </div>
        </>
      )}

      {/* 記述式 */}
      {!isSelect && !textRevealed && (
        <>
          <textarea
            className="ms-textinput"
            placeholder="ここに解答を入力…"
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
          />
          <button
            className="ms-btn primary block"
            onClick={() => setTextRevealed(true)}
            disabled={!textAnswer.trim()}
          >
            模範解答を見る
          </button>
        </>
      )}

      {!isSelect && textRevealed && (
        <>
          <div className="ms-selfnote">あなたの解答と模範解答を見比べて、自己採点してください。</div>
          <div className="ms-model user">
            <div className="ms-model-label">あなたの解答</div>
            <div className="ms-model-text">{textAnswer}</div>
          </div>
          <div className="ms-model">
            <div className="ms-model-label">模範解答</div>
            <div className="ms-model-text">{question.answer}</div>
          </div>
          {question.explanation && (
            <div className="ms-explain">
              <div className="ms-explain-label">解説</div>
              <div className="ms-explain-text">{question.explanation}</div>
            </div>
          )}
          <div className="ms-actions">
            <button className="ms-btn gold" onClick={() => handleTextJudge(false)}>
              △ もう一度
            </button>
            <button className="ms-btn moss" onClick={() => handleTextJudge(true)}>
              ◯ 正解だった
            </button>
          </div>
        </>
      )}

      {/* 採点後（選択式） */}
      {isSelect && revealed && result && (
        <>
          <div
            className={
              'ms-result ' +
              (result.overallCorrect
                ? 'all-correct'
                : hasFollowUp && (result.mainCorrect || result.followCorrect)
                  ? 'partial'
                  : 'all-wrong')
            }
          >
            {hasFollowUp
              ? result.overallCorrect
                ? '完全正解'
                : result.mainCorrect
                  ? '判別 ◯ / 根拠 ✕'
                  : result.followCorrect
                    ? '判別 ✕ / 根拠 ◯'
                    : '要復習'
              : result.mainCorrect
                ? '正解'
                : '要復習'}
          </div>
          {question.explanation && (
            <div className="ms-explain">
              <div className="ms-explain-label">判別の解説</div>
              <div className="ms-explain-text">{question.explanation}</div>
              {question.referencePage != null && (
                <div className="ms-explain-ref">（教材 p.{question.referencePage} 参照）</div>
              )}
            </div>
          )}
          {hasFollowUp && question.followUp?.explanation && (
            <div className="ms-explain">
              <div className="ms-explain-label">根拠の解説</div>
              <div className="ms-explain-text">{question.followUp.explanation}</div>
            </div>
          )}
          <div className="ms-actions">
            <button className="ms-btn primary" onClick={() => onComplete(result)}>
              {questionIndex + 1 >= totalQuestions ? '結果を見る →' : '次の問題へ →'}
            </button>
          </div>
        </>
      )}

      {/* 採点ボタン（選択式・回答前） */}
      {isSelect && !revealed && (
        <div className="ms-actions">
          <button className="ms-btn primary" onClick={handleReveal} disabled={!canReveal}>
            {hasFollowUp ? '判別・根拠をまとめて採点' : '回答する'}
          </button>
        </div>
      )}
      <style jsx>{styles}</style>
    </div>
  )
}

/* ───────────────────────── 完了サマリー（スコア＋SRS評価） ───────────────────────── */
const EASE_META: { value: EaseValue; label: string; cls: string }[] = [
  { value: 1, label: 'もう一度', cls: 'again' },
  { value: 2, label: '難しい', cls: 'hard' },
  { value: 3, label: '正解', cls: 'good' },
  { value: 4, label: '簡単', cls: 'easy' },
]

function SummaryBlock({
  results,
  elapsedMs,
  modernTranslation,
  intervalPreviews,
  onComplete,
}: {
  results: StepResult[]
  elapsedMs: number
  modernTranslation: string
  intervalPreviews: Record<EaseValue, string>
  onComplete: (ease: EaseValue, extra: { score: number; stepResults: StepResult[] }) => void
}) {
  const score: ExampleScore = useMemo(() => computeScore(results, elapsedMs), [results, elapsedMs])
  // スコア（正誤＋解答時間）から SRS 評価を自動判定。既定はこれ。生徒はタップで手直しできる。
  const autoEase = useMemo(() => deriveEase(score), [score])
  const [override, setOverride] = useState<EaseValue | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const effectiveEase: EaseValue = override ?? autoEase
  const autoMeta = EASE_META.find((e) => e.value === effectiveEase)!

  const seconds = Math.round(score.elapsedMs / 1000)
  const timeLabel = seconds >= 60 ? `${Math.floor(seconds / 60)}分${seconds % 60}秒` : `${seconds}秒`

  const handleConfirm = () => {
    if (submitted) return
    setSubmitted(true)
    onComplete(effectiveEase, { score: score.score, stepResults: results })
  }

  return (
    <div className="ms-summary">
      <div className="ms-summary-title">{score.accuracyPct === 100 ? '◇ 完答 ◇' : '◇ 修了 ◇'}</div>

      {/* スコアパネル */}
      <div className="ms-score-grid">
        <div className="ms-score-cell">
          <div className="ms-score-value score">{score.score}</div>
          <div className="ms-score-label">スコア</div>
        </div>
        <div className="ms-score-cell">
          <div className="ms-score-value">
            {score.correct}/{score.total}
          </div>
          <div className="ms-score-label">正解（正答率 {score.accuracyPct}%）</div>
        </div>
        <div className="ms-score-cell">
          <div className="ms-score-value">{timeLabel}</div>
          <div className="ms-score-label">解答時間</div>
        </div>
      </div>

      {modernTranslation && (
        <div className="ms-trans">
          <div className="ms-trans-label">現代語訳（確認用）</div>
          <div className="ms-trans-text">{modernTranslation}</div>
        </div>
      )}

      {/* スコアからの自動判定（既定）＋ タップで手直し */}
      <div className={`ms-verdict ${autoMeta.cls}`}>
        <span className="ms-verdict-label">スコアによる判定</span>
        <span className="ms-verdict-value">
          {override !== null ? '手動：' : '自動：'}
          {autoMeta.label}
        </span>
        <span className="ms-verdict-int">次回 {intervalPreviews[effectiveEase]}</span>
      </div>

      <div className="ms-rate-label">タップで変更できます{override !== null && '（手動で変更中）'}</div>
      <div className="ms-rate-grid">
        {EASE_META.map((e) => (
          <button
            key={e.value}
            className={`ms-rate ${e.cls} ${effectiveEase === e.value ? 'on' : ''}`}
            onClick={() => setOverride(e.value)}
            disabled={submitted}
          >
            <span className="ms-rate-text">{e.label}</span>
            <span className="ms-rate-int">{intervalPreviews[e.value]}</span>
          </button>
        ))}
      </div>

      {override !== null && (
        <button className="ms-manual-toggle" onClick={() => setOverride(null)} disabled={submitted}>
          自動判定に戻す
        </button>
      )}

      <button className="ms-btn primary block" onClick={handleConfirm} disabled={submitted}>
        次へ →
      </button>
      <style jsx>{styles}</style>
    </div>
  )
}

/* ───────────────────────── スタイル（古文の世界観） ───────────────────────── */
const styles = `
  .ms-root { max-width: 720px; margin: 0 auto; color: #2a2520; font-family: 'Shippori Mincho','Noto Serif JP',serif; }
  .ms-header { background: linear-gradient(135deg,#f7ede0 0%,#efe2cc 100%); border:1px solid #d9ccb3; border-bottom:none; border-radius:6px 6px 0 0; padding:16px 22px; }
  .ms-title { font-size:12px; color:#4a4238; letter-spacing:.2em; margin-bottom:6px; }
  .ms-meta { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
  .ms-word { font-size:14px; }
  .ms-word-chip { background:#f7e8e8; color:#8b2e2e; padding:2px 10px; border-radius:2px; font-weight:700; font-size:17px; margin-left:8px; }
  .ms-step { font-size:12px; color:#4a4238; letter-spacing:.1em; }
  .ms-dots { display:flex; gap:4px; margin-top:12px; justify-content:center; }
  .ms-dot { width:10px; height:10px; border-radius:50%; background:#d9ccb3; transition:all .2s; }
  .ms-dot.done { background:#5a6b3e; }
  .ms-dot.done.mistake { background:#a67c3f; }
  .ms-dot.current { background:#8b2e2e; transform:scale(1.3); }
  .ms-dot.final { border-radius:2px; transform:rotate(45deg); width:11px; height:11px; }
  .ms-dot.final.current { transform:rotate(45deg) scale(1.3); }

  .ms-example-wrap { background:#faf6ed; border:1px solid #d9ccb3; border-top:none; padding:20px 22px; }
  .ms-example { font-size:21px; line-height:2.2; text-align:center; padding:16px 12px; background:linear-gradient(180deg,#fdfbf5 0%,#f8f2e4 100%); border:1px solid #d9ccb3; border-radius:4px; letter-spacing:.05em; }
  .ms-hl { background:linear-gradient(transparent 55%,#e8c4c4 55%,#e8c4c4 85%,transparent 85%); padding:0 3px; font-weight:600; color:#8b2e2e; }
  .ms-source { text-align:right; font-size:13px; color:#4a4238; margin-top:8px; letter-spacing:.1em; }
  .ms-source::before { content:"― "; }

  .ms-qarea, .ms-summary { background:#faf6ed; border:1px solid #d9ccb3; border-top:none; border-radius:0 0 6px 6px; padding:22px; }
  .ms-qhead { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; padding-bottom:10px; border-bottom:1px dashed #d9ccb3; flex-wrap:wrap; gap:8px; }
  .ms-qindex { font-size:12px; color:#4a4238; letter-spacing:.15em; }
  .ms-badges { display:flex; gap:6px; }
  .ms-badge { font-size:11px; padding:3px 10px; border:1px solid #c9b99a; border-radius:2px; color:#4a4238; background:#ede4d0; }
  .ms-badge.follow { background:#a67c3f; color:#fff; border-color:#a67c3f; }

  .ms-prompt { font-size:16px; margin-bottom:18px; padding:12px 16px; background:#f5f1e8; border-left:3px solid #a67c3f; border-radius:0 3px 3px 0; line-height:1.7; }
  .ms-prompt.follow { border-left-color:#8b2e2e; background:#f7e8e8; margin-top:8px; }
  .ms-prompt-label { font-size:11px; color:#8b2e2e; letter-spacing:.2em; margin-bottom:6px; font-weight:700; }

  .ms-choices { display:flex; flex-direction:column; gap:10px; margin-bottom:18px; }
  .ms-choice { font-family:inherit; font-size:16px; padding:13px 16px; background:#fff; border:1.5px solid #d9ccb3; border-radius:3px; cursor:pointer; text-align:left; transition:all .15s; color:#2a2520; display:flex; align-items:center; gap:12px; }
  .ms-choice:hover:not(:disabled) { border-color:#8b2e2e; background:#fffcf6; }
  .ms-marker { width:26px; height:26px; border-radius:50%; border:1.5px solid #c9b99a; display:flex; align-items:center; justify-content:center; font-size:13px; color:#4a4238; flex-shrink:0; font-weight:600; }
  .ms-choice.selected { border-color:#8b2e2e; background:#f7e8e8; }
  .ms-choice.correct { border-color:#5a6b3e; background:#e4e9d8; }
  .ms-choice.correct .ms-marker { background:#5a6b3e; color:#fff; border-color:#5a6b3e; }
  .ms-choice.incorrect { border-color:#8b2e2e; background:#f7e8e8; }
  .ms-choice.incorrect .ms-marker { background:#8b2e2e; color:#fff; border-color:#8b2e2e; }
  .ms-choice:disabled { cursor:default; }
  .ms-choice.unknown { background:transparent; border-style:dashed; color:#4a4238; font-size:14px; padding:9px 14px; }
  .ms-choice.unknown.selected { border-style:solid; border-color:#a67c3f; background:#fdf2e0; color:#2a2520; }
  .ms-choice.unknown.selected .ms-marker { background:#a67c3f; color:#fff; border-color:#a67c3f; }
  .ms-choice.unknown.incorrect { border-style:solid; border-color:#a67c3f; background:#fdf2e0; color:#4a4238; }
  .ms-choice.unknown.incorrect .ms-marker { background:#a67c3f; color:#fff; border-color:#a67c3f; }

  .ms-textinput { font-family:inherit; font-size:16px; width:100%; padding:13px 15px; border:1.5px solid #d9ccb3; border-radius:3px; background:#fff; color:#2a2520; resize:vertical; min-height:88px; line-height:1.8; margin-bottom:14px; }
  .ms-textinput:focus { outline:none; border-color:#8b2e2e; background:#fffcf6; }
  .ms-selfnote { font-size:13px; color:#4a4238; text-align:center; padding:12px; background:#f5f1e8; border-radius:3px; margin-bottom:12px; }
  .ms-model { background:#e4e9d8; border:1px solid #5a6b3e; border-radius:3px; padding:14px 16px; margin-bottom:12px; }
  .ms-model.user { background:#fff; border-color:#c9b99a; }
  .ms-model-label { font-size:12px; color:#5a6b3e; font-weight:700; letter-spacing:.15em; margin-bottom:6px; }
  .ms-model.user .ms-model-label { color:#4a4238; }
  .ms-model-text { font-size:16px; line-height:1.8; }

  .ms-explain { background:linear-gradient(180deg,#fefbf3 0%,#fbf5e5 100%); border:1px solid #d9ccb3; border-radius:3px; padding:16px 18px; margin-bottom:16px; }
  .ms-explain-label { font-size:12px; color:#a67c3f; font-weight:700; letter-spacing:.2em; margin-bottom:8px; }
  .ms-explain-text { font-size:15px; line-height:1.8; }
  .ms-explain-ref { font-size:12px; color:#4a4238; margin-top:8px; }

  .ms-result { text-align:center; padding:13px 16px; border-radius:3px; margin-bottom:14px; font-weight:700; font-size:16px; letter-spacing:.2em; }
  .ms-result.all-correct { background:#e4e9d8; color:#5a6b3e; border:1px solid #5a6b3e; }
  .ms-result.partial { background:#fdf2e0; color:#a67c3f; border:1px solid #a67c3f; }
  .ms-result.all-wrong { background:#f7e8e8; color:#8b2e2e; border:1px solid #8b2e2e; }

  .ms-actions { display:flex; gap:10px; justify-content:flex-end; }
  .ms-btn { font-family:inherit; font-size:15px; padding:12px 26px; border:none; border-radius:3px; cursor:pointer; transition:all .15s; letter-spacing:.1em; font-weight:600; }
  .ms-btn.block { width:100%; }
  .ms-btn.primary { background:#8b2e2e; color:#fff; }
  .ms-btn.primary:hover:not(:disabled) { background:#6f1f1f; }
  .ms-btn.primary:disabled { background:#c9b99a; cursor:not-allowed; }
  .ms-btn.moss { background:#5a6b3e; color:#fff; }
  .ms-btn.gold { background:#a67c3f; color:#fff; }

  .ms-summary { text-align:center; }
  .ms-summary-title { font-size:19px; color:#8b2e2e; margin-bottom:14px; font-weight:700; letter-spacing:.15em; }
  .ms-score-grid { display:flex; gap:10px; margin-bottom:18px; }
  .ms-score-cell { flex:1; background:#fff; border:1px solid #d9ccb3; border-radius:4px; padding:12px 6px; }
  .ms-score-value { font-size:24px; font-weight:700; line-height:1.1; }
  .ms-score-value.score { color:#8b2e2e; }
  .ms-score-label { font-size:11px; color:#4a4238; margin-top:4px; letter-spacing:.05em; }
  .ms-trans { background:#fff; border:1px solid #d9ccb3; border-radius:3px; padding:16px; margin-bottom:18px; text-align:left; }
  .ms-trans-label { font-size:11px; color:#4a4238; letter-spacing:.2em; margin-bottom:6px; }
  .ms-trans-text { font-size:16px; line-height:1.9; }

  .ms-rate-label { font-size:12px; color:#4a4238; margin-bottom:8px; letter-spacing:.05em; }
  .ms-rate-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:14px; }
  .ms-rate { display:flex; flex-direction:column; align-items:center; gap:2px; padding:10px 4px; border-radius:6px; border:2px solid transparent; background:#ede4d0; color:#4a4238; cursor:pointer; font-family:inherit; transition:all .12s; }
  .ms-rate-text { font-size:14px; font-weight:600; }
  .ms-rate-int { font-size:11px; opacity:.7; }
  .ms-rate.again.on { background:#ef4444; color:#fff; border-color:#b91c1c; }
  .ms-rate.hard.on { background:#f97316; color:#fff; border-color:#c2410c; }
  .ms-rate.good.on { background:#22c55e; color:#fff; border-color:#15803d; }
  .ms-rate.easy.on { background:#3b82f6; color:#fff; border-color:#1d4ed8; }
  .ms-rate:disabled { cursor:default; opacity:.85; }

  .ms-verdict { display:flex; align-items:center; justify-content:center; gap:12px; flex-wrap:wrap; padding:14px 16px; border-radius:8px; margin-bottom:14px; border:2px solid; }
  .ms-verdict.again { background:#fef2f2; border-color:#ef4444; color:#b91c1c; }
  .ms-verdict.hard { background:#fff7ed; border-color:#f97316; color:#c2410c; }
  .ms-verdict.good { background:#f0fdf4; border-color:#22c55e; color:#15803d; }
  .ms-verdict.easy { background:#eff6ff; border-color:#3b82f6; color:#1d4ed8; }
  .ms-verdict-label { font-size:12px; opacity:.8; }
  .ms-verdict-value { font-size:20px; font-weight:700; letter-spacing:.05em; }
  .ms-verdict-int { font-size:12px; opacity:.8; }
  .ms-manual-toggle { display:block; margin:4px auto 12px; background:none; border:none; color:#7a7264; font-family:inherit; font-size:12px; text-decoration:underline; cursor:pointer; }
  .ms-manual-toggle:disabled { opacity:.5; cursor:default; }

  @media (max-width: 500px) {
    .ms-example { font-size:18px; }
    .ms-prompt { font-size:15px; }
    .ms-choice { font-size:15px; padding:11px 13px; }
    .ms-qarea, .ms-header, .ms-example-wrap, .ms-summary { padding-left:16px; padding-right:16px; }
    .ms-score-value { font-size:20px; }
  }
`
