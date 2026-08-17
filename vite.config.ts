import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { globalHotkeyPlugin } from './server/globalHotkey.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY

  return {
    plugins: [react(), globalHotkeyPlugin()],
  }
})
