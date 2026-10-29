import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { ecAlert } from '../components/EcDialog'
import { useAuth } from '../features/auth/AuthContext'
import type { PartnerBalance, ProfitSummary, PurchaseDoc, SalesDoc, StockRow, VatSummary } from '../types/api'
import { dateText } from '../utils/dateText'
import { bottomRow, MIN_H, MIN_W, normalize, place, twoColumns, type GridItem } from '../utils/gridLayout'

const won = (n: number) => n.toLocaleString('ko-KR')
/** 옛 저장값 — 위젯 id 순서만 있었다. 처음 한 번 두 단 배치로 옮긴다 */
const LEGACY_KEY = 'mypage-widgets-v1'
/** 지금 저장값 — 위젯마다 {id, x, y, w, h}(칸 수) */
const STORAGE_KEY = 'mypage-grid-v1'

/** 대시보드에 쌓이는 데이터 묶음 */
/**
 * 위젯이 그리는 줄 수. <b>받는 수와 그리는 수를 한 곳에서</b> 정한다 —
 * 둘로 흩어지면 요청은 여섯인데 표는 열을 그리려다 네 줄이 조용히 사라진다.
 */
const WIDGET_ROWS = 6

interface DashData {
  stock: StockRow[]
  balances: PartnerBalance[]
  vat: VatSummary | null
  profit: ProfitSummary | null
  sales: SalesDoc[]
  purchases: PurchaseDoc[]
  belowCount: number
  totalReceivable: number
  totalPayable: number
}

interface WidgetDef {
  id: string
  title: string
  group: string
  /** 새창 — 그 메뉴 화면 */
  to?: string
  /** 신규 — 그 메뉴의 입력 화면 */
  newTo?: string
  render: (d: DashData) => ReactNode
}

type GripDir = 'e' | 'se' | 's' | 'sw' | 'w'
const GRIPS: GripDir[] = ['e', 'se', 's', 'sw', 'w']

/**
 * 이카운트 위젯 패널 (제목바 + 우측 아이콘 + 본문). 원본 아이콘 차례: 새창 · 새로고침 · 신규 · ⋮([설정] [삭제]).
 * 제목바를 끌면 옮겨지고, 테두리 손잡이(e · se · s · sw · w)를 끌면 크기가 바뀐다 — 손잡이는 마우스를 올려야 보인다.
 */
