export type TranslationResult = {
  id: string
  createdAt: number
  image: string
  original: string
  translation: string
  note: string
}

export type Settings = {
  hotkey: string
  toggleHotkey: string
  apiKey: string
}

export type CropRect = {
  x: number
  y: number
  w: number
  h: number
}
