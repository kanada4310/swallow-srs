import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/api/auth'
import { MAX_IMAGE_SIZE, SUPPORTED_IMAGE_TYPES } from '@/lib/constants'

// 画像アップロードAPI（Phase 13.4）
// TTS の Storage ロジックを流用。画像を Supabase Storage の images バケットへ保存し公開URLを返す。
// パスは noteId に依存せず {userId}/{uuid}.{ext}（ノート作成前でもアップロード可能にするため）。

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { image, imageType } = body as { image?: string; imageType?: string }

    if (!image || !imageType) {
      return NextResponse.json(
        { error: 'Missing required fields: image, imageType' },
        { status: 400 }
      )
    }

    if (!SUPPORTED_IMAGE_TYPES.includes(imageType)) {
      return NextResponse.json(
        { error: `Unsupported image type. Supported: ${SUPPORTED_IMAGE_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // base64 → binary。data URL プレフィックスが付いていれば剥がす。
    const base64Data = image.includes(',') ? image.split(',')[1] : image

    // base64 は元バイナリの約1.33倍
    const estimatedSize = (base64Data.length * 3) / 4
    if (estimatedSize > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: 'Image size exceeds 10MB limit' }, { status: 400 })
    }

    let buffer: Buffer
    try {
      buffer = Buffer.from(base64Data, 'base64')
    } catch {
      return NextResponse.json({ error: 'Invalid base64 image data' }, { status: 400 })
    }

    // Upload using service role (bypass RLS), mirroring /api/tts
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY for image upload')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Ensure images bucket exists
    const { data: buckets } = await adminClient.storage.listBuckets()
    const imagesBucketExists = buckets?.some((b) => b.name === 'images')
    if (!imagesBucketExists) {
      const { error: createBucketError } = await adminClient.storage.createBucket('images', {
        public: true,
        fileSizeLimit: 10485760, // 10MB
      })
      if (createBucketError) {
        console.error('Error creating images bucket:', createBucketError)
        return NextResponse.json(
          { error: `Failed to create images bucket: ${createBucketError.message}` },
          { status: 500 }
        )
      }
      console.log('Created images storage bucket')
    }

    const ext = EXT_BY_TYPE[imageType] || 'png'
    const fileName = `${user.id}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await adminClient.storage
      .from('images')
      .upload(fileName, buffer, {
        contentType: imageType,
        cacheControl: '31536000', // 1 year cache
      })

    if (uploadError) {
      console.error('Error uploading image:', JSON.stringify(uploadError))
      return NextResponse.json(
        { error: `Failed to upload image: ${uploadError.message}` },
        { status: 500 }
      )
    }

    const { data: publicUrlData } = adminClient.storage.from('images').getPublicUrl(fileName)

    return NextResponse.json({ success: true, imageUrl: publicUrlData.publicUrl })
  } catch (error) {
    console.error('Error in image upload API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
