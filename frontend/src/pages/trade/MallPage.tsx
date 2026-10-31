import { useEffect, useMemo, useState, useRef} from 'react'
import EcListShell, { type BottomAction } from '../../components/EcListShell'
import { useNavigate } from 'react-router-dom'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, MallOrder, MallOrderStatus, MallOverview, Partner, Warehouse } from '../../types/api'
import { partnerCodeItems } from '../../utils/codeItems'
import { dateText } from '../../utils/dateText'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import EcDateInput from '../../components/ui/EcDateInput'
import { todayYmd } from '../../utils/periods'
import { fmtAmount } from '../../utils/format'


/** 바깥 쇼핑몰과 주고받아야 하는 버튼의 안내. 원본은 연동 계정이 있어야 동작한다 — 원본 문구가 아니라 지은 문구(plans/재고1). */
const MALL_LINK_MSG = '쇼핑몰 연동이 필요합니다.'

/**
 * 원본 주문관리진행단계(E041005) 알약 — 전체 · 신규주문 · 주문확인 · 출고대기 · 출고완료 · 취소접수 · 취소완료 ·
 * 반품접수 · 반품처리중 · 반품완료 · 교환접수(2026-10-20 실측). 우리 주문 상태는 일곱이라 셋(취소접수 · 반품접수 ·
 * 반품처리중)은 늘 0 이다. 판매전환(CONVERTED)은 원본의 ERP전송(판매) 뒤 [출고대기] 에 둔다.
 */
const STAGES = ['신규주문', '주문확인', '출고대기', '출고완료', '취소접수', '취소완료', '반품접수', '반품처리중', '반품완료', '교환접수'] as const
type Stage = (typeof STAGES)[number]
const STAGE_OF: Record<MallOrderStatus, Stage> = {
  RECEIVED: '신규주문', CONFIRMED: '주문확인', CONVERTED: '출고대기', SHIPPED: '출고완료',
  CANCELLED: '취소완료', RETURNED: '반품완료', EXCHANGED: '교환접수',
}

export type MallMode = 'progress' | 'confirm' | 'ship' | 'cancel' | 'return' | 'exchange' | 'erp'

type Col = '오픈마켓명' | '주문번호' | '묶음주문번호' | '주문옵션' | '결제일자' | '오픈마켓상품명' | '오픈마켓품목key' | '수량' | '주문금액'
  | '주문상태' | '상태별처리기능' | '배송방법코드' | '배송방법' | '송장번호' | '품목코드(ERP)' | '품목명(ERP)' | '수취인' | '수취인연락처1'
  | '수취인연락처2' | '주소' | '배송비금액' | '배송요청사항' | '클레임 사유' | 'ERP전송여부(주문)' | 'ERP전송여부(판매)'

