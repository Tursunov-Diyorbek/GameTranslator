export function imageFingerprint(dataUrl: string) {
  return `${dataUrl.length}:${dataUrl.slice(80, 140)}:${dataUrl.slice(-48)}`
}

export async function readClipboardImage() {
  if (!navigator.clipboard?.read) return null
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find((name) => name.startsWith('image/'))
    if (!type) continue
    const blob = await item.getType(type)
    const dataUrl = await blobToDataUrl(blob)
    return dataUrl
  }
  return null
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
