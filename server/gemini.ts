export type TranslatePayload = {
  original: string
  translation: string
  note: string
}

const FAST_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash']

const PROMPT = `Skrinshotdagi matnni o'zbekchaga tarjima qil.
Har bir qator, ro'yxat bandi va joylashuvni rasmdagidek saqla. Birlashtirma.
JSON: {"original":["qator1","qator2"],"translation":["tarjima1","tarjima2"],"note":"1 qisqa jumla"}
Nomlarni asl holda qoldir.`

type GeminiErrorBody = {
  error?: { message?: string }
}

let cachedModel = ''

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

async function generateContent(
  apiKey: string,
  model: string,
  base64: string,
  thinkingOff: boolean,
  useSchema: boolean,
): Promise<TranslatePayload> {
  const generationConfig: Record<string, unknown> = {
    temperature: 0,
    maxOutputTokens: 800,
    responseMimeType: 'application/json',
  }
  if (useSchema) {
    generationConfig.responseSchema = {
      type: 'OBJECT',
      properties: {
        original: { type: 'ARRAY', items: { type: 'STRING' } },
        translation: { type: 'ARRAY', items: { type: 'STRING' } },
        note: { type: 'STRING' },
      },
      required: ['original', 'translation', 'note'],
    }
  }
  if (thinkingOff) {
    generationConfig.thinkingConfig = { thinkingBudget: 0, thinkingLevel: 'MINIMAL' }
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            ],
          },
        ],
        generationConfig,
      }),
    },
  )

  const body = (await res.json()) as GeminiErrorBody & {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  if (!res.ok) throw new Error(body.error?.message || `Tarjima xatosi (${res.status})`)

  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
  if (!text) throw new Error('AI javob qaytarmadi')
  return extractJson(text)
}

async function tryModel(apiKey: string, model: string, base64: string): Promise<TranslatePayload> {
  try {
    return await generateContent(apiKey, model, base64, true, true)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (/thinking|schema|unknown|invalid argument/i.test(message)) {
      return await generateContent(apiKey, model, base64, false, false)
    }
    throw err
  }
}

export function getServerApiKey(fallback = ''): string {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || fallback).trim()
}

export async function translateWithGemini(
  apiKey: string,
  dataUrl: string,
): Promise<TranslatePayload> {
  const key = getServerApiKey(apiKey)
  if (!key) throw new Error('Tarjima hozircha sozlanmagan. Administrator .env fayliga GEMINI_API_KEY qo‘ysin.')

  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const models = cachedModel ? [cachedModel, ...FAST_MODELS.filter((name) => name !== cachedModel)] : FAST_MODELS

  let lastError: unknown
  for (const model of models) {
    try {
      const result = await tryModel(key, model, base64)
      cachedModel = model
      return result
    } catch (err) {
      lastError = err
      const message = err instanceof Error ? err.message : ''
      if (/API_KEY|api key|permission denied|quota/i.test(message)) throw err
      if (cachedModel === model) cachedModel = ''
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Tarjima muvaffaqiyatsiz')
}
