import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

const ROLE_LABEL: Record<string, string> = {
  admin:      'Administrateur',
  technician: 'Technicien',
}

const ROLE_VARIANT: Record<string, BadgeVariant> = {
  admin:      'danger',
  technician: 'info',
}

export default async function TeamPage() {
  const supabase      = await createClient()
  const supabaseAdmin = createAdminClient()

  const [profilesRes, usersRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, phone, role')
      .in('role', ['admin', 'technician'])
      .order('full_name'),
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
  ])
  // WP-5b: un fallo técnico bloquea (boundary) en vez de crashear crudo (users.map sobre undefined).
  if (profilesRes.error) { console.error('[team] profiles', profilesRes.error); throw new Error('DATA_FETCH_ERROR') }
  if (usersRes.error) { console.error('[team] listUsers', usersRes.error); throw new Error('DATA_FETCH_ERROR') }
  const profiles = profilesRes.data
  const emailMap = new Map((usersRes.data.users ?? []).map((u) => [u.id, u.email ?? '']))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold font-display text-ink">
          Équipe
        </h1>
        <Link
          href="/admin/team/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-accent transition-opacity hover:opacity-90"
        >
          <Plus size={16} />
          Inviter un membre
        </Link>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className="text-left px-5 py-3.5 font-medium text-ink-muted">Nom</th>
              <th className="text-left px-5 py-3.5 font-medium text-ink-muted">Email</th>
              <th className="text-left px-5 py-3.5 font-medium text-ink-muted">Téléphone</th>
              <th className="text-left px-5 py-3.5 font-medium text-ink-muted">Rôle</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {(!profiles || profiles.length === 0) && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-ink-muted">
                  Aucun membre dans l&apos;équipe
                </td>
              </tr>
            )}
            {profiles?.map((p) => (
              <tr key={p.id} className="hover:bg-neutral-soft transition-colors">
                <td className="px-5 py-4 font-medium text-ink">{p.full_name ?? '—'}</td>
                <td className="px-5 py-4 text-ink-soft">{emailMap.get(p.id) ?? '—'}</td>
                <td className="px-5 py-4 text-ink-soft">{p.phone ?? '—'}</td>
                <td className="px-5 py-4">
                  <Badge variant={ROLE_VARIANT[p.role] ?? 'neutral'}>
                    {ROLE_LABEL[p.role] ?? p.role}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/admin/team/${p.id}`}
                    className="text-sm font-medium text-ink-soft hover:text-ink underline underline-offset-2"
                  >
                    Modifier
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
