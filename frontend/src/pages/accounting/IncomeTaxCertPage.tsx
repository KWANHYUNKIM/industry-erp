import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { WithholdingLedgerEmployee } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'

const won = (n: number) => Number(n).toLocaleString('ko-KR')
type Company = { name?: string; ceo?: string; bizRegNo?: string; corpRegNo?: string; address?: string; addressDetail?: string }
type Emp = { id: number; code: string; name: string }
type Slot = { ym: string; pay: string; tax: number; paidOn: string }

/**
 * 소득세확인서 (원본 세무 › 원천징수 › 세무신고 E030103, 2026-10-03 loginaa 실측).
 *
 * 조건 [조회일자 YYYY/MM ~ YYYY/MM(기본 올해 1월 ~ 이번 달) · 사원번호(코드도움, 고르지 않으면 아무것도 안 나온다)] →
 * 「갑종근로소득에 대한 소득세원천징수확인서」. 달마다 ⑫급여액 · ⑬세액 · ⑭납부연월일을 두 단(왼쪽 7칸 · 오른쪽 6칸 + 계)에 찍는다.
 *  - 급여액은 <b>비과세까지 넣은 지급액</b>이다 — 원본 변종호 4,559,000 = 과세 4,259,000 + 비과세 300,000(원천징수부의 총급여와 다르다).
 *  - 세액은 소득세만(지방소득세 빼고): 228,000, 계 2,280,000.
 *  - 급여액 · 납부연월일 · 사용목적 · 제출처 · 소요수량(기본 1) · 세무대리인 칸은 원본도 손으로 고쳐 쓰는 칸이다(저장 안 함).
 */
