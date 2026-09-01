import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_FULL_PICKS, ymd } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'

/**
 * 재고 > 재고변동표 (이카운트 E040719)
 *
 * 원본에는 [구분]이 <b>집계 / 일별 / 월별</b> 셋이다. 우리는 집계(품목별 한 줄)만 있었다.
 * "이번 달에 재고가 어떻게 움직였나"를 보려면 날짜 축이 있어야 하는데 그게 없었다.
 *
 *   집계 — 품목별 기초·입고·출고·기말 한 줄. GET /api/stock/movement 가 계산해 준다.
 *   일별·월별 — 기간의 재고이동을 날짜/월로 묶는다. GET /api/stock/ledger 로 이동 내역을 받고,
 *               기초는 movement 의 품목별 기초를 합친 값에서 시작해 앞 구간의 기말을 다음 구간의
 *               기초로 굴린다. 그래야 구간끼리 이어진다(기말 = 기초 + 입고 − 출고).
 *
 * 원본 조건 중 '입출고표시방법(표시/상세표시)'·'개별창고기준'·'결재방표시'는 우리 데이터에
 * 대응하는 개념이 없어 넣지 않았다.
 */

interface MovementRow {
  itemId: number; itemCode: string; itemName: string; unit: string
  opening: number; inQty: number; outQty: number; closing: number
}

/** 일별·월별 보기의 한 줄. 구간(날짜 또는 월)마다 기초·입고·출고·기말을 낸다. */
interface BucketRow {
  key: string
  opening: number; inQty: number; outQty: number; closing: number; count: number
}

interface LedgerTx {
  transactionDate: string
  quantityChange: number
}

const num = (n: number) => n.toLocaleString('ko-KR')
const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const today = () => ymd(new Date())

