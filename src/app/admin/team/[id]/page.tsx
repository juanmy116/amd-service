import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import TeamMemberForm from '@/components/admin/TeamMemberForm'
import { updateMemberAction, deleteMemberAction } from './actions'

export default async function EditTeamMemberPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase      = await createClient()
  const supabaseAdmin = createAdminClient()

  const [{ data: profile }, { data: { user } }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, phone, role').eq('id', id).single(),
    supabaseAdmin.auth.admin.getUserById(id),
  ])

  if (!profile) notFound()

  const boundUpdateAction = updateMemberAction.bind(null, profile.id)

  return (
    <TeamMemberForm
      action={boundUpdateAction}
      defaultValues={profile}
      title={profile.full_name ?? 'Membre de l\'équipe'}
      isEdit
      email={user?.email}
      memberId={profile.id}
      deleteAction={deleteMemberAction}
    />
  )
}
