import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 생산관리 > 생산계획/MRP생성 — 주차별 소요량 대비 계획수량 (/api/production-plans).
 *
 * <p>원본 조건·버튼 실측(사본): 생성일자 · <b>생산계획기간</b> · <b>기준품목</b> ·
 * [생산계획계산] · [MRP계산] · 생산계획/MRP현황 · 기타 · 적요 ·
 * 탭 [전체 | 생성 | 수정] · 생산계획현황 · MRP현황 ·
 * <b>[작업지시서생성]</b> · [발주계획/발주서생성] · 신규(F2) · 저장(F8) · 닫기 · 삭제
 *
 * <p>우리 화면은 목록과 검색어 한 칸이 전부였다. 계획이 쌓이면 주차로도 품목으로도
 * 못 걸렀고, <b>확정한 계획을 작업지시로 넘길 자리도 없었다</b> — 생산계획(MPS) 화면에는
 * 그 버튼이 있는데 여기만 없어서, 같은 자료를 보면서 한쪽에서만 일을 할 수 있었다.
 *
 * <p>원본 [생산계획/MRP생성] 팝업의 <b>[생산계획대상-전표]</b>는 미판매 · 매출계획 ·
 * 미구매 · 미생산/미소모다(사본 실측). 그중 <b>미판매</b>는 우리도 이미 세고 있다 —
 * 주문은 받았는데 아직 매출로 못 끊은 잔량이다. 그걸 근거로 계획을 만든다.
 *
 * <p>나머지 셋은 여전히 안 만든다. 매출계획은 품목이 아니라 거래처·금액 단위라 몇 개를
 * 만들지 나오지 않고, 미구매·미생산/미소모는 소요량 전개(BOM 역산) 엔진이 있어야 한다.
 * [MRP계산]·[발주계획/발주서생성]도 같은 이유로 없다 —
 * 눌러도 아무 일 없는 버튼은 있는 것만 못하다.
 */
type PlanStatus = 'REVIEW' | 'CONFIRMED' | 'ORDERED'

/**
 * 원본 탭 [전체 | 생성 | 수정]. 우리 상태(검토·확정·지시완료)로 갈음한다 —
 * 원본의 '생성/수정' 은 계획을 만든 방식(자동생성/손으로 고침)인데 우리에겐 그 구분이 없다.
 */
const TABS = ['전체', '검토', '확정', '지시완료'] as const
type Tab = typeof TABS[number]
const TAB_STATUS: Record<string, PlanStatus> = { 검토: 'REVIEW', 확정: 'CONFIRMED', 지시완료: 'ORDERED' }

const STATUS_COLOR: Record<PlanStatus, string> = {
  REVIEW: '#c07a00',
  CONFIRMED: '#1c7c3c',
  ORDERED: 'var(--ec-blue-dark)',
}

interface Row {
  id: number
  productId: number
  productCode: string
  productName: string
  productUnit: string
  planWeek: string
  demandQty: number
  currentStock: number
  planQty: number
  shortage: number
  status: PlanStatus
  statusName: string
  workOrderNo: string | null
  remark: string | null
  /**
   * 이 계획을 <b>만든 때</b>. 계획주차와 다르다 — 주차는 '언제 만들 것인가' 이고
   * 이것은 '언제 만들었나' 다. 원본 [생성일자] 조건이 보는 값이다.
   */
  createdAt: string | null
}

