import { Card } from '@/components/ui/Card'
import { AuthHeader } from '../login/auth-header'
import NewPasswordForm, { RelinkMessage } from './form'

// Destino del enlace del correo «Réinitialiser le mot de passe» (plantilla
// supabase/templates/recovery.html): /nouveau-mot-de-passe?token_hash=…&type=recovery.
// La página solo muestra el formulario; el enlace se canjea al enviarlo (ver actions.ts).
export default async function NewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>
}) {
  const { token_hash, type } = await searchParams
  const valid = Boolean(token_hash) && type === 'recovery'

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-page">
      <div className="w-full max-w-md mx-auto">
        <AuthHeader subtitle="Nouveau mot de passe" />
        <Card className="p-8">
          {valid
            ? <NewPasswordForm tokenHash={token_hash!} />
            : <RelinkMessage message="Ce lien n'est pas valide. Demandez-en un nouveau." />}
        </Card>
      </div>
    </div>
  )
}
