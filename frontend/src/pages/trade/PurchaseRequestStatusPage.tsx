import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_PICKS, PRICE_REQUEST_PICKS, periodOf, comparePeriodOf, type ComparePeriod } from '../../components/EcPeriodPicks'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../api/types'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'

/**
 * 구매관리 > 발주 파이프라인 현황 — 한 컴포넌트를 진입 상태만 바꿔 재사용한다.
 *   발주요청현황 (E040318, 기본 REQUESTED)
 *   발주계획현황 (E041015, 기본 PLANNED)
 *   단가요청현황 (E040325, 기본 PRICED — 백엔드 /prices 가 "단가요청 결과 반영"으로 PRICED 를 매긴다)
 * 상단에 상태별 집계 카드(클릭해 상태 전환), 하단에 선택 상태의 발주서를 라인 단위로 펼친다.
 *
 * 백엔드: 이 화면을 위해 서버사이드 조회를 추가했다 —
 *   GET /api/purchase-orders/summary          → 상태별 집계(건수·금액)
 *   GET /api/purchase-orders?status=REQUESTED  → 특정 상태만 조회
 * (집계·필터를 프론트에서 매번 계산하지 않고 서버가 소유한다. 새 테이블/컬럼이 없어 마이그레이션은 없다.)
 *
 * 조건 판은 현황 화면 공용(`EcStatusPanel`)이다. 원본(E040318)은 [메뉴 현황|집계] · [비교기간] ·
 * 기준일자 · 발주요청No. · 내.외자구분 · 납기일자 · 창고 · 프로젝트 · 관리항목 · 거래처 · 품목을
 * 펼쳐 놓는다. 우리 화면은 조건이 검색어 한 칸뿐이었다.
 * 프로젝트·관리항목·내외자구분은 PurchaseOrder 에 없어 **의도적 제외**(값 없는 컨트롤을 만들지 않는다).
 */

/** 파이프라인 표시 순서 */
const PIPELINE: PurchaseOrderStatus[] = ['REQUESTED', 'PLANNED', 'PRICED', 'ORDERED', 'RECEIVED', 'CANCELLED']
const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  REQUESTED: '발주요청', PLANNED: '발주계획', PRICED: '단가확정',
  ORDERED: '발주확정', RECEIVED: '입고전환', CANCELLED: '취소',
}
const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  REQUESTED: '#c07a00', PLANNED: '#8a929c', PRICED: '#7a5bb5',
  ORDERED: 'var(--ec-blue)', RECEIVED: '#1c7c3c', CANCELLED: '#9aa1ab',
}

interface SummaryRow {
  status: PurchaseOrderStatus
  statusName: string
  count: number
  supplyAmount: number
  vatAmount: number
  totalAmount: number
}

interface Row {
  key: string
  date: string
  dueDate: string | null
  orderNo: string
  partner: string
  warehouse: string
  employee: string
  itemName: string
  qty: number
  unitPrice: number
  supply: number
  vat: number
}

/*
 * 원본은 세 화면 다 <b>금월(~오늘)</b>을 보고 열린다(사본 실측 — 달 스핀박스가 07 하나).
 * 우리는 기간을 <b>비워</b> 두어서, 열면 몇 해치 발주가 통째로 쏟아졌다.
 */
const init = periodOf('금월(~오늘)')!

