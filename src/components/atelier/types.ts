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
