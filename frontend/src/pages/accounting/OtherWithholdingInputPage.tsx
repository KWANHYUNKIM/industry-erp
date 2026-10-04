import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import CodePickerField from '../../components/CodePickerField'
import EcSlipShell from '../../components/EcSlipShell'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { IncomeType, WithholdingCodeItem, WithholdingPayee, WithholdingSlip } from '../../types/api'

type Kind = 'BUSINESS' | 'INTEREST' | 'OTHER'

type Line = {
  payeeId: string
  incomeCode: string
  grossAmount: string
  expenseRate: string   // '' = '====' (안 고름)
  taxRate: string
  description: string
}

const KINDS: { value: Kind; label: string }[] = [
  { value: 'BUSINESS', label: '사업소득' },
  { value: 'INTEREST', label: '이자배당소득' },
  { value: 'OTHER', label: '기타소득' },
]
/** 원본 세율 선택지 — 사업 3 · 5 · 20(기본 3), 기타 0 · 15 · 20 · 30(기본 0, 소득코드를 고르면 채워진다). */
const TAX_RATES: Record<Kind, string[]> = { BUSINESS: ['3', '5', '20'], OTHER: ['0', '15', '20', '30'], INTEREST: [] }
const EXPENSE_RATES = ['0', '60', '70', '80', '90']

const blankLine = (kind: Kind): Line => ({
  payeeId: '', incomeCode: '', grossAmount: '', expenseRate: '', taxRate: kind === 'BUSINESS' ? '3' : kind === 'OTHER' ? '0' : '14', description: '',
})
const won = (n: number) => (n ? Math.trunc(n).toLocaleString('ko-KR') : '')
const today = () => new Date().toISOString().slice(0, 10)
const floor10 = (n: number) => Math.floor(Math.floor(n) / 10) * 10

/** 서버와 같은 셈 — 필요경비 원 미만 버림, 소득세 · 지방소득세 10원 미만 버림(원본 1,231,233 → 738,739 · 98,490 · 9,840). */
function calc(l: Line, kind: Kind) {
  const gross = Number(l.grossAmount) || 0
  const expense = kind === 'OTHER' && l.expenseRate !== '' ? Math.floor(gross * Number(l.expenseRate) / 100) : 0
  const taxable = gross - expense
  const tax = floor10(taxable * (Number(l.taxRate) || 0) / 100)
  const local = floor10(tax * 0.1)
  return { gross, expense, taxable, tax, local, total: tax + local, net: gross - tax - local }
}

/**
 * 기타원천세입력 (원본 세무 › 기타원천세 › 기타원천세입력 E030314, 2026-10-04 loginaa 실측).
 *
 * <p>머리 [지급일자 · 소득구분 / 귀속연월 · 세무신고사업장 / 지급연월], 아래 격자에 소득자를 여러 줄 넣어 전표 한 장으로 저장한다
 * (전표번호 '지급일자-순번'). 격자 열은 소득구분마다 다르다 —
 * 사업소득 [소득자 · 구분 · 업종구분코드 · 업종명 · 지급총액 · 세율 · 소득세 · 지방소득세 · 합계 · 실지급액 · 적요],
 * 기타소득 [소득자 · 구분 · 소득코드 · 지급액 · 필요경비율 · 필요경비 · 소득금액 · 세율 · 소득세 · 지방소득세 · 합계 · 실지급액 · 적요].
 * 소득자를 고르면 사업소득은 그 소득자의 업종구분코드가, 기타소득은 소득코드를 고르면 원본이 채우는 필요경비율 · 세율이 들어간다
 * (76 강연료 등 → 60% · 20%, 64 → 90% · 20%, 62 처럼 원본도 '====' 로 두는 코드는 사람이 고른다).
 * 아래 [저장(F8) · 다시 작성 · 리스트]. 지급총액이 빈 줄에서 막는 문구는 원본 그대로 '지급총액을 입력바랍니다.'.
 *
 * <p>원본에 있는데 두지 않은 것: 비거주자사업기타소득(우리에게 그 소득구분이 없다) · 이자배당의 계좌번호 · 과세구분 ·
 * 조세특례 · 금융상품 · 유가증권 등 지급명세서 전용 칸 · [찾기(F3)] · [소액부징수] · [과세최저한] · [웹자료올리기] · 농어촌특별세.
 */
