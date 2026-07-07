/**
 * 生徒のスマホ/タブレット環境を再現してスクリーンショットを撮る開発ツール。
 *
 * - Playwright のデバイスエミュレーション（既定 iPhone 13、--device で変更可）
 * - 本物の LINE ログイン経路（SRS_AUTH_SECRET で JWT 署名 → /auth/line）で
 *   「テスト生徒」アカウントに自動ログイン（初回は自動作成される）
 * - 永続プロファイル（.device-preview/profile）を使うので IndexedDB（同期データ）が
 *   2回目以降も残り、実機に近い状態で確認できる
 *
 * Usage:
 *   npm run dev を起動した状態で:
 *   node scripts/device-preview.mjs                          # / /decks /stats を撮影
 *   node scripts/device-preview.mjs --paths=/,/study?deck=X  # 任意のパス
 *   node scripts/device-preview.mjs --device="iPad Mini"     # タブレット
 *   node scripts/device-preview.mjs --teacher                # 講師ロールのテストアカウント
 *   node scripts/device-preview.mjs --fresh                  # プロファイル破棄（初回同期から）
 *
 * 出力: .device-preview/shots/*.png（gitignore 済み）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { chromium, devices } = require('playwright')
const { SignJWT } = require('jose')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_ROOT = path.join(ROOT, '.device-preview')
const PROFILE_DIR = path.join(OUT_ROOT, 'profile')
const SHOTS_DIR = path.join(OUT_ROOT, 'shots')

function arg(name, fallback) {
  const i = process.argv.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`))
  if (i === -1) return fallback
  const eq = process.argv[i].indexOf('=')
  if (eq !== -1) return process.argv[i].slice(eq + 1)
  const nxt = process.argv[i + 1]
  return nxt && !nxt.startsWith('--') ? nxt : fallback
}

const BASE_URL = arg('base', 'http://localhost:3000')
const DEVICE_NAME = arg('device', 'iPhone 13')
const PATHS = arg('paths', '/,/decks,/stats').split(',').filter(Boolean)
const IS_TEACHER = process.argv.includes('--teacher')
const FRESH = process.argv.includes('--fresh')
const WAIT_MS = Number(arg('wait', '6000')) // 同期・描画待ち

function loadEnv() {
  const content = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}

async function main() {
  const env = loadEnv()
  const secret = env['SRS_AUTH_SECRET']
  if (!secret) throw new Error('.env.local に SRS_AUTH_SECRET がありません')

  const device = devices[DEVICE_NAME]
  if (!device) {
    console.error(`❌ 未知のデバイス: ${DEVICE_NAME}`)
    console.error('例: "iPhone 13", "iPhone SE", "iPad Mini", "Pixel 7", "Galaxy S9+"')
    process.exit(1)
  }

  // テスト用アカウント（本物の LINE 経路と同じ findOrCreate で自動作成される）
  const lineUserId = IS_TEACHER ? 'device-preview-teacher' : 'device-preview-student'
  const name = IS_TEACHER ? 'テスト講師（確認用）' : 'テスト生徒（確認用）'
  const role = IS_TEACHER ? 'teacher' : 'student'

  const jwt = await new SignJWT({ name, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(lineUserId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret))

  if (FRESH && fs.existsSync(PROFILE_DIR)) {
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true })
  }
  fs.mkdirSync(SHOTS_DIR, { recursive: true })

  const profileDir = path.join(PROFILE_DIR, `${role}-${DEVICE_NAME.replace(/\W+/g, '_')}`)
  const context = await chromium.launchPersistentContext(profileDir, {
    ...device,
    headless: true,
    baseURL: BASE_URL,
  })
  const page = context.pages()[0] || (await context.newPage())

  // ログイン（毎回 JWT で叩く: 既ログインでもセッションが張り直されるだけで無害）
  console.log(`🔑 ログイン: ${name} (${DEVICE_NAME})`)
  await page.goto(`${BASE_URL}/auth/line?token=${encodeURIComponent(jwt)}&next=/`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await page.waitForTimeout(WAIT_MS) // 初回同期・描画待ち

  const stamp = new Date().toISOString().slice(5, 16).replace(/[:T]/g, '')
  for (const p of PATHS) {
    await page.goto(`${BASE_URL}${p}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(WAIT_MS)
    const safe = p.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'home'
    const file = path.join(SHOTS_DIR, `${role}-${safe}-${stamp}.png`)
    await page.screenshot({ path: file, fullPage: true })
    console.log(`📸 ${p} → ${file}`)
  }

  await context.close()
  console.log('✅ 完了')
}

main().catch(e => {
  console.error('❌', e)
  process.exit(1)
})
