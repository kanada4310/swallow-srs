/**
 * PWAアイコンを生成する（藍地×白つばめ＋喉の橙のワンポイント）。
 * ブランド: docs/design-system.md（藍 #1C2B4B / 空 #3E8EF7 / 橙 #FF7849）
 *
 * sharp（Next.js 同梱の依存）で SVG → public/icons/icon-{size}.png を上書きする。
 * maskable 対応: 主要モチーフはセーフゾーン（中央80%）内に収める。
 *
 * Usage: node data/generate-pwa-icons.mjs
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'icons')
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

// つばめのシルエット（SwallowMark と同パス・viewBox 0 0 100 60）を中央に配置。
// 背景は藍の対角グラデーション、喉元に橙の小さな丸を添える。
const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#27407A"/>
      <stop offset="1" stop-color="#131E36"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <!-- swallow: path bbox ~100x54 -> scale 3.2、maskable セーフゾーン内に中央配置 -->
  <g transform="translate(96 166) scale(3.2)">
    <path d="M2 8 C30 2 50 10 58 22 C70 14 88 14 98 6 C90 22 74 30 62 30 L70 56 L58 34 L46 56 L54 30 C34 30 12 22 2 8 Z" fill="#FFFFFF"/>
  </g>
  <!-- 喉の橙: 尾の下にワンポイント（夕空の点） -->
  <circle cx="256" cy="392" r="18" fill="#FF7849"/>
</svg>
`

async function main() {
  const base = Buffer.from(SVG)
  for (const size of SIZES) {
    const out = path.join(OUT_DIR, `icon-${size}x${size}.png`)
    await sharp(base, { density: 300 }).resize(size, size).png().toFile(out)
    console.log(`✅ ${out}`)
  }
}

main().catch(e => {
  console.error('❌', e)
  process.exit(1)
})
