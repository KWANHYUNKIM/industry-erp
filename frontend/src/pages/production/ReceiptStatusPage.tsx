import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { subtotalBy } from '../../utils/subtotalBy'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, PurchaseDoc, Warehouse } from '../../api/types'
import { stockCostMap, sumStockValue } from '../../utils/stockValue'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

/**
 * 생산관리 > 생산입고현황 — 생산입고 전표(/api/productions)를 기간·조건으로 본다.
 *
 * <p>예전에는 이 화면이 <b>작업지시 목록</b>(/api/work-orders)을 그대로 보여 줬다.
 * 지시수량·입고수량·잔여수량을 나열하는, 사실상 작업지시서현황이었다.
 * 원본 화면 사본으로 대조해 보니 생산입고현황은 <b>입고된 전표</b>를 보는 자리다.
 *
 * <p>원본 조건 판 실측:
 *   [구분] 내역 | 집계 | 라인별 · 일자(금월(~오늘)) · 창고 · 프로젝트 · 품목 · 담당자 · 적요
 * 우리는 조건 판이 아예 없었다(검색어 한 칸이 전부).
 *
 * <p>[프로젝트]는 예전에 "생산입고에 그 값이 없어" 만들지 않았는데, 이제 있다.
 * 판매·구매·비용·출하·정산이 모두 프로젝트를 다는데 생산입고만 남아 있었다 —
 * 프로젝트별 손익을 보려면 <b>그 프로젝트로 무엇을 만들었나</b>도 알아야 한다.
 *
 * <p>원본 결과 열 실측(사본): 일자-No. · <b>출고창고명</b> · <b>입고창고명</b> ·
 * 품목명[규격명] · 수량 · <b>생산금액</b> · <b>적요</b>.
 * 우리는 창고가 한 칸이었고 금액과 적요가 없었다 — 몇 개 들어왔는지만 보이고
 * 그게 얼마짜리인지는 이 화면에서 알 수 없었다.
 *
 * <p>생산금액은 생산수량 × 그 품목의 <b>평가단가</b>다. 단가는 재고평가와 같은 규칙을
 * 쓴다(마지막 입고단가 → 품목 구매단가). 판매단가로 매기면 아직 팔지도 않은 이익이
 * 생산금액에 얹힌다. 단가를 모르는 전표는 <b>합계에서 빼고 몇 건인지 밝힌다</b> —
 * 0 으로 세면 그 전표가 공짜로 만들어진 것이 된다.
 */
type Mode = '내역' | '집계' | '라인별'
const MODES = ['내역', '집계', '라인별'] as const

interface Material {
  itemId: number
  itemCode: string
  itemName: string
  quantity: number
}

interface Production {
  id: number
  prodNo: string
  workOrderId: number
  workOrderNo: string
  productId: number
  productCode: string
  productName: string
  /** 원본 열 이름이 [품목명[규격명]] 이다 — 이름만으로는 같은 이름의 다른 규격을 못 가린다. */
  productSpec: string | null
  productUnit: string
  warehouseId: number
  warehouseName: string
  fromWarehouseId: number | null
  fromWarehouseName: string | null
  projectName: string | null
  producedQty: number
  productionDate: string
  createdBy: string | null
  note: string | null
  materials: Material[]
}

const num = (n: number) => n.toLocaleString('ko-KR')

