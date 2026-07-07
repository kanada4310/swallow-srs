'use client'

import { useMemo, useRef, useState } from 'react'
import {
  parseKobunQuestion,
  parseKobunMeta,
  parseKobunBDisplay,
  buildOptionsA,
  buildOptionsB,
  grade,
  computeKobunScore,
  deriveKobunEase,
  UNKNOWN_ANSWER,
  UNKNOWN_LABEL,
  QUESTION_FIELD,
  type KobunQuestion,
  type KobunStepResult,
  type EaseValue,
} from '@/lib/kobun-tango'

interface KobunTangoCardProps {
  /** カードが変わったらリマウントされる前提（StudySession が key を付ける） */
  fieldValues: Record<string, string>
  /** 4段階の次回間隔プレビュー（1=Again..4=Easy） */
  intervalPreviews: Record<EaseValue, string>
  /** 解答完了後に1回だけ呼ぶ。ease は SRS 評価。 */
  onComplete: (ease: EaseValue, extra: { score: number; stepResults: KobunStepResult[] }) => void
}

const EASE_META: { value: EaseValue; label: string; cls: string }[] = [
  { value: 1, label: 'もう一度', cls: 'again' },
  { value: 2, label: '難しい', cls: 'hard' },
  { value: 3, label: '正解', cls: 'good' },
  { value: 4, label: '簡単', cls: 'easy' },
]

/** 例文中の見出し語に当たる活用形に傍線を引く（最初の一致のみ） */
function MarkedPassage({ text, form }: { text: string; form: string }) {
  const i = form ? text.indexOf(form) : -1
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <span className="kt-uline">{form}</span>
      {text.slice(i + form.length)}
    </>
  )
}

