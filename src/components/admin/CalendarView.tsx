'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import frLocale from '@fullcalendar/core/locales/fr'
import { useRouter } from 'next/navigation'

export type CalEvent = {
  id:        string
  title:     string
  start:     string
  allDay:    boolean
  color:     string
  textColor: string
  href:      string
}

export default function AdminCalendarView({ events }: { events: CalEvent[] }) {
  const router = useRouter()

  const fcEvents = events.map(({ href, ...e }) => ({
    ...e,
    extendedProps: { href },
  }))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Leyenda */}
      <div className="flex flex-wrap gap-4 mb-5 text-xs text-gray-500">
        {[
          { color: '#3B82F6', label: 'Maintenance planifiée' },
          { color: '#EF4444', label: 'Maintenance en retard' },
          { color: '#D1D5DB', label: 'Maintenance réalisée' },
          { color: '#F97316', label: 'Incident SAV ouvert' },
          { color: '#A855F7', label: 'Incident assigné' },
          { color: '#F59E0B', label: 'Incident en cours' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>

      <FullCalendar
        plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
        locale={frLocale}
        initialView="dayGridMonth"
        headerToolbar={{
          left:   'prev,next today',
          center: 'title',
          right:  'dayGridMonth,dayGridWeek,listMonth',
        }}
        buttonText={{
          today: "Aujourd'hui",
          month: 'Mois',
          week:  'Semaine',
          list:  'Liste',
        }}
        events={fcEvents}
        height="auto"
        eventDisplay="block"
        dayMaxEvents={4}
        moreLinkText={(n) => `+${n} autres`}
        nowIndicator
        eventClick={(info) => {
          info.jsEvent.preventDefault()
          const href = info.event.extendedProps.href as string
          if (href) router.push(href)
        }}
        eventMouseEnter={(info) => {
          info.el.style.cursor = 'pointer'
        }}
      />
    </div>
  )
}