export default function OtherWithholdingInputPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editing = params.get('date') && params.get('seq') ? { date: params.get('date')!, seq: Number(params.get('seq')) } : null

  const [payDate, setPayDate] = useState(today())
  const [kind, setKind] = useState<Kind>('BUSINESS')
  const [attributionMonth, setAttributionMonth] = useState(today().slice(0, 7))
  const [payMonth, setPayMonth] = useState(today().slice(0, 7))
  const [lines, setLines] = useState<Line[]>([blankLine('BUSINESS'), blankLine('BUSINESS'), blankLine('BUSINESS')])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [payees, setPayees] = useState<WithholdingPayee[]>([])
  const [industries, setIndustries] = useState<WithholdingCodeItem[]>([])
  const [otherCodes, setOtherCodes] = useState<WithholdingCodeItem[]>([])
  const [company, setCompany] = useState<{ name: string; bizRegNo: string | null } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api.get<WithholdingPayee[]>('/withholding-payees').then((r) => setPayees(r.data)).catch(() => setPayees([]))
    api.get<WithholdingCodeItem[]>('/withholding-payees/codes/industry').then((r) => setIndustries(r.data)).catch(() => setIndustries([]))
    api.get<WithholdingCodeItem[]>('/withholding-payees/codes/other-income').then((r) => setOtherCodes(r.data)).catch(() => setOtherCodes([]))
    api.get<{ name: string; bizRegNo: string | null } | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])

  useEffect(() => {
    if (!editing) return
    api.get<WithholdingSlip>(`/other-withholdings/slips/${editing.date}/${editing.seq}`)
      .then(({ data: s }) => {
        const k: Kind = s.incomeType === 'BUSINESS' ? 'BUSINESS' : s.incomeType === 'OTHER' ? 'OTHER' : 'INTEREST'
        setPayDate(s.payDate); setKind(k); setAttributionMonth(s.attributionMonth); setPayMonth(s.payMonth)
        setLines([...s.lines.map((l) => ({
          payeeId: l.payeeId ? String(l.payeeId) : '', incomeCode: l.incomeCode ?? '', grossAmount: String(l.grossAmount),
          expenseRate: l.expenseRate == null ? '' : String(Number(l.expenseRate)), taxRate: String(Number(l.taxRate)),
          description: l.description ?? '',
        })), blankLine(k)])
      })
      .catch((e) => setError(extractErrorMessage(e)))
  }, [params])   // eslint-disable-line react-hooks/exhaustive-deps

  function changeKind(k: Kind) {
    setKind(k)
    setLines([blankLine(k), blankLine(k), blankLine(k)])
    setPicked(new Set())
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => {
      const next = ls.map((l, j) => (j === i ? { ...l, ...patch } : l))
      // 마지막 줄에 무엇이든 넣으면 빈 줄을 하나 더 단다(원본 격자처럼 끝이 늘 비어 있다).
      const last = next[next.length - 1]
      if (last.payeeId || last.grossAmount || last.incomeCode) next.push(blankLine(kind))
      return next
    })
  }

  function pickPayee(i: number, id: string) {
    const p = payees.find((x) => String(x.id) === id)
    setLine(i, { payeeId: id, ...(kind === 'BUSINESS' && p?.industryCode ? { incomeCode: p.industryCode } : {}) })
  }

  function pickOtherCode(i: number, code: string) {
    const c = otherCodes.find((x) => x.code === code)
    setLine(i, { incomeCode: code, ...(c ? { expenseRate: c.rate1 ?? '', taxRate: c.rate2 ?? '0' } : {}) })
  }

  function reset() {
    setLines([blankLine(kind), blankLine(kind), blankLine(kind)])
    setPicked(new Set())
    setError('')
  }

  async function save() {
    setError(''); setNotice('')
    const filled = lines.filter((l) => l.payeeId || l.grossAmount || l.incomeCode || l.description)
    if (filled.length === 0 || filled.some((l) => !(Number(l.grossAmount) > 0))) return setError('지급총액을 입력바랍니다.')
    if (kind === 'OTHER' && filled.some((l) => l.expenseRate === '')) return setError('필요경비율을 선택바랍니다.')
    const body = {
      payDate, attributionMonth, payMonth, incomeType: kind as IncomeType,
      lines: filled.map((l) => ({
        payeeId: l.payeeId ? Number(l.payeeId) : null, incomeCode: l.incomeCode || null, grossAmount: Number(l.grossAmount),
        expenseRate: kind === 'OTHER' ? Number(l.expenseRate) : null, taxRate: Number(l.taxRate), description: l.description || null,
      })),
    }
    try {
      const { data } = editing
        ? await api.put<WithholdingSlip>(`/other-withholdings/slips/${editing.date}/${editing.seq}`, body)
        : await api.post<WithholdingSlip>('/other-withholdings/slips', body)
      setNotice(`${data.slipNo} 저장되었습니다.`)
      if (editing) navigate('/accounting/other-withholding')
      else reset()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '기타원천세입력', [kind, lines])
  const sums = lines.map((l) => calc(l, kind))
  const total = sums.reduce((a, s) => ({ gross: a.gross + s.gross, expense: a.expense + s.expense, taxable: a.taxable + s.taxable,
    tax: a.tax + s.tax, local: a.local + s.local, total: a.total + s.total, net: a.net + s.net }),
  { gross: 0, expense: 0, taxable: 0, tax: 0, local: 0, total: 0, net: 0 })
  const allPicked = lines.length > 0 && picked.size === lines.length
  const payeeItems = payees.map((p) => ({ value: String(p.id), code: p.regNoFront, name: p.tradeName ?? p.name }))

  return (
    <EcSlipShell
      title={`기타원천세입력${editing ? ` (${editing.date.replace(/-/g, '/')}-${editing.seq})` : ''}`}
      formTabs={[{ id: 'lines', label: '내역' }]} activeFormTab="lines"
      actions={[
        { label: '저장(F8)', primary: true, onClick: () => void save() },
        { label: '다시 작성', onClick: reset },
        { label: '리스트', onClick: () => navigate('/accounting/other-withholding') },
      ]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <p className="ec-alert mb-[8px]">{notice}</p>}

      <ul className="ec-form mb-[8px]">
        <EcCond label="지급일자">
          <input type="date" className="ec-input w-[150px]" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
        </EcCond>
        <EcCond label="소득구분">
          <select className="ec-input w-full" value={kind} disabled={!!editing} onChange={(e) => changeKind(e.target.value as Kind)}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </EcCond>
        <EcCond label="귀속연월">
          <input type="month" className="ec-input w-[150px]" value={attributionMonth} onChange={(e) => setAttributionMonth(e.target.value)} />
        </EcCond>
        <EcCond label="세무신고사업장">
          <input className="ec-input w-full" disabled value={`${company?.bizRegNo ?? ''} ${company?.name ?? ''}`.trim()} />
        </EcCond>
        <EcCond label="지급연월">
          <input type="month" className="ec-input w-[150px]" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} />
        </EcCond>
      </ul>

      <div className="flex gap-[4px] mb-[4px]">
        <button className="ec-btn ec-btn-sm" disabled={picked.size === 0}
                onClick={() => { setLines((ls) => { const n = ls.filter((_, i) => !picked.has(i)); return n.length ? n : [blankLine(kind)] }); setPicked(new Set()) }}>
          선택삭제
        </button>
      </div>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full">
          <thead>
            <tr>
              <th className="w-[40px] text-center">
                <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                       onChange={() => setPicked(allPicked ? new Set() : new Set(lines.map((_, i) => i)))} />
              </th>
              <th className="text-center">소득자</th>
              <th className="text-center">구분</th>
              {kind === 'BUSINESS' && <><th className="text-center">업종구분코드</th><th className="text-center">업종명</th><th className="text-right">지급총액</th></>}
              {kind === 'OTHER' && <><th className="text-center">소득코드</th><th className="text-right">지급액</th><th className="text-center">필요경비율(%)</th>
                <th className="text-right">필요경비</th><th className="text-right">소득금액</th></>}
              {kind === 'INTEREST' && <><th className="text-center">소득코드</th><th className="text-right">소득금액</th></>}
              <th className="text-center">세율{kind === 'BUSINESS' ? '' : '(%)'}</th>
              <th className="text-right">{kind === 'INTEREST' ? '세액' : '소득세'}</th>
              <th className="text-right">지방소득세</th>
              <th className="text-right">합계</th>
              <th className="text-right">실지급액</th>
              <th className="text-center">적요</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const s = sums[i]
              const payee = payees.find((p) => String(p.id) === l.payeeId)
              return (
                <tr key={i}>
                  <td className="text-center whitespace-nowrap">
                    <input type="checkbox" aria-label={`${i + 1}줄 선택`} checked={picked.has(i)}
                           onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n })} />
                    {' '}{i + 1}
                  </td>
                  <td className="min-w-[160px]">
                    <CodePickerField label="소득자" hideLabel fill emptyLabel="(없음)" value={l.payeeId}
                                     onChange={(v) => pickPayee(i, v)} items={payeeItems} />
                  </td>
                  <td className="text-center">{payee ? payee.kindName.replace(' ', '') : ''}</td>
                  {kind === 'BUSINESS' && <>
                    <td className="min-w-[150px]">
                      <CodePickerField label="업종구분코드" hideLabel fill emptyLabel="(없음)" value={l.incomeCode}
                                       onChange={(v) => setLine(i, { incomeCode: v })}
                                       items={industries.map((c) => ({ value: c.code, code: c.code, name: c.name }))} />
                    </td>
                    <td>{industries.find((c) => c.code === l.incomeCode)?.name ?? ''}</td>
                  </>}
                  {kind !== 'BUSINESS' && (
                    <td className="min-w-[120px]">
                      {kind === 'OTHER'
                        ? <CodePickerField label="소득코드" hideLabel fill emptyLabel="(없음)" value={l.incomeCode}
                                           onChange={(v) => pickOtherCode(i, v)}
                                           items={otherCodes.map((c) => ({ value: c.code, code: c.code, name: c.name }))} />
                        : <input className="ec-input w-full" value={l.incomeCode} onChange={(e) => setLine(i, { incomeCode: e.target.value })} />}
                    </td>
                  )}
                  <td>
                    <input className="ec-input w-full min-w-[100px] text-right" inputMode="numeric" min={1} value={l.grossAmount}
                           onChange={(e) => setLine(i, { grossAmount: e.target.value.replace(/\D/g, '') })} />
                  </td>
                  {kind === 'OTHER' && <>
                    <td>
                      <select className="ec-input w-full" value={l.expenseRate} onChange={(e) => setLine(i, { expenseRate: e.target.value })}>
                        <option value="">====</option>
                        {EXPENSE_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                      </select>
                    </td>
                    <td className="text-right">{won(s.expense)}</td>
                    <td className="text-right">{won(s.taxable)}</td>
                  </>}
                  <td>
                    {kind === 'INTEREST'
                      ? <input className="ec-input w-[60px] text-right" value={l.taxRate} onChange={(e) => setLine(i, { taxRate: e.target.value.replace(/[^\d.]/g, '') })} />
                      : <select className="ec-input w-full" value={l.taxRate} onChange={(e) => setLine(i, { taxRate: e.target.value })}>
                          {TAX_RATES[kind].map((r) => <option key={r} value={r}>{r}%</option>)}
                        </select>}
                  </td>
                  <td className="text-right">{won(s.tax)}</td>
                  <td className="text-right">{won(s.local)}</td>
                  <td className="text-right">{won(s.total)}</td>
                  <td className="text-right">{won(s.gross ? s.net : 0)}</td>
                  <td>
                    <input className="ec-input w-full min-w-[100px]" maxLength={200} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                  </td>
                </tr>
              )
            })}
            <tr className="ec-total">
              <td colSpan={kind === 'BUSINESS' ? 5 : 4} />
              <td className="text-right">{won(total.gross)}</td>
              {kind === 'OTHER' && <><td /><td className="text-right">{won(total.expense)}</td><td className="text-right">{won(total.taxable)}</td></>}
              <td />
              <td className="text-right">{won(total.tax)}</td>
              <td className="text-right">{won(total.local)}</td>
              <td className="text-right">{won(total.total)}</td>
              <td className="text-right">{won(total.net)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </EcSlipShell>
  )
}
