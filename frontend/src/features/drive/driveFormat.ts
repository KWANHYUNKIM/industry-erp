import { pad2 } from '../../utils/periods'

/** 원본 ECDrive 의 일시 — '2026/10/03 오후 6:34:41'(목록 · 버전/이력 · 상세보기가 같다). */
export function driveStamp(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${d.toLocaleTimeString('ko-KR')}`
}

/**
 * 원본 ECDrive 의 크기 — 늘 KB 정수(목록 · 버전/이력 · 상세보기 · 사용용량이 같다). 2026-10-14 47바이트 파일을 올리니
 * 목록 '0KB', 이력 '0KB', 상세보기 '0KB'. 우리는 '47 B' 로 찍었다.
 * 2026-10-20: 1,500,200 바이트 파일은 목록 · 버전관리 · 버전/이력 모두 '1.4MB'(1 MB = 1,048,576 — 소수 한 자리).
 */
export function driveSize(b: number) {
  const n = Math.max(b, 0)
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}MB`
  return `${Math.round(n / 1024).toLocaleString()}KB`
}
