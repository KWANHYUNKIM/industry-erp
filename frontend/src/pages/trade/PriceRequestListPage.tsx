import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PurchaseRequestForm from '../../features/purchaserequest/PurchaseRequestForm'
import { ecConfirm } from '../../components/EcDialog'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo, shortDateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/codepicker/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { usePartnerManagers } from '../../utils/partnerManagers'
import { dateText } from '../../utils/dateText'
import Modal from '../../components/Modal'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../types/api'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { fmtAmount } from '../../utils/format'

/** 단가를 회신받은 발주서 — 단가확정 뒤로만 발주확정 · 입고전환이 있다(PurchaseOrderService). */
/** 단가요청은 따로 된 전표다(PRICE_REQUESTED, 2026-10-21) — 발주서를 만들어도 단가요청은 그대로(요청 · 계획과 같은 틀). */
const isPriceRequest = (s: PurchaseOrderStatus) => s === 'PRICE_REQUESTED'
type SrcLine = { sourceLineId?: number | null }
/** 원본 [유효기간] 후보 — 다른 [유효기한] 조건과 같은 묶음이다. */
const VALID_OPTS = ['사용안함', '직접입력', '금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월'] as const
type Tab = '전체' | '진행중' | '완료'

/**
 * 재고 I &gt; 구매관리 &gt; 단가요청 &gt; <b>단가요청조회</b>(E040322) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 일자(구간, 기본 <b>최근30일(+1개월)</b>) · 유효기간(기본 [사용안함]) · 내.외자구분 · 거래처 · 품목코드 · 프로젝트 · 담당자 ·
 * 거래처관리담당자 · 최종수정자 · 발송여부. 열: 번호(일자-No.) · 품목명 · 금액(합계) · 유효기간 · Email 발송 · 진행상태 · 생성한 전표 · 인쇄.
 * 위 탭 전체 · 미확인 · 확인 · 진행중 · 완료.
 *
 * <p>단가요청은 <b>따로 된 전표</b>(PRICE_REQUESTED)다 — 단가요청입력(E040321)으로 쓰고, 진행단계에서 수취단가 · 확정단가를 적고,
 * 발주서입력 툴바 [단가요청] 으로 확정단가를 실어 발주서를 쓴다(줄에 출처 — 원본 2026-10-21 실측, 이 화면에는 [다른전표생성] 이 없다). 원본 2026-10-21 실측: 저장하면 진행중, [선택삭제] '선택한 전표를 삭제 하겠습니까?'.
 * [생성한 전표] '조회' 는 이 단가요청 줄을 베낀 발주서 번호. Email 발송 · 인쇄 열과 [발송여부]는 메일을 안 보내 없다. 확인 단계가 없어 미확인 · 확인 탭도 없다.
 */