export function KobunTangoCard({ fieldValues, intervalPreviews, onComplete }: KobunTangoCardProps) {
  const question = useMemo<KobunQuestion | null>(
    () => parseKobunQuestion(fieldValues[QUESTION_FIELD]),
    [fieldValues]
  )
  const meta = useMemo(() => parseKobunMeta(fieldValues), [fieldValues])
  const bDisplay = useMemo(() => parseKobunBDisplay(fieldValues), [fieldValues])

  // 選択肢はマウント時に1回だけ生成（毎レビューでダミーが入れ替わる）
  const options = useMemo(() => {
    if (!question) return []
    return question.mode === 'A' ? buildOptionsA(question) : buildOptionsB(question)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startRef = useRef<number>(Date.now())
  const [selected, setSelected] = useState<string[]>([])
  const [answered, setAnswered] = useState(false)
  const [result, setResult] = useState<KobunStepResult | null>(null)
  const [override, setOverride] = useState<EaseValue | null>(null)
  const [submitted, setSubmitted] = useState(false)

  if (!question) {
    return (
      <div className="kt-root">
        <div className="kt-opts">この演習には問題がありません。</div>
        <style jsx>{styles}</style>
      </div>
    )
  }

  const multi = question.mode === 'A'

  const toggle = (val: string) => {
    if (answered) return
    if (val === UNKNOWN_ANSWER) {
      setSelected((s) => (s.includes(UNKNOWN_ANSWER) ? [] : [UNKNOWN_ANSWER]))
      return
    }
    if (!multi) {
      setSelected([val])
      return
    }
    setSelected((s) => {
      const next = s.filter((v) => v !== UNKNOWN_ANSWER)
      return next.includes(val) ? next.filter((v) => v !== val) : [...next, val]
    })
  }

  const handleSubmit = () => {
    if (answered || selected.length === 0) return
    const r = grade(question, selected)
    setResult(r)
    setAnswered(true)
  }

  const score = result ? computeKobunScore(result, Date.now() - startRef.current) : null
  const autoEase = score ? deriveKobunEase(score) : 3
  const effectiveEase: EaseValue = override ?? autoEase
  const autoMeta = EASE_META.find((e) => e.value === effectiveEase)!

  const handleConfirm = () => {
    if (submitted || !result || !score) return
    setSubmitted(true)
    onComplete(effectiveEase, { score: score.score, stepResults: [result] })
  }

  // 選択肢のクラス（採点後の色付け）
  const optClass = (val: string) => {
    const correct = question.mode === 'A' ? question.correct : [question.correct]
    let cls = 'kt-opt' + (multi ? '' : ' radio')
    if (!answered) {
      if (selected.includes(val)) cls += ' sel'
      return cls
    }
    const isCorrect = correct.includes(val)
    const isChosen = result?.chosen.includes(val)
    if (isChosen && isCorrect) cls += ' correct'
    else if (isChosen && !isCorrect) cls += ' wrong'
    else if (!isChosen && isCorrect) cls += ' missed'
    return cls
  }
  const optTag = (val: string) => {
    if (!answered) return null
    const correct = question.mode === 'A' ? question.correct : [question.correct]
    const isCorrect = correct.includes(val)
    const isChosen = result?.chosen.includes(val)
    // 「あなたの解答」かつ「正しい選択肢」の場合は両方のタグを出す（片方の正解だけ選んだ時に
    // 選んだ正解が誤答だと勘違いされないように）。
    const tags: React.ReactNode[] = []
    if (isChosen) {
      tags.push(
        <span key="you" className={'kt-tag ' + (isCorrect ? 'you-ok' : 'you')}>
          あなたの解答
        </span>
      )
    }
    if (isCorrect) {
      tags.push(
        <span key="right" className={'kt-tag ' + (isChosen ? 'right' : 'right-line')}>
          正しい選択肢
        </span>
      )
    }
    if (tags.length === 0) return null
    return <span className="kt-tags">{tags}</span>
  }

  const correctList = question.mode === 'A' ? question.correct : [question.correct]
  const dkClass =
    'kt-opt dontknow' +
    (multi ? '' : ' radio') +
    (answered && result?.dontKnow ? ' wrong' : selected.includes(UNKNOWN_ANSWER) ? ' sel' : '')

  return (
    <div className="kt-root">
      {/* 問い（固定表示） */}
      <div className="kt-stem">
        <span className="kt-pos">{meta.pos}</span>
        {question.mode === 'A' ? (
          <>
            {/* 漢字（読み仮名）は答えの推測につながるため出題中は隠す。採点後のフィードバックでのみ表示する。 */}
            <div className="kt-headword">{meta.headword}</div>
            <p className="kt-ask multi">
              該当する意味を<b>すべて</b>選んでください
            </p>
          </>
        ) : (
          <>
            <p className="kt-passage">
              <MarkedPassage text={bDisplay.passage} form={bDisplay.headwordForm} />
            </p>
            {bDisplay.source && <p className="kt-source">〔{bDisplay.source}〕</p>}
            <p className="kt-ask">傍線部の意味として適切なものを選んでください</p>
          </>
        )}
      </div>

      {/* 選択肢 */}
      <div className="kt-opts">
        {options.map((opt, idx) => (
          <button
            key={idx}
            className={optClass(opt)}
            onClick={() => toggle(opt)}
            disabled={answered}
          >
            <span className="kt-box" />
            <span className="kt-lab">{opt}</span>
            {optTag(opt)}
          </button>
        ))}
        <button className={dkClass} onClick={() => toggle(UNKNOWN_ANSWER)} disabled={answered}>
          <span className="kt-box" />
          <span className="kt-lab">{UNKNOWN_LABEL}</span>
          {answered && result?.dontKnow && <span className="kt-tag you">あなたの解答</span>}
        </button>
      </div>

      {/* フィードバック */}
      {answered && result && (
        <div className={'kt-feedback ' + (result.overallCorrect ? 'ok' : 'ng')}>
          <div className="kt-verdict-row">
            <span className="kt-verdict">{result.overallCorrect ? '正解' : '不正解'}</span>
            <span className="kt-word-no">
              {meta.no && <span className="kt-no-badge">No.{String(parseInt(meta.no, 10))}</span>}
              <span className="kt-word-name">
                {meta.headword}
                {meta.kanji && `（${meta.kanji}）`}
              </span>
            </span>
          </div>
          <div className="kt-gloss-label">正しい意味</div>
          <ul className="kt-gloss-list">
            {correctList.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
          {question.mode === 'B' && bDisplay.translation && (
            <div className="kt-trans">{bDisplay.translation}</div>
          )}
        </div>
      )}

      {/* アクション：採点前 */}
      {!answered && (
        <div className="kt-actions">
          <button className="kt-btn primary block" onClick={handleSubmit} disabled={selected.length === 0}>
            解答する
          </button>
        </div>
      )}

      {/* 採点後：SRS 評価（自動判定＋手直し） */}
      {answered && score && (
        <div className="kt-rate-wrap">
          <div className={`kt-verdict-srs ${autoMeta.cls}`}>
            <span className="kt-verdict-srs-label">スコアによる判定</span>
            <span className="kt-verdict-srs-value">
              {override !== null ? '手動：' : '自動：'}
              {autoMeta.label}
            </span>
            <span className="kt-verdict-srs-int">次回 {intervalPreviews[effectiveEase]}</span>
          </div>
          <div className="kt-rate-label">
            タップで変更できます{override !== null && '（手動で変更中）'}
          </div>
          <div className="kt-rate-grid">
            {EASE_META.map((e) => (
              <button
                key={e.value}
                className={`kt-rate ${e.cls} ${effectiveEase === e.value ? 'on' : ''}`}
                onClick={() => setOverride(e.value)}
                disabled={submitted}
              >
                <span className="kt-rate-text">{e.label}</span>
                <span className="kt-rate-int">{intervalPreviews[e.value]}</span>
              </button>
            ))}
          </div>
          {override !== null && (
            <button className="kt-manual-toggle" onClick={() => setOverride(null)} disabled={submitted}>
              自動判定に戻す
            </button>
          )}
          <button className="kt-btn primary block" onClick={handleConfirm} disabled={submitted}>
            次へ →
          </button>
        </div>
      )}

      <style jsx>{styles}</style>
    </div>
  )
}

/* ───────────────────────── スタイル（つばめ古文の世界観） ───────────────────────── */
const styles = `
  .kt-root { max-width: 680px; margin: 0 auto; color:#26303a; font-family:"Hiragino Mincho ProN","Yu Mincho",serif; line-height:1.7; }

  .kt-stem { background:#fffdf8; border:1px solid #d8cfba; border-bottom:none; border-radius:14px 14px 0 0; padding:18px 22px 14px; box-shadow:0 1px 2px rgba(38,48,58,.06),0 8px 24px rgba(38,48,58,.08); }
  .kt-pos { display:inline-block; font-family:system-ui,sans-serif; font-size:.72rem; color:#4a5560; border:1px solid #d8cfba; border-radius:99px; padding:2px 10px; margin-bottom:10px; letter-spacing:.05em; }
  .kt-headword { font-size:2.1rem; font-weight:600; letter-spacing:.05em; margin:.05em 0; color:#26303a; }
  .kt-kanji { font-size:1rem; color:#4a5560; margin-bottom:2px; }
  .kt-ask { font-size:.86rem; color:#4a5560; margin:10px 0 2px; font-family:system-ui,sans-serif; }
  .kt-ask.multi { color:#9c3848; }
  .kt-passage { font-size:1.18rem; line-height:1.95; letter-spacing:.02em; margin:4px 0; }
  .kt-uline { border-bottom:2.5px solid #9c3848; padding:0 1px 1px; font-weight:600; color:#26303a; }
  .kt-source { font-size:.8rem; color:#a9852f; font-family:system-ui,sans-serif; text-align:right; margin-top:4px; letter-spacing:.04em; }

  .kt-opts { background:#fffdf8; border:1px solid #d8cfba; border-top:1px dashed #e7dfcd; border-radius:0 0 14px 14px; padding:16px 22px 22px; box-shadow:0 1px 2px rgba(38,48,58,.06),0 8px 24px rgba(38,48,58,.08); display:flex; flex-direction:column; gap:10px; }

  .kt-opt { text-align:left; width:100%; cursor:pointer; font-family:inherit; font-size:1.02rem; background:#fff; border:1.5px solid #d8cfba; border-radius:11px; padding:13px 16px; transition:.13s; display:flex; align-items:center; gap:12px; color:#26303a; }
  .kt-opt:hover:not(:disabled) { border-color:#3a5a73; background:#fffdf6; }
  .kt-box { flex-shrink:0; width:22px; height:22px; border:1.5px solid #d8cfba; border-radius:6px; display:grid; place-items:center; font-size:.85rem; color:#fff; background:#fff; transition:.13s; }
  .kt-opt.radio .kt-box { border-radius:99px; }
  .kt-opt.sel { border-color:#2b4257; background:#eef2f5; }
  .kt-opt.sel .kt-box { background:#2b4257; border-color:#2b4257; }
  .kt-opt.dontknow { font-family:system-ui,sans-serif; font-size:.92rem; color:#4a5560; border-style:dashed; }
  .kt-opt.correct { border-color:#3f7d57; background:#e7f0e8; }
  .kt-opt.correct .kt-box { background:#3f7d57; border-color:#3f7d57; }
  .kt-opt.wrong { border-color:#a8434f; background:#f4e4e4; }
  .kt-opt.wrong .kt-box { background:#a8434f; border-color:#a8434f; }
  .kt-opt.missed { border-color:#3f7d57; border-style:dashed; background:#fff; }
  .kt-opt.missed .kt-box { border-color:#3f7d57; }
  .kt-opt:disabled { cursor:default; }
  .kt-lab { flex:1; }
  .kt-tags { flex-shrink:0; display:flex; align-items:center; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
  .kt-tag { flex-shrink:0; font-family:system-ui,sans-serif; font-size:.68rem; font-weight:600; letter-spacing:.04em; padding:2px 8px; border-radius:99px; white-space:nowrap; }
  .kt-tag.you { background:#a8434f; color:#fff; }
  .kt-tag.you-ok { background:#eef2f5; color:#2b4257; border:1px solid #b9c6d1; }
  .kt-tag.right { background:#3f7d57; color:#fff; }
  .kt-tag.right-line { background:transparent; color:#3f7d57; border:1px solid #3f7d57; }

  .kt-feedback { margin-top:18px; border-radius:11px; padding:14px 16px; font-size:.92rem; border:1px solid #e7dfcd; background:#efe8d8; }
  .kt-verdict-row { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:6px; flex-wrap:wrap; }
  .kt-verdict { font-weight:600; font-family:system-ui,sans-serif; letter-spacing:.04em; }
  .kt-feedback.ok .kt-verdict { color:#3f7d57; }
  .kt-feedback.ng .kt-verdict { color:#a8434f; }
  .kt-word-no { display:inline-flex; align-items:center; gap:8px; font-family:system-ui,sans-serif; }
  .kt-no-badge { font-family:system-ui,sans-serif; font-size:1rem; font-weight:700; color:#fff; background:#9c3848; border-radius:8px; padding:3px 12px; white-space:nowrap; box-shadow:0 1px 3px rgba(156,56,72,.25); }
  .kt-word-name { font-size:.95rem; color:#26303a; font-weight:600; }
  .kt-gloss-label { font-size:.82rem; color:#4a5560; font-family:system-ui,sans-serif; margin-top:4px; }
  .kt-gloss-list { list-style:none; margin:6px 0 0; padding:0; }
  .kt-gloss-list li { position:relative; padding-left:1.1em; margin:3px 0; color:#26303a; font-size:.92rem; line-height:1.55; }
  .kt-gloss-list li::before { content:"・"; position:absolute; left:0; color:#3f7d57; font-weight:700; }
  .kt-trans { margin-top:8px; font-size:.85rem; color:#4a5560; line-height:1.65; }

  .kt-actions { margin-top:20px; }
  .kt-btn { font-family:system-ui,sans-serif; font-size:.95rem; font-weight:600; letter-spacing:.04em; border:none; border-radius:11px; padding:13px 22px; cursor:pointer; transition:.15s; }
  .kt-btn.block { width:100%; }
  .kt-btn.primary { background:#2b4257; color:#fff; }
  .kt-btn.primary:hover:not(:disabled) { background:#3a5a73; }
  .kt-btn.primary:disabled { background:#d8cfba; color:#4a5560; cursor:not-allowed; }

  .kt-rate-wrap { margin-top:20px; }
  .kt-verdict-srs { display:flex; align-items:center; justify-content:center; gap:12px; flex-wrap:wrap; padding:14px 16px; border-radius:8px; margin-bottom:12px; border:2px solid; }
  .kt-verdict-srs.again { background:#fef2f2; border-color:#ef4444; color:#b91c1c; }
  .kt-verdict-srs.hard { background:#fff7ed; border-color:#f97316; color:#c2410c; }
  .kt-verdict-srs.good { background:#f0fdf4; border-color:#22c55e; color:#15803d; }
  .kt-verdict-srs.easy { background:#eff6ff; border-color:#3b82f6; color:#1d4ed8; }
  .kt-verdict-srs-label { font-size:12px; opacity:.8; font-family:system-ui,sans-serif; }
  .kt-verdict-srs-value { font-size:20px; font-weight:700; letter-spacing:.05em; }
  .kt-verdict-srs-int { font-size:12px; opacity:.8; font-family:system-ui,sans-serif; }
  .kt-rate-label { font-size:12px; color:#4a5560; margin-bottom:8px; letter-spacing:.05em; font-family:system-ui,sans-serif; }
  .kt-rate-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:12px; }
  .kt-rate { display:flex; flex-direction:column; align-items:center; gap:2px; padding:10px 4px; border-radius:6px; border:2px solid transparent; background:#efe8d8; color:#4a5560; cursor:pointer; font-family:system-ui,sans-serif; transition:.12s; }
  .kt-rate-text { font-size:14px; font-weight:600; }
  .kt-rate-int { font-size:11px; opacity:.7; }
  .kt-rate.again.on { background:#ef4444; color:#fff; border-color:#b91c1c; }
  .kt-rate.hard.on { background:#f97316; color:#fff; border-color:#c2410c; }
  .kt-rate.good.on { background:#22c55e; color:#fff; border-color:#15803d; }
  .kt-rate.easy.on { background:#3b82f6; color:#fff; border-color:#1d4ed8; }
  .kt-rate:disabled { cursor:default; opacity:.85; }
  .kt-manual-toggle { display:block; margin:4px auto 12px; background:none; border:none; color:#7a7264; font-family:system-ui,sans-serif; font-size:12px; text-decoration:underline; cursor:pointer; }
  .kt-manual-toggle:disabled { opacity:.5; cursor:default; }

  @media (max-width:480px) {
    .kt-headword { font-size:2rem; }
    .kt-passage { font-size:1.12rem; }
    .kt-stem, .kt-opts { padding-left:16px; padding-right:16px; }
  }
  @media (prefers-reduced-motion:reduce) { * { transition:none!important; } }
`
