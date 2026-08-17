import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { CropRect } from '../types'

type Props = {
  src: string
  onCancel: () => void
  onConfirm: (rect: CropRect | null) => void
}

type Point = { x: number; y: number }

function displayedImageBox(img: HTMLImageElement) {
  const parent = img.parentElement
  if (!parent) return null
  const prect = parent.getBoundingClientRect()
  const rect = img.getBoundingClientRect()
  const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight)
  const width = img.naturalWidth * scale
  const height = img.naturalHeight * scale
  return {
    left: rect.left - prect.left + (rect.width - width) / 2,
    top: rect.top - prect.top + (rect.height - height) / 2,
    width,
    height,
    scale,
  }
}

export function CropOverlay({ src, onCancel, onConfirm }: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [origin, setOrigin] = useState<Point | null>(null)
  const [current, setCurrent] = useState<Point | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onConfirm])

  function toImagePoint(e: PointerEvent<HTMLDivElement>): Point | null {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return null
    const box = displayedImageBox(img)
    if (!box) return null
    const parent = img.parentElement
    if (!parent) return null
    const prect = parent.getBoundingClientRect()
    const x = (e.clientX - prect.left - box.left) / box.scale
    const y = (e.clientY - prect.top - box.top) / box.scale
    if (x < 0 || y < 0 || x > img.naturalWidth || y > img.naturalHeight) return null
    return { x, y }
  }

  function finish(from: Point, to: Point) {
    const img = imgRef.current
    if (!img) return
    const x = Math.min(from.x, to.x)
    const y = Math.min(from.y, to.y)
    const w = Math.abs(to.x - from.x)
    const h = Math.abs(to.y - from.y)
    if (w < 12 || h < 12) {
      return
    }
    onConfirm({ x, y, w, h })
  }

  const sel =
    origin && current
      ? {
          x: Math.min(origin.x, current.x),
          y: Math.min(origin.y, current.y),
          w: Math.abs(current.x - origin.x),
          h: Math.abs(current.y - origin.y),
        }
      : null

  const box = imgRef.current && imgRef.current.naturalWidth ? displayedImageBox(imgRef.current) : null

  return (
    <div className="crop-back">
      <div className="crop-toolbar">
        <p>Kerakli joyni sichqoncha bilan belgilang — qo‘yib yuborilishi bilan tarjima boshlanadi.</p>
        <div className="crop-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>
            Bekor (Esc)
          </button>
          <button type="button" className="primary-btn" onClick={() => onConfirm(null)}>
            Butun surat (Enter)
          </button>
        </div>
      </div>

      <div
        className="crop-stage"
        onPointerDown={(e) => {
          const p = toImagePoint(e)
          if (!p) return
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          setOrigin(p)
          setCurrent(p)
        }}
        onPointerMove={(e) => {
          if (!origin) return
          const p = toImagePoint(e)
          if (p) setCurrent(p)
        }}
        onPointerUp={(e) => {
          if (!origin) return
          const p = toImagePoint(e) ?? current ?? origin
          const from = origin
          setOrigin(null)
          setCurrent(null)
          finish(from, p)
        }}
      >
        <img ref={imgRef} src={src} alt="Skrinshot" draggable={false} />
        {sel && box && sel.w > 2 && sel.h > 2 ? (
          <div
            className="crop-rect"
            style={{
              left: box.left + sel.x * box.scale,
              top: box.top + sel.y * box.scale,
              width: sel.w * box.scale,
              height: sel.h * box.scale,
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
