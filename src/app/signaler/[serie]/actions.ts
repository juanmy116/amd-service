'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/email'
import { validateIncidentPhoto, extensionForType, PHOTO_ERROR_MESSAGES, isSha256Hex } from '@/lib/incidentPhotos'

type State =
  | { error: string }
  | { rateLimited: true }
  | { success: true; numeroIncident: string }
  | null

function sanitizeText(raw: FormDataEntryValue | null, maxLen: number): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

function sanitizeDescription(raw: FormDataEntryValue | null): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 500)
}

function sanitizePhone(raw: FormDataEntryValue | null): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/[^\d\s+\-().]/g, '').trim().slice(0, 30)
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Paso previo (opcional) del flujo público: el navegador pide una URL firmada para subir la
// foto DIRECTO a Storage (sin pasar por la Server Action, que topa a 4,5 MB en Vercel). Es un
// endpoint ANÓNIMO → se protege con rate limit por IP+serie y validación de tipo/tamaño; el
// cron `cleanup-orphan-incident-photos` borra lo que nunca se asocie a una incidencia.
type PrepareState = { ok: true; path: string; token: string } | { error: string }

export async function preparePublicIncidentPhotoUploadAction(
  serie: string, hash: string, type: string, size: number
): Promise<PrepareState> {
  const cleanSerie = sanitizeText(serie, 100)
  if (!cleanSerie) return { error: 'Équipement non identifié.' }

  if (!isSha256Hex(hash)) return { error: 'Requête invalide.' }

  const valid = validateIncidentPhoto({ type, size })
  if (!valid.ok) return { error: PHOTO_ERROR_MESSAGES[valid.error] }

  const ip = await getClientIp()
  const ok = await checkRateLimit('public_photo_upload', `${ip}:${cleanSerie}`)
  if (!ok) return { error: 'Trop de tentatives. Réessayez plus tard.' }

  const ext = extensionForType(type)
  const now = new Date()
  // Path público (sin user.id; el flujo es anónimo). Determinista por hash.
  const path = `incidents/public/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${hash}.${ext}`

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from('incident-photos')
    .createSignedUploadUrl(path, { upsert: true })
  if (error || !data) {
    console.error('[signaler] prepare photo', error)
    return { error: "Erreur lors de la préparation de l'envoi." }
  }
  return { ok: true, path, token: data.token }
}

export async function submitPublicIncident(
  _prev: State,
  formData: FormData
): Promise<State> {
  const serie       = sanitizeText(formData.get('serie'), 100)
  const contactName = sanitizeText(formData.get('contact_name'), 100)
  const contactPhone = sanitizePhone(formData.get('contact_phone'))
  const contactEmail = sanitizeText(formData.get('contact_email'), 100)
  const description  = sanitizeDescription(formData.get('description'))

  if (!serie)        return { error: 'Équipement non identifié.' }
  if (!contactName)  return { error: 'Le nom est obligatoire.' }
  if (!contactPhone) return { error: 'Le numéro de téléphone est obligatoire.' }
  if (!description)  return { error: 'La description est obligatoire.' }

  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { error: "L'adresse email n'est pas valide." }
  }

  const ip = await getClientIp()
  const rlKey = `${ip}:${serie}`

  const [okHourly, okDaily] = await Promise.all([
    checkRateLimit('public_incident_hourly', rlKey),
    checkRateLimit('public_incident_daily', rlKey),
  ])

  if (!okHourly || !okDaily) {
    return { rateLimited: true }
  }

  const admin = createAdminClient()

  const { data: machine } = await admin
    .from('machines')
    .select('numero_serie, marque, modele')
    .eq('numero_serie', serie)
    .maybeSingle()

  if (!machine) return { error: 'Équipement non trouvé.' }

  const title = `Incident QR — ${machine.marque} ${machine.modele} (${serie})`

  const { data: incident, error: insertError } = await admin
    .from('incidents')
    .insert({
      machine_id:          serie,          // FK directa a machines, conservada para públicas
      contract_machine_id: null,           // por XOR — incidencias públicas no tienen línea
      opened_by:           null,
      title,
      description,
      category:      'panne',
      priority:      'normale',
      status:        'nouveau',
      contact_name:  contactName,
      contact_phone: contactPhone,
      contact_email: contactEmail || null,
      source:        'public',
    } as any)
    .select('id, numero_incident')
    .single()

  if (insertError || !incident) {
    console.error('[signaler] insert error', insertError)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  // Foto adjunta (opcional): el navegador ya la subió a Storage y nos pasa su ruta.
  // Validamos el patrón EXACTO que genera preparePublicIncidentPhotoUploadAction (no solo el
  // prefijo) para rechazar rutas arbitrarias. Si falla, no bloqueamos (la incidencia ya existe).
  const photoPath = sanitizeText(formData.get('photo_path'), 300)
  const PUBLIC_PHOTO_PATH = /^incidents\/public\/\d{4}\/\d{2}\/[0-9a-f]{64}\.(jpeg|png|webp)$/
  if (PUBLIC_PHOTO_PATH.test(photoPath)) {
    const { error: photoErr } = await admin.from('incident_photos').insert({
      incident_id: incident.id,
      uploaded_by: null,
      storage_path: photoPath,
    })
    if (photoErr) console.error('[signaler] photo', photoErr)
  }

  await sendEmail({
    template: 'raw',
    to: process.env.SAV_NOTIFY_EMAIL ?? 'savamdservice@gmail.com',
    data: {
      subject: `[SAV] Nouvel incident public — ${incident.numero_incident}`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
          <div style="background:#BF0D0D;padding:24px 32px;border-radius:12px 12px 0 0">
            <p style="color:#fff;font-weight:700;font-size:18px;margin:0">AMD Service</p>
            <p style="color:#ffcccc;font-size:13px;margin:6px 0 0">Nouvel incident signalé via QR</p>
          </div>
          <div style="padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr>
                <td style="padding:6px 0;color:#6b7280;width:130px">Référence</td>
                <td style="padding:6px 0;font-weight:700">${escapeHtml(incident.numero_incident)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6b7280">Équipement</td>
                <td style="padding:6px 0">${escapeHtml(machine.marque)} ${escapeHtml(machine.modele)} — <span style="color:#6b7280">${escapeHtml(serie)}</span></td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6b7280">Contact</td>
                <td style="padding:6px 0">${escapeHtml(contactName)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6b7280">Téléphone</td>
                <td style="padding:6px 0">${escapeHtml(contactPhone)}</td>
              </tr>
              ${contactEmail ? `<tr><td style="padding:6px 0;color:#6b7280">Email</td><td style="padding:6px 0">${escapeHtml(contactEmail)}</td></tr>` : ''}
            </table>
            <div style="margin-top:20px;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">
              <p style="margin:0 0 8px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Description</p>
              <p style="margin:0;font-size:14px;color:#374151;white-space:pre-wrap">${escapeHtml(description)}</p>
            </div>
          </div>
        </div>
      `,
    },
  })

  return { success: true, numeroIncident: incident.numero_incident }
}
