import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { LotTransaction } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { dateText } from '../../utils/dateText'
import { dateNo } from '../../utils/dateNo'
import { EcReportHead, EcReportFoot, reportPeriod } from '../../components/EcReportFrame'
import EcPeriodPicks, { periodOf, LOT_LEDGER_PICKS } from '../../components/EcPeriodPicks'

/**
 * 재고 II &gt; 시리얼/로트No. &gt; <b>시리얼/로트No.재고수불부</b>(E040620) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>[공통] 표는 시리얼/로트 하나가 한 묶음이다: (기초가 있으면) <b>전월이월</b> 줄 → 움직인 줄
 * (품목명 · 시리얼/로트No. · 유효기한 · 전표구분 · 거래처명 · 적요 · 입고수량 · 출고수량 · 재고수량 · 연결전표) →
 * <b>'○○ 계'</b> 줄(입고 · 출고 합), 끝에 <b>합계</b>(입고 · 출고 합과 기말 재고 합). 재고수량은 이월에서 이어 가는 잔량이라
 * 판 것만 있으면 -1.00 처럼 음수로 찍힌다. 기간에 움직임이 없어도 이월이 있으면 이월 줄과 계 줄만 선다.
 * 예전엔 줄을 한 판에 늘어놓고 저장할 때의 잔량(balanceAfter)을 찍어, 전표를 고치고 지우면 잔량이 어긋났다.
 */