export default function ReceiptStatusPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items', 'projects', 'employees'])
  const [rows, setRows] = useState<Production[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouseId, setWarehouseId] = useState('')
  const [item, setItem] = useState('')
  const [worker, setWorker] = useState('')
  const [project, setProject] = useState('')
  /**
   * 원본 생산입고현황 조건 실측(사본): 구분 · 일자 · 프로젝트 · 품목 · 담당자 · <b>적요</b> ·
   * 채무번호. 적요가 빠져 있었다 — 왜 그렇게 입고했는지 적어 두고도 그 말로는 못 찾았다.
   * (채무번호는 외주 매입과 잇는 값이라 우리에게 없다.)
   */
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<Mode>('내역')
  const [view, setView] = useState<'표' | '그래프'>('표')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [prod, wh, it, pu] = await Promise.all([
        api.get<Production[]>('/productions'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<Item[]>('/items'),
        api.get<PurchaseDoc[]>('/purchases'),
      ])
      setItems(it.data)
      setPurchases(pu.data)
      setRows([...prod.data].sort((a, b) =>
        (a.productionDate < b.productionDate ? 1 : a.productionDate > b.productionDate ? -1 : b.id - a.id)))
      setWarehouses(wh.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const reset = () => {
    setFrom(init.from); setTo(init.to)
    setWarehouseId(''); setItem(''); setWorker(''); setMode('내역'); setProject(''); setNote('')
  }

  const shown = useMemo(() => rows.filter((r) => {
    if (r.productionDate < from || r.productionDate > to) return false
    if (warehouseId && String(r.warehouseId) !== warehouseId) return false
    if (item && !`${r.productCode} ${r.productName}`.includes(item)) return false
    if (worker && !(r.createdBy ?? '').includes(worker)) return false
    if (project && !(r.projectName ?? '').includes(project)) return false
    if (note && !(r.note ?? '').includes(note)) return false
    return true
  }), [rows, from, to, warehouseId, item, worker, project, note])

  /** 집계 — 품목 단위로 입고수량을 모은다. */
  /*
   * 원본 [정렬/소계기준]. 우리는 <b>품목으로만</b> 묶었는데, 같은 입고를
   * 창고별·프로젝트별로 보고 싶은 사람이 따로 있다.
   */
  const SUBTOTALS = ['품목', '입고창고', '출고창고', '프로젝트'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('품목')

  const byItem = useMemo(() => {
    const keyOf = (r: Production) => (
      subtotal === '입고창고' ? r.warehouseName
        : subtotal === '출고창고' ? (r.fromWarehouseName ?? r.warehouseName)
          : subtotal === '프로젝트' ? r.projectName
            : r.productName)
    return subtotalBy(shown, keyOf, { qty: (r) => r.producedQty }).map((g) => ({
      key: g.label,
      // 코드 칸은 품목으로 묶을 때만 뜻이 있다 — 창고·프로젝트에는 코드가 없다.
      code: subtotal === '품목' ? (g.rows[0]?.productCode ?? '') : '',
      name: g.label,
      unit: subtotal === '품목' ? (g.rows[0]?.productUnit ?? '') : '',
      qty: g.sums.qty,
      count: g.count,
    })).sort((a, b) => b.qty - a.qty)
  }, [shown, subtotal])

  /** 라인별 — 전표 하나에 소모자재가 여러 줄이므로 자재 줄까지 펼친다. */
  const lines = useMemo(() => shown.flatMap((r) =>
    (r.materials.length === 0
      ? [{ key: `${r.id}`, r, m: null as Material | null }]
      : r.materials.map((m) => ({ key: `${r.id}-${m.itemId}`, r, m })))), [shown])

  const totalQty = shown.reduce((n, r) => n + r.producedQty, 0)

  /* 원본 [데이터 보기형식] · [그래프로 보기]. 지금 보고 있는 [구분]을 따라 그린다. */
  const chartRows = useMemo(() =>
    mode === '집계'
      ? byItem.map((r) => ({ label: r.name, value: r.qty }))
      : shown.map((r) => ({ label: `${r.productionDate} ${r.productName}`, value: r.producedQty })),
    [mode, byItem, shown])

  /** 품목별 평가단가. 재고평가와 같은 규칙을 쓴다 — 화면마다 따로 매기면 한쪽만 어긋난다. */
  const cost = useMemo(() => stockCostMap(items, purchases.map((d) => ({
    purchaseDate: d.purchaseDate,
    lines: (d.lines ?? []).map((l) => ({ itemId: l.itemId, unitPrice: l.unitPrice })),
  }))), [items, purchases])

  /** 생산금액 합계. 단가를 모르는 전표는 빼고 몇 건인지 함께 돌려준다. */
  const amount = useMemo(() => sumStockValue(
    shown.map((r) => ({ quantity: r.producedQty, unitCost: cost.get(r.productId) ?? null })),
  ), [shown, cost])

  return (
    <EcListShell
      title="생산입고현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {/* 원본은 기간 줄을 [일자]라고 부른다(사본 실측) — 기본값 [기준일자]가 아니다. */}
      <EcStatusPanel
        dateLabel="일자"
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        view={view} onViewChange={setView}
        subtotal={subtotal} subtotals={SUBTOTALS}
        onSubtotalChange={(v) => setSubtotal(v as typeof SUBTOTALS[number])}
      >
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={warehouseId} onChange={(v) => setWarehouseId(v)}
                           items={warehouses.map((w) => ({ value: String(w.id), code: (w as { code?: string }).code, name: w.name }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={(v) => setItem(v)}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={project} onChange={(v) => setProject(v)}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={200} emptyLabel="전체"
                           value={worker} onChange={(v) => setWorker(v)}
                           items={pickers.employees} />
        </EcCond>
        {/* 원본 조건의 [적요]. 왜 그렇게 입고했는지 적어 두고도 그 말로는 못 찾았다. */}
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={note}
                 onChange={(e) => setNote(e.target.value)} style={{ width: 200 }} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        입고 전표 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{shown.length}</b>건
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        입고수량 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{num(totalQty)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        생산금액 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{num(Math.round(amount.value))}</b>
        {amount.unknown > 0 && (
          <span style={{ marginLeft: 6, color: '#c07a00' }}>※ 단가 미정 {amount.unknown}건 제외</span>
        )}
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 개" emptyText="조회된 생산입고가 없습니다." />
      ) : mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 140 }}>{subtotal === '품목' ? '품목코드' : '코드'}</th>
              <th>{subtotal === '품목' ? '품목명' : subtotal}</th>
              <th style={{ width: 100, textAlign: 'right' }}>건수</th>
              <th style={{ width: 130, textAlign: 'right' }}>입고수량</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byItem.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : byItem.map((g, i) => (
              <tr key={g.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{g.code}</td>
                <td>{g.name}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>
                  {num(g.qty)} {g.unit}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>합계 ({byItem.length}건 묶음)</td>
              <td style={{ textAlign: 'right' }}>{num(shown.length)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{num(totalQty)}</td>
            </tr>
          </tfoot>
        </table>
      ) : mode === '라인별' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 180 }}>일자-No.</th>
              <th>생산품목</th>
              <th style={{ width: 110, textAlign: 'right' }}>입고수량</th>
              <th>소모자재</th>
              <th style={{ width: 110, textAlign: 'right' }}>소모수량</th>
              <th style={{ width: 130 }}>창고명</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : lines.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : lines.map((l, i) => (
              <tr key={l.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{l.r.productionDate} {l.r.prodNo}</td>
                <td>[{l.r.productCode}] {l.r.productName}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>
                  {num(l.r.producedQty)}
                </td>
                <td style={{ color: l.m ? undefined : '#9aa1ab' }}>
                  {l.m ? `[${l.m.itemCode}] ${l.m.itemName}` : '소모자재 없음'}
                </td>
                <td style={{ textAlign: 'right', color: '#a5561b' }}>{l.m ? num(l.m.quantity) : ''}</td>
                <td>{l.r.warehouseName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ textAlign: 'center', width: 180 }}>일자-No.</th>
              <th style={{ width: 150 }}>작업지시번호</th>
              <th style={{ width: 120 }}>출고창고명</th>
              <th style={{ width: 120 }}>입고창고명</th>
              <th>품목명[규격명]</th>
              <th style={{ width: 110, textAlign: 'right' }}>수량</th>
              <th style={{ width: 130, textAlign: 'right' }}>생산금액</th>
              <th style={{ width: 90, textAlign: 'right' }}>소모자재</th>
              <th style={{ width: 110 }}>담당자</th>
              <th style={{ width: 150 }}>적요</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{r.productionDate} {r.prodNo}</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{r.workOrderNo}</td>
                <td style={{ color: r.fromWarehouseName ? undefined : '#c9ced6' }}>
                  {r.fromWarehouseName ?? r.warehouseName}
                </td>
                <td>{r.warehouseName}</td>
                <td>{r.productName}{r.productSpec ? `[${r.productSpec}]` : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>
                  {num(r.producedQty)} {r.productUnit}
                </td>
                <td style={{ textAlign: 'right', color: cost.get(r.productId) == null ? '#c9ced6' : undefined }}>
                  {cost.get(r.productId) == null ? '-' : num(Math.round(r.producedQty * cost.get(r.productId)!))}
                </td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.materials.length}</td>
                <td>{r.createdBy ?? ''}</td>
                <td style={{ color: '#8a929c' }}>{r.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={6} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{num(totalQty)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{num(Math.round(amount.value))}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      )}
    </EcListShell>
  )
}
