/** 서버 /api/company 에서 쓰는 칸만. */
export type CompanyInfo = { name?: string; ceo?: string; address?: string; addressDetail?: string }

/** 2026-10-03 → '2026년 10월 03일'(원본 증명서 글자 그대로). */
const longDate = (d: string | null | undefined) => (d ? `${d.slice(0, 4)}년 ${d.slice(5, 7)}월 ${d.slice(8, 10)}일` : '')

export interface CertificateDocData {
  issueNo: string
  kindName: string
  employeeName: string
  address: string | null
  department: string
  jobTitle: string
  hireDate: string | null
  /** 재직증명서는 발행일까지, 퇴직 · 경력증명서는 퇴사일까지(경력증명서는 아직 다니면 비어 '입사일~' 로 찍힌다) */
  endDate: string | null
  purpose: string | null
  issueDate: string
}

/**
 * 원본 E020606 '증명서 확인' 판의 증명서 — 2026-10-03 loginaa 재직증명서 실측:
 * 위에 '발급번호 : 2026-1호', 테두리 표 안에 밑줄 친 제목(재 직 증 명 서), 성 명 · 주민등록번호 · 현 주 소 · 소 속 · 직 위 ·
 * 근무기간(2024년 10월 01일~2026년 10월 03일) · 용 도, '위와 같이 증명합니다.', 발행일, 회사 주소 · 대 표 이 사 · 회사명.
 * 경력증명서(2026-10-04 실측)도 같은 판 — 제목 '경 력 증 명 서', 재직 중이면 근무기간이 '2019년 01월 05일~' 로 끝이 빈다.
 * 원본은 대표이사 옆에 회사 직인 그림이 찍힌다(우리는 직인 그림이 없다).
 * 주민등록번호는 우리 사원에 없어 비워 둔다(원본 회사 자료도 비어 있었다). 원본은 이 판을 편집기로 고칠 수 있다 — 우리는 보기만.
 */
export default function CertificateDoc({ d, company }: { d: CertificateDocData; company: CompanyInfo | null }) {
  const spaced = d.kindName.split('').join(' ')  // 원본 '재 직 증 명 서'
  const row = (label: string, value: string) => (
    <tr>
      <th className="w-[180px] text-center font-bold bg-transparent">{label}</th>
      <td>{value}</td>
    </tr>
  )
  return (
    <div className="max-w-[650px] bg-ec-panel text-ec-ink">
      <div className="mb-[2px]">발급번호 : {d.issueNo ? `${d.issueNo}호` : ''}</div>
      <table className="w-full border border-solid border-ec-ink [&_td]:border [&_td]:border-solid [&_td]:border-ec-ink [&_th]:border [&_th]:border-solid [&_th]:border-ec-ink [&_td]:h-[40px] [&_th]:h-[40px]">
        <tbody>
          <tr><td colSpan={2} className="text-center py-[60px]"><span className="text-[24px] font-bold underline tracking-[4px]">{spaced}</span></td></tr>
          {row('성 명', d.employeeName)}
          {row('주민등록번호', '')}
          {row('현 주 소', d.address ?? '')}
          {row('소 속', d.department)}
          {row('직 위', d.jobTitle)}
          {row('근무기간', d.hireDate ? `${longDate(d.hireDate)}~${longDate(d.endDate)}` : '')}
          {row('용 도', d.purpose ?? '')}
          <tr>
            <td colSpan={2} className="text-center">
              <p className="font-bold text-[16px] my-[24px]">위와 같이 증명합니다.</p>
              <p className="mt-[200px] mb-[40px]">{longDate(d.issueDate)}</p>
              <p className="mb-[10px]">{[company?.address, company?.addressDetail].filter(Boolean).join(' ')}</p>
              <p className="mb-[10px]">대 표 이 사 {company?.ceo ?? ''}</p>
              <p className="mb-[40px]">{company?.name ?? ''}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
