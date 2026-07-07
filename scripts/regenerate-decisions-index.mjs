#!/usr/bin/env node
/**
 * docs/decisions/*.md の frontmatter を読んで docs/decisions.md 索引を再生成する。
 *
 * 新しい ADR を `docs/decisions/YYYYMMDD-<slug>.md` に追加したら、このスクリプトを
 * 実行することで索引 (docs/decisions.md) が更新される。
 *
 * 使い方:
 *   node scripts/regenerate-decisions-index.mjs
 *   node scripts/regenerate-decisions-index.mjs --check   # 差分だけ検査 (CI 用)
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC_DIR = join(ROOT, 'docs/decisions')
const INDEX_PATH = join(ROOT, 'docs/decisions.md')

const CHECK = process.argv.includes('--check')

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) return null
  const fm = {}
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.+)$/)
    if (!m) continue
    const key = m[1]
    let value = m[2].trim()
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    fm[key] = value
  }
  return fm
}

function extractTitle(content) {
  const match = content.match(/^# (.+)$/m)
  return match ? match[1].trim() : '(untitled)'
}

const files = readdirSync(SRC_DIR)
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .sort()

const entries = []
for (const filename of files) {
  const content = readFileSync(join(SRC_DIR, filename), 'utf8')
  const fm = parseFrontmatter(content)
  if (!fm) {
    console.warn(`[WARN] No frontmatter: ${filename}`)
    continue
  }
  const title = extractTitle(content)
  entries.push({
    filename,
    date: fm.date,
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    phase: fm.phase,
    slug: fm.slug,
    title,
  })
}

// Sort by date desc, then by filename desc (for stable order within same date)
entries.sort((a, b) => {
  if (a.date !== b.date) return b.date.localeCompare(a.date)
  return b.filename.localeCompare(a.filename)
})

// Group by date
const byDate = new Map()
for (const e of entries) {
  if (!byDate.has(e.date)) byDate.set(e.date, [])
  byDate.get(e.date).push(e)
}

// Build markdown
const lines = []
lines.push('# 技術的意思決定ログ (ADR) — 索引')
lines.push('')
lines.push('詳細は `docs/decisions/YYYYMMDD-<slug>.md` を参照。')
lines.push('')
lines.push('## 使い方 (コード変更前のルーチン)')
lines.push('')
lines.push(
  '1. 関連領域のタグ (例: `srs`) で `grep -l "tags:.*srs" docs/decisions/*.md` を実行',
)
lines.push('2. 該当 ADR を読んで過去の判断・ハマりポイントを把握')
lines.push('3. それから実装に入る')
lines.push('')
lines.push(
  'タグ一覧: `srs` / `scheduling` / `sync` / `offline` / `auth` / `line` / `billing-sync` / `rls` / `schema` / `ui-ux` / `garden` / `llm` / `vision` / `content` / `infra` / `convention` (必要に応じて追加)',
)
lines.push('')
lines.push('新しい ADR を追加したら `node scripts/regenerate-decisions-index.mjs` で索引更新。')
lines.push('')
lines.push('---')
lines.push('')
lines.push('## ADR 一覧 (新しい順)')
lines.push('')

for (const [date, list] of byDate) {
  lines.push(`### ${date}`)
  for (const e of list) {
    const tagStr = e.tags.map((t) => `\`#${t}\``).join(' ')
    const phaseStr = e.phase ? ` _(Phase ${e.phase})_` : ''
    const nameNoExt = e.filename.replace(/\.md$/, '')
    lines.push(`- [${nameNoExt}](decisions/${e.filename}) ${tagStr}${phaseStr} — ${e.title}`)
  }
  lines.push('')
}

const newContent = `${lines.join('\n')}\n`

if (CHECK) {
  const current = readFileSync(INDEX_PATH, 'utf8')
  if (current !== newContent) {
    console.error(
      'Index is out of date. Run `node scripts/regenerate-decisions-index.mjs` to update.',
    )
    process.exit(1)
  }
  console.log('Index is up to date.')
} else {
  writeFileSync(INDEX_PATH, newContent, 'utf8')
  console.log(`✓ Wrote ${INDEX_PATH}`)
  console.log(`  ${entries.length} ADRs across ${byDate.size} dates`)
}
