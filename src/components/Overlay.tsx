import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  currentMonitor,
  getCurrentWindow,
  LogicalPosition,
  LogicalSize,
} from '@tauri-apps/api/window'
import { dict, errorText } from '../i18n'
import { hideOverlay, listenAll, type OverlayPayload } from '../lib/bridge'

const CARD_WIDTH = 460
const MARGIN = 16
const AUTO_HIDE_MS = 20000

const EMPTY: OverlayPayload = { status: 'hide', translation: '', note: '', error: '' }

async function fitWindow(card: HTMLElement, pinTopRight: boolean) {
  const rect = card.getBoundingClientRect()
  const width = Math.max(1, Math.ceil(rect.width))
  const height = Math.max(1, Math.ceil(rect.height))
  const win = getCurrentWindow()
  await win.setSize(new LogicalSize(width, height))

  if (!pinTopRight) return

  const monitor = await currentMonitor()
  if (!monitor) return
  const scale = monitor.scaleFactor || 1
  const screenWidth = monitor.size.width / scale
  const originX = monitor.position.x / scale
  const originY = monitor.position.y / scale
  await win.setPosition(
    new LogicalPosition(originX + screenWidth - width - MARGIN, originY + MARGIN),
  )
}

/**
 * Faol belgi doim yuqori o'ngda turadi va surilmaydi.
 * Har yangi skrinshotda tarjima ham o'sha burchakda ochiladi, keyin surish mumkin.
 */
export function Overlay() {
  const cardRef = useRef<HTMLDivElement>(null)
  const movedRef = useRef(false)
  const lastFitRef = useRef({ w: 0, h: 0 })
  const [state, setState] = useState<OverlayPayload>(EMPTY)
  const t = dict('uz')

  const isBadge = state.status === 'armed'
  const canDrag = state.status === 'loading' || state.status === 'done' || state.status === 'error'

  useEffect(
    () =>
      listenAll({
        'gt:overlay': (payload: OverlayPayload) => setState(payload ?? EMPTY),
      }),
    [],
  )

  // Yangi sessiya (faol belgi yoki yangi skrinshot) — joy boshidan yuqori o'ng.
  useEffect(() => {
    if (state.status === 'armed' || state.status === 'loading') {
      movedRef.current = false
      lastFitRef.current = { w: 0, h: 0 }
    }
  }, [state.status])

  useEffect(() => {
    const card = cardRef.current
    if (!card || state.status === 'hide') return

    const resize = () => {
      const rect = card.getBoundingClientRect()
      const width = Math.max(1, Math.ceil(rect.width))
      const height = Math.max(1, Math.ceil(rect.height))
      if (lastFitRef.current.w === width && lastFitRef.current.h === height) return
      lastFitRef.current = { w: width, h: height }
      const pinTopRight = state.status === 'armed' || !movedRef.current
      void fitWindow(card, pinTopRight)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(card)
    return () => observer.disconnect()
  }, [state])

  useEffect(() => {
    if (state.status !== 'done' && state.status !== 'error') return
    const timer = window.setTimeout(() => void hideOverlay(), AUTO_HIDE_MS)
    return () => window.clearTimeout(timer)
  }, [state])

  function beginDrag(event: PointerEvent<HTMLElement>) {
    if (!canDrag) return
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('button')) return
    movedRef.current = true
    void getCurrentWindow().startDragging()
  }

  if (state.status === 'hide') return null

  if (isBadge) {
    return (
      <div className="ov-badge" ref={cardRef}>
        <i />
        <span>{t.overlayActive}</span>
      </div>
    )
  }

  const isError = state.status === 'error'

  return (
    <div
      className={`ov-card ${isError ? 'is-error' : ''}`}
      ref={cardRef}
      style={{ width: CARD_WIDTH }}
      onPointerDown={beginDrag}
    >
      <div className="ov-head" data-tauri-drag-region>
        <strong>{isError ? t.overlayError : t.overlayTranslation}</strong>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => void hideOverlay()}
          aria-label={t.close}
        >
          ✕
        </button>
      </div>

      <div className="ov-body" data-tauri-drag-region>
        {state.status === 'loading' ? (
          <p className="ov-loading">{t.overlayLoading}</p>
        ) : isError ? (
          <p className="ov-error">{errorText('uz', state.error)}</p>
        ) : (
          <>
            <p className="ov-text">{state.translation || t.overlayNoText}</p>
            {state.note ? (
              <p className="ov-note">
                <span>{t.note}</span>
                {state.note}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
