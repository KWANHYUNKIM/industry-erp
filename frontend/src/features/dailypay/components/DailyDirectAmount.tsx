import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import EcNumInput from '../../../components/EcNumInput'
import { api, extractErrorMessage } from '../../../api/client'
import { ecAlert, ecConfirm } from '../../../components/EcDialog'
import { fmtNumberBlank } from '../../../utils/format'

export interface DailyWorkerRow { id: number; code: string; name: string; department: string | null; hireDate: string | null; resignDate: string | null }
interface Summary { workerId: number; allowanceTotal: number; deductionTotal: number }
interface Direct { workerId: number; dayAmount: number | null; memo: string | null; topMessage: string | null; bottomMessage: string | null }
interface Ledger { id: number }
interface Vals { amount: string; memo: string; top: string; bottom: string }

const EMPTY: Vals = { amount: '', memo: '', top: '', bottom: '' }

/**
 * 관리 &gt; 일용근로 급여계산/대장 [사전작업] <b>금액직접입력</b> (원본 E020139, 2026-10-12 실측).
 *
 * <p>① 목록 '금액직접입력': 일용근로 사원(사원번호 순) · 사원명 · 부서명 · 수당총액 · 공제총액. 사원번호를 누르면
 * ② '수당/공제 항목입력' — '(00001) 사원명', 구분 수당항목(일근무 · 금액 · 메모, 수당합계) / 기 타(상단메세지 · 하단메세지).
 * 일용근로는 공제 칸이 없다(원본도 소득세 · 지방소득세 줄이 없다). [저장(F8)] 하면 목록으로 돌아가 수당총액이 찍히고
 * 대장의 링크가 '금액직접입력[n]'. 다시 계산하면(전체계산 · 개인별계산) 일근무를 단가 × 일수 대신 이 금액으로 둔다
 * (원본: 직접입력 250,000 · 일근무 2 → 지급총액 250,000).
 *
 * <p>목록 [변경] · [웹자료올리기], 항목입력의 [일괄적용] 은 아직 없다.
 */
