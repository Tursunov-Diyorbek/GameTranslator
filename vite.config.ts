import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { globalHotkeyPlugin } from './server/globalHotkey.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const geminiKey = env.GEMINI_API_KEY?.replace(/^\uFEFF/, '').replace(/^["']+|["']+$/g, '').trim()
  if (geminiKey) process.env.GEMINI_API_KEY = geminiKey

  return {
    plugins: [react(), globalHotkeyPlugin()],
  }
})
