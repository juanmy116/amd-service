import TeamMemberForm from '@/components/admin/TeamMemberForm'
import { inviteMemberAction } from './actions'

export default function NewTeamMemberPage() {
  return <TeamMemberForm action={inviteMemberAction} title="Inviter un membre" />
}
