import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_PICKS, comparePeriodOf, periodOf, type ComparePeriod } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 영업관리 > 출하현황 — 출하 전표를 기간·조건으로 본다 (/api/shipments).
 *
 * <p>원본 조건 판 실측(사본):
 *   [구분] 내역 | 집계 | 라인별 · [비교기간] · 기준일자(직접입력) + 기간 빠른선택(…전월, 종료일)
 *   출하No. · 창고 · 프로젝트 · 관리항목 · 거래처 · 품목 · 시리얼/로트No.
 * 우리는 조건 판이 없고 상태 필터 버튼줄과 검색어 한 칸이 전부였다.
 *
 * <p>[창고]는 예전에 "출하 전표에 그 값이 없어" 만들지 않았는데, 출하는 진작
 * 창고 칸을 들고 있었다 — 응답에 안 실어서 화면이 몰랐을 뿐이다. 지금은 실린다.
 * 다만 <b>예전에 만든 출하는 창고가 비어 있다</b>(출하지시서에서 고를 수 있게 되기 전 자료라
 * 그렇다). 그 줄들은 이 조건에 안 걸린다 — 지어내서 채우지 않는다.
 * <p>[프로젝트]도 이제 있다. 판매·구매·비용은 진작 프로젝트를 다는데 출하만 안 달아서,
 * 프로젝트별로 얼마를 내보냈는지 셀 수가 없었다.
 * 관리항목·시리얼/로트는 여전히 없어 칸을 만들지 않는다.
 * 상태 필터는 원본에 없지만 우리 출하는 지시/완료/취소를 한 화면에서 보므로 남겨 둔다.
 *
 * <p>내역 행의 칸 구성은 원본 출하조회 격자를 따른다: 일자-No. · 품목명(요약) · 수량합계 · 거래처명.
 */
type ShipStatus = 'READY' | 'SHIPPED' | 'CANCELED'
type Mode = '내역' | '집계' | '라인별'
const MODES = ['내역', '집계', '라인별'] as const

const STATUS_COLOR: Record<ShipStatus, string> = {
  READY: '#c07a00',
  SHIPPED: '#1c7c3c',
  CANCELED: '#9aa1ab',
}

interface ShipLine {
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  quantity: number
  unitPrice: number
  amount: number
  /** 줄 적요. 원본 출하현황의 마지막 열. */
  remark: string | null
}

interface Shipment {
  id: number
  shipNo: string
  partnerId: number
  partnerName: string
  shipDate: string
  status: ShipStatus
  statusName: string
  totalQuantity: number
  totalAmount: number
  salesOrderNo: string | null
  /** 창고명. 원본 출하현황의 [창고명] 열 — 어느 창고에서 나갔는지가 안 보였다. */
  warehouseName: string | null
  /** 귀속 프로젝트. 원본 출하현황 조건의 [프로젝트]. */
  projectName: string | null
  remark: string | null
  createdBy: string | null
  lines: ShipLine[]
}

const won = (n: number) => n.toLocaleString('ko-KR')

