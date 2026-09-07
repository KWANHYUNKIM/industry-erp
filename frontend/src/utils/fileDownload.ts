import { api } from '../api/client'

/**
 * 첨부파일 다운로드. `<a href>` 로는 JWT 헤더가 실리지 않아 401 이 나므로,
 * axios 로 blob 을 받아 임시 URL 을 만들어 내려받는다.
 */
export async function downloadStoredFile(fileId: number, fallbackName = 'download') {
  const res = await api.get(`/files/${fileId}`, { responseType: 'blob' })
  const disposition = String(res.headers['content-disposition'] ?? '')
  const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  const name = match ? decodeURIComponent(match[1]) : fallbackName

  const url = window.URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

/** 사람이 읽는 파일 크기 */
export function formatBytes(b: number | null | undefined): string {
  if (!b || b <= 0) return '-'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}
