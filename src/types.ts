export type TranslationResult = {
  id: string
  createdAt: number
  image: string
  original: string
  translation: string
  note: string
}

/** Rust `settings.json` da saqlaydigan yagona sozlamalar to'plami. */
export type Settings = {
  apiKey: string
  targetLang: string
  uiLang: string
  hotkey: string
  toggleHotkey: string
  onboarded: boolean
}

export type Language = {
  code: string
  name: string
  nativeName: string
}
