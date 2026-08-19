import type { TranslationResult } from '../types'

const HISTORY_KEY = 'gt.history'
const HISTORY_LIMIT = 20

// Sozlamalar Rust tomonda (`settings.json`) saqlanadi — bu yerda faqat tarix,
// u sof interfeysga xos ma'lumot.

export function loadHistory(): TranslationResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TranslationResult[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveHistory(history: TranslationResult[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)))
}
