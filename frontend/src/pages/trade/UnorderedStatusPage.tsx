import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import type { Quotation, QuotationStatus } from '../../api/types'
import { INQUIRY_FULL_PICKS, ymd } from '../../components/EcPeriodPicks'
import { periodOf } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'

/**
 * 영업관리 > 미주문현황 (이카운트 E040211)
 * "아직 수주(주문)로 전환되지 않은 견적" — 영업 후속조치 대상 목록.
 * 데이터는 GET /api/quotations 를 그대로 쓰고, 미전환(작성/발송) 견적만 라인 단위로 펼친다.
 *
 * ── 데이터 모델 주의 ──
 * 이카운트 원본은 견적 라인별 '부분 미주문수량'(견적수량 − 이미 주문된 수량)을 보여준다.
 * 우리 모델은 견적서를 **통짜로** 수주 전환한다(Quotation.convertedOrderId 하나). 라인별 부분 전환이 없으므로
 * 미전환 견적의 견적수량 전체가 곧 미주문수량이다. 이 한계 안에서 '전환 안 된 견적'을 충실히 보여준다.
 *
 * 원본 Search 패널의 창고·프로젝트·담당자·거래처관리담당자·관리항목은 Quotation 에 필드가 없어 **의도적 제외**
 * (구매현황·주문서현황 선례와 동일). 실제 데이터가 있는 기준일자·거래처·견적No.·품목만 조건으로 둔다.
 *
 * 조건 판은 현황 화면 공용(`EcStatusPanel`)이다. 원본도 접히지 않고 펼쳐져 있다.
 * 원본 기준일자는 '기준일자(영업주기)' 라는 **한 날짜**지만, 우리는 견적일자 <b>구간</b>으로 거른다 —
 * 우리 조건이 실제로 하는 일이 그것이라 한 칸짜리 흉내를 내지 않는다.
 * 이 화면의 기간 빠른선택은 '종료일'과 '전월+금월'이 둘 다 붙는다(원본 확인).
 */

/** 미주문 = 아직 수주 전환/취소되지 않은 상태 */
const OPEN_STATUS: QuotationStatus[] = ['DRAFT', 'SENT']
const statusColor = (s: QuotationStatus) => (s === 'SENT' ? 'var(--ec-blue)' : '#5a626e')

interface Row {
  key: string
  date: string
  validUntil: string | null
  quoteNo: string
  partner: string
  status: QuotationStatus
  statusName: string
  itemName: string
  qty: number
  unitPrice: number
  supply: number
  vat: number
  expired: boolean
}

interface Filters {
  dateFrom: string
  dateTo: string
  partner: string
  quoteNo: string
  item: string
  expiredOnly: boolean
  sortByDoc: boolean
}

/*
 * 원본 미주문현황은 <b>금월</b>을 보고 열린다(사본 실측 — 달 스핀박스가 07 하나).
 * 우리는 기간을 비워 두어 견적이 쌓일수록 열자마자 몇 해치가 쏟아졌다.
 */
const init = periodOf('금월(~오늘)')!

const EMPTY_FILTERS: Filters = {
  dateFrom: init.from, dateTo: init.to, partner: '', quoteNo: '', item: '', expiredOnly: false, sortByDoc: false,
}

const todayStr = () => ymd(new Date())

export default function UnorderedStatusPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['partners', 'items'])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const setF = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Quotation[]>('/quotations')
      const today = todayStr()
      const flat: Row[] = []
      for (const q of res.data) {
        if (!OPEN_STATUS.includes(q.status)) continue   // 수주전환·취소 견적은 미주문 아님
        q.lines.forEach((l) => flat.push({
          key: `${q.id}-${l.id}`,
          date: q.quoteDate,
          validUntil: q.validUntil,
          quoteNo: q.quoteNo,
          partner: q.partnerName,
          status: q.status,
          statusName: q.statusName,
          itemName: l.itemName,
          qty: l.quantity,
          unitPrice: l.unitPrice,
          supply: l.supplyAmount,
          vat: l.vatAmount,
          expired: !!q.validUntil && q.validUntil < today,
        }))
      }
      setRows(flat)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = useMemo(() => {
    const kw = keyword.trim()
    const f = filters
    const out = rows.filter((r) => {
      if (kw && !r.partner.includes(kw) && !r.itemName.includes(kw) && !r.quoteNo.includes(kw)) return false
      if (f.dateFrom && r.date < f.dateFrom) return false
      if (f.dateTo && r.date > f.dateTo) return false
      if (f.partner && !r.partner.includes(f.partner)) return false
      if (f.quoteNo && !r.quoteNo.includes(f.quoteNo)) return false
      if (f.item && !r.itemName.includes(f.item)) return false
      if (f.expiredOnly && !r.expired) return false
      return true
    })
    out.sort((a, b) => f.sortByDoc
      ? (a.quoteNo < b.quoteNo ? 1 : a.quoteNo > b.quoteNo ? -1 : 0)
      : (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return out
  }, [rows, keyword, filters])

  const totals = useMemo(() => shown.reduce(
    (s, r) => ({ qty: s.qty + r.qty, supply: s.supply + r.supply, vat: s.vat + r.vat }),
    { qty: 0, supply: 0, vat: 0 },
  ), [shown])

  const reset = () => { setFilters(EMPTY_FILTERS); setKeyword('') }


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    견적일자: (r) => r.date,
  })

  return (
    <EcListShell
      title="미주문현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <EcStatusPanel
        from={filters.dateFrom} to={filters.dateTo}
        onPeriod={(r) => setF({ dateFrom: r.from, dateTo: r.to })}
        picks={INQUIRY_FULL_PICKS}
      >
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={filters.partner} onChange={(v) => setF({ partner: v })}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="견적No." pick>
          <input className="ec-input" placeholder="견적번호 일부" value={filters.quoteNo}
                 onChange={(e) => setF({ quoteNo: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={filters.item} onChange={(v) => setF({ item: v })}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="기타">
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={filters.expiredOnly}
                   onChange={(e) => setF({ expiredOnly: e.target.checked })} /> 유효기간 지난 것만
          </label>
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={filters.sortByDoc}
                   onChange={(e) => setF({ sortByDoc: e.target.checked })} /> 견적번호순 (기본: 일자순)
          </label>
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        건수 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        미주문수량 <b style={{ color: '#c07a00', fontSize: 14 }}>{totals.qty.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        공급가액 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.supply.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        부가세 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.vat.toLocaleString()}</b>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('견적일자')}>견적일자 {sort.mark('견적일자')}</th>
            <th>유효기간</th>
            <th>견적번호</th>
            <th>매출처</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>미주문수량</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>부가세</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '미주문(미전환) 견적이 없습니다.' : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : sort.sorted.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{dateText(r.date)}</td>
              <td style={{ fontFamily: 'monospace', color: r.expired ? '#c60a2e' : r.validUntil ? '#5a626e' : '#c5cbd3' }}>
                {r.validUntil ?? '-'}{r.expired ? ' (경과)' : ''}
              </td>
              <td style={{ fontFamily: 'monospace' }}>{r.quoteNo}</td>
              <td>{r.partner}</td>
              <td style={{ textAlign: 'center' }}>
                <span style={{ color: statusColor(r.status), fontWeight: 600, fontSize: 12 }}>{r.statusName}</span>
              </td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#c07a00' }}>{r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.unitPrice.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1c6b32' }}>{r.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.vat.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
