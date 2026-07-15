import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import type { PartnerBalance, ProfitSummary, PurchaseDoc, SalesDoc, StockRow, VatSummary } from '../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')
const STORAGE_KEY = 'mypage-widgets-v1'

/** 대시보드에 쌓이는 데이터 묶음 */
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
  to?: string
  render: (d: DashData) => ReactNode
}

/** 이카운트 위젯 패널 (제목바 + 우측 아이콘 + 본문). 편집모드면 이동/삭제 컨트롤 표시 */
function Widget({ def, edit, busy, refreshable, onRefresh, onMove, onRemove, children }: {
  def: WidgetDef
  edit: boolean
  busy: boolean
  refreshable: boolean
  onRefresh: () => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  children: ReactNode
}) {
  // ⋮ 옵션 드롭다운 (숨기기·좌우 이동) — 편집모드가 아니어도 위젯 단위로 조작
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div style={{ background: '#fff', border: edit ? '1px dashed var(--ec-blue)' : '1px solid var(--ec-border)', borderRadius: 4, boxShadow: 'var(--ec-shadow)', display: 'flex', flexDirection: 'column', minHeight: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 10px', borderBottom: '1px solid #eef1f5', background: edit ? '#f5f8ff' : undefined }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ec-text)' }}>{def.title}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, color: '#aab0b8', fontSize: 12, position: 'relative' }}>
          {edit ? (
            <>
              <span title="왼쪽으로" style={{ cursor: 'pointer' }} onClick={() => onMove(-1)}>◀</span>
              <span title="오른쪽으로" style={{ cursor: 'pointer' }} onClick={() => onMove(1)}>▶</span>
              <span title="제거" style={{ cursor: 'pointer', color: '#c60a2e' }} onClick={onRemove}>✕</span>
            </>
          ) : (
            <>
              {def.to && <Link to={def.to} title="이동" style={{ color: '#aab0b8', textDecoration: 'none' }}>↗</Link>}
              <span
                title={refreshable ? '새로고침' : '새로고침할 데이터가 없는 위젯입니다'}
                onClick={() => { if (refreshable && !busy) onRefresh() }}
                style={{
                  cursor: refreshable ? 'pointer' : 'default',
                  color: refreshable ? (busy ? 'var(--ec-blue)' : '#aab0b8') : '#d5d9de',
                  display: 'inline-block',
                  transition: 'transform .6s',
                  transform: busy ? 'rotate(360deg)' : undefined,
                }}
              >⟳</span>
              <span title="옵션" style={{ cursor: 'pointer' }} onClick={() => setMenuOpen((v) => !v)}>⋮</span>
              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 41,
                    background: '#fff', border: '1px solid #c9d1da', borderRadius: 3,
                    boxShadow: '0 4px 12px rgba(0,0,0,.12)', minWidth: 130, padding: 4, color: '#3a4453',
                  }}>
                    {[
                      { label: '⟳ 새로고침', run: () => { if (refreshable) onRefresh() }, disabled: !refreshable },
                      { label: '◀ 왼쪽으로 이동', run: () => onMove(-1) },
                      { label: '▶ 오른쪽으로 이동', run: () => onMove(1) },
                      { label: '✕ 위젯 숨기기', run: onRemove, danger: true },
                    ].map((m) => (
                      <button
                        key={m.label}
                        disabled={m.disabled}
                        onClick={() => { setMenuOpen(false); m.run() }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
                          fontSize: 12, background: 'none', border: 0,
                          cursor: m.disabled ? 'default' : 'pointer',
                          color: m.disabled ? '#c0c5cc' : m.danger ? '#c60a2e' : '#3a4453',
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
      <div style={{ padding: 8, flex: 1 }}>{children}</div>
    </div>
  )
}

// ===== 위젯 정의 =====
const REGISTRY: WidgetDef[] = [
  {
    id: 'stock', title: '재고현황', group: '재고', to: '/inventory/current',
    render: (d) => (
      <>
        <table className="ec-grid">
          <thead><tr><th>품목코드</th><th>품명</th><th>창고</th><th style={{ textAlign: 'right' }}>현재고</th><th>상태</th></tr></thead>
          <tbody>
            {d.stock.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab' }}>재고 없음</td></tr>
            ) : d.stock.slice(0, 6).map((s) => (
              <tr key={`${s.itemId}-${s.warehouseId}`}>
                <td style={{ fontFamily: 'monospace' }}>{s.itemCode}</td>
                <td>{s.itemName}</td>
                <td>{s.warehouseName}</td>
                <td style={{ textAlign: 'right', color: s.belowSafety ? 'var(--ec-blue)' : undefined, fontWeight: 600 }}>{won(s.quantity)} {s.unit}</td>
                <td>{s.belowSafety ? <span style={{ color: '#c60a2e' }}>부족</span> : <span style={{ color: '#2f8401' }}>정상</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.belowCount > 0 && <div style={{ marginTop: 6, fontSize: 11, color: '#c60a2e' }}>⚠ 안전재고 미달 {d.belowCount}건</div>}
      </>
    ),
  },
  {
    id: 'balances', title: '거래처별 채권·채무', group: '회계', to: '/sales/ledger',
    render: (d) => (
      <table className="ec-grid">
        <thead><tr><th>거래처</th><th>구분</th><th style={{ textAlign: 'right' }}>채권</th><th style={{ textAlign: 'right' }}>채무</th></tr></thead>
        <tbody>
          {d.balances.length === 0 ? (
            <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9aa1ab' }}>거래처 없음</td></tr>
          ) : d.balances.slice(0, 6).map((b) => (
            <tr key={b.partnerId}>
              <td>{b.name}</td>
              <td>{b.typeName}</td>
              <td style={{ textAlign: 'right', color: b.receivable > 0 ? 'var(--ec-blue)' : '#bbb' }}>{won(b.receivable)}</td>
              <td style={{ textAlign: 'right', color: b.payable > 0 ? '#2f8401' : '#bbb' }}>{won(b.payable)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={2} style={{ border: '1px solid var(--ec-border)', padding: '4px 8px' }}>합계</td>
            <td style={{ border: '1px solid var(--ec-border)', padding: '4px 8px', textAlign: 'right', color: 'var(--ec-blue)' }}>{won(d.totalReceivable)}</td>
            <td style={{ border: '1px solid var(--ec-border)', padding: '4px 8px', textAlign: 'right', color: '#2f8401' }}>{won(d.totalPayable)}</td>
          </tr>
        </tfoot>
      </table>
    ),
  },
  {
    id: 'sales', title: '판매현황', group: '영업·구매', to: '/sales/sell',
    render: (d) => (
      <table className="ec-grid">
        <thead><tr><th>전표번호</th><th>일자</th><th>거래처</th><th style={{ textAlign: 'right' }}>합계금액</th></tr></thead>
        <tbody>
          {d.sales.length === 0 ? (
            <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9aa1ab' }}>판매 내역 없음</td></tr>
          ) : d.sales.slice(0, 6).map((s) => (
            <tr key={s.id}>
              <td style={{ fontFamily: 'monospace' }}>{s.docNo}</td>
              <td>{s.saleDate}</td>
              <td>{s.partnerName}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(s.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    id: 'purchases', title: '구매현황', group: '영업·구매', to: '/sales/buy',
    render: (d) => (
      <table className="ec-grid">
        <thead><tr><th>전표번호</th><th>일자</th><th>거래처</th><th style={{ textAlign: 'right' }}>합계금액</th></tr></thead>
        <tbody>
          {d.purchases.length === 0 ? (
            <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9aa1ab' }}>구매 내역 없음</td></tr>
          ) : d.purchases.slice(0, 6).map((p) => (
            <tr key={p.id}>
              <td style={{ fontFamily: 'monospace' }}>{p.docNo}</td>
              <td>{p.purchaseDate}</td>
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
        <thead><tr><th>구분</th><th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th><th style={{ textAlign: 'right' }}>합계</th></tr></thead>
        <tbody>
          <tr><td>매출</td><td style={{ textAlign: 'right' }}>{won(d.vat.salesSupply)}</td><td style={{ textAlign: 'right' }}>{won(d.vat.salesVat)}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{won(d.vat.salesTotal)}</td></tr>
          <tr><td>매입</td><td style={{ textAlign: 'right' }}>{won(d.vat.purchaseSupply)}</td><td style={{ textAlign: 'right' }}>{won(d.vat.purchaseVat)}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{won(d.vat.purchaseTotal)}</td></tr>
          <tr style={{ background: '#f7f9fb' }}><td style={{ fontWeight: 700 }}>납부세액</td><td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ec-blue)' }}>{won(d.vat.vatPayable)} 원</td></tr>
        </tbody>
      </table>
    ) : <div style={{ textAlign: 'center', color: '#9aa1ab', padding: 10 }}>데이터 없음</div>,
  },
  {
    id: 'profit', title: '손익요약', group: '회계', to: '/accounting/profit',
    render: (d) => d.profit ? (
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, textAlign: 'center', padding: '12px 6px', border: '1px solid #e6e9ee', borderRadius: 3, background: '#f9fbfd' }}>
          <div style={{ fontSize: 11, color: '#5a6472' }}>총매출</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ec-blue)' }}>{won(d.profit.totalSales)}</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '12px 6px', border: '1px solid #e6e9ee', borderRadius: 3, background: '#f9fbfd' }}>
          <div style={{ fontSize: 11, color: '#5a6472' }}>총원가</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#812d03' }}>{won(d.profit.totalCost)}</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '12px 6px', border: '1px solid #e6e9ee', borderRadius: 3, background: '#f9fbfd' }}>
          <div style={{ fontSize: 11, color: '#5a6472' }}>매출총이익 ({d.profit.marginRate}%)</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#2f8401' }}>{won(d.profit.grossProfit)}</div>
        </div>
      </div>
    ) : <div style={{ textAlign: 'center', color: '#9aa1ab', padding: 10 }}>데이터 없음</div>,
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
          { icon: '⚙️', label: '생산입고', to: '/production/result' },
          { icon: '📝', label: '기안서작성', to: '/groupware/approval/draft' },
          { icon: '🕐', label: '출퇴근', to: '/groupware/attendance' },
        ].map((q) => (
          <Link key={q.label} to={q.to} style={{ textDecoration: 'none', color: '#333', border: '1px solid #e6e9ee', borderRadius: 3, padding: '10px 4px', textAlign: 'center', background: '#fff' }}>
            <div style={{ fontSize: 18 }}>{q.icon}</div>
            <div style={{ fontSize: 11, marginTop: 3 }}>{q.label}</div>
          </Link>
        ))}
      </div>
    ),
  },
  {
    id: 'buildStatus', title: '시스템 구축 현황', group: '공통',
    render: () => (
      <div style={{ fontSize: 12, lineHeight: 1.9, color: '#3a4453' }}>
        <div>✅ 재고관리 · 품목·창고·입출고·현재고</div>
        <div>✅ 판매/구매 · 거래처·판매·구매·채권채무</div>
        <div>✅ 생산관리 · BOM·작업지시·생산실적</div>
        <div>✅ 회계/원가 · 매입매출·부가세·원가·손익</div>
        <div>✅ 그룹웨어 · 전자결재·업무일지·출퇴근</div>
        <div style={{ marginTop: 4, color: 'var(--ec-blue)', fontWeight: 700 }}>🎉 전 모듈 연동 완료</div>
      </div>
    ),
  },
]

const DEFAULT_IDS = ['stock', 'balances', 'sales', 'purchases', 'vat', 'profit', 'shortcuts', 'buildStatus']
const GROUPS = ['재고', '영업·구매', '회계', '공통']

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_IDS
    const ids = JSON.parse(raw) as string[]
    const valid = ids.filter((id) => REGISTRY.some((w) => w.id === id))
    return valid.length ? valid : DEFAULT_IDS
  } catch {
    return DEFAULT_IDS
  }
}

export default function MyPageDashboard() {
  const { user } = useAuth()
  const [stock, setStock] = useState<StockRow[]>([])
  const [balances, setBalances] = useState<PartnerBalance[]>([])
  const [vat, setVat] = useState<VatSummary | null>(null)
  const [profit, setProfit] = useState<ProfitSummary | null>(null)
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])

  const [order, setOrder] = useState<string[]>(loadOrder)
  const [edit, setEdit] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(new Set())  // 새로고침 중인 위젯 id

  // 위젯 id별 데이터 재조회 함수 — ⟳/⋮ 새로고침이 이 맵을 재사용한다
  const loaders = useMemo<Record<string, () => Promise<void>>>(() => ({
    stock: () => api.get<StockRow[]>('/stock').then((r) => setStock(r.data)),
    balances: () => api.get<PartnerBalance[]>('/ledger/partner-balances').then((r) => setBalances(r.data)),
    vat: () => api.get<VatSummary>('/accounting/vat-summary').then((r) => setVat(r.data)),
    profit: () => api.get<ProfitSummary>('/accounting/profit-summary').then((r) => setProfit(r.data)),
    sales: () => api.get<SalesDoc[]>('/sales').then((r) => setSales(r.data)),
    purchases: () => api.get<PurchaseDoc[]>('/purchases').then((r) => setPurchases(r.data)),
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  }, [order])

  const data: DashData = useMemo(() => ({
    stock, balances, vat, profit, sales, purchases,
    belowCount: stock.filter((s) => s.belowSafety).length,
    totalReceivable: balances.reduce((a, b) => a + b.receivable, 0),
    totalPayable: balances.reduce((a, b) => a + b.payable, 0),
  }), [stock, balances, vat, profit, sales, purchases])

  function move(id: string, dir: -1 | 1) {
    setOrder((o) => {
      const i = o.indexOf(id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= o.length) return o
      const next = [...o]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  const removeWidget = (id: string) => setOrder((o) => o.filter((x) => x !== id))
  const addWidget = (id: string) => setOrder((o) => (o.includes(id) ? o : [...o, id]))
  const reset = () => setOrder(DEFAULT_IDS)

  const placed = order.map((id) => REGISTRY.find((w) => w.id === id)).filter((w): w is WidgetDef => !!w)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: '#5a6472' }}>
          <b style={{ color: 'var(--ec-text)', fontSize: 14 }}>MyPage</b> &nbsp; {user?.name}님, 환영합니다.
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className={`ec-btn${edit ? ' ec-btn-primary' : ''}`} onClick={() => setEdit((v) => !v)}>
            {edit ? '완료' : 'My위젯선택'}
          </button>
          {edit && <button className="ec-btn" onClick={reset}>위젯 초기화</button>}
        </div>
      </div>

      {/* 위젯 선택 카탈로그 (편집모드) */}
      {edit && (
        <div style={{ border: '1px solid var(--ec-blue)', background: '#f5f8ff', borderRadius: 3, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#5a6472', marginBottom: 8 }}>표시할 위젯을 선택하세요. 각 위젯의 ◀▶로 위치를 옮기고 ✕로 제거합니다.</div>
          {GROUPS.map((g) => (
            <div key={g} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ec-blue-dark)', marginBottom: 4 }}>{g}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {REGISTRY.filter((w) => w.group === g).map((w) => {
                  const on = order.includes(w.id)
                  return (
                    <button key={w.id} className="ec-btn" onClick={() => (on ? removeWidget(w.id) : addWidget(w.id))}
                      style={{ background: on ? 'var(--ec-blue-light)' : '#fff', color: on ? 'var(--ec-blue-dark)' : '#5a626e', fontWeight: on ? 700 : 400 }}>
                      {on ? '☑' : '☐'} {w.title}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {placed.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9aa1ab', padding: 40, border: '1px dashed var(--ec-border)', borderRadius: 3 }}>
          표시할 위젯이 없습니다. <b>My위젯선택</b>에서 위젯을 추가하세요.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {placed.map((w) => (
            <Widget
              key={w.id}
              def={w}
              edit={edit}
              busy={busy.has(w.id)}
              refreshable={!!loaders[w.id]}
              onRefresh={() => refreshWidget(w.id)}
              onMove={(dir) => move(w.id, dir)}
              onRemove={() => removeWidget(w.id)}
            >
              {w.render(data)}
            </Widget>
          ))}
        </div>
      )}
    </div>
  )
}
