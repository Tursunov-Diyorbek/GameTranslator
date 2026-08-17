import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, ViteDevServer } from 'vite'
import { translateWithGemini } from './gemini.ts'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const scriptPath = path.resolve(rootDir, '../scripts/watch-hotkey.ps1')
const overlayScriptPath = path.resolve(rootDir, '../scripts/overlay.ps1')
const snipPath = path.join(os.tmpdir(), 'gametranslator-snip.jpg')
const overlayStatePath = path.join(os.tmpdir(), 'gametranslator-overlay.json')
const armPath = `${snipPath}.arm`
const enabledPath = `${snipPath}.on`

type LastResult = {
  id: string
  createdAt: number
  image: string
  original: string
  translation: string
  note: string
}

const clients = new Set<ServerResponse>()
let watcher: ChildProcess | null = null
let overlay: ChildProcess | null = null
let watcherVk = 0
let watcherToggleVk = -1
let lastVk = 0
let lastToggleVk = 0
let watcherBuf = ''
let stopTimer: ReturnType<typeof setTimeout> | null = null
let armed = false
let translating = false
let lastResult: LastResult | null = null

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function killProcess(child: ChildProcess) {
  if (!child.pid || child.killed) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    return
  }
  child.kill()
}

function broadcast(event: string) {
  for (const res of clients) {
    try {
      res.write(`data: ${event}\n\n`)
    } catch {
      clients.delete(res)
    }
  }
}

function jpegToDataUrl(filePath: string) {
  const bytes = fs.readFileSync(filePath)
  return `data:image/jpeg;base64,${bytes.toString('base64')}`
}

function writeOverlayFile(payload: Record<string, unknown>) {
  const json = JSON.stringify(payload)
  const tmp = `${overlayStatePath}.tmp`
  fs.writeFileSync(tmp, json, 'utf8')
  fs.copyFileSync(tmp, overlayStatePath)
  fs.unlinkSync(tmp)
}

function pushOverlay(payload: Record<string, unknown>) {
  if (!armed) return
  ensureOverlay()
  try {
    writeOverlayFile(payload)
  } catch (err) {
    console.error('[overlay]', err)
  }
}

function stopOverlay() {
  try {
    writeOverlayFile({ status: 'hide' })
  } catch {
    /* ignore */
  }
  if (!overlay) return
  killProcess(overlay)
  overlay = null
}

function ensureOverlay() {
  if (process.platform !== 'win32') return
  if (overlay && !overlay.killed) return
  try {
    writeOverlayFile({ status: 'hide' })
  } catch {
    /* ignore */
  }
  overlay = spawn(
    'powershell.exe',
    [
      '-STA',
      '-NoProfile',
      '-NoLogo',
      '-WindowStyle',
      'Hidden',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      overlayScriptPath,
      '-StateFile',
      overlayStatePath,
    ],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
  )
  overlay.stderr?.on('data', (chunk: Buffer) => {
    console.error('[overlay]', chunk.toString('utf8'))
  })
  overlay.on('exit', () => {
    overlay = null
  })
}

function stopWatcher() {
  if (!watcher) return
  killProcess(watcher)
  watcher = null
  watcherVk = 0
  watcherToggleVk = -1
  watcherBuf = ''
}

function scheduleStopWatcher() {
  if (stopTimer) clearTimeout(stopTimer)
  stopTimer = setTimeout(() => {
    stopTimer = null
    if (clients.size === 0 && !armed) stopWatcher()
  }, 500)
}

function setArmed(on: boolean) {
  armed = on
  try {
    if (on) fs.writeFileSync(enabledPath, '1')
    else fs.unlinkSync(enabledPath)
  } catch {
    /* ignore */
  }
  if (on) {
    if (lastVk > 0) ensureWatcher(lastVk, lastToggleVk)
    ensureOverlay()
    return
  }
  stopOverlay()
  if (clients.size === 0) scheduleStopWatcher()
}

async function handleSnip() {
  if (!armed || translating) return
  translating = true
  broadcast('busy')
  pushOverlay({ status: 'loading' })
  try {
    if (!fs.existsSync(snipPath)) throw new Error('Skrinshot olinmadi')
    const image = jpegToDataUrl(snipPath)
    const payload = await translateWithGemini('', image)
    lastResult = {
      id: newId(),
      createdAt: Date.now(),
      image,
      original: payload.original,
      translation: payload.translation,
      note: payload.note,
    }
    pushOverlay({
      status: 'done',
      translation: payload.translation,
      note: payload.note,
    })
    broadcast('result')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tarjima muvaffaqiyatsiz'
    pushOverlay({ status: 'error', error: message })
    broadcast(`error:${JSON.stringify({ error: message })}`)
  } finally {
    translating = false
  }
}

function onWatcherLine(token: string) {
  if (token === 'OPEN') {
    broadcast('open')
    pushOverlay({ status: 'hide' })
    return
  }
  if (token === 'CANCEL') {
    broadcast('cancel')
    return
  }
  if (token === 'TOGGLE') {
    setArmed(!armed)
    broadcast(`toggle:${armed ? '1' : '0'}`)
    return
  }
  if (token === 'SNIP') {
    broadcast('snip')
    void handleSnip()
  }
}

