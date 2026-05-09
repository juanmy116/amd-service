import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import KanbanBoard from '@/components/admin/KanbanBoard'

export default async function IncidentsPage() {
  const supabase = await createClient()

  const { data: incidents } = await supabase
    .from('incidents')
    .select('id, title, category, priority, status, machine_id')
    .order('created_at', { ascending: false })

  return (
    <div className="p-8 flex flex-col min-h-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Incidents SAV
        </h1>
        <Link
          href="/admin/incidents/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#BF0D0D' }}
        >
          <Plus size={16} />
          Nouvel incident
        </Link>
      </div>

      <KanbanBoard incidents={incidents ?? []} />
    </div>
  )
}