function Widget({ def, busy, refreshable, onRefresh, onNew, onRemove, onHeadDown, children }: {
  def: WidgetDef
  busy: boolean
  refreshable: boolean
  onRefresh: () => void
  onNew: () => void
  onRemove: () => void
  onHeadDown: (e: ReactPointerEvent) => void
  children: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const openWindow = () => { if (def.to) window.open(def.to, '_blank', 'popup,width=1200,height=800') }
  return (
    <div className="ec-widget">
      <div className="ec-widget-head" onPointerDown={onHeadDown}>
        <span className="name">{def.title}</span>
        <div className="tools" onPointerDown={(e) => e.stopPropagation()}>
          <button title={def.to ? '새창' : '새창으로 열 화면이 없는 위젯입니다'} disabled={!def.to} onClick={openWindow}>⧉</button>
          <button
            title={refreshable ? '새로고침' : '새로고침할 데이터가 없는 위젯입니다'}
            disabled={!refreshable}
            className={busy ? 'spin' : undefined}
            onClick={() => { if (refreshable && !busy) onRefresh() }}
          >⟳</button>
          <button title={def.newTo ? '신규' : '신규 입력이 없는 위젯입니다'} disabled={!def.newTo} onClick={onNew}>＋</button>
          <button title="옵션" onClick={() => setMenuOpen((v) => !v)}>⋮</button>
          {menuOpen && (
            <>
              <div className="ec-backdrop-clear" onClick={() => setMenuOpen(false)} />
              <div className="ec-menu">
                <button onClick={() => { setMenuOpen(false); ecAlert(`[${def.title}] 위젯은 설정할 항목이 없습니다.`) }}>설정</button>
                <button className="danger" onClick={() => { setMenuOpen(false); onRemove() }}>삭제</button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="ec-widget-body">{children}</div>
    </div>
  )
}

// ===== 위젯 정의 =====
const REGISTRY: WidgetDef[] = [
  {
    id: 'stock', title: '재고현황', group: '재고', to: '/inventory/current', newTo: '/inventory/items',
    render: (d) => (
      <>
        <table className="ec-grid">
          <thead><tr><th>품목코드</th><th>품명</th><th>창고</th><th className="text-right">현재고</th><th>상태</th></tr></thead>
          <tbody>
            {d.stock.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-ec-hint">재고 없음</td></tr>
            ) : d.stock.slice(0, WIDGET_ROWS).map((s) => (
              <tr key={`${s.itemId}-${s.warehouseId}`}>
                <td>{s.itemCode}</td>
                <td>{s.itemName}</td>
                <td>{s.warehouseName}</td>
                <td style={{ textAlign: 'right', color: s.belowSafety ? 'var(--ec-blue)' : undefined, fontWeight: 600 }}>{won(s.quantity)} {s.unit}</td>
                <td>{s.belowSafety ? <span className="text-ec-danger">부족</span> : <span style={{ color: '#2f8401' }}>정상</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.belowCount > 0 && <div className="mt-[6px] text-[11px] text-ec-danger">⚠ 안전재고 미달 {d.belowCount}건</div>}
      </>
    ),
  },
  {
    id: 'balances', title: '거래처별 채권·채무', group: '회계', to: '/sales/ledger',
    render: (d) => (
      <table className="ec-grid">
        <thead><tr><th>거래처</th><th>구분</th><th className="text-right">채권</th><th className="text-right">채무</th></tr></thead>
        <tbody>
          {d.balances.length === 0 ? (
            <tr><td colSpan={4} className="text-center text-ec-hint">거래처 없음</td></tr>
          ) : d.balances.slice(0, WIDGET_ROWS).map((b) => (
            <tr key={b.partnerId}>
              <td>{b.name}</td>
              <td>{b.typeName}</td>
              {/* 음수는 0 이 아니다 — 채권 음수는 선수금, 채무 음수는 선급금이다.
                  회색으로 죽이면 잔액 0 과 구분이 안 된다. */}
              <td style={{ textAlign: 'right', color: b.receivable > 0 ? 'var(--ec-blue)' : b.receivable < 0 ? 'var(--ec-danger)' : '#bbb' }}>{won(b.receivable)}</td>
              <td style={{ textAlign: 'right', color: b.payable > 0 ? '#2f8401' : b.payable < 0 ? 'var(--ec-danger)' : '#bbb' }}>{won(b.payable)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-ec-page">
            <td colSpan={2} className="border border-ec-line border-solid py-[4px] px-[8px]">합계</td>
            <td className="border border-ec-line border-solid py-[4px] px-[8px] text-right text-ec-blue">{won(d.totalReceivable)}</td>
            <td style={{ border: '1px solid var(--ec-border)', padding: '4px 8px', textAlign: 'right', color: '#2f8401' }}>{won(d.totalPayable)}</td>
          </tr>
        </tfoot>
      </table>
    ),
  },
  {
    id: 'sales', title: '판매현황', group: '재고', to: '/sales/sell', newTo: '/sales/sell',
    render: (d) => (
      <table className="ec-grid">
        <thead><tr><th>전표번호</th><th>일자</th><th>거래처</th><th className="text-right">합계금액</th></tr></thead>
        <tbody>
          {d.sales.length === 0 ? (
            <tr><td colSpan={4} className="text-center text-ec-hint">판매 내역 없음</td></tr>
          ) : d.sales.slice(0, WIDGET_ROWS).map((s) => (
            <tr key={s.id}>
              <td>{s.docNo}</td>
              <td>{dateText(s.saleDate)}</td>
              <td>{s.partnerName}</td>
              <td className="text-right font-semibold text-ec-blue">{won(s.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    id: 'purchases', title: '구매현황', group: '재고', to: '/sales/buy', newTo: '/sales/buy',
    render: (d) => (
      <table className="ec-grid">
        <thead><tr><th>전표번호</th><th>일자</th><th>거래처</th><th className="text-right">합계금액</th></tr></thead>
        <tbody>
          {d.purchases.length === 0 ? (
            <tr><td colSpan={4} className="text-center text-ec-hint">구매 내역 없음</td></tr>
          ) : d.purchases.slice(0, WIDGET_ROWS).map((p) => (
            <tr key={p.id}>
              <td>{p.docNo}</td>
              <td>{dateText(p.purchaseDate)}</td>
              <td>{p.partnerName}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#2f8401' }}>{won(p.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    id: 'vat', title: '매입매출·부가세', group: '회계', to: '/accounting/vat',
    render: (d) => d.vat ? (
      <table className="ec-grid">
        <thead><tr><th>구분</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th></tr></thead>
        <tbody>
          <tr><td>매출</td><td className="text-right">{won(d.vat.salesSupply)}</td><td className="text-right">{won(d.vat.salesVat)}</td><td className="text-right font-semibold">{won(d.vat.salesTotal)}</td></tr>
          <tr><td>매입</td><td className="text-right">{won(d.vat.purchaseSupply)}</td><td className="text-right">{won(d.vat.purchaseVat)}</td><td className="text-right font-semibold">{won(d.vat.purchaseTotal)}</td></tr>
          <tr className="bg-ec-page"><td className="font-bold">납부세액</td><td colSpan={3} className="text-right font-bold text-ec-blue">{won(d.vat.vatPayable)} 원</td></tr>
        </tbody>
      </table>
    ) : <div className="text-center text-ec-hint p-[10px]">데이터 없음</div>,
  },
  {
    id: 'profit', title: '손익요약', group: '회계', to: '/accounting/profit',
    render: (d) => d.profit ? (
      <div className="flex gap-[10px]">
        <div style={{ flex: 1, textAlign: 'center', padding: '12px 6px', border: '1px solid #e6e9ee', borderRadius: 3, background: 'var(--ec-bg-page)' }}>
          <div style={{ fontSize: 11, color: '#5a6472' }}>총매출</div>
          <div className="text-[16px] font-bold text-ec-blue">{won(d.profit.totalSales)}</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '12px 6px', border: '1px solid #e6e9ee', borderRadius: 3, background: 'var(--ec-bg-page)' }}>
          <div style={{ fontSize: 11, color: '#5a6472' }}>총원가</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#812d03' }}>{won(d.profit.totalCost)}</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '12px 6px', border: '1px solid #e6e9ee', borderRadius: 3, background: 'var(--ec-bg-page)' }}>
          <div style={{ fontSize: 11, color: '#5a6472' }}>매출총이익 ({d.profit.marginRate}%)</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#2f8401' }}>{won(d.profit.grossProfit)}</div>
        </div>
      </div>
    ) : <div className="text-center text-ec-hint p-[10px]">데이터 없음</div>,
  },
  {
    id: 'shortcuts', title: '업무 바로가기', group: '공통',
    render: () => (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {[
          { icon: '📦', label: '품목등록', to: '/inventory/items' },
          { icon: '🧑‍💼', label: '거래처등록', to: '/sales/partners' },
          { icon: '🧾', label: '판매입력', to: '/sales/sell' },
          { icon: '🛒', label: '구매입력', to: '/sales/buy' },
          { icon: '🏭', label: '작업지시', to: '/production/work-orders' },
          { icon: '⚙️', label: '생산입고', to: '/production/receipt-bom' },
          { icon: '📝', label: '기안서작성', to: '/groupware/approval/draft' },
          { icon: '🕐', label: '출퇴근', to: '/groupware/attendance' },
        ].map((q) => (
          <Link key={q.label} to={q.to} style={{ textDecoration: 'none', color: '#333', border: '1px solid #e6e9ee', borderRadius: 3, padding: '10px 4px', textAlign: 'center', background: '#fff' }}>
            <div className="text-[18px]">{q.icon}</div>
            <div className="text-[11px] mt-[3px]">{q.label}</div>
          </Link>
        ))}
      </div>
    ),
  },
  {
    id: 'buildStatus', title: '시스템 구축 현황', group: '공통',
    render: () => (
      <div className="text-[12px] leading-[1.9] text-ec-text">
        <div>✅ 재고관리 · 품목·창고·입출고·현재고</div>
        <div>✅ 판매/구매 · 거래처·판매·구매·채권채무</div>
        <div>✅ 생산관리 · BOM·작업지시·생산실적</div>
        <div>✅ 회계/원가 · 매입매출·부가세·원가·손익</div>
        <div>✅ 그룹웨어 · 전자결재·업무일지·출퇴근</div>
        <div className="mt-[4px] text-ec-blue font-bold">🎉 전 모듈 연동 완료</div>
      </div>
    ),
  },
]

const DEFAULT_IDS = ['stock', 'balances', 'sales', 'purchases', 'vat', 'profit', 'shortcuts', 'buildStatus']
/** 원본 My위젯선택 분류 차례 */
const GROUPS = ['재고', '회계', '공통', '게시판']
/** 처음 높이(칸) — 표 여섯 줄이 스크롤 없이 들어가게 */
const DEFAULT_H: Record<string, number> = { stock: 6, balances: 6, sales: 5, purchases: 5, vat: 4, profit: 3, shortcuts: 4, buildStatus: 4 }
const heightOf = (id: string) => DEFAULT_H[id] ?? 5
/** My위젯선택에서 더한 위젯의 폭 — 원본 전자결재 · 공지사항(w13) */
const NEW_W = 13
const MOBILE = '(max-width: 768px)'
const DRAG_TYPE = 'application/x-ec-widget'

const known = (id: string) => REGISTRY.some((w) => w.id === id)
const byPos = (a: GridItem, b: GridItem) => a.y - b.y || a.x - b.x
const gridVars = (g: { x: number; y: number; w: number; h: number }) =>
  ({ '--gx': g.x, '--gy': g.y, '--gw': g.w, '--gh': g.h }) as CSSProperties

function loadStored(): GridItem[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return (JSON.parse(raw) as GridItem[]).filter((it) => it && known(it.id) && [it.x, it.y, it.w, it.h].every(Number.isFinite))
  } catch {
    return null
  }
}

function legacyOrder(): string[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return DEFAULT_IDS
    const valid = (JSON.parse(raw) as string[]).filter(known)
    return valid.length ? valid : DEFAULT_IDS
  } catch {
    return DEFAULT_IDS
  }
}

/** 끄는 동안의 모습 — layout: 놓으면 될 배치, float: 손을 따라가는 위젯(칸 단위 소수), ph: 자리표시를 그릴 위젯 */
interface Preview {
  layout: GridItem[]
  float?: GridItem
  ph: string
}

export default function MyPageDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stock, setStock] = useState<StockRow[]>([])
  const [balances, setBalances] = useState<PartnerBalance[]>([])
  const [vat, setVat] = useState<VatSummary | null>(null)
  const [profit, setProfit] = useState<ProfitSummary | null>(null)
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])

  const [stored, setStored] = useState<GridItem[] | null>(loadStored)
  const [pick, setPick] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(new Set())  // 새로고침 중인 위젯 id

  // 격자 — 한 칸은 토큰(--ec-grid-unit)에서 읽고, 열 수는 판 폭 ÷ 한 칸
  const gridRef = useRef<HTMLDivElement>(null)
  const [unit, setUnit] = useState(60)
  const [cols, setCols] = useState(0)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [dragNew, setDragNew] = useState<string | null>(null)
  const dropCell = useRef('')

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const u = parseFloat(getComputedStyle(el).getPropertyValue('--ec-grid-unit')) || 60
    setUnit(u)
    const ro = new ResizeObserver(() => setCols(Math.max(MIN_W, Math.floor(el.clientWidth / u))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 저장된 배치는 그대로 두고 지금 판 폭에 맞춘 모습만 만든다 — 판이 다시 넓어지면 원래대로 돌아온다
  const layout = useMemo(() => {
    if (!cols) return []
    return normalize(stored ?? twoColumns(legacyOrder(), cols, heightOf), cols)
  }, [stored, cols])
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const colsRef = useRef(cols)
  colsRef.current = cols

  const commit = (next: GridItem[]) => {
    setStored(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  // 위젯 id별 데이터 재조회 함수 — ⟳ 새로고침이 이 맵을 재사용한다
  const loaders = useMemo<Record<string, () => Promise<void>>>(() => ({
    stock: () => api.get<StockRow[]>('/stock').then((r) => setStock(r.data)),
    balances: () => api.get<PartnerBalance[]>('/ledger/partner-balances').then((r) => setBalances(r.data)),
    vat: () => api.get<VatSummary>('/accounting/vat-summary').then((r) => setVat(r.data)),
    profit: () => api.get<ProfitSummary>('/accounting/profit-summary').then((r) => setProfit(r.data)),
    /*
     * <b>보여 주는 만큼만 받는다.</b> 두 위젯은 최근 여섯 줄을 그리는데(slice(0, WIDGET_ROWS))
     * 여태 전 기간을 받았다 — 로그인하고 첫 화면에서 판매 3.6MB · 구매 1.0MB 가
     * 내려왔다(2026-09-10 실측). 두 목록 다 <b>최신순</b>이라 앞에서 여섯만 받으면 같은 줄이다.
     */
    sales: () => api.get<SalesDoc[]>('/sales', { params: { limit: WIDGET_ROWS } }).then((r) => setSales(r.data)),
    purchases: () => api.get<PurchaseDoc[]>('/purchases', { params: { limit: WIDGET_ROWS } }).then((r) => setPurchases(r.data)),
  }), [])

  useEffect(() => {
    Object.values(loaders).forEach((fn) => fn().catch(() => {}))
  }, [loaders])

  // 개별 위젯 새로고침: 잠시 busy 표시 후 해당 엔드포인트만 재조회
  async function refreshWidget(id: string) {
    const fn = loaders[id]
    if (!fn) return
    setBusy((s) => new Set(s).add(id))
    try { await fn() } catch { /* 위젯 단위 실패는 조용히 무시 */ }
    finally {
      setBusy((s) => { const n = new Set(s); n.delete(id); return n })
    }
  }

  const data: DashData = useMemo(() => ({
    stock, balances, vat, profit, sales, purchases,
    belowCount: stock.filter((s) => s.belowSafety).length,
    totalReceivable: balances.reduce((a, b) => a + b.receivable, 0),
    totalPayable: balances.reduce((a, b) => a + b.payable, 0),
  }), [stock, balances, vat, profit, sales, purchases])

  /**
   * 제목바(옮기기) · 손잡이(크기)를 누르고 끈다. 위젯은 손을 그대로 따라가고, 놓일 자리(60px 칸에 맞춘 곳)는
   * 점선 자리표시로 보인다. 나머지 위젯은 미리 비켜 선다 — 손을 떼면 그 배치로 저장한다.
   */
  function begin(e: ReactPointerEvent, id: string, dir?: GripDir) {
    if (e.button !== 0 || window.matchMedia(MOBILE).matches) return
    const orig = layoutRef.current.find((it) => it.id === id)
    if (!orig) return
    e.preventDefault()
    e.stopPropagation()
    const sx = e.clientX
    const sy = e.clientY
    let last: Preview | null = null
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / unit
      const dy = (ev.clientY - sy) / unit
      const c = colsRef.current
      const f: GridItem = { ...orig }
      if (!dir) {
        f.x = Math.max(0, Math.min(orig.x + dx, c - orig.w))
        f.y = Math.max(0, orig.y + dy)
      } else {
        if (dir === 'e' || dir === 'se') f.w = Math.max(MIN_W, Math.min(orig.w + dx, c - orig.x))
        if (dir === 'w' || dir === 'sw') {
          f.x = Math.max(0, Math.min(orig.x + dx, orig.x + orig.w - MIN_W))
          f.w = orig.x + orig.w - f.x
        }
        if (dir !== 'e' && dir !== 'w') f.h = Math.max(MIN_H, orig.h + dy)
      }
      const x = Math.round(f.x)
      // 왼쪽 손잡이는 오른쪽 변을 붙박아 둔다 — x · w 를 따로 반올림하면 오른쪽 변이 한 칸 흔들린다
      const w = dir === 'w' || dir === 'sw' ? orig.x + orig.w - x : Math.round(f.w)
      const snapped = { id, x, y: Math.round(f.y), w, h: Math.round(f.h) }
      last = { layout: place(layoutRef.current, snapped, c), float: f, ph: id }
      setPreview(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (last) commit(last.layout)
      setPreview(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // My위젯선택에서 끌어 온 위젯 — 손 아래 칸에 자리표시를 띄우고, 놓으면 그 자리에 넣는다
  function onGridDragOver(e: DragEvent) {
    if (!dragNew || !gridRef.current || !cols) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const r = gridRef.current.getBoundingClientRect()
    const x = Math.floor((e.clientX - r.left) / unit)
    const y = Math.max(0, Math.floor((e.clientY - r.top) / unit))
    const w = Math.min(NEW_W, cols)
    const cand = { id: dragNew, x: Math.max(0, Math.min(x, cols - w)), y, w, h: heightOf(dragNew) }
    // dragover 는 쉬지 않고 온다 — 칸이 바뀔 때만 다시 쌓는다
    const cell = `${cand.x},${cand.y}`
    if (preview && dropCell.current === cell) return
    dropCell.current = cell
    setPreview({ layout: place(layout, cand, cols), ph: dragNew })
  }
  function onGridDrop(e: DragEvent) {
    if (!dragNew) return
    e.preventDefault()
    if (preview) commit(preview.layout)
    setPreview(null)
    setDragNew(null)
  }
  function onGridDragLeave(e: DragEvent) {
    if (dragNew && !gridRef.current?.contains(e.relatedTarget as Node | null)) setPreview(null)
  }

  const removeWidget = (id: string) => commit(layout.filter((it) => it.id !== id))
  const addWidget = (id: string) => {
    if (!cols || layout.some((it) => it.id === id)) return
    commit(place(layout, { id, x: 0, y: bottomRow(layout), w: Math.min(NEW_W, cols), h: heightOf(id) }, cols))
  }
  const reset = () => { if (cols) commit(twoColumns(DEFAULT_IDS, cols, heightOf)) }

  const shown = preview?.layout ?? layout
  // DOM 차례는 저장된 배치의 위 → 아래(휴대폰에서 이 차례로 쌓인다). 끄는 동안에는 바꾸지 않는다
  const placed = [...layout].sort(byPos)
    .map((it) => REGISTRY.find((w) => w.id === it.id))
    .filter((w): w is WidgetDef => !!w)
  const phItem = preview ? shown.find((it) => it.id === preview.ph) : undefined
  const floatBottom = preview?.float ? Math.ceil(preview.float.y + preview.float.h) : 0
  const rows = Math.max(bottomRow(shown), floatBottom, 2) + (preview ? 2 : 0)

  return (
    <div>
      <div className="flex items-center mb-[10px]">
        <div className="text-[12px] text-ec-label">
          <b className="text-ec-text text-[14px]">MyPage</b> &nbsp; {user?.name}님, 환영합니다.
        </div>
        <div className="ml-auto flex gap-[6px]">
          <button className={`ec-btn${pick ? ' ec-btn-primary' : ''}`} onClick={() => setPick((v) => !v)}>My위젯선택</button>
        </div>
      </div>

      <div className="ec-wpage">
        <div
          ref={gridRef}
          className={`ec-wgrid${preview ? ' dragging' : ''}`}
          style={{ '--rows': rows } as CSSProperties}
          onDragOver={onGridDragOver}
          onDrop={onGridDrop}
          onDragLeave={onGridDragLeave}
        >
          {placed.length === 0 && !preview && (
            <div className="ec-wgrid-empty">
              표시할 위젯이 없습니다. <b>My위젯선택</b>에서 위젯을 끌어다 놓으세요.
            </div>
          )}
          {phItem && <div className="ec-wgrid-ph" style={gridVars(phItem)} />}
          {placed.map((w) => {
            const active = preview?.float?.id === w.id
            const g = active ? preview!.float! : shown.find((it) => it.id === w.id)
            if (!g) return null
            return (
              <div key={w.id} className={`ec-wgrid-item${active ? ' active' : ''}`} style={gridVars(g)}>
                <Widget
                  def={w}
                  busy={busy.has(w.id)}
                  refreshable={!!loaders[w.id]}
                  onRefresh={() => refreshWidget(w.id)}
                  onNew={() => { if (w.newTo) navigate(w.newTo) }}
                  onRemove={() => removeWidget(w.id)}
                  onHeadDown={(e) => begin(e, w.id)}
                >
                  {w.render(data)}
                </Widget>
                {GRIPS.map((d) => (
                  <div key={d} className={`ec-wgrid-grip ${d}`} onPointerDown={(e) => begin(e, w.id, d)} />
                ))}
              </div>
            )
          })}
        </div>

        {/* My위젯선택 — 원본 문구 · 분류. 항목을 끌어 격자에 놓거나 눌러서 맨 아래에 더한다(놓인 것은 눌러서 뺀다) */}
        {pick && (
          <div className="ec-wpick">
            <div className="ec-wpick-head">
              <span className="name">My위젯선택</span>
              <button className="ec-btn ec-btn-sm" onClick={reset}>위젯 초기화</button>
            </div>
            <div className="ec-wpick-hint">메뉴를 드래그하여 원하는 위치에 놓으시기 바랍니다.</div>
            {GROUPS.map((g) => {
              const list = REGISTRY.filter((w) => w.group === g)
              return (
                <div key={g} className="ec-wpick-group">
                  <div className="name">{g}</div>
                  {list.length === 0 && <div className="none">추가할 위젯이 없습니다.</div>}
                  {list.map((w) => {
                    const on = layout.some((it) => it.id === w.id)
                    return (
                      <button
                        key={w.id}
                        className={`ec-wpick-item${on ? ' on' : ''}`}
                        title={on ? '눌러서 홈에서 뺍니다' : '끌어다 놓거나 눌러서 더합니다'}
                        draggable={!on}
                        onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, w.id); e.dataTransfer.effectAllowed = 'copy'; setDragNew(w.id) }}
                        onDragEnd={() => { setDragNew(null); setPreview(null) }}
                        onClick={() => (on ? removeWidget(w.id) : addWidget(w.id))}
                      >
                        {on ? '☑' : '☐'} {w.title}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
