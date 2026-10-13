const pad2 = (n: number) => String(n).padStart(2, '0')

/** 원본 ECDrive 의 일시 — '2026/10/03 오후 6:34:41'(목록 · 버전/이력 · 상세보기가 같다). */
export function driveStamp(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${d.toLocaleTimeString('ko-KR')}`
}

export function driveSize(b: number) {
  if (b <= 0) return '-'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}
