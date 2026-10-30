/**
 * 올리기 전에 사진을 줄인다.
 *
 * 올린 파일은 회사 스키마의 DB 에 bytea 로 들어간다(FileStorageService · 한 개 10MB).
 * 휴대폰 사진 한 장이 3~8MB 라 그대로 두면 DB 와 백업이 사진으로 불어난다.
 * 화면에서 보는 데는 긴 변 1600px · JPEG 0.85 면 충분해서, 브라우저에서 캔버스로 줄여 올린다.
 *
 * - JPEG · PNG · WebP 만 손댄다. GIF(움직임) · SVG · 그 밖의 파일은 그대로.
 * - 작고(기준 아래) 이미 긴 변 안인 그림은 그대로.
 * - 투명한 PNG 는 PNG 로 남긴다(로고 · 도장). 투명이 없으면 JPEG 로.
 * - 다시 그린 것이 원본보다 크면 원본을 올린다.
 * - 파일 이름은 그대로, 형식이 바뀌면 확장자만 바꾼다.
 */

export const DEFAULT_MAX_EDGE = 1600
export const DEFAULT_QUALITY = 0.85
/** 이보다 작고 긴 변 안이면 다시 그리지 않는다. */
export const SKIP_BELOW_BYTES = 200 * 1024

const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function isResizableImage(type: string): boolean {
  return RESIZABLE.has(type.toLowerCase())
}

/** 긴 변이 maxEdge 를 넘으면 비율대로 줄인 크기, 아니면 그대로. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= maxEdge || long <= 0) return { width, height }
  const k = maxEdge / long
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

/** 다시 그릴 때의 형식 — 투명이 있는 PNG · WebP 는 형식을 지키고, 나머지는 JPEG. */
export function outputType(inputType: string, hasAlpha: boolean): string {
  const t = inputType.toLowerCase()
  if (hasAlpha && (t === 'image/png' || t === 'image/webp')) return t
  return 'image/jpeg'
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** 형식이 바뀌었으면 확장자만 바꾼다(photo.PNG → photo.jpg). 같은 형식이면 이름 그대로. */
export function renameFor(name: string, fromType: string, toType: string): string {
  if (fromType.toLowerCase() === toType) return name
  const ext = EXT[toType] ?? 'jpg'
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  return `${base}.${ext}`
}

/** 다시 그릴 필요가 있나 — 크거나(바이트) 긴 변을 넘을 때만. */
export function needsRecode(bytes: number, width: number, height: number, maxEdge: number, skipBelow = SKIP_BELOW_BYTES): boolean {
  return bytes >= skipBelow || Math.max(width, height) > maxEdge
}

export interface ShrinkOptions {
  maxEdge?: number
  quality?: number
}

/**
 * 그림이면 줄여서 새 File 을, 아니면(또는 줄어들지 않으면) 받은 File 을 그대로 돌려준다.
 * 실패(디코딩 불가 · 캔버스 없음)해도 원본을 돌려준다 — 올리기를 막지 않는다.
 */
export async function shrinkImage(file: File, opts: ShrinkOptions = {}): Promise<File> {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE
  const quality = opts.quality ?? DEFAULT_QUALITY
  if (!isResizableImage(file.type) || typeof createImageBitmap !== 'function') return file
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    if (!needsRecode(file.size, bitmap.width, bitmap.height, maxEdge)) return file
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    const alpha = file.type !== 'image/jpeg' && hasTransparency(ctx, width, height)
    const type = outputType(file.type, alpha)
    if (type === 'image/jpeg') {
      // 투명이 없다고 봤지만 혹시 남은 반투명이 검게 나오지 않게 흰 바탕 위에 다시 그린다.
      ctx.globalCompositeOperation = 'destination-over'
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, width, height)
    }
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], renameFor(file.name, file.type, type), { type, lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    bitmap?.close()
  }
}

function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const data = ctx.getImageData(0, 0, width, height).data
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true
  return false
}
