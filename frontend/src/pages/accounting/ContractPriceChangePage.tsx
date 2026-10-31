import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks from '../../components/EcPeriodPicks'
import EcNumInput from '../../components/EcNumInput'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { periodOf } from '../../utils/periods'
import { dateText } from '../../utils/dateText'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { BillLineConds, applyFilter, useBillLineFilter } from '../../features/billingcontract/BillLineConds'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { fmtAmountOf } from '../../utils/format'

/* 원본 버튼줄 글자 그대로(2026-10-13 실측). */
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '종료일'] as const

interface PriceChangeLine {
  lineId: number; contractId: number; contractDate: string; docNo: number; contractCode: string; contractName: string | null
  partnerId: number; partnerName: string; employeeId: number | null; billStart: string; billEnd: string; vatType: string
  foreignCurrency: boolean; projectId: number | null; projectName: string | null; departmentId: number | null
  itemId: number; itemName: string; billingUnitId: number | null; billingUnitName: string | null
  quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number; remark: string | null
}
interface Edit { quantity: string; unitPrice: string }

/**
 * 회계 II › 계약관리 › 계약 › <b>계약단가/수량일괄변경</b>(E060904) — 2026-10-13 loginaa 실측.
 *
 * <p>조건: 계약일자(금월 1일 ~ 오늘) · 변경대상 ◉단가변경 ○환율변경 · 계약 · 계약항목 · 거래처 · 담당자 · 부가세유형(전체) · 청구단위 ·
 * 부서 · 프로젝트 · 진행상태(○전체 ◉진행중 ○완료) · 내.외자구분(◉내자 ○외자). 버튼 검색(F8) · 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 종료일 · 설정 · 다시 작성.
 * 격자(계약 줄마다 한 줄): □ · 전표번호(일자 -No.) · 계약명 · 거래처명 · 담당자명 · 청구시작일 · 청구종료일 · 구분 · 내.외자구분 · 프로젝트 · 부서 ·
 * 항목명 · 청구단위 · <b>수량 · 단가</b>(칸) · 공급가액 · 부가세 · 적요, 아래 [저장(F8)].
 *
 * <p>저장하면 고친 줄의 공급가액(수량 × 단가) · 부가세(10%)를 다시 셈해 계약에 넣는다 — 다음 청구예정자료생성부터 새 값이 들어간다.
 * [저장] 은 <b>체크와 상관없이 고친 줄을 모두</b> 저장하고 안내 없이 다시 조회한다 — 2026-10-13 QA회계2-청구인쇄 계약(수량 2 → 3)을
 * 체크하지 않고 [저장] 했더니 계약현황이 3.00 · 120,000 · 12,000 이 됐다. 고친 것 없이 누르면 '알림' 창 '변경된정보가 없습니다.' [확인].
 * ○환율변경(외자 계약) · [설정] 은 아직 없다.
 * 진행상태: 원본은 청구종료일이 지난 계약(2026/08/24 종료)도 '진행중' 에 보여, 우리에게 아직 없는 완료 표시가 따로 있는 것으로 보인다 — 지금은 모두 진행중.
 */
