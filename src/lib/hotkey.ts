export function normalizeHotkey(raw: string): string {
  if (!raw) return 'KeyT'
  if (/^Key[A-Z]$/.test(raw) || /^F([1-9]|1[0-2])$/.test(raw) || /^Digit[0-9]$/.test(raw) || raw === 'Space') {
    return raw
  }

  const letter = raw.trim().toLowerCase()
  if (/^[a-z]$/.test(letter)) return `Key${letter.toUpperCase()}`

  const f = raw.toUpperCase().match(/^F([1-9]|1[0-2])$/)
  if (f) return `F${f[1]}`

  return 'KeyT'
}

export function hotkeyLabel(code: string): string {
  const n = normalizeHotkey(code)
  if (n.startsWith('Key')) return n.slice(3)
  if (n.startsWith('Digit')) return n.slice(5)
  if (n === 'Space') return 'Space'
  return n
}

export function codeToVk(code: string): number | null {
  const n = normalizeHotkey(code)
  if (/^Key[A-Z]$/.test(n)) return n.charCodeAt(3)
  if (/^Digit[0-9]$/.test(n)) return 0x30 + Number(n.slice(5))
  if (n === 'Space') return 0x20
  const f = n.match(/^F([1-9]|1[0-2])$/)
  if (f) return 0x70 + Number(f[1]) - 1
  return null
}

export function eventMatchesHotkey(e: KeyboardEvent, hotkey: string): boolean {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return false
  return e.code === normalizeHotkey(hotkey)
}

export function eventToHotkey(e: KeyboardEvent): string | null {
  if (['Shift', 'Control', 'Alt', 'Meta', 'Escape', 'Tab', 'Enter', 'Backspace'].includes(e.key)) {
    return null
  }
  if (/^Key[A-Z]$/.test(e.code) || /^F([1-9]|1[0-2])$/.test(e.code) || /^Digit[0-9]$/.test(e.code) || e.code === 'Space') {
    return e.code
  }
  return null
}