export default function ShipmentPage() {
  const [rows, setRows] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [compare, setCompare] = useState<ComparePeriod>('사용안함')
  const [mode, setMode] = useState<Mode>('내역')
  const [shipNo, setShipNo] = useState('')
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [project, setProject] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | ShipStatus>('ALL')

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await api.get<Shipment[]>('/shipments')
      setRows(res.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const reset = () => {
    setFrom(init.from); setTo(init.to); setCompare('사용안함'); setMode('내역')
    setShipNo(''); setPartner(''); setItem(''); setStatusFilter('ALL'); setWarehouse(''); setProject('')
  }

  const inRange = (r: Shipment, a: string, b: string) => r.shipDate >= a && r.shipDate <= b
  const matches = (r: Shipment) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
    if (shipNo && !r.shipNo.includes(shipNo)) return false
    if (partner && !r.partnerName.includes(partner)) return false
    if (item && !r.lines.some((l) => `${l.itemCode} ${l.itemName}`.includes(item))) return false
    if (warehouse && !(r.warehouseName ?? '').includes(warehouse)) return false
    if (project && !(r.projectName ?? '').includes(project)) return false
    return true
  }

  const shown = useMemo(
    () => rows.filter((r) => inRange(r, from, to) && matches(r)),
    [rows, from, to, statusFilter, shipNo, partner, item, warehouse, project],
  )

  /** 비교기간 — 같은 조건을 같은 길이의 앞 구간에 걸어 합계만 견준다. */
  const prevRange = compare === '사용안함' ? null : comparePeriodOf(from, to, compare)
  const prevTotals = useMemo(() => {
    if (!prevRange) return null
    const prev = rows.filter((r) => inRange(r, prevRange.from, prevRange.to) && matches(r))
    return {
      count: prev.length,
      qty: prev.reduce((n, r) => n + r.totalQuantity, 0),
      amount: prev.reduce((n, r) => n + r.totalAmount, 0),
    }
  }, [rows, prevRange, statusFilter, shipNo, partner, item, warehouse, project])

  const totals = useMemo(
    () => shown.reduce((a, r) => ({ qty: a.qty + r.totalQuantity, amount: a.amount + r.totalAmount }),
      { qty: 0, amount: 0 }),
    [shown],
  )

  /** 집계 — 거래처 단위로 모은다. */
  const byPartner = useMemo(() => {
    const m = new Map<number, { partnerId: number; name: string; count: number; qty: number; amount: number }>()
    for (const r of shown) {
      const cur = m.get(r.partnerId)
      if (!cur) m.set(r.partnerId, { partnerId: r.partnerId, name: r.partnerName, count: 1, qty: r.totalQuantity, amount: r.totalAmount })
      else { cur.count += 1; cur.qty += r.totalQuantity; cur.amount += r.totalAmount }
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount)
  }, [shown])

  /** 라인별 — 품목 라인마다 한 줄. */
  const lines = useMemo(
    () => shown.flatMap((r) => r.lines.map((l) => ({ key: `${r.id}-${l.itemId}`, r, l }))),
    [shown],
  )

  return (
    <EcListShell
      title="출하현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_PICKS}
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        compare={compare} onCompareChange={setCompare}
      >
        <EcCond label="출하No." pick>
          <input className="ec-input" placeholder="출하번호 일부" value={shipNo}
                 onChange={(e) => setShipNo(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <input className="ec-input" placeholder="창고명 일부" value={warehouse}
                 onChange={(e) => setWarehouse(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <input className="ec-input" placeholder="프로젝트명 일부" value={project}
                 onChange={(e) => setProject(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="거래처" pick>
          <input className="ec-input" placeholder="거래처명 일부" value={partner}
                 onChange={(e) => setPartner(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="품목" pick>
          <input className="ec-input" placeholder="품목코드·품명 일부" value={item}
                 onChange={(e) => setItem(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="진행상태">
          <div className="ec-pills">
            {(['ALL', 'READY', 'SHIPPED', 'CANCELED'] as const).map((s) => (
              <button key={s} type="button" className={`ec-pill no-ec${statusFilter === s ? ' active' : ''}`}
                      onClick={() => setStatusFilter(s)}>
                {s === 'ALL' ? '전체' : s === 'READY' ? '출하지시' : s === 'SHIPPED' ? '출하완료' : '취소'}
              </button>
            ))}
          </div>
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        출하 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        출하수량 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{won(totals.qty)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        출하금액 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totals.amount)}</b>
        {prevTotals && prevRange && (
          <span style={{ marginLeft: 10, color: '#8a929c' }}>
            비교기간({prevRange.from.replace(/-/g, '/')} ~ {prevRange.to.replace(/-/g, '/')})
            {' '}{prevTotals.count}건 · 수량 {won(prevTotals.qty)} · 금액 {won(prevTotals.amount)}
          </span>
        )}
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>거래처명</th>
              <th style={{ width: 100, textAlign: 'right' }}>건수</th>
              <th style={{ width: 130, textAlign: 'right' }}>수량합계</th>
              <th style={{ width: 140, textAlign: 'right' }}>금액합계</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byPartner.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : byPartner.map((g, i) => (
              <tr key={g.partnerId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>{g.name}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(g.count)}</td>
                <td style={{ textAlign: 'right' }}>{won(g.qty)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(g.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={2} style={{ textAlign: 'right' }}>합계 ({byPartner.length}거래처)</td>
              <td style={{ textAlign: 'right' }}>{won(shown.length)}</td>
              <td style={{ textAlign: 'right' }}>{won(totals.qty)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.amount)}</td>
            </tr>
          </tfoot>
        </table>
      ) : mode === '라인별' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 190 }}>일자-No.</th>
              <th>품목명</th>
              <th style={{ width: 100, textAlign: 'right' }}>수량</th>
              <th style={{ width: 110, textAlign: 'right' }}>단가</th>
              <th style={{ width: 130, textAlign: 'right' }}>금액</th>
              <th style={{ width: 120 }}>창고명</th>
              <th>거래처명</th>
              <th style={{ width: 150 }}>적요</th>
              <th style={{ width: 90, textAlign: 'center' }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : lines.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : lines.map((x, i) => (
              <tr key={x.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{x.r.shipDate} {x.r.shipNo}</td>
                <td>[{x.l.itemCode}] {x.l.itemName}</td>
                <td style={{ textAlign: 'right' }}>{won(x.l.quantity)} {x.l.unit}</td>
                <td style={{ textAlign: 'right' }}>{won(x.l.unitPrice)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(x.l.amount)}</td>
                <td style={{ color: x.r.warehouseName ? undefined : '#c9ced6' }}>{x.r.warehouseName ?? '-'}</td>
                <td>{x.r.partnerName}</td>
                {/* 줄 적요가 없으면 전표 적요를 보여 준다 — 원본도 한 칸이다. */}
                <td style={{ color: '#8a929c' }}>{x.l.remark || x.r.remark || ''}</td>
                <td style={{ textAlign: 'center', color: STATUS_COLOR[x.r.status], fontWeight: 700 }}>{x.r.statusName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 190 }}>일자-No.</th>
              <th>품목명(요약)</th>
              <th style={{ width: 120, textAlign: 'right' }}>수량합계</th>
              <th style={{ width: 140, textAlign: 'right' }}>금액합계</th>
              <th>거래처명</th>
              <th style={{ width: 90, textAlign: 'center' }}>상태</th>
              <th style={{ width: 110 }}>담당자</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.shipDate} {r.shipNo}</td>
                <td>{r.lines[0]?.itemName}{r.lines.length > 1 ? ` 외 ${r.lines.length - 1}건` : ''}</td>
                <td style={{ textAlign: 'right' }}>{won(r.totalQuantity)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.totalAmount)}</td>
                <td>{r.partnerName}</td>
                <td style={{ textAlign: 'center', color: STATUS_COLOR[r.status], fontWeight: 700 }}>{r.statusName}</td>
                <td>{r.createdBy ?? ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right' }}>{won(totals.qty)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.amount)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      )}
    </EcListShell>
  )
}
