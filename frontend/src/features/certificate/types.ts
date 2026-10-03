/** 각종증명서 — 서버 CertificateDtos.CertificateResponse. */
export type CertificateKind = 'EMPLOYMENT' | 'RESIGNATION' | 'CAREER'

export interface Certificate {
  id: number
  issueNo: string
  kind: CertificateKind
  kindName: string
  employeeId: number
  employeeCode: string
  employeeName: string
  address: string | null
  department: string
  jobTitle: string
  hireDate: string | null
  resignDate: string | null
  purpose: string | null
  issueDate: string
}

/** 원본 [증명서종류] 드롭다운 차례. */
export const CERTIFICATE_KINDS: [CertificateKind, string][] = [
  ['EMPLOYMENT', '재직증명서'], ['RESIGNATION', '퇴직증명서'], ['CAREER', '경력증명서'],
]
