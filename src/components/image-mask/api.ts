// 画像マスキングのクライアント側API呼び出し（単一作成・一括作成で共有）

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** 画像をアップロードして公開URLを返す（失敗時は throw） */
export async function uploadImage(dataUrl: string, imageType: string): Promise<string> {
  const resp = await fetch('/api/images/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl, imageType }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || !data.imageUrl) {
    throw new Error(data.error || '画像アップロードに失敗しました')
  }
  return data.imageUrl as string
}

export interface DetectResult {
  ok: boolean
  candidates: Array<{ text: string; x: number; y: number; w: number; h: number; recommended?: boolean }>
  warnings: string[]
  source: string | null
  error?: string
}

/** AIでマスク候補を検出（失敗しても throw せず ok:false で返す） */
export async function detectCandidates(dataUrl: string, imageType: string): Promise<DetectResult> {
  try {
    const resp = await fetch('/api/image-mask-candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, imageType }),
    })
    const data = await resp.json().catch(() => ({}))
    return {
      ok: resp.ok,
      candidates: Array.isArray(data.candidates) ? data.candidates : [],
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
      source: typeof data.source === 'string' ? data.source : null,
      error: resp.ok ? undefined : data.error || `HTTP ${resp.status}`,
    }
  } catch (e) {
    return { ok: false, candidates: [], warnings: [], source: null, error: String(e) }
  }
}