export default function StockMovementPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items'])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [rows, setRows] = useState<MovementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [warehouseId, setWarehouseId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [hideZero, setHideZero] = useState(false)
  /**
   * 원본 조건 <b>[대표품목으로 합산]</b>. 색·용량만 다른 형제 품목을 <b>대표품목 한 줄</b>로
   * 모아 본다. 규격별로 갈린 표에서는 "이 물건이 이 달에 통틀어 얼마나 움직였나" 를
   * 눈으로 더해야 한다. 원본과 같이 기본은 꺼 둔다.
   */
  const [rollUp, setRollUp] = useState(false)
  /** 대표품목을 알려면 품목 마스터가 필요하다 — 변동표 응답에는 품목 id 만 온다. */
  const [items, setItems] = useState<Item[]>([])
  /** 원본 [구분] — 집계·일별·월별. */
  const [mode, setMode] = useState<'집계' | '일별' | '월별'>('집계')
  const [buckets, setBuckets] = useState<BucketRow[]>([])

  async function loadRefs() {
    const [w, i] = await Promise.all([
      api.get<Warehouse[]>('/warehouses'),
      api.get<Item[]>('/items'),
    ])
    setWarehouses(w.data)
    setItems(i.data)
  }
  async function load() {
    setLoading(true); setError('')
    try {
      const params: Record<string, string> = {}
      if (from) params.from = from
      if (to) params.to = to
      if (warehouseId) params.warehouseId = warehouseId
      const res = await api.get<MovementRow[]>('/stock/movement', { params })
      setRows(res.data)

      if (mode === '집계') {
        setBuckets([])
      } else {
        // 구간별 기초는 '기간 전체의 기초'에서 시작해 앞 구간의 기말을 다음 구간의 기초로 굴린다.
        // 그래야 구간끼리 이어지고 마지막 구간의 기말이 집계 보기의 기말과 맞는다.
        const openingTotal = res.data.reduce((n, r) => n + r.opening, 0)
        const led = await api.get<{ rows: LedgerTx[] }>('/stock/ledger', { params })
        const bucketOf = (d: string) => (mode === '월별' ? d.slice(0, 7) : d.slice(0, 10))

        const map = new Map<string, { inQty: number; outQty: number; count: number }>()
        led.data.rows.forEach((t) => {
          const k = bucketOf(t.transactionDate)
          const b = map.get(k) ?? { inQty: 0, outQty: 0, count: 0 }
          if (t.quantityChange >= 0) b.inQty += t.quantityChange
          else b.outQty += -t.quantityChange
          b.count += 1
          map.set(k, b)
        })

        let running = openingTotal
        setBuckets([...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, b]) => {
          const opening = running
          const closing = opening + b.inQty - b.outQty
          running = closing
          return { key, opening, inQty: b.inQty, outQty: b.outQty, closing, count: b.count }
        }))
      }
    } catch (err) { setError(extractErrorMessage(err)); setRows([]); setBuckets([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadRefs() }, [])
  // 보기 구분이 바뀌면 계산 근거가 달라지므로 다시 조회한다.
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mode])

  /** 일별·월별 보기에서 '입출고수량0제외' 를 걸면 움직임이 없는 날은 뺀다. */
  const shownBuckets = useMemo(
    () => buckets.filter((b) => !hideZero || b.inQty !== 0 || b.outQty !== 0),
    [buckets, hideZero],
  )

  const reset = () => {
    setFrom(firstOfMonth()); setTo(today())
    setWarehouseId(''); setKeyword(''); setHideZero(false); setMode('집계'); setRollUp(false)
  }

  const shown = useMemo(() => {
    const kw = keyword.trim()
    /*
     * 대표로 모을 때는 <b>더한 뒤에 거른다.</b> 먼저 거르면 형제 하나가 검색어에 안 걸려
     * 빠지고, 그러면 대표 줄의 수량이 조용히 모자란다.
     */
    let base = rows
    if (rollUp) {
      const head = new Map(items.map((it) => [it.id, it.parentItemId ?? it.id]))
      const names = new Map(items.map((it) => [it.id, it]))
      const m = new Map<number, MovementRow>()
      for (const r of rows) {
        const id = head.get(r.itemId) ?? r.itemId
        const h = names.get(id)
        const cur = m.get(id) ?? {
          ...r, itemId: id,
          itemCode: h?.code ?? r.itemCode, itemName: h?.name ?? r.itemName,
          opening: 0, inQty: 0, outQty: 0, closing: 0,
        }
        cur.opening += r.opening; cur.inQty += r.inQty
        cur.outQty += r.outQty; cur.closing += r.closing
        m.set(id, cur)
      }
      base = [...m.values()]
    }
    return base.filter((r) => {
      if (kw && !r.itemName.includes(kw) && !r.itemCode.includes(kw)) return false
      if (hideZero && r.inQty === 0 && r.outQty === 0) return false
      return true
    })
  }, [rows, keyword, hideZero, rollUp, items])

  const totals = useMemo(() => shown.reduce((s, r) => ({
    opening: s.opening + r.opening, inQty: s.inQty + r.inQty, outQty: s.outQty + r.outQty, closing: s.closing + r.closing,
  }), { opening: 0, inQty: 0, outQty: 0, closing: 0 }), [shown])


  return (
    <EcListShell
      title="재고변동표"
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
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_FULL_PICKS}
      >
        <EcCond label="구분">
          <div className="ec-pills">
            {(['집계', '일별', '월별'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={220} value={warehouseId} onChange={setWarehouseId}
                           items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location }))} />
        </EcCond>
        {mode === '집계' && (
          <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={keyword} onChange={(v) => setKeyword(v)}
                           items={pickers.items} />
        </EcCond>
        )}
        <EcCond label="기타">
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> 입출고수량0제외
          </label>
        </EcCond>
        {/*
          원본 차례: [기타] <b>뒤가 마지막</b>이다(사본 실측 — 세 화면이 다 같다).
          집계 보기에서만 뜻이 있다 — 일별·월별은 이미 품목을 한 덩어리로 굴린 표다.
        */}
        {mode === '집계' && (
          <EcCond label="대표품목으로 합산">
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={rollUp}
                     onChange={(e) => setRollUp(e.target.checked)} /> 형제 품목을 대표 한 줄로
            </label>
          </EcCond>
        )}
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {mode === '집계' ? '품목' : mode === '일별' ? '일수' : '월수'}{' '}
        <b style={{ color: '#3c4553' }}>{(mode === '집계' ? shown.length : shownBuckets.length).toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        입고계 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{num(totals.inQty)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        출고계 <b style={{ color: '#a5561b', fontSize: 14 }}>{num(totals.outQty)}</b>
      </div>

      {mode !== '집계' ? (
        <table className="w-full text-left">
          <colgroup>
            <col style={{ width: '5%' }} /><col /><col style={{ width: '11%' }} />
            <col style={{ width: '15%' }} /><col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} /><col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th>{mode === '일별' ? '일자' : '월'}</th>
              <th style={{ textAlign: 'right' }}>건수</th>
              <th style={{ textAlign: 'right' }}>기초</th>
              <th style={{ textAlign: 'right' }}>입고</th>
              <th style={{ textAlign: 'right' }}>출고</th>
              <th style={{ textAlign: 'right' }}>기말</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
            ) : shownBuckets.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
            ) : shownBuckets.map((b, i) => (
              <tr key={b.key}>
                <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                <td>{b.key.replace(/-/g, '/')}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(b.count)}</td>
                <td style={{ textAlign: 'right' }}>{num(b.opening)}</td>
                <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{num(b.inQty)}</td>
                <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(b.outQty)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{num(b.closing)}</td>
              </tr>
            ))}
          </tbody>
          {shownBuckets.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(shownBuckets[0].opening)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(totals.inQty)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(totals.outQty)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>
                  {num(shownBuckets[shownBuckets.length - 1].closing)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>품목코드</th>
            <th>품목명</th>
            <th style={{ textAlign: 'center', width: 50 }}>단위</th>
            <th style={{ textAlign: 'right' }}>기초</th>
            <th style={{ textAlign: 'right' }}>입고</th>
            <th style={{ textAlign: 'right' }}>출고</th>
            <th style={{ textAlign: 'right' }}>기말</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '해당 기간의 재고 변동이 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.itemId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'center', color: '#8a929c' }}>{r.unit}</td>
              <td style={{ textAlign: 'right', color: '#5a626e' }}>{num(r.opening)}</td>
              <td style={{ textAlign: 'right', color: r.inQty ? 'var(--ec-blue)' : '#c5cbd3', fontWeight: r.inQty ? 600 : 400 }}>{r.inQty ? num(r.inQty) : ''}</td>
              <td style={{ textAlign: 'right', color: r.outQty ? '#a5561b' : '#c5cbd3', fontWeight: r.outQty ? 600 : 400 }}>{r.outQty ? num(r.outQty) : ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{num(r.closing)}</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right' }}>{num(totals.opening)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{num(totals.inQty)}</td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(totals.outQty)}</td>
              <td style={{ textAlign: 'right' }}>{num(totals.closing)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      )}
    </EcListShell>
  )
}
