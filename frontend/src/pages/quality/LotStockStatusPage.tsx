import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { ymd, INQUIRY_PICKS } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { Lot } from '../../api/types'
import { dateText } from '../../utils/dateText'

/**
 * 재고 II &gt; 시리얼/로트No. &gt; <b>시리얼/로트No.재고현황</b> (이카운트 E040619)
 *
 * <p><b>우리에게 없던 화면이다.</b> 사본 메뉴 대조표에도 이름이 없어 빠졌다는 것을 아무도
 * 몰랐다 — 2026-09-01 에 원본 메뉴를 직접 훑다가 드러났다. 로트가 <b>지금 어디에 얼마나
 * 남아 있나</b>를 보는 자리인데, 우리는 수불부(움직임)와 품목vs로트 비교만 있고
 * <b>잔량 그 자체를 보는 화면</b>이 없었다.
 *
 * <p>원본 조건 실측(2026-09-01): 구분(시리얼/로트No. · 시리얼/로트No.(창고별)) ·
 * 기준일자(<b>단일</b>, 기본 [금일]) · 유효기한(기본 [사용안함]) · 시리얼/로트No. · 창고 ·
 * 품목 · 재고수량(전체·1·기타) · 기타(결재방표시 · 사용중단시리얼/로트포함) · 정렬/소계기준.
 * 기간 빠른선택은 조회 공통 묶음이다.
 *
 * <p>자료는 <code>GET /api/lots?asOf=</code> 그대로다 — 서버는 진작 그 날 시점의 잔량으로
 * 되돌려 준다(백엔드 무변경).
 */

/** 원본 [구분] — 로트 한 줄씩이냐, 창고로 묶느냐. 기본은 로트별이다(실측). */
const MODES = ['시리얼/로트No.', '시리얼/로트No.(창고별)'] as const
type Mode = typeof MODES[number]

const num = (n: number) => n.toLocaleString('ko-KR')

