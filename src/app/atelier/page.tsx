import { requireDispatcher } from '@/lib/auth'
import AtelierHeader from '@/components/atelier/AtelierHeader'
import AtelierBoard from '@/components/atelier/AtelierBoard'
import { getBoardData } from './data'

export const dynamic = 'force-dynamic'

/**
 * Kiosko de taller, vista carte: pannes | carte de Dakar | maintenances.
 * La vista kanban (arrastrar y soltar) vive en `/atelier/kanban`.
 */
export default async function AtelierPage() {
  await requireDispatcher()

  const now = new Date()
  const { incidents, maintenances, quartiers, technicians, kpis } = await getBoardData(now)

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <AtelierHeader kpis={kpis} view="carte" />
      <AtelierBoard
        incidents={incidents}
        maintenances={maintenances}
        quartiers={quartiers}
        technicians={technicians}
        today={now.toISOString().slice(0, 10)}
        serverNow={now.toISOString()}
      />
    </div>
  )
}
