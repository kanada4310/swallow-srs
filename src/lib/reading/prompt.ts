/**
 * AI講評プロンプトの書き出し（貼り付け方式のまま）。
 *
 * ここで作るのは「文章」だけで、外部のサービスへは一切送らない。
 * 生徒が自分でコピーして、自分のチャットに貼る。追加費用は発生しない。
 * （アプリの中で講評を回す第2弾は 2026-08-20 時点で不承認。呼び出し口も作らない）
 */

import { circled, gistText, studentSegments } from './segments'
import type { ParagraphWork, ReadingParagraph } from './types'

export function buildJudgePrompt(para: ReadingParagraph, work: ParagraphWork): string {
  const lines: string[] = []
  lines.push(
    'あなたは英語長文の「文脈読解コーチ」です。生徒の読解の分析（意味のまとまりの分割・各まとまりの大意・関係の組み立て）に、投げかけ型の講評を返してください。'
  )
  lines.push('')
  lines.push('【講評の規律】')
  lines.push('- 正解を直接言わない。指摘は最大2件。全体（構造）→局所（個々のまとまり）の順。')
  lines.push('- ヒントは1段ずつ: ①場所の示唆 → ②手がかり語 → ③開示。生徒が求めるまで次の段に降りない。')
  lines.push('- 生徒の大意が模範と違っても、意味が通っていれば認める。切りすぎ・別解釈は減点しない。')
  lines.push('- 文言はすべて敬体の書き言葉。形容詞だけの賞賛をせず、何が・どうできていたかを具体的に承認する。')
  lines.push('')
  lines.push(`【本文（¶${para.no}）】`)
  para.sentences.forEach((s, i) => lines.push(`${i + 1}. ${s.text}`))
  lines.push('')

  // 採点の基準。正規形アンカー（検収済みの講にだけ入る）があればそれを、
  // なければ教材の事柄・要旨を基準として渡す。どちらでも講評は成立する。
  if (para.anchor && para.anchor.chain && para.anchor.chain.length > 0) {
    lines.push(
      '【内部アンカー（正規形＝本文を開いた命題連鎖。講評の採点基準。生徒にそのまま引用提示しない）】'
    )
    if (para.anchor.macro) lines.push(`要旨: ${para.anchor.macro}`)
    para.anchor.chain.forEach((c, i) => lines.push(`${i + 1}. ${c.ja}`))
  } else {
    lines.push('【採点の基準（教材側の模範。生徒にそのまま引用提示しない）】')
    if (para.macro) lines.push(`要旨: ${para.macro}`)
    para.kotos
      .filter((k) => k.no)
      .forEach((k) => lines.push(`${k.no}. ${k.t}${k.sym ? `（関係: ${k.sym}）` : ''}`))
    lines.push('※この講は正規形（検収済みの採点基準）がまだ入っていないため、教材の模範を基準にしています。')
  }
  lines.push('')

  const segs = studentSegments(para, work.cuts)
  lines.push('【生徒の分割（生徒自身の切れ目による意味のまとまり）】')
  segs.forEach((s) => lines.push(`${circled(s.num)} ${s.text}`))
  lines.push('')
  lines.push('【生徒の大意】')
  segs.forEach((s) => {
    const g = gistText(work.gists[s.id])
    lines.push(`${circled(s.num)} ${g || '（未入力）'}`)
  })
  lines.push('')
  lines.push('【生徒の組み立て（字下げ＝親子、行頭の記号＝上のまとまりとの関係）】')
  if (work.arrange && work.arrange.length > 0) {
    work.arrange.forEach((it) => {
      lines.push(`${'　'.repeat(it.indent)}${it.sym || '？'} ${circled(it.no)}`)
    })
  } else {
    lines.push('（未着手）')
  }
  lines.push('')
  lines.push('【依頼】')
  lines.push(
    '1. 生徒の各大意を基準の命題と突き合わせ、意味のずれ・強さのずれ（「〜かもしれない」「〜という」の脱落）・帰属の取り違え（通念や引用を筆者の主張と読む）を探してください。'
  )
  lines.push('2. 組み立て（親子と記号）が本文の論理と食い違う箇所を探してください。')
  lines.push(
    '3. 見つかった問題のうち影響の大きいものから最大2件だけ、規律に従って投げかけてください。問題がなければ、何ができていたかを具体的に述べて合格を伝えてください。'
  )
  return lines.join('\n')
}
