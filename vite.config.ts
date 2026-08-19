import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend to'liq Rust tomonda (src-tauri) — Vite faqat UI'ni beradi.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    // Tauri devUrl aynan shu portga qaraydi.
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
