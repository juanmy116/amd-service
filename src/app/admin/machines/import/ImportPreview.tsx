'use client'

import { useState, useTransition, useActionState, startTransition, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/Button'
import { MAX_ROWS } from '@/lib/csv-import'
import { previewCsvAction, importCsvAction, type PreviewState } from './actions'

export default function ImportPreview() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, formAction, isPending] = useActionState<PreviewState | null, FormData>(
    previewCsvAction,
    null
  )
  const [isImporting, startImport] = useTransition()
  const [importError, setImportError] = useState<string | null>(null)

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setImportError(null)
    if (f) {
      const fd = new FormData()
      fd.append('csv', f)
      startTransition(() => {
        formAction(fd)
      })
    }
  }

  const handleImport = () => {
    if (!file) return
    setImportError(null)
    startImport(async () => {
      const fd = new FormData()
      fd.append('csv', file)
      const res = await importCsvAction(fd)
      if (res.error) {
        setImportError(res.error)
      } else {
        router.push(`/admin/machines?imported=${res.inserted}&skipped=${res.skipped}`)
      }
    })
  }

  const insertableCount = preview?.insertableCount ?? 0

  return (
    <div className="space-y-6">
      <Card className="p-8">
        <label className="flex flex-col items-center justify-center gap-3 cursor-pointer">
          <Upload size={36} className="text-ink-muted" />
          <span className="text-sm text-ink-soft">Sélectionnez un fichier CSV</span>
          <span className="text-xs text-ink-muted text-center">
            Colonnes requises: numero_serie, marque, modele, type (color | noir_blanc)
            <br />
            Optionnelle: localisation
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
        {file && (
          <p className="mt-4 text-center text-sm text-ink">
            <strong>{file.name}</strong> ({Math.round(file.size / 1024)} Ko)
          </p>
        )}
      </Card>

      {isPending && (
        <Card className="p-6">
          <p className="text-sm text-ink-soft text-center">Analyse en cours…</p>
        </Card>
      )}

      {preview?.fatalError && (
        <Card className="p-4 bg-warning-soft">
          <p className="text-sm text-warning">{preview.fatalError}</p>
        </Card>
      )}

      {preview && preview.missingColumns.length > 0 && (
        <Card className="p-4 bg-accent-soft">
          <p className="text-sm text-accent font-semibold">Colonnes manquantes:</p>
          <ul className="mt-2 text-sm text-accent list-disc pl-5">
            {preview.missingColumns.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </Card>
      )}

      {preview && preview.truncated && (
        <Card className="p-4 bg-warning-soft">
          <p className="text-sm text-warning">
            Le fichier dépasse la limite par import: seules les {MAX_ROWS} premières lignes
            sont prises en compte. Découpez le CSV en plusieurs fichiers pour tout importer.
          </p>
        </Card>
      )}

      {preview && preview.errors.length > 0 && (
        <Card className="p-4 bg-accent-soft">
          <p className="text-sm text-accent font-semibold">
            {preview.errors.length} ligne{preview.errors.length > 1 ? 's' : ''} avec erreur:
          </p>
          <ul className="mt-2 text-sm text-accent list-disc pl-5 max-h-48 overflow-y-auto">
            {preview.errors.slice(0, 20).map((e, i) => {
              const location = e.row > 0
                ? `Ligne ${e.row}${e.field ? ` (${e.field})` : ''}`
                : 'Fichier'
              return (
                <li key={i}>
                  {location}: {e.message}
                </li>
              )
            })}
            {preview.errors.length > 20 && (
              <li className="text-ink-muted italic">
                … et {preview.errors.length - 20} autres
              </li>
            )}
          </ul>
        </Card>
      )}

      {preview && preview.rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-line">
            <h2 className="font-display font-semibold text-ink">
              Aperçu — {preview.rows.length} ligne{preview.rows.length > 1 ? 's' : ''} valide{preview.rows.length > 1 ? 's' : ''}
              {preview.duplicatesInDb.length > 0 && (
                <span className="ml-2 text-sm font-normal text-ink-soft">
                  ({preview.duplicatesInDb.length} déjà existant{preview.duplicatesInDb.length > 1 ? 's' : ''})
                </span>
              )}
            </h2>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-neutral-soft sticky top-0">
                <tr>
                  <Th>Nº série</Th>
                  <Th>Marque</Th>
                  <Th>Modèle</Th>
                  <Th>Type</Th>
                  <Th>Localisation</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 50).map((r) => {
                  const isDup = preview.duplicatesInDb.includes(r.numero_serie)
                  return (
                    <tr key={r.numero_serie} className="border-t border-line">
                      <td className="px-4 py-2 font-mono text-xs">{r.numero_serie}</td>
                      <td className="px-4 py-2">{r.marque}</td>
                      <td className="px-4 py-2">{r.modele}</td>
                      <td className="px-4 py-2">{r.type === 'color' ? 'Couleur' : 'N & B'}</td>
                      <td className="px-4 py-2">
                        {r.localisation ?? <span className="text-ink-muted italic">–</span>}
                      </td>
                      <td className="px-4 py-2">
                        {isDup ? (
                          <Badge variant="warning">Déjà existant</Badge>
                        ) : (
                          <Badge variant="success">Nouveau</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {preview.rows.length > 50 && (
              <p className="px-4 py-2 text-xs text-ink-muted italic border-t border-line">
                … et {preview.rows.length - 50} ligne{preview.rows.length - 50 > 1 ? 's' : ''} supplémentaire{preview.rows.length - 50 > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </Card>
      )}

      {importError && (
        <Card className="p-4 bg-accent-soft">
          <p className="text-sm text-accent">{importError}</p>
        </Card>
      )}

      {preview?.ok && insertableCount > 0 && (
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/admin/machines')}
            className={buttonClasses('ghost')}
            disabled={isImporting}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={isImporting}
            className={`${buttonClasses('primary')} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <CheckCircle2 size={16} />
            {isImporting
              ? 'Import en cours…'
              : `Importer ${insertableCount} machine${insertableCount > 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-2 font-semibold text-ink-muted text-xs uppercase tracking-wider">
      {children}
    </th>
  )
}
