import { translateWithGemini } from '../server/gemini'

export const config = {
  maxDuration: 30,
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
}

type Req = {
  method?: string
  body?: {
    image?: string
    apiKey?: string
  }
}

type Res = {
  setHeader: (name: string, value: string) => void
  status: (code: number) => Res
  json: (body: unknown) => void
  end: (body?: string) => void
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST kerak' })
    return
  }

  try {
    const result = await translateWithGemini(String(req.body?.apiKey ?? ''), String(req.body?.image ?? ''))
    res.status(200).json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Tarjima muvaffaqiyatsiz'
    res.status(400).json({ error: message })
  }
}
