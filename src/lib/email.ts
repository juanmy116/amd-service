type TemplateName = 'ticket_open' | 'ticket_assigned' | 'ticket_resolved' | 'csat' | 'raw'

interface SendEmailOptions {
  template: TemplateName
  to: string
  data?: Record<string, string>
}

export async function sendEmail({ template, to, data }: SendEmailOptions) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ template, to, data }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    console.error('[sendEmail]', err)
    return { error: err }
  }

  return res.json() as Promise<{ id: string }>
}
