export interface PrincityEntry {
  [key: string]: string | number | boolean | null
}

export interface CursorFilter {
  key: string
  type: 'EQ' | 'IS_NULL' | 'IN' | 'GT' | 'LT' | 'GTE' | 'LTE' | 'NEQ'
  value?: string
}

export interface FetchConfig {
  cursorParams?: {
    offset?: number
    limit?: number
    filters?: CursorFilter[]
    orders?: Array<{ key: string; type: 'ASC' | 'DESC' }>
  }
  fieldIds: string[]
}

export class PrincityClient {
  private baseUrl: string
  private apiKey: string

  constructor(subdomain: string, apiKey: string) {
    if (!subdomain || !apiKey) throw new Error('PRINCITY_MISSING_CONFIG')
    this.baseUrl = `https://${subdomain}.princity.cloud/api`
    this.apiKey  = apiKey
  }

  async fetchAll(endpoint: string, config: FetchConfig): Promise<PrincityEntry[]> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)

    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'App-auth-key': this.apiKey,
        },
        body: JSON.stringify({
          cursorParams: {
            offset: 0,
            limit:  1000,
            ...config.cursorParams,
          },
          fieldIds: config.fieldIds,
        }),
        signal: controller.signal,
      })

      if (res.status === 401) throw new Error('PRINCITY_AUTH_FAILED')
      if (!res.ok) throw new Error(`PRINCITY_HTTP_${res.status}`)

      const data = await res.json() as { entries?: PrincityEntry[]; numberOfAll?: number }
      return data.entries ?? []
    } finally {
      clearTimeout(timer)
    }
  }
}

export function getPrincityClient(): PrincityClient {
  const subdomain = Deno.env.get('PRINCITY_SUBDOMAIN') ?? ''
  const apiKey    = Deno.env.get('PRINCITY_API_KEY') ?? ''
  return new PrincityClient(subdomain, apiKey)
}