export default function DailyDirectAmount({ ledger, onClose, onChanged }: { ledger: Ledger | null; onClose: () => void; onChanged: () => void }) {
  const [workers, setWorkers] = useState<DailyWorkerRow[]>([])
  const [summary, setSummary] = useState<Summary[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<DailyWorkerRow | null>(null)
  const [loaded, setLoaded] = useState<Vals>(EMPTY)
  const [vals, setVals] = useState<Vals>(EMPTY)
  const [error, setError] = useState('')

  function loadSummary() {
    if (!ledger) return
    api.get<Summary[]>(`/hr/daily-pay-ledgers/${ledger.id}/direct-amounts`).then((r) => setSummary(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    if (!ledger) return
    setError(''); setChecked(new Set()); setQuery(''); setEditing(null)
    loadSummary()
    api.get<DailyWorkerRow[]>('/hr/daily-workers')
      .then((r) => setWorkers([...r.data].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))))
      .catch((e) => setError(extractErrorMessage(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger])

  const rows = workers.filter((w) => !query || [w.code, w.name, w.department ?? ''].some((v) => v.includes(query)))
  const sum = (id: number) => summary.find((s) => s.workerId === id)

  async function open(w: DailyWorkerRow) {
    if (!ledger) return
    setError('')
    try {
      const d = (await api.get<Direct>(`/hr/daily-pay-ledgers/${ledger.id}/direct-amounts/${w.id}`)).data
      const v: Vals = { amount: d.dayAmount == null ? '' : String(Number(d.dayAmount)), memo: d.memo ?? '', top: d.topMessage ?? '', bottom: d.bottomMessage ?? '' }
      setLoaded(v); setVals(v); setEditing(w)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function save() {
    if (!ledger || !editing) return
    try {
      await api.put(`/hr/daily-pay-ledgers/${ledger.id}/direct-amounts/${editing.id}`, {
        dayAmount: vals.amount === '' ? null : Number(vals.amount), memo: vals.memo || null, topMessage: vals.top || null, bottomMessage: vals.bottom || null,
      })
      setEditing(null); loadSummary(); onChanged()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function remove(ids: number[]) {
    if (!ledger) return
    if (ids.length === 0) { void ecAlert('선택된 자료가 없습니다.'); return }
    if (!(await ecConfirm('한번 지워진 자료는 복구될 수 없습니다.\n\n삭제하겠습니까?'))) return
    try {
      await api.delete(`/hr/daily-pay-ledgers/${ledger.id}/direct-amounts`, { params: { workerIds: ids.join(',') } })
      setEditing(null); setChecked(new Set()); loadSummary(); onChanged()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  return (
    <>
      <Modal error={error} open={!!ledger && !editing} title="금액직접입력" width={780} onClose={onClose}>{(
        <>
          <div className="flex justify-end gap-[4px] mb-[8px]">
            <input className="ec-input w-[180px]" placeholder="입력 후 [Enter]" aria-label="금액직접입력 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button type="button" className="ec-btn ec-btn-primary">Search(F3)</button>
          </div>
          <div className="overflow-y-auto max-h-[420px]">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr>
                  <th className="w-[30px] text-center">
                    <input type="checkbox" aria-label="전체선택" checked={rows.length > 0 && rows.every((w) => checked.has(w.id))}
                           onChange={(ev) => setChecked(ev.target.checked ? new Set(rows.map((w) => w.id)) : new Set())} />
                  </th>
                  <th>사원번호</th>
                  <th>사원명</th>
                  <th>부서명</th>
                  <th className="text-right">수당총액</th>
                  <th className="text-right">공제총액</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : rows.map((w) => (
                  <tr key={w.id}>
                    <td className="text-center">
                      <input type="checkbox" aria-label={`${w.name} 선택`} checked={checked.has(w.id)} onChange={(ev) => {
                        const next = new Set(checked)
                        if (ev.target.checked) next.add(w.id); else next.delete(w.id)
                        setChecked(next)
                      }} />
                    </td>
                    <td><a href="#" onClick={(ev) => { ev.preventDefault(); open(w) }}>{w.code}</a></td>
                    <td>{w.name}</td>
                    <td>{w.department}</td>
                    <td className="text-right">{fmtNumberBlank(sum(w.id)?.allowanceTotal ?? 0)}</td>
                    <td className="text-right">{fmtNumberBlank(sum(w.id)?.deductionTotal ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn" onClick={() => remove([...checked])}>선택삭제</button>
            <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
          </div>
        </>
      )}</Modal>

      <Modal error={error} open={!!ledger && !!editing} title="수당/공제 항목입력" width={780} onClose={() => setEditing(null)}>{(
        <>
          <div className="font-bold mb-[6px]">{editing && `(${editing.code}) ${editing.name}`}</div>
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr>
                <th className="w-[30px]"></th>
                <th>구분</th>
                <th>수당공제항목</th>
                <th className="text-right">금액</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-center">1</td>
                <td>수당항목</td>
                <td>일근무</td>
                <td>
                  <EcNumInput className="ec-input w-full text-right" aria-label="일근무 금액" value={vals.amount}
                              onValue={(raw) => setVals({ ...vals, amount: raw })} />
                </td>
                <td>
                  <input className="ec-input w-full" aria-label="일근무 메모" maxLength={200} value={vals.memo}
                         onChange={(e) => setVals({ ...vals, memo: e.target.value })} />
                </td>
              </tr>
              <tr className="font-bold">
                <td></td>
                <td>수당합계</td>
                <td></td>
                <td className="text-right">{Number(vals.amount || 0).toLocaleString('ko-KR')}</td>
                <td></td>
              </tr>
              <tr>
                <td rowSpan={2} className="text-center">2</td>
                <td rowSpan={2}>기 타</td>
                <td>상단메세지</td>
                <td className="bg-ec-disabled"></td>
                <td>
                  <input className="ec-input w-full" aria-label="상단메세지" maxLength={200} value={vals.top}
                         onChange={(e) => setVals({ ...vals, top: e.target.value })} />
                </td>
              </tr>
              <tr>
                <td>하단메세지</td>
                <td className="bg-ec-disabled"></td>
                <td>
                  <input className="ec-input w-full" aria-label="하단메세지" maxLength={200} value={vals.bottom}
                         onChange={(e) => setVals({ ...vals, bottom: e.target.value })} />
                </td>
              </tr>
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setVals(loaded)}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={() => editing && remove([editing.id])}>삭제</button>
            <button type="button" className="ec-btn" onClick={() => setEditing(null)}>닫기</button>
          </div>
        </>
      )}</Modal>
    </>
  )
}
