'use client'

import { useState, useOptimistic, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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

export type KanbanIncident = {
  id: string
  title: string
  machine_id: string
  category: string
  priority: string
  status: string
}

const COLUMNS = [
  { id: 'nouveau',  label: 'Nouveau',  dot: 'bg-blue-500' },
  { id: 'assigné',  label: 'Assigné',  dot: 'bg-purple-500' },
  { id: 'en_cours', label: 'En cours', dot: 'bg-amber-500' },
  { id: 'résolu',   label: 'Résolu',   dot: 'bg-green-500' },
  { id: 'fermé',    label: 'Fermé',    dot: 'bg-gray-400' },
] as const

const PRIORITY_STYLE: Record<string, string> = {
  basse:   'bg-gray-100 text-gray-500',
  normale: 'bg-blue-50 text-blue-600',
  haute:   'bg-orange-50 text-orange-700',
  urgente: 'bg-red-50 text-red-700',
}
const PRIORITY_LABEL: Record<string, string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente',
}
const CATEGORY_LABEL: Record<string, string> = {
  panne: 'Panne', maintenance: 'Maintenance', consommable: 'Consommable', autre: 'Autre',
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function IncidentCard({
  incident,
  draggingId,
  isOverlay = false,
}: {
  incident: KanbanIncident
  draggingId?: string
  isOverlay?: boolean
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
      className={[
        'bg-white rounded-lg border border-gray-200 p-3.5 select-none',
        isDraggingThis  ? 'opacity-30' : '',
        isOverlay       ? 'shadow-2xl rotate-1 cursor-grabbing' : 'cursor-grab hover:shadow-sm hover:border-gray-300 transition-all',
      ].join(' ')}
    >
      <p className="text-sm font-medium text-gray-900 leading-snug mb-2 line-clamp-2">
        {incident.title}
      </p>
      <p className="font-mono text-xs text-gray-400 mb-3">{incident.machine_id}</p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`shrink-0 inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLE[incident.priority] ?? 'bg-gray-100 text-gray-500'}`}>
            {PRIORITY_LABEL[incident.priority] ?? incident.priority}
          </span>
          <span className="text-xs text-gray-400 truncate">
            {CATEGORY_LABEL[incident.category] ?? incident.category}
          </span>
        </div>
        {!isOverlay && (
          <Link
            href={`/admin/incidents/${incident.id}`}
            className="shrink-0 text-xs text-gray-300 hover:text-gray-600 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            →
          </Link>
        )}
      </div>
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  incidents,
  draggingId,
}: {
  column: typeof COLUMNS[number]
  incidents: KanbanIncident[]
  draggingId?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div className="flex-shrink-0 w-[272px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${column.dot}`} />
          <span className="text-sm font-semibold text-gray-700">{column.label}</span>
        </div>
        <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
          {incidents.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={[
          'flex-1 min-h-[520px] rounded-xl p-2.5 space-y-2 border-2 border-dashed transition-colors duration-150',
          isOver ? 'border-gray-400 bg-gray-100' : 'border-transparent bg-gray-50',
        ].join(' ')}
      >
        {incidents.map((inc) => (
          <IncidentCard key={inc.id} incident={inc} draggingId={draggingId} />
        ))}
        {incidents.length === 0 && !isOver && (
          <div className="flex items-center justify-center h-20 text-xs text-gray-300">
            Aucun incident
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Board ────────────────────────────────────────────────────────────────────

export default function KanbanBoard({ incidents: initialIncidents }: { incidents: KanbanIncident[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [activeIncident, setActiveIncident] = useState<KanbanIncident | null>(null)

  const [optimisticIncidents, updateOptimistic] = useOptimistic(
    initialIncidents,
    (state, { id, newStatus }: { id: string; newStatus: string }) =>
      state.map((inc) => (inc.id === id ? { ...inc, status: newStatus } : inc))
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function onDragStart(event: DragStartEvent) {
    setActiveIncident(optimisticIncidents.find((i) => i.id === event.active.id) ?? null)
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

  const byStatus = Object.fromEntries(
    COLUMNS.map((col) => [col.id, optimisticIncidents.filter((i) => i.status === col.id)])
  )

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            incidents={byStatus[col.id] ?? []}
            draggingId={activeIncident?.id}
          />
        ))}
      </div>
      <DragOverlay>
        {activeIncident && <IncidentCard incident={activeIncident} isOverlay />}
      </DragOverlay>
    </DndContext>
  )
}
