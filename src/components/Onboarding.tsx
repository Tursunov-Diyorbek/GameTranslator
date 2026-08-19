import { useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { dict } from '../i18n'
import type { Settings } from '../types'

export const STUDIO_URL = 'https://aistudio.google.com/apikey'

type Props = {
  settings: Settings
  onDone: (apiKey: string) => void
}

/**
 * Kalit yo'q bo'lganda ko'rsatiladigan birinchi ishga tushirish ekrani.
 * Kalit har bir foydalanuvchining o'zida bo'lgani uchun bu ekran mahsulotning
 * birinchi qadami hisoblanadi.
 */
export function Onboarding({ settings, onDone }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [warning, setWarning] = useState('')
  const t = dict(settings.uiLang)

  function submit() {
    const key = apiKey.trim()
    if (!key) {
      setWarning(t.onboardKeyRequired)
      return
    }
    onDone(key)
  }

  return (
    <div className="onboard">
      <div className="onboard-card hud-frame">
        <header className="onboard-head">
          <div className="brand">
            <span className="mark" aria-hidden="true" />
            <p className="logo">GameTranslator</p>
          </div>
        </header>

        <h1>{t.onboardTitle}</h1>
        <p className="onboard-body">{t.onboardBody}</p>

        <ol className="onboard-steps">
          <li>{t.onboardStep1}</li>
          <li>{t.onboardStep2}</li>
          <li>{t.onboardStep3}</li>
        </ol>

        <button type="button" className="ghost-btn wide" onClick={() => void openUrl(STUDIO_URL)}>
          {t.onboardOpenStudio}
        </button>

        <label className="field">
          <span>{t.apiKeyLabel}</span>
          <input
            type="password"
            value={apiKey}
            placeholder="AIza…"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setApiKey(event.target.value)
              setWarning('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
          />
        </label>

        {warning ? <p className="banner error">{warning}</p> : null}

        <button type="button" className="primary-btn wide" onClick={submit}>
          {t.onboardContinue}
        </button>

        <p className="muted small">{t.privacyNote}</p>
      </div>
    </div>
  )
}
