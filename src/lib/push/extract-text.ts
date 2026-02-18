/**
 * Extract front-facing text from a note's field_values for display in notification.
 * Priority: Front > Text > Expression > Word > first field value
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

  // Fallback to first non-empty field
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

  // Strip HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Expand Cloze deletions: {{c1::answer::hint}} → answer, {{c1::answer}} → answer
  text = text.replace(/\{\{c\d+::([^:}]+)(?:::[^}]*)?\}\}/g, '$1')

  // Trim and limit length
  text = text.trim()
  if (text.length > 100) {
    text = text.substring(0, 97) + '...'
  }

  return text || '復習カードがあります'
}
