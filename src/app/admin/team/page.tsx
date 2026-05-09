import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Plus } from 'lucide-react'

const ROLE_STYLE: Record<string, string> = {
  admin:      'bg-red-50 text-red-700',
  technician: 'bg-blue-50 text-blue-700',
}

const ROLE_LABEL: Record<string, string> = {
  admin:      'Administrateur',
  technician: 'Technicien',
}

export default async function TeamPage() {
  const supabase      = await createClient()
  const supabaseAdmin = createAdminClient()

  const [{ data: profiles }, { data: { users } }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, phone, role')
      .in('role', ['admin', 'technician'])
      .order('full_name'),
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const emailMap = new Map(users.map((u) => [u.id, u.email ?? '']))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Équipe
        </h1>
        <Link
          href="/admin/team/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#BF0D0D' }}
        >
          <Plus size={16} />
          Inviter un membre
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Nom</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Email</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Téléphone</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Rôle</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(!profiles || profiles.length === 0) && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-gray-400">
                  Aucun membre dans l&apos;équipe
                </td>
              </tr>
            )}
            {profiles?.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4 font-medium text-gray-900">{p.full_name ?? '—'}</td>
                <td className="px-5 py-4 text-gray-600">{emailMap.get(p.id) ?? '—'}</td>
                <td className="px-5 py-4 text-gray-600">{p.phone ?? '—'}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ROLE_STYLE[p.role] ?? 'bg-gray-100 text-gray-500'}`}>
                    {ROLE_LABEL[p.role] ?? p.role}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/admin/team/${p.id}`}
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2"
                  >
                    Modifier
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
