import { renderTemplate } from '@/lib/template/renderer'

/**
 * カードテンプレートをレンダリングし、HTMLタグを剥いだプレーンテキストを返す。
 * LINE Flex メッセージなどの通知プレビュー用途。
 */
export function renderCardFrontText(
  frontTemplate: string | null | undefined,
  fieldValues: Record<string, string> | null | undefined,
  templateIndex: number = 0
): string {
  if (!frontTemplate || !fieldValues) {
    return extractFrontText(fieldValues ?? null)
  }

  // Clozeカードでは template_index が 0-indexed の cloze 番号に対応
  const clozeNumber = templateIndex + 1

  let html: string
  try {
    html = renderTemplate(frontTemplate, fieldValues, {
      side: 'front',
      clozeNumber,
    })
  } catch {
    return extractFrontText(fieldValues)
  }

  return stripToPlainText(html) || extractFrontText(fieldValues)
}

/**
 * 後方互換用: field_values の優先フィールドから1フィールドだけ取り出す旧実装。
 * テンプレートが取得できない場合のフォールバック。
 */
export function extractFrontText(fieldValues: Record<string, string> | null): string {
  if (!fieldValues) return '復習カードがあります'

  const priorityFields = ['Front', 'Text', 'Expression', 'Word']
  let text = ''

  for (const fieldName of priorityFields) {
    if (fieldValues[fieldName]) {
      text = fieldValues[fieldName]
      break
    }
  }

  if (!text) {
    const keys = Object.keys(fieldValues)
    for (const key of keys) {
      if (fieldValues[key]) {
        text = fieldValues[key]
        break
      }
    }
  }

  if (!text) return '復習カードがあります'

  return stripToPlainText(text) || '復習カードがあります'
}

/**
 * HTML/Cloze/空白を整理してプレーンテキスト化、長さ制限を適用する。
 */
function stripToPlainText(input: string): string {
  let text = input

  // Cloze削除を展開: {{c1::answer::hint}} → answer, {{c1::answer}} → answer
  text = text.replace(/\{\{c\d+::([^:}]+)(?:::[^}]*)?\}\}/g, '$1')

  // <br>, </p>, </div> などを改行に
  text = text.replace(/<\s*br\s*\/?\s*>/gi, '\n')
  text = text.replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')

  // 残りのHTMLタグを除去
  text = text.replace(/<[^>]+>/g, '')

  // HTMLエンティティの最小デコード
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // 連続空白・改行を整理
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n{2,}/g, '\n')
  text = text.split('\n').map(line => line.trim()).filter(Boolean).join('\n')
  text = text.trim()

  if (text.length > 100) {
    text = text.substring(0, 97) + '...'
  }

  return text
}
