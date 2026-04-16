export interface FieldValues {
  [fieldName: string]: string
}

export interface RenderOptions {
  /** Clozeカードの番号（1, 2, 3...）。Clozeテンプレートの場合のみ使用 */
  clozeNumber?: number
  /** 表面/裏面のどちらをレンダリングするか */
  side: 'front' | 'back'
  /** レンダリング済みの表面HTML（裏面テンプレートの{{FrontSide}}で使用） */
  renderedFront?: string
}

/**
 * テンプレートをレンダリングする
 * Anki互換のテンプレート構文をサポート
 * CSSやサニタイズは行わない（CardIframeのiframe srcdocで隔離される）
 */
export function renderTemplate(
  template: string,
  fieldValues: FieldValues,
  options: RenderOptions
): string {
  let html = template

  // 1. Cloze処理（{{cloze:FieldName}}）
  html = processClozeFields(html, fieldValues, options)

  // 2. 条件付きセクション（{{#Field}}...{{/Field}}）
  html = processConditionalSections(html, fieldValues)

  // 3. 逆条件付きセクション（{{^Field}}...{{/Field}}）
  html = processInverseConditionalSections(html, fieldValues)

  // 4. TTS音声ボタン（{{tts:FieldName}}）
  html = processTtsPlaceholders(html, fieldValues)

  // 5. 単純なフィールド置換（{{FieldName}}）
  html = processSimpleFields(html, fieldValues, options)

  return html
}

/**
 * TTS音声ボタンプレースホルダー処理
 * {{tts:FieldName}} → クリック可能な音声ボタンHTML
 */
function processTtsPlaceholders(template: string, fieldValues: FieldValues): string {
  return template.replace(/\{\{tts:([^}]+)\}\}/g, (_match, fieldName) => {
    const trimmed = fieldName.trim()
    const value = fieldValues[trimmed]
    if (!value) return ''
    // Render field value + TTS button inline
    const ttsButton = `<button class="tts-btn" data-tts-field="${escapeAttr(trimmed)}" title="音声を再生" aria-label="${escapeAttr(trimmed)}の音声を再生"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></button>`
    return `<span class="tts-field">${value} ${ttsButton}</span>`
  })
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * テンプレートにTTSプレースホルダーが含まれるかチェック
 */
export function hasTtsPlaceholders(template: string): boolean {
  return /\{\{tts:[^}]+\}\}/.test(template)
}

/**
 * 単純なフィールド置換
 * {{FieldName}} → フィールド値
 */
function processSimpleFields(template: string, fieldValues: FieldValues, options?: RenderOptions): string {
  return template.replace(/\{\{([^#^/}]+?)\}\}/g, (match, fieldName) => {
    const trimmedName = fieldName.trim()
    // cloze: プレフィックスは別処理済み
    if (trimmedName.startsWith('cloze:')) {
      return match
    }
    // {{FrontSide}} - Anki互換: 裏面でレンダリング済みの表面HTMLを挿入
    if (trimmedName === 'FrontSide') {
      return options?.renderedFront ?? ''
    }
    return fieldValues[trimmedName] ?? ''
  })
}

/**
 * 条件付きセクション処理
 * {{#Field}}content{{/Field}} → フィールドが空でなければcontentを表示
 */
function processConditionalSections(template: string, fieldValues: FieldValues): string {
  const regex = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g
  return template.replace(regex, (match, fieldName, content) => {
    const value = fieldValues[fieldName.trim()]
    if (value && value.trim() !== '') {
      return content
    }
    return ''
  })
}

/**
 * 逆条件付きセクション処理
 * {{^Field}}content{{/Field}} → フィールドが空ならcontentを表示
 */
function processInverseConditionalSections(template: string, fieldValues: FieldValues): string {
  const regex = /\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g
  return template.replace(regex, (match, fieldName, content) => {
    const value = fieldValues[fieldName.trim()]
    if (!value || value.trim() === '') {
      return content
    }
    return ''
  })
}

/**
 * Clozeフィールド処理
 * {{cloze:Text}} → Cloze削除を適用したテキスト
 */
function processClozeFields(
  template: string,
  fieldValues: FieldValues,
  options: RenderOptions
): string {
  return template.replace(/\{\{cloze:(\w+)\}\}/g, (match, fieldName) => {
    const value = fieldValues[fieldName.trim()] ?? ''
    return processClozeText(value, options)
  })
}

/**
 * Cloze削除を処理
 * {{c1::answer}} → [...]（表面）または answer（裏面）
 * {{c1::answer::hint}} → [hint]（表面）または answer（裏面）
 */
function processClozeText(text: string, options: RenderOptions): string {
  const { clozeNumber = 1, side } = options

  // Cloze削除パターン: {{c1::answer}} または {{c1::answer::hint}}
  const clozeRegex = /\{\{c(\d+)::([^}:]+)(?:::([^}]+))?\}\}/g

  return text.replace(clozeRegex, (match, num, answer, hint) => {
    const clozeNum = parseInt(num, 10)

    if (clozeNum === clozeNumber) {
      // このカードの対象Cloze
      if (side === 'front') {
        // 表面: 穴埋め表示
        const placeholder = hint ? hint : '...'
        return `<span class="cloze-deletion cloze-hidden">[${placeholder}]</span>`
      } else {
        // 裏面: 答えを表示
        return `<span class="cloze-deletion cloze-answer">${answer}</span>`
      }
    } else {
      // 他のCloze番号: 常に答えを表示
      return answer
    }
  })
}

/**
 * Cloze削除の数をカウント
 * ノートから生成するカードの枚数を決定するために使用
 */
export function countClozeNumbers(text: string): number[] {
  const clozeRegex = /\{\{c(\d+)::[^}]+\}\}/g
  const numbers = new Set<number>()

  let match
  while ((match = clozeRegex.exec(text)) !== null) {
    numbers.add(parseInt(match[1], 10))
  }

  return Array.from(numbers).sort((a, b) => a - b)
}

/**
 * テンプレートから {{tts:FieldName}} のフィールド名を抽出
 */
export function extractTtsFieldNames(template: string): string[] {
  const regex = /\{\{tts:([^}]+)\}\}/g
  const fields: string[] = []
  let match
  while ((match = regex.exec(template)) !== null) {
    fields.push(match[1].trim())
  }
  return fields
}

/**
 * テンプレートからフィールド名を抽出
 */
export function extractFieldNames(template: string): string[] {
  const fieldRegex = /\{\{([^#^/}]+?)\}\}/g
  const fields = new Set<string>()

  let match
  while ((match = fieldRegex.exec(template)) !== null) {
    const fieldName = match[1].trim()
    // cloze: プレフィックスを除去
    if (fieldName.startsWith('cloze:')) {
      fields.add(fieldName.slice(6))
    } else {
      fields.add(fieldName)
    }
  }

  return Array.from(fields)
}
