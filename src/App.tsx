import { useCallback, useEffect, useRef, useState } from 'react'
import { Onboarding } from './components/Onboarding'
import { ResultCard } from './components/ResultCard'
import { SettingsModal } from './components/SettingsModal'
import { UpdateBanner } from './components/UpdateBanner'
import { dict, errorText } from './i18n'
import {
  getArmed,
  getLastResult,
  getSettings,
  listenAll,
  saveSettings,
  setArmed,
  translateImage,
} from './lib/bridge'
import { hotkeyLabel } from './lib/hotkey'
import { prepareImage } from './lib/image'
import { loadHistory, saveHistory } from './lib/storage'
import type { Settings, TranslationResult } from './types'

/** Rust javob bermasa ishlatiladi — Rust tomondagi standart qiymatlar bilan bir xil. */
const FALLBACK_SETTINGS: Settings = {
  apiKey: '',
  targetLang: 'uz',
  uiLang: 'uz',
  hotkey: 'KeyT',
  toggleHotkey: 'F8',
  onboarded: false,
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Matndagi `{nom}` joylarini <kbd> sifatida chizadi. */
function withKeys(template: string, vars: Record<string, string>) {
  return template.split(/(\{\w+\})/g).map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1]
    const value = name ? vars[name] : undefined
    return value ? <kbd key={index}>{value}</kbd> : <span key={index}>{part}</span>
  })
}

