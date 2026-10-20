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
import { VAT_TYPES, won, type BillingContractRow, type BillingUnitRow, type ContractItemRow, type ProductLink } from '../../features/billingcontract/types'
import ProductLinkModal, { SetTag, type ProductOption } from '../../features/billingcontract/ProductLinkModal'

interface Line {
  itemId: string; billMonths: string; quantity: string; unitPrice: string; supplyAmount: string; vatAmount: string; billingUnitId: string; remark: string
  /** [상세] 품목연결설정 — [적용]하기 전에는 null(계약항목의 설정을 보여만 준다). */
  products: ProductLink[] | null
}
const blankLine = (): Line => ({ itemId: '', billMonths: '', quantity: '', unitPrice: '', supplyAmount: '', vatAmount: '', billingUnitId: '', remark: '', products: null })
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const vatOf = (supply: number) => Math.floor(supply * 0.1)
/** 이력 창 작업일시 — 원본 '2026/10/13 오후 2:30:17' */
function actedAt(iso: string) {
  const d = new Date(iso)
  const h = d.getHours()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * 회계 II › 계약관리 › 계약 › <b>계약입력</b>(E060902) — 2026-10-13 loginaa 실측.
 *
 * <p>머리: 계약일자(오늘) · 거래처 · 계약코드(다음 번호 '00017') · 계약명 · 청구시작일(오늘) · 청구종료일(비어 있음, 필수) ·
 * 부가세유형(세금계산서) · 통화(내자) · 담당자 · 부서 · 프로젝트 · 적요.
 * 줄: 항목코드(고르면 항목명 · 단가가 찬다) · 항목명 · 청구예정월([등록] → 청구예정월등록 창: 전체 · 1월 ~ 12월 체크 → 적용하면 주황 '등록') ·
 * 수량 · 단가 · 공급가액(수량 × 단가) · 부가세(10%) · 청구단위(필수) · 적요 · 상세, 아래 합계.
 * [상세] → 품목연결설정 창(계약항목 00007 이면 D001 · D002 를 미리 보여 줌). [적용(F8)]해야 줄에 붙고 [상세]가 주황 글자가 된다 —
 * 붙인 줄의 청구자료만 회계/판매일괄반영 [판매반영]에 나온다(원본 도움말 '계약입력 시, 입력한 계약항목의 상세-품목연결설정을 해야합니다.').
 * 버튼: 저장(F8) · 다시 작성 · 리스트. 저장하면 안내 없이 새 빈 판(다음 계약코드)으로 바뀐다. 청구종료일 · 청구단위가 비면 칸을 빨갛게 막는다.
 * 원본의 [저장/전표(F7)] · 첨부는 아직 두지 않는다(담당자 · 부서는 2026-10-20 더함 — 원본 담당자 처음 값은 로그인 사원).
 *
 * <p>계약조회 [계약번호] 로 열면 <b>계약수정</b>(2026-10-13 실측): 계약일자 뒤에 ' -2'(그날 번호), 버튼 저장(F8) · 복사 · 닫기 · 삭제 · H.
 * [복사] → 계약입력: 계약일자 오늘 · 계약코드 다음 번호 · 계약명 비움, 나머지 머리와 줄은 그대로.
 * [삭제] → 알림 '전표를 삭제하겠습니까?' / '- 계약' 확인 · 취소. [H] → '이력' 창 [2026/10/13 -2] 작업자ID · 작업일시 · 상태(신규 · 수정).
 * 원본 [저장/전표(F7)](▲ 명세서)는 아직 못 쟀다.
 */
export default function BillingContractEntryPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('id')
  const copyId = params.get('copy')
  const [loaded, setLoaded] = useState<BillingContractRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [contractDate, setContractDate] = useState(ymd(new Date()))
  const [partnerId, setPartnerId] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [billStart, setBillStart] = useState(ymd(new Date()))
  const [billEnd, setBillEnd] = useState('')
  const [vatType, setVatType] = useState('세금계산서')
  const [foreignCurrency, setForeignCurrency] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [remark, setRemark] = useState('')
  const [lines, setLines] = useState<Line[]>([blankLine(), blankLine(), blankLine()])
  const [partners, setPartners] = useState<CodeItem[]>([])
  const [projects, setProjects] = useState<CodeItem[]>([])
  const [employees, setEmployees] = useState<CodeItem[]>([])
  const [departments, setDepartments] = useState<CodeItem[]>([])
  const [items, setItems] = useState<ContractItemRow[]>([])
  const [units, setUnits] = useState<BillingUnitRow[]>([])
  const [monthsFor, setMonthsFor] = useState<number | null>(null)
  const [detailFor, setDetailFor] = useState<number | null>(null)
  const [products, setProducts] = useState<ProductOption[]>([])
  const [monthPick, setMonthPick] = useState<Set<string>>(new Set())
  const [invalid, setInvalid] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  async function reset() {
    setContractDate(ymd(new Date())); setPartnerId(''); setName(''); setBillStart(ymd(new Date())); setBillEnd('')
    setVatType('세금계산서'); setForeignCurrency(false); setEmployeeId(''); setDepartmentId(''); setProjectId(''); setRemark(''); setInvalid(new Set())
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
    api.get<{ id: number; code: string; name: string }[]>('/employees')
      .then((r) => setEmployees(r.data.map((x) => ({ value: String(x.id), code: x.code, name: x.name })))).catch(() => setEmployees([]))
    api.get<{ id: number; code: string; name: string }[]>('/departments')
      .then((r) => setDepartments(r.data.map((x) => ({ value: String(x.id), code: x.code, name: x.name })))).catch(() => setDepartments([]))
    api.get<ProductOption[]>('/items').then((r) => setProducts(r.data)).catch(() => setProducts([]))
    const sourceId = editId ?? copyId
    if (!sourceId) { setLoaded(null); void reset(); return }
    api.get<BillingContractRow>(`/billing-contracts/${sourceId}`).then(async ({ data: c }) => {
      setInvalid(new Set())
      if (editId) {
        setLoaded(c); setContractDate(c.contractDate); setCode(c.code); setName(c.name ?? '')
      } else {
        // [복사] — 원본: 계약일자 오늘 · 계약코드 다음 번호 · 계약명 비움
        setLoaded(null); setContractDate(ymd(new Date())); setName('')
        try { setCode((await api.get<{ code: string }>('/billing-contracts/next-code')).data.code) } catch { setCode('') }
      }
      setPartnerId(String(c.partnerId))
      setBillStart(c.billStart); setBillEnd(c.billEnd); setVatType(c.vatType); setForeignCurrency(c.foreignCurrency)
      setEmployeeId(c.employeeId != null ? String(c.employeeId) : ''); setDepartmentId(c.departmentId != null ? String(c.departmentId) : '')
      setProjectId(c.projectId != null ? String(c.projectId) : ''); setRemark(c.remark ?? '')
      const ls = c.lines.map((l) => ({ itemId: String(l.itemId), billMonths: l.billMonths, quantity: String(Number(l.quantity)),
        unitPrice: String(Number(l.unitPrice)), supplyAmount: String(Number(l.supplyAmount)), vatAmount: String(Number(l.vatAmount)),
        billingUnitId: l.billingUnitId != null ? String(l.billingUnitId) : '', remark: l.remark ?? '',
        products: l.products?.length ? l.products : null }))
      setLines([...ls, ...Array.from({ length: Math.max(0, 3 - ls.length) }, blankLine)])
    }).catch((e) => setError(extractErrorMessage(e)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, copyId])

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
    setLine(i, { itemId: v, unitPrice: it ? String(Number(it.unitPrice)) : '', products: null })
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
      employeeId: employeeId ? Number(employeeId) : null, departmentId: departmentId ? Number(departmentId) : null, projectId: projectId ? Number(projectId) : null, remark: remark || null,
      lines: filled.map(({ l }) => ({ itemId: Number(l.itemId), billMonths: l.billMonths, quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0, supplyAmount: Number(l.supplyAmount) || 0, vatAmount: Number(l.vatAmount) || 0,
        billingUnitId: Number(l.billingUnitId), remark: l.remark || null, products: l.products })) }
    try {
      setError('')
      if (editId) { await api.put(`/billing-contracts/${editId}`, body); nav('/accounting/billing-contracts') }
      else if (copyId) { await api.post('/billing-contracts', body); nav('/accounting/billing-contracts/new') }
      else { await api.post('/billing-contracts', body); await reset() }
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  async function remove() {
    if (!editId) return
    try {
      setError('')
      await api.post('/billing-contracts/delete', { ids: [Number(editId)] })
      setConfirmDelete(false)
      nav('/accounting/billing-contracts')
    } catch (e) { setConfirmDelete(false); setError(extractErrorMessage(e)) }
  }
  const slipNo = loaded ? `${loaded.contractDate.replaceAll('-', '/')} -${loaded.docNo}` : ''
  const history = loaded ? [
    ...(loaded.createdAt ? [{ worker: loaded.createdBy ?? '', at: loaded.createdAt, action: '신규' }] : []),
    ...(loaded.updatedBy && loaded.updatedAt ? [{ worker: loaded.updatedBy, at: loaded.updatedAt, action: '수정' }] : []),
  ] : []
  const bad = (k: string) => (invalid.has(k) ? ' outline outline-1 outline-ec-danger rounded-ec' : '')
  const row = (label: string, body: React.ReactNode) => (
    <li className="flex items-center gap-[8px]"><span className="w-[93px] shrink-0 text-ec-hint">{label}</span><span className="flex-1 flex items-center gap-[4px]">{body}</span></li>
  )

  return (
    <EcListShell title={editId ? '계약수정' : '계약입력'} searchable={false} actions={editId ? [
      { label: '저장(F8)', primary: true, onClick: () => void save() },
      { label: '복사', onClick: () => nav(`/accounting/billing-contracts/new?copy=${editId}`) },
      { label: '닫기', onClick: () => nav('/accounting/billing-contracts') },
      { label: '삭제', onClick: () => setConfirmDelete(true) },
      { label: 'H', onClick: () => setHistoryOpen(true) },
    ] : [
      { label: '저장(F8)', primary: true, onClick: () => void save() },
      { label: '다시 작성', onClick: () => void reset() },
      { label: '리스트', onClick: () => nav('/accounting/billing-contracts') },
    ]}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void save() } }}>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        <ul className="ec-form mb-[8px] grid grid-cols-2 gap-x-[30px] gap-y-[6px] mobile:grid-cols-1">
          {row('계약일자', <><EcDateField value={contractDate} onChange={setContractDate} />{loaded && <span>-{loaded.docNo}</span>}</>)}
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
          {row('담당자', <span className="flex-1"><GridCode title="담당자검색" codeHead="사원번호" nameHead="사원명" items={employees} value={employeeId} onPick={setEmployeeId} /></span>)}
          {row('부서', <span className="flex-1"><GridCode title="부서검색" codeHead="부서코드" nameHead="부서명" items={departments} value={departmentId} onPick={setDepartmentId} /></span>)}
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
                <th className="w-[50px]">상세</th>
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
                  <td className="pad text-center"><SetTag set={!!l.products?.length} label="상세" onClick={() => setDetailFor(i)} /></td>
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
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" className="ec-btn ec-btn-sm mt-[6px]" onClick={() => setLines((ls) => [...ls, blankLine()])}>줄 추가</button>
      </div>

      {/* 원본: 줄 [상세] → 품목연결설정. 그 줄의 계약항목 설정을 보여 주고, [적용(F8)]해야 계약 줄에 붙는다(2026-10-13 실측). */}
      <ProductLinkModal open={detailFor != null} products={products} onClose={() => setDetailFor(null)}
        value={detailFor != null ? (lines[detailFor].products ?? items.find((x) => String(x.id) === lines[detailFor].itemId)?.products ?? []) : []}
        onApply={(ps) => { if (detailFor != null) setLine(detailFor, { products: ps.length ? ps : null }); setDetailFor(null) }} />

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

      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?<br />- 계약</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void remove()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>

      <Modal open={historyOpen} title="이력" width={760} error={error} onClose={() => setHistoryOpen(false)}>
        <p className="mb-[6px]">[{slipNo}]</p>
        <table className="w-full text-left">
          <thead>
            <tr><th className="w-[40px]"></th><th className="text-center">작업자ID</th><th className="text-center">작업일시</th><th className="text-center">상태</th></tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : history.map((h, i) => (
              <tr key={h.action}>
                <td className="text-center">{i + 1}</td>
                <td className="text-center">{h.worker}</td>
                <td className="text-center">{actedAt(h.at)}</td>
                <td className="text-center">{h.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-[12px]"><button type="button" className="ec-btn" onClick={() => setHistoryOpen(false)}>닫기</button></div>
      </Modal>
    </EcListShell>
  )
}