export default function PriceRequestListPage() {
  const pickers = useCondPickers(['partners', 'items', 'projects', 'employees'])
  const pmgr = usePartnerManagers()
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [validOpt, setValidOpt] = useState<typeof VALID_OPTS[number]>('사용안함')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [domestic, setDomestic] = useState<'전체' | '내자' | '외자'>('전체')
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [project, setProject] = useState('')
  const [employee, setEmployee] = useState('')
  const [partnerMgr, setPartnerMgr] = useState('')
  const [tab, setTab] = useState<Tab>('전체')
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [form, setForm] = useState<{ key: number; order: PurchaseOrder } | null>(null)
  const [madeOf, setMadeOf] = useState<PurchaseOrder | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<PurchaseOrder[]>('/purchase-orders', { params: { from, to } })
      setOrders(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const shown = useMemo(() => orders
    .filter((o) => isPriceRequest(o.status))
    .filter((o) => o.orderDate >= from && o.orderDate <= to)
    .filter((o) => validOpt === '사용안함' || (!!o.priceValidUntil && (!validFrom || o.priceValidUntil >= validFrom) && (!validTo || o.priceValidUntil <= validTo)))
    .filter((o) => domestic === '전체' || ((o.currency ?? 'KRW') === 'KRW') === (domestic === '내자'))
    .filter((o) => !partner || String(o.partnerId) === partner)
    .filter((o) => !item || o.lines.some((l) => String(l.itemId) === item))
    .filter((o) => !project || String(o.projectId) === project)
    .filter((o) => !employee || (o.employeeName ?? '') === employee)
    .filter((o) => !partnerMgr || pmgr.managerOfName(o.partnerName) === partnerMgr)
    .filter(() => tab !== '완료')
    .sort((a, b) => (a.orderDate > b.orderDate ? -1 : a.orderDate < b.orderDate ? 1 : b.orderNo.localeCompare(a.orderNo))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [orders, from, to, validOpt, validFrom, validTo, domestic, partner, item, project, employee, partnerMgr, tab])
  /** 이 단가요청 줄을 베낀 발주서들 — 원본 [생성한 전표] '조회'. */
  const madeFrom = (pr: PurchaseOrder) => {
    const ids = new Set(pr.lines.map((l) => l.id))
    return orders.filter((x) => !isPriceRequest(x.status) && x.lines.some((l) => ids.has((l as typeof l & SrcLine).sourceLineId ?? -1)))
  }
  async function removeChecked() {
    if (!(await ecConfirm('선택한 전표를 삭제 하겠습니까?'))) return
    try {
      for (const id of checked) await api.delete(`/purchase-orders/${id}`)
      setChecked(new Set())
    } catch (e) { setError(extractErrorMessage(e)) }
    void load()
  }
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '단가요청조회', [shown.length])

  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title="단가요청조회"
      searchable={false}
      actions={[
        /* 원본 단추줄(2026-10-21 실측): 신규(F2) · Email · 진행상태변경 · 보내기 · 인쇄 · 바코드(품목) · 선택삭제 · Excel · 이력조회 — 메일 · 보내기 · 인쇄 · 바코드는 없다. */
        { label: '신규(F2)', primary: true, onClick: () => navigate('/sales/price-request-input') },
        { label: '선택삭제', selected: checked.size, onClick: () => void removeChecked() },
        { label: '검색(F8)', onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setValidOpt('사용안함'); setValidFrom(''); setValidTo(''); setDomestic('전체'); setPartner(''); setItem(''); setProject(''); setEmployee(''); setPartnerMgr('') } },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="일자">
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="유효기간">
          <select className="ec-input" value={validOpt} style={{ width: 120 }}
                  onChange={(e) => {
                    const v = e.target.value as typeof VALID_OPTS[number]
                    setValidOpt(v)
                    const r = v === '사용안함' || v === '직접입력' ? null : periodOf(v)
                    if (r) { setValidFrom(r.from); setValidTo(r.to) }
                    if (v === '사용안함') { setValidFrom(''); setValidTo('') }
                  }}>
            {VALID_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {validOpt !== '사용안함' && (<>
            <EcDateRange from={{ className: "ec-input", value: validFrom, onChange: (e) => { setValidFrom(e.target.value); setValidOpt('직접입력') } }} to={{ className: "ec-input", value: validTo, onChange: (e) => { setValidTo(e.target.value); setValidOpt('직접입력') } }} />
          </>)}
        </EcCond>
        <EcCond label="내.외자구분">
          {(['전체', '내자', '외자'] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="pq-domestic" checked={domestic === v} onChange={() => setDomestic(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목코드" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={project} onChange={setProject} items={pickers.projects} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체" value={employee} onChange={setEmployee} items={pickers.employees} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={170} emptyLabel="전체" value={partnerMgr} onChange={setPartnerMgr}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </EcCond>
      </ul>

      <div className="flex gap-[2px] mb-[8px]">
        {(['전체', '진행중', '완료'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: tab === t ? 'var(--ec-blue)' : '#fff', color: tab === t ? '#fff' : 'var(--ec-text)', fontWeight: tab === t ? 700 : 400,
          }}>{t}</button>
        ))}
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"><input type="checkbox" checked={shown.length > 0 && shown.every((o) => checked.has(o.id))}
              onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((o) => o.id)) : new Set())} /></th>
            <th className="text-center">번호</th>
            <th>품목명</th>
            <th className="text-right">금액(합계)</th>
            <th className="text-center">유효기간</th>
            <th className="text-center">진행상태</th>
            <th className="text-center">생성한 전표</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((o, i) => (
            <tr key={o.id}>
              <td className="text-center"><input type="checkbox" aria-label={`${i + 1}`} checked={checked.has(o.id)}
                onChange={(e) => setChecked((c) => { const n = new Set(c); if (e.target.checked) n.add(o.id); else n.delete(o.id); return n })} /></td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => setForm({ key: Date.now(), order: o })}>{dateNo(o.orderDate, o.orderNo)}</a></td>
              <td>{o.lines[0]?.itemName ?? ''}{o.lines[0]?.spec ? ` [${o.lines[0].spec}]` : ''}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</td>
              <td className="text-right">{fmtAmount(Number(o.totalAmount))}</td>
              <td className="text-center">{o.priceValidUntil ? dateText(o.priceValidUntil) : ''}</td>
              <td className="text-center">진행중</td>
              <td className="text-center">{madeFrom(o).length > 0 && <a className="cursor-pointer" onClick={() => setMadeOf(o)}>조회</a>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {form && (
        <PurchaseRequestForm key={form.key} editing={form.order} priceRequest
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); void load() }}
          onDeleted={() => { setForm(null); void load() }} />
      )}
      {madeOf && (
        <Modal open title="발주서번호확인" width={420} error={error} onClose={() => setMadeOf(null)}>
          <table className="w-full text-left">
            <thead><tr><th>No.</th><th>발주번호</th></tr></thead>
            <tbody>{madeFrom(madeOf).map((x) => (
              <tr key={x.id}><td>{dateNo(madeOf.orderDate, madeOf.orderNo)}</td><td>{shortDateNo(x.orderDate, x.orderNo)}</td></tr>
            ))}</tbody>
          </table>
        </Modal>
      )}
    </EcListShell>
  )
}
