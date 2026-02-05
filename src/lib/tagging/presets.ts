export interface TaggingPreset {
  id: string
  name: string
  description: string
  category: 'cloze' | 'highlight' | 'translation_highlight'
  suggestedRuleName: string
  suggestedTargetSuffix: string
  sourceRoles: { label: string; description: string }[]
  buildInstruction: (fieldNames: string[]) => string
}

export const TAGGING_PRESETS: TaggingPreset[] = [
  {
    id: 'cloze',
    name: 'Cloze化',
    description: '例文中の見出し語をCloze記法（穴埋め）に変換',
    category: 'cloze',
    suggestedRuleName: 'Cloze化',
    suggestedTargetSuffix: 'Cloze',
    sourceRoles: [
      { label: '見出し語', description: '穴埋めにする語' },
      { label: '例文', description: 'Cloze変換する文' },
    ],
    buildInstruction: () => `例文中の見出し語（またはその活用形）をCloze記法に変換してください。

ルール:
1. 参照データの見出し語が例文中に現れる箇所を特定（活用形・変形も含む）
2. {{c1::該当語::ヒント}} 形式に変換。ヒントは先頭文字+___
3. 例文のそれ以外の部分はそのまま
4. 見出し語が見つからない場合は例文をそのまま返す

例:
見出し語: play / 例文: He plays the piano every day.
→ He {{c1::plays::p___}} the piano every day.

見出し語: take / 例文: She took a deep breath.
→ She {{c1::took::t___}} a deep breath.

見出し語: responsible / 例文: She is responsible for the project.
→ She is {{c1::responsible::r___}} for the project.`,
  },
  {
    id: 'collocation_highlight',
    name: 'コロケーション強調',
    description: '例文中の見出し語を含むコロケーションを太字にする',
    category: 'highlight',
    suggestedRuleName: 'コロケーション強調',
    suggestedTargetSuffix: 'HL',
    sourceRoles: [
      { label: '見出し語', description: '検索する語' },
      { label: '例文', description: '強調する文' },
    ],
    buildInstruction: () => `例文中の見出し語を含むコロケーション（自然な語の組み合わせ）を<b></b>で囲んでください。

ルール:
1. 見出し語を含むコロケーション（動詞+目的語、形容詞+名詞等）を特定
2. コロケーション全体を<b></b>で囲む
3. それ以外はそのまま
4. コロケーションが見つからない場合は見出し語のみを<b></b>で囲む

例:
見出し語: play / 例文: He plays the piano every day.
→ He <b>plays the piano</b> every day.

見出し語: make / 例文: They made a decision to move forward.
→ They <b>made a decision</b> to move forward.

見出し語: responsible / 例文: She is responsible for the project.
→ She is <b>responsible for</b> the project.`,
  },
  {
    id: 'translation_highlight',
    name: '和訳対応語強調',
    description: '和訳文中の見出し語に対応する日本語表現を太字にする',
    category: 'translation_highlight',
    suggestedRuleName: '和訳対応語強調',
    suggestedTargetSuffix: 'JaHL',
    sourceRoles: [
      { label: '見出し語', description: '英単語' },
      { label: '意味', description: '単語の意味' },
      { label: '和訳', description: '強調する和訳文' },
    ],
    buildInstruction: () => `和訳文中の見出し語に対応する日本語表現を<b></b>で囲んでください。

ルール:
1. 見出し語と意味を参照し、和訳中の対応部分を特定
2. 対応部分を<b></b>で囲む（活用語尾も含める）
3. それ以外はそのまま
4. 対応部分が見つからない場合は和訳をそのまま返す

例:
見出し語: play / 意味: 演奏する / 和訳: 彼は毎日ピアノを演奏します。
→ 彼は毎日ピアノを<b>演奏します</b>。

見出し語: take / 意味: 取る / 和訳: 彼女は深呼吸をした。
→ 彼女は<b>深呼吸をした</b>。

見出し語: decision / 意味: 決定 / 和訳: 彼らは前に進む決定をした。
→ 彼らは前に進む<b>決定</b>をした。`,
  },
]
