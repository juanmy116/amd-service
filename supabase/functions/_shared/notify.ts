const HOMESERVER = () => Deno.env.get('MATRIX_HOMESERVER_URL') ?? ''
const TOKEN      = () => Deno.env.get('MATRIX_ACCESS_TOKEN') ?? ''

export async function notifyMatrix(roomId: string, message: string): Promise<void> {
  const txnId = `amd-${Date.now()}`
  const url = `${HOMESERVER()}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`

  await fetch(url, {
    method:  'PUT',
    headers: {
      Authorization:  `Bearer ${TOKEN()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ msgtype: 'm.text', body: message }),
  }).catch(err => console.error('[notify] Matrix error:', err))
}

export async function notifyAdmin(message: string): Promise<void> {
  const adminRoom = Deno.env.get('MATRIX_ADMIN_ROOM_ID') ?? ''
  if (!adminRoom) return
  await notifyMatrix(adminRoom, message)
}

export async function notifyAlerts(message: string): Promise<void> {
  const alertsRoom = Deno.env.get('MATRIX_ROOM_ID') ?? ''
  if (!alertsRoom) return
  await notifyMatrix(alertsRoom, message)
}

export async function notifyEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? ''
  if (!apiKey) return

  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    'AMD Service <noreply@amd-service.com>',
      to:      [to],
      subject,
      html,
    }),
  }).catch(err => console.error('[notify] Resend error:', err))
}
