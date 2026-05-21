'use client'

import { useState, useOptimistic, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { updateIncidentStatusAction } from '@/app/admin/incidents/kanban-actions'
import { assignIncidentAction } from '@/app/atelier/actions'
import AssignPanel from './AssignPanel'
import type { AtelierIncident, Technician } from './types'

const COLUMNS = [
  { id: 'nouveau',  label: 'Nouveau',  dot: '#3B82F6' },
  { id: 'assigné',  label: 'Assigné',  dot: '#F59E0B' },
  { id: 'en_cours', label: 'En cours', dot: '#F97316' },
  { id: 'résolu',   label: 'Résolu',   dot: '#16A34A' },
] as const

const PRIORITY_STYLE: Record<string, string> = {
  basse:   'bg-white/10 text-white/70',
  normale: 'bg-info-soft text-info',
  haute:   'bg-warning-soft text-warning',
  urgente: 'bg-accent text-white',
}
const PRIORITY_LABEL: Record<string, string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente',
}

// ─── Card ──────────────────────────────────────────────────────────────────────

function IncidentCard({
  incident,
  draggingId,
  isOverlay = false,
  onOpen,
}: {
  incident: AtelierIncident
  draggingId?: string
  isOverlay?: boolean
  onOpen?: (incident: AtelierIncident) => void
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: incident.id,
    data: { status: incident.status },
    disabled: isOverlay,
  })

  const isDraggingThis = draggingId === incident.id && !isOverlay
  const style = !isOverlay && transform ? { transform: CSS.Translate.toString(transform) } : undefined

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
      onClick={() => { if (!isOverlay && onOpen) onOpen(incident) }}
      className={[
        'bg-white rounded-xl p-3.5 select-none',
        isDraggingThis ? 'opacity-30' : '',
        isOverlay
          ? 'shadow-2xl rotate-2 cursor-grabbing'
          : 'cursor-grab hover:ring-2 hover:ring-accent/40 transition-all',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs font-bold text-accent">{incident.numeroIncident}</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${PRIORITY_STYLE[incident.priority] ?? 'bg-neutral-soft text-ink-soft'}`}>
          {PRIORITY_LABEL[incident.priority] ?? incident.priority}
        </span>
      </div>
      <p className="text-base font-semibold text-ink leading-snug mt-1.5 line-clamp-2">{incident.title}</p>
      <p className="text-sm text-ink-muted mt-1">{incident.clientName ?? '—'}</p>
      <div className="mt-2.5 pt-2.5 border-t border-line-subtle">
        {incident.technicianName
          ? <span className="text-sm font-medium text-ink-soft">{incident.technicianName}</span>
          : <span className="text-sm font-bold text-accent">Sans technicien</span>}
      </div>
    </div>
  )
}

// ─── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  incidents,
  draggingId,
  onOpen,
}: {
  column: typeof COLUMNS[number]
  incidents: AtelierIncident[]
  draggingId?: string
  onOpen: (incident: AtelierIncident) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: column.dot }} />
          <span className="text-sm font-bold text-white uppercase tracking-wide">{column.label}</span>
        </div>
        <span className="text-xs font-bold text-white/50 bg-white/10 rounded-full px-2 py-0.5">
          {incidents.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={[
          'flex-1 rounded-xl p-2 space-y-2 overflow-y-auto border-2 transition-colors',
          isOver ? 'border-accent/50 bg-white/[0.04]' : 'border-white/[0.05] bg-white/[0.02]',
        ].join(' ')}
      >
        {incidents.map((inc) => (
          <IncidentCard key={inc.id} incident={inc} draggingId={draggingId} onOpen={onOpen} />
        ))}
        {incidents.length === 0 && !isOver && (
          <div className="flex items-center justify-center h-24 text-sm text-white/25">Vide</div>
        )}
      </div>
    </div>
  )
}

// ─── Board ─────────────────────────────────────────────────────────────────────

export default function AtelierKanban({
  incidents,
  technicians,
}: {
  incidents: AtelierIncident[]
  technicians: Technician[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [activeIncident, setActiveIncident] = useState<AtelierIncident | null>(null)
  const [selected, setSelected] = useState<AtelierIncident | null>(null)
  const [busy, setBusy] = useState(false)

  const [optimistic, updateOptimistic] = useOptimistic(
    incidents,
    (state, { id, newStatus }: { id: string; newStatus: string }) =>
      state.map((i) => (i.id === id ? { ...i, status: newStatus } : i))
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function onDragStart(event: DragStartEvent) {
    setActiveIncident(optimistic.find((i) => i.id === event.active.id) ?? null)
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveIncident(null)
    const { active, over } = event
    if (!over) return
    const newStatus = over.id as string
    const oldStatus = active.data.current?.status as string
    if (newStatus === oldStatus) return
    startTransition(async () => {
      updateOptimistic({ id: active.id as string, newStatus })
      const result = await updateIncidentStatusAction(active.id as string, oldStatus, newStatus)
      if (!result?.error) router.refresh()
    })
  }

  async function handleAssign(technicianId: string | null) {
    if (!selected) return
    setBusy(true)
    const result = await assignIncidentAction(selected.id, technicianId)
    setBusy(false)
    if (!result?.error) {
      setSelected(null)
      router.refresh()
    }
  }

  const byStatus = Object.fromEntries(
    COLUMNS.map((col) => [col.id, optimistic.filter((i) => i.status === col.id)])
  )

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 h-full">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              incidents={byStatus[col.id] ?? []}
              draggingId={activeIncident?.id}
              onOpen={setSelected}
            />
          ))}
        </div>
        <DragOverlay>
          {activeIncident && <IncidentCard incident={activeIncident} isOverlay />}
        </DragOverlay>
      </DndContext>

      <AssignPanel
        open={selected !== null}
        title={selected ? `${selected.numeroIncident} · ${selected.title}` : ''}
        subtitle="Assigner l'incident à"
        technicians={technicians}
        currentTechnicianId={selected?.technicianId ?? null}
        busy={busy}
        onSelect={handleAssign}
        onClose={() => setSelected(null)}
      />
    </>
  )
}
