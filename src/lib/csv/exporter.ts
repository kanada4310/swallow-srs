/**
 * CSV Exporter Utility
 * Generates CSV files with UTF-8 BOM for Excel compatibility
 */

export interface CSVExportOptions {
  delimiter?: string
  includeNoteType?: boolean
}

const DEFAULT_EXPORT_OPTIONS: Required<CSVExportOptions> = {
  delimiter: ',',
  includeNoteType: true,
}

/**
 * Escape a CSV field value according to RFC 4180
 * - Wrap in quotes if contains delimiter, newline, or double quote
 * - Escape double quotes by doubling them
 */
export function escapeCSVField(value: string, delimiter: string = ','): string {
  if (value === '') return ''

  const needsQuoting =
    value.includes(delimiter) ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.includes('"')

  if (needsQuoting) {
    return '"' + value.replace(/"/g, '""') + '"'
  }

  return value
}

export interface NoteForExport {
  noteTypeName: string
  fieldValues: Record<string, string>
}

/**
 * Generate a CSV string from notes data
 * - UTF-8 BOM prepended for Excel compatibility
 * - CRLF line endings
 * - When multiple note types exist, a "ノートタイプ" column is prepended
 */
export function generateCSV(
  notes: NoteForExport[],
  allFieldNames: string[],
  options?: CSVExportOptions
): string {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options }
  const { delimiter } = opts

  // Determine if we need note type column
  const noteTypeSet = new Set(notes.map((n) => n.noteTypeName))
  const includeNoteType = opts.includeNoteType && noteTypeSet.size > 1

  // Build header row
  const headers: string[] = []
  if (includeNoteType) {
    headers.push('ノートタイプ')
  }
  headers.push(...allFieldNames)

  // Build data rows
  const rows: string[] = [
    headers.map((h) => escapeCSVField(h, delimiter)).join(delimiter),
  ]

  for (const note of notes) {
    const cells: string[] = []
    if (includeNoteType) {
      cells.push(escapeCSVField(note.noteTypeName, delimiter))
    }
    for (const fieldName of allFieldNames) {
      cells.push(escapeCSVField(note.fieldValues[fieldName] || '', delimiter))
    }
    rows.push(cells.join(delimiter))
  }

  // UTF-8 BOM + CRLF line endings
  const BOM = '\uFEFF'
  return BOM + rows.join('\r\n') + '\r\n'
}