export default function IncomeTaxCertPage() {
  const thisMonth = ymd(new Date()).slice(0, 7)
  const [from, setFrom] = useState(`${thisMonth.slice(0, 4)}-01`)
  const [to, setTo] = useState(thisMonth)
  const [employeeId, setEmployeeId] = useState('')
  const [emps, setEmps] = useState<Emp[]>([])
  const [company, setCompany] = useState<Company | null>(null)
  const [found, setFound] = useState<{ emp: Emp; slots: Slot[] } | null>(null)
  const [purpose, setPurpose] = useState('')
  const [submitTo, setSubmitTo] = useState('')
  const [count, setCount] = useState('1')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
    api.get<Emp[]>('/employees').then((r) => setEmps(r.data)).catch(() => setEmps([]))
  }, [])

  async function search() {
    setError('')
    const emp = emps.find((e) => String(e.id) === employeeId)
    if (!emp) { setFound(null); return }
    try {
      const data = (await api.get<WithholdingLedgerEmployee[]>('/withholding/ledger', { params: { from, month: to } })).data
      const mine = data.find((e) => e.employeeId === emp.id)
      setFound({
        emp,
        slots: (mine?.months ?? []).map((m) => ({
          ym: m.payMonth, pay: won(Number(m.taxablePay) + Number(m.nonTaxablePay)), tax: Number(m.incomeTax), paidOn: '',
        })),
      })
    } catch (e) {
      setFound(null); setError(extractErrorMessage(e))
    }
  }

  const setSlot = (i: number, patch: Partial<Slot>) =>
    setFound((f) => f && { ...f, slots: f.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const today = ymd(new Date()).split('-')
  const slots = found?.slots ?? []
  const payTotal = slots.reduce((t, s) => t + Number(s.pay.replace(/,/g, '') || 0), 0)
  const taxTotal = slots.reduce((t, s) => t + s.tax, 0)

  const cell = (i: number) => {
    const s = slots[i]
    if (!s) return <><td /><td /><td /><td /></>
    return (
      <>
        <td className="text-center">{s.ym.replace('-', '.')}</td>
        <td><input className="ec-input text-right w-full" value={s.pay} onChange={(e) => setSlot(i, { pay: e.target.value })} /></td>
        <td className="text-right">{won(s.tax)}</td>
        <td><input className="ec-input w-full" value={s.paidOn} onChange={(e) => setSlot(i, { paidOn: e.target.value })} /></td>
      </>
    )
  }

  return (
    <EcListShell title="소득세확인서" option={false} onSearch={search} actions={[{ label: '인쇄' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="조회일자">
          <input type="month" className="ec-input w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>~</span>
          <input type="month" className="ec-input w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} />
        </EcCond>
        <EcCond label="사원번호" pick>
          <CodePickerField label="사원번호" hideLabel value={employeeId} onChange={setEmployeeId} emptyLabel=""
                           items={emps.map((e) => ({ value: String(e.id), code: e.code, name: e.name }))} />
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
          </div>
        </li>
      </ul>

      {found && (
        <table className="w-full ec-report">
          <tbody>
            <tr>
              <th>발급번호</th>
              <th colSpan={6}>갑종근로소득에 대한 소득세원천징수확인서</th>
              <th>처리기간<br />즉 시</th>
            </tr>
            <tr>
              <th rowSpan={2}>납세자</th>
              <th>①성 명</th><td colSpan={2}>{found.emp.name}</td>
              <th>②주민 등록 번호</th><td colSpan={3}></td>
            </tr>
            <tr><th>③주소 또는 거소</th><td colSpan={6}></td></tr>
            <tr>
              <th rowSpan={3}>징수의무자</th>
              <th>④상호 또는 명칭</th><td colSpan={2}>{company?.name ?? ''}</td>
              <th>⑤사업자등록번호</th><td colSpan={3}>{company?.bizRegNo ?? ''}</td>
            </tr>
            <tr><th>⑥사업장 소재지</th><td colSpan={6}>{[company?.address, company?.addressDetail].filter(Boolean).join(' ')}</td></tr>
            <tr>
              <th>⑦대 표 자</th><td colSpan={2}>{company?.ceo ?? ''}</td>
              <th>⑧주민 (법인) 등록번호</th><td colSpan={3}>{company?.corpRegNo ?? ''}</td>
            </tr>
            <tr>
              <th>⑨확인서의 사용 목적</th>
              <td colSpan={2}><input className="ec-input w-full" value={purpose} onChange={(e) => setPurpose(e.target.value)} /></td>
              <th>⑩제 출 처</th>
              <td colSpan={2}><input className="ec-input w-full" value={submitTo} onChange={(e) => setSubmitTo(e.target.value)} /></td>
              <th>⑪소요수량</th>
              <td><input className="ec-input w-[50px] text-right" value={count} onChange={(e) => setCount(e.target.value)} /> 통</td>
            </tr>
            <tr>
              <th>연월</th><th>⑫급여액</th><th>⑬세 액</th><th>⑭납부연월일</th>
              <th>연 월</th><th>급 여 액</th><th>세 액</th><th>납부연월일</th>
            </tr>
            {Array.from({ length: 7 }, (_, r) => (
              <tr key={r}>
                {cell(r)}
                {r < 6 ? cell(r + 7) : (
                  <>
                    <td className="text-center font-bold">계</td>
                    <td className="text-right font-bold">{won(payTotal)}</td>
                    <td className="text-right font-bold">{won(taxTotal)}</td>
                    <td />
                  </>
                )}
              </tr>
            ))}
            <tr>
              <td colSpan={8}>
                발급일 현재 위와 같이 원천징수하였음을 확인하여 주시기 바랍니다.<br />
                {today[0]} 년 {Number(today[1])} 월 {Number(today[2])} 일<br />
                신청인 {found.emp.name} (서명 또는 인)
              </td>
            </tr>
            <tr>
              <td colSpan={8}>
                위와 같이 원천징수하였음을 확인합니다.<br />
                {today[0]} 년 {Number(today[1])} 월 {Number(today[2])} 일<br />
                확인자(원천징수의무자) {company?.name ?? ''} (서명 또는 인)
              </td>
            </tr>
          </tbody>
        </table>
      )}
      {found && slots.length > 13 && (
        <p className="text-[11.5px] text-ec-hint mt-[6px]">* 서식 칸은 13달입니다. 조회일자를 13개월 이내로 잡아 주세요.</p>
      )}
    </EcListShell>
  )
}
