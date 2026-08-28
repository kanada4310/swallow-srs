/**
 * 入れ子カッコの深さ別の色を、機械で計算して確かめる道具（開発用・実行しても何も変えない）。
 *
 * 見るのは4つ:
 * - 白地に対する明暗の比（小さな文字の推奨は 4.5:1 以上）
 * - 隣り合う深さの色相の差（青と橙＝補色に近いこと）
 * - 2つ違いの深さの明るさ（L*）の差（同じ側の色を濃さで分けること）
 * - 色覚の3つの型それぞれでの色の差（Viénot 1999 の二色覚の見え方＋CIE L*a*b* の差）
 *
 * 実行: node scripts/bracket-colors.mjs [色1 色2 色3 色4]
 */

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const rgb2hex = (rgb) =>
  '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const toLinear = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
const toSrgb = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

/** 相対的な明るさ（WCAG） */
function luminance(rgb) {
  const [r, g, b] = rgb.map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** 白地に対する明暗の比 */
export function contrastOnWhite(hex) {
  return 1.05 / (luminance(hex2rgb(hex)) + 0.05)
}

/** sRGB → CIE L*a*b*（D65） */
export function lab(hex) {
  const [r, g, b] = hex2rgb(hex).map(toLinear)
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29)
  const [fx, fy, fz] = [f(X), f(Y), f(Z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
/** 色相（度・L*a*b* の角度） */
export function hue(hex) {
  const [, a, b] = lab(hex)
  return (Math.atan2(b, a) * 180) / Math.PI
}
/** 色相の差（0〜180度） */
export function hueDiff(h1, h2) {
  const d = Math.abs(((h1 - h2) % 360) + 360) % 360
  return d > 180 ? 360 - d : d
}
/** 色の差（CIE76） */
export function deltaE(hexA, hexB) {
  const A = lab(hexA)
  const B = lab(hexB)
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

/* ---- 二色覚の見え方（Viénot, Brettel & Mollon 1999。線形の RGB に当てる） ---- */
const M = [
  [17.8824, 43.5161, 4.11935],
  [3.45565, 27.1554, 3.86714],
  [0.0299566, 0.184309, 1.46709],
]
const MINV = [
  [0.080944447, -0.13050440, 0.11672069],
  [-0.010248533, 0.054019486, -0.113614708],
  [-0.000365294, -0.004121615, 0.693511392],
]
const mul = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2])

/** type: 'protan' | 'deutan' | 'tritan' */
export function simulate(hex, type) {
  const lin = hex2rgb(hex).map(toLinear)
  let [L, Mm, S] = mul(M, lin)
  if (type === 'protan') L = 2.02344 * Mm - 2.52581 * S
  else if (type === 'deutan') Mm = 0.494207 * L + 1.24827 * S
  else S = -0.395913 * L + 0.801109 * Mm
  const back = mul(MINV, [L, Mm, S]).map((v) => Math.max(0, Math.min(1, v)))
  return rgb2hex(back.map(toSrgb))
}

/** 4色すべての組み合わせのうち、いちばん近い色の差 */
export function minDeltaE(colors, type) {
  let min = Infinity
  let pair = ''
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const a = type ? simulate(colors[i], type) : colors[i]
      const b = type ? simulate(colors[j], type) : colors[j]
      const d = deltaE(a, b)
      if (d < min) {
        min = d
        pair = `${colors[i]}×${colors[j]}`
      }
    }
  }
  return { min, pair }
}

export function report(colors, title) {
  const names = ['深さ0', '深さ1', '深さ2', '深さ3']
  console.log(`\n【${title}】 ${colors.join(' / ')}`)
  console.log('色     | 白地の比 | 明度 L* | 色相')
  colors.forEach((c, i) => {
    const [L] = lab(c)
    console.log(
      `${names[i]} ${c} | ${contrastOnWhite(c).toFixed(2)}:1 | ${L.toFixed(1)} | ${((hue(c) + 360) % 360).toFixed(0)}°`
    )
  })
  console.log('隣り合う深さの色相の差:')
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    console.log(`  深さ${i}↔${j}: ${hueDiff(hue(colors[i]), hue(colors[j])).toFixed(0)}°`)
  }
  console.log('2つ違いの深さの明るさ（L*）の差:')
  ;[[0, 2], [1, 3]].forEach(([i, j]) =>
    console.log(`  深さ${i}↔${j}: ${Math.abs(lab(colors[i])[0] - lab(colors[j])[0]).toFixed(1)}`)
  )
  console.log('全6組のうち、いちばん近い組の色の差:')
  ;[['一般', null], ['P型（赤が見えにくい）', 'protan'], ['D型（緑が見えにくい）', 'deutan'], ['T型（青が見えにくい）', 'tritan']].forEach(
    ([label, t]) => {
      const { min, pair } = minDeltaE(colors, t)
      console.log(`  ${label}: ${min.toFixed(0)}（${pair}）`)
    }
  )
}

// このファイルを直に実行したときだけ表を出す（テストから読み込むときは何も出さない）
const invoked = process.argv[1] && process.argv[1].split('\\').join('/').endsWith('scripts/bracket-colors.mjs')
if (invoked) {
  const args = process.argv.slice(2)
  if (args.length === 4) report(args, '指定の4色')
  else {
    report(['#00427A', '#7A3800', '#3E8ED0', '#B87200'], '直す前（2026-08-27）')
    report(['#003368', '#4D2801', '#0074DE', '#A16900'], '直した後（2026-08-28）')
  }
}