function ensureWatcher(vk: number, toggleVk: number) {
  if (process.platform !== 'win32') return
  if (vk <= 0) return
  if (watcher && watcherVk === vk && watcherToggleVk === toggleVk && !watcher.killed) return
  stopWatcher()
  watcherVk = vk
  watcherToggleVk = toggleVk
  lastVk = vk
  lastToggleVk = toggleVk
  watcher = spawn(
    'powershell.exe',
    [
      '-STA',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-Vk',
      String(vk),
      '-OutFile',
      snipPath,
      '-ToggleVk',
      String(toggleVk),
    ],
    { windowsHide: true },
  )

  watcher.stdout?.on('data', (chunk: Buffer) => {
    watcherBuf += chunk.toString('utf8')
    const lines = watcherBuf.split(/\r?\n/)
    watcherBuf = lines.pop() ?? ''
    for (const line of lines) {
      const token = line.trim()
      if (token) onWatcherLine(token)
    }
  })
  watcher.stderr?.on('data', (chunk: Buffer) => {
    console.error('[snip]', chunk.toString('utf8'))
  })
  watcher.on('exit', () => {
    if (watcher && watcher.exitCode !== null) watcher = null
  })
}

function addClient(res: ServerResponse, vk: number, toggleVk: number) {
  if (stopTimer) {
    clearTimeout(stopTimer)
    stopTimer = null
  }
  lastVk = vk
  lastToggleVk = toggleVk
  clients.add(res)
  ensureWatcher(vk, toggleVk)
}

function removeClient(res: ServerResponse) {
  clients.delete(res)
  if (clients.size > 0 || armed) return
  scheduleStopWatcher()
}

function readJsonBody(req: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function openSnippingTool() {
  try {
    fs.writeFileSync(armPath, '1')
  } catch {
    /* ignore */
  }
}

function rememberKeys(url: string) {
  const parsed = new URL(url, 'http://localhost')
  const vk = Number(parsed.searchParams.get('vk'))
  const toggleVk = Number(parsed.searchParams.get('toggleVk') ?? '0')
  if (Number.isInteger(vk) && vk > 0) lastVk = vk
  if (Number.isInteger(toggleVk) && toggleVk >= 0) lastToggleVk = toggleVk
}

function attachHotkeyEndpoint(server: { middlewares: ViteDevServer['middlewares'] }) {
  try {
    fs.unlinkSync(enabledPath)
  } catch {
    /* ignore */
  }
  try {
    writeOverlayFile({ status: 'hide' })
  } catch {
    /* ignore */
  }
  server.middlewares.use((req, res, next) => {
    const url = req.url ?? ''

    if (url.startsWith('/api/translate')) {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end(JSON.stringify({ error: 'POST kerak' }))
        return
      }
      void readJsonBody(req)
        .then(async (body) => {
          const result = await translateWithGemini(String(body.apiKey ?? ''), String(body.image ?? ''))
          lastResult = {
            id: newId(),
            createdAt: Date.now(),
            image: String(body.image ?? ''),
            original: result.original,
            translation: result.translation,
            note: result.note,
          }
          pushOverlay({
            status: 'done',
            translation: result.translation,
            note: result.note,
          })
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Tarjima muvaffaqiyatsiz'
          pushOverlay({ status: 'error', error: message })
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: message }))
        })
      return
    }

    if (url.startsWith('/api/last')) {
      if (!lastResult) {
        res.statusCode = 404
        res.end('no result')
        return
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(lastResult))
      return
    }

    if (url.startsWith('/api/armed')) {
      const parsed = new URL(url, 'http://localhost')
      const onParam = parsed.searchParams.get('on')
      rememberKeys(url)
      if (onParam === null) {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ on: armed }))
        return
      }
      setArmed(onParam === '1')
      res.statusCode = 204
      res.end()
      return
    }

    if (url.startsWith('/api/snip/open')) {
      openSnippingTool()
      res.statusCode = 204
      res.end()
      return
    }

    if (url.startsWith('/api/snip')) {
      if (!fs.existsSync(snipPath)) {
        res.statusCode = 404
        res.end('no snip')
        return
      }
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Cache-Control', 'no-store')
      fs.createReadStream(snipPath).pipe(res)
      return
    }

    if (!url.startsWith('/api/hotkey')) {
      next()
      return
    }

    const parsed = new URL(url, 'http://localhost')
    const vk = Number(parsed.searchParams.get('vk'))
    const toggleVk = Number(parsed.searchParams.get('toggleVk') ?? '0')
    if (!Number.isInteger(vk) || vk <= 0) {
      res.statusCode = 400
      res.end('vk required')
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })
    res.write('\n')

    if (process.platform !== 'win32') {
      res.write('event: unsupported\ndata: not-windows\n\n')
      return
    }

    addClient(res, vk, Number.isInteger(toggleVk) ? toggleVk : 0)
    const stop = () => removeClient(res)
    req.on('close', stop)
    req.on('aborted', stop)
    res.on('close', stop)
  })
}

function cleanup() {
  stopOverlay()
  stopWatcher()
}

export function globalHotkeyPlugin(): Plugin {
  return {
    name: 'global-hotkey',
    configureServer(server) {
      attachHotkeyEndpoint(server)
      server.httpServer?.on('close', cleanup)
    },
    configurePreviewServer(server) {
      attachHotkeyEndpoint(server)
      server.httpServer?.on('close', cleanup)
    },
  }
}
