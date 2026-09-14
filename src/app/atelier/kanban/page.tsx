import { requireDispatcher } from '@/lib/auth'
import AtelierHeader from '@/components/atelier/AtelierHeader'
import AtelierKanban from '@/components/atelier/AtelierKanban'
import AtelierMaintenanceWeek from '@/components/atelier/AtelierMaintenanceWeek'
import AutoRefresh from '@/components/atelier/AutoRefresh'
import { getKanbanData } from '../data'

export const dynamic = 'force-dynamic'

/**
 * Kiosko de taller, vista kanban: la de siempre, con arrastrar y soltar para cambiar el estado.
 * Se conserva tal cual al rediseñar el kiosko; la vista carte está en `/atelier`.
 */
export default async function AtelierKanbanPage() {
  await requireDispatcher()

  const { incidents, visits, weekDates, technicians, kpis } = await getKanbanData()

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <AutoRefresh intervalMs={30000} />
      <AtelierHeader kpis={kpis} view="kanban" />

      <section className="flex flex-[1.6] flex-col min-h-0">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/30">Incidents SAV</p>
        <div className="flex-1 min-h-0">
          <AtelierKanban incidents={incidents} technicians={technicians} />
        </div>
      </section>

      <section className="flex flex-[0.9] flex-col min-h-0">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/30">
          Maintenances — cette semaine
        </p>
        <div className="flex-1 min-h-0">
          <AtelierMaintenanceWeek visits={visits} weekDates={weekDates} technicians={technicians} />
        </div>
      </section>
    </div>
  )
}
