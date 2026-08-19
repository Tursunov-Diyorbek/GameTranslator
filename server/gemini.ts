export type TranslatePayload = {
  original: string
  translation: string
  note: string
}

const FAST_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash']

const PROMPT = `Skrinshotdagi matnni o'zbekchaga tarjima qil.
Har bir qator va joylashuvni saqla. Birlashtirma. Nomlarni asl holda qoldir.
JSON: {"original":["qator1"],"translation":["tarjima1"],"note":"..."}
note: tarjimani takrorlama. Shu matn o'yinda nima ekanini 1-2 jumlada tushuntir (masalan, vazifa, ogohlantirish, buyum tavsifi, dialog).`

type GeminiErrorBody = {
  error?: { message?: string }
}

type GeminiOkBody = GeminiErrorBody & {
  output_text?: string
  steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

type RouteKind = 'google' | 'interactions'

type Route = {
  kind: RouteKind
  model: string
}

let cachedRoute: Route | null = null

function cleanKey(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^GEMINI_API_KEY\s*=\s*/i, '')
    .replace(/^["']+|["']+$/g, '')
    .trim()
}

function asLines(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((line) => String(line ?? '').replace(/\s+$/g, '')).join('\n').trim()
  }
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .trim()
}

function extractJson(text: string): TranslatePayload {
  const trimmed = text.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  const raw = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed
  const parsed = JSON.parse(raw) as Record<string, unknown>
  return {
    original: asLines(parsed.original),
    translation: asLines(parsed.translation),
    note: asLines(parsed.note).replace(/\n+/g, ' '),
  }
}

function responseText(body: GeminiOkBody): string {
  if (typeof body.output_text === 'string' && body.output_text.trim()) return body.output_text
  const parts: string[] = []
  for (const step of body.steps ?? []) {
    if (step.type === 'thought') continue
    for (const part of step.content ?? []) {
      if (part.text) parts.push(part.text)
    }
  }
  if (parts.length) return parts.join('')
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
}

async function readBody(res: Response): Promise<GeminiOkBody> {
  const raw = await res.text()
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as GeminiOkBody
  } catch {
    return { error: { message: raw.slice(0, 280) } }
  }
}

async function postJson(
  url: string,
  apiKey: string,
  payload: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<TranslatePayload> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  })
  const body = await readBody(res)
  if (!res.ok) throw new Error(body.error?.message || `Tarjima xatosi (${res.status})`)
  const text = responseText(body)
  if (!text) throw new Error('AI javob qaytarmadi')
  return extractJson(text)
}

function googlePayload(base64: string): Record<string, unknown> {
  return {
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inlineData: { mimeType: 'image/jpeg', data: base64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 400,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0, thinkingLevel: 'MINIMAL' },
    },
  }
}

async function callRoute(route: Route, apiKey: string, base64: string): Promise<TranslatePayload> {
  if (route.kind === 'interactions') {
    return postJson(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      apiKey,
      {
        model: route.model,
        input: [
          { type: 'text', text: PROMPT },
          { type: 'image', data: base64, mime_type: 'image/jpeg' },
        ],
        generation_config: {
          max_output_tokens: 400,
          thinking_level: 'minimal',
          thinking_summaries: 'none',
        },
      },
      { 'Api-Revision': '2026-05-20' },
    )
  }

  return postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${route.model}:generateContent`,
    apiKey,
    googlePayload(base64),
  )
}

async function tryKey(apiKey: string, base64: string): Promise<TranslatePayload> {
  const routes: Route[] = []
  if (cachedRoute) routes.push(cachedRoute)
  for (const model of FAST_MODELS) {
    routes.push({ kind: 'google', model })
    routes.push({ kind: 'interactions', model })
  }

  const seen = new Set<string>()
  let lastError: unknown
  for (const route of routes) {
    const id = `${route.kind}:${route.model}`
    if (seen.has(id)) continue
    seen.add(id)
    try {
      const result = await callRoute(route, apiKey, base64)
      cachedRoute = route
      return result
    } catch (err) {
      lastError = err
      const message = err instanceof Error ? err.message : ''
      if (/quota/i.test(message)) throw err
      if (cachedRoute && cachedRoute.kind === route.kind && cachedRoute.model === route.model) {
        cachedRoute = null
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Tarjima muvaffaqiyatsiz')
}

export function getServerApiKey(fallback = ''): string {
  return cleanKey(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || fallback)
}

export async function translateWithGemini(
  apiKey: string,
  dataUrl: string,
): Promise<TranslatePayload> {
  const key = getServerApiKey(apiKey)
  if (!key) {
    throw new Error('Tarjima sozlanmagan. GEMINI_API_KEY o‘rnatilmagan.')
  }

  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl

  try {
    return await tryKey(key, base64)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (/invalid authentication|oauth|unauthenticated|401/i.test(message)) {
      throw new Error(
        'Google kalitni rad etdi. https://aistudio.google.com/apikey dan yangi kalit oling va .env dagi GEMINI_API_KEY ni yangilang.',
      )
    }
    throw err instanceof Error ? err : new Error('Tarjima muvaffaqiyatsiz')
  }
}
