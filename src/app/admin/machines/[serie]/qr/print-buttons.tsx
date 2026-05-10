'use client'

export default function PrintButtons() {
  return (
    <div className="no-print flex justify-center gap-3 p-6">
      <button
        onClick={() => window.print()}
        className="px-5 py-2.5 rounded-lg text-sm font-medium text-white"
        style={{ backgroundColor: '#BF0D0D' }}
      >
        Imprimer l&apos;étiquette
      </button>
      <button
        onClick={() => window.close()}
        className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200"
      >
        Fermer
      </button>
    </div>
  )
}
