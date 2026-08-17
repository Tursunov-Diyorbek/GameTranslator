import { translateWithGemini } from '../server/gemini'

export const config = {
  maxDuration: 30,
}

type Body = {
  image?: string
  apiKey?: string
}

async function readBody(req: Request | { body?: unknown; json?: () => Promise<unknown> }): Promise<Body> {
  if (typeof req.json === 'function') {
    const parsed = await req.json().catch(() => ({}))
    return (parsed ?? {}) as Body
  }
  const raw = (req as { body?: unknown }).body
  if (typeof raw === 'string') {
    return (raw ? JSON.parse(raw) : {}) as Body
  }
  return (raw ?? {}) as Body
}

async function runTranslate(body: Body) {
  const image = String(body.image ?? '')
  if (!image) throw new Error('Skrinshot topilmadi')
  return translateWithGemini(String(body.apiKey ?? ''), image)
}

export async function POST(request: Request) {
  try {
    const result = await runTranslate(await readBody(request))
    return Response.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Tarjima muvaffaqiyatsiz'
    return Response.json({ error: message }, { status: 400 })
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204 })
}

export default async function handler(
  req: { method?: string; body?: unknown; json?: () => Promise<unknown> },
  res?: {
    setHeader: (name: string, value: string) => void
    status: (code: number) => { json: (body: unknown) => void; end: (body?: string) => void }
    json: (body: unknown) => void
    end: (body?: string) => void
  },
) {
  if (res && typeof res.status === 'function') {
    try {
      if (req.method === 'OPTIONS') {
        res.status(204).end()
        return
      }
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'POST kerak' })
        return
      }
      const result = await runTranslate(await readBody(req))
      res.status(200).json(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Tarjima muvaffaqiyatsiz'
      res.status(400).json({ error: message })
    }
    return
  }

  const request = req as Request
  if (request.method === 'OPTIONS') return OPTIONS()
  if (request.method !== 'POST') {
    return Response.json({ error: 'POST kerak' }, { status: 405 })
  }
  return POST(request)
}
