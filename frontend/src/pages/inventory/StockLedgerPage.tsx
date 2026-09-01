import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_FULL_PICKS } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StockTransaction, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { dateText } from '../../utils/dateText'
import { periodOf } from '../../components/EcPeriodPicks'

/**
 * 재고 > 재고수불부 (이카운트 E040702)
 * 기간·창고·품목으로 거른 입출고 원장. 각 거래를 입고/출고로 나눠 보이고 잔량을 위→아래로 읽는다.
 * 데이터는 GET /api/stock/ledger → { opening, rows } (rows는 일자·id 오름차순).
 *
 * 저장된 balanceAfter는 <b>입력(id)순</b> 기준이라, 일자정렬 화면에서 그대로 쓰면 어긋난다
 * (백업/실사로 과거일자 거래가 뒤에 입력될 수 있음). 그래서 잔량은 서버가 준 기초재고(opening)에
 * 각 행의 변동량을 <b>표시 순서대로 누적</b>해 재계산한다. 기초/기말은 품목·창고를 모두 특정했을 때만
 * 의미가 있어 그때만 표시한다.
 */

type TxType = 'INBOUND' | 'OUTBOUND' | 'ADJUST'
const TYPE_COLOR: Record<TxType, { bg: string; fg: string }> = {
  INBOUND: { bg: '#eef4ff', fg: 'var(--ec-blue)' },
  OUTBOUND: { bg: '#fdf3ea', fg: '#a5561b' },
  ADJUST: { bg: '#f3eefb', fg: '#6b3fb0' },
}

interface LedgerResponse {
  opening: number | null
  rows: StockTransaction[]
  /** 조건에 걸린 전체 줄 수. 잘렸을 때 "몇 줄 중 몇 줄" 을 말하려고 받는다. */
  totalRows: number
  /** 잘라서 온 것인가. 이때만 [오천건이상조회] 를 띄운다. */
  truncated: boolean
}

const num = (n: number) => n.toLocaleString('ko-KR')

interface ServerFilters {
  from: string; to: string; itemId: string; warehouseId: string
  /**
   * 원본 조건 <b>[대표품목으로 합산]</b>. 고른 품목을 <b>대표품목의 가족</b>으로 넓혀 본다.
   * <b>서버 조건</b>이다 — 이 화면은 5천 줄에서 자르고 기초잔량을 따로 세므로, 화면에서
   * 걸러 봐야 잘린 뒤에 거르는 것이라 수량이 조용히 모자란다.
   */
  rollUp: boolean
}

/*
 * 원본 재고수불부는 <b>[전월+금월]</b> 로 열린다(사본 실측). 수불은 <b>지난달에서
 * 넘어온 잔량</b>을 봐야 이번 달 움직임이 읽힌다 — 금월만 보면 기초가 어디서
 * 왔는지 알 수 없다. 우리는 금월 1일~오늘이었다.
 */
const initP = periodOf('전월+금월')!

