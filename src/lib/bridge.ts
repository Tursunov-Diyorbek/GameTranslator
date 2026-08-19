import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { Language, Settings, TranslationResult } from '../types'

export type OverlayStatus = 'hide' | 'armed' | 'loading' | 'done' | 'error'

export type OverlayPayload = {
  status: OverlayStatus
  translation: string
  note: string
  error: string
}

export function getSettings() {
  return invoke<Settings>('get_settings')
}

/** Rust tozalangan sozlamalarni qaytaradi — interfeys shu qiymatga tenglashadi. */
export function saveSettings(settings: Settings) {
  return invoke<Settings>('save_settings', { settings })
}

export function listLanguages() {
  return invoke<Language[]>('list_languages')
}

export function setArmed(on: boolean) {
  return invoke<void>('set_armed', { on })
}

export function getArmed() {
  return invoke<boolean>('get_armed')
}

export function getLastResult() {
  return invoke<TranslationResult | null>('get_last_result')
}

export function translateImage(image: string) {
  return invoke<TranslationResult>('translate_image', { image })
}

export function hideOverlay() {
  return invoke<void>('hide_overlay')
}

/**
 * Bir nechta Rust voqeasiga bir yo'la ulanadi. Qaytgan funksiya hammasini uzadi.
 *
 * `listen` promise qaytargani uchun komponent obuna ulgurmasdan yopilishi mumkin —
 * shu holatda ham uzilish kafolatlanadi.
 */
export function listenAll(handlers: Record<string, (payload: never) => void>): () => void {
  let cancelled = false
  const unsubs: UnlistenFn[] = []

  for (const [event, handler] of Object.entries(handlers)) {
    void listen(event, (message) => {
      handler(message.payload as never)
    }).then((unsub) => {
      if (cancelled) {
        unsub()
        return
      }
      unsubs.push(unsub)
    })
  }

  return () => {
    cancelled = true
    for (const unsub of unsubs) unsub()
    unsubs.length = 0
  }
}
