/**
 * 講師アカウント（メール+パスワードログイン）を作成する。
 *
 * Supabase Auth にユーザーを作成（email_confirm 済み）し、profiles を role='teacher' で upsert する。
 * gaimon.maam@gmail.com と同じ方式の講師ログインを増やすためのスクリプト。
 *
 * Usage:
 *   node data/create-teacher-account.mjs --dry-run
 *   node data/create-teacher-account.mjs
 *   node data/create-teacher-account.mjs --email foo@example.com --password secret --name 山田太郎
 *   node data/create-teacher-account.mjs --reset-password   # 既存ユーザーのパスワードを上書き
 *
 * 既定は荒井先生用。
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
    return process.argv[i + 1]
  }
  return fallback
}

const DRY_RUN = process.argv.includes('--dry-run')
const RESET_PASSWORD = process.argv.includes('--reset-password')

// 既定 = 荒井先生
const EMAIL = arg('email', 'naobees70@gmail.com')
const PASSWORD = arg('password', 'swallow-srs')
const NAME = arg('name', '荒井尚緒')
const ROLE = arg('role', 'teacher')

function loadEnv() {
  const content = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim()
    if (v) env[k] = v
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_ROLE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ .env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** メールで既存の Auth ユーザーを探す（listUsers をページング） */
async function findAuthUserByEmail(email) {
  const target = email.toLowerCase()
  let page = 1
  const perPage = 200
  // 上限ガード（最大 50 ページ＝1万ユーザー）
  while (page <= 50) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const found = data.users.find(u => (u.email || '').toLowerCase() === target)
    if (found) return found
    if (data.users.length < perPage) break
    page++
  }
  return null
}

async function main() {
  console.log(`🔧 mode: ${DRY_RUN ? 'DRY-RUN' : RESET_PASSWORD ? 'RESET-PASSWORD' : '通常'}`)
  console.log(`   email: ${EMAIL}`)
  console.log(`   name : ${NAME}`)
  console.log(`   role : ${ROLE}`)

  if (DRY_RUN) {
    console.log('   [dry-run] Auth ユーザー作成 + profiles upsert を行います')
    return
  }

  // 1. 既存ユーザーの確認
  const existing = await findAuthUserByEmail(EMAIL)
  let userId

  if (existing) {
    userId = existing.id
    console.log(`   既存ユーザーが見つかりました (id=${userId})`)
    if (RESET_PASSWORD) {
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password: PASSWORD,
        email_confirm: true,
      })
      if (error) throw error
      console.log('   ✅ パスワードを更新しました')
    } else {
      console.log('   パスワードは変更しません（変更するなら --reset-password）')
    }
  } else {
    // 2. 新規作成
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: NAME },
    })
    if (error) throw error
    userId = data.user.id
    console.log(`   ✅ Auth ユーザーを作成しました (id=${userId})`)
  }

  // 3. profiles を upsert（role=teacher）
  const { error: pErr } = await supabase
    .from('profiles')
    .upsert(
      { id: userId, email: EMAIL, name: NAME, role: ROLE },
      { onConflict: 'id' }
    )
  if (pErr) throw pErr
  console.log(`   ✅ profiles を upsert しました (role=${ROLE})`)

  console.log('\n🎉 完了。ログインページの「メール+パスワード」フォームからログインできます。')
  console.log(`   email: ${EMAIL}`)
  console.log(`   password: ${PASSWORD}`)
}

main().catch(err => {
  console.error('❌ エラー:', err.message || err)
  process.exit(1)
})
