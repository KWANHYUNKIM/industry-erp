import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import EcListShell from '../../../components/EcListShell'
import Modal from '../../../components/Modal'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { EcCond } from '../../../components/EcStatusPanel'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../../components/EcPeriodPicks'
import { useCondPickers } from '../../../utils/useCondPickers'
import { useShortcut } from '../../../utils/useShortcut'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { dateNo } from '../../../utils/dateNo'
import { ecConfirm } from '../../../components/EcDialog'
import SalesPlanForm, { type SalesPlanDoc as Doc, type SalesPlanRow as PlanRow } from '../../../features/salesplan/components/SalesPlanForm'
import { EcDateRange } from '../../../components/ui/EcDateInput'
import { fmtAmount } from '../../../utils/format'


/**
 * 재고 II &gt; 계획관리 &gt; 매출계획 &gt; <b>매출계획조회</b>(E040625) · <b>매출계획입력</b>(E040624) — 2026-10-04 loginaa 실측(자료가 든 판).
 *
 * <ul>
 *   <li>매출계획은 <b>여러 줄 전표</b>다: 머리 [예상매출일자-No.], 줄 [거래처 · 담당자 · 품목 · 수량 · 단가 · 예상매출액 · 비고].
 *       원본 2026/10/29 -1 은 빛나오토파츠 · 정재원 줄 둘(16,000 + 70,000), 목록 금액 86,000.</li>
 *   <li>목록 알약 전체 · 이력, 열 일자-No. · 거래처명 · 담당자명 · 창고명 · 프로젝트명 · 품목명 · 금액(전표 합). 거래처 · 담당자 · 품목은 첫 줄의 것이다.
 *       기준일자 기본 최근30일(+1개월). 단추 신규(F2) · 보내기 · 선택삭제 · Excel.</li>
 * </ul>
 * 예전엔 매출계획 한 화면이 입력 · 조회 · 현황을 겸하고, 계획 한 줄이 곧 한 전표였다(여러 품목을 한 전표로 못 잡았다).
 * [이력] 알약과 [보내기]는 아직 없다. 창고 · 프로젝트는 원본 목록 열에 있어 머리 칸으로 받는다.
 */
export default function SalesPlanListPage() {
  const pickers = useCondPickers(['items', 'partners', 'warehouses', 'employees', 'projects'])
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [itemCond, setItemCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [rows, setRows] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Doc | null>(null)
  const [formError, setFormError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      setRows((await api.get<PlanRow[]>('/sales-plans')).data)
      setPicked(new Set())
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const docs = useMemo(() => {
    const m = new Map<string, Doc>()
    for (const r of rows) {
      const d = m.get(r.planNo) ?? { planNo: r.planNo, planDate: r.planDate, lines: [], amount: 0 }
      d.lines.push(r); d.amount += Number(r.planAmount)
      m.set(r.planNo, d)
    }
    return [...m.values()]
      .map((d) => ({ ...d, lines: d.lines.sort((a, b) => a.lineNo - b.lineNo) }))
      .filter((d) => d.planDate >= from && d.planDate <= to)
      .filter((d) => !itemCond || d.lines.some((l) => String(l.itemId) === itemCond))
      .filter((d) => !partnerCond || d.lines.some((l) => String(l.partnerId) === partnerCond))
      .sort((a, b) => (a.planDate < b.planDate ? 1 : a.planDate > b.planDate ? -1 : b.planNo.localeCompare(a.planNo)))
  }, [rows, from, to, itemCond, partnerCond])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '매출계획조회', [docs.length])

  /* 원본 [신규(F2)] 는 매출계획입력 창을 띄운다 — 폼은 매출계획입력 화면과 같은 부품(features/salesplan). */
  function openNew() { setEditing(null); setFormError(''); setOpen(true) }
  function openEdit(d: Doc) { setEditing(d); setFormError(''); setOpen(true) }
  useShortcut('F2', openNew, !open)

  async function removeDocs(nos: string[]) {
    try {
      for (const no of nos) await api.delete(`/sales-plans/docs/${encodeURIComponent(no)}`)
      setOpen(false)
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  const allPicked = docs.length > 0 && docs.every((d) => picked.has(d.planNo))

  return (
    <EcListShell
      title="매출계획조회"
      onSearch={load}
      searchable={false}
      onNew={openNew}
      actions={[
        { label: '선택삭제', selected: picked.size,
          onClick: async () => { if ((await ecConfirm('선택한 전표를 삭제 하겠습니까?'))) void removeDocs([...picked]) } },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partnerCond} onChange={setPartnerCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} emptyLabel="전체" value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allPicked} onChange={(e) => setPicked(e.target.checked ? new Set(docs.map((d) => d.planNo)) : new Set())} />
            </th>
            <th className="text-center">일자-No.</th>
            <th>거래처명</th>
            <th>담당자명</th>
            <th>창고명</th>
            <th>프로젝트명</th>
            <th>품목명</th>
            <th className="text-right">금액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
          ) : docs.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : docs.map((d) => {
            const h = d.lines[0]
            return (
              <tr key={d.planNo}>
                <td className="text-center">
                  <input type="checkbox" checked={picked.has(d.planNo)} onChange={() => setPicked((s) => {
                    const n = new Set(s)
                    if (n.has(d.planNo)) n.delete(d.planNo); else n.add(d.planNo)
                    return n
                  })} />
                </td>
                <td className="text-center"><button type="button" className="ec-link" onClick={() => openEdit(d)}>{dateNo(d.planDate, d.planNo)}</button></td>
                <td>{h.partnerName ?? ''}</td>
                <td>{h.employeeName ?? ''}</td>
                <td>{h.warehouseName ?? ''}</td>
                <td>{h.projectName ?? ''}</td>
                <td>{h.itemName}</td>
                <td className="text-right">{fmtAmount(d.amount)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <Modal open={open} width={1080} error={formError} onClose={() => setOpen(false)}
             title={editing ? '매출계획수정' : '매출계획입력'}>
        <SalesPlanForm editing={editing} active={open} onError={setFormError} onClose={() => setOpen(false)}
                       onSaved={() => { if (editing) setOpen(false); void load() }} />
      </Modal>
    </EcListShell>
  )
}
