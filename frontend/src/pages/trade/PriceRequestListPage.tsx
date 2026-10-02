import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { usePartnerManagers } from '../../utils/partnerManagers'
import { dateText } from '../../utils/dateText'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../types/api'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
/** 단가를 회신받은 발주서 — 단가확정 뒤로만 발주확정 · 입고전환이 있다(PurchaseOrderService). */
const PRICED_ON: PurchaseOrderStatus[] = ['PRICED', 'ORDERED', 'RECEIVED']
const done = (s: PurchaseOrderStatus) => s === 'ORDERED' || s === 'RECEIVED'
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
 * <p>우리 단가요청은 발주서의 [단가확정] 단계다 — 매입처가 회신한 단가를 반영하면 PRICED 가 된다. 그래서 단가확정 이상인 발주서가 단가요청이고,
 * 아직 발주로 안 넘어갔으면 '진행중', 발주확정 · 입고전환이면 '완료'. 유효기간은 회신 단가의 유효기간(priceValidUntil)이다.
 * Email 발송 · 생성한 전표 · 인쇄 열과 [발송여부]는 단가요청을 메일로 보내지 않아 없다. 확인 단계가 없어 미확인 · 확인 탭도 없다.
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
    .filter((o) => PRICED_ON.includes(o.status))
    .filter((o) => o.orderDate >= from && o.orderDate <= to)
    .filter((o) => validOpt === '사용안함' || (!!o.priceValidUntil && (!validFrom || o.priceValidUntil >= validFrom) && (!validTo || o.priceValidUntil <= validTo)))
    .filter((o) => domestic === '전체' || ((o.currency ?? 'KRW') === 'KRW') === (domestic === '내자'))
    .filter((o) => !partner || String(o.partnerId) === partner)
    .filter((o) => !item || o.lines.some((l) => String(l.itemId) === item))
    .filter((o) => !project || String(o.projectId) === project)
    .filter((o) => !employee || (o.employeeName ?? '') === employee)
    .filter((o) => !partnerMgr || pmgr.managerOfName(o.partnerName) === partnerMgr)
    .filter((o) => tab === '전체' || (tab === '완료') === done(o.status))
    .sort((a, b) => (a.orderDate > b.orderDate ? -1 : a.orderDate < b.orderDate ? 1 : b.orderNo.localeCompare(a.orderNo))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [orders, from, to, validOpt, validFrom, validTo, domestic, partner, item, project, employee, partnerMgr, tab])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '단가요청조회', [shown.length])

  return (
    <EcListShell
      title="단가요청조회"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setValidOpt('사용안함'); setValidFrom(''); setValidTo(''); setDomestic('전체'); setPartner(''); setItem(''); setProject(''); setEmployee(''); setPartnerMgr('') } },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
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
            <input type="date" className="ec-input" value={validFrom} onChange={(e) => { setValidFrom(e.target.value); setValidOpt('직접입력') }} style={{ width: 145, marginLeft: 6 }} />
            <span style={{ margin: '0 4px' }}>~</span>
            <input type="date" className="ec-input" value={validTo} onChange={(e) => { setValidTo(e.target.value); setValidOpt('직접입력') }} style={{ width: 145 }} />
          </>)}
        </EcCond>
        <EcCond label="내.외자구분">
          {(['전체', '내자', '외자'] as const).map((v) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
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

      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {(['전체', '진행중', '완료'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: tab === t ? 'var(--ec-blue)' : '#fff', color: tab === t ? '#fff' : '#3a4453', fontWeight: tab === t ? 700 : 400,
          }}>{t}</button>
        ))}
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ textAlign: 'center' }}>번호</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>금액(합계)</th>
            <th style={{ textAlign: 'center' }}>유효기간</th>
            <th style={{ textAlign: 'center' }}>진행상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((o, i) => (
            <tr key={o.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{dateText(o.orderDate)} {o.orderNo}</td>
              <td>{o.lines[0]?.itemName ?? ''}{o.lines[0]?.spec ? ` [${o.lines[0].spec}]` : ''}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</td>
              <td style={{ textAlign: 'right' }}>{won(Number(o.totalAmount))}</td>
              <td style={{ textAlign: 'center' }}>{o.priceValidUntil ? dateText(o.priceValidUntil) : ''}</td>
              <td style={{ textAlign: 'center' }}>{done(o.status) ? '완료' : '진행중'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
