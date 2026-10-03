import { formatDays } from '../../../utils/dayCount'

export interface CodeUseBlock {
  emp: { id: number; name: string }
  grant: number | null
  lines: { id: number; docNo: string; reason: string | null; days: number }[]
}

/**
 * 휴가사용실적현황(원본 E020719) 휴가코드 꼴 — 사원마다 한 장. 머리 '회사명 : … / 휴가명 / 사원',
 * 격자 전표번호 · 적요 · 휴가일수 · 휴가사용일수 · 휴가잔여일수, 첫 줄 [휴가](부여), 근태마다 잔여가 줄고 끝에 합계.
 */
export default function VacationCodeUseReport({ blocks, companyName, vacationName }: {
  blocks: CodeUseBlock[]; companyName: string; vacationName: string
}) {
  const days = formatDays
  return (
    <div>
      {blocks.map((b) => {
        let remain = b.grant ?? 0
        const used = b.lines.reduce((t, l) => t + Number(l.days), 0)
        return (
          <div key={b.emp.id} className="mb-[16px]">
            <div className="mb-[4px]">회사명 : {companyName} / {vacationName} / {b.emp.name}</div>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="w-[160px]">전표번호</th>
                  <th>적요</th>
                  <th className="w-[120px] text-right">휴가일수</th>
                  <th className="w-[120px] text-right">휴가사용일수</th>
                  <th className="w-[120px] text-right">휴가잔여일수</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>[휴가]</td>
                  <td></td>
                  <td className="text-right">{b.grant != null ? days(b.grant) : ''}</td>
                  <td className="text-right"></td>
                  <td className="text-right">{b.grant != null ? days(b.grant) : ''}</td>
                </tr>
                {b.lines.map((l) => {
                  remain -= Number(l.days)
                  return (
                    <tr key={l.id}>
                      <td>{l.docNo}</td>
                      <td>{l.reason ?? ''}</td>
                      <td className="text-right"></td>
                      <td className="text-right">{days(l.days)}</td>
                      <td className="text-right">{days(remain)}</td>
                    </tr>
                  )
                })}
                <tr className="font-bold">
                  <td colSpan={2}>합계</td>
                  <td className="text-right">{b.grant != null ? days(b.grant) : ''}</td>
                  <td className="text-right">{used ? days(used) : ''}</td>
                  <td className="text-right">{b.grant != null || used ? days((b.grant ?? 0) - used) : ''}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