export default function StockLedgerPage() {
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [rows, setRows] = useState<StockTransaction[]>([])
  /** 조건에 걸린 전체 줄 수와, 잘라서 받았는지. 원본 [오천건이상조회] 자리를 위한 값이다. */
  const [totalRows, setTotalRows] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [opening, setOpening] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 서버 필터(조회 버튼으로 반영)
  const [filters, setFilters] = useState<ServerFilters>({ from: initP.from, to: initP.to, itemId: '', warehouseId: '', rollUp: false })
  // 클라이언트 보조 필터
  const [typeFilter, setTypeFilter] = useState<'ALL' | TxType>('ALL')
  /*
   * <b>주소로 찾아 들어올 수 있게</b> 검색어를 URL 에서 받는다.
   * A/S 접수의 [생성한 전표]가 이리로 건너온다 — 그 A/S 로 나간 부품 전표만 보여 주려면
   * 화면을 열자마자 걸러져 있어야 한다. 열고 나서 사람이 다시 치게 하면 건너온 뜻이 없다.
   */
  const [searchParams] = useSearchParams()
  const [keyword, setKeyword] = useState(searchParams.get('keyword') ?? '')
  /** 원본 '거래내역없는품목제외'. 조회 결과에 변동이 0 인 행이 섞이면 원장이 지저분해진다. */
  const [excludeNoTx, setExcludeNoTx] = useState(false)

  const reset = () => {
    setFilters({ from: initP.from, to: initP.to, itemId: '', warehouseId: '', rollUp: false })
    setTypeFilter('ALL'); setKeyword(''); setExcludeNoTx(false)
  }

  async function loadRefs() {
    const [i, w] = await Promise.all([api.get<Item[]>('/items'), api.get<Warehouse[]>('/warehouses')])
    setItems(i.data); setWarehouses(w.data)
  }

  /*
   * <b>넓게 물으면 앞 5천 줄만 받는다.</b> 이 화면은 기본 기간(전월+금월)만으로도 6만 4천 줄이
   * 나와서, 열 때마다 그만큼을 받아 그리다 멈췄다(전 기간이면 12만 줄·34MB).
   * 원본도 큰 결과를 그냥 주지 않는다 — 조회 화면 139곳에 [오천건이상조회] 버튼을 두고
   * 그 위로는 눌러야 가게 한다(사본 실측). 같은 방식으로 자르고, 자른 것을 숨기지 않는다.
   */
  async function loadLedger(all = false) {
    setLoading(true); setError('')
    try {
      const params: Record<string, string> = {}
      if (filters.from) params.from = filters.from
      if (filters.to) params.to = filters.to
      if (filters.itemId) params.itemId = filters.itemId
      if (filters.warehouseId) params.warehouseId = filters.warehouseId
      if (all) params.all = 'true'
      /* 품목을 안 골랐으면 넓힐 것이 없다 — 보낼 것도 없다. */
      if (filters.rollUp && filters.itemId) params.rollUp = 'true'
      const res = await api.get<LedgerResponse>('/stock/ledger', { params })
      setRows(res.data.rows)
      setOpening(res.data.opening)
      setTotalRows(res.data.totalRows)
      setTruncated(res.data.truncated)
    } catch (err) {
      setError(extractErrorMessage(err)); setRows([]); setOpening(null)
      setTotalRows(0); setTruncated(false)
    } finally { setLoading(false) }
  }

  useEffect(() => { loadRefs(); loadLedger() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  // 표시 순서(일자·id)대로 잔량 재계산: opening 이 있으면 누적, 없으면 저장된 balanceAfter(행별 실제 잔량) 사용.
  const runningById = useMemo(() => {
    const m = new Map<number, number>()
    if (opening != null) {
      let bal = opening
      for (const r of rows) { bal += r.quantityChange; m.set(r.id, bal) }
    } else {
      for (const r of rows) m.set(r.id, r.balanceAfter)
    }
    return m
  }, [rows, opening])

  const shown = useMemo(() => {
    const kw = keyword.trim()
    return rows.filter((r) => {
      if (typeFilter !== 'ALL' && r.type !== typeFilter) return false
      if (kw && !r.itemName.includes(kw) && !r.warehouseName.includes(kw) && !(r.note ?? '').includes(kw)) return false
      // 원본 '거래내역없는품목제외' — 변동량이 0 인 행은 원장을 지저분하게만 한다.
      if (excludeNoTx && r.quantityChange === 0) return false
      return true
    })
  }, [rows, typeFilter, keyword, excludeNoTx])

  const summary = useMemo(() => {
    let inQty = 0, outQty = 0
    for (const r of shown) {
      if (r.quantityChange >= 0) inQty += r.quantityChange
      else outQty += -r.quantityChange
    }
    // 기초/기말은 (품목,창고) 모두 특정 + 유형필터 없음일 때만 표시 (잔량 누계가 유효)
    const singleScope = opening != null && typeFilter === 'ALL'
    const netAll = rows.reduce((s, r) => s + r.quantityChange, 0)
    const closing = singleScope ? (opening as number) + netAll : null
    return { inQty, outQty, net: inQty - outQty, opening: singleScope ? opening : null, closing, singleScope }
  }, [shown, rows, opening, typeFilter])

  const setF = (patch: Partial<ServerFilters>) => setFilters((f) => ({ ...f, ...patch }))

  return (
    <EcListShell
      title="재고수불부"
      search={keyword}
      onSearchChange={setKeyword}
      /* 인자 없이 부른다 — onSearch 가 무엇을 넘기든 all 로 새면 안 된다. */
      onSearch={() => void loadLedger()}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => void loadLedger() },
        /* 잘려서 왔을 때만 누를 수 있다 — 안 잘렸으면 더 가져올 것이 없다. */
        { label: '오천건이상조회', onClick: () => void loadLedger(true), disabled: !truncated },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {/*
        원본 재고수불부(E040702)의 조건 판. 기준일자는 구간이고 빠른선택은 여덟 개다
        (금일·전일·금주(~오늘)·전주·금월(~오늘)·전월·전월+금월·종료일).
        원본에는 '단가표시'가 있어 판매단가/구매단가/기타단가 중 **어느 단가로 금액을 볼지** 고른다.
        우리 재고이동은 단가를 하나만 들고 있어(전표에서 넘어온 그 값) 고를 대상이 없다.
        그래서 그 조건은 넣지 않고 표에는 그 단가를 그대로 보여 준다.
      */}
      <EcStatusPanel
        from={filters.from} to={filters.to}
        onPeriod={(r) => setF({ from: r.from, to: r.to })}
        picks={INQUIRY_FULL_PICKS}
      >
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={220} value={filters.warehouseId}
                           onChange={(v) => setF({ warehouseId: v })}
                           items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} value={filters.itemId}
                           onChange={(v) => setF({ itemId: v })}
                           items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, alias: it.searchKeyword, sub: it.spec }))} />
        </EcCond>
        <EcCond label="기타">
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={excludeNoTx}
                   onChange={(e) => setExcludeNoTx(e.target.checked)} /> 거래내역없는품목제외
          </label>
        </EcCond>
        {/* 원본 차례: [기타] <b>뒤가 마지막</b>이다(사본 실측 — 세 화면이 다 같다). */}
        <EcCond label="대표품목으로 합산">
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={filters.rollUp} disabled={!filters.itemId}
                   onChange={(e) => setF({ rollUp: e.target.checked })} />
            <span style={{ color: filters.itemId ? undefined : '#a8b0ba' }}> 형제 품목까지 함께</span>
          </label>
        </EcCond>
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {/*
        잘라서 받았으면 <b>반드시 말한다.</b> 말 없이 앞부분만 보여 주면 사람은 그것이 전부인 줄
        알고 합계를 읽는다 — 틀린 숫자를 맞다고 믿게 하는 것이 안 보여 주는 것보다 나쁘다.
      */}
      {truncated && (
        <p style={{ background: '#fff8e1', color: '#7a5b00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>
          모두 {num(totalRows)}줄 중 앞 {num(rows.length)}줄만 보고 있습니다.
          기간을 좁히거나 품목·창고를 고르면 전부 볼 수 있고, 그대로 다 보려면 [오천건이상조회]를 누르세요.
        </p>
      )}

      {/* 유형 탭 + 요약 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['ALL', 'INBOUND', 'OUTBOUND', 'ADJUST'] as const).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} className="no-ec" style={{
              padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: typeFilter === t ? 'var(--ec-blue)' : '#fff', color: typeFilter === t ? '#fff' : '#3a4453', fontWeight: typeFilter === t ? 700 : 400,
            }}>{t === 'ALL' ? '전체' : t === 'INBOUND' ? '입고' : t === 'OUTBOUND' ? '출고' : '조정'} ({t === 'ALL' ? rows.length : rows.filter((r) => r.type === t).length})</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          {summary.singleScope && summary.opening != null && (
            <>기초 <b style={{ color: '#3c4553', fontSize: 14 }}>{num(summary.opening)}</b><span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span></>
          )}
          입고계 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{num(summary.inQty)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          출고계 <b style={{ color: '#a5561b', fontSize: 14 }}>{num(summary.outQty)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          순증감 <b style={{ color: summary.net >= 0 ? '#1c7c3c' : '#c60a2e', fontSize: 14 }}>{summary.net > 0 ? '+' : ''}{num(summary.net)}</b>
          {summary.singleScope && summary.closing != null && (
            <><span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>기말 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{num(summary.closing)}</b></>
          )}
        </div>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자</th>
            <th style={{ textAlign: 'center', width: 60 }}>유형</th>
            <th>품목</th>
            <th>창고</th>
            <th style={{ textAlign: 'right' }}>입고</th>
            <th style={{ textAlign: 'right' }}>출고</th>
            <th style={{ textAlign: 'right' }}>잔량</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>금액</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '해당 기간의 입출고 내역이 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => {
            const inQ = r.quantityChange >= 0 ? r.quantityChange : 0
            const outQ = r.quantityChange < 0 ? -r.quantityChange : 0
            const amount = r.unitPrice != null ? Math.abs(r.quantityChange) * r.unitPrice : null
            const bal = runningById.get(r.id)
            const c = TYPE_COLOR[r.type]
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{dateText(r.transactionDate)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ background: c.bg, color: c.fg, padding: '1px 6px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{r.typeName}</span>
                </td>
                <td>{r.itemName}</td>
                <td>{r.warehouseName}</td>
                <td style={{ textAlign: 'right', color: inQ ? 'var(--ec-blue)' : '#c5cbd3', fontWeight: inQ ? 600 : 400 }}>{inQ ? num(inQ) : ''}</td>
                <td style={{ textAlign: 'right', color: outQ ? '#a5561b' : '#c5cbd3', fontWeight: outQ ? 600 : 400 }}>{outQ ? num(outQ) : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{bal != null ? num(bal) : ''}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.unitPrice != null ? num(r.unitPrice) : ''}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{amount != null ? num(amount) : ''}</td>
                <td style={{ color: '#8a929c' }}>{r.note ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
