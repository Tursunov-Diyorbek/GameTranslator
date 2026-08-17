import { normalizeHotkey } from './hotkey'
import type { Settings, TranslationResult } from '../types'

const SETTINGS_KEY = 'gt.settings'
const HISTORY_KEY = 'gt.history'
const HISTORY_LIMIT = 20

const DEFAULT_SETTINGS: Settings = {
  hotkey: 'KeyT',
  toggleHotkey: 'F8',
  apiKey: '',
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    const hotkey = normalizeHotkey(parsed.hotkey ?? 'KeyT')
    let toggleHotkey = normalizeHotkey(parsed.toggleHotkey ?? 'F8')
    if (toggleHotkey === hotkey) toggleHotkey = 'F8'
    if (toggleHotkey === hotkey) toggleHotkey = 'F9'
    return {
      hotkey,
      toggleHotkey,
      apiKey: parsed.apiKey ?? '',
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

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
