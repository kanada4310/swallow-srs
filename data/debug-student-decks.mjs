/**
 * 特定生徒のデッキ可視性を調査する
 *
 * Usage: node data/debug-student-decks.mjs "生徒名"
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
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (val) env[key] = val
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_ROLE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const NAME = process.argv[2] || '林奏太'

async function main() {
  console.log(`\n=== Investigating decks for student: ${NAME} ===\n`)

  // 1. プロフィール検索（同名複数の可能性チェック）
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, email, name, role, created_at')
    .ilike('name', `%${NAME}%`)

  if (profileErr) {
    console.error('profile query error:', profileErr)
    return
  }

  console.log(`[1] Profiles matching "${NAME}":`)
  if (!profiles || profiles.length === 0) {
    console.log('  (none)')
    return
  }
  for (const p of profiles) {
    console.log(`  - id=${p.id}`)
    console.log(`    email=${p.email}  role=${p.role}  created=${p.created_at}`)
  }

  // 同じ名前で複数 UUID あれば即報告
  if (profiles.length > 1) {
    console.log(`\n  WARNING: ${profiles.length} accounts share this name (account duplication suspected)`)
  }

  for (const p of profiles) {
    console.log(`\n--- Account ${p.id} (${p.email}) ---`)

    // 2. auth.users から ban / metadata 情報
    try {
      const { data: { user: authUser } } = await supabase.auth.admin.getUserById(p.id)
      if (authUser) {
        console.log(`  auth.users:`)
        console.log(`    last_sign_in_at = ${authUser.last_sign_in_at}`)
        console.log(`    banned_until    = ${authUser.banned_until ?? '(not banned)'}`)
        console.log(`    user_metadata   = ${JSON.stringify(authUser.user_metadata)}`)
      }
    } catch (err) {
      console.log(`  auth.users lookup failed:`, err?.message || err)
    }

    // 3. クラスメンバーシップ
    const { data: memberships } = await supabase
      .from('class_members')
      .select('class_id, joined_at, classes(id, name, billing_template_id, teacher_id)')
      .eq('user_id', p.id)

    console.log(`\n  [2] class_members (${memberships?.length || 0}):`)
    if (memberships) {
      for (const m of memberships) {
        const c = m.classes
        console.log(`    - class_id=${m.class_id}`)
        console.log(`      name="${c?.name}"  billing_template_id=${c?.billing_template_id ?? '(null)'}  teacher_id=${c?.teacher_id ?? '(null)'}`)
      }
    }

    const classIds = (memberships || []).map(m => m.class_id)

    // 4. 自分が owner のデッキ
    const { data: ownDecks } = await supabase
      .from('decks')
      .select('id, name, parent_deck_id, is_distributed, created_at')
      .eq('owner_id', p.id)

    console.log(`\n  [3] own decks (${ownDecks?.length || 0}):`)
    for (const d of (ownDecks || [])) {
      console.log(`    - ${d.id}  "${d.name}"  parent=${d.parent_deck_id ?? '-'}  distributed=${d.is_distributed}`)
    }

    // 5. 個人配布
    const { data: directAssign } = await supabase
      .from('deck_assignments')
      .select('id, deck_id, class_id, assigned_at, decks(name)')
      .eq('user_id', p.id)

    console.log(`\n  [4] deck_assignments (user-direct) (${directAssign?.length || 0}):`)
    for (const a of (directAssign || [])) {
      console.log(`    - assignment=${a.id}  deck=${a.deck_id} "${a.decks?.name}"  assigned=${a.assigned_at}`)
    }

    // 6. クラス経由配布
    if (classIds.length > 0) {
      const { data: classAssign } = await supabase
        .from('deck_assignments')
        .select('id, deck_id, class_id, assigned_at, decks(name), classes(name)')
        .in('class_id', classIds)

      console.log(`\n  [5] deck_assignments (via class) (${classAssign?.length || 0}):`)
      for (const a of (classAssign || [])) {
        console.log(`    - assignment=${a.id}  class="${a.classes?.name}"  deck=${a.deck_id} "${a.decks?.name}"  assigned=${a.assigned_at}`)
      }

      // 累計可視デッキ数（owner + direct + class）
      const visible = new Set()
      for (const d of (ownDecks || [])) visible.add(d.id)
      for (const a of (directAssign || [])) visible.add(a.deck_id)
      for (const a of (classAssign || [])) visible.add(a.deck_id)
      console.log(`\n  [SUMMARY] total visible deck ids = ${visible.size}`)
    } else {
      console.log(`\n  [5] no class membership -> no class-based assignments`)
      const visible = new Set()
      for (const d of (ownDecks || [])) visible.add(d.id)
      for (const a of (directAssign || [])) visible.add(a.deck_id)
      console.log(`\n  [SUMMARY] total visible deck ids = ${visible.size}`)
    }
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