const HEAD: Col[] = ['오픈마켓명', '주문번호', '묶음주문번호']
const BUYER: Col[] = ['품목코드(ERP)', '품목명(ERP)', '수취인', '수취인연락처1', '수취인연락처2']
/** 원본 화면별 열 · 하단 버튼 · 보이는 상태(2026-10-20 loginaa 실측). */
const MODES: Record<MallMode, { title: string; statuses: MallOrderStatus[] | null; cols: Col[]; buttons: string[] }> = {
  progress: {
    title: '주문관리진행단계', statuses: null,
    cols: [...HEAD, '주문옵션', '결제일자', '오픈마켓상품명', '오픈마켓품목key', '수량', '주문금액', '주문상태', '상태별처리기능', '배송방법코드', '배송방법', '송장번호'],
    buttons: ['진행상태변경', '주문수집', '선택삭제', '품목연결', 'ERP전송(판매)', '매핑조회', '송수신현황', '쇼핑몰별제공기능', 'Excel'],
  },
  confirm: {
    title: '주문확인처리', statuses: ['RECEIVED', 'CONFIRMED'],
    cols: [...HEAD, '결제일자', '오픈마켓상품명', '오픈마켓품목key', '수량', '주문금액', '주문상태', '상태별처리기능', ...BUYER],
    buttons: ['주문수집', '선택삭제', '품목연결', 'ERP전송(판매)', '송수신현황', '쇼핑몰별제공기능', 'Excel', '웹자료올리기'],
  },
  ship: {
    title: '배송처리', statuses: ['CONVERTED', 'SHIPPED'],
    cols: [...HEAD, '결제일자', '오픈마켓상품명', '수량', '주문금액', '주문상태', '상태별처리기능', ...BUYER, '주소', '배송비금액', '배송방법코드', '배송방법', '송장번호', '배송요청사항'],
    buttons: ['출고대기', '선택삭제', '품목연결', 'ERP전송(주문)', '매핑조회', '송수신현황', '쇼핑몰별제공기능', 'Excel', '웹자료올리기'],
  },
  cancel: {
    title: '취소처리', statuses: ['CANCELLED'],
    cols: [...HEAD, '결제일자', '오픈마켓상품명', '오픈마켓품목key', '수량', '주문금액', '주문상태', '상태별처리기능', ...BUYER, '클레임 사유'],
    buttons: ['취소완료', '선택삭제', '품목연결', 'ERP전송(판매)', '송수신현황', '쇼핑몰별제공기능', 'Excel'],
  },
  return: {
    title: '반품처리', statuses: ['RETURNED'],
    cols: [...HEAD, '결제일자', '오픈마켓상품명', '오픈마켓품목key', '수량', '주문상태', '상태별처리기능', ...BUYER, '주소', '배송비금액', '클레임 사유'],
    buttons: ['반품완료', '선택삭제', '품목연결', 'ERP전송(판매)', '송수신현황', '쇼핑몰별제공기능', 'Excel'],
  },
  exchange: {
    title: '교환처리', statuses: ['EXCHANGED'],
    cols: [...HEAD, '결제일자', '오픈마켓상품명', '오픈마켓품목key', '수량', '주문상태', '상태별처리기능', ...BUYER, '주소', '배송비금액', '배송방법코드', '배송방법', '송장번호', '클레임 사유', '배송요청사항'],
    buttons: ['반품완료(교환)', '선택삭제', '품목연결', 'ERP전송(판매)', '송수신현황', '쇼핑몰별제공기능', 'Excel'],
  },
  erp: {
    title: 'ERP전송', statuses: null,
    cols: [...HEAD, '결제일자', '오픈마켓상품명', '오픈마켓품목key', '수량', '주문금액', '주문상태', ...BUYER, '주소', 'ERP전송여부(주문)', 'ERP전송여부(판매)'],
    buttons: ['선택삭제', '품목연결', 'ERP전송(판매)', 'Excel', 'ERP항목매핑설정'],
  },
}
const NUM_COLS = new Set<Col>(['수량', '주문금액', '배송비금액'])

/**
 * 재고 I > 쇼핑몰관리 > 주문관리 일곱 화면(E041005~E041011) — 같은 틀이라 한 컴포넌트가 mode 로 갈린다.
 *
 * 원본의 주문수집 · 상태 전송은 바깥 쇼핑몰 연동이다. 우리는 [주문수집] 을 손으로 넣는 창으로 대신하고,
 * 줄의 [상태별처리기능] 이 우리 상태(확인 → 판매전환 → 배송 → 반품/교환, 취소)를 바꾼다.
 * 재고 차감과 채권 계상은 판매전표가 한다. 쇼핑몰이 재고를 직접 건드리면 같은 사실을
 * 두 곳이 기록하게 되고, 두 숫자는 반드시 갈라진다.
 */
