import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SELF_USE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../types/api'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
/** 원본 날짜 모양 — 연도를 두 자리로 찍는다(26/10/12-2 · 25/07/12, 2026-10-03 실측). */
const yy = (d: string | null) => (d ? `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}` : '')
/** 우리 발주서는 모두 [발주요청]으로 시작해 계획 → 단가확정 → 발주확정 → 입고전환으로 넘어간다. 발주로 넘어가면 그 요청은 끝난 것이다. */
const progress = (s: PurchaseOrderStatus) => (s === 'ORDERED' || s === 'RECEIVED' ? '완료' : s === 'CANCELLED' ? '' : '진행중')
type Tab = '전체' | '진행중' | '완료'

/**
 * 재고 I &gt; 구매관리 &gt; 발주요청 &gt; <b>발주요청조회</b>(E040315) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일(+1개월)</b>, 빠른선택에 [말일]) · 발주요청No. · 내.외자구분(전체 | 내자 | 외자) · 창고 · 프로젝트 ·
 * 관리항목 · 거래처코드 · 품목코드 · 발송여부 · 기타(수정일자순). 열: 발주요청일자 · 거래처명 · 품목 · 납기일자 · 수량 · 금액(합계) ·
 * 종결여부 · 진행상태 · 인쇄. 위 탭 전체 · 결재중 · 미확인 · 확인 · 진행중 · 완료.
 *
 * <p>우리 발주서 한 장이 발주요청 한 장이다(만들면 REQUESTED 로 선다). 진행상태는 발주확정 · 입고전환이면 '완료', 아직 요청 · 계획 ·
 * 단가확정이면 '진행중'. 취소한 것은 [종결여부]에 '종결'로 남긴다. 내자 · 외자는 통화(KRW 인지)로 가른다.
 * 수량은 줄 수량의 합, 품목은 첫 품목 '외 n건'. 결재 · 확인 단계가 없어 그 탭은 없다.
 */
export default function PurchaseRequestListPage() {
  const pickers = useCondPickers(['warehouses', 'projects', 'partners', 'items'])
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [reqNo, setReqNo] = useState('')
  const [domestic, setDomestic] = useState<'전체' | '내자' | '외자'>('전체')
  const [warehouse, setWarehouse] = useState('')
  const [project, setProject] = useState('')
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [byUpdated, setByUpdated] = useState(false)
  const [tab, setTab] = useState<Tab>('전체')
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<PurchaseOrder[]>('/purchase-orders', { params: { from, to } })
      setRows(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const filtered = useMemo(() => rows
    .filter((o) => o.orderDate >= from && o.orderDate <= to)
    .filter((o) => !reqNo || o.orderNo.includes(reqNo))
    .filter((o) => domestic === '전체' || ((o.currency ?? 'KRW') === 'KRW') === (domestic === '내자'))
    .filter((o) => !warehouse || String(o.warehouseId) === warehouse)
    .filter((o) => !project || String(o.projectId) === project)
    .filter((o) => !partner || String(o.partnerId) === partner)
    .filter((o) => !item || o.lines.some((l) => String(l.itemId) === item)),
  [rows, from, to, reqNo, domestic, warehouse, project, partner, item])
  const shown = useMemo(() => filtered
    .filter((o) => tab === '전체' || progress(o.status) === tab)
    .sort(byUpdated
      ? (a, b) => ((a.updatedAt ?? '') < (b.updatedAt ?? '') ? 1 : (a.updatedAt ?? '') > (b.updatedAt ?? '') ? -1 : 0)
      : (a, b) => (a.orderDate > b.orderDate ? -1 : a.orderDate < b.orderDate ? 1 : b.orderNo.localeCompare(a.orderNo))),
  [filtered, tab, byUpdated])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '발주요청조회', [shown.length])

  return (
    <EcListShell
      title="발주요청조회"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시작성', onClick: () => { setFrom(init.from); setTo(init.to); setReqNo(''); setDomestic('전체'); setWarehouse(''); setProject(''); setPartner(''); setItem(''); setByUpdated(false) } },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={SELF_USE_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="발주요청No.">
          <input className="ec-input" value={reqNo} onChange={(e) => setReqNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="내.외자구분">
          {(['전체', '내자', '외자'] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="pr-domestic" checked={domestic === v} onChange={() => setDomestic(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={project} onChange={setProject} items={pickers.projects} />
        </EcCond>
        <EcCond label="거래처코드" pick>
          <CodePickerField label="거래처코드" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목코드" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} /> 수정일자순(정렬)
          </label>
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
            <th className="w-[34px]"></th>
            <th className="text-center">발주요청일자</th>
            <th>거래처명</th>
            <th>품목</th>
            <th className="text-center">납기일자</th>
            <th className="text-right">수량</th>
            <th className="text-right">금액(합계)</th>
            <th className="text-center">종결여부</th>
            <th className="text-center">진행상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((o, i) => (
            <tr key={o.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="text-center">{yy(o.orderDate)} {o.orderNo}</td>
              <td>{o.partnerName}</td>
              <td>{o.lines[0]?.itemName ?? ''}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</td>
              <td className="text-center">{yy(o.dueDate)}</td>
              <td className="text-right">{o.lines.reduce((a, l) => a + Number(l.quantity), 0).toLocaleString('ko-KR')}</td>
              <td className="text-right">{won(Number(o.totalAmount))}</td>
              <td className="text-center">{o.status === 'CANCELLED' ? '종결' : ''}</td>
              <td className="text-center">{progress(o.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
