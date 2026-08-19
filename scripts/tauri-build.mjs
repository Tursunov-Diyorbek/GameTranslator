// Updater kaliti parolsiz bo'lsa, Tauri CLI `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` ni
// topa olmaydi va parolni konsoldan so'raydi — avtomatik build shu joyda qotib qoladi.
// Windows'da bo'sh muhit o'zgaruvchisini shelldan berishning yo'li yo'q (PowerShell uni
// o'chirib yuboradi), lekin Node bola jarayonning muhit blokiga bo'sh qiymatni yozib beradi.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url))

const child = spawn(process.execPath, [cli, 'build', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '',
  },
})

child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
