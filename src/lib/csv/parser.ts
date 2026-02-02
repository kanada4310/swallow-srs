/**
 * CSV Parser Utility
 * Handles parsing CSV files with various encodings and formats
 */

export interface CSVParseResult {
  headers: string[]
  rows: string[][]
  errors: Array<{ row: number; message: string }>
}

export interface CSVParseOptions {
  delimiter?: string
  hasHeader?: boolean
  maxRows?: number
}

const DEFAULT_OPTIONS: Required<CSVParseOptions> = {
  delimiter: ',',
  hasHeader: true,
  maxRows: 10000,
}

/**
 * Parse CSV text into headers and rows
 */
export function parseCSV(text: string, options?: CSVParseOptions): CSVParseResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const errors: Array<{ row: number; message: string }> = []

  // Normalize line endings
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Parse all lines
  const allRows = parseCSVLines(normalizedText, opts.delimiter)

  if (allRows.length === 0) {
    return { headers: [], rows: [], errors: [{ row: 0, message: 'CSVファイルが空です' }] }
  }

  // Extract headers
  const headers = opts.hasHeader ? allRows[0] : allRows[0].map((_, i) => `Column ${i + 1}`)
  const dataRows = opts.hasHeader ? allRows.slice(1) : allRows

  // Validate and limit rows
  const validatedRows: string[][] = []
  const expectedColumns = headers.length

  for (let i = 0; i < dataRows.length && validatedRows.length < opts.maxRows; i++) {
    const row = dataRows[i]
    const rowNumber = opts.hasHeader ? i + 2 : i + 1 // 1-indexed for user display

    // Skip empty rows
    if (row.length === 1 && row[0].trim() === '') {
      continue
    }

    // Check column count mismatch
    if (row.length !== expectedColumns) {
      errors.push({
        row: rowNumber,
        message: `列数が一致しません（期待: ${expectedColumns}, 実際: ${row.length}）`,
      })
      // Still include the row but pad or truncate
      if (row.length < expectedColumns) {
        validatedRows.push([...row, ...Array(expectedColumns - row.length).fill('')])
      } else {
        validatedRows.push(row.slice(0, expectedColumns))
      }
    } else {
      validatedRows.push(row)
    }
  }

  if (dataRows.length > opts.maxRows) {
    errors.push({
      row: opts.maxRows,
      message: `最大行数（${opts.maxRows}行）を超えています。最初の${opts.maxRows}行のみ処理されます。`,
    })
  }

  return { headers, rows: validatedRows, errors }
}

/**
 * Parse CSV lines handling quoted fields
 */
function parseCSVLines(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"'
          i += 2
        } else {
          // End of quoted field
          inQuotes = false
          i++
        }
      } else {
        currentField += char
        i++
      }
    } else {
      if (char === '"' && currentField === '') {
        // Start of quoted field
        inQuotes = true
        i++
      } else if (char === delimiter) {
        // End of field
        currentRow.push(currentField.trim())
        currentField = ''
        i++
      } else if (char === '\n') {
        // End of row
        currentRow.push(currentField.trim())
        rows.push(currentRow)
        currentRow = []
        currentField = ''
        i++
      } else {
        currentField += char
        i++
      }
    }
  }

  // Handle last field/row
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    rows.push(currentRow)
  }

  return rows
}

/**
 * Detect delimiter from CSV text
 */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/[\r\n]/)[0] || ''

  const delimiters = [',', '\t', ';', '|']
  const counts = delimiters.map(d => ({
    delimiter: d,
    count: (firstLine.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length,
  }))

  // Sort by count descending
  counts.sort((a, b) => b.count - a.count)

  // Return the most common delimiter (minimum 1 occurrence)
  return counts[0].count >= 1 ? counts[0].delimiter : ','
}

/**
 * Read file as text with encoding detection
 */
export async function readFileAsText(file: File): Promise<string> {
  // Try to detect encoding from BOM or content
  const buffer = await file.arrayBuffer()
  const uint8Array = new Uint8Array(buffer)

  // Check for BOM
  if (uint8Array[0] === 0xEF && uint8Array[1] === 0xBB && uint8Array[2] === 0xBF) {
    // UTF-8 with BOM
    return new TextDecoder('utf-8').decode(uint8Array.slice(3))
  }

  if (uint8Array[0] === 0xFF && uint8Array[1] === 0xFE) {
    // UTF-16 LE
    return new TextDecoder('utf-16le').decode(uint8Array.slice(2))
  }

  if (uint8Array[0] === 0xFE && uint8Array[1] === 0xFF) {
    // UTF-16 BE
    return new TextDecoder('utf-16be').decode(uint8Array.slice(2))
  }

  // Try UTF-8 first
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(uint8Array)
    return text
  } catch {
    // Fallback to Shift-JIS for Japanese CSV files (common in Excel Japan)
    try {
      const text = new TextDecoder('shift-jis').decode(uint8Array)
      return text
    } catch {
      // Last resort: use default decoder
      return new TextDecoder().decode(uint8Array)
    }
  }
}

/**
 * Validate mapping between CSV columns and note type fields
 */
export interface ColumnMapping {
  csvColumn: string
  noteField: string
}

export interface MappingValidationResult {
  valid: boolean
  errors: string[]
  mappings: ColumnMapping[]
}

export function validateMapping(
  headers: string[],
  mapping: Record<string, string>, // csvColumn -> noteField
  requiredFields: string[]
): MappingValidationResult {
  const errors: string[] = []
  const mappings: ColumnMapping[] = []
  const mappedFields = new Set<string>()

  for (const [csvColumn, noteField] of Object.entries(mapping)) {
    if (!noteField) continue

    if (!headers.includes(csvColumn)) {
      errors.push(`CSV列 "${csvColumn}" が見つかりません`)
      continue
    }

    if (mappedFields.has(noteField)) {
      errors.push(`フィールド "${noteField}" が複数の列にマッピングされています`)
      continue
    }

    mappedFields.add(noteField)
    mappings.push({ csvColumn, noteField })
  }

  // Check required fields
  for (const field of requiredFields) {
    if (!mappedFields.has(field)) {
      errors.push(`必須フィールド "${field}" がマッピングされていません`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    mappings,
  }
}
