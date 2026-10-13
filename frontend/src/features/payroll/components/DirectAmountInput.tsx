import { useEffect, useMemo, useState } from 'react'
import Modal from '../../../components/Modal'
import EcNumInput from '../../../components/EcNumInput'
import { api, extractErrorMessage } from '../../../api/client'
import type { EmployeeMaster, PayItem } from '../../../types/api'
import { ecAlert, ecConfirm } from '../../../components/EcDialog'

type Kind = 'ALLOWANCE' | 'DEDUCTION'
interface Summary { employeeId: number; allowanceTotal: number; deductionTotal: number }
interface Cell { kind: Kind; itemName: string; amount: number; memo: string | null }
interface Ledger { id: number; payMonth: string }

const won = (n: number) => (n ? Number(n).toLocaleString('ko-KR') : '')
/** 원본 칸 이름 — 우리 명세 줄 이름과 다른 법정 공제만 */
const LABEL: Record<string, string> = { 지방소득세: '주민세', 장기요양보험: '장기요양' }
const STATUTORY = ['소득세', '지방소득세', '국민연금', '건강보험', '고용보험', '장기요양보험']
const BASE = '기본급'
const k = (kind: Kind, name: string) => `${kind}#${name}`

/**
 * 관리 &gt; 급여계산/대장 [사전작업] <b>금액직접입력</b> (원본 E090106, 2026-10-12 실측).
 *
 * <p>① 목록 '금액직접입력': 사원(퇴사자 포함, 사원번호 순) · 사원명 · 부서명 · 수당총액 · 공제총액(손으로 정한 금액의 합).
 * 사원번호를 누르면 ② '수당/공제 항목입력' — '(사원번호) 사원명', 구분 수당항목(기본급 · 수당항목 …, 수당합계) /
 * 공제항목(소득세 · 주민세 …, 공제합계) · 전체합계, 칸마다 금액 · 메모. [저장(F8)] 하면 목록으로 돌아가고,
 * 그 대장을 다시 계산할 때(전체계산 · 개인별계산) 그 항목의 셈 대신 이 금액을 쓴다(원본: 식대 150,000 → 지급총액 +50,000).
 * 전체합계는 수당합계 − 공제합계로 둔다(원본은 빈 칸에서 0 이라 둘을 가르지 못했다).
 * [삭제] '한번 지워진 자료는 복구될 수 없습니다. 삭제하겠습니까?'. 빈 칸은 셈 그대로다.
 *
 * <p>목록 [변경] · [웹자료올리기], 항목입력의 [일괄적용] · 상단/하단메세지는 아직 없다.
 */