export default function App() {
  const busyRef = useRef(false)
  const settingsOpenRef = useRef(false)
  const settingsRef = useRef<Settings | null>(null)

  const [settings, setSettings] = useState<Settings | null>(null)
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [history, setHistory] = useState<TranslationResult[]>(() => loadHistory())
  const [current, setCurrent] = useState<TranslationResult | null>(null)

  busyRef.current = busy
  settingsOpenRef.current = settingsOpen
  settingsRef.current = settings

  const uiLang = 'uz'
  const t = dict(uiLang)

  const applyItem = useCallback((item: TranslationResult) => {
    setCurrent(item)
    setHistory((prev) => {
      if (prev[0]?.id === item.id) return prev
      const next = [item, ...prev.filter((entry) => entry.id !== item.id)].slice(0, 20)
      saveHistory(next)
      return next
    })
    setBusy(false)
    setError('')
  }, [])

  /** Sozlamalarni Rust'ga yozadi va tozalangan javobni holatga qo'yadi. */
  const persist = useCallback(async (patch: Partial<Settings>) => {
    const base = settingsRef.current
    if (!base) return
    const next = { ...base, ...patch }
    try {
      const saved = await saveSettings(next)
      setSettings(saved)
    } catch (err) {
      setError(errorText('uz', err instanceof Error ? err.message : String(err)))
    }
  }, [])

  // Sozlamalar Rust'dan olinadi.
  useEffect(() => {
    void (async () => {
      try {
        const loaded = await getSettings()
        setSettings({
          ...loaded,
          uiLang: 'uz',
          targetLang: 'uz',
          onboarded: loaded.onboarded || Boolean(loaded.apiKey?.trim()),
        })
      } catch (err) {
        // Interfeys har qanday holatda ochilishi kerak — aks holda oyna bo'sh qoladi
        // va foydalanuvchi sababini bilmaydi.
        setSettings(FALLBACK_SETTINGS)
        setError(errorText('uz', err instanceof Error ? err.message : String(err)))
      }
    })()
  }, [])

  // Faol holat Rust'ga uzatiladi. Tugmalar sozlamalardan o'qilgani uchun bu yerda faqat holat.
  useEffect(() => {
    void setArmed(active)
  }, [active])

  // Ilova ochilganda Rust'dagi haqiqiy holatni olamiz.
  useEffect(() => {
    void getArmed().then(setActive, () => {})
    void getLastResult().then(
      (item) => {
        if (item?.id) applyItem(item)
      },
      () => {},
    )
  }, [applyItem])

  useEffect(
    () =>
      listenAll({
        'gt:toggle': (on: boolean) => {
          setError('')
          setActive(on)
        },
        'gt:busy': () => {
          setBusy(true)
          setError('')
        },
        'gt:result': (item: TranslationResult) => {
          applyItem(item)
        },
        'gt:error': (message: string) => {
          setBusy(false)
          setError(errorText('uz', message))
        },
        'gt:snip-cancel': () => {
          setBusy(false)
        },
      }),
    [applyItem],
  )

  // Qo'lda qo'yilgan rasm (Ctrl+V).
  useEffect(() => {
    async function runPaste(file: Blob) {
      if (busyRef.current) return
      setBusy(true)
      setError('')
      try {
        const prepared = await prepareImage(await blobToDataUrl(file))
        applyItem(await translateImage(prepared))
      } catch (err) {
        setBusy(false)
        setError(errorText('uz', err instanceof Error ? err.message : String(err)))
      }
    }

    function onPaste(event: ClipboardEvent) {
      if (settingsOpenRef.current) return
      const item = [...(event.clipboardData?.items ?? [])].find((entry) =>
        entry.type.startsWith('image/'),
      )
      const file = item?.getAsFile()
      if (!file) return
      event.preventDefault()
      void runPaste(file)
    }

    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [applyItem])

  if (!settings) return null

  if (!settings.onboarded && !settings.apiKey.trim()) {
    return (
      <Onboarding
        settings={settings}
        onDone={(apiKey) => void persist({ apiKey, onboarded: true, uiLang: 'uz', targetLang: 'uz' })}
      />
    )
  }

  const snipLabel = hotkeyLabel(settings.hotkey)
  const toggleLabel = hotkeyLabel(settings.toggleHotkey)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <p className="logo">GameTranslator</p>
            <p className="tag">{t.appTagline}</p>
          </div>
        </div>

        <div className="top-actions">
          <span className={`status ${active ? 'on' : ''}`}>
            <i />
            {active ? t.statusOn : t.statusOff}
          </span>
          <button type="button" className="ghost-btn" onClick={() => setSettingsOpen(true)}>
            {t.settings}
          </button>
        </div>
      </header>

      <section className="command">
        <div className="command-main hud-frame">
          <button
            type="button"
            className={`power ${active ? 'stop' : 'start'}`}
            onClick={() => {
              setError('')
              setActive((value) => !value)
            }}
          >
            <strong>{active ? t.stop : t.start}</strong>
            <span>{active ? t.stopHint : t.startHint}</span>
          </button>

          <div className="meta">
            <p>
              {t.toggleKey} <kbd>{toggleLabel}</kbd>
              {' · '}
              {t.snipKey} <kbd>{snipLabel}</kbd>
            </p>
            <p className="muted small">{t.fullscreenHint}</p>
          </div>
        </div>
      </section>

      <UpdateBanner uiLang={uiLang} />
      {settings.apiKey ? null : <p className="banner error">{t.keyMissing}</p>}
      {error ? <p className="banner error">{error}</p> : null}
      {busy ? <p className="banner pulse">{t.busy}</p> : null}

      <section className="stage">
        {current ? (
          <ResultCard item={current} uiLang={uiLang} busy={busy} />
        ) : (
          <div className="empty hud-frame">
            <h2>{t.emptyTitle}</h2>
            <p>{withKeys(t.emptyBody, { toggle: toggleLabel, snip: snipLabel })}</p>
          </div>
        )}
      </section>

      {history.length > 0 ? (
        <section className="history">
          <div className="history-head">
            <h2>{t.historyTitle}</h2>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setHistory([])
                setCurrent(null)
                saveHistory([])
              }}
            >
              {t.historyClear}
            </button>
          </div>
          <div className="history-row">
            {history.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`history-card ${current?.id === item.id ? 'active' : ''}`}
                onClick={() => setCurrent(item)}
              >
                <img src={item.image} alt="" />
                <span>{item.translation || t.historyNoText}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(next) => void persist({ ...next, uiLang: 'uz', targetLang: 'uz' })}
      />
    </div>
  )
}
