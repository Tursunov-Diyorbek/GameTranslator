export type PipState = {
  status: 'on' | 'busy' | 'done' | 'error'
  translation?: string
  note?: string
  error?: string
}

type PipApi = {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>
}

function pipApi() {
  return (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture
}

export function canOpenPip() {
  return Boolean(pipApi()?.requestWindow)
}

export async function openPipWindow() {
  const api = pipApi()
  if (!api?.requestWindow) return null
  const win = await api.requestWindow({ width: 420, height: 280 })
  win.document.title = 'GameTranslator'
  const style = win.document.createElement('style')
  style.textContent = `
    html, body { margin: 0; height: 100%; background: #070908; color: #eef6ea; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrap { box-sizing: border-box; min-height: 100%; padding: 12px 14px; border: 1px solid rgba(198,255,74,.28); }
    .on { display: flex; align-items: center; gap: 8px; color: #c6ff4a; font-weight: 700; font-size: 13px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #c6ff4a; box-shadow: 0 0 8px #c6ff4a; }
    .body { margin-top: 10px; white-space: pre-wrap; font-size: 16px; line-height: 1.45; font-weight: 600; }
    .note { margin-top: 10px; padding-left: 8px; border-left: 3px solid #3ee0a8; color: #d7f5e8; font-size: 12px; line-height: 1.45; }
    .muted { color: #8b9b8f; font-weight: 500; }
  `
  win.document.head.appendChild(style)
  const wrap = win.document.createElement('div')
  wrap.className = 'wrap'
  wrap.id = 'root'
  win.document.body.appendChild(wrap)
  renderPip(win, { status: 'on' })
  return win
}

export function renderPip(win: Window, state: PipState) {
  const root = win.document.getElementById('root')
  if (!root) return
  const translation = (state.translation || '').replace(/</g, '&lt;')
  const note = (state.note || '').replace(/</g, '&lt;')
  const error = (state.error || '').replace(/</g, '&lt;')
  let body = '<p class="body muted">Win+Shift+S bilan kesing</p>'
  if (state.status === 'busy') body = '<p class="body muted">Tarjima qilinmoqda...</p>'
  if (state.status === 'error') body = `<p class="body">${error || 'Tarjima muvaffaqiyatsiz'}</p>`
  if (state.status === 'done') {
    body = `<p class="body">${translation || 'Matn topilmadi'}</p>`
    if (note) body += `<p class="note">${note}</p>`
  }
  root.innerHTML = `<div class="on"><span class="dot"></span>ON</div>${body}`
}

export function notifyTranslation(text: string) {
  if (Notification.permission !== 'granted' || !text) return
  try {
    new Notification('GameTranslator', { body: text.slice(0, 240) })
  } catch {
    /* ignore */
  }
}