export default function LotStockStatusPage() {
  const [lots, setLots] = useState<Lot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  const [mode, setMode] = useState<Mode>('시리얼/로트No.')
  /* 원본 [기준일자] 는 <b>한 날짜</b>다(구간이 아니다) — 그 날 시점의 잔량을 본다. 기본 [금일]. */
  const [asOf, setAsOf] = useState(ymd(new Date()))
  const [lotNo, setLotNo] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [item, setItem] = useState('')
  /*
   * 원본 [기타]의 <b>[사용중단시리얼/로트포함]</b> — 꺼진 채로 열린다(실측).
   * 우리 로트의 '사용중단' 은 <b>보류(held)</b> 다.
   */
  const [withHeld, setWithHeld] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await api.get<Lot[]>('/lots', { params: { asOf: asOf || undefined } })
      setLots(res.data)
    } catch (err) { setError(extractErrorMessage(err)); setLots([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [asOf])

  /* 고를 후보는 지금 걸린 자료에서 뽑는다 — 마스터를 통째로 받으면 조건을 안 쓰는 사람도 느려진다. */
  const lotNos = useMemo(() => [...new Set(lots.map((l) => l.lotNo))].sort(), [lots])
  const warehouses = useMemo(
    () => [...new Set(lots.map((l) => l.warehouseName).filter(Boolean) as string[])].sort(), [lots])
  const items = useMemo(() => [...new Set(lots.map((l) => l.itemName))].sort(), [lots])

  const shown = useMemo(() => {
    const kw = keyword.trim()
    return lots.filter((l) => {
      if (!withHeld && l.held) return false
      if (lotNo && l.lotNo !== lotNo) return false
      if (warehouse && l.warehouseName !== warehouse) return false
      if (item && l.itemName !== item) return false
      if (kw && !l.lotNo.includes(kw) && !l.itemName.includes(kw)) return false
      return true
    })
  }, [lots, withHeld, lotNo, warehouse, item, keyword])

  /** 원본 [구분]이 <b>(창고별)</b> 이면 창고로 묶어 잔량을 더한다. */
  const grouped = useMemo(() => {
    const map = new Map<string, { warehouse: string; lotCount: number; stockQty: number }>()
    for (const l of shown) {
      const key = l.warehouseName ?? '(미지정)'
      const cur = map.get(key) ?? { warehouse: key, lotCount: 0, stockQty: 0 }
      cur.lotCount += 1
      cur.stockQty += l.stockQty
      map.set(key, cur)
    }
    return [...map.values()].sort((a, b) => a.warehouse.localeCompare(b.warehouse, 'ko'))
  }, [shown])

  const totalQty = useMemo(() => shown.reduce((s, l) => s + l.stockQty, 0), [shown])

  return (
    <EcListShell
      title="시리얼/로트No.재고현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: () => load() }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">
        기준일자 시점의 로트 잔량. 그 날 뒤에 일어난 움직임을 되돌려 계산한다.
      </p>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 조건 차례: 구분 · 기준일자 · 유효기한 · 시리얼/로트No. · 창고 · 품목 · 재고수량 · 기타 */}
        <EcCond label="구분">
          <div className="ec-pills">
            {MODES.map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="기준일자">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <input type="date" className="ec-input" value={asOf}
                   onChange={(e) => setAsOf(e.target.value)} style={{ width: 150 }} />
            {/* 한 날짜라 빠른선택은 끝날(to)만 받는다. */}
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={asOf}
                           onPick={(r) => setAsOf(r.to)} />
          </div>
        </EcCond>
        <EcCond label="시리얼/로트No." pick>
          <CodePickerField label="시리얼/로트No." hideLabel width={190} emptyLabel="전체"
                           value={lotNo} onChange={setLotNo}
                           items={lotNos.map((l) => ({ value: l, name: l }))} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={160} emptyLabel="전체"
                           value={warehouse} onChange={setWarehouse}
                           items={warehouses.map((w) => ({ value: w, name: w }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={setItem}
                           items={items.map((i) => ({ value: i, name: i }))} />
        </EcCond>
        {/*
          원본 [기타]는 [결재방표시]·[사용중단시리얼/로트포함] 둘이다. 결재방은 인쇄물에
          결재란을 찍는 것이라 인쇄 판을 건드려야 해서 아직 없다.
        */}
        <EcCond label="기타">
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
            <input type="checkbox" checked={withHeld} onChange={(e) => setWithHeld(e.target.checked)} />
            사용중단시리얼/로트포함
          </label>
        </EcCond>
      </ul>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        {dateText(asOf)} 시점 · 로트 <b style={{ color: '#3a4453' }}>{num(shown.length)}</b>건 ·
        잔량 <b style={{ color: 'var(--ec-blue-dark)' }}>{num(totalQty)}</b>
      </div>

      {mode === '시리얼/로트No.(창고별)' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>창고</th>
              <th style={{ width: 110, textAlign: 'right' }}>로트 수</th>
              <th style={{ width: 140, textAlign: 'right' }}>재고수량</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : grouped.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : grouped.map((g, i) => (
              <tr key={g.warehouse}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>{g.warehouse}</td>
                <td style={{ textAlign: 'right' }}>{num(g.lotCount)}</td>
                <td style={{ textAlign: 'right' }}>{num(g.stockQty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 150 }}>시리얼/로트No.</th>
              <th style={{ width: 110 }}>품목코드</th>
              <th>품목명</th>
              <th style={{ width: 100 }}>규격</th>
              <th style={{ width: 120 }}>창고</th>
              <th style={{ width: 100 }}>입고일자</th>
              <th style={{ width: 100 }}>유효기한</th>
              <th style={{ width: 110, textAlign: 'right' }}>재고수량</th>
              <th style={{ width: 70, textAlign: 'center' }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((l, i) => (
              <tr key={l.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{l.lotNo}</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{l.itemCode}</td>
                <td>{l.itemName}</td>
                <td style={{ color: '#5a626e' }}>{l.spec ?? ''}</td>
                <td style={{ color: l.warehouseName ? undefined : '#c9ced6' }}>{l.warehouseName ?? '(미지정)'}</td>
                <td>{dateText(l.inboundDate)}</td>
                <td style={{ color: l.expireDate ? '#5a626e' : '#c9ced6' }}>{dateText(l.expireDate) || ''}</td>
                <td style={{ textAlign: 'right' }}>{num(l.stockQty)}</td>
                <td style={{ textAlign: 'center', color: l.held ? '#c07a00' : '#5a626e' }}>{l.statusName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </EcListShell>
  )
}
