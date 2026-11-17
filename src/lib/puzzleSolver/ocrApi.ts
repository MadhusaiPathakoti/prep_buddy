// Screenshot → puzzle text. The image is downscaled in the browser (long side 1600px, JPEG) so the upload stays small and
// fast, then sent to /api/puzzleOcr, which asks Gemini to transcribe it. The result is only text for the user to review.

export type OcrResult = { ok: true; text: string } | { ok: false; error: string }

const MAX_SIDE = 1600
const REQUEST_TIMEOUT_MS = 50000
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

async function toJpegBase64(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  // JPEG has no transparency: paint a white page first so a transparent screenshot does not turn black
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new Error('encode failed')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export type OcrKind = 'puzzle' | 'syllogism'

export async function readPuzzleImage(file: Blob, kind: OcrKind = 'puzzle'): Promise<OcrResult> {
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, error: 'Please use a PNG, JPEG or WebP image.' }
  let image: string
  try {
    image = await toJpegBase64(file)
  } catch {
    return { ok: false, error: 'That image could not be opened.' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch('/api/puzzleOcr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, mime: 'image/jpeg', kind }),
      signal: controller.signal,
    })
    const data = await res.json().catch(() => null)
    if (res.ok && data && typeof data.text === 'string') return { ok: true, text: data.text }
    if (res.status === 429) return { ok: false, error: 'Too many screenshots in a short time — wait a minute, or paste the text instead.' }
    if (res.status === 404) return { ok: false, error: 'Reading screenshots needs the app server. Paste the puzzle text instead.' }
    return { ok: false, error: typeof data?.error === 'string' ? data.error : 'Could not read the image. Paste the puzzle text instead.' }
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError'
    return { ok: false, error: timedOut ? 'Reading the image took too long. Try a tighter crop, or paste the text.' : 'Could not reach the server. Paste the puzzle text instead.' }
  } finally {
    clearTimeout(timer)
  }
}