export default function PurchaseRequestStatusPage({
  defaultStatus = 'REQUESTED', title = '발주요청현황',
}: {
  defaultStatus?: PurchaseOrderStatus
  title?: string
}) {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['partners', 'warehouses', 'items'])
  const [summary, setSummary] = useState<SummaryRow[]>([])
  const [status, setStatus] = useState<PurchaseOrderStatus>(defaultStatus)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 [구분]의 이름은 <b>[내역]</b> 이다(사본 실측 — 발주요청현황·발주계획현황).
   * 우리는 [현황] 이라 적어 두었는데, 같은 자리에 다른 낱말이 서 있으면
   * 원본을 보던 사람이 <b>다른 기능인 줄</b> 안다.
   */
  const [mode, setMode] = useState<'내역' | '집계'>('내역')
  /*
   * <b>단가요청현황만 [구분]이 다르다</b> — 원본은 [요청단가]·[수취단가]·[확정단가]
   * 셋으로 <b>어느 단가를 볼지</b>를 고른다(사본 실측). 우리 발주 전표는 <b>확정단가</b>
   * 하나만 든다 — 매입처가 회신한 금액을 따로 적는 칸이 없다(단가요청진행단계의
   * [수취금액]을 못 만드는 것과 같은 까닭이다). 고를 것이 하나뿐이라 그 셋은 안 그린다.
   */
  const [compare, setCompare] = useState<ComparePeriod>('사용안함')
  const [cond, setCond] = useState({
    from: init.from, to: init.to, dueFrom: '', dueTo: '',
    orderNo: '', partner: '', item: '', warehouse: '',
  })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  async function loadSummary() {
    try {
      const res = await api.get<SummaryRow[]>('/purchase-orders/summary')
      setSummary(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function loadList(st: PurchaseOrderStatus) {
    setLoading(true)
    try {
      const res = await api.get<PurchaseOrder[]>('/purchase-orders', { params: { status: st } })
      const flat: Row[] = []
      for (const o of res.data) {
        o.lines.forEach((l) => flat.push({
          key: `${o.id}-${l.id}`,
          date: o.orderDate,
          dueDate: o.dueDate,
          orderNo: o.orderNo,
          partner: o.partnerName,
          warehouse: o.warehouseName ?? '',
          employee: o.employeeName ?? '',
          itemName: l.itemName,
          qty: l.quantity,
          unitPrice: l.unitPrice,
          supply: l.supplyAmount,
          vat: l.vatAmount,
        }))
      }
      setRows(flat)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSummary() }, [])
  useEffect(() => { loadList(status) }, [status])

  const reload = () => { loadSummary(); loadList(status) }

  /** 조건 하나가 늘 때마다 두 곳(목록·비교기간)에 같은 규칙을 적으면 어긋난다 — 한 곳에 모은다. */
  const matches = (r: Row, c: typeof cond, kw: string) =>
    (!kw || r.partner.includes(kw) || r.itemName.includes(kw) || r.orderNo.includes(kw))
    && (!c.orderNo || r.orderNo.includes(c.orderNo))
    && (!c.partner || r.partner.includes(c.partner))
    && (!c.item || r.itemName.includes(c.item))
    && (!c.warehouse || r.warehouse.includes(c.warehouse))
    && (!c.dueFrom || (r.dueDate ?? '') >= c.dueFrom)
    && (!c.dueTo || (r.dueDate ?? '') <= c.dueTo)

  const shown = useMemo(() => {
    const kw = keyword.trim()
    return rows
      .filter((r) => !cond.from || r.date >= cond.from)
      .filter((r) => !cond.to || r.date <= cond.to)
      .filter((r) => matches(r, cond, kw))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, keyword, cond])

  /** 비교기간 — 기준일자만 앞 구간으로 옮기고 나머지 조건은 그대로 태운다. */
  const prevRange = comparePeriodOf(cond.from, cond.to, compare)
  const prevTotals = useMemo(() => {
    if (!prevRange) return null
    const kw = keyword.trim()
    return rows
      .filter((r) => r.date >= prevRange.from && r.date <= prevRange.to)
      .filter((r) => matches(r, cond, kw))
      .reduce((s2, r) => ({ supply: s2.supply + r.supply, qty: s2.qty + r.qty, count: s2.count + 1 }),
        { supply: 0, qty: 0, count: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, prevRange, cond, keyword])

  /** 집계 — 매입처별로 묶는다. 원본 [집계]도 같은 자료를 묶어서 본다. */
  const grouped = useMemo(() => {
    if (mode !== '집계') return []
    const map = new Map<string, { partner: string; count: number; qty: number; supply: number; vat: number }>()
    shown.forEach((r) => {
      const g = map.get(r.partner) ?? { partner: r.partner, count: 0, qty: 0, supply: 0, vat: 0 }
      g.count += 1; g.qty += r.qty; g.supply += r.supply; g.vat += r.vat
      map.set(r.partner, g)
    })
    return [...map.values()].sort((a, b) => b.supply - a.supply)
  }, [mode, shown])

  const reset = () => {
    setCond({ from: init.from, to: init.to, dueFrom: '', dueTo: '', orderNo: '', partner: '', item: '', warehouse: '' })
    setMode('내역'); setCompare('사용안함'); setKeyword('')
  }

  const totals = useMemo(() => shown.reduce(
    (s, r) => ({ qty: s.qty + r.qty, supply: s.supply + r.supply, vat: s.vat + r.vat }),
    { qty: 0, supply: 0, vat: 0 },
  ), [shown])


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    발주일자: (r) => r.date,
  })

  return (
    <EcListShell
      title={title}
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={reload}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: reload },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/* 발주 파이프라인 집계 카드 — 클릭하면 해당 상태로 전환 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {PIPELINE.map((st) => {
          const s = summary.find((x) => x.status === st)
          const active = st === status
          return (
            <button
              key={st}
              onClick={() => setStatus(st)}
              style={{
                flex: '1 1 0', minWidth: 130, textAlign: 'left', cursor: 'pointer',
                border: active ? `1.5px solid ${STATUS_COLOR[st]}` : '1px solid #d9dee5',
                background: active ? '#fff' : '#fbfcfe',
                borderRadius: 5, padding: '8px 12px',
                boxShadow: active ? `0 1px 4px ${STATUS_COLOR[st]}22` : 'none',
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700, color: STATUS_COLOR[st], marginBottom: 3 }}>
                {STATUS_LABEL[st]}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#3c4553', lineHeight: 1 }}>
                {(s?.count ?? 0).toLocaleString()}<span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}> 건</span>
              </div>
              <div style={{ fontSize: 11, color: '#8a929c', marginTop: 3 }}>
                {(s?.supplyAmount ?? 0).toLocaleString()}
              </div>
            </button>
          )
        })}
      </div>

      {/*
        기간 단추가 <b>화면마다 다르다</b>(사본 실측) — 단가요청현황만 [금년]·[전년]이
        더 붙는다. 한 파일이 셋(발주요청·발주계획·단가요청 현황)을 겸한다.
      */}
      <EcStatusPanel
        modes={['내역', '집계']} mode={mode} onModeChange={(m) => setMode(m as '내역' | '집계')}
        compare={compare} onCompareChange={setCompare}
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={title === '단가요청현황' ? PRICE_REQUEST_PICKS : INQUIRY_PICKS}
      >
        <EcCond label="발주No." pick>
          <input className="ec-input" placeholder="발주번호 일부" value={cond.orderNo}
                 onChange={(e) => setC({ orderNo: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="납기일자">
          <input type="date" className="ec-input" value={cond.dueFrom}
                 onChange={(e) => setC({ dueFrom: e.target.value })} style={{ width: 140 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={cond.dueTo}
                 onChange={(e) => setC({ dueTo: e.target.value })} style={{ width: 140 }} />
        </EcCond>
        {/* 원본 차례: 납기일자 · <b>창고 · 거래처</b> · 품목 (사본 실측) — 우리는 뒤바뀌어 있었다. */}
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={cond.warehouse} onChange={(v) => setC({ warehouse: v })}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={cond.partner} onChange={(v) => setC({ partner: v })}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        {/*
          원본 조건 판의 <b>[진행상태]</b>(사본 실측). 우리는 위 <b>단계 카드</b>를 눌러
          고르게만 해 두어서, 조건 판만 보는 사람은 <b>지금 어느 단계를 보고 있는지</b>도
          모르고 다른 단계로 옮길 수도 없었다. 카드와 <b>같은 값</b>을 쓴다.
        */}
        <EcCond label="진행상태">
          <select className="ec-input" value={status} style={{ width: 140 }}
                  onChange={(e) => setStatus(e.target.value as PurchaseOrderStatus)}>
            {PIPELINE.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
          </select>
        </EcCond>
      </EcStatusPanel>

      {prevTotals && (
        <div style={{ marginBottom: 8, fontSize: 12.5, textAlign: 'right', color: '#5a626e' }}>
          <span style={{ color: 'var(--ec-label)' }}>
            비교기간({prevRange!.from.replace(/-/g, '/')} ~ {prevRange!.to.replace(/-/g, '/')})
          </span>
          <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
          건수 {prevTotals.count.toLocaleString()} → {shown.length.toLocaleString()}
          <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
          공급가액 {prevTotals.supply.toLocaleString()} → {totals.supply.toLocaleString()}
          {prevTotals.supply > 0 && (
            <span style={{ marginLeft: 4, color: totals.supply >= prevTotals.supply ? '#1c7c3c' : '#c60a2e' }}>
              ({totals.supply >= prevTotals.supply ? '+' : ''}
              {Math.round(((totals.supply - prevTotals.supply) / prevTotals.supply) * 100)}%)
            </span>
          )}
        </div>
      )}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        <span style={{ color: STATUS_COLOR[status], fontWeight: 700 }}>{STATUS_LABEL[status]}</span>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        건수 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        수량 <b style={{ color: '#3c4553', fontSize: 14 }}>{totals.qty.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        공급가액 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.supply.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        부가세 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.vat.toLocaleString()}</b>
      </div>
      {mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>매입처</th>
              <th style={{ textAlign: 'right' }}>건수</th>
              <th style={{ textAlign: 'right' }}>수량</th>
              <th style={{ textAlign: 'right' }}>공급가액</th>
              <th style={{ textAlign: 'right' }}>부가세</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
            ) : grouped.map((g, i) => (
              <tr key={g.partner}>
                <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                <td>{g.partner}</td>
                <td style={{ textAlign: 'right' }}>{g.count.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.qty.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.supply.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.vat.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('발주일자')}>발주일자 {sort.mark('발주일자')}</th>
            <th>납기</th>
            <th>발주번호</th>
            <th>매입처</th>
            <th>창고</th>
            <th>담당자</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>수량</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>부가세</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? `${STATUS_LABEL[status]} 상태의 발주서가 없습니다.` : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : sort.sorted.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{dateText(r.date)}</td>
              <td style={{ fontFamily: 'monospace', color: r.dueDate ? '#5a626e' : '#c5cbd3' }}>{dateText(r.dueDate) || ''}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.orderNo}</td>
              <td>{r.partner}</td>
              <td style={{ color: r.warehouse ? undefined : '#c5cbd3' }}>{r.warehouse || ''}</td>
              <td style={{ color: r.employee ? undefined : '#c5cbd3' }}>{r.employee || ''}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.unitPrice.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1c6b32' }}>{r.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.vat.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </EcListShell>
  )
}
