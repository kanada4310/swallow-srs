/**
 * Sanitize a `next=` redirect parameter to prevent open-redirect attacks.
 * Returns a same-origin relative path. Falls back to `/` for anything
 * that isn't a path starting with a single `/`.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return '/'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}
