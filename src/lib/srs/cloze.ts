/**
 * Count cloze deletion numbers in text (e.g., {{c1::answer}} -> [1])
 */
export function countClozeDeletions(text: string): number[] {
  const regex = /\{\{c(\d+)::/g
  const numbers = new Set<number>()
  let match
  while ((match = regex.exec(text)) !== null) {
    numbers.add(parseInt(match[1], 10))
  }
  return Array.from(numbers).sort((a, b) => a - b)
}
