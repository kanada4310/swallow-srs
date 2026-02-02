/**
 * PWA Icon Generator Script
 * Generates placeholder icons for PWA manifest
 * Run with: node scripts/generate-icons.mjs
 */

import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]
const outputDir = join(__dirname, '..', 'public', 'icons')

// SVG icon template - Swallow bird silhouette with "SRS" text
function generateSVG(size) {
  const fontSize = Math.round(size * 0.18)
  const birdSize = Math.round(size * 0.4)
  const radius = Math.round(size * 0.15)

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${size}" height="${size}" fill="#2563eb" rx="${radius}"/>

  <!-- Swallow bird silhouette (simplified) -->
  <g transform="translate(${size / 2 - birdSize / 2}, ${size * 0.2})">
    <path
      d="M${birdSize * 0.5} ${birdSize * 0.1}
         C${birdSize * 0.7} ${birdSize * 0.15}, ${birdSize * 0.9} ${birdSize * 0.3}, ${birdSize} ${birdSize * 0.35}
         L${birdSize * 0.65} ${birdSize * 0.45}
         L${birdSize * 0.5} ${birdSize * 0.8}
         L${birdSize * 0.35} ${birdSize * 0.45}
         L${birdSize * 0} ${birdSize * 0.35}
         C${birdSize * 0.1} ${birdSize * 0.3}, ${birdSize * 0.3} ${birdSize * 0.15}, ${birdSize * 0.5} ${birdSize * 0.1}
         Z"
      fill="white"
    />
  </g>

  <!-- SRS text -->
  <text
    x="${size / 2}"
    y="${size * 0.78}"
    font-family="Arial, sans-serif"
    font-size="${fontSize}"
    font-weight="bold"
    fill="white"
    text-anchor="middle"
  >SRS</text>
</svg>`)
}

// Generate icons
async function generateIcons() {
  console.log('Generating PWA icons...\n')

  for (const size of sizes) {
    const svg = generateSVG(size)
    const filename = `icon-${size}x${size}.png`
    const filepath = join(outputDir, filename)

    await sharp(svg)
      .png()
      .toFile(filepath)

    console.log(`Generated: ${filename}`)
  }

  console.log('\nPWA icons generated successfully!')
}

generateIcons().catch(console.error)
