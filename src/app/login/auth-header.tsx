// Cabecera de las pantallas de acceso: login, «Mot de passe oublié» y «Nouveau mot de passe».
export function AuthHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 bg-accent">
        <span className="text-white font-bold text-lg font-display">A</span>
      </div>
      <h1 className="text-2xl font-semibold text-ink font-display">
        AMD Service
      </h1>
      <p className="text-sm text-ink-muted mt-1">{subtitle}</p>
    </div>
  )
}