export default function ContractPriceChangePage() {
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const { filter, set, reset } = useBillLineFilter('')
  const [progress, setProgress] = useState<'all' | 'open' | 'done'>('open')
  const [foreign, setForeign] = useState(false)
  const [rows, setRows] = useState<PriceChangeLine[]>([])
  const [edits, setEdits] = useState<Record<number, Edit>>({})
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const pickers = useCondPickers(['staff'])
  const dp = useDeptProjectItems()
  const tableRef = useRef<HTMLTableElement>(null)

  async function load() {
    setError(''); setNotice('')
    try {
      setRows((await api.get<PriceChangeLine[]>('/billing-contracts/price-change', { params: { from, to } })).data)
      setEdits({}); setPicked(new Set()); setSearched(true)
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const shown = useMemo(() => applyFilter(rows, filter)
    .filter((r) => r.foreignCurrency === foreign)
    .filter(() => progress !== 'done'), [rows, filter, foreign, progress])
  useTableColumnCheck(tableRef, '계약단가/수량일괄변경', [shown.length])
  const empName = (id: number | null) => (id == null ? '' : pickers.staff.find((e) => e.id === id)?.name ?? '')
  const deptName = (id: number | null) => (id == null ? '' : dp.departments.find((d) => d.value === String(id))?.name ?? '')
  const value = (r: PriceChangeLine, k: keyof Edit) => edits[r.lineId]?.[k] ?? String(Number(r[k]))
  const setEdit = (r: PriceChangeLine, patch: Partial<Edit>) =>
    setEdits((m) => ({ ...m, [r.lineId]: { quantity: value(r, 'quantity'), unitPrice: value(r, 'unitPrice'), ...patch } }))
  const supplyOf = (r: PriceChangeLine) => Math.round((Number(value(r, 'quantity')) || 0) * (Number(value(r, 'unitPrice')) || 0))

  async function save() {
    const changed = shown.filter((r) => edits[r.lineId]
      && (Number(edits[r.lineId].quantity) !== Number(r.quantity) || Number(edits[r.lineId].unitPrice) !== Number(r.unitPrice)))
    if (!changed.length) { setNotice('변경된정보가 없습니다.'); return }
    try {
      setError('')
      await api.post('/billing-contracts/price-change', { lines: changed.map((r) => ({
        lineId: r.lineId, quantity: Number(value(r, 'quantity')) || 0, unitPrice: Number(value(r, 'unitPrice')) || 0 })) })
      await load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  const radio = <T extends string | boolean>(name: string, cur: T, on: (v: T) => void, opts: readonly (readonly [T, string])[]) => opts.map(([v, n]) => (
    <label key={String(v)} className="inline-flex items-center gap-[3px] mr-[10px]">
      <input type="radio" name={name} checked={cur === v} onChange={() => on(v)} /> {n}
    </label>
  ))

  return (
    <EcListShell title="계약단가/수량일괄변경" searchable={false} actions={[
      { label: '검색(F8)', primary: true, onClick: () => void load() },
      { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); reset(); setProgress('open'); setForeign(false) } },
    ]}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void (searched && shown.length ? save() : load()) } }}>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        <ul className="ec-cond mb-[8px]">
          <EcCond label="계약일자">
            <EcDateRange from={{ className: "ec-input w-[145px]", 'aria-label': "계약일자 시작", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", 'aria-label': "계약일자 끝", value: to, onChange: (e) => setTo(e.target.value) }} />
            <span className="ml-[6px]"><EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} /></span>
          </EcCond>
          <EcCond label="변경대상">{radio('price-target', 'price', () => {}, [['price', '단가변경']] as const)}</EcCond>
          <BillLineConds rows={rows} filter={filter} set={set} full currency={false} vatAll />
          <EcCond label="진행상태">{radio('price-progress', progress, setProgress, [['all', '전체'], ['open', '진행중'], ['done', '완료']] as const)}</EcCond>
          <EcCond label="내.외자구분">{radio('price-currency', foreign, setForeign, [[false, '내자'], [true, '외자']] as const)}</EcCond>
        </ul>

        <div className="overflow-x-auto">
          <table ref={tableRef} className="ec-list-grid w-full min-w-[1500px]">
            <thead>
              <tr>
                <th className="w-[34px]"><input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((r) => picked.has(r.lineId))}
                  onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((r) => r.lineId)) : new Set())} /></th>
                <th className="text-center">전표번호</th><th>계약명</th><th>거래처명</th><th>담당자명</th>
                <th className="text-center">청구시작일</th><th className="text-center">청구종료일</th><th className="text-center">구분</th>
                <th className="text-center">내.외자구분</th><th>프로젝트</th><th>부서</th><th>항목명</th><th>청구단위</th>
                <th className="w-[90px] text-right">수량</th><th className="w-[120px] text-right">단가</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th>적요</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={18} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                : shown.map((r) => {
                  const supply = supplyOf(r)
                  return (
                    <tr key={r.lineId}>
                      <td className="text-center"><input type="checkbox" aria-label="선택" checked={picked.has(r.lineId)}
                        onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.lineId); else n.delete(r.lineId); return n })} /></td>
                      <td className="text-center">{dateText(r.contractDate)} -{r.docNo}</td>
                      <td>{r.contractName ?? ''}</td>
                      <td>{r.partnerName}</td>
                      <td>{empName(r.employeeId)}</td>
                      <td className="text-center">{dateText(r.billStart)}</td>
                      <td className="text-center">{dateText(r.billEnd)}</td>
                      <td className="text-center">{r.vatType}</td>
                      <td className="text-center">{r.foreignCurrency ? '외자' : '내자'}</td>
                      <td>{r.projectName ?? ''}</td>
                      <td>{deptName(r.departmentId)}</td>
                      <td>{r.itemName}</td>
                      <td>{r.billingUnitName ?? ''}</td>
                      <td><EcNumInput className="ec-input w-full text-right" aria-label="수량" value={value(r, 'quantity')} onValue={(v) => setEdit(r, { quantity: v })} /></td>
                      <td><EcNumInput className="ec-input w-full text-right" aria-label="단가" value={value(r, 'unitPrice')} onValue={(v) => setEdit(r, { unitPrice: v })} /></td>
                      <td className="text-right">{fmtAmountOf(supply)}</td>
                      <td className="text-right">{fmtAmountOf(Math.floor(supply * 0.1))}</td>
                      <td>{r.remark ?? ''}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        {searched && <div className="mt-[8px]"><button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button></div>}
      </div>
      <Modal open={!!notice} error={error} title="알림" width={420} onClose={() => setNotice('')}>
        <p className="text-[12px] mb-[12px]">{notice}</p>
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => setNotice('')}>확인</button>
      </Modal>
    </EcListShell>
  )
}
