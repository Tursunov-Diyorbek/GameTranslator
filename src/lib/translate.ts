export type TranslatePayload = {
  original: string
  translation: string
  note: string
}

export async function translateScreenshot(
  image: string,
  apiKey = '',
): Promise<TranslatePayload> {
  if (!image) throw new Error('Skrinshot topilmadi')

  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, apiKey: apiKey || undefined }),
  })

  const body = (await res.json().catch(() => ({}))) as TranslatePayload & { error?: string }
  if (!res.ok) {
    throw new Error(body.error || `Tarjima xatosi (${res.status})`)
  }
  return {
    original: body.original ?? '',
    translation: body.translation ?? '',
    note: body.note ?? '',
  }
}
