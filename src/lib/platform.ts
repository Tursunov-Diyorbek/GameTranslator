export async function detectNative() {
  try {
    const res = await fetch('/api/platform')
    if (!res.ok) return false
    const body = (await res.json()) as { native?: boolean }
    return Boolean(body.native)
  } catch {
    return false
  }
}
