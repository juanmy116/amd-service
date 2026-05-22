# Bloque 1d — Detalles y Formularios `/admin` · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar 5 componentes `*Form` y 2 páginas de detalle de `/admin` a los tokens de diseño Tailwind v4 y componentes de Fase 0, eliminando todos los `style={{...}}` inline y las clases hardcodeadas de color.

**Architecture:** Cambio puramente de presentación. No se toca lógica, queries, Server Actions ni validaciones. El patrón es uniforme: `bg-white` → `Card`, colores `gray-*` → tokens `ink-*`/`line-*`, rojo inline → `accent`, Poppins inline → `font-display`.

**Tech Stack:** Next.js App Router · Tailwind CSS v4 · componentes Fase 0 (`Card`, `Badge`, `PanelHeader`, `Button`/`buttonClasses`) en `src/components/ui/`

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/components/admin/ClientForm.tsx` | Tokens + Card |
| `src/components/admin/MachineForm.tsx` | Tokens + Card |
| `src/components/admin/ContractForm.tsx` | Tokens + Card |
| `src/components/admin/NewMaintenancePlanForm.tsx` | Tokens + Card |
| `src/components/admin/IncidentForm.tsx` | Tokens + Card + contexto |
| `src/app/admin/incidents/[id]/page.tsx` | Paneles inline → Card + Badge |
| `src/app/admin/maintenance/[id]/page.tsx` | Cards + PanelHeader + Badge + tabla |

---

## Task 1: ClientForm.tsx

**Files:**
- Modify: `src/components/admin/ClientForm.tsx`

- [ ] **Paso 1: Reemplazar el archivo completo**

Sustituir el contenido de `src/components/admin/ClientForm.tsx` por:

```tsx
'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'

type FormState = { error: string } | null

type ClientData = {
  nom_client?: string
  ninea?: string | null
  email?: string | null
  telephone?: string | null
  adresse?: string | null
  ville?: string | null
  active?: boolean
}

