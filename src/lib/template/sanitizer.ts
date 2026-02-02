import DOMPurify from 'dompurify'

/**
 * 許可するHTMLタグ
 * カード表示に必要な基本的なタグのみ許可
 */
const ALLOWED_TAGS = [
  // 構造
  'div', 'span', 'p', 'br', 'hr',
  // テキスト装飾
  'b', 'i', 'u', 's', 'strong', 'em', 'mark', 'sub', 'sup',
  // リスト
  'ul', 'ol', 'li',
  // テーブル
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  // メディア
  'img', 'audio', 'source',
  // その他
  'ruby', 'rt', 'rp', // ルビ（ふりがな）
]

/**
 * 許可する属性
 */
const ALLOWED_ATTR = [
  'class', 'id', 'style',
  'src', 'alt', 'width', 'height', // 画像
  'controls', 'autoplay', 'type', // 音声
  'colspan', 'rowspan', // テーブル
]

/**
 * HTMLをサニタイズする
 * XSS攻撃を防ぐために、許可されていないタグや属性を除去
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') {
    // サーバーサイドではサニタイズをスキップ（クライアントで処理）
    // 注意: 実際の表示はクライアントで行われるため問題ない
    return html
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  })
}

/**
 * CSSをサニタイズする
 * 危険なプロパティを除去
 */
export function sanitizeCss(css: string): string {
  // 危険なCSSパターンを除去
  const dangerousPatterns = [
    /expression\s*\(/gi,          // IE expression
    /javascript\s*:/gi,           // javascript: URL
    /behavior\s*:/gi,             // IE behavior
    /-moz-binding\s*:/gi,         // Firefox XBL
    /url\s*\(\s*["']?javascript:/gi, // javascript in url()
    /@import/gi,                  // 外部CSS読み込み
  ]

  let sanitized = css
  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, '')
  }

  return sanitized
}
