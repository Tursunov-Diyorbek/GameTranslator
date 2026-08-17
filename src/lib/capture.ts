import type { CropRect } from '../types'

export function grabFrame(video: HTMLVideoElement): HTMLCanvasElement {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('Ekran oqimi hali tayyor emas')
  }

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas ishlamadi')
  ctx.drawImage(video, 0, 0)
  return canvas
}

export function cropCanvas(source: HTMLCanvasElement, rect: CropRect): HTMLCanvasElement {
  const x = Math.max(0, Math.round(rect.x))
  const y = Math.max(0, Math.round(rect.y))
  const w = Math.max(1, Math.min(source.width - x, Math.round(rect.w)))
  const h = Math.max(1, Math.min(source.height - y, Math.round(rect.h)))

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Canvas ishlamadi')
  ctx.drawImage(source, x, y, w, h, 0, 0, w, h)
  return out
}

export function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality = 0.75,
  maxSide = 1280,
): string {
  const { width, height } = canvas
  const longest = Math.max(width, height)
  const scale = longest > maxSide ? maxSide / longest : 1

  if (scale < 1) {
    const out = document.createElement('canvas')
    out.width = Math.max(1, Math.round(width * scale))
    out.height = Math.max(1, Math.round(height * scale))
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('Canvas ishlamadi')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(canvas, 0, 0, out.width, out.height)
    return out.toDataURL('image/jpeg', quality)
  }

  return canvas.toDataURL('image/jpeg', quality)
}
