import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, ViteDevServer } from 'vite'
import { translateWithGemini } from './gemini.ts'

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../scripts/watch-hotkey.ps1',
)
const snipPath = path.join(os.tmpdir(), 'gametranslator-snip.jpg')
const armPath = `${snipPath}.arm`
const enabledPath = `${snipPath}.on`

const clients = new Set<ServerResponse>()
let watcher: ChildProcess | null = null
let watcherVk = 0
let watcherToggleVk = -1
let watcherBuf = ''
let stopTimer: ReturnType<typeof setTimeout> | null = null

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

function stopWatcher() {
  if (!watcher) return
  killProcess(watcher)
  watcher = null
  watcherVk = 0
  watcherToggleVk = -1
  watcherBuf = ''
}

function ensureWatcher(vk: number, toggleVk: number) {
  if (process.platform !== 'win32') return
  if (watcher && watcherVk === vk && watcherToggleVk === toggleVk && !watcher.killed) return
  stopWatcher()
  watcherVk = vk
  watcherToggleVk = toggleVk
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
      if (token === 'OPEN') broadcast('open')
      if (token === 'SNIP') broadcast('snip')
      if (token === 'CANCEL') broadcast('cancel')
      if (token === 'TOGGLE') broadcast('toggle')
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
  clients.add(res)
  ensureWatcher(vk, toggleVk)
}

function removeClient(res: ServerResponse) {
  clients.delete(res)
  if (clients.size > 0) return
  stopTimer = setTimeout(() => {
    if (clients.size === 0) stopWatcher()
  }, 500)
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

function attachHotkeyEndpoint(server: { middlewares: ViteDevServer['middlewares'] }) {
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
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Tarjima muvaffaqiyatsiz'
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: message }))
        })
      return
    }

    if (url.startsWith('/api/armed')) {
      const on = new URL(url, 'http://localhost').searchParams.get('on') === '1'
      try {
        if (on) fs.writeFileSync(enabledPath, '1')
        else fs.unlinkSync(enabledPath)
      } catch {
        /* ignore */
      }
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

export function globalHotkeyPlugin(): Plugin {
  return {
    name: 'global-hotkey',
    configureServer: attachHotkeyEndpoint,
    configurePreviewServer: attachHotkeyEndpoint,
  }
}
