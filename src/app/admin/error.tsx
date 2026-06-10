'use client'

// WP-5b (P2-4) — Error boundary del back-office. Cuando una página de /admin lanza ante un
// fallo TÉCNICO de lectura (query de Supabase con `error`), se muestra este aviso en vez de
// renderizar un listado vacío indistinguible de "no hay registros". El usuario puede reintentar.
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="px-4 py-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
        <p className="font-semibold">⛔ Erreur technique</p>
        <p className="mt-1">
          Impossible de charger les données (erreur de base de données). Les informations affichées
          pourraient être incomplètes, l&apos;affichage est donc bloqué. Réessayez ; si le problème
          persiste, prévenez un administrateur.
        </p>
        <button
          onClick={reset}
          className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Réessayer
        </button>
      </div>
    </div>
  )
}
