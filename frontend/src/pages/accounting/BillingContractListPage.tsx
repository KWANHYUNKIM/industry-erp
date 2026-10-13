import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { VAT_TYPES, won, type BillingContractRow } from '../../features/billingcontract/types'

/**
 * 회계 II › 계약관리 › 계약 › <b>계약조회</b>(E060903) — 2026-10-13 loginaa 실측.
 *
 * <p>조건: 계약일자(최근30일(+1개월)) · 거래처 · 담당자 · 계약항목 · 계약 · 부가세유형 · 청구단위 · 내·외자구분(전체 · 내자 · 외자) · 부서 · 프로젝트.
 * 열: 계약번호(계약일자-No. 링크) · 계약명 · 청구시작일 · 청구종료일 · 거래처 · 항목 · 금액(공급가액 + 부가세) · 유형(부가세유형) · 인쇄.
 * 버튼: 신규(F2) · Email · 인쇄 · 선택삭제 · Excel. 최근 계약이 위.
 * 담당자 · 부서 조건, Email · 인쇄는 아직 두지 않는다. [선택삭제] 확인 문구는 원본에서 아직 못 쟀다(수표조회와 같은 글을 쓴다). [항목] 은 첫 줄 항목명(줄이 여럿인 계약은 원본에서 아직 못 쟀다).
 */
export default function BillingContractListPage() {
  const nav = useNavigate()
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [contract, setContract] = useState('')
  const [vatType, setVatType] = useState('')
  const [unit, setUnit] = useState('')
  const [currency, setCurrency] = useState<'' | 'D' | 'F'>('')
  const [project, setProject] = useState('')
  const [rows, setRows] = useState<BillingContractRow[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '계약조회', [rows.length])

  async function load() {
    setLoading(true); setError('')
    try {
      setRows((await api.get<BillingContractRow[]>('/billing-contracts', { params: { from, to } })).data)
      setPicked(new Set())
    } catch (e) { setError(extractErrorMessage(e)) } finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const opts = (f: (r: BillingContractRow) => [string, string][]) => {
    const m = new Map<string, string>()
    rows.forEach((r) => f(r).forEach(([v, n]) => m.set(v, n)))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, name]) => ({ value, name }))
  }
  const partners = useMemo(() => opts((r) => [[String(r.partnerId), r.partnerName]]), [rows])
  const items = useMemo(() => opts((r) => r.lines.map((l) => [String(l.itemId), l.itemName])), [rows])
  const contracts = useMemo(() => opts((r) => [[String(r.id), r.name ?? r.code]]), [rows])
  const units = useMemo(() => opts((r) => r.lines.filter((l) => l.billingUnitId != null).map((l) => [String(l.billingUnitId), l.billingUnitName ?? ''])), [rows])
  const projects = useMemo(() => opts((r) => (r.projectId != null ? [[String(r.projectId), r.projectName ?? '']] : [])), [rows])
  const shown = rows
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !item || r.lines.some((l) => String(l.itemId) === item))
    .filter((r) => !contract || String(r.id) === contract)
    .filter((r) => !vatType || r.vatType === vatType)
    .filter((r) => !unit || r.lines.some((l) => String(l.billingUnitId) === unit))
    .filter((r) => !currency || r.foreignCurrency === (currency === 'F'))
    .filter((r) => !project || String(r.projectId) === project)

  async function remove() {
    setConfirmDelete(false)
    try { await api.post('/billing-contracts/delete', { ids: [...picked] }); await load() } catch (e) { setError(extractErrorMessage(e)) }
  }

  return (
    <EcListShell title="계약조회" searchable={false} actions={[
      { label: '검색(F8)', primary: true, onClick: () => void load() },
      { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setPartner(''); setItem(''); setContract(''); setVatType(''); setUnit(''); setCurrency(''); setProject('') } },
      { label: '신규(F2)', onClick: () => nav('/accounting/billing-contracts/new') },
      { label: '선택삭제', selected: picked.size, onClick: () => setConfirmDelete(true) },
      { label: 'Excel' },
    ]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="계약일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]"><EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} /></span>
        </EcCond>
        <EcCond label="거래처" pick><CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={partners} /></EcCond>
        <EcCond label="계약항목" pick><CodePickerField label="계약항목" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={items} /></EcCond>
        <EcCond label="계약" pick><CodePickerField label="계약" hideLabel width={220} emptyLabel="전체" value={contract} onChange={setContract} items={contracts} /></EcCond>
        <EcCond label="부가세유형">
          <select className="ec-input w-[160px]" value={vatType} onChange={(e) => setVatType(e.target.value)}>
            <option value="">전체</option>{VAT_TYPES.map((v) => <option key={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="청구단위" pick><CodePickerField label="청구단위" hideLabel width={180} emptyLabel="전체" value={unit} onChange={setUnit} items={units} /></EcCond>
        <EcCond label="내.외자구분">
          {([['', '전체'], ['D', '내자'], ['F', '외자']] as const).map(([v, n]) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" name="currency" checked={currency === v} onChange={() => setCurrency(v)} /> {n}
            </label>
          ))}
        </EcCond>
        <EcCond label="프로젝트" pick><CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={project} onChange={setProject} items={projects} /></EcCond>
      </ul>

      <table ref={tableRef} className="w-full">
        <thead>
          <tr>
            <th className="w-[34px]"><input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((r) => picked.has(r.id))}
              onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())} /></th>
            <th className="text-center">계약번호</th>
            <th>계약명</th>
            <th className="text-center">청구시작일</th>
            <th className="text-center">청구종료일</th>
            <th>거래처</th>
            <th>항목</th>
            <th className="text-right">금액</th>
            <th className="text-center">유형</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={9} className="ec-empty">불러오는 중…</td></tr>
            : shown.length === 0 ? <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            : shown.map((r) => (
              <tr key={r.id}>
                <td className="text-center"><input type="checkbox" aria-label={`${r.code} 선택`} checked={picked.has(r.id)}
                  onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n })} /></td>
                <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); nav(`/accounting/billing-contracts/new?id=${r.id}`) }}>{dateText(r.contractDate)} -{r.docNo}</a></td>
                <td>{r.name ?? ''}</td>
                <td className="text-center">{dateText(r.billStart)}</td>
                <td className="text-center">{dateText(r.billEnd)}</td>
                <td>{r.partnerName}</td>
                <td>{r.lines[0]?.itemName ?? ''}</td>
                <td className="text-right">{won(r.totalAmount)}</td>
                <td className="text-center">{r.vatType}</td>
              </tr>
            ))}
        </tbody>
      </table>

      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">선택한 전표를 삭제 하겠습니까?</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void remove()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
