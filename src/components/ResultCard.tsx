import type { TranslationResult } from '../types'

type Props = {
  item: TranslationResult
  busy?: boolean
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('uz-UZ', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function ResultCard({ item, busy }: Props) {
  return (
    <article className={`result hud-frame ${busy ? 'is-busy' : ''}`}>
      <div className="result-shot">
        <img src={item.image} alt="Olingan skrinshot" />
        <span className="time-chip">{formatTime(item.createdAt)}</span>
      </div>
      <div className="result-body">
        {item.original ? (
          <p className="original">{item.original}</p>
        ) : (
          <p className="original muted">Asl matn topilmadi</p>
        )}
        <h3>{item.translation || 'Tarjima yo‘q'}</h3>
        {item.note ? (
          <p className="note">
            <span>Izoh</span>
            {item.note}
          </p>
        ) : null}
      </div>
    </article>
  )
}
