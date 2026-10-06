import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { useShortcut } from '../../utils/useShortcut'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { dateNo } from '../../utils/dateNo'

/** 서버 한 줄 — 같은 planNo 의 줄들이 한 전표다. */
interface PlanRow {
  id: number; planNo: string; planDate: string; lineNo: number
  itemId: number; itemCode: string; itemName: string
  employeeId: number | null; employeeName: string | null
  partnerId: number | null; partnerName: string | null
  warehouseId: number | null; warehouseName: string | null
  projectId: number | null; projectName: string | null
  planQty: number; unitPrice: number; planAmount: number; remark: string | null
}
interface Doc { planNo: string; planDate: string; lines: PlanRow[]; amount: number }
interface LineForm { partnerId: string; employeeId: string; itemId: string; planQty: string; unitPrice: string; planAmount: string; remark: string }
const emptyLine = (): LineForm => ({ partnerId: '', employeeId: '', itemId: '', planQty: '', unitPrice: '', planAmount: '', remark: '' })
const emptyLines = () => [emptyLine(), emptyLine(), emptyLine()]
const num = (v: string) => Number(v || 0)
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

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
  const [f, setF] = useState({ expectedDate: ymd(new Date()), warehouseId: '', projectId: '' })
  const [lines, setLines] = useState<LineForm[]>(emptyLines())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

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

  function openNew() {
    setEditing(null); setFormError('')
    setF({ expectedDate: ymd(new Date()), warehouseId: '', projectId: '' })
    setLines(emptyLines()); setOpen(true)
  }
  function openEdit(d: Doc) {
    setEditing(d); setFormError('')
    const h = d.lines[0]
    setF({ expectedDate: d.planDate, warehouseId: h.warehouseId ? String(h.warehouseId) : '', projectId: h.projectId ? String(h.projectId) : '' })
    setLines([...d.lines.map((l) => ({
      partnerId: l.partnerId ? String(l.partnerId) : '', employeeId: l.employeeId ? String(l.employeeId) : '',
      itemId: String(l.itemId), planQty: l.planQty ? String(l.planQty) : '', unitPrice: l.unitPrice ? String(l.unitPrice) : '',
      planAmount: String(l.planAmount), remark: l.remark ?? '',
    })), emptyLine()])
    setOpen(true)
  }
  const setLine = (i: number, patch: Partial<LineForm>) =>
    setLines((ls) => {
      const next = ls.map((l, j) => {
        if (j !== i) return l
        const n = { ...l, ...patch }
        /* 원본처럼 수량 · 단가를 고치면 예상매출액이 수량 × 단가로 다시 선다. */
        if (('planQty' in patch || 'unitPrice' in patch) && (num(n.planQty) || num(n.unitPrice))) n.planAmount = String(num(n.planQty) * num(n.unitPrice))
        return n
      })
      return next[next.length - 1].itemId ? [...next, emptyLine()] : next
    })
  const filled = lines.filter((l) => l.itemId)
  const total = filled.reduce((s, l) => s + num(l.planAmount), 0)

  async function save() {
    setFormError('')
    if (filled.length === 0) return setFormError('자료를 입력 바랍니다.')
    const body = {
      expectedDate: f.expectedDate,
      warehouseId: f.warehouseId ? Number(f.warehouseId) : undefined,
      projectId: f.projectId ? Number(f.projectId) : undefined,
      lines: filled.map((l) => ({
        partnerId: l.partnerId ? Number(l.partnerId) : undefined, employeeId: l.employeeId ? Number(l.employeeId) : undefined,
        itemId: Number(l.itemId), planQty: num(l.planQty), unitPrice: num(l.unitPrice), planAmount: num(l.planAmount),
        remark: l.remark || undefined,
      })),
    }
    setSaving(true)
    try {
      if (editing) await api.put(`/sales-plans/docs/${encodeURIComponent(editing.planNo)}`, body)
      else await api.post('/sales-plans/docs', body)
      setOpen(false)
      await load()
    } catch (err) { setFormError(extractErrorMessage(err)) }
    finally { setSaving(false) }
  }
  useShortcut('F8', save, open)
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
        { label: '선택삭제', disabled: picked.size === 0,
          onClick: () => { if (window.confirm('선택한 전표를 삭제 하겠습니까?')) void removeDocs([...picked]) } },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
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
                <td className="text-right">{won(d.amount)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <Modal open={open} width={1080} error={formError} onClose={() => setOpen(false)}
             title={editing ? '매출계획수정' : '매출계획입력'}>
        <ul className="ec-form">
          <li><div className="title">예상매출일자</div><div className="form">
            <input type="date" className="ec-input w-[150px]" value={f.expectedDate} disabled={!!editing}
                   onChange={(e) => setF((x) => ({ ...x, expectedDate: e.target.value }))} />
          </div></li>
          <li><div className="title">창고</div><div className="form">
            <CodePickerField label="창고" hideLabel fill emptyLabel="선택 안 함" placeholder="창고" value={f.warehouseId}
                             onChange={(v) => setF((x) => ({ ...x, warehouseId: v }))} items={pickers.warehouses} />
          </div></li>
          <li><div className="title">프로젝트</div><div className="form">
            <CodePickerField label="프로젝트" hideLabel fill emptyLabel="선택 안 함" placeholder="프로젝트" value={f.projectId}
                             onChange={(v) => setF((x) => ({ ...x, projectId: v }))} items={pickers.projects} />
          </div></li>
        </ul>
        <table className="w-full ec-head700 mt-[8px]">
          <thead><tr>
            <th className="w-[34px]"></th>
            <th className="w-[170px]">거래처</th>
            <th className="w-[140px]">담당자</th>
            <th className="w-[170px]">품목</th>
            <th className="w-[80px] text-right">수량</th>
            <th className="w-[100px] text-right">단가</th>
            <th className="w-[110px] text-right">예상매출액</th>
            <th>비고</th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="text-center">{i + 1}</td>
                <td><CodePickerField label="거래처" hideLabel fill emptyLabel="지우기" placeholder="거래처" value={l.partnerId}
                                     onChange={(v) => setLine(i, { partnerId: v })} items={pickers.partners} /></td>
                <td><CodePickerField label="담당자" hideLabel fill emptyLabel="지우기" placeholder="담당자" value={l.employeeId}
                                     onChange={(v) => setLine(i, { employeeId: v })} items={pickers.employees} /></td>
                <td><CodePickerField label="품목" hideLabel fill emptyLabel="지우기" placeholder="품목" value={l.itemId}
                                     onChange={(v) => setLine(i, { itemId: v })} items={pickers.items} /></td>
                <td><input className="ec-input w-full text-right" value={l.planQty} disabled={!l.itemId} onChange={(e) => setLine(i, { planQty: e.target.value })} /></td>
                <td><input className="ec-input w-full text-right" value={l.unitPrice} disabled={!l.itemId} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></td>
                <td><input className="ec-input w-full text-right" value={l.planAmount} disabled={!l.itemId} onChange={(e) => setLine(i, { planAmount: e.target.value })} /></td>
                <td><input className="ec-input w-full" value={l.remark} disabled={!l.itemId} onChange={(e) => setLine(i, { remark: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={6}></td><td className="text-right">{won(total)}</td><td></td></tr></tfoot>
        </table>
        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>저장(F8)</button>
          {editing
            ? <button className="ec-btn" onClick={() => { if (window.confirm('선택한 전표를 삭제 하겠습니까?')) void removeDocs([editing.planNo]) }}>삭제</button>
            : <button className="ec-btn" onClick={() => setLines(emptyLines())}>다시 작성</button>}
          <button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
