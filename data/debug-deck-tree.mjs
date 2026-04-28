/**
 * 配布デッキとそのサブデッキを調査
 *
 * Usage: node data/debug-deck-tree.mjs <deck_id>
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function loadEnv() {
  const envPath = path.join(ROOT, '.env.local')
  const content = fs.readFileSync(envPath, 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
  }
  return env
}
const env = loadEnv()
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ROOT_DECK_ID = process.argv[2] || '824a36ca-bb74-4907-96e9-adb7139fd0b9'

async function main() {
  // Root deck info
  const { data: root } = await supabase
    .from('decks')
    .select('id, name, owner_id, parent_deck_id, is_distributed, filter_tags, settings, updated_at')
    .eq('id', ROOT_DECK_ID)
    .single()

  console.log('Root deck:')
  console.log(JSON.stringify(root, null, 2))

  // Children
  const { data: children } = await supabase
    .from('decks')
    .select('id, name, parent_deck_id, filter_tags, updated_at')
    .eq('parent_deck_id', ROOT_DECK_ID)

  console.log(`\nChildren (${children?.length || 0}):`)
  for (const c of children || []) {
    console.log(`  - ${c.id}  "${c.name}"  filter_tags=${JSON.stringify(c.filter_tags)}`)
  }

  if (children?.length) {
    const childIds = children.map(c => c.id)
    const { data: grandchildren } = await supabase
      .from('decks')
      .select('id, name, parent_deck_id, filter_tags')
      .in('parent_deck_id', childIds)
    console.log(`\nGrandchildren (${grandchildren?.length || 0}):`)
    for (const g of grandchildren || []) {
      console.log(`  - ${g.id}  "${g.name}"  parent=${g.parent_deck_id}  tags=${JSON.stringify(g.filter_tags)}`)
    }
  }

  // Notes count
  const { count: noteCount } = await supabase
    .from('notes')
    .select('*', { count: 'exact', head: true })
    .eq('deck_id', ROOT_DECK_ID)
  console.log(`\nNotes in root deck: ${noteCount}`)

  const { count: cardCount } = await supabase
    .from('cards')
    .select('*', { count: 'exact', head: true })
    .eq('deck_id', ROOT_DECK_ID)
  console.log(`Cards in root deck: ${cardCount}`)
}

main().catch(console.error)