const num = (n: number) => n.toLocaleString('ko-KR')
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
      /* 이월을 셈하려고 시작일 앞의 움직임까지 받는다 — 기간은 화면이 가른다(끝일만 서버에 보낸다). */
      const res = await api.get<LotTransaction[]>('/lots/transactions', {
        params: { to: to || undefined },
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

  /**
   * 시리얼/로트마다 한 묶음. 이월 = 시작일 앞 움직임의 합, 기말 = 이월 + 기간 안 움직임의 합.
   * [재고수량] · [사용중단포함] · 유효기한 · 창고 · 품목 · 시리얼/로트No. 는 묶음째 거르고, [입출고수량0제외] 는 줄을 뺀다.
   */
  const groups = useMemo(() => {
    const kw = keyword.trim()
    const by = new Map<string, { head: LotTransaction; opening: number; moves: LotTransaction[] }>()
    for (const r of [...rows].sort((x, y) => (x.txDate < y.txDate ? -1 : x.txDate > y.txDate ? 1 : x.id - y.id))) {
      if (from && r.txDate > to) continue
      const g = by.get(r.lotNo) ?? { head: r, opening: 0, moves: [] as LotTransaction[] }
      if (from && r.txDate < from) g.opening += Number(r.quantityChange)
      else g.moves.push(r)
      by.set(r.lotNo, g)
    }
    return [...by.values()]
      .map((g) => {
        const inQty = g.moves.reduce((a, r) => a + Math.max(Number(r.quantityChange), 0), 0)
        const outQty = g.moves.reduce((a, r) => a + Math.max(-Number(r.quantityChange), 0), 0)
        return { ...g, inQty, outQty, closing: g.opening + inQty - outQty }
      })
      .filter((g) => g.opening !== 0 || g.moves.length > 0)
      .filter((g) => {
        const r = g.head
        if (expiryOpt !== '사용안함' && (!r.expireDate || (expFrom && r.expireDate < expFrom) || (expTo && r.expireDate > expTo))) return false
        if (g.closing === 1 ? !qtyOne : g.closing === 0 ? !qtyZero : !qtyOther) return false
        /* [포함] 이라 이름 붙은 것은 기본이 '안 넣음' 이다 — 켜야 보인다. */
        if (!withHeld && r.held) return false
        if (warehouse && r.warehouseName !== warehouse) return false
        if (item && String(r.itemId) !== item) return false
        if (lotNo && r.lotNo !== lotNo) return false
        if (kw && !r.lotNo.includes(kw) && !r.itemName.includes(kw)) return false
        return true
      })
      .map((g) => ({ ...g, moves: hideZero ? g.moves.filter((r) => Number(r.quantityChange) !== 0) : g.moves }))
      .sort((x, y) => x.head.lotNo.localeCompare(y.head.lotNo, 'ko'))
  }, [rows, from, to, withHeld, hideZero, warehouse, item, lotNo, keyword, expiryOpt, expFrom, expTo, qtyOne, qtyZero, qtyOther])

  const totals = useMemo(() => groups.reduce((s, g) => ({
    inQty: s.inQty + g.inQty, outQty: s.outQty + g.outQty, closing: s.closing + g.closing,
  }), { inQty: 0, outQty: 0, closing: 0 }), [groups])

  return (
    <EcListShell
      /* 원본 화면 이름 그대로다(2026-09-01 E040620 실측) — 우리는 [로트 수불부] 라고만 불렀다. */
      title="시리얼/로트No.재고수불부"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '검색(F8)', primary: true, onClick: load }, { label: '인쇄' }, { label: 'Excel' }]}
    >
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
            ) : groups.length === 0 ? (
              <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : groups.map((g, i) => (
              <tr key={g.head.lotNo}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{g.head.lotNo}</td>
                <td>{g.head.itemName}</td>
                <td className="text-right">{num(g.moves.length)}</td>
                <td className="text-right">{num(g.inQty)}</td>
                <td className="text-right">{num(g.outQty)}</td>
                <td className="text-right font-bold">{num(g.closing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
      <>
      <EcReportHead title="시리얼/로트No.재고수불부" period={reportPeriod(from, to)} />
      <table className="ec-report w-full text-left">
        <thead>
          <tr>
            <th>품목명</th>
            <th>시리얼/로트No.</th>
            <th className="text-center">유효기한</th>
            <th className="text-center">전표구분</th>
            <th>거래처명</th>
            <th>적요</th>
            <th className="text-right">입고수량</th>
            <th className="text-right">출고수량</th>
            <th className="text-right">재고수량</th>
            <th className="text-center">연결전표</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="ec-empty">불러오는 중…</td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : groups.flatMap((g) => {
            let bal = g.opening
            const out = []
            if (g.opening !== 0) out.push(
              <tr key={`${g.head.lotNo}-open`}>
                <td colSpan={8} className="text-center font-bold text-ec-danger">전월이월</td>
                <td className="text-right font-bold">{qty2(g.opening)}</td>
                <td></td>
              </tr>)
            for (const r of g.moves) {
              const q = Number(r.quantityChange)
              bal += q
              out.push(
                <tr key={r.id}>
                  <td>{r.itemName}</td>
                  <td>{r.lotNo}</td>
                  <td className="text-center">{r.expireDate ? dateText(r.expireDate) : ''}</td>
                  <td className="text-center">{r.docType ?? r.typeName}</td>
                  <td>{r.partnerName ?? ''}</td>
                  <td>{r.docType ? '' : (r.note ?? '')}</td>
                  <td className="text-right">{q > 0 ? qty2(q) : ''}</td>
                  <td className="text-right">{q < 0 ? qty2(-q) : ''}</td>
                  <td className="text-right">{qty2(bal)}</td>
                  <td className="text-center ec-link">{r.sourceNo ? dateNo(r.txDate, r.sourceNo) : ''}</td>
                </tr>)
            }
            out.push(
              <tr key={`${g.head.lotNo}-sum`} className="ec-total">
                <td colSpan={6} className="text-center">{g.head.lotNo} 계</td>
                <td className="text-right">{g.inQty ? qty2(g.inQty) : ''}</td>
                <td className="text-right">{g.outQty ? qty2(g.outQty) : ''}</td>
                <td></td>
                <td></td>
              </tr>)
            return out
          })}
        </tbody>
        {groups.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={6} className="text-center">합계</td>
              <td className="text-right">{qty2(totals.inQty)}</td>
              <td className="text-right">{qty2(totals.outQty)}</td>
              <td className="text-right">{qty2(totals.closing)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
      <EcReportFoot />
      </>
      )}
    </EcListShell>
  )
}
