import { useCallback, useEffect, useRef, useState } from 'react'
import { ResultCard } from './components/ResultCard'
import { SettingsModal } from './components/SettingsModal'
import { codeToVk, hotkeyLabel } from './lib/hotkey'
import { loadHistory, loadSettings, saveHistory, saveSettings } from './lib/storage'
import { translateScreenshot } from './lib/translate'
import type { Settings, TranslationResult } from './types'

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export default function App() {
  const busyRef = useRef(false)
  const activeRef = useRef(false)
  const settingsOpenRef = useRef(false)
  const ingestRef = useRef<(image: string) => void>(() => {})

  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [history, setHistory] = useState<TranslationResult[]>(() => loadHistory())
  const [current, setCurrent] = useState<TranslationResult | null>(null)

  activeRef.current = active
  busyRef.current = busy
  settingsOpenRef.current = settingsOpen

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
    busyRef.current = false
  }, [])

  const loadLastResult = useCallback(async () => {
    const res = await fetch('/api/last')
    if (!res.ok) return
    const item = (await res.json()) as TranslationResult
    if (!item?.id) return
    applyItem(item)
  }, [applyItem])

  const runTranslate = useCallback(
    async (image: string) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      setError('')
      try {
        const payload = await translateScreenshot(image, settings.apiKey)
        applyItem({
          id: newId(),
          createdAt: Date.now(),
          image,
          original: payload.original,
          translation: payload.translation,
          note: payload.note,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Tarjima muvaffaqiyatsiz')
        busyRef.current = false
        setBusy(false)
      }
    },
    [applyItem, settings.apiKey],
  )

  ingestRef.current = (image) => {
    void runTranslate(image)
  }

  useEffect(() => {
    const snipVk = codeToVk(settings.hotkey)
    const toggleVk = codeToVk(settings.toggleHotkey)
    void fetch(
      `/api/armed?on=${active ? '1' : '0'}&vk=${snipVk || 0}&toggleVk=${toggleVk ?? 0}`,
    )
  }, [active, settings.hotkey, settings.toggleHotkey])

  useEffect(() => {
    const snipVk = codeToVk(settings.hotkey)
    const toggleVk = codeToVk(settings.toggleHotkey)
    if (!snipVk) return

    const source = new EventSource(
      `/api/hotkey?vk=${snipVk}&toggleVk=${toggleVk ?? 0}`,
    )
    source.onmessage = (ev) => {
      const data = ev.data.trim()
      if (data === 'toggle:1' || data === 'toggle:0') {
        setError('')
        setActive(data === 'toggle:1')
        return
      }
      if (data === 'toggle') {
        setError('')
        setActive((value) => !value)
        return
      }
      if (data === 'open' || data === 'cancel' || data === 'snip') return
      if (data === 'busy') {
        busyRef.current = true
        setBusy(true)
        setError('')
        return
      }
      if (data === 'result') {
        void loadLastResult()
        return
      }
      if (data.startsWith('error:')) {
        try {
          const body = JSON.parse(data.slice(6)) as { error?: string }
          setError(body.error || 'Tarjima muvaffaqiyatsiz')
        } catch {
          setError('Tarjima muvaffaqiyatsiz')
        }
        busyRef.current = false
        setBusy(false)
      }
    }
    return () => source.close()
  }, [loadLastResult, settings.hotkey, settings.toggleHotkey])

  useEffect(() => {
    async function syncFromServer() {
      try {
        const res = await fetch('/api/armed')
        if (res.ok) {
          const body = (await res.json()) as { on?: boolean }
          setActive(Boolean(body.on))
        }
      } catch {
        /* ignore */
      }
      try {
        await loadLastResult()
      } catch {
        /* ignore */
      }
    }

    function onVisible() {
      if (!document.hidden) void syncFromServer()
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadLastResult])

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!activeRef.current || settingsOpenRef.current) return
      const item = [...(e.clipboardData?.items ?? [])].find((entry) =>
        entry.type.startsWith('image/'),
      )
      if (!item) return
      const file = item.getAsFile()
      if (!file) return
      e.preventDefault()
      void blobToDataUrl(file).then((url) => ingestRef.current(url))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  function persistSettings(next: Settings) {
    setSettings(next)
    saveSettings(next)
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
            <p className="tag">O‘yin matnini o‘zbekchaga</p>
          </div>
        </div>

        <div className="top-actions">
          <span className={`status ${active ? 'on' : ''}`}>
            <i />
            {active ? 'Faol' : 'Faol emas'}
          </span>
          <button type="button" className="ghost-btn" onClick={() => setSettingsOpen(true)}>
            Sozlamalar
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
            <strong>{active ? 'Stop' : 'Start'}</strong>
            <span>{active ? 'Tarjimonni o‘chirish' : 'Tarjimonni yoqish'}</span>
          </button>

          <div className="meta">
            <p>
              Yoqish/o‘chirish <kbd>{toggleLabel}</kbd>
              {' · '}
              Skrinshot <kbd>{snipLabel}</kbd>
            </p>
            <p className="muted small">
              1 ekran: Start bosing, o‘yinga qayting — tarjima o‘yin ustida chiqadi. Ba’zi to‘liq
              ekran o‘yinlarda borderless yoki windowed rejim kerak.
            </p>
          </div>
        </div>
      </section>

      {error ? <p className="banner error">{error}</p> : null}
      {busy ? <p className="banner pulse">Matn o‘qilmoqda va tarjima qilinmoqda…</p> : null}

      <section className="stage">
        {current ? (
          <ResultCard item={current} busy={busy} />
        ) : (
          <div className="empty hud-frame">
            <h2>Tarjima o‘yin ustida ham chiqadi</h2>
            <p>
              <kbd>{toggleLabel}</kbd> yoki Start, keyin o‘yinga qayting. <kbd>{snipLabel}</kbd>{' '}
              bilan joyni belgilang — tarjima burchakda ochiladi.
            </p>
          </div>
        )}
      </section>

      {history.length > 0 ? (
        <section className="history">
          <div className="history-head">
            <h2>Tarix</h2>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setHistory([])
                setCurrent(null)
                saveHistory([])
              }}
            >
              Tozalash
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
                <span>{item.translation || 'Matn yo‘q'}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={persistSettings}
      />
    </div>
  )
}
