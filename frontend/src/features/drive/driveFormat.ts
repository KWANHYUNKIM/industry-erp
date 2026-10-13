const pad2 = (n: number) => String(n).padStart(2, '0')

/** 원본 ECDrive 의 일시 — '2026/10/03 오후 6:34:41'(목록 · 버전/이력 · 상세보기가 같다). */
export function driveStamp(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${d.toLocaleTimeString('ko-KR')}`
}

/**
 * 원본 ECDrive 의 크기 — 늘 KB 정수(목록 · 버전/이력 · 상세보기 · 사용용량이 같다). 2026-10-14 47바이트 파일을 올리니
 * 목록 '0KB', 이력 '0KB', 상세보기 '0KB'. 우리는 '47 B' 로 찍었다. MB 로 넘어가는지는 큰 파일을 안 올려 못 쟀다.
 */
export function driveSize(b: number) {
  return `${Math.round(Math.max(b, 0) / 1024).toLocaleString()}KB`
}