export default function MrpPage() {
  /** 날짜별 순소요 표 — 생산계획현황(PLAN) · MRP현황(MRP). */
  const [phased, setPhased] = useState<'PLAN' | 'MRP' | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState<Tab>('전체')
  /** 원본 [생산계획기간] — 주차 문자열(2026-W28)로 재므로 주차 구간으로 받는다. */
  const [weekFrom, setWeekFrom] = useState('')
  const [weekTo, setWeekTo] = useState('')
  /** 원본 [기준품목]. */
  const [item, setItem] = useState('')
  /* 원본 생산계획/MRP생성 조건에 <b>[적요]</b> 가 있다(사본 실측). 적요는 이미 목록에 온다. */
  const [remarkCond, setRemarkCond] = useState('')
  /* 원본 [생성일자] — 계획을 만든 날. 비워 두면 그쪽 끝은 안 자른다. */
  const [madeFrom, setMadeFrom] = useState('')
  const [madeTo, setMadeTo] = useState('')
  const [ok, setOk] = useState('')
  const [genWeek, setGenWeek] = useState('')
  const [deductStock, setDeductStock] = useState(true)
  const [generating, setGenerating] = useState(false)

  /**
   * 원본 [생산계획/MRP생성]. 미판매 잔량에서 재고를 뺀 부족분만큼 계획을 만든다.
   *
   * <p>몇 건을 왜 만들었는지 그대로 보여 준다 — 0건일 때 이유를 모르면 고장으로 읽힌다.
   */
  async function generate() {
    const week = genWeek.trim()
    if (!week) { setError('생성할 계획주차를 입력하세요 (예: 2026-W31)'); return }
    setGenerating(true); setError(''); setOk('')
    try {
      const res = await api.post<{
        created: number; skippedExisting: number; skippedCovered: number
      }>('/production-plans/generate', { planWeek: week, deductStock })
      const d = res.data
      setOk(`${week}: ${d.created}건 생성`
        + (d.skippedExisting ? ` · 이미 있어 건너뜀 ${d.skippedExisting}` : '')
        + (d.skippedCovered ? ` · 재고로 충당돼 건너뜀 ${d.skippedCovered}` : ''))
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setGenerating(false)
    }
  }

  /**
   * 작업지시서생성 — 원본 버튼이다. 생산계획(MPS) 화면에는 있는데 여기만 없어서,
   * 같은 자료를 보면서 한쪽에서만 일을 할 수 있었다.
   *
   * <p>확정한 계획만 넘긴다. 검토 중인 계획으로 지시를 내면 아직 정하지도 않은 수량이
   * 현장으로 나간다.
   */
  async function makeWorkOrder(r: Row) {
    if (!window.confirm(`${r.productName} ${r.planQty} 작업지시를 생성할까요?`)) return
    setError(''); setOk('')
    try {
      const res = await api.post<Row>(`/production-plans/${r.id}/work-order`)
      setOk(`작업지시 ${res.data.workOrderNo} 생성 완료`)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      /*
       * 원본 [생산계획기간]을 <b>서버로 보낸다.</b> 예전에는 안 보내고 전 기간을 받아
       * 아래 shown 에서 걸렀다 — 주차 몇 개를 보려고 계획 전부를 실어 왔다.
       * 아래 걸름은 그대로 둔다(조건을 지웠을 때와 다른 조건들이 같은 자리에서 돈다).
       */
      const res = await api.get<Row[]>('/production-plans', {
        params: { weekFrom: weekFrom || undefined, weekTo: weekTo || undefined },
      })
      setRows([...res.data].sort((a, b) => (a.planWeek < b.planWeek ? 1 : a.planWeek > b.planWeek ? -1 : b.id - a.id)))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  /* 기간을 바꾸면 서버에서 다시 읽는다 — 이제 그 조건이 서버로 간다. */
  useEffect(() => { load() }, [weekFrom, weekTo])

  const shown = useMemo(() => rows.filter((r) => {
    if (tab !== '전체' && r.status !== TAB_STATUS[tab]) return false
    if (weekFrom && r.planWeek < weekFrom) return false
    if (weekTo && r.planWeek > weekTo) return false
    if (item && !`${r.productCode} ${r.productName}`.includes(item)) return false
    if (remarkCond && !(r.remark ?? '').includes(remarkCond)) return false
    /*
     * 원본 [생성일자] — 지난주에 뽑아 둔 계획과 오늘 새로 뽑은 계획이 <b>같은 주차로</b>
     * 섞여 있으면 어느 것이 새것인지 알 수가 없다. 만든 날로 자를 수 있어야 한다.
     */
    if (madeFrom && (r.createdAt ?? '').slice(0, 10) < madeFrom) return false
    if (madeTo && (r.createdAt ?? '9999').slice(0, 10) > madeTo) return false
    return !keyword || r.productName.includes(keyword) || r.planWeek.includes(keyword)
  }), [rows, tab, weekFrom, weekTo, item, keyword, remarkCond, madeFrom, madeTo])

  return (
    <EcListShell
      title="생산계획/MRP생성"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        /* 원본 생산계획/MRP리스트 줄의 [생산계획현황] · MRP계산 → [MRP현황]. 날짜별 순소요 표를 연다. */
        { label: '생산계획현황', onClick: () => setPhased('PLAN') },
        { label: 'MRP현황', onClick: () => setPhased('MRP') },
        { label: '다시 작성', onClick: () => {
          setTab('전체'); setWeekFrom(''); setWeekTo(''); setItem(''); setKeyword('')
        } },
        { label: 'Excel' },
        { label: '인쇄' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      <div className="ec-pills" style={{ marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
                  onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/*
        원본 [생산계획/MRP생성]. 원본은 팝업이지만 조건이 셋뿐이라 조건 판 위에 한 줄로 둔다 —
        팝업을 만들면 누를 때마다 창이 뜨고 닫히는 것 말고 나아지는 것이 없다.
      */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 10px',
        border: '1px solid var(--ec-border)', background: '#f7f9fb', flexWrap: 'wrap',
      }}>
        <b style={{ fontSize: 12.5, color: 'var(--ec-text)' }}>생산계획/MRP생성</b>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>대상-전표</span>
        <span className="ec-pill active" style={{ cursor: 'default' }}>미판매</span>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>계획주차</span>
        <input className="ec-input" placeholder="2026-W31" value={genWeek}
               onChange={(e) => setGenWeek(e.target.value)} style={{ width: 120 }} />
        <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={deductStock}
                 onChange={(e) => setDeductStock(e.target.checked)} />
          현재고 차감
        </label>
        <button className="ec-btn ec-btn-primary" onClick={generate} disabled={generating}>
          {generating ? '생성 중…' : '생성'}
        </button>
        <span style={{ fontSize: 11.5, color: '#8a929c' }}>
          주문은 받았는데 아직 매출로 못 끊은 잔량에서 재고를 뺀 만큼 만듭니다.
          같은 주차에 이미 있는 품목은 건드리지 않습니다.
        </span>
      </div>

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 차례는 <b>[생성일자]가 먼저</b>고 그다음이 [생산계획기간] 이다(사본 실측). */}
        <EcCond label="생성일자">
          <input type="date" className="ec-input" value={madeFrom}
                 onChange={(e) => setMadeFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={madeTo}
                 onChange={(e) => setMadeTo(e.target.value)} style={{ width: 145 }} />
        </EcCond>
        <EcCond label="생산계획기간">
          {/* 계획주차는 2026-W28 같은 문자열이라 주차 입력으로 받는다 — 날짜로 받으면 되레 어긋난다. */}
          <input type="week" className="ec-input" value={weekFrom}
                 onChange={(e) => setWeekFrom(e.target.value)} style={{ width: 150 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="week" className="ec-input" value={weekTo}
                 onChange={(e) => setWeekTo(e.target.value)} style={{ width: 150 }} />
        </EcCond>
        <EcCond label="기준품목" pick>
          <input className="ec-input" placeholder="품목코드·품명 일부" value={item}
                 onChange={(e) => setItem(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 200 }} />
        </EcCond>
      </ul>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>계획주차</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>총소요량</th>
            <th style={{ textAlign: 'right' }}>현재고</th>
            <th style={{ textAlign: 'right' }}>순소요량(부족)</th>
            <th style={{ textAlign: 'right' }}>계획수량</th>
            <th>작업지시번호</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th>비고</th>
            <th style={{ width: 110, textAlign: 'center' }}>처리</th>
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
              <td style={{ fontFamily: 'monospace' }}>{r.planWeek}</td>
              <td>[{r.productCode}] {r.productName}</td>
              <td style={{ textAlign: 'right' }}>{r.demandQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.currentStock.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: r.shortage > 0 ? 700 : 400, color: r.shortage > 0 ? '#c60a2e' : '#8a929c' }}>{r.shortage.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{r.planQty.toLocaleString()}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workOrderNo ?? ''}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: STATUS_COLOR[r.status] }}>{r.statusName}</td>
              <td style={{ color: '#8a929c' }}>{r.remark ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                {/* 확정한 계획만 넘긴다 — 검토 중인 수량으로 지시를 내면 아직 정하지도 않은 것이 현장으로 나간다. */}
                {r.status === 'CONFIRMED' ? (
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px' }}
                          onClick={() => void makeWorkOrder(r)}>작업지시서생성</button>
                ) : <span style={{ color: '#c9ced6', fontSize: 11.5 }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {phased && <TimePhasedModal mode={phased} onClose={() => setPhased(null)} onMade={(m) => { setOk(m); void load() }} />}
    </EcListShell>
  )
}

// ── 생산계획현황 · MRP현황 ─────────────────────────────────────────────

interface PhasedCell {
  opening: number | null; inQty: number; prodQty: number; outQty: number; consumeQty: number
  expected: number | null; needQty: number | null; planQty: number | null
}
interface PhasedRow {
  itemId: number; itemCode: string; itemName: string; spec: string | null; unit: string
  producible: boolean; safetyStock: number; minUnit: number; leadTimeDays: number | null
  supplierId: number | null
  prevStock: number; before: PhasedCell; days: PhasedCell[]
}
const PHASED_LINES: [keyof PhasedCell, string][] = [
  ['opening', '기초재고'], ['inQty', '입고예정량'], ['prodQty', '생산예정량'], ['outQty', '출고예정량'],
  ['consumeQty', '소모예정량'], ['expected', '예상재고'], ['needQty', '필요수량'], ['planQty', '계획수량'],
]
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** 필요일에서 조달기간만큼 앞당긴 날(지시일·발주일). 오늘보다 앞이면 오늘로. */
const releaseOf = (need: string, lead: number | null) => {
  const d = new Date(`${need}T00:00:00`)
  d.setDate(d.getDate() - (lead ?? 0))
  const today = ymdOf(new Date())
  const r = ymdOf(d)
  return r < today ? today : r
}

/**
 * 원본 <b>생산계획현황 · MRP현황</b> — 품목마다 여덟 줄(기초재고 · 입고예정량 · 생산예정량 · 출고예정량 ·
 * 소모예정량 · 예상재고 · 필요수량 · 계획수량), 열은 [계획기간이전] 과 기간의 날마다(2026-10-02 loginaa 실측).
 * 원본의 줄 이름은 생산계획 쪽이 [생산필요수량]·[생산계획수량] 이고, MRP 쪽은 사들이는 자재라 [구매…] 로 읽는다.
 *
 * <p>기간 기본값은 원본처럼 오늘 ~ 이달 말일이다. [작업지시서생성](원본 줄의 [기타])은 계획수량을 날짜마다
 * 작업지시서 한 장으로 만든다 — 생산공장을 골라야 한다.
 */
function TimePhasedModal({ mode, onClose, onMade }: { mode: 'PLAN' | 'MRP'; onClose: () => void; onMade: (msg: string) => void }) {
  const now = new Date()
  const [from, setFrom] = useState(ymdOf(now))
  const [to, setTo] = useState(ymdOf(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
  const [days, setDays] = useState<string[]>([])
  const [rows, setRows] = useState<PhasedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [warehouses, setWarehouses] = useState<{ id: number; code: string; name: string; kind: string; active: boolean }[]>([])
  const [factory, setFactory] = useState('')
  /** MRP 쪽 [발주요청생성] — 주거래처가 없는 품목을 보낼 매입처. */
  const [partners, setPartners] = useState<{ id: number; code: string; name: string }[]>([])
  const [fallbackPartner, setFallbackPartner] = useState('')

  async function run() {
    setLoading(true); setErr('')
    try {
      const r = await api.get<{ days: string[]; rows: PhasedRow[] }>('/production-plans/time-phased', { params: { from, to } })
      setDays(r.data.days); setRows(r.data.rows)
    } catch (e) {
      setErr(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void run() }, [])
  useEffect(() => {
    if (mode === 'PLAN') {
      api.get<typeof warehouses>('/warehouses').then((r) => setWarehouses(r.data.filter((w) => w.active))).catch(() => {})
    } else {
      api.get<typeof partners>('/partners').then((r) => setPartners(r.data)).catch(() => {})
    }
  }, [mode])

  const shown = rows.filter((r) => r.producible === (mode === 'PLAN'))
  /* 열이 기간의 날 수만큼 늘었다 줄었다 한다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, mode === 'PLAN' ? '생산계획현황' : 'MRP현황', [days.length, shown.length])
  const num = (v: number | null) => (v == null || Number(v) === 0 ? '' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 4 }))
  const label = (k: keyof PhasedCell, l: string) =>
    k === 'needQty' ? (mode === 'PLAN' ? '생산필요수량' : '구매필요수량')
      : k === 'planQty' ? (mode === 'PLAN' ? '생산계획수량' : '구매계획수량') : l

  /** 계획수량을 날짜마다 작업지시서 한 장(품목 여러 줄)으로. */
  async function makeWorkOrders() {
    if (!factory) { setErr('생산공장을 고르세요.'); return }
    // 지시일 = 필요일 − 조달기간, 납기일 = 필요일. 같은 (지시일, 납기일) 끼리 한 장으로 묶는다.
    const byDay = new Map<string, { productId: number; plannedQty: number; warehouseId: number }[]>()
    shown.forEach((r) => r.days.forEach((c, i) => {
      if (c.planQty && Number(c.planQty) > 0) {
        const key = `${releaseOf(days[i], r.leadTimeDays)}|${days[i]}`
        byDay.set(key, [...(byDay.get(key) ?? []), { productId: r.itemId, plannedQty: Number(c.planQty), warehouseId: Number(factory) }])
      }
    }))
    if (byDay.size === 0) { setErr('생산계획수량이 없습니다.'); return }
    setErr('')
    try {
      const nos: string[] = []
      for (const [key, lines] of byDay) {
        const [orderDate, dueDate] = key.split('|')
        const r = await api.post<{ orderNo: string }[]>('/work-orders/slips', { orderDate, dueDate, lines })
        nos.push(r.data[0]?.orderNo ?? '')
      }
      onMade(`작업지시서 ${nos.length}장 생성 · ${nos.join(', ')}`)
      onClose()
    } catch (e) {
      setErr(extractErrorMessage(e))
    }
  }

  /**
   * MRP 구매계획수량 → <b>발주요청</b>(발주서 진행의 첫 단계). 매입처(품목의 주거래처, 없으면 고른 매입처)와
   * 발주일(= 필요일 − 조달기간) 끼리 한 장으로 묶고, 납기일은 필요일이다. 단가는 단가요청 단계에서 정한다.
   */
  async function makePurchaseRequests() {
    const groups = new Map<string, { itemId: number; quantity: number }[]>()
    let noPartner = 0
    shown.forEach((r) => r.days.forEach((c, i) => {
      if (!c.planQty || Number(c.planQty) <= 0) return
      const partner = r.supplierId != null ? String(r.supplierId) : fallbackPartner
      if (!partner) { noPartner++; return }
      const key = `${partner}|${releaseOf(days[i], r.leadTimeDays)}|${days[i]}`
      groups.set(key, [...(groups.get(key) ?? []), { itemId: r.itemId, quantity: Number(c.planQty) }])
    }))
    if (noPartner > 0) { setErr(`주거래처가 없는 품목이 ${noPartner}줄 있습니다. 보낼 매입처를 고르세요.`); return }
    if (groups.size === 0) { setErr('구매계획수량이 없습니다.'); return }
    setErr('')
    try {
      const nos: string[] = []
      for (const [key, lines] of groups) {
        const [partnerId, orderDate, dueDate] = key.split('|')
        const r = await api.post<{ orderNo: string }>('/purchase-orders', {
          partnerId: Number(partnerId), orderDate, dueDate, remark: 'MRP 구매계획',
          lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPrice: 0 })),
        })
        nos.push(r.data.orderNo)
      }
      onMade(`발주요청 ${nos.length}건 생성 · ${nos.join(', ')}`)
      onClose()
    } catch (e) {
      setErr(extractErrorMessage(e))
    }
  }

  return (
    <Modal open title={mode === 'PLAN' ? '생산계획현황' : 'MRP현황'} error={err} width={1400} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5 }}>대상기간</span>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
        <span>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void run()}>적용(F8)</button>
        {mode === 'PLAN' && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CodePickerField label="생산공장" hideLabel width={180} emptyLabel="선택 해제" value={factory} onChange={setFactory}
                             items={[...warehouses].sort((a, b) => Number(a.kind === '창고') - Number(b.kind === '창고'))
                               .map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.kind }))} />
            <button type="button" className="ec-btn" onClick={() => void makeWorkOrders()}>작업지시서생성</button>
          </span>
        )}
        {mode === 'MRP' && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CodePickerField label="매입처" hideLabel width={180} emptyLabel="주거래처만" value={fallbackPartner} onChange={setFallbackPartner}
                             items={partners.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
            <button type="button" className="ec-btn" onClick={() => void makePurchaseRequests()}>발주요청생성</button>
          </span>
        )}
      </div>
      <div style={{ maxHeight: '62vh', overflow: 'auto' }}>
        <table ref={tableRef} className="w-full text-left" style={{ whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              <th>품목코드</th>
              <th>품목명[규격]</th>
              <th>단위</th>
              <th style={{ textAlign: 'right' }}>안전재고수량</th>
              <th style={{ textAlign: 'right' }}>최소증가단위</th>
              <th style={{ textAlign: 'right' }}>조달기간</th>
              <th style={{ textAlign: 'right' }}>전일재고</th>
              <th>구분</th>
              <th style={{ textAlign: 'right' }}>계획기간이전</th>
              {days.map((d) => <th key={d} style={{ textAlign: 'right' }}>{d.replace(/-/g, '/')}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9 + days.length} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={9 + days.length} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r) => (
              <Fragment key={r.itemId}>
                {PHASED_LINES.map(([k, l], li) => (
                  <tr key={k} style={k === 'planQty' ? { background: '#fff8e1' } : undefined}>
                    {li === 0 && (
                      <>
                        <td rowSpan={PHASED_LINES.length}>{r.itemCode}</td>
                        <td rowSpan={PHASED_LINES.length}>{r.itemName}{r.spec ? ` [${r.spec}]` : ''}</td>
                        <td rowSpan={PHASED_LINES.length}>{r.unit}</td>
                        <td rowSpan={PHASED_LINES.length} style={{ textAlign: 'right' }}>{num(r.safetyStock)}</td>
                        <td rowSpan={PHASED_LINES.length} style={{ textAlign: 'right' }}>{num(r.minUnit)}</td>
                        <td rowSpan={PHASED_LINES.length} style={{ textAlign: 'right' }}>{r.leadTimeDays ? `${r.leadTimeDays}일` : ''}</td>
                        <td rowSpan={PHASED_LINES.length} style={{ textAlign: 'right' }}>{num(r.prevStock)}</td>
                      </>
                    )}
                    <td>{label(k, l)}</td>
                    <td style={{ textAlign: 'right' }}>{num(r.before[k] as number | null)}</td>
                    {r.days.map((c, i) => (
                      <td key={i} style={{ textAlign: 'right', color: k === 'needQty' && c.needQty ? '#c60a2e' : undefined,
                        fontWeight: k === 'expected' || k === 'planQty' ? 600 : undefined }}>{num(c[k] as number | null)}</td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
