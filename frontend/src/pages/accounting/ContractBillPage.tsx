import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import EcDateField from '../../components/EcDateField'
import EcNumInput from '../../components/EcNumInput'
import EcBadge from '../../components/ui/EcBadge'
import { ymd } from '../../utils/periods'
import { dateText } from '../../utils/dateText'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { VAT_TYPES, won, type BillableLine, type BillingUnitRow, type ContractBillRow } from '../../features/billingcontract/types'

/** 생성 · 수정 창의 한 줄. */
interface Line {
  id?: number; contractLineId: number; itemCode: string; itemName: string; contractCode: string; contractName: string | null
  partnerName: string; billMonth: string; quantity: string; unitPrice: string; supplyAmount: string; vatAmount: string
  billingUnitCode: string | null; billingUnitName: string | null; remark: string
}
const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const vatOf = (supply: number) => Math.floor(supply * 0.1)

/**
 * 회계 II › 계약관리 › 청구예정자료 › <b>청구예정자료생성</b>(E060905 청구예정자료리스트) — 2026-10-13 loginaa 실측.
 *
 * <p>목록 열: 청구생성번호(일자-No.) · 청구단위 · 항목 · 계약명 · 거래처 · 금액 · 회계반영여부 · 판매생성여부. 기본 기간 한 달 전 ~ 오늘. 버튼: 신규(F2) · 선택삭제.
 * [신규] → 청구자료생성 창: 일자(오늘) · 부가세유형(세금계산서) · 청구단위(필수, 여럿) · [계약] → 계약현황(청구예정월 이번 달 ~ 이번 달)에서
 * 계약 줄 × 청구월을 골라 [적용] → 줄(항목 · 계약 · 거래처 · 청구예정월 · 수량 · 단가 · 공급가액 · 부가세 · 합계 · 청구단위 · 적요, 수량~부가세 고침)
 * → [일괄생성](한 장) · [거래처별생성](거래처마다 한 장) · 닫기. 같은 달을 두 번 생성해도 막지 않는다.
 * 번호를 누르면 청구자료수정 창: 저장(F8) · 닫기 · 삭제 — 삭제 확인 '전표를 삭제하겠습니까?'.
 * 회계/판매일괄반영으로 매출전표를 만든 청구자료는 [회계반영여부] 가 주황 ✓ 이고, 수정 창이 닫기 · 회계전표삭제 · 삭제 다(저장이 없다).
 * [회계전표삭제] → '회계전표번호보기' 창: ● 연결회계전표내역(청구예정자료 '20261013-3' · 회계전표 '2026/10/13-10'),
 * 빨간 안내 '[삭제]를 할 경우, 연결된 다른 청구생성번호 역시 회계반영이 취소됩니다.' · 삭제 · 취소 → '삭제하겠습니까?' [확인]
 * → 수정 창이 다시 저장(F8) · 닫기 · 삭제(2026-10-13 실측).
 */
