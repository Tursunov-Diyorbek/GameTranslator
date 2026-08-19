import { useEffect, useRef, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { dict } from '../i18n'
import { eventToHotkey, hotkeyLabel } from '../lib/hotkey'
import type { Settings } from '../types'
import { STUDIO_URL } from './Onboarding'

type Props = {
  open: boolean
  settings: Settings
  onClose: () => void
  onSave: (next: Settings) => void
}

type ListenTarget = 'snip' | 'toggle' | null

export function SettingsModal({ open, settings, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(settings)
  const [listening, setListening] = useState<ListenTarget>(null)
  const [hint, setHint] = useState('')
  const snipBtnRef = useRef<HTMLButtonElement>(null)
  const toggleBtnRef = useRef<HTMLButtonElement>(null)

  // Interfeys tili tanlovi darhol ko'rinishi kerak, shuning uchun qoralamadan olinadi.
  const t = dict(draft.uiLang)

  useEffect(() => {
    if (!open) return
    setDraft(settings)
    setListening(null)
    setHint('')
  }, [open, settings])

  useEffect(() => {
    if (!open) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (listening) {
          setListening(null)
          return
        }
        onClose()
        return
      }

      if (!listening) return
      e.preventDefault()
      e.stopPropagation()
      const next = eventToHotkey(e)
      if (!next) return

      if (listening === 'snip') {
        if (next === draft.toggleHotkey) {
          setHint(t.keyTakenByToggle)
          setListening(null)
          return
        }
        setDraft((prev) => ({ ...prev, hotkey: next }))
      } else {
        if (next === draft.hotkey) {
          setHint(t.keyTakenBySnip)
          setListening(null)
          return
        }
        setDraft((prev) => ({ ...prev, toggleHotkey: next }))
      }

      setHint('')
      setListening(null)
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, listening, onClose, draft.hotkey, draft.toggleHotkey, t])

  if (!open) return null

  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div
        className="modal hud-frame"
        role="dialog"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="settings-title">{t.settings}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t.close}>
            ✕
          </button>
        </div>

        <label className="field">
          <span>{t.toggleKeyLabel}</span>
          <p className="hint">{t.toggleKeyHint}</p>
          <button
            ref={toggleBtnRef}
            type="button"
            className={`hotkey-pad ${listening === 'toggle' ? 'listening' : ''}`}
            onClick={() => {
              setListening('toggle')
              toggleBtnRef.current?.focus()
            }}
          >
            {listening === 'toggle' ? t.pressKey : hotkeyLabel(draft.toggleHotkey)}
          </button>
        </label>

        <label className="field">
          <span>{t.snipKeyLabel}</span>
          <p className="hint">{t.snipKeyHint}</p>
          <button
            ref={snipBtnRef}
            type="button"
            className={`hotkey-pad ${listening === 'snip' ? 'listening' : ''}`}
            onClick={() => {
              setListening('snip')
              snipBtnRef.current?.focus()
            }}
          >
            {listening === 'snip' ? t.pressKey : hotkeyLabel(draft.hotkey)}
          </button>
        </label>

        <label className="field">
          <span>{t.apiKeyLabel}</span>
          <p className="hint">
            {t.apiKeyHint}{' '}
            <button type="button" className="link-btn" onClick={() => void openUrl(STUDIO_URL)}>
              {t.getApiKey}
            </button>
          </p>
          <input
            type="password"
            value={draft.apiKey}
            placeholder="AIza…"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setDraft((prev) => ({ ...prev, apiKey: event.target.value }))}
          />
        </label>

        {hint ? <p className="banner error">{hint}</p> : null}

        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              onSave({ ...draft, apiKey: draft.apiKey.trim() })
              onClose()
            }}
          >
            {t.save}
          </button>
        </div>
      </div>
    </div>
  )
}
