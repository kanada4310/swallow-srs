import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import Link from 'next/link'

interface NoteTypeWithCount {
  id: string
  name: string
  owner_id: string | null
  fields: Array<{ name: string; ord: number }>
  is_system: boolean
  template_count: number
  created_at: string
}

async function getNoteTypes(): Promise<NoteTypeWithCount[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return []

  const { data: noteTypes } = await supabase
    .from('note_types')
    .select(`
      *,
      card_templates (id)
    `)
    .or(`is_system.eq.true,owner_id.eq.${user.id}`)
    .order('is_system', { ascending: false })
    .order('name')

  if (!noteTypes) return []

  return noteTypes.map(nt => ({
    ...nt,
    template_count: nt.card_templates?.length || 0,
  }))
}

export default async function NoteTypesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
    redirect('/')
  }

  const noteTypes = await getNoteTypes()

  const systemNoteTypes = noteTypes.filter(nt => nt.is_system)
  const customNoteTypes = noteTypes.filter(nt => !nt.is_system)

  return (
    <AppLayout userName={profile.name} userRole={profile.role}>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ノートタイプ管理</h1>
            <p className="text-sm text-gray-500 mt-1">
              カード表示用のテンプレートを管理します
            </p>
          </div>
          <Link
            href="/note-types/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新規作成
          </Link>
        </div>

        {/* System Note Types */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            システムノートタイプ
          </h2>
          <div className="space-y-3">
            {systemNoteTypes.map(noteType => (
              <NoteTypeCard key={noteType.id} noteType={noteType} isSystem />
            ))}
          </div>
        </section>

        {/* Custom Note Types */}
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
            </svg>
            カスタムノートタイプ
          </h2>
          {customNoteTypes.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-gray-500 mb-4">カスタムノートタイプがありません</p>
              <Link
                href="/note-types/new"
                className="inline-flex items-center gap-2 px-4 py-2 text-blue-600 hover:text-blue-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                新しいノートタイプを作成
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {customNoteTypes.map(noteType => (
                <NoteTypeCard key={noteType.id} noteType={noteType} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  )
}

function NoteTypeCard({ noteType, isSystem = false }: { noteType: NoteTypeWithCount; isSystem?: boolean }) {
  const fieldNames = noteType.fields.map(f => f.name).join(', ')

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900">{noteType.name}</h3>
            {isSystem && (
              <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                システム
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            フィールド: {fieldNames}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            テンプレート数: {noteType.template_count}
          </p>
        </div>
        <div className="flex gap-2">
          {isSystem ? (
            <Link
              href={`/note-types/${noteType.id}`}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              詳細を見る
            </Link>
          ) : (
            <>
              <Link
                href={`/note-types/${noteType.id}`}
                className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
              >
                編集
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
