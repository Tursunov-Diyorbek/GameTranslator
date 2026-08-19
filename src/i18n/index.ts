import { uz } from './uz'

export type Dictionary = typeof uz
export type UiLang = 'uz'

export function dict(_lang?: string): Dictionary {
  return uz
}

/** Interfeys har doim o'zbekcha. */
export function detectUiLang(): UiLang {
  return 'uz'
}

/** `{name}` shaklidagi joy egalarini almashtiradi. */
export function fmt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match)
}

const ERROR_KEYS: Record<string, keyof Dictionary> = {
  MISSING_API_KEY: 'errMissingApiKey',
  INVALID_API_KEY: 'errInvalidApiKey',
  QUOTA_EXCEEDED: 'errQuota',
  NETWORK_ERROR: 'errNetwork',
  NO_IMAGE: 'errNoImage',
  EMPTY_RESPONSE: 'errEmptyResponse',
  BAD_RESPONSE: 'errBadResponse',
  TRANSLATE_FAILED: 'errTranslateFailed',
}

/**
 * Rust ma'lum xatolarni kod sifatida qaytaradi, qolganini Google matnida.
 * Kod tanilmasa xom matn ko'rsatiladi — foydali ma'lumot yo'qolmasligi uchun.
 */
export function errorText(_lang: string, raw: string): string {
  const messages = uz
  const key = ERROR_KEYS[raw?.trim()]
  if (key) return messages[key]
  return raw?.trim() || messages.errTranslateFailed
}
