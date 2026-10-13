import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import GridCode from '../../components/GridCode'
import EcDateField from '../../components/EcDateField'
import EcNumInput from '../../components/EcNumInput'
import type { CodeItem } from '../../components/CodePickerField'
import { ymd } from '../../utils/periods'
import type { Partner } from '../../types/api'
import { VAT_TYPES, won, type BillingContractRow, type BillingUnitRow, type ContractItemRow } from '../../features/billingcontract/types'

interface Line { itemId: string; billMonths: string; quantity: string; unitPrice: string; supplyAmount: string; vatAmount: string; billingUnitId: string; remark: string }
const blankLine = (): Line => ({ itemId: '', billMonths: '', quantity: '', unitPrice: '', supplyAmount: '', vatAmount: '', billingUnitId: '', remark: '' })
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const vatOf = (supply: number) => Math.floor(supply * 0.1)

/**
 * 회계 II › 계약관리 › 계약 › <b>계약입력</b>(E060902) — 2026-10-13 loginaa 실측.
 *
 * <p>머리: 계약일자(오늘) · 거래처 · 계약코드(다음 번호 '00017') · 계약명 · 청구시작일(오늘) · 청구종료일(비어 있음, 필수) ·
 * 부가세유형(세금계산서) · 통화(내자) · 담당자 · 부서 · 프로젝트 · 적요.
 * 줄: 항목코드(고르면 항목명 · 단가가 찬다) · 항목명 · 청구예정월([등록] → 청구예정월등록 창: 전체 · 1월 ~ 12월 체크 → 적용하면 주황 '등록') ·
 * 수량 · 단가 · 공급가액(수량 × 단가) · 부가세(10%) · 청구단위(필수) · 적요, 아래 합계.
 * 버튼: 저장(F8) · 다시 작성 · 리스트. 저장하면 안내 없이 새 빈 판(다음 계약코드)으로 바뀐다. 청구종료일 · 청구단위가 비면 칸을 빨갛게 막는다.
 * 원본의 [저장/전표(F7)] · 첨부 · 담당자 · 부서는 아직 두지 않는다.
 */