export default function ContractBillPage() {
  const now = new Date()
  const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
  const [from] = useState(ymd(monthAgo))
  const [to] = useState(ymd(now))
  const [rows, setRows] = useState<ContractBillRow[]>([])
  const [units, setUnits] = useState<BillingUnitRow[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  // 생성 · 수정 창
  const [open, setOpen] = useState<'new' | number | null>(null)
  const [billDate, setBillDate] = useState(ymd(now))
  const [vatType, setVatType] = useState('세금계산서')
  const [unitIds, setUnitIds] = useState<Set<number>>(new Set())
  const [lines, setLines] = useState<Line[]>([])
  const [unitErr, setUnitErr] = useState(false)
  // 계약 찾기
  const [finding, setFinding] = useState(false)
  const [fromMonth, setFromMonth] = useState(monthOf(now))
  const [toMonth, setToMonth] = useState(monthOf(now))
  const [found, setFound] = useState<BillableLine[]>([])
  const [foundPick, setFoundPick] = useState<Set<number>>(new Set())
  const [confirm, setConfirm] = useState<'delete' | 'pickedDelete' | 'unreflect' | null>(null)
  // [회계전표삭제] → 회계전표번호보기
  const [links, setLinks] = useState<{ billId: number; billDate: string; billDocNo: number; journalEntryId: number; entryDate: string | null; entryNo: number | null }[] | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '청구예정자료리스트', [rows.length])

  async function load() {
    try {
      setRows((await api.get<ContractBillRow[]>('/contract-bills', { params: { from, to } })).data)
      setPicked(new Set())
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  useEffect(() => {
    void load()
    api.get<BillingUnitRow[]>('/billing-contracts/units').then((r) => setUnits(r.data)).catch(() => setUnits([]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openNew() {
    setOpen('new'); setBillDate(ymd(new Date())); setVatType('세금계산서'); setUnitIds(new Set()); setLines([]); setUnitErr(false); setError('')
  }
  function openEdit(b: ContractBillRow) {
    setOpen(b.id); setBillDate(b.billDate); setVatType(b.vatType); setUnitErr(false); setError('')
    setLines(b.lines.map((l) => ({ id: l.id, contractLineId: l.contractLineId, itemCode: l.itemCode, itemName: l.itemName, contractCode: l.contractCode,
      contractName: l.contractName, partnerName: l.partnerName, billMonth: l.billMonth, quantity: String(Number(l.quantity)), unitPrice: String(Number(l.unitPrice)),
      supplyAmount: String(Number(l.supplyAmount)), vatAmount: String(Number(l.vatAmount)), billingUnitCode: l.billingUnitCode, billingUnitName: l.billingUnitName,
      remark: l.remark ?? '' })))
  }
  async function find() {
    if (unitIds.size === 0) { setUnitErr(true); return }
    try {
      const r = await api.get<BillableLine[]>('/billing-contracts/billable', { params: { fromMonth, toMonth, unitIds: [...unitIds].join(',') } })
      setFound(r.data); setFoundPick(new Set()); setFinding(true)
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  function applyFound() {
    setLines((ls) => [...ls, ...found.filter((_, i) => foundPick.has(i)).map((f) => ({ contractLineId: f.contractLineId, itemCode: f.itemCode,
      itemName: f.itemName, contractCode: f.contractCode, contractName: f.contractName, partnerName: f.partnerName, billMonth: f.billMonth,
      quantity: String(Number(f.quantity)), unitPrice: String(Number(f.unitPrice)), supplyAmount: String(Number(f.supplyAmount)),
      vatAmount: String(Number(f.vatAmount)), billingUnitCode: f.billingUnitCode, billingUnitName: f.billingUnitName, remark: f.remark ?? '' }))])
    setFinding(false)
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => {
    if (j !== i) return l
    const n = { ...l, ...patch }
    if ('quantity' in patch || 'unitPrice' in patch) {
      const supply = Math.round((Number(n.quantity) || 0) * (Number(n.unitPrice) || 0))
      n.supplyAmount = String(supply); n.vatAmount = String(vatOf(supply))
    } else if ('supplyAmount' in patch) n.vatAmount = String(vatOf(Number(n.supplyAmount) || 0))
    return n
  }))
  const body = () => lines.map((l) => ({ id: l.id ?? null, contractLineId: l.contractLineId, billMonth: l.billMonth, quantity: Number(l.quantity) || 0,
    unitPrice: Number(l.unitPrice) || 0, supplyAmount: Number(l.supplyAmount) || 0, vatAmount: Number(l.vatAmount) || 0, remark: l.remark || null }))
  async function create(byPartner: boolean) {
    if (unitIds.size === 0) { setUnitErr(true); return }
    try {
      await api.post('/contract-bills', { billDate, vatType, byPartner, lines: body() })
      setOpen(null); await load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  async function saveEdit() {
    try { await api.put(`/contract-bills/${open}`, { lines: body() }); setOpen(null); await load() } catch (e) { setError(extractErrorMessage(e)) }
  }
  const openRow = typeof open === 'number' ? rows.find((r) => r.id === open) : undefined
  async function openLinks() {
    try { setLinks((await api.get(`/contract-bills/${open}/journals`)).data) } catch (e) { setError(extractErrorMessage(e)) }
  }
  async function unreflect() {
    setConfirm(null)
    try {
      await api.post(`/contract-bills/${open}/unreflect`)
      setLinks(null)
      const r = (await api.get<ContractBillRow[]>('/contract-bills', { params: { from, to } })).data
      setRows(r)
      const b = r.find((x) => x.id === open)
      if (b) openEdit(b)
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  async function remove(ids: number[]) {
    setConfirm(null)
    try { await api.post('/contract-bills/delete', { ids }); setOpen(null); await load() } catch (e) { setError(extractErrorMessage(e)) }
  }
  const total = (k: 'quantity' | 'supplyAmount' | 'vatAmount') => lines.reduce((s, l) => s + (Number(l[k]) || 0), 0)
  const foundSum = (cs: BillableLine[], k: 'quantity' | 'unitPrice' | 'supplyAmount' | 'vatAmount') => cs.reduce((s, c) => s + Number(c[k]), 0)
  const firstLine = (b: ContractBillRow) => b.lines[0]

  return (
    <EcListShell title="청구예정자료리스트" searchable={false} actions={[
      { label: '신규(F2)', primary: true, onClick: openNew },
      { label: '선택삭제', selected: picked.size, onClick: () => setConfirm('pickedDelete') },
    ]}>
      {error && !open && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <p className="text-right mb-[4px]">{dateText(from)} ~ {dateText(to)}</p>
      <table ref={tableRef} className="w-full">
        <thead>
          <tr>
            <th className="w-[34px]"><input type="checkbox" aria-label="전체 선택" checked={rows.length > 0 && picked.size === rows.length}
              onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
            <th className="text-center">청구생성번호</th>
            <th>청구단위</th>
            <th>항목</th>
            <th>계약명</th>
            <th>거래처</th>
            <th className="text-right">금액</th>
            <th className="text-center">회계반영여부</th>
            <th className="text-center">판매생성여부</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            : rows.map((b) => (
              <tr key={b.id}>
                <td className="text-center"><input type="checkbox" aria-label={`${b.docNo} 선택`} checked={picked.has(b.id)}
                  onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(b.id); else n.delete(b.id); return n })} /></td>
                <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); openEdit(b) }}>{dateText(b.billDate)} -{b.docNo}</a></td>
                <td>{firstLine(b)?.billingUnitName ?? ''}</td>
                <td>{firstLine(b)?.itemName ?? ''}</td>
                <td>{firstLine(b)?.contractName ?? ''}</td>
                <td>{firstLine(b)?.partnerName ?? ''}</td>
                <td className="text-right">{won(b.totalAmount)}</td>
                <td className="text-center">{b.accountingReflected ? <EcBadge tone="warn">✓</EcBadge> : ''}</td>
                <td className="text-center">{b.salesCreated ? 'Y' : ''}</td>
              </tr>
            ))}
        </tbody>
      </table>

      <Modal open={open != null} title={open === 'new' ? '청구자료생성' : '청구자료수정'} width={1300} error={error} onClose={() => setOpen(null)}>
        <h3 className="text-[14px] font-bold mb-[8px]">{open === 'new' ? '청구자료생성' : '청구자료수정'}</h3>
        <ul className="ec-cond mb-[8px] grid grid-cols-2 gap-x-[30px] gap-y-[6px] mobile:grid-cols-1">
          <li className="flex items-center gap-[8px]"><span className="w-[93px] text-ec-hint">일자</span>
            <EcDateField value={billDate} onChange={setBillDate} disabled={open !== 'new'} /></li>
          <li className="flex items-center gap-[8px]"><span className="w-[93px] text-ec-hint">청구단위</span>
            <span className={`flex-1 flex flex-wrap gap-[8px]${unitErr ? ' outline outline-1 outline-ec-danger rounded-ec' : ''}`} aria-invalid={unitErr}>
              {open === 'new' ? units.map((u) => (
                <label key={u.id} className="inline-flex items-center gap-[3px]">
                  <input type="checkbox" checked={unitIds.has(u.id)} onChange={(e) => { setUnitErr(false); setUnitIds((s) => { const n = new Set(s); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n }) }} /> {u.name}
                </label>
              )) : [...new Set(lines.map((l) => l.billingUnitName))].join(', ')}
            </span></li>
          <li className="flex items-center gap-[8px]"><span className="w-[93px] text-ec-hint">부가세유형</span>
            <select className="ec-input flex-1" aria-label="부가세유형" value={vatType} disabled={open !== 'new'} onChange={(e) => setVatType(e.target.value)}>
              {VAT_TYPES.map((v) => <option key={v}>{v}</option>)}</select></li>
        </ul>
        {open === 'new' && <button type="button" className="ec-btn ec-btn-sm mb-[6px]" onClick={() => void find()}>계약</button>}
        <div className="overflow-x-auto">
          <table className="ec-grid-input no-ec table-fixed min-w-[1250px] [&_tbody_tr]:h-[30px]">
            <thead>
              <tr>
                <th className="w-[34px]" /><th className="w-[90px]">항목코드</th><th>항목명</th><th className="w-[80px]">계약코드</th><th>계약명</th><th>거래처명</th>
                <th className="w-[90px]">청구예정월</th><th className="w-[80px]">수량</th><th className="w-[100px]">단가</th><th className="w-[110px]">공급가액</th>
                <th className="w-[100px]">부가세</th><th className="w-[110px]">합계</th><th className="w-[90px]">청구단위코드</th><th className="w-[90px]">청구단위</th><th>적요</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? <tr><td colSpan={15} className="ec-empty">[계약] 으로 청구할 계약을 불러오세요.</td></tr>
                : lines.map((l, i) => (
                  <tr key={i}>
                    <td className="pad text-center text-ec-hint">{i + 1}</td>
                    <td className="pad">{l.itemCode}</td><td className="pad">{l.itemName}</td><td className="pad">{l.contractCode}</td>
                    <td className="pad">{l.contractName ?? ''}</td><td className="pad">{l.partnerName}</td>
                    <td className="pad text-center">{l.billMonth.replace('-', '/')}</td>
                    <td className="pad"><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 수량`} value={l.quantity} onValue={(v) => setLine(i, { quantity: v })} /></td>
                    <td className="pad"><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 단가`} value={l.unitPrice} onValue={(v) => setLine(i, { unitPrice: v })} /></td>
                    <td className="pad"><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 공급가액`} value={l.supplyAmount} onValue={(v) => setLine(i, { supplyAmount: v })} /></td>
                    <td className="pad"><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 부가세`} value={l.vatAmount} onValue={(v) => setLine(i, { vatAmount: v })} /></td>
                    <td className="pad text-right">{won((Number(l.supplyAmount) || 0) + (Number(l.vatAmount) || 0))}</td>
                    <td className="pad">{l.billingUnitCode ?? ''}</td><td className="pad">{l.billingUnitName ?? ''}</td>
                    <td className="pad"><input className="ec-input w-full" aria-label={`${i + 1}줄 적요`} maxLength={200} value={l.remark} onChange={(e) => setLine(i, { remark: e.target.value })} /></td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7} /><td className="text-right">{won(total('quantity'))}</td><td />
                <td className="text-right">{won(total('supplyAmount'))}</td><td className="text-right">{won(total('vatAmount'))}</td>
                <td className="text-right">{won(total('supplyAmount') + total('vatAmount'))}</td><td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex gap-[5px] mt-[10px]">
          {open === 'new' ? <>
            <button type="button" className="ec-btn ec-btn-primary" disabled={!lines.length} onClick={() => void create(false)}>일괄생성</button>
            <button type="button" className="ec-btn" disabled={!lines.length} onClick={() => void create(true)}>거래처별생성</button>
            <button type="button" className="ec-btn" onClick={() => setOpen(null)}>닫기</button>
          </> : openRow?.lines.some((l) => l.journalEntryId != null) ? <>
            <button type="button" className="ec-btn" onClick={() => setOpen(null)}>닫기</button>
            <button type="button" className="ec-btn" onClick={() => void openLinks()}>회계전표삭제</button>
            <button type="button" className="ec-btn" onClick={() => setConfirm('delete')}>삭제</button>
          </> : <>
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveEdit()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setOpen(null)}>닫기</button>
            <button type="button" className="ec-btn" onClick={() => setConfirm('delete')}>삭제</button>
          </>}
        </div>
      </Modal>

      <Modal open={finding} title="계약현황" width={1200} error={error} onClose={() => setFinding(false)}>
        <div className="flex items-center gap-[6px] mb-[8px]">
          <span className="text-ec-hint">청구예정월</span>
          <input type="month" className="ec-input w-[150px]" aria-label="청구예정월 시작" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} />
          <span>~</span>
          <input type="month" className="ec-input w-[150px]" aria-label="청구예정월 끝" value={toMonth} onChange={(e) => setToMonth(e.target.value)} />
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void find()}>검색(F8)</button>
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className="w-[34px]"><input type="checkbox" aria-label="계약 전체 선택" checked={found.length > 0 && foundPick.size === found.length}
                onChange={(e) => setFoundPick(e.target.checked ? new Set(found.map((_, i) => i)) : new Set())} /></th>
              <th className="text-center">일자-No.</th><th>계약명</th><th>거래처명</th><th>항목명</th><th className="text-right">수량</th>
              <th className="text-right">단가</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th><th className="text-center">청구예정월</th>
            </tr>
          </thead>
          <tbody>
            {found.length === 0 ? <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              : [...new Set(found.map((f) => f.billMonth))].flatMap((m) => {
                const cs = found.map((f, i) => ({ f, i })).filter(({ f }) => f.billMonth === m)
                return [...cs.map(({ f, i }) => (
                  <tr key={`${f.contractLineId}-${m}`}>
                    <td className="text-center"><input type="checkbox" aria-label={`${f.contractCode} ${m} 선택`} checked={foundPick.has(i)}
                      onChange={(e) => setFoundPick((s) => { const n = new Set(s); if (e.target.checked) n.add(i); else n.delete(i); return n })} /></td>
                    <td className="text-center">{dateText(f.contractDate)} -{f.docNo}</td><td>{f.contractName ?? ''}</td><td>{f.partnerName}</td><td>{f.itemName}</td>
                    <td className="text-right">{Number(f.quantity).toFixed(2)}</td><td className="text-right">{won(f.unitPrice)}</td>
                    <td className="text-right">{won(f.supplyAmount)}</td><td className="text-right">{won(f.vatAmount)}</td>
                    <td className="text-right">{won(Number(f.supplyAmount) + Number(f.vatAmount))}</td>
                    <td className="text-center">{f.billMonths.split(',').join(' . ')}</td>
                  </tr>
                )), (
                  <tr key={`sub-${m}`} className="font-bold bg-ec-stripe">
                    <td colSpan={5} className="text-center">{m.replace('-', '/')} 계</td>
                    <td className="text-right">{foundSum(cs.map((c) => c.f), 'quantity').toFixed(2)}</td>
                    <td className="text-right">{won(foundSum(cs.map((c) => c.f), 'unitPrice'))}</td>
                    <td className="text-right">{won(foundSum(cs.map((c) => c.f), 'supplyAmount'))}</td>
                    <td className="text-right">{won(foundSum(cs.map((c) => c.f), 'vatAmount'))}</td>
                    <td className="text-right">{won(foundSum(cs.map((c) => c.f), 'supplyAmount') + foundSum(cs.map((c) => c.f), 'vatAmount'))}</td>
                    <td />
                  </tr>
                )]
              })}
          </tbody>
        </table>
        <div className="flex gap-[5px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" disabled={foundPick.size === 0} onClick={applyFound}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setFinding(false)}>닫기</button>
        </div>
      </Modal>

      <Modal open={links != null} title="회계전표번호보기" width={760} error={error} onClose={() => setLinks(null)}>
        <p className="font-bold mb-[6px]">● 연결회계전표내역</p>
        <table className="w-full mb-[6px]">
          <thead><tr><th className="text-center">청구예정자료</th><th className="text-center">회계전표</th></tr></thead>
          <tbody>
            {(links ?? []).map((l) => (
              <tr key={`${l.billId}-${l.journalEntryId}`}>
                <td className="text-center">{l.billDate.replace(/-/g, '')}-{l.billDocNo}</td>
                <td className="text-center">{l.entryDate ? `${dateText(l.entryDate)}-${l.entryNo ?? ''}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-ec-danger mb-[12px]">[삭제]를 할 경우, 연결된 다른 청구생성번호 역시 회계반영이 취소됩니다.</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => setConfirm('unreflect')}>삭제</button>
          <button type="button" className="ec-btn" onClick={() => setLinks(null)}>취소</button>
        </div>
      </Modal>

      <Modal open={confirm != null} title="알림" width={420} error={error} onClose={() => setConfirm(null)}>
        <p className="mb-[12px]">{confirm === 'unreflect' ? '삭제하겠습니까?' : confirm === 'delete' ? '전표를 삭제하겠습니까?' : '선택한 전표를 삭제 하겠습니까?'}</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary"
                  onClick={() => void (confirm === 'unreflect' ? unreflect() : remove(confirm === 'delete' && typeof open === 'number' ? [open] : [...picked]))}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirm(null)}>취소</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