export default function DirectAmountInput({ ledger, onClose, onChanged }: { ledger: Ledger | null; onClose: () => void; onChanged: () => void }) {
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [items, setItems] = useState<PayItem[]>([])
  const [summary, setSummary] = useState<Summary[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<EmployeeMaster | null>(null)
  const [loaded, setLoaded] = useState<Map<string, { amount: string; memo: string }>>(new Map())
  const [vals, setVals] = useState<Map<string, { amount: string; memo: string }>>(new Map())
  const [error, setError] = useState('')

  function loadSummary() {
    if (!ledger) return
    api.get<Summary[]>(`/pay-ledgers/${ledger.id}/direct-amounts`).then((r) => setSummary(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    if (!ledger) return
    setError(''); setChecked(new Set()); setQuery(''); setEditing(null)
    loadSummary()
    Promise.all([api.get<EmployeeMaster[]>('/employees/all'), api.get<PayItem[]>('/pay-settings/items')])
      .then(([e, i]) => {
        setEmployees([...e.data].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)))
        setItems(i.data)
      }).catch((e) => setError(extractErrorMessage(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger])

  const rows = employees.filter((e) => !query || [e.code, e.name, e.department ?? ''].some((v) => v.includes(query)))
  const sum = (id: number) => summary.find((s) => s.employeeId === id)

  const { allow, deduct } = useMemo(() => {
    const master = (kind: Kind) => items.filter((i) => i.kind === kind && i.active)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)).map((i) => i.name)
    return {
      allow: [BASE, ...master('ALLOWANCE').filter((n) => n !== BASE)],
      deduct: [...STATUTORY, ...master('DEDUCTION').filter((n) => !STATUTORY.includes(n))],
    }
  }, [items])

  async function open(e: EmployeeMaster) {
    if (!ledger) return
    setError('')
    try {
      const r = await api.get<Cell[]>(`/pay-ledgers/${ledger.id}/direct-amounts/${e.id}`)
      const m = new Map(r.data.map((c) => [k(c.kind, c.itemName), { amount: String(Number(c.amount)), memo: c.memo ?? '' }]))
      setLoaded(m); setVals(new Map(m)); setEditing(e)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function save() {
    if (!ledger || !editing) return
    const cells = [...vals.entries()].filter(([, v]) => v.amount !== '').map(([key, v]) => {
      const [kind, ...name] = key.split('#')
      return { kind, itemName: name.join('#'), amount: Number(v.amount), memo: v.memo || null }
    })
    try {
      await api.put(`/pay-ledgers/${ledger.id}/direct-amounts/${editing.id}`, { cells })
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
      await api.delete(`/pay-ledgers/${ledger.id}/direct-amounts`, { params: { employeeIds: ids.join(',') } })
      setEditing(null); setChecked(new Set()); loadSummary(); onChanged()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const val = (kind: Kind, name: string) => vals.get(k(kind, name)) ?? { amount: '', memo: '' }
  const put = (kind: Kind, name: string, patch: Partial<{ amount: string; memo: string }>) =>
    setVals(new Map(vals).set(k(kind, name), { ...val(kind, name), ...patch }))
  const total = (kind: Kind, names: string[]) => names.reduce((s, n) => s + Number(val(kind, n).amount || 0), 0)
  const section = (kind: Kind, names: string[], no: number, title: string, sumTitle: string) => (
    <>
      {names.map((n, i) => (
        <tr key={k(kind, n)}>
          {i === 0 && <td rowSpan={names.length} className="text-center">{no}</td>}
          {i === 0 && <td rowSpan={names.length}>{title}</td>}
          <td>{LABEL[n] ?? n}</td>
          <td>
            <EcNumInput className="ec-input w-full text-right" aria-label={`${LABEL[n] ?? n} 금액`} value={val(kind, n).amount}
                        onValue={(raw) => put(kind, n, { amount: raw })} />
          </td>
          <td>
            <input className="ec-input w-full" aria-label={`${LABEL[n] ?? n} 메모`} maxLength={200} value={val(kind, n).memo}
                   onChange={(e) => put(kind, n, { memo: e.target.value })} />
          </td>
        </tr>
      ))}
      <tr className="font-bold">
        <td></td>
        <td>{sumTitle}</td>
        <td></td>
        <td className="text-right">{Number(total(kind, names)).toLocaleString('ko-KR')}</td>
        <td></td>
      </tr>
    </>
  )

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
                    <input type="checkbox" aria-label="전체선택" checked={rows.length > 0 && rows.every((e) => checked.has(e.id))}
                           onChange={(ev) => setChecked(ev.target.checked ? new Set(rows.map((e) => e.id)) : new Set())} />
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
                ) : rows.map((e) => (
                  <tr key={e.id}>
                    <td className="text-center">
                      <input type="checkbox" aria-label={`${e.name} 선택`} checked={checked.has(e.id)} onChange={(ev) => {
                        const next = new Set(checked)
                        if (ev.target.checked) next.add(e.id); else next.delete(e.id)
                        setChecked(next)
                      }} />
                    </td>
                    <td><a href="#" onClick={(ev) => { ev.preventDefault(); open(e) }}>{e.code}</a></td>
                    <td>{e.name}</td>
                    <td>{e.department}</td>
                    <td className="text-right">{won(sum(e.id)?.allowanceTotal ?? 0)}</td>
                    <td className="text-right">{won(sum(e.id)?.deductionTotal ?? 0)}</td>
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
          <div className="overflow-y-auto max-h-[460px]">
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
                {section('ALLOWANCE', allow, 1, '수당항목', '수당합계')}
                {section('DEDUCTION', deduct, 2, '공제항목', '공제합계')}
                <tr className="font-bold">
                  <td></td>
                  <td>전체합계</td>
                  <td></td>
                  <td className="text-right">{Number(total('ALLOWANCE', allow) - total('DEDUCTION', deduct)).toLocaleString('ko-KR')}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setVals(new Map(loaded))}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={() => editing && remove([editing.id])}>삭제</button>
            <button type="button" className="ec-btn" onClick={() => setEditing(null)}>닫기</button>
          </div>
        </>
      )}</Modal>
    </>
  )
}
