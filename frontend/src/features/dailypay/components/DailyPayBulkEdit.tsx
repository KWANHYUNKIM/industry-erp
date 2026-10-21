import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import EcNumInput from '../../../components/EcNumInput'
import { api, extractErrorMessage } from '../../../api/client'
import type { DailyWorkerRow } from './DailyDirectAmount'
import { ecAlert } from '../../../components/EcDialog'

export interface DailyPayLineRow {
  id: number; workerId: number; workerCode: string; workerName: string; days: number; dailyWage: number | null
  grossPay: number; incomeTax: number; localTax: number; netPay: number; direct: boolean
  /** 일근무 금액 · 공제총액 · 일근무 밖 항목(2026-10-21 — 수당등록 · 공제등록에서 더한 것) */
  dayPay?: number; deductionTotal?: number
  items?: { itemId: number; kind: 'ALLOWANCE' | 'DEDUCTION'; code: string; name: string; sortOrder: number; quantity: number | null; amount: number }[]
}
interface Ledger { id: number; payMonth: string; seq: number; paidMonth: string }
type Field = 'days' | 'grossPay' | 'incomeTax' | 'localTax'

const won = (n: number) => Number(n).toLocaleString('ko-KR')
const slash = (s: string) => s.replace(/-/g, '/')

/**
 * 관리 &gt; 일용근로 급여계산/대장 &gt; 급여대장 <b>[일괄수정]</b> (원본 E020139, 2026-10-12 실측).
 *
 * <p>① '급여수정 대상자 선택' — 그 대장에 줄이 있는 사원(사원번호 · 성명 · 부서명 · 입사일자 · 퇴사일자)에 체크하고 [적용].
 * ② '급여내역수정' — 머리 귀속연월 'YYYY/MM - n' · 지급연월 · 원천세신고 사업자번호, 격자 사원번호 · 사원명 · 실지급액 ·
 * 지급총액/공제총액(두 줄) · 총근무일수 · 일근무(일수 · 금액), 우리 대장은 소득세 · 지방소득세 칸을 더 둔다. 고친 칸은 붉어지고
 * 지급총액 · 공제총액 · 실지급액만 합으로 바뀐다. [저장(F8)] — 금액직접입력으로 셈한 사원이면 원본 확인 창
 * '금액직접입력을 통해 계산한 금액 변경시 금액직접입력에 입력한 금액도 함께 변경됩니다. 저장하겠습니까?', 저장하면 창이 닫힌다.
 *
 * <p>원본 최종근무일 칸은 우리 대장 줄에 최종근무일이 없어(근무입력에서 셈한다) 고치지 못한다. [사전작업▲] · [삭제] 는 아직 없다.
 */
