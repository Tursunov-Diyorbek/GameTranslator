import { useEffect, useState } from 'react'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { dict, fmt } from '../i18n'

type Phase = 'checking' | 'ready' | 'downloading' | 'installed' | 'failed'

/**
 * Ishga tushganda bir marta yangilanishni tekshiradi. Server yoki internet
 * yo'q bo'lsa jim qoladi — yangilanish ilovaning asosiy vazifasi emas.
 */
export function UpdateBanner({ uiLang }: { uiLang: string }) {
  const [update, setUpdate] = useState<Update | null>(null)
  const [phase, setPhase] = useState<Phase>('checking')
  const t = dict(uiLang)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const found = await check()
        if (!cancelled && found) {
          setUpdate(found)
          setPhase('ready')
        }
      } catch {
        /* tekshirish imkoni bo'lmasa e'tibor bermaymiz */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (!update) return null

  async function install() {
    if (!update) return
    setPhase('downloading')
    try {
      await update.downloadAndInstall()
      setPhase('installed')
      await relaunch()
    } catch {
      setPhase('failed')
    }
  }

  if (phase === 'downloading') return <p className="banner pulse">{t.updateDownloading}</p>
  if (phase === 'installed') return <p className="banner pulse">{t.updateRestart}</p>
  if (phase === 'failed') return <p className="banner error">{t.updateFailed}</p>

  return (
    <p className="banner update">
      {fmt(t.updateAvailable, { version: update.version })}
      <button type="button" className="link-btn" onClick={() => void install()}>
        {t.updateInstall}
      </button>
    </p>
  )
}