export default function MallPage({ mode = 'progress' }: { mode?: MallMode }) {
  const M = MODES[mode]
  const navigate = useNavigate()
  const [data, setData] = useState<MallOverview | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [mallNames, setMallNames] = useState<string[]>([])
  const [stage, setStage] = useState<Stage | '전체'>('전체')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [converting, setConverting] = useState<MallOrder | null>(null)
  const [fulfill, setFulfill] = useState<{ order: MallOrder; action: 'ship' | 'return' | 'exchange' } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  async function load() {
    setError('')
    try {
      const [o, it, p, w, ma] = await Promise.all([
        api.get<MallOverview>('/mall-orders'),
        api.get<Item[]>('/items'),
        api.get<Partner[]>('/partners'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<{ name: string; active: boolean }[]>('/mall-accounts'),
      ])
      setData(o.data)
      setItems(it.data)
      setPartners(p.data.filter((x) => x.type !== 'SUPPLIER'))
      setWarehouses(w.data)
      setMallNames(ma.data.filter((m) => m.active).map((m) => m.name))
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { setStage('전체'); setPicked(new Set()) }, [mode])

  const orders = useMemo(() => (data?.orders ?? []).filter((o) => !M.statuses || M.statuses.includes(o.status)), [data, M])
  const shown = useMemo(() => orders.filter((o) => stage === '전체' || STAGE_OF[o.status] === stage), [orders, stage])
  const stageCount = (s: Stage | '전체') => orders.filter((o) => s === '전체' || STAGE_OF[o.status] === s).length

  async function act(o: MallOrder, action: 'confirm' | 'cancel') {
    if (action === 'cancel' && !(await ecConfirm(`${o.mallOrderNo} 주문을 취소할까요?`))) return
    try {
      await api.post(`/mall-orders/${o.id}/${action}`)
      flash(action === 'confirm' ? '주문을 확인했습니다.' : '주문을 취소했습니다.')
      load()
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  async function mapItem(o: MallOrder, itemId: string) {
    if (!itemId) return
    try {
      await api.put(`/mall-orders/${o.id}/item`, { itemId: Number(itemId) })
      flash('품목을 매핑했습니다.')
      load()
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  const pick = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allPicked = shown.length > 0 && shown.every((o) => picked.has(o.id))

  /** 하단 버튼 — 우리 안에서 끝나는 것만 실제로 하고, 바깥 쇼핑몰과 주고받는 것은 안내만 띄운다. */
  function bottom(label: string): BottomAction {
    const link = () => { void ecAlert(MALL_LINK_MSG) }
    switch (label) {
      case '주문수집': return { label, primary: true, onClick: () => setShowForm(true) }
      case '품목연결': case '매핑조회': return { label, onClick: () => navigate('/sales/mall-item-mappings') }
      case 'ERP전송(판매)': return {
        label, selected: picked.size,
        onClick: () => { const o = shown.find((x) => picked.has(x.id)); if (o) setConverting(o) },
      }
      case 'Excel': return { label }
      case '진행상태변경': case '출고대기': case '취소완료': case '반품완료': case '반품완료(교환)': case 'ERP전송(주문)': case '선택삭제':
        return { label, primary: label === '진행상태변경', selected: picked.size, onClick: link }
      default: return { label, onClick: link }
    }
  }

  function cell(c: Col, o: MallOrder) {
    const open = o.status === 'RECEIVED' || o.status === 'CONFIRMED'
    switch (c) {
      case '오픈마켓명': return o.mall
      case '주문번호': return <span className="text-ec-blue">{o.mallOrderNo}</span>
      case '결제일자': return dateText(o.orderDate)
      case '오픈마켓상품명': return o.productName
      case '오픈마켓품목key': return o.mallProductCode ?? ''
      case '수량': return fmtAmount(o.quantity)
      case '주문금액': return fmtAmount(o.totalAmount)
      case '주문상태': return (
        <>
          {STAGE_OF[o.status]}
          {o.salesDocNo && <div className="text-[10.5px] text-ec-success">{o.salesDocNo}</div>}
        </>
      )
      case '상태별처리기능': return (
        <div className="inline-flex gap-[3px]">
          {o.status === 'RECEIVED' && <button className="ec-btn ec-btn-sm" onClick={() => act(o, 'confirm')}>확인</button>}
          {o.status === 'CONFIRMED' && <button className="ec-btn ec-btn-sm ec-btn-primary" onClick={() => setConverting(o)}>판매전환</button>}
          {o.status === 'CONVERTED' && <button className="ec-btn ec-btn-sm ec-btn-primary" onClick={() => setFulfill({ order: o, action: 'ship' })}>배송처리</button>}
          {o.status === 'SHIPPED' && (
            <>
              <button className="ec-btn ec-btn-sm" onClick={() => setFulfill({ order: o, action: 'return' })}>반품</button>
              <button className="ec-btn ec-btn-sm" onClick={() => setFulfill({ order: o, action: 'exchange' })}>교환</button>
            </>
          )}
          {open && <button className="ec-btn ec-btn-sm text-ec-danger" onClick={() => act(o, 'cancel')}>취소</button>}
        </div>
      )
      case '배송방법': return o.courier ?? ''
      case '송장번호': return o.trackingNo ?? ''
      case '품목코드(ERP)': return open ? (
        /* 긴 드롭다운이었다 — 코드도움으로(QA 21회차). */
        <CodePickerField label="품목" hideLabel fill placeholder="품목(미매핑)" emptyLabel="선택 안 함"
                         value={String(o.itemId ?? '')} onChange={(v) => mapItem(o, v)}
                         items={items.filter((it) => it.active !== false || it.id === o.itemId).map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword }))} />
      ) : (o.itemCode ?? '')
      case '품목명(ERP)': return o.itemName ?? ''
      case '수취인': return o.buyerName
      case '수취인연락처1': return o.buyerPhone ?? ''
      case '주소': return o.address ?? ''
      case '배송요청사항': return o.remark ?? ''
      case '클레임 사유': return o.closeReason ?? ''
      case 'ERP전송여부(판매)': return o.salesDocNo ? 'Y' : 'N'
      default: return ''
    }
  }

  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '쇼핑몰', [mode])

  return (
    <EcListShell title={M.title} actions={M.buttons.map(bottom)}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      {/* 원본: 진행단계만 단계별 알약(건수), 나머지 화면은 [전체] 하나. */}
      {mode === 'progress' ? (
        /* 원본 score-box(2026-10-21 실측): 칸 64.6 × 40.9 · 둥글기 10 · 머리카락 테두리(고른 것 파랑 · 나머지 hair 색) ·
           위 건수 14px 흰 바탕 h21 · 아래 이름 12px h18.9 회색(연회색, 고른 것은 파랑 바탕 흰 글자) · 칸 사이 5.4 */
        <div className="flex gap-[5.4px] mb-[6px] flex-wrap">
          {(['전체' as const, ...STAGES]).map((t) => {
            const on = stage === t
            return (
              <button key={t} type="button" onClick={() => setStage(t)}
                      className={`no-ec score-box flex flex-col w-[64.6px] h-[40.9px] p-0 overflow-hidden rounded-[10px] border-[0.5px] bg-transparent cursor-pointer ${on ? 'border-ec-blue' : 'border-ec-line'}`}>
                <span className={`block w-full h-[21px] leading-[21px] text-[14px] bg-white ${on ? 'text-ec-blue' : 'text-black'}`}>{stageCount(t)}</span>
                <span className={`block w-full h-[18.9px] leading-[18px] text-[12px] ${on ? 'bg-ec-blue text-white' : 'bg-ec-line-soft text-black'}`}>{t}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="ec-pills mb-[6px]">
          <button type="button" onClick={() => setStage('전체')}
                  className={`ec-pill no-ec${stage === '전체' ? ' active' : ''}`}>전체</button>
        </div>
      )}

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map((o) => o.id)))} />
            </th>
            {M.cols.map((c) => <th key={c} className={NUM_COLS.has(c) ? 'text-right' : c === '품목코드(ERP)' ? 'w-[160px]' : undefined}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={M.cols.length + 1} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((o) => (
            <tr key={o.id}>
              <td className="text-center"><input type="checkbox" checked={picked.has(o.id)} onChange={() => pick(o.id)} /></td>
              {M.cols.map((c) => <td key={c} className={NUM_COLS.has(c) ? 'text-right' : undefined}>{cell(c, o)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <CollectForm
          items={items}
          mallNames={mallNames}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); flash('주문을 수집했습니다.'); load() }}
        />
      )}
      {converting && (
        <ConvertForm
          order={converting}
          partners={partners}
          warehouses={warehouses}
          onClose={() => setConverting(null)}
          onSaved={(docNo) => { setConverting(null); flash(`판매전표 ${docNo} 생성됨`); load() }}
        />
      )}
      {fulfill && (
        <FulfillForm
          order={fulfill.order}
          action={fulfill.action}
          onClose={() => setFulfill(null)}
          onSaved={(msg) => { setFulfill(null); flash(msg); load() }}
        />
      )}
    </EcListShell>
  )
}

function FulfillForm({ order, action, onClose, onSaved }: {
  order: MallOrder
  action: 'ship' | 'return' | 'exchange'
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const isShip = action === 'ship'
  const [courier, setCourier] = useState(order.courier ?? '')
  const [trackingNo, setTrackingNo] = useState(order.trackingNo ?? '')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(todayYmd())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const title = isShip ? '배송처리' : action === 'return' ? '반품처리' : '교환처리'

  async function save() {
    setError('')
    if (isShip && (!courier.trim() || !trackingNo.trim())) return setError('택배사와 송장번호를 입력하세요.')
    if (!isShip && !reason.trim()) return setError('사유를 입력하세요.')
    setSaving(true)
    try {
      if (isShip) {
        await api.post(`/mall-orders/${order.id}/ship`, { courier, trackingNo, shippedAt: date })
        onSaved(`${order.mallOrderNo} 배송처리 완료`)
      } else {
        await api.post(`/mall-orders/${order.id}/${action}`, { reason, courier: courier || undefined, trackingNo: trackingNo || undefined, closedAt: date })
        onSaved(`${order.mallOrderNo} ${title} 완료`)
      }
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 460, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">{title}</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          <p className="text-[12.5px] text-ec-label mb-[10px]">
            {order.mall} / {order.mallOrderNo} · {order.buyerName} · {order.productName}
          </p>
          <table className="w-full text-left"><tbody>
            {(isShip || action === 'exchange') && (
              <>
                <tr>
                  <th className="w-[90px] bg-ec-page">택배사{isShip && <span className="text-ec-danger">*</span>}</th>
                  <td><input className="ec-input" value={courier} onChange={(e) => setCourier(e.target.value)} style={{ width: '100%' }} placeholder="예: CJ대한통운" /></td>
                </tr>
                <tr>
                  <th className="bg-ec-page">송장번호{isShip && <span className="text-ec-danger">*</span>}</th>
                  <td><input className="ec-input" value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} style={{ width: '100%' }} /></td>
                </tr>
              </>
            )}
            {!isShip && (
              <tr>
                <th className="bg-ec-page">사유<span className="text-ec-danger">*</span></th>
                <td><input className="ec-input" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%' }} placeholder={action === 'return' ? '예: 단순변심' : '예: 사이즈 교환'} /></td>
              </tr>
            )}
            <tr>
              <th className="bg-ec-page">{isShip ? '배송일' : '처리일'}</th>
              <td><EcDateInput className="ec-input" value={date} onChange={(e) => setDate(e.target.value)} /></td>
            </tr>
          </tbody></table>
        </div>
        <div className="flex gap-[6px] py-[10px] px-[16px] border-t border-t-ec-line border-solid">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '처리 중…' : title}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function CollectForm({ items, mallNames, onClose, onSaved }: {
  items: Item[]; mallNames: string[]; onClose: () => void; onSaved: () => void
}) {
  const [mall, setMall] = useState(mallNames[0] ?? '스마트스토어')
  const [mallOrderNo, setMallOrderNo] = useState('')
  const [orderDate, setOrderDate] = useState(todayYmd())
  const [buyerName, setBuyerName] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [address, setAddress] = useState('')
  const [productName, setProductName] = useState('')
  const [mallProductCode, setMallProductCode] = useState('')
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const total = (Number(quantity) || 0) * (Number(unitPrice) || 0)

  async function save() {
    setError('')
    if (!mall.trim() || !mallOrderNo.trim()) return setError('몰과 몰 주문번호를 입력하세요.')
    if (!buyerName.trim()) return setError('구매자명을 입력하세요.')
    if (!productName.trim()) return setError('몰 상품명을 입력하세요.')
    if (!(Number(quantity) > 0)) return setError('수량은 0보다 커야 합니다.')
    setSaving(true)
    try {
      await api.post('/mall-orders', {
        mall: mall.trim(),
        mallOrderNo: mallOrderNo.trim(),
        orderDate,
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim() || null,
        address: address.trim() || null,
        productName: productName.trim(),
        mallProductCode: mallProductCode.trim() || null,
        itemId: itemId ? Number(itemId) : null,
        quantity: Number(quantity),
        unitPrice: Number(unitPrice) || 0,
      })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="몰 주문 수집" onClose={onClose} onSave={save} saving={saving} error={error}>
      <table className="w-full text-left">
        <tbody>
          <tr>
            <th className="w-[100px] bg-ec-page">몰<span className="text-ec-danger">*</span></th>
            <td>
              <input className="ec-input" value={mall} onChange={(e) => setMall(e.target.value)} style={{ width: 140 }} list="mall-name-list" />
              <datalist id="mall-name-list">{mallNames.map((n) => <option key={n} value={n} />)}</datalist>
            </td>
            <th className="w-[90px] bg-ec-page">몰 주문번호<span className="text-ec-danger">*</span></th>
            <td><input className="ec-input" value={mallOrderNo} onChange={(e) => setMallOrderNo(e.target.value)} placeholder="예: 2026071400123" style={{ width: 160 }} /></td>
          </tr>
          <tr>
            <th className="bg-ec-page">주문일</th>
            <td><EcDateInput className="ec-input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></td>
            <th className="bg-ec-page">구매자<span className="text-ec-danger">*</span></th>
            <td><input className="ec-input" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} style={{ width: 160 }} /></td>
          </tr>
          <tr>
            <th className="bg-ec-page">연락처</th>
            <td><input className="ec-input" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} style={{ width: 140 }} /></td>
            <th className="bg-ec-page">배송지</th>
            <td><input className="ec-input" value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: 160 }} /></td>
          </tr>
          <tr>
            <th className="bg-ec-page">몰 상품명<span className="text-ec-danger">*</span></th>
            <td colSpan={3}><input className="ec-input" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="몰이 보내준 상품명 원문" style={{ width: '100%' }} /></td>
          </tr>
          <tr>
            <th className="bg-ec-page">몰품목코드</th>
            <td colSpan={3}>
              <input className="ec-input" value={mallProductCode} onChange={(e) => setMallProductCode(e.target.value)} placeholder="몰 상품 key (예: NSP-1001)" style={{ width: 220 }} />
              <span className="ml-[8px] text-[11.5px] text-ec-hint">품목코드연결에 등록돼 있으면 품목이 자동 연결됩니다.</span>
            </td>
          </tr>
          <tr>
            <th className="bg-ec-page">품목 매핑</th>
            <td colSpan={3}>
            {/* 코드 마스터를 고르는 칸은 드롭다운이 아니라 <b>코드도움</b>이다. */}
            <CodePickerField label="품목 매핑" hideLabel width={280} emptyLabel="(비우면 몰품목코드로 자동연결 시도)"
                             value={itemId} onChange={setItemId}
                             items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
              <span className="ml-[8px] text-[11.5px] text-ec-hint">매핑해야 판매전환할 수 있습니다.</span>
            </td>
          </tr>
          <tr>
            <th className="bg-ec-page">수량 / 단가</th>
            <td colSpan={3}>
              <input className="ec-input" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ width: 80, textAlign: 'right' }} />
              <span className="my-0 mx-[6px]">×</span>
              <input className="ec-input" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} style={{ width: 120, textAlign: 'right' }} />
              <span className="ml-[8px] font-bold">= {fmtAmount(total)} 원</span>
            </td>
          </tr>
        </tbody>
      </table>
    </Modal>
  )
}

function ConvertForm({ order, partners, warehouses, onClose, onSaved }: {
  order: MallOrder
  partners: Partner[]
  warehouses: Warehouse[]
  onClose: () => void
  onSaved: (docNo: string) => void
}) {
  const [partnerId, setPartnerId] = useState('')
  const [warehouseId, setWarehouseId] = useState(warehouses[0] ? String(warehouses[0].id) : '')
  const [taxable, setTaxable] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (!partnerId) return setError('거래처(몰)를 선택하세요.')
    if (!warehouseId) return setError('출고 창고를 선택하세요.')
    setSaving(true)
    try {
      const r = await api.post(`/mall-orders/${order.id}/convert`, {
        partnerId: Number(partnerId), warehouseId: Number(warehouseId), taxable,
      })
      onSaved(r.data.docNo)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`판매전환 — ${order.mall} ${order.mallOrderNo}`} onClose={onClose} onSave={save} saving={saving} error={error}>
      <table className="w-full text-left">
        <tbody>
          <tr>
            <th className="w-[110px] bg-ec-page">주문</th>
            <td>{order.productName} · {fmtAmount(order.quantity)}개 × {fmtAmount(order.unitPrice)}원 = <b>{fmtAmount(order.totalAmount)}원</b></td>
          </tr>
          <tr>
            <th className="bg-ec-page">품목</th>
            <td>{order.itemName ?? <span className="text-ec-danger">미매핑</span>}</td>
          </tr>
          <tr>
            <th className="bg-ec-page">거래처(몰)<span className="text-ec-danger">*</span></th>
            <td>
              <CodePickerField label="거래처(몰)" hideLabel width={220} emptyLabel="선택 안 함" placeholder="매출처 선택"
                               value={partnerId} onChange={setPartnerId}
                               items={partnerCodeItems(partners.filter((p) => p.type !== 'SUPPLIER'))} />
            </td>
          </tr>
          <tr>
            <th className="bg-ec-page">출고 창고<span className="text-ec-danger">*</span></th>
            <td>
              <select className="ec-input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ width: 220 }}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </td>
          </tr>
          <tr>
            <th className="bg-ec-page">과세</th>
            <td>
              <label className="text-[12.5px] flex items-center gap-[4px]">
                <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} /> 부가세 10% 부과
              </label>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-[10px] text-[11.5px] text-ec-hint">
        ※ 전환하면 판매전표가 만들어지고 재고가 차감됩니다. 재고가 부족하면 전환이 거부됩니다.
      </p>
    </Modal>
  )
}

function Modal({ title, children, onClose, onSave, saving, error }: {
  title: string
  children: React.ReactNode
  onClose: () => void
  onSave: () => void
  saving: boolean
  error: string
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 620, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">{title}</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          {children}
        </div>
        <div className="flex gap-[6px] py-[10px] px-[16px] border-t border-t-ec-line border-solid">
          <button className="ec-btn ec-btn-primary" onClick={onSave} disabled={saving}>{saving ? '처리 중…' : '확인(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
