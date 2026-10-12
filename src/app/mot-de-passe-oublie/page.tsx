import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { AuthHeader } from '../login/auth-header'
import ForgotPasswordForm from './form'

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-page">
      <div className="w-full max-w-md mx-auto">
        <AuthHeader subtitle="Mot de passe oublié" />
        <Card className="p-8">
          <p className="text-sm text-ink-soft mb-6">
            Indiquez l&apos;email de votre compte : nous vous envoyons un lien pour choisir un
            nouveau mot de passe.
          </p>
          <ForgotPasswordForm />
        </Card>
        <p className="text-center text-sm mt-6">
          <Link href="/login" className="text-ink-muted hover:text-accent transition-colors">
            ← Retour à la connexion
          </Link>
        </p>
      </div>
    </div>
  )
}
