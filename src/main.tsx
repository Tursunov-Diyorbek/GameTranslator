import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './overlay.css'
import App from './App.tsx'
import { Overlay } from './components/Overlay.tsx'

// Bitta bundle ikki oynaga xizmat qiladi: asosiy oyna va o'yin ustidagi overlay.
const isOverlay = window.location.hash === '#overlay'
if (isOverlay) document.body.classList.add('is-overlay')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isOverlay ? <Overlay /> : <App />}</StrictMode>,
)
