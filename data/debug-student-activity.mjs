/**
 * 林奏太の学習活動・タイミング詳細
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
function loadEnv() {
  const envPath = path.join(ROOT, '.env.local')
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}
const env = loadEnv()
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], {
  auth: { autoRefreshToken: false, persistSession: false },
})

const USER_ID = 'd7e0a7d3-4e25-48ea-a0f3-8acc75d66499'

async function main() {
  // class_members joined_at
  const { data: memberships } = await supabase
    .from('class_members')
    .select('class_id, joined_at')
    .eq('user_id', USER_ID)
  console.log('class_members joined_at:')
  for (const m of memberships || []) console.log(`  - class=${m.class_id}  joined=${m.joined_at}`)

  // review_logs
  const { count: rlCount } = await supabase
    .from('review_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
  console.log(`\nreview_logs count: ${rlCount}`)

  if (rlCount > 0) {
    const { data: recentLogs } = await supabase
      .from('review_logs')
      .select('id, card_id, deck_id, ease, reviewed_at')
      .eq('user_id', USER_ID)
      .order('reviewed_at', { ascending: false })
      .limit(5)
    console.log('Recent review_logs:')
    for (const r of recentLogs || []) {
      console.log(`  - ${r.reviewed_at}  card=${r.card_id}  deck=${r.deck_id ?? 'null'}  ease=${r.ease}`)
    }
  }

  // card_states
  const { count: csCount } = await supabase
    .from('card_states')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
  console.log(`\ncard_states count: ${csCount}`)

  if (csCount > 0) {
    const { data: latestState } = await supabase
      .from('card_states')
      .select('card_id, state, due, updated_at')
      .eq('user_id', USER_ID)
      .order('updated_at', { ascending: false })
      .limit(3)
    console.log('Latest card_states:')
    for (const s of latestState || []) {
      console.log(`  - ${s.updated_at}  card=${s.card_id}  state=${s.state}  due=${s.due}`)
    }
  }

  // deck_assignments timing
  const classIds = (memberships || []).map(m => m.class_id)
  const { data: assigns } = await supabase
    .from('deck_assignments')
    .select('deck_id, class_id, assigned_at')
    .in('class_id', classIds)
  console.log('\ndeck_assignments to his classes:')
  for (const a of assigns || []) console.log(`  - deck=${a.deck_id}  assigned_at=${a.assigned_at}`)

  // Deck updated_at vs assignment time
  if (assigns?.length) {
    const ids = assigns.map(a => a.deck_id)
    const { data: decks } = await supabase
      .from('decks')
      .select('id, name, updated_at, created_at')
      .in('id', ids)
    console.log('\nDeck timing:')
    for (const d of decks || []) {
      console.log(`  - "${d.name}" created=${d.created_at}  updated=${d.updated_at}`)
    }
  }
}

main().catch(console.error)