type Props = {
  action:        (prev: FormState, data: FormData) => Promise<FormState>
  defaultValues?: ClientData
  title:         string
  clientId?:     number
  deleteAction?: (formData: FormData) => Promise<void>
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function ClientForm({ action, defaultValues, title, clientId, deleteAction }: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="p-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/clients"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold text-ink font-display">
          {title}
        </h1>

        {/* Delete */}
        {deleteAction && clientId && (
          confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-soft flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-accent" />
                Confirmer ?
              </span>
              <form action={deleteAction} className="contents">
                <input type="hidden" name="id" value={clientId} />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-accent"
                >
                  Oui, supprimer
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-ink-soft border border-line hover:bg-neutral-soft"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-accent/20 text-sm font-medium text-accent bg-card hover:bg-accent-soft transition-colors"
            >
              <Trash2 size={15} />
              Supprimer
            </button>
          )
        )}
      </div>

      {/* Form */}
      <form action={formAction}>
        <Card className="p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
              {state.error}
            </div>
          )}

          {/* Row 1: nom + ninea */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Nom du client <span className="text-accent">*</span>
              </label>
              <input
                name="nom_client"
                type="text"
                required
                defaultValue={defaultValues?.nom_client}
                placeholder="Société ABC"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                NINEA <span className="text-accent">*</span>
              </label>
              <input
                name="ninea"
                type="text"
                required
                defaultValue={defaultValues?.ninea ?? ''}
                placeholder="00000000"
                className={inputClass}
              />
            </div>
          </div>

          {/* Row 2: email + telephone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Email <span className="text-accent">*</span>
              </label>
              <input
                name="email"
                type="email"
                required
                defaultValue={defaultValues?.email ?? ''}
                placeholder="contact@societe.sn"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Téléphone <span className="text-accent">*</span>
              </label>
              <input
                name="telephone"
                type="tel"
                required
                defaultValue={defaultValues?.telephone ?? ''}
                placeholder="+221 33 000 00 00"
                className={inputClass}
              />
            </div>
          </div>

          {/* Row 3: adresse */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Adresse <span className="text-accent">*</span>
            </label>
            <input
              name="adresse"
              type="text"
              required
              defaultValue={defaultValues?.adresse ?? ''}
              placeholder="Rue 10, Point E"
              className={inputClass}
            />
          </div>

          {/* Row 4: ville + statut */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Ville <span className="text-accent">*</span>
              </label>
              <input
                name="ville"
                type="text"
                required
                defaultValue={defaultValues?.ville ?? ''}
                placeholder="Dakar"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Statut</label>
              <label className="flex items-center gap-3 h-[42px] cursor-pointer">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={defaultValues?.active ?? true}
                  className="w-4 h-4 rounded accent-accent"
                />
                <span className="text-sm text-ink">Client actif</span>
              </label>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <Link
            href="/admin/clients"
            className="px-4 py-2.5 rounded-lg border border-line text-sm font-medium text-ink bg-card hover:bg-neutral-soft transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60 transition-opacity hover:opacity-90"
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Paso 2: Verificar tipos**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -30
```
Esperado: sin errores relativos a ClientForm.

- [ ] **Paso 3: Commit**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git add src/components/admin/ClientForm.tsx && git commit -m "refactor(1d): migrate ClientForm to design tokens"
```

---

## Task 2: MachineForm.tsx

**Files:**
- Modify: `src/components/admin/MachineForm.tsx`

- [ ] **Paso 1: Reemplazar el archivo completo**

Sustituir `src/components/admin/MachineForm.tsx` por:

```tsx
'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'

type FormState = { error: string } | null

type MachineData = {
  numero_serie?: string
  marque?: string
  modele?: string
  type?: 'color' | 'noir_blanc'
  localisation?: string | null
  active?: boolean
}

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  defaultValues?: MachineData
  title: string
  isEdit?: boolean
  machineId?: string
  deleteAction?: (formData: FormData) => Promise<void>
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const selectClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function MachineForm({ action, defaultValues, title, isEdit, machineId, deleteAction }: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="p-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/machines"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold text-ink font-display">
          {title}
        </h1>

        {/* Delete */}
        {deleteAction && machineId && (
          confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-soft flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-accent" />
                Confirmer ?
              </span>
              <form action={deleteAction} className="contents">
                <input type="hidden" name="serie" value={machineId} />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-accent"
                >
                  Oui, supprimer
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-ink-soft border border-line hover:bg-neutral-soft"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-accent/20 text-sm font-medium text-accent bg-card hover:bg-accent-soft transition-colors"
            >
              <Trash2 size={15} />
              Supprimer
            </button>
          )
        )}
      </div>

      {/* Form */}
      <form action={formAction}>
        <Card className="p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
              {state.error}
            </div>
          )}

          {/* Nº Série */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Numéro de série {!isEdit && <span className="text-accent">*</span>}
            </label>
            {isEdit ? (
              <div className="px-3.5 py-2.5 rounded-lg border border-line bg-neutral-soft text-sm text-ink-soft font-mono">
                {defaultValues?.numero_serie}
              </div>
            ) : (
              <input
                name="numero_serie"
                type="text"
                required
                defaultValue={defaultValues?.numero_serie}
                placeholder="W542J500806"
                className={`${inputClass} font-mono`}
              />
            )}
          </div>

          {/* Row: marque + modele */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Marque <span className="text-accent">*</span>
              </label>
              <input
                name="marque"
                type="text"
                required
                defaultValue={defaultValues?.marque}
                placeholder="Ricoh"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Modèle <span className="text-accent">*</span>
              </label>
              <input
                name="modele"
                type="text"
                required
                defaultValue={defaultValues?.modele}
                placeholder="Aficio MP C5502"
                className={inputClass}
              />
            </div>
          </div>

          {/* Row: type + localisation */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Type</label>
              <select
                name="type"
                defaultValue={defaultValues?.type ?? 'color'}
                className={selectClass}
              >
                <option value="color">Couleur</option>
                <option value="noir_blanc">Noir &amp; Blanc</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Localisation</label>
              <input
                name="localisation"
                type="text"
                defaultValue={defaultValues?.localisation ?? ''}
                placeholder="RDC, Bureau Comptabilité"
                className={inputClass}
              />
            </div>
          </div>

          {/* Statut */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Statut</label>
            <label className="flex items-center gap-3 h-[42px] cursor-pointer">
              <input
                name="active"
                type="checkbox"
                defaultChecked={defaultValues?.active ?? true}
                className="w-4 h-4 rounded accent-accent"
              />
              <span className="text-sm text-ink">Machine active</span>
            </label>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <Link
            href="/admin/machines"
            className="px-4 py-2.5 rounded-lg border border-line text-sm font-medium text-ink bg-card hover:bg-neutral-soft transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60 transition-opacity hover:opacity-90"
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Paso 2: Verificar tipos**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -30
```
Esperado: sin errores relativos a MachineForm.

- [ ] **Paso 3: Commit**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git add src/components/admin/MachineForm.tsx && git commit -m "refactor(1d): migrate MachineForm to design tokens"
```

---

## Task 3: ContractForm.tsx

**Files:**
- Modify: `src/components/admin/ContractForm.tsx`

- [ ] **Paso 1: Reemplazar el archivo completo**

Sustituir `src/components/admin/ContractForm.tsx` por:

```tsx
'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'

type FormState = { error: string } | null

type ContractData = {
  numero_contrat?: string
  client_id?: number
  machine_id?: string
  date_debut?: string
  date_renouvellement?: string | null
  lieu_installation?: string | null
  statut?: 'actif' | 'suspendu' | 'terminé'
}

type ClientOption = { id: number; nom_client: string }
type MachineOption = { numero_serie: string; marque: string; modele: string }

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  defaultValues?: ContractData
  clients: ClientOption[]
  machines: MachineOption[]
  title: string
  isEdit?: boolean
  contractId?: string
  deleteAction?: (formData: FormData) => Promise<void>
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const selectClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function ContractForm({
  action, defaultValues, clients, machines, title, isEdit, contractId, deleteAction,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="p-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/contracts"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold text-ink font-display">
          {title}
        </h1>

        {/* Delete */}
        {deleteAction && contractId && (
          confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-soft flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-accent" />
                Confirmer ?
              </span>
              <form action={deleteAction} className="contents">
                <input type="hidden" name="id" value={contractId} />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-accent"
                >
                  Oui, supprimer
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-ink-soft border border-line hover:bg-neutral-soft"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-accent/20 text-sm font-medium text-accent bg-card hover:bg-accent-soft transition-colors"
            >
              <Trash2 size={15} />
              Supprimer
            </button>
          )
        )}
      </div>

      {/* Form */}
      <form action={formAction}>
        <Card className="p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
              {state.error}
            </div>
          )}

          {/* Nº Contrat */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Numéro de contrat {!isEdit && <span className="text-accent">*</span>}
            </label>
            {isEdit ? (
              <div className="px-3.5 py-2.5 rounded-lg border border-line bg-neutral-soft text-sm text-ink-soft font-mono">
                {defaultValues?.numero_contrat}
              </div>
            ) : (
              <input
                name="numero_contrat"
                type="text"
                required
                defaultValue={defaultValues?.numero_contrat}
                placeholder="AMD-2026-001"
                className={`${inputClass} font-mono`}
              />
            )}
          </div>

          {/* Client + Machine */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Client <span className="text-accent">*</span>
              </label>
              <select
                name="client_id"
                required
                defaultValue={defaultValues?.client_id ?? ''}
                className={selectClass}
              >
                <option value="" disabled>Sélectionner...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom_client}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Machine <span className="text-accent">*</span>
              </label>
              <select
                name="machine_id"
                required
                defaultValue={defaultValues?.machine_id ?? ''}
                className={selectClass}
              >
                <option value="" disabled>Sélectionner...</option>
                {machines.map((m) => (
                  <option key={m.numero_serie} value={m.numero_serie}>
                    {m.marque} {m.modele} — {m.numero_serie}
                  </option>
                ))}
              </select>
              {!isEdit && machines.length === 0 && (
                <p className="text-xs text-warning mt-1.5">
                  Aucune machine disponible (toutes sont déjà assignées à un contrat actif).
                </p>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Date de début <span className="text-accent">*</span>
              </label>
              <input
                name="date_debut"
                type="date"
                required
                defaultValue={defaultValues?.date_debut ?? ''}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Date de renouvellement</label>
              <input
                name="date_renouvellement"
                type="date"
                defaultValue={defaultValues?.date_renouvellement ?? ''}
                className={inputClass}
              />
            </div>
          </div>

          {/* Lieu d'installation */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Lieu d&apos;installation</label>
            <input
              name="lieu_installation"
              type="text"
              defaultValue={defaultValues?.lieu_installation ?? ''}
              placeholder="Rue 10, Point E, Dakar"
              className={inputClass}
            />
          </div>

          {/* Statut */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Statut</label>
            <select
              name="statut"
              defaultValue={defaultValues?.statut ?? 'actif'}
              className={selectClass}
            >
              <option value="actif">Actif</option>
              <option value="suspendu">Suspendu</option>
              <option value="terminé">Terminé</option>
            </select>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <Link
            href="/admin/contracts"
            className="px-4 py-2.5 rounded-lg border border-line text-sm font-medium text-ink bg-card hover:bg-neutral-soft transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60 transition-opacity hover:opacity-90"
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Paso 2: Verificar tipos**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -30
```
Esperado: sin errores relativos a ContractForm.

- [ ] **Paso 3: Commit**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git add src/components/admin/ContractForm.tsx && git commit -m "refactor(1d): migrate ContractForm to design tokens"
```

---

## Task 4: NewMaintenancePlanForm.tsx

**Files:**
- Modify: `src/components/admin/NewMaintenancePlanForm.tsx`

- [ ] **Paso 1: Reemplazar el archivo completo**

Sustituir `src/components/admin/NewMaintenancePlanForm.tsx` por:

```tsx
'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft } from 'lucide-react'
import { Card } from '@/components/ui/Card'

type FormState = { error: string } | null

type ContractOption = {
  id: string
  numero_contrat: string
  clients:  { nom_client: string }
  machines: { marque: string; modele: string }
}

type Props = {
  action:    (prev: FormState, data: FormData) => Promise<FormState>
  contracts: ContractOption[]
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const selectClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function NewMaintenancePlanForm({ action, contracts }: Props) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <div className="p-8 max-w-2xl">

      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/maintenance"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <h1 className="text-2xl font-semibold text-ink font-display">
          Nouveau plan de maintenance
        </h1>
      </div>

      <form action={formAction} className="space-y-6">

        {state?.error && (
          <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
            {state.error}
          </div>
        )}

        <Card className="p-6 space-y-5">

          {/* Contrat */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Contrat <span className="text-accent">*</span>
            </label>
            <select
              name="contract_id"
              required
              defaultValue=""
              className={selectClass}
            >
              <option value="" disabled>Sélectionner un contrat...</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.numero_contrat} — {c.clients.nom_client} ({c.machines.marque} {c.machines.modele})
                </option>
              ))}
            </select>
            {contracts.length === 0 && (
              <p className="text-xs text-warning mt-1.5">
                Tous les contrats actifs ont déjà un plan de maintenance.
              </p>
            )}
          </div>

          {/* Fréquence */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Fréquence <span className="text-accent">*</span>
            </label>
            <select name="frequency" required defaultValue="mensuel" className={selectClass}>
              <option value="mensuel">Mensuel (toutes les 4 semaines)</option>
              <option value="trimestriel">Trimestriel (tous les 3 mois)</option>
            </select>
          </div>

          {/* Primera visita */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Date de la première visite <span className="text-accent">*</span>
            </label>
            <input
              name="first_visit"
              type="date"
              required
              className={inputClass}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Notes pour les techniciens
            </label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Points à vérifier, consignes particulières..."
              className={`${inputClass} resize-none`}
            />
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/admin/maintenance"
            className="px-4 py-2.5 rounded-lg border border-line text-sm font-medium text-ink bg-card hover:bg-neutral-soft transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending || contracts.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60 transition-opacity hover:opacity-90"
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            Créer le plan
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Paso 2: Verificar tipos**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -30
```
Esperado: sin errores relativos a NewMaintenancePlanForm.

- [ ] **Paso 3: Commit**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git add src/components/admin/NewMaintenancePlanForm.tsx && git commit -m "refactor(1d): migrate NewMaintenancePlanForm to design tokens"
```

---

## Task 5: IncidentForm.tsx

**Files:**
- Modify: `src/components/admin/IncidentForm.tsx`

- [ ] **Paso 1: Reemplazar el archivo completo**

Sustituir `src/components/admin/IncidentForm.tsx` por:

```tsx
'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'

type FormState = { error: string } | null

type IncidentData = {
  title?: string
  description?: string | null
  category?: string
  priority?: string
  status?: string
  assigned_to?: string | null
}

type ContractOption    = { id: string; numero_contrat: string; client_name: string }
type TechnicianOption  = { id: string; full_name: string | null }
type ContextInfo       = { clientName: string | null; machineName: string | null; contractNumber: string | null }

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  defaultValues?: IncidentData
  contracts?: ContractOption[]
  technicians: TechnicianOption[]
  title: string
  isEdit?: boolean
  incidentId?: string
  deleteAction?: (formData: FormData) => Promise<void>
  contextInfo?: ContextInfo
}

const CATEGORY_OPTIONS = [
  { value: 'panne',       label: 'Panne' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'consommable', label: 'Consommable' },
  { value: 'autre',       label: 'Autre' },
]

const PRIORITY_OPTIONS = [
  { value: 'basse',   label: 'Basse' },
  { value: 'normale', label: 'Normale' },
  { value: 'haute',   label: 'Haute' },
  { value: 'urgente', label: 'Urgente' },
]

const STATUS_OPTIONS = [
  { value: 'nouveau',  label: 'Nouveau' },
  { value: 'assigné',  label: 'Assigné' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'résolu',   label: 'Résolu' },
  { value: 'fermé',    label: 'Fermé' },
]

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const selectClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function IncidentForm({
  action, defaultValues, contracts, technicians, title,
  isEdit, incidentId, deleteAction, contextInfo,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="p-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/incidents"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold text-ink font-display truncate">
          {title}
        </h1>

        {deleteAction && incidentId && (
          confirming ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-ink-soft flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-accent" />
                Confirmer ?
              </span>
              <form action={deleteAction} className="contents">
                <input type="hidden" name="id" value={incidentId} />
                <button type="submit" className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-accent">
                  Oui, supprimer
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-ink-soft border border-line hover:bg-neutral-soft"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-accent/20 text-sm font-medium text-accent bg-card hover:bg-accent-soft transition-colors shrink-0"
            >
              <Trash2 size={15} />
              Supprimer
            </button>
          )
        )}
      </div>

      <form action={formAction}>
        <Card className="p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
              {state.error}
            </div>
          )}

          {isEdit && (
            <input type="hidden" name="old_status" value={defaultValues?.status ?? 'nouveau'} />
          )}

          {/* Titre */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Titre <span className="text-accent">*</span>
            </label>
            <input
              name="title"
              type="text"
              required
              defaultValue={defaultValues?.title}
              placeholder="Bourrage papier récurrent"
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Description</label>
            <textarea
              name="description"
              rows={3}
              defaultValue={defaultValues?.description ?? ''}
              placeholder="Décrivez le problème en détail..."
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Contrat — create only */}
          {!isEdit && contracts && (
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Contrat <span className="text-accent">*</span>
              </label>
              <select
                name="contract_id"
                required
                defaultValue=""
                className={selectClass}
              >
                <option value="" disabled>Sélectionner un contrat...</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero_contrat} — {c.client_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Context — edit only */}
          {isEdit && contextInfo && (
            <div className="grid grid-cols-3 gap-3 py-3 px-4 bg-neutral-soft rounded-lg border border-line">
              {[
                { label: 'Client',  value: contextInfo.clientName },
                { label: 'Machine', value: contextInfo.machineName },
                { label: 'Contrat', value: contextInfo.contractNumber },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs font-medium text-ink-muted mb-0.5">{label}</p>
                  <p className="text-sm text-ink-soft truncate">{value ?? '—'}</p>
                </div>
              ))}
            </div>
          )}

          {/* Catégorie + Priorité */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Catégorie</label>
              <select
                name="category"
                defaultValue={defaultValues?.category ?? 'panne'}
                className={selectClass}
              >
                {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Priorité</label>
              <select
                name="priority"
                defaultValue={defaultValues?.priority ?? 'normale'}
                className={selectClass}
              >
                {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Statut + Assigné à */}
          <div className={`grid gap-4 ${isEdit ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {isEdit && (
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1.5">Statut</label>
                <select
                  name="status"
                  defaultValue={defaultValues?.status ?? 'nouveau'}
                  className={selectClass}
                >
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Assigné à</label>
              <select
                name="assigned_to"
                defaultValue={defaultValues?.assigned_to ?? ''}
                className={selectClass}
              >
                <option value="">Non assigné</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name ?? t.id}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Commentaire — edit only */}
          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Commentaire
                <span className="ml-2 text-xs font-normal text-ink-muted">ajouté à l&apos;historique si le statut change</span>
              </label>
              <textarea
                name="comment"
                rows={2}
                placeholder="Ex : Technicien en déplacement, intervention prévue demain"
                className={`${inputClass} resize-none`}
              />
            </div>
          )}
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <Link
            href="/admin/incidents"
            className="px-4 py-2.5 rounded-lg border border-line text-sm font-medium text-ink bg-card hover:bg-neutral-soft transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60 transition-opacity hover:opacity-90"
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Paso 2: Verificar tipos**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -30
```
Esperado: sin errores relativos a IncidentForm.

- [ ] **Paso 3: Commit**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git add src/components/admin/IncidentForm.tsx && git commit -m "refactor(1d): migrate IncidentForm to design tokens"
```

---

## Task 6: incidents/[id]/page.tsx — paneles Contact, Rapport, Historique

**Files:**
- Modify: `src/app/admin/incidents/[id]/page.tsx`

- [ ] **Paso 1: Reemplazar el archivo completo**

Sustituir `src/app/admin/incidents/[id]/page.tsx` por:

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import IncidentForm from '@/components/admin/IncidentForm'
import { updateIncidentAction, deleteIncidentAction } from './actions'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

const STATUS_DOT: Record<string, string> = {
  nouveau:  'bg-blue-500',
  assigné:  'bg-purple-500',
  en_cours: 'bg-amber-500',
  résolu:   'bg-green-500',
  fermé:    'bg-gray-400',
}

const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export default async function EditIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: incident }, { data: technicians }] = await Promise.all([
    supabase.from('incidents').select('*').eq('id', id).single(),
    supabase.from('profiles').select('id, full_name').eq('role', 'technician').order('full_name'),
  ])

  if (!incident) notFound()

  // Context: contract → client + machine (contract_id puede ser null en incidentes públicos)
  const { data: contract } = incident.contract_id
    ? await supabase
        .from('contracts')
        .select('numero_contrat, clients(nom_client), machines(marque, modele)')
        .eq('id', incident.contract_id)
        .maybeSingle()
    : { data: null }

  const clientData  = contract?.clients  as unknown as { nom_client: string }      | null
  const machineData = contract?.machines as unknown as { marque: string; modele: string } | null

  const contextInfo = {
    clientName:     clientData?.nom_client ?? null,
    machineName:    machineData ? `${machineData.marque} ${machineData.modele}` : incident.machine_id,
    contractNumber: contract?.numero_contrat ?? null,
  }

  // History
  const { data: history } = await supabase
    .from('incident_history')
    .select('id, old_status, new_status, comment, created_at, changed_by')
    .eq('incident_id', id)
    .order('created_at', { ascending: false })

  let profileMap = new Map<string, string | null>()
  if (history && history.length > 0) {
    const ids = [...new Set(history.map((h) => h.changed_by))]
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids)
    profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) ?? [])
  }

  const boundUpdateAction = updateIncidentAction.bind(null, incident.id)

  return (
    <div>
      <IncidentForm
        action={boundUpdateAction}
        defaultValues={incident}
        technicians={technicians ?? []}
        title={`${incident.numero_incident} · ${incident.title}`}
        isEdit
        incidentId={incident.id}
        deleteAction={deleteIncidentAction}
        contextInfo={contextInfo}
      />

      {/* Contact public (incidente via QR sin autenticación) */}
      {incident.contact_name && (
        <div className="px-8 pb-4 max-w-3xl">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-ink">Contact</h2>
              <Badge variant="warning">Public</Badge>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-ink-muted w-24 shrink-0">Nom</span>
                <span className="text-ink font-medium">{incident.contact_name}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-ink-muted w-24 shrink-0">Téléphone</span>
                <a
                  href={`tel:${incident.contact_phone}`}
                  className="text-ink hover:underline"
                >
                  {incident.contact_phone}
                </a>
              </div>
              {incident.contact_email && (
                <div className="flex gap-2">
                  <span className="text-ink-muted w-24 shrink-0">Email</span>
                  <a
                    href={`mailto:${incident.contact_email}`}
                    className="text-ink hover:underline"
                  >
                    {incident.contact_email}
                  </a>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Rapport d'intervention */}
      {incident.rapport_intervention && (
        <div className="px-8 pb-4 max-w-3xl">
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-ink mb-3">Rapport d&apos;intervention</h2>
            <p className="text-sm text-ink-soft whitespace-pre-wrap">{incident.rapport_intervention}</p>
            {incident.autres_pieces && (
              <div className="mt-3 pt-3 border-t border-line-subtle">
                <p className="text-xs font-medium text-ink-muted mb-1">Autres pièces</p>
                <p className="text-sm text-ink-soft">{incident.autres_pieces}</p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Historique */}
      {history && history.length > 0 && (
        <div className="px-8 pb-8 max-w-3xl">
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-ink mb-5">Historique</h2>
            <div className="space-y-4">
              {history.map((h) => (
                <div key={h.id} className="flex gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[h.new_status] ?? 'bg-gray-400'}`} />
                  </div>
                  <div className="flex-1 pb-4 border-b border-line-subtle last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {h.old_status ? (
                        <span className="text-xs text-ink-muted">
                          {STATUS_LABEL[h.old_status] ?? h.old_status}
                          {' → '}
                          <span className="font-medium text-ink">{STATUS_LABEL[h.new_status] ?? h.new_status}</span>
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-ink">{STATUS_LABEL[h.new_status] ?? h.new_status}</span>
                      )}
                      <span className="text-xs text-ink-muted">·</span>
                      <span className="text-xs text-ink-muted">{profileMap.get(h.changed_by) ?? 'Système'}</span>
                      <span className="text-xs text-ink-muted">·</span>
                      <span className="text-xs text-ink-muted">{formatDateTime(h.created_at)}</span>
                    </div>
                    {h.comment && (
                      <p className="mt-1 text-xs text-ink-muted italic">{h.comment}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Paso 2: Verificar tipos**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -30
```
Esperado: sin errores en este archivo.

- [ ] **Paso 3: Commit**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git add src/app/admin/incidents/[id]/page.tsx && git commit -m "refactor(1d): migrate incident detail panels to design tokens"
```

---

## Task 7: maintenance/[id]/page.tsx — info cards, tabla, notas

**Files:**
- Modify: `src/app/admin/maintenance/[id]/page.tsx`

- [ ] **Paso 1: Reemplazar el archivo completo**

Sustituir `src/app/admin/maintenance/[id]/page.tsx` por:

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Wrench } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PanelHeader } from '@/components/ui/PanelHeader'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

const FREQ_LABEL: Record<string, string> = {
  mensuel:     'Mensuel',
  trimestriel: 'Trimestriel',
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  fait:      'success',
  planifié:  'info',
  en_retard: 'danger',
}

const STATUS_LABEL: Record<string, string> = {
  fait:      'Fait',
  planifié:  'Planifié',
  en_retard: 'En retard',
}

export default async function MaintenancePlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: plan } = await supabase
    .from('maintenance_plans')
    .select(`
      id, frequency, active, notes, created_at,
      contracts (
        id, numero_contrat,
        clients  ( nom_client ),
        machines ( numero_serie, marque, modele )
      ),
      maintenance_visits (
        id, scheduled_date, done_at, status, qr_verified, notes, matrix_notified,
        profiles ( full_name )
      )
    `)
    .eq('id', id)
    .single()

  if (!plan) notFound()

  const contract = plan.contracts as unknown as {
    id: string; numero_contrat: string
    clients:  { nom_client: string }
    machines: { numero_serie: string; marque: string; modele: string }
  }

  type Visit = {
    id: string; scheduled_date: string; done_at: string | null
    status: string; qr_verified: boolean; notes: string | null
    matrix_notified: boolean
    profiles: { full_name: string }[] | null
  }
  const visits = ((plan.maintenance_visits ?? []) as unknown as Visit[])
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))

  return (
    <div className="p-8 space-y-6 max-w-4xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/maintenance"
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-ink font-display">
            {contract.clients.nom_client}
          </h1>
          <p className="text-xs text-ink-muted">
            {contract.machines.marque} {contract.machines.modele} · {contract.numero_contrat}
          </p>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-ink-muted mb-1">Fréquence</p>
          <p className="text-sm font-semibold text-ink">{FREQ_LABEL[plan.frequency]}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-muted mb-1">Visites au total</p>
          <p className="text-sm font-semibold text-ink">{visits.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-muted mb-1">Faites</p>
          <p className="text-sm font-semibold text-success">
            {visits.filter(v => v.status === 'fait').length}
          </p>
        </Card>
      </div>

      {/* Notes */}
      {plan.notes && (
        <div className="bg-warning-soft border border-warning/30 rounded-card p-4 flex gap-3">
          <Wrench size={15} className="text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-ink">{plan.notes}</p>
        </div>
      )}

      {/* Historial visitas */}
      <Card className="overflow-hidden">
        <PanelHeader title="Historique des visites" />
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Date planifiée</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Statut</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Réalisée le</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Technicien</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">QR</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {visits.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-muted text-sm">
                  Aucune visite planifiée
                </td>
              </tr>
            )}
            {visits.map(v => {
              const variant = STATUS_BADGE[v.status as keyof typeof STATUS_BADGE] ?? 'info'
              const label   = STATUS_LABEL[v.status as keyof typeof STATUS_LABEL] ?? v.status
              return (
                <tr key={v.id} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-4 py-3.5 font-medium text-ink">
                    {new Date(v.scheduled_date).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge variant={variant}>{label}</Badge>
                  </td>
                  <td className="px-4 py-3.5 text-ink-soft">
                    {v.done_at
                      ? new Date(v.done_at).toLocaleDateString('fr-FR')
                      : <span className="text-ink-muted">—</span>
                    }
                  </td>
                  <td className="px-4 py-3.5 text-ink-soft">
                    {v.profiles?.[0]?.full_name ?? <span className="text-ink-muted">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    {v.qr_verified
                      ? <span className="text-xs text-success font-medium">✓ Vérifié</span>
                      : <span className="text-xs text-ink-muted">—</span>
                    }
                  </td>
                  <td className="px-4 py-3.5 text-ink-soft text-xs max-w-xs truncate">
                    {v.notes ?? <span className="text-ink-muted">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
```

- [ ] **Paso 2: Verificar tipos**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -30
```
Esperado: sin errores en este archivo.

- [ ] **Paso 3: Commit**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git add src/app/admin/maintenance/[id]/page.tsx && git commit -m "refactor(1d): migrate maintenance detail page to design tokens"
```

---

## Task 8: Build final + PR

- [ ] **Paso 1: Build completo**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npm run build 2>&1 | tail -20
```
Esperado: `Route (app)` sin errores de compilación.

- [ ] **Paso 2: Crear PR**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && gh pr create \
  --title "refactor: bloque 1d — detalles y formularios admin (design tokens)" \
  --body "$(cat <<'EOF'
## Summary

- Migra 5 componentes \`*Form\` y 2 páginas de detalle de \`/admin\` a los tokens de diseño Tailwind v4 y componentes de Fase 0
- Elimina todos los \`style={{ backgroundColor: '#BF0D0D' }}\` y \`style={{ fontFamily: 'Poppins' }}\` inline
- Sustituye \`bg-white rounded-xl border border-gray-200\` por el componente \`Card\`
- Migra colores \`gray-*\` a tokens \`ink-*\`/\`line-*\`, rojo a \`accent\`, amber a \`warning\`
- Cambio puramente de presentación: sin cambios en lógica, queries ni Server Actions

## Archivos modificados (7)

- \`ClientForm.tsx\`, \`MachineForm.tsx\`, \`ContractForm.tsx\`, \`NewMaintenancePlanForm.tsx\`, \`IncidentForm.tsx\`
- \`incidents/[id]/page.tsx\` — paneles Contact, Rapport, Historique
- \`maintenance/[id]/page.tsx\` — info cards, tabla de visitas, panel de notas

## Test plan

- [ ] Abrir \`/admin/clients/new\` y \`/admin/clients/[id]\` — formulario con tokens, sin rojo inline
- [ ] Abrir \`/admin/machines/new\` y \`/admin/machines/[serie]\` — campo de solo lectura con \`bg-neutral-soft\`
- [ ] Abrir \`/admin/contracts/new\` y \`/admin/contracts/[id]\` — aviso amber usa \`text-warning\`
- [ ] Abrir \`/admin/maintenance/new\` — sin cambios visuales notorios (misma UI, tokens internos)
- [ ] Abrir \`/admin/incidents/new\` y \`/admin/incidents/[id]\` — contexto en panel \`bg-neutral-soft\`, Historique con separadores \`border-line-subtle\`
- [ ] Abrir un incidente con contacto público — Badge "Public" naranja (variante \`warning\`)
- [ ] Abrir \`/admin/maintenance/[id]\` — info cards con \`Card\`, tabla de visitas con \`Badge\`, PanelHeader

🤖 Generated with Claude Code
EOF
)"
```

---

## Notas de implementación

- **No tocar** lógica, Server Actions, queries Supabase ni validaciones.
- **No tocar** los archivos `actions.ts` de ninguna ruta.
- El `STATUS_DOT` del historique en `incidents/[id]/page.tsx` **se mantiene** — los puntos de color (`bg-blue-500`, `bg-purple-500`, etc.) son indicadores funcionales, no tokens de diseño.
- `BadgeVariant` se importa directamente de `@/components/ui/Badge` — el archivo exporta el tipo.
- `font-display` es una clase Tailwind v4 válida (el token `--font-display` está en el bloque `@theme` de `globals.css`).
