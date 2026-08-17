import { useEffect, useRef, useState } from 'react'
import { eventToHotkey, hotkeyLabel } from '../lib/hotkey'
import type { Settings } from '../types'

type Props = {
  open: boolean
  settings: Settings
  onClose: () => void
  onSave: (next: Settings) => void
}

type ListenTarget = 'snip' | 'toggle' | null

export function SettingsModal({ open, settings, onClose, onSave }: Props) {
  const [hotkey, setHotkey] = useState(settings.hotkey)
  const [toggleHotkey, setToggleHotkey] = useState(settings.toggleHotkey)
  const [listening, setListening] = useState<ListenTarget>(null)
  const [hint, setHint] = useState('')
  const snipBtnRef = useRef<HTMLButtonElement>(null)
  const toggleBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    setHotkey(settings.hotkey)
    setToggleHotkey(settings.toggleHotkey)
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
        if (next === toggleHotkey) {
          setHint('Bu tugma Start/Stop uchun band. Boshqa tugma tanlang.')
          setListening(null)
          return
        }
        setHotkey(next)
      } else {
        if (next === hotkey) {
          setHint('Bu tugma skrinshot uchun band. Boshqa tugma tanlang.')
          setListening(null)
          return
        }
        setToggleHotkey(next)
      }
      setHint('')
      setListening(null)
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, listening, onClose, hotkey, toggleHotkey])

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
          <h2 id="settings-title">Sozlamalar</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Yopish">
            ✕
          </button>
        </div>

        <label className="field">
          <span>Start / Stop tugmasi</span>
          <p className="hint">Shu tugma tarjimonni yoqadi yoki o‘chiradi. O‘yin ichida ham ishlaydi.</p>
          <button
            ref={toggleBtnRef}
            type="button"
            className={`hotkey-pad ${listening === 'toggle' ? 'listening' : ''}`}
            onClick={() => {
              setListening('toggle')
              toggleBtnRef.current?.focus()
            }}
          >
            {listening === 'toggle' ? 'Tugmani bosing…' : hotkeyLabel(toggleHotkey)}
          </button>
        </label>

        <label className="field">
          <span>Skrinshot tugmasi</span>
          <p className="hint">Faol paytda Win+Shift+S kabi kesish oynasini ochadi.</p>
          <button
            ref={snipBtnRef}
            type="button"
            className={`hotkey-pad ${listening === 'snip' ? 'listening' : ''}`}
            onClick={() => {
              setListening('snip')
              snipBtnRef.current?.focus()
            }}
          >
            {listening === 'snip' ? 'Tugmani bosing…' : hotkeyLabel(hotkey)}
          </button>
        </label>

        {hint ? <p className="banner error">{hint}</p> : null}

        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Bekor
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              onSave({ hotkey, toggleHotkey, apiKey: settings.apiKey })
              onClose()
            }}
          >
            Saqlash
          </button>
        </div>
      </div>
    </div>
  )
}
