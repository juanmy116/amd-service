import LoginForm from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const { message } = await searchParams

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-page">
      <div className="w-full max-w-sm space-y-4">
        {message === 'confirm-email' && (
          <div className="rounded-xl border border-info/20 bg-info-soft px-4 py-3 text-sm text-ink">
            Vérifiez votre boîte email et cliquez sur le lien de confirmation pour activer votre compte.
          </div>
        )}
        <LoginForm />
      </div>
    </div>
  )
}