export default function BillingContractEntryPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('id')
  const [contractDate, setContractDate] = useState(ymd(new Date()))
  const [partnerId, setPartnerId] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [billStart, setBillStart] = useState(ymd(new Date()))
  const [billEnd, setBillEnd] = useState('')
  const [vatType, setVatType] = useState('세금계산서')
  const [foreignCurrency, setForeignCurrency] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [remark, setRemark] = useState('')
  const [lines, setLines] = useState<Line[]>([blankLine(), blankLine(), blankLine()])
  const [partners, setPartners] = useState<CodeItem[]>([])
  const [projects, setProjects] = useState<CodeItem[]>([])
  const [items, setItems] = useState<ContractItemRow[]>([])
  const [units, setUnits] = useState<BillingUnitRow[]>([])
  const [monthsFor, setMonthsFor] = useState<number | null>(null)
  const [monthPick, setMonthPick] = useState<Set<string>>(new Set())
  const [invalid, setInvalid] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  async function reset() {
    setContractDate(ymd(new Date())); setPartnerId(''); setName(''); setBillStart(ymd(new Date())); setBillEnd('')
    setVatType('세금계산서'); setForeignCurrency(false); setProjectId(''); setRemark(''); setInvalid(new Set())
    setLines([blankLine(), blankLine(), blankLine()])
    try { setCode((await api.get<{ code: string }>('/billing-contracts/next-code')).data.code) } catch { setCode('') }
  }

  useEffect(() => {
    Promise.all([api.get<Partner[]>('/partners'), api.get<{ id: number; code: string; name: string }[]>('/projects'),
      api.get<ContractItemRow[]>('/contract-items'), api.get<BillingUnitRow[]>('/billing-contracts/units')])
      .then(([p, pj, it, u]) => {
        setPartners(p.data.map((x) => ({ value: String(x.id), code: x.code, name: x.name })))
        setProjects(pj.data.map((x) => ({ value: String(x.id), code: x.code, name: x.name })))
        setItems(it.data.filter((x) => x.active)); setUnits(u.data)
      })
      .catch((e) => setError(extractErrorMessage(e)))
    if (!editId) { void reset(); return }
    api.get<BillingContractRow>(`/billing-contracts/${editId}`).then(({ data: c }) => {
      setContractDate(c.contractDate); setPartnerId(String(c.partnerId)); setCode(c.code); setName(c.name ?? '')
      setBillStart(c.billStart); setBillEnd(c.billEnd); setVatType(c.vatType); setForeignCurrency(c.foreignCurrency)
      setProjectId(c.projectId != null ? String(c.projectId) : ''); setRemark(c.remark ?? '')
      const ls = c.lines.map((l) => ({ itemId: String(l.itemId), billMonths: l.billMonths, quantity: String(Number(l.quantity)),
        unitPrice: String(Number(l.unitPrice)), supplyAmount: String(Number(l.supplyAmount)), vatAmount: String(Number(l.vatAmount)),
        billingUnitId: l.billingUnitId != null ? String(l.billingUnitId) : '', remark: l.remark ?? '' }))
      setLines([...ls, ...Array.from({ length: Math.max(0, 3 - ls.length) }, blankLine)])
    }).catch((e) => setError(extractErrorMessage(e)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId])

  const itemCodes = useMemo(() => items.map((x) => ({ value: String(x.id), code: x.code, name: x.name })), [items])
  const unitCodes = useMemo(() => units.map((x) => ({ value: String(x.id), code: x.code, name: x.name })), [units])
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => {
    if (j !== i) return l
    const n = { ...l, ...patch }
    if ('quantity' in patch || 'unitPrice' in patch) {
      const supply = Math.round((Number(n.quantity) || 0) * (Number(n.unitPrice) || 0))
      n.supplyAmount = String(supply); n.vatAmount = String(vatOf(supply))
    } else if ('supplyAmount' in patch) n.vatAmount = String(vatOf(Number(n.supplyAmount) || 0))
    return n
  }))
  const pickItem = (i: number, v: string) => {
    const it = items.find((x) => String(x.id) === v)
    setLine(i, { itemId: v, unitPrice: it ? String(Number(it.unitPrice)) : '' })
  }
  const filled = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.itemId)
  const sum = (k: keyof Line) => filled.reduce((s, { l }) => s + (Number(l[k]) || 0), 0)

  async function save() {
    const bad = new Set<string>()
    if (!partnerId) bad.add('partner')
    if (!billEnd) bad.add('billEnd')
    filled.forEach(({ l, i }) => { if (!l.billingUnitId) bad.add(`unit${i}`) })
    if (!filled.length) bad.add('line0')
    setInvalid(bad)
    if (bad.size) return
    const body = { contractDate, partnerId: Number(partnerId), code, name: name || null, billStart, billEnd, vatType, foreignCurrency,
      employeeId: null, departmentId: null, projectId: projectId ? Number(projectId) : null, remark: remark || null,
      lines: filled.map(({ l }) => ({ itemId: Number(l.itemId), billMonths: l.billMonths, quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0, supplyAmount: Number(l.supplyAmount) || 0, vatAmount: Number(l.vatAmount) || 0,
        billingUnitId: Number(l.billingUnitId), remark: l.remark || null })) }
    try {
      setError('')
      if (editId) { await api.put(`/billing-contracts/${editId}`, body); nav('/accounting/billing-contracts') }
      else { await api.post('/billing-contracts', body); await reset() }
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  const bad = (k: string) => (invalid.has(k) ? ' outline outline-1 outline-ec-danger rounded-ec' : '')
  const row = (label: string, body: React.ReactNode) => (
    <li className="flex items-center gap-[8px]"><span className="w-[93px] shrink-0 text-ec-hint">{label}</span><span className="flex-1 flex items-center gap-[4px]">{body}</span></li>
  )

  return (
    <EcListShell title="계약입력" searchable={false} actions={[
      { label: '저장(F8)', primary: true, onClick: () => void save() },
      { label: '다시 작성', onClick: () => void reset() },
      { label: '리스트', onClick: () => nav('/accounting/billing-contracts') },
    ]}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void save() } }}>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        <ul className="ec-form mb-[8px] grid grid-cols-2 gap-x-[30px] gap-y-[6px] mobile:grid-cols-1">
          {row('계약일자', <EcDateField value={contractDate} onChange={setContractDate} />)}
          {row('거래처', <span className={`flex-1${bad('partner')}`} aria-invalid={invalid.has('partner')}>
            <GridCode title="거래처검색" codeHead="거래처코드" nameHead="거래처명" items={partners} value={partnerId} onPick={setPartnerId} /></span>)}
          {row('계약코드', <input className="ec-input flex-1" aria-label="계약코드" maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} />)}
          {row('계약명', <input className="ec-input flex-1" aria-label="계약명" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />)}
          {row('청구시작일', <EcDateField value={billStart} onChange={setBillStart} />)}
          {row('청구종료일', <span className={bad('billEnd')} aria-invalid={invalid.has('billEnd')}><EcDateField value={billEnd} onChange={setBillEnd} /></span>)}
          {row('부가세유형', <select className="ec-input flex-1" aria-label="부가세유형" value={vatType} onChange={(e) => setVatType(e.target.value)}>
            {VAT_TYPES.map((v) => <option key={v}>{v}</option>)}</select>)}
          {row('통화', <select className="ec-input flex-1" aria-label="통화" value={foreignCurrency ? 'F' : 'D'} onChange={(e) => setForeignCurrency(e.target.value === 'F')}>
            <option value="D">내자</option><option value="F">외자</option></select>)}
          {row('프로젝트', <span className="flex-1"><GridCode title="프로젝트검색" codeHead="프로젝트코드" nameHead="프로젝트명" items={projects} value={projectId} onPick={setProjectId} /></span>)}
          {row('적요', <input className="ec-input flex-1" aria-label="적요" maxLength={200} value={remark} onChange={(e) => setRemark(e.target.value)} />)}
        </ul>

        <div className="overflow-x-auto">
          <table className="ec-grid-input no-ec table-fixed min-w-[1100px] [&_tbody_tr]:h-[30px]">
            <thead>
              <tr>
                <th className="w-[34px]" />
                <th className="w-[160px]">항목코드</th>
                <th>항목명</th>
                <th className="w-[110px]">청구예정월</th>
                <th className="w-[80px]">수량</th>
                <th className="w-[100px]">단가</th>
                <th className="w-[110px]">공급가액</th>
                <th className="w-[100px]">부가세</th>
                <th className="w-[150px]">청구단위</th>
                <th>적요</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="pad text-center text-ec-hint">{i + 1}</td>
                  <td className={`pad${bad(`line${i}`)}`}><GridCode title="계약항목검색" codeHead="계약항목코드" nameHead="계약항목명" items={itemCodes} value={l.itemId} onPick={(v) => pickItem(i, v)} /></td>
                  <td className="pad">{items.find((x) => String(x.id) === l.itemId)?.name ?? ''}</td>
                  <td className="pad text-center">
                    {l.itemId && <a href="#" aria-label={`${i + 1}줄 청구예정월`} className={l.billMonths ? 'text-ec-warn font-bold' : 'ec-link'}
                      onClick={(e) => { e.preventDefault(); setMonthsFor(i); setMonthPick(new Set(l.billMonths ? l.billMonths.split(',') : [])) }}>등록</a>}
                  </td>
                  <td className="pad"><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 수량`} value={l.quantity} onValue={(v) => setLine(i, { quantity: v })} /></td>
                  <td className="pad"><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 단가`} value={l.unitPrice} onValue={(v) => setLine(i, { unitPrice: v })} /></td>
                  <td className="pad"><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 공급가액`} value={l.supplyAmount} onValue={(v) => setLine(i, { supplyAmount: v })} /></td>
                  <td className="pad"><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 부가세`} value={l.vatAmount} onValue={(v) => setLine(i, { vatAmount: v })} /></td>
                  <td className={`pad${bad(`unit${i}`)}`} aria-invalid={invalid.has(`unit${i}`)}>
                    <GridCode title="청구단위" codeHead="청구단위코드" nameHead="청구단위명" items={unitCodes} value={l.billingUnitId} onPick={(v) => setLine(i, { billingUnitId: v })} />
                  </td>
                  <td className="pad"><input className="ec-input w-full" aria-label={`${i + 1}줄 적요`} maxLength={200} value={l.remark} onChange={(e) => setLine(i, { remark: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} />
                <td className="text-right">{won(sum('quantity'))}</td>
                <td />
                <td className="text-right">{won(sum('supplyAmount'))}</td>
                <td className="text-right">{won(sum('vatAmount'))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" className="ec-btn ec-btn-sm mt-[6px]" onClick={() => setLines((ls) => [...ls, blankLine()])}>줄 추가</button>
      </div>

      <Modal open={monthsFor != null} title="청구예정월등록" width={420} error={error} onClose={() => setMonthsFor(null)}>
        <ul className="ec-cond mb-[8px] grid grid-cols-1 gap-[4px]">
          <li><label className="inline-flex items-center gap-[4px]"><input type="checkbox" checked={monthPick.size === 12}
            onChange={(e) => setMonthPick(e.target.checked ? new Set(MONTHS) : new Set())} /> 전체</label></li>
          {MONTHS.map((m) => (
            <li key={m}><label className="inline-flex items-center gap-[4px]"><input type="checkbox" checked={monthPick.has(m)}
              onChange={(e) => setMonthPick((s) => { const n = new Set(s); if (e.target.checked) n.add(m); else n.delete(m); return n })} /> {Number(m)}월</label></li>
          ))}
        </ul>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => {
            if (monthsFor != null) setLine(monthsFor, { billMonths: MONTHS.filter((m) => monthPick.has(m)).join(',') })
            setMonthsFor(null)
          }}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setMonthsFor(null)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
