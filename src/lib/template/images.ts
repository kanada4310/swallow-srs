// 画像のオフライン表示ユーティリティ（Phase 13.4）
//
// カードは sandbox iframe（allow-same-origin なし＝opaque origin）で描画されるため、
// 親ドキュメントで作った blob: URL は iframe から参照できない。
// そこで画像は data: URL に変換して srcdoc に直接埋め込む（ネットワーク不要＝オフライン可）。
//
// このファイルは純粋関数（抽出・書き換え）を提供し、ユニットテスト可能にする。
// 実際の取得/キャッシュ（Dexie・fetch・FileReader）は呼び出し側で行う。

// <img ... src="URL"> の src を取り出す正規表現（シングル/ダブルクォート対応）
const IMG_SRC_RE = /(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+)(["'])/gi

/**
 * HTML 内の <img> の http(s) URL を重複なく抽出する。
 * data:/blob: などは対象外（既に埋め込み済み or 解決不要）。
 */
export function extractImageUrls(html: string): string[] {
  if (!html) return []
  const urls = new Set<string>()
  let m: RegExpExecArray | null
  IMG_SRC_RE.lastIndex = 0
  while ((m = IMG_SRC_RE.exec(html)) !== null) {
    const url = m[2]
    if (/^https?:\/\//i.test(url)) {
      urls.add(url)
    }
  }
  return Array.from(urls)
}

/**
 * <img> の src を urlMap に従って置き換える。
 * urlMap に無い URL はそのまま（オンラインなら http URL のまま表示される）。
 */
export function rewriteImageSrcs(html: string, urlMap: Map<string, string>): string {
  if (!html || urlMap.size === 0) return html
  IMG_SRC_RE.lastIndex = 0
  return html.replace(IMG_SRC_RE, (full, pre: string, url: string, post: string) => {
    const replacement = urlMap.get(url)
    return replacement ? `${pre}${replacement}${post}` : full
  })
}

/**
 * HTML に解決対象の <img> http(s) URL が含まれるか（安価な前判定）。
 */
export function hasRemoteImages(html: string): boolean {
  return extractImageUrls(html).length > 0
}

/**
 * Blob を data: URL に変換する（ブラウザ専用。FileReader 使用）。
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
