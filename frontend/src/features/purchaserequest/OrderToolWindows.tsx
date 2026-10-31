import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import EcDateField from '../../components/EcDateField'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateNo } from '../../utils/dateNo'
import { exportTableToXlsx } from '../../utils/excel'
import { ecAlert, requireSelection } from '../../components/EcDialog'
import type { PurchaseOrder, PurchaseOrderLine } from '../../types/api'
import { fmtAmount } from '../../utils/format'

const today = () => new Date().toLocaleDateString('sv-SE')
const notHere = (what: string) => () => void ecAlert(`이 기능은 이 ERP 에서 제공하지 않습니다.\n(${what})`)

/**
 * 발주서입력 · 발주요청입력 도구줄 [소요] → 원본 <b>소요량계산</b> 창(2026-10-31 loginad 발주서입력 QA):
 * 일자 · 창고 · BOM구분 · 구분 · 대표품목기준환산, 표 품목코드 · 품목명 · 규격 · 수량, [계산(F8)] [닫기].
 * 우리에게는 입력 창 안에서 BOM 소요량을 셈하는 기능이 없다 — 창 모양만 두고 [계산(F8)] 은 안내한다.
 * BOM구분 · 구분의 고를 값은 기록이 없어 '전체' 하나만 둔다.
 */
export function RequirementCalcModal({ onClose }: { onClose: () => void }) {
  const pickers = useCondPickers(['warehouses'])
  const [date, setDate] = useState(today())
  const [wh, setWh] = useState('')
  return (
    <Modal open title="소요량계산" width={720} onClose={onClose}>
      <div className="ec-form mb-[8px] grid grid-cols-2 gap-x-[24px] gap-y-[6px] mobile:grid-cols-1">
        <label className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">일자</span>
          <EcDateField value={date} onChange={setDate} />
        </label>
        <div className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">창고</span>
          <div className="w-[220px]"><CodePickerField label="창고" hideLabel pair fill emptyLabel="선택 안 함" value={wh} onChange={setWh} items={pickers.warehouses} /></div>
        </div>
        <label className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">BOM구분</span>
          <select className="ec-input w-[220px]" aria-label="BOM구분"><option>전체</option></select>
        </label>
        <label className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">구분</span>
          <select className="ec-input w-[220px]" aria-label="구분"><option>전체</option></select>
        </label>
        <label className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">대표품목기준환산</span>
          <input type="checkbox" aria-label="대표품목기준환산" />
        </label>
      </div>
      <table className="w-full text-left">
        <thead><tr><th className="w-[150px]">품목코드</th><th>품목명</th><th className="w-[100px]">규격</th><th className="w-[90px] text-right">수량</th></tr></thead>
        <tbody><tr><td colSpan={4} className="ec-empty">소요량계산은 이 ERP 에서 제공하지 않습니다.</td></tr></tbody>
      </table>
      <div className="mt-[10px] flex flex-wrap items-center gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={notHere('소요량계산')}>계산(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/**
 * 발주서입력 [계획] → 원본 <b>발주계획조회</b> 창(2026-10-31 loginad 발주서입력 QA): 알약 전체 · 확인 ▸ 진행중 – 완료,
 * 표 일자-No. · 거래처명 · 품목명 · 수량 · 단가 · 금액 · 부가세 · 합계 · 최종수정자 · 품절여부 · 진행상태, 아래 라인별 ▾ · 전체적용(F8) · Excel · 닫기.
 *
 * <p>발주계획 <b>줄마다</b> 한 줄이다(발주계획조회 화면과 같다). 고른 줄을 적용하면 발주서 줄로 베낀다 — 발주계획조회 [다른전표생성 › 발주서] 와
 * 같은 copyLine(줄 출처 열 [발주계획] · [No.]). 진행상태는 줄 [종결여부](planClosed)로 완료 · 진행중. 품절여부는 우리 자료에 없어 빈칸.
 */
export function PlanPickModal({ onApply, onClose }: {
  onApply: (picked: { order: PurchaseOrder; line: PurchaseOrderLine }[]) => void
  onClose: () => void
}) {
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'ALL' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED'>('ALL')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const tableRef = useRef<HTMLTableElement>(null)
  useEffect(() => {
    api.get<PurchaseOrder[]>('/purchase-orders', { params: { status: 'PLANNED' } })
      .then((r) => setRows(r.data))
      .catch((e) => setError(extractErrorMessage(e)))
  }, [])
  const shown = useMemo(() => rows
    .slice()
    .sort((a, b) => (a.orderDate > b.orderDate ? -1 : a.orderDate < b.orderDate ? 1 : b.orderNo.localeCompare(a.orderNo)))
    .flatMap((o) => o.lines.map((line) => ({ order: o, line })))
    .filter((x) => tab === 'ALL' || tab === 'CONFIRMED' || (tab === 'COMPLETED') === !!x.line.planClosed),
  [rows, tab])

  function apply() {
    const picked = shown.filter((x) => checked.has(x.line.id))
    if (!requireSelection(picked.length)) return
    onApply(picked)
  }

  return (
    <Modal open title="발주계획조회" width={1000} onClose={onClose} error={error}>
      <div className="ec-pills mb-[8px]">
        {([['ALL', '전체'], ['CONFIRMED', '확인 ▸'], ['IN_PROGRESS', '진행중'], ['COMPLETED', '완료']] as const).map(([k, label]) => (
          <button key={k} type="button" className={`ec-pill no-ec${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[28px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((x) => checked.has(x.line.id))}
                onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((x) => x.line.id)) : new Set())} />
            </th>
            <th>일자-No.</th><th>거래처명</th><th>품목명</th>
            <th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">금액</th>
            <th className="text-right">부가세</th><th className="text-right">합계</th>
            <th>최종수정자</th><th className="text-center">품절여부</th><th className="text-center">진행상태</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map(({ order: o, line: l }) => (
            <tr key={l.id}>
              <td className="text-center">
                <input type="checkbox" aria-label="선택" checked={checked.has(l.id)}
                  onChange={(e) => setChecked((cur) => { const n = new Set(cur); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n })} />
              </td>
              <td>{dateNo(o.orderDate, o.orderNo)}</td>
              <td>{o.partnerName ?? ''}</td>
              <td>{l.itemName}{l.spec ? ` [${l.spec}]` : ''}</td>
              <td className="text-right">{Number(l.quantity).toLocaleString('ko-KR')}</td>
              <td className="text-right">{fmtAmount(Number(l.unitPrice))}</td>
              <td className="text-right">{fmtAmount(Number(l.supplyAmount))}</td>
              <td className="text-right">{fmtAmount(Number(l.vatAmount))}</td>
              <td className="text-right">{fmtAmount(Number(l.supplyAmount) + Number(l.vatAmount))}</td>
              <td>{o.updatedBy ?? o.createdBy ?? ''}</td>
              <td className="text-center"></td>
              <td className="text-center">{l.planClosed ? '완료' : '진행중'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-[10px] flex flex-wrap items-center gap-[4px]">
        <button type="button" className="ec-btn" onClick={() => void ecAlert('이 창은 줄마다(라인별) 보입니다.')}>라인별 ▾</button>
        <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>전체적용(F8)</button>
        <button type="button" className="ec-btn" onClick={() => { if (tableRef.current) void exportTableToXlsx(tableRef.current, '발주계획조회') }}>Excel</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
