/**
 * LINE ユーザーの Supabase Auth アカウント管理ユーティリティ
 * LINE auth route と billing-sync API で共有
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type ValidRole = 'student' | 'teacher' | 'admin'

interface FindOrCreateResult {
  userId: string
  isNew: boolean
  error?: string
}

/**
 * LINE user ID から決定的なメールアドレスを生成
 */
export function deriveLineEmail(lineUserId: string): string {
  return `line_${lineUserId}@tsubame-srs.local`
}

/**
 * LINE user ID からパスワードを生成（HMAC-SHA256）
 */
export async function deriveLinePassword(lineUserId: string, authSecret: string): Promise<string> {
  const secret = new TextEncoder().encode(authSecret)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const passwordBytes = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(lineUserId)
  )
  return Array.from(new Uint8Array(passwordBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * LINE user ID で既存ユーザーを検索し、見つからなければ新規作成する
 *
 * @returns userId（Supabase Auth の UUID）と isNew フラグ
 */
export async function findOrCreateSRSUser(
  adminClient: SupabaseClient,
  lineUserId: string,
  name: string,
  role: ValidRole,
  authSecret: string,
): Promise<FindOrCreateResult> {
  const lineEmail = deriveLineEmail(lineUserId)
  const password = await deriveLinePassword(lineUserId, authSecret)

  // 1. メールでプロフィール検索（高速パス）
  const { data: existingProfile } = await adminClient
    .from('profiles')
    .select('id, name')
    .eq('email', lineEmail)
    .single()

  if (existingProfile) {
    // 名前が変わっていたら更新
    if (existingProfile.name !== name) {
      await adminClient
        .from('profiles')
        .update({ name })
        .eq('id', existingProfile.id)
    }
    return { userId: existingProfile.id, isNew: false }
  }

  // 2. metadata で検索（メールが変更された講師等のフォールバック）
  try {
    const { data: { users: allUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
    const existingUser = allUsers.find(
      (u) => u.user_metadata?.line_user_id === lineUserId
    )

    if (existingUser) {
      // 名前更新
      const { data: profile } = await adminClient
        .from('profiles')
        .select('id, name')
        .eq('id', existingUser.id)
        .single()
      if (profile && profile.name !== name) {
        await adminClient
          .from('profiles')
          .update({ name })
          .eq('id', profile.id)
      }
      return { userId: existingUser.id, isNew: false }
    }
  } catch (err) {
    console.error('[findOrCreateSRSUser] Metadata search failed:', err)
  }

  // 3. 新規ユーザー作成
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email: lineEmail,
    password,
    email_confirm: true,
    user_metadata: { line_user_id: lineUserId, name, role },
  })

  if (createError || !newUser?.user) {
    console.error('[findOrCreateSRSUser] Failed to create user:', createError)
    return { userId: '', isNew: false, error: createError?.message || 'Failed to create user' }
  }

  // プロフィール作成
  const { error: profileError } = await adminClient
    .from('profiles')
    .insert({
      id: newUser.user.id,
      email: lineEmail,
      name,
      role,
    })

  if (profileError) {
    console.error('[findOrCreateSRSUser] Failed to create profile:', profileError)
  }

  return { userId: newUser.user.id, isNew: true }
}

/**
 * ユーザーを無効化（ban_duration で永久バン）
 * Supabase Auth の updateUserById で ban_duration を設定する。
 * '24h', '72h' 等の期限付きバンも可能だが、ここでは永久バン('876000h' ≈ 100年)を使用。
 */
export async function banUser(adminClient: SupabaseClient, userId: string): Promise<void> {
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: '876000h',
  })
  if (error) {
    console.error('[banUser] Error:', error)
  }
}

/**
 * ユーザーの無効化を解除
 * ban_duration を 'none' にするとバンが解除される。
 */
export async function unbanUser(adminClient: SupabaseClient, userId: string): Promise<void> {
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: 'none',
  })
  if (error) {
    console.error('[unbanUser] Error:', error)
  }
}