export default function DailyPayBulkEdit({ ledger, bizRegNo, onClose, onSaved, lineIds }: {
  ledger: Ledger | null; bizRegNo: string; onClose: () => void; onSaved: () => void
  /** 사원별급여조회 [귀속연월] 링크 — 대상자 선택 없이 그 줄만 '급여내역수정' 으로 연다(원본 E020135 실측). */
  lineIds?: number[]
}) {
  const [lines, setLines] = useState<DailyPayLineRow[]>([])
  const [workers, setWorkers] = useState<DailyWorkerRow[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<DailyPayLineRow[] | null>(null)
  const [vals, setVals] = useState<Map<string, string>>(new Map())
  const [ask, setAsk] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ledger) return
    setError(''); setChecked(new Set()); setQuery(''); setEditing(null); setVals(new Map())
    Promise.all([
      api.get<DailyPayLineRow[]>(`/hr/daily-pay-ledgers/${ledger.id}/lines`),
      api.get<DailyWorkerRow[]>('/hr/daily-workers'),
    ]).then(([l, w]) => {
      setLines(l.data); setWorkers(w.data)
      if (lineIds) setEditing(l.data.filter((x) => lineIds.includes(x.id)))
    }).catch((e) => setError(extractErrorMessage(e)))
  }, [ledger])

  const worker = (id: number) => workers.find((w) => w.id === id)
  const pickRows = lines.filter((l) => !query || [l.workerCode, l.workerName, worker(l.workerId)?.department ?? ''].some((v) => v.includes(query)))

  function apply() {
    const picked = lines.filter((l) => checked.has(l.id))
    if (picked.length === 0) { void ecAlert('선택된 사원이 없습니다.'); return }
    setVals(new Map()); setEditing(picked)
  }

  const k = (l: DailyPayLineRow, f: Field) => `${l.id}|${f}`
  const value = (l: DailyPayLineRow, f: Field) => { const v = vals.get(k(l, f)); return v === undefined ? Number(l[f]) : Number(v || 0) }
  const changed = (l: DailyPayLineRow, f: Field) => vals.has(k(l, f)) && value(l, f) !== Number(l[f])
  const deduct = (l: DailyPayLineRow) => value(l, 'incomeTax') + value(l, 'localTax')
  const net = (l: DailyPayLineRow) => value(l, 'grossPay') - deduct(l)
  const cell = (l: DailyPayLineRow, f: Field, label: string) => (
    <td className={changed(l, f) ? 'bg-ec-danger-bg' : undefined}>
      <EcNumInput className="ec-input w-full text-right" aria-label={`${l.workerName} ${label}`}
                  value={vals.get(k(l, f)) ?? String(Number(l[f]))} onValue={(raw) => setVals(new Map(vals).set(k(l, f), raw))} />
    </td>
  )

  async function save() {
    if (!ledger || !editing) return
    setAsk(false)
    try {
      await api.put(`/hr/daily-pay-ledgers/${ledger.id}/lines`, editing.map((l) => ({
        lineId: l.id, days: value(l, 'days'), grossPay: value(l, 'grossPay'), incomeTax: value(l, 'incomeTax'), localTax: value(l, 'localTax'),
      })))
      onSaved()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const total = (f: (l: DailyPayLineRow) => number) => (editing ?? []).reduce((s, l) => s + f(l), 0)
  const touchesDirect = (editing ?? []).some((l) => l.direct && changed(l, 'grossPay'))

  return (
    <>
      <Modal error={error} open={!!ledger && !editing && !lineIds} title="급여수정 대상자 선택" width={780} onClose={onClose}>{(
        <>
          <div className="flex justify-end gap-[4px] mb-[8px]">
            <input className="ec-input w-[180px]" placeholder="입력 후 [Enter]" aria-label="급여수정 대상자 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button type="button" className="ec-btn ec-btn-primary">Search(F3)</button>
          </div>
          <div className="overflow-y-auto max-h-[420px]">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr>
                  <th className="w-[30px] text-center">
                    <input type="checkbox" aria-label="전체선택" checked={pickRows.length > 0 && pickRows.every((l) => checked.has(l.id))}
                           onChange={(ev) => setChecked(ev.target.checked ? new Set(pickRows.map((l) => l.id)) : new Set())} />
                  </th>
                  <th>사원번호</th>
                  <th>성명</th>
                  <th>부서명</th>
                  <th className="text-center">입사일자</th>
                  <th className="text-center">퇴사일자</th>
                </tr>
              </thead>
              <tbody>
                {pickRows.length === 0 ? (
                  <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : pickRows.map((l) => {
                  const w = worker(l.workerId)
                  return (
                    <tr key={l.id}>
                      <td className="text-center">
                        <input type="checkbox" aria-label={`${l.workerName} 선택`} checked={checked.has(l.id)} onChange={(ev) => {
                          const next = new Set(checked)
                          if (ev.target.checked) next.add(l.id); else next.delete(l.id)
                          setChecked(next)
                        }} />
                      </td>
                      <td>{l.workerCode}</td>
                      <td>{l.workerName}</td>
                      <td>{w?.department}</td>
                      <td className="text-center">{w?.hireDate ? slash(w.hireDate) : ''}</td>
                      <td className="text-center">{w?.resignDate ? slash(w.resignDate) : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용</button>
            <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
          </div>
        </>
      )}</Modal>

      <Modal error={error} open={!!ledger && !!editing} title="급여내역수정" width={1100} onClose={onClose}>{(
        <>
          {ledger && (
            <ul className="ec-form mb-[8px]">
              <li><span className="title">귀속연월</span><div className="form">{slash(ledger.payMonth)} - {ledger.seq}</div></li>
              <li><span className="title">지급연월</span><div className="form">{slash(ledger.paidMonth)}</div></li>
              <li><span className="title">원천세신고 사업자번호</span><div className="form">{bizRegNo}</div></li>
            </ul>
          )}
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr>
                  <th rowSpan={2}>사원번호</th>
                  <th rowSpan={2}>사원명</th>
                  <th rowSpan={2} className="text-right">실지급액</th>
                  <th className="text-right">지급총액</th>
                  <th rowSpan={2} className="text-right">총근무일수</th>
                  <th colSpan={2}>일근무</th>
                  <th rowSpan={2} className="text-right">소득세</th>
                  <th rowSpan={2} className="text-right">지방소득세</th>
                </tr>
                <tr>
                  <th className="text-right">공제총액</th>
                  <th className="text-right">일수</th>
                  <th className="text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                {(editing ?? []).flatMap((l) => [
                  <tr key={`${l.id}-a`}>
                    <td rowSpan={2}>{l.workerCode}</td>
                    <td rowSpan={2}>{l.workerName}</td>
                    <td rowSpan={2} className="text-right">{won(net(l))}</td>
                    <td className="text-right">{won(value(l, 'grossPay'))}</td>
                    <td rowSpan={2} className="text-right">{value(l, 'days').toFixed(2)}</td>
                    {cell(l, 'days', '일근무 일수')}
                    {cell(l, 'grossPay', '일근무 금액')}
                    {cell(l, 'incomeTax', '소득세')}
                    {cell(l, 'localTax', '지방소득세')}
                  </tr>,
                  <tr key={`${l.id}-b`}>
                    <td className="text-right">{won(deduct(l))}</td>
                    <td colSpan={4}></td>
                  </tr>,
                ])}
                <tr className="font-bold">
                  <td colSpan={2}></td>
                  <td className="text-right">{won(total(net))}</td>
                  <td className="text-right">{won(total((l) => value(l, 'grossPay')))}<br />{won(total(deduct))}</td>
                  <td></td>
                  <td></td>
                  <td className="text-right">{won(total((l) => value(l, 'grossPay')))}</td>
                  <td className="text-right">{won(total((l) => value(l, 'incomeTax')))}</td>
                  <td className="text-right">{won(total((l) => value(l, 'localTax')))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => setAsk(true)}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setVals(new Map())}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
          </div>
        </>
      )}</Modal>

      <Modal error={error} open={ask} title="알림" width={520} onClose={() => setAsk(false)}>{(
        <>
          <p className="whitespace-pre-line">
            {touchesDirect
              ? '금액직접입력을 통해 계산한 금액 변경시\n\n금액직접입력에 입력한 금액도 함께 변경됩니다.\n\n저장하겠습니까?'
              : '금액을 직접 수정할 경우 해당 급여대장에만 적용되며 재계산시 수정내역이 유지되지 않습니다.\n\n저장하겠습니까?'}
          </p>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={save}>확인</button>
            <button type="button" className="ec-btn" onClick={() => setAsk(false)}>취소</button>
          </div>
        </>
      )}</Modal>
    </>
  )
}
