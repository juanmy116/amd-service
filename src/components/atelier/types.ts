export type Technician = {
  id: string
  fullName: string
}

export type AtelierIncident = {
  id: string
  numeroIncident: string
  title: string
  status: string
  priority: string
  clientName: string | null
  technicianId: string | null
  technicianName: string | null
  /** Descripción del problema (para dar contexto al despachador al asignar). */
  description: string | null
  /** URL firmada de la foto adjunta por el cliente, o null si no hay. */
  photoUrl: string | null
}

export type AtelierMaintenanceVisit = {
  id: string
  scheduledDate: string
  clientName: string
  machineLabel: string
  status: string
  technicianId: string | null
  technicianName: string | null
}

export type AtelierKpis = {
  sansAssigner: number
  enCours: number
  urgentes: number
  resolusSemaine: number
}
