import { sanitizeHtml, sanitizeCss } from './sanitizer'

export interface FieldValues {
  [fieldName: string]: string
}

export interface RenderOptions {
  /** Clozeカードの番号（1, 2, 3...）。Clozeテンプレートの場合のみ使用 */
  clozeNumber?: number
  /** 表面/裏面のどちらをレンダリングするか */
  side: 'front' | 'back'
}

/**
 * テンプレートをレンダリングする
 * Anki互換のテンプレート構文をサポート
 */
export function renderTemplate(
  template: string,
  fieldValues: FieldValues,
  css: string = '',
  options: RenderOptions
): string {
  let html = template

  // 1. Cloze処理（{{cloze:FieldName}}）
  html = processClozeFields(html, fieldValues, options)

  // 2. 条件付きセクション（{{#Field}}...{{/Field}}）
  html = processConditionalSections(html, fieldValues)

  // 3. 逆条件付きセクション（{{^Field}}...{{/Field}}）
  html = processInverseConditionalSections(html, fieldValues)

  // 4. 単純なフィールド置換（{{FieldName}}）
  html = processSimpleFields(html, fieldValues)

  // 5. HTMLサニタイズ
  html = sanitizeHtml(html)

  // 6. CSSサニタイズとスタイル適用
  const sanitizedCss = sanitizeCss(css)
  if (sanitizedCss) {
    html = `<style>${sanitizedCss}</style><div class="card">${html}</div>`
  }

  return html
}

/**
 * 単純なフィールド置換
 * {{FieldName}} → フィールド値
 */
function processSimpleFields(template: string, fieldValues: FieldValues): string {
  return template.replace(/\{\{([^#^/}]+?)\}\}/g, (match, fieldName) => {
    const trimmedName = fieldName.trim()
    // cloze: プレフィックスは別処理済み
    if (trimmedName.startsWith('cloze:')) {
      return match
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
