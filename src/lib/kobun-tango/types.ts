/**
 * 古文単語演習（つばめ古文 tango.html のモードA/B 相当）の型定義。
 *
 * 1ノート＝1問（1カード）。モードごとにノートタイプを分ける：
 *   モードA「古文単語演習A（単語→意味）」: 見出し語 → 該当する意味を「すべて」選ぶ（複数選択）
 *   モードB「古文単語演習B（例文→傍線部）」: 例文の傍線部 → 意味を四択で1つ選ぶ
 *
 * 出題UIは StudyCard ではなく KobunTangoCard が組み立てる（識別演習＝多段階設問と同じ思想）。
 * 「問題」(JSON) には採点に必要な配列データ（正解・ダミー候補）だけを入れ、表示用テキスト
 * （例文・出典・訳・傍線形）は標準エディタで編集できるよう**フラットフィールド**に持つ。
 *
 * ダミー選択肢はインポート時に同品詞プールから生成して「問題.distractors」に焼き込み、
 * カードは毎レビュー時にプールから必要数をランダム抽出する（例文プール／画像マスクと同じ）。
 */

export type KobunMode = 'A' | 'B'

/** 「問題」(JSON) のスキーマ（モードA） */
export interface KobunQuestionA {
  mode: 'A'
  /** 正解の語義（見出し語の全語義）。すべて選べば正解。 */
  correct: string[]
  /** ダミー候補プール（同品詞・正解と非類似）。毎回ここから抽出する。 */
  distractors: string[]
}

/** 「問題」(JSON) のスキーマ（モードB） */
export interface KobunQuestionB {
  mode: 'B'
  /** 正解の語義（1つ） */
  correct: string
  /** ダミー候補プール（同語の他語義＋同品詞他語）。毎回ここから3つ抽出。 */
  distractors: string[]
}

export type KobunQuestion = KobunQuestionA | KobunQuestionB

/** カードヘッダー用メタ（フラットフィールド由来） */
export interface KobunMeta {
  no: string
  pos: string
  headword: string
  kanji: string
}

/** モードB の表示テキスト（フラットフィールド由来） */
export interface KobunBDisplay {
  /** 例文（傍線部を含む原文） */
  passage: string
  /** 例文中で見出し語に当たる活用形（傍線を引く部分） */
  headwordForm: string
  /** 出典（任意） */
  source: string
  /** 現代語訳（任意・フィードバックで表示） */
  translation: string
}

/** 採点結果（review_logs.step_results に保存する1件分） */
export interface KobunStepResult {
  mode: KobunMode
  /** 選んだ選択肢（「わからない」は除外） */
  chosen: string[]
  /** 正解の語義 */
  correct: string[]
  /** 「わからない」を選んだか */
  dontKnow: boolean
  /** 完全正解か（モードA=集合一致 / モードB=一致） */
  overallCorrect: boolean
  /** 正答度 0-1（モードA は部分点、モードB は 0 or 1） */
  fraction: number
}

/** 1問分のスコア（正誤＋解答時間から算出） */
export interface KobunScore {
  /** 総合スコア 0-100（正誤を主・時間を従に合成） */
  score: number
  /** 正答度 0-100 */
  accuracyPct: number
  /** 解答に要した時間(ms) */
  elapsedMs: number
  /** 速さ係数 0-1（目標時間内なら 1.0） */
  speedScore: number
}

/** SRS 評価値（1=Again, 2=Hard, 3=Good, 4=Easy）。scheduler の Ease と一致。 */
export type EaseValue = 1 | 2 | 3 | 4
