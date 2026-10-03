import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { LotTransaction, LotTxType } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { dateText } from '../../utils/dateText'
import EcPeriodPicks, { periodOf, LOT_LEDGER_PICKS } from '../../components/EcPeriodPicks'

/**
 * 재고 II > 시리얼/로트No. — 로트 수불부 / 내역조회 (이카운트 E040618·E040620·E040639)
 * 로트별 입고·출고·조정 이력을 시간순으로 보고 잔량(balanceAfter)을 읽는다.
 * 데이터는 GET /api/lots/transactions (LotTransactionResponse[], 로트별 오름차순). 백엔드 신설.
 */

const TYPE_COLOR: Record<LotTxType, { bg: string; fg: string }> = {
  INBOUND: { bg: '#eef4ff', fg: 'var(--ec-blue)' },
  OUTBOUND: { bg: '#fdf3ea', fg: '#a5561b' },
  ADJUST: { bg: '#f3eefb', fg: '#6b3fb0' },
}
const num = (n: number) => n.toLocaleString('ko-KR')

/* 원본 E040620 은 [전월+금월] 을 보고 열린다(2026-09-01 실측). */
const initP = periodOf('전월+금월')!

export default function LotLedgerPage() {
  const [rows, setRows] = useState<LotTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /*
   * 원본 시리얼/로트No.재고수불부(E040620) 조건의 <b>[기준일자]</b>. 기본은 <b>[전월+금월]</b>
   * 이다(2026-09-01 실측: 2026/08/01 ~ 2026/09/01) — 수불은 지난달 것이 이번 달로 넘어와
   * 이어지는 자료라 두 달을 함께 본다.
   *
   * <p>우리 화면에는 기간이 <b>아예 없어</b> /lots/transactions 를 조건 없이 불러
   * <b>여태 쌓인 움직임을 통째로</b> 받고 있었다. 서버도 안 받고 있었다.
   */
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  const [lotNo, setLotNo] = useState('')
  /*
   * 원본 조건 [창고]·[품목](2026-09-01 E040620 실측). 표에는 품목이 찍히는데 그 값으로
   * 거를 수가 없었고, 창고는 아예 보이지도 않았다. 고를 후보는 <b>지금 걸린 자료</b>에서
   * 뽑는다 — 마스터를 통째로 받으면 조건을 안 쓰는 사람에게도 느려진다.
   */
  /*
   * 원본 조건 판의 <b>첫 줄 [구분]</b> — [공통]·[시리얼/로트별집계] 둘이고 [공통]이 기본이다
   * (2026-09-01 E040620 실측). [공통]은 움직인 줄을 그대로 늘어놓고,
   * [시리얼/로트별집계]는 <b>로트마다 한 줄</b>로 접어 들어온 것·나간 것·남은 것만 낸다.
   *
   * <p>우리에겐 그 자리가 없어 줄 목록뿐이었다 — 로트가 백 개면 백 줄을 눈으로 훑어야
   * 어느 로트가 얼마나 남았는지 알 수 있었다.
   */
  const [mode, setMode] = useState<'공통' | '시리얼/로트별집계'>('공통')
  /*
   * 원본 [기타] 넷 가운데 <b>뜻이 분명한 둘</b>(2026-09-01 E040620 실측, 넷 다 꺼진 채 열린다).
   * [결재방표시]는 인쇄 판이라 아직 없고, [생산불출/창고이동포함]은 우리 로트 유형이
   * 입고·출고·조정 셋뿐이라 그 둘을 가릴 축이 없다 — 지어내지 않는다.
   */
  const [withHeld, setWithHeld] = useState(false)
  const [hideZero, setHideZero] = useState(false)
  const [warehouse, setWarehouse] = useState('')
  const [item, setItem] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | LotTxType>('ALL')
  /*
   * 원본 [유효기한] · [재고수량](2026-10-02 E040620 실측). 유효기한은 사용안함(기본) · 직접입력 · 금일 … 전월 — 고르면 유효기한이
   * 그 구간인 로트만. 재고수량은 전체 · 1 · 0 · 기타 넷이 다 켜진 채 열린다 — 로트의 <b>기말 잔량</b>(기간 안 마지막 줄의 잔량)이
   * 1 인가(시리얼 한 개) · 0 인가(다 나간 것) · 그 밖인가로 가른다.
   */
  const EXPIRY_OPTS = ['사용안함', '직접입력', '금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월'] as const
  const [expiryOpt, setExpiryOpt] = useState<typeof EXPIRY_OPTS[number]>('사용안함')
  const [expFrom, setExpFrom] = useState('')
  const [expTo, setExpTo] = useState('')
  const [qtyOne, setQtyOne] = useState(true)
  const [qtyZero, setQtyZero] = useState(true)
  const [qtyOther, setQtyOther] = useState(true)
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await api.get<LotTransaction[]>('/lots/transactions', {
        params: { from: from || undefined, to: to || undefined },
      })
      setRows(res.data)
    } catch (err) { setError(extractErrorMessage(err)); setRows([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to])

  const lotNos = useMemo(() => [...new Set(rows.map((r) => r.lotNo))].sort(), [rows])
  const warehouses = useMemo(
    () => [...new Set(rows.map((r) => r.warehouseName).filter(Boolean) as string[])].sort(), [rows])
  /* 품목은 이름이 겹칠 수 있어(규격만 다른 품목) id 로 고르고 거른다. */
  const items = useMemo(() => {
    const m = new Map<number, { value: string; code: string; name: string }>()
    for (const r of rows) if (!m.has(r.itemId)) m.set(r.itemId, { value: String(r.itemId), code: r.itemCode, name: r.itemName })
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [rows])

  /** 로트마다 기간 안 마지막 줄의 잔량 — [재고수량] 이 이 값으로 가른다. rows 는 로트별 시간순이다. */
  const closingByLot = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.lotNo, r.balanceAfter)
    return m
  }, [rows])
  const shown = useMemo(() => {
    const kw = keyword.trim()
    return rows.filter((r) => {
      if (expiryOpt !== '사용안함' && (!r.expireDate || (expFrom && r.expireDate < expFrom) || (expTo && r.expireDate > expTo))) return false
      const bal = closingByLot.get(r.lotNo) ?? 0
      if (bal === 1 ? !qtyOne : bal === 0 ? !qtyZero : !qtyOther) return false
      /* [포함] 이라 이름 붙은 것은 기본이 '안 넣음' 이다 — 켜야 보인다. */
      if (!withHeld && r.held) return false
      /* [입출고수량0제외] — 움직이지 않은 줄(조정으로 0 이 찍힌 것)을 뺀다. */
      if (hideZero && r.quantityChange === 0) return false
      if (warehouse && r.warehouseName !== warehouse) return false
      if (item && String(r.itemId) !== item) return false
      if (lotNo && r.lotNo !== lotNo) return false
      if (typeFilter !== 'ALL' && r.type !== typeFilter) return false
      if (kw && !r.lotNo.includes(kw) && !r.itemName.includes(kw)) return false
      return true
    })
  }, [rows, withHeld, hideZero, warehouse, item, lotNo, typeFilter, keyword, expiryOpt, expFrom, expTo, qtyOne, qtyZero, qtyOther, closingByLot])

  const totals = useMemo(() => shown.reduce((s, r) => {
    if (r.quantityChange >= 0) s.inQty += r.quantityChange
    else s.outQty += -r.quantityChange
    return s
  }, { inQty: 0, outQty: 0 }), [shown])
  /**
   * 원본 [시리얼/로트별집계] — 로트마다 한 줄. 잔량은 <b>그 로트의 마지막 줄</b>의 잔량이다
   * (더하면 안 된다 — 잔량은 누적값이라 더하는 순간 거짓말이 된다).
   */
  const byLot = useMemo(() => {
    const map = new Map<string, { lotNo: string; itemName: string; inQty: number; outQty: number; balance: number; count: number }>()
    for (const r of shown) {
      const cur = map.get(r.lotNo) ?? { lotNo: r.lotNo, itemName: r.itemName, inQty: 0, outQty: 0, balance: 0, count: 0 }
      if (r.quantityChange >= 0) cur.inQty += r.quantityChange
      else cur.outQty += -r.quantityChange
      cur.count += 1
      /* shown 은 로트별 시간순이라 마지막에 본 줄의 잔량이 그 로트의 기말이다. */
      cur.balance = r.balanceAfter
      map.set(r.lotNo, cur)
    }
    return [...map.values()].sort((a, b) => a.lotNo.localeCompare(b.lotNo, 'ko'))
  }, [shown])

  // 단일 로트 선택 시 기말 = 마지막 행 잔량
  const closing = lotNo && shown.length ? shown[shown.length - 1].balanceAfter : null


  return (
    <EcListShell
      /* 원본 화면 이름 그대로다(2026-09-01 E040620 실측) — 우리는 [로트 수불부] 라고만 불렀다. */
      title="시리얼/로트No.재고수불부"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-ec-hint">로트별 입고·출고·조정 이력과 잔량. 로트를 선택하면 그 로트의 수불부(기말 재고 포함).</p>

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 조건 판의 [기준일자] — 서버가 이 구간만 준다. */}
        {/* 원본 [기타] — 넷 중 뜻이 분명한 둘만. 원본대로 꺼진 채 열린다. */}
        {/* 원본 조건 차례의 첫 줄 [구분]. */}
        <EcCond label="구분">
          <div className="ec-pills">
            {(['공통', '시리얼/로트별집계'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from}
                 onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span className="text-ec-label">~</span>
          <input type="date" className="ec-input" value={to}
                 onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
          <EcPeriodPicks labels={LOT_LEDGER_PICKS} currentFrom={from}
                         onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
        </EcCond>
        {/* 원본 조건 차례(2026-10-02): 구분 · 기준일자 · 유효기한 · 시리얼/로트No. · 품목 · 재고수량 · 기타. [창고]는 우리가 더 둔다. */}
        <EcCond label="유효기한">
          <select className="ec-input" value={expiryOpt} style={{ width: 120 }}
                  onChange={(e) => {
                    const v = e.target.value as typeof EXPIRY_OPTS[number]
                    setExpiryOpt(v)
                    const r = v === '사용안함' || v === '직접입력' ? null : periodOf(v)
                    if (r) { setExpFrom(r.from); setExpTo(r.to) }
                    if (v === '사용안함') { setExpFrom(''); setExpTo('') }
                  }}>
            {EXPIRY_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {expiryOpt !== '사용안함' && (<>
            <input type="date" className="ec-input" value={expFrom} onChange={(e) => { setExpFrom(e.target.value); setExpiryOpt('직접입력') }} style={{ width: 140 }} />
            <span className="text-ec-label">~</span>
            <input type="date" className="ec-input" value={expTo} onChange={(e) => { setExpTo(e.target.value); setExpiryOpt('직접입력') }} style={{ width: 140 }} />
          </>)}
        </EcCond>
        <EcCond label="시리얼/로트No." pick>
          <CodePickerField label="시리얼/로트No." hideLabel width={200} emptyLabel="전체"
                           value={lotNo} onChange={setLotNo}
                           items={lotNos.map((l) => ({ value: l, name: l }))} />
        </EcCond>
        <EcCond label="품목" pick>
          {/* 긴 드롭다운이었다 — 코드도움으로(QA 21회차). */}
          <CodePickerField label="품목" hideLabel width={200} placeholder="품목" emptyLabel="전체"
                           value={item} onChange={setItem} items={items} />
        </EcCond>
        <EcCond label="재고수량">
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={qtyOne && qtyZero && qtyOther} onChange={(e) => { setQtyOne(e.target.checked); setQtyZero(e.target.checked); setQtyOther(e.target.checked) }} /> 전체
          </label>
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={qtyOne} onChange={(e) => setQtyOne(e.target.checked)} /> 1
          </label>
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={qtyZero} onChange={(e) => setQtyZero(e.target.checked)} /> 0
          </label>
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={qtyOther} onChange={(e) => setQtyOther(e.target.checked)} /> 기타
          </label>
        </EcCond>
        <EcCond label="기타">
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={withHeld} onChange={(e) => setWithHeld(e.target.checked)} />
            사용중단시리얼/로트포함
          </label>
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
            입출고수량0제외
          </label>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={160} emptyLabel="전체"
                           value={warehouse} onChange={setWarehouse}
                           items={warehouses.map((w) => ({ value: w, name: w }))} />
        </EcCond>
      </ul>
      {/* 우리가 더 두는 전표 유형 알약과 입고계 · 출고계 · 기말 — 원본 조건 판 밖이라 조건 목록과 갈라 둔다. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', marginBottom: 10 }}>
        <div className="flex gap-[2px]">
          {(['ALL', 'INBOUND', 'OUTBOUND', 'ADJUST'] as const).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} className="no-ec" style={{
              padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: typeFilter === t ? 'var(--ec-blue)' : '#fff', color: typeFilter === t ? '#fff' : 'var(--ec-text)', fontWeight: typeFilter === t ? 700 : 400,
            }}>{t === 'ALL' ? '전체' : t === 'INBOUND' ? '입고' : t === 'OUTBOUND' ? '출고' : '조정'}</button>
          ))}
        </div>
        <div className="ml-auto text-[12.5px] text-ec-label">
          입고계 <b className="text-ec-blue text-[14px]">{num(totals.inQty)}</b>
          <span className="my-0 mx-[6px] text-ec-off">|</span>
          출고계 <b style={{ color: '#a5561b', fontSize: 14 }}>{num(totals.outQty)}</b>
          {closing != null && (
            <><span className="my-0 mx-[6px] text-ec-off">|</span>기말 <b className="text-ec-navy text-[14px]">{num(closing)}</b></>
          )}
        </div>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {mode === '시리얼/로트별집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th className="w-[170px]">로트No.</th>
              <th>품목</th>
              <th className="w-[80px] text-right">줄 수</th>
              <th className="w-[120px] text-right">입고</th>
              <th className="w-[120px] text-right">출고</th>
              <th className="w-[120px] text-right">기말잔량</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
            ) : byLot.length === 0 ? (
              <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : byLot.map((g, i) => (
              <tr key={g.lotNo}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{g.lotNo}</td>
                <td>{g.itemName}</td>
                <td className="text-right">{num(g.count)}</td>
                <td className="text-right text-ec-blue">{num(g.inQty)}</td>
                <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(g.outQty)}</td>
                <td className="text-right font-bold">{num(g.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th>로트No.</th>
            <th>품목</th>
            <th>일자</th>
            <th className="text-center w-[56px]">유형</th>
            <th className="text-right">입고</th>
            <th className="text-right">출고</th>
            <th className="text-right">잔량</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} className="text-center text-ec-hint p-[20px]">
              {rows.length === 0 ? '로트 이력이 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => {
            const inQ = r.quantityChange >= 0 ? r.quantityChange : 0
            const outQ = r.quantityChange < 0 ? -r.quantityChange : 0
            const c = TYPE_COLOR[r.type]
            return (
              <tr key={r.id}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{r.lotNo}</td>
                <td>{r.itemName}</td>
                <td>{dateText(r.txDate)}</td>
                <td className="text-center">
                  <span style={{ background: c.bg, color: c.fg, padding: '1px 6px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{r.docType ?? r.typeName}</span>
                </td>
                <td style={{ textAlign: 'right', color: inQ ? 'var(--ec-blue)' : 'var(--ec-text-off)', fontWeight: inQ ? 600 : 400 }}>{inQ ? num(inQ) : ''}</td>
                <td style={{ textAlign: 'right', color: outQ ? '#a5561b' : 'var(--ec-text-off)', fontWeight: outQ ? 600 : 400 }}>{outQ ? num(outQ) : ''}</td>
                <td className="text-right font-semibold">{num(r.balanceAfter)}</td>
                <td className="text-ec-hint">{r.note ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      )}
    </EcListShell>
  )
}
