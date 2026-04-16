/**
 * POST /api/admin/billing-sync
 *
 * billing システムからの一括同期エンドポイント。
 * 生徒アカウント・クラス・クラスメンバーを billing の状態にミラーリングする。
 *
 * 認証: SRS_AUTH_SECRET を Bearer トークンとして検証
 */
import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { findOrCreateSRSUser, banUser, unbanUser, deriveLineEmail } from '@/lib/auth/line-user'

// Request body types
interface SyncStudent {
  lineUserId: string
  name: string
  isActive: boolean
}

interface SyncClassTemplate {
  billingTemplateId: string
  name: string
  isActive: boolean
}

interface SyncRegistration {
  lineUserId: string
  billingTemplateId: string
  isActive: boolean
}

interface SyncRequest {
  students: SyncStudent[]
  classTemplates: SyncClassTemplate[]
  registrations: SyncRegistration[]
}

interface SyncSummary {
  students: { created: number; updated: number; banned: number; unbanned: number; errors: string[] }
  classes: { created: number; updated: number; deleted: number; errors: string[] }
  members: { added: number; removed: number; errors: string[] }
}

export async function POST(request: Request) {
  // 1. Authenticate with shared secret
  const authHeader = request.headers.get('authorization')
  const authSecret = process.env.SRS_AUTH_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!authSecret || !supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${authSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse request body
  let body: SyncRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.students || !body.classTemplates || !body.registrations) {
    return NextResponse.json({ error: 'Missing required fields: students, classTemplates, registrations' }, { status: 400 })
  }

  const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey)

  const summary: SyncSummary = {
    students: { created: 0, updated: 0, banned: 0, unbanned: 0, errors: [] },
    classes: { created: 0, updated: 0, deleted: 0, errors: [] },
    members: { added: 0, removed: 0, errors: [] },
  }

  // ============================
  // 3. Sync students
  // ============================
  // Build lineUserId → SRS userId map
  const lineToSrsId = new Map<string, string>()

  for (const student of body.students) {
    try {
      if (student.isActive) {
        const result = await findOrCreateSRSUser(
          adminClient,
          student.lineUserId,
          student.name,
          'student',
          authSecret,
        )

        if (result.error) {
          summary.students.errors.push(`${student.name}: ${result.error}`)
          continue
        }

        lineToSrsId.set(student.lineUserId, result.userId)

        if (result.isNew) {
          summary.students.created++
        } else {
          summary.students.updated++
        }

        // Ensure user is not banned (may have been previously banned and re-enrolled)
        await unbanUser(adminClient, result.userId)
      } else {
        // Inactive student — find and ban
        const lineEmail = deriveLineEmail(student.lineUserId)
        const { data: profile } = await adminClient
          .from('profiles')
          .select('id')
          .eq('email', lineEmail)
          .single()

        if (profile) {
          await banUser(adminClient, profile.id)
          summary.students.banned++
          // Still track the mapping for member cleanup
          lineToSrsId.set(student.lineUserId, profile.id)
        }
      }
    } catch (err) {
      summary.students.errors.push(`${student.name}: ${String(err)}`)
    }
  }

  // ============================
  // 4. Sync class templates → SRS classes
  // ============================
  // Build billingTemplateId → SRS class ID map
  const templateToClassId = new Map<string, string>()

  // Get all existing billing-synced classes
  const { data: existingClasses } = await adminClient
    .from('classes')
    .select('id, billing_template_id, name')
    .not('billing_template_id', 'is', null)

  const existingClassMap = new Map(
    (existingClasses || []).map(c => [c.billing_template_id, c])
  )

  for (const template of body.classTemplates) {
    try {
      const existing = existingClassMap.get(template.billingTemplateId)

      if (template.isActive) {
        if (existing) {
          // Update name if changed
          if (existing.name !== template.name) {
            await adminClient
              .from('classes')
              .update({ name: template.name })
              .eq('id', existing.id)
          }
          templateToClassId.set(template.billingTemplateId, existing.id)
          summary.classes.updated++
        } else {
          // Create new class (teacher_id = null for billing-synced classes)
          const { data: newClass, error } = await adminClient
            .from('classes')
            .insert({
              name: template.name,
              billing_template_id: template.billingTemplateId,
            })
            .select('id')
            .single()

          if (error || !newClass) {
            summary.classes.errors.push(`${template.name}: ${error?.message || 'Insert failed'}`)
            continue
          }

          templateToClassId.set(template.billingTemplateId, newClass.id)
          summary.classes.created++
        }
      } else {
        // Inactive — delete class and related data
        if (existing) {
          // Remove all members
          await adminClient
            .from('class_members')
            .delete()
            .eq('class_id', existing.id)

          // Remove all deck assignments for this class
          await adminClient
            .from('deck_assignments')
            .delete()
            .eq('class_id', existing.id)

          // Delete the class
          await adminClient
            .from('classes')
            .delete()
            .eq('id', existing.id)

          summary.classes.deleted++
        }
      }
    } catch (err) {
      summary.classes.errors.push(`${template.name}: ${String(err)}`)
    }
  }

  // ============================
  // 5. Sync registrations → class_members
  // ============================
  // Get all existing members for billing-synced classes
  const activeClassIds = Array.from(templateToClassId.values())
  const { data: existingMembers } = activeClassIds.length > 0
    ? await adminClient
        .from('class_members')
        .select('class_id, user_id')
        .in('class_id', activeClassIds)
    : { data: [] }

  const existingMemberSet = new Set(
    (existingMembers || []).map(m => `${m.class_id}:${m.user_id}`)
  )

  // Track which members should exist (for removal detection)
  const desiredMemberSet = new Set<string>()

  for (const reg of body.registrations) {
    try {
      const srsUserId = lineToSrsId.get(reg.lineUserId)
      const classId = templateToClassId.get(reg.billingTemplateId)

      if (!srsUserId || !classId) {
        // Skip if user or class doesn't exist in SRS
        continue
      }

      const memberKey = `${classId}:${srsUserId}`

      if (reg.isActive) {
        desiredMemberSet.add(memberKey)

        if (!existingMemberSet.has(memberKey)) {
          // Add new member
          const { error } = await adminClient
            .from('class_members')
            .insert({
              class_id: classId,
              user_id: srsUserId,
            })

          if (error) {
            // Ignore duplicate errors (may already exist from other sync)
            if (!error.message.includes('duplicate')) {
              summary.members.errors.push(`${reg.lineUserId}→${reg.billingTemplateId}: ${error.message}`)
            }
          } else {
            summary.members.added++
          }
        }
      }
      // isActive=false members are handled by the removal pass below
    } catch (err) {
      summary.members.errors.push(`${reg.lineUserId}→${reg.billingTemplateId}: ${String(err)}`)
    }
  }

  // Remove members that should no longer exist
  for (const existingKey of Array.from(existingMemberSet)) {
    if (!desiredMemberSet.has(existingKey)) {
      const [classId, userId] = existingKey.split(':')
      try {
        await adminClient
          .from('class_members')
          .delete()
          .eq('class_id', classId)
          .eq('user_id', userId)
        summary.members.removed++
      } catch (err) {
        summary.members.errors.push(`remove ${existingKey}: ${String(err)}`)
      }
    }
  }

  // ============================
  // 6. Return summary
  // ============================
  const hasErrors =
    summary.students.errors.length > 0 ||
    summary.classes.errors.length > 0 ||
    summary.members.errors.length > 0

  console.log('[billing-sync] Summary:', JSON.stringify(summary))

  return NextResponse.json(
    { success: !hasErrors, summary },
    { status: hasErrors ? 207 : 200 }
  )
}
