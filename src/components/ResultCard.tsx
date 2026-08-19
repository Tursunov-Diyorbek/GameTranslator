import { dict } from '../i18n'
import type { TranslationResult } from '../types'

type Props = {
  item: TranslationResult
  uiLang: string
  busy?: boolean
}

function formatTime(ts: number) {
  // Tizim lokali ishlatiladi — vaqt formati interfeys tilidan mustaqil.
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function ResultCard({ item, uiLang, busy }: Props) {
  const t = dict(uiLang)

  return (
    <article className={`result hud-frame ${busy ? 'is-busy' : ''}`}>
      <div className="result-shot">
        <img src={item.image} alt={t.screenshotAlt} />
        <span className="time-chip">{formatTime(item.createdAt)}</span>
      </div>
      <div className="result-body">
        {item.original ? (
          <p className="original">{item.original}</p>
        ) : (
          <p className="original muted">{t.noOriginal}</p>
        )}
        <h3>{item.translation || t.noTranslation}</h3>
        {item.note ? (
          <p className="note">
            <span>{t.note}</span>
            {item.note}
          </p>
        ) : null}
      </div>
    </article>
  )
}
