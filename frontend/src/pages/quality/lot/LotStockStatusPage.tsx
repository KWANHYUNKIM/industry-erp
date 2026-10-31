import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../../components/EcListShell'
import { EcCond } from '../../../components/EcStatusPanel'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import EcPeriodPicks, { ymd, INQUIRY_PICKS, periodOf } from '../../../components/EcPeriodPicks'
import Modal from '../../../components/Modal'
import { EcReportHead, EcReportFoot, reportDate, reportPeriod } from '../../../components/EcReportFrame'
import { api, extractErrorMessage } from '../../../api/client'
import type { Lot, LotTransaction } from '../../../types/api'
import { dateText } from '../../../utils/dateText'
import { dateNo } from '../../../utils/dateNo'
import { expiryDirectRange } from '../../../utils/expiryRange'
import EcDateInput, { EcDateRange } from '../../../components/ui/EcDateInput'

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
/* 원본 격자의 수량은 소수 둘째 자리까지 찍는다(-3.00 · 1.00 · 합계 325.00, 2026-10-13 실측). */
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 원본 격자 한 줄 — <b>품목 × 시리얼/로트No.</b> 하나. 우리 로트는 창고마다 따로라 창고를 넘어 더한다. */
type Row = { key: string; itemId: number; itemCode: string; itemName: string; spec: string | null
  lotNo: string; expireDate: string | null; stockQty: number }

/**
 * 원본에서 시리얼/로트No. 를 누르면 뜨는 <b>시리얼/로트No.재고수불부</b> 창(2026-10-13 실측) —
 * 그 품목 · 그 로트만, 기간은 기준일자 석 달 전 달 초하루부터 기준일자까지(기준일자 2026/10/13 → 2026/07/01 ~ 2026/10/13).
 * 머리는 '회사명 : … / 품목명', 줄은 수불부와 같다: [전월이월] → 움직인 줄 → '○○ 계' → 합계.
 */
function LotLedgerModal({ row, asOf, onClose }: { row: Row; asOf: string; onClose: () => void }) {
  const [moves, setMoves] = useState<LotTransaction[]>([])
  const [error, setError] = useState('')
  const from = useMemo(() => {
    const [y, m] = asOf.split('-').map(Number)
    const d = new Date(y, m - 1 - 3, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [asOf])
  useEffect(() => {
    api.get<LotTransaction[]>('/lots/transactions', { params: { to: asOf || undefined } })
      .then((res) => setMoves(res.data.filter((t) => t.itemId === row.itemId && t.lotNo === row.lotNo)
        .sort((x, y) => (x.txDate < y.txDate ? -1 : x.txDate > y.txDate ? 1 : x.id - y.id))))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [row, asOf])
  const opening = moves.filter((t) => t.txDate < from).reduce((a, t) => a + Number(t.quantityChange), 0)
  const inside = moves.filter((t) => t.txDate >= from)
  const inQty = inside.reduce((a, t) => a + Math.max(Number(t.quantityChange), 0), 0)
  const outQty = inside.reduce((a, t) => a + Math.max(-Number(t.quantityChange), 0), 0)
  let bal = opening
  return (
    <Modal open title="시리얼/로트No.재고수불부" onClose={onClose} width={720} error={error}>
      <EcReportHead title="시리얼/로트No.재고수불부" period={reportPeriod(from, asOf)} sub={row.itemName} />
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
          {opening !== 0 && (
            <tr>
              <td colSpan={8} className="text-center font-bold text-ec-danger">전월이월</td>
              <td className="text-right font-bold">{qty2(opening)}</td>
              <td></td>
            </tr>
          )}
          {inside.map((t) => {
            const q = Number(t.quantityChange)
            bal += q
            return (
              <tr key={t.id}>
                <td>{t.itemName}</td>
                <td>{t.lotNo}</td>
                <td className="text-center">{t.expireDate ? dateText(t.expireDate) : ''}</td>
                <td className="text-center">{t.docType ?? t.typeName}</td>
                <td>{t.partnerName ?? ''}</td>
                <td>{t.docType ? '' : (t.note ?? '')}</td>
                <td className="text-right">{q > 0 ? qty2(q) : ''}</td>
                <td className="text-right">{q < 0 ? qty2(-q) : ''}</td>
                <td className="text-right">{bal ? qty2(bal) : ''}</td>
                <td className="text-center ec-link">{t.sourceNo ? dateNo(t.txDate, t.sourceNo) : ''}</td>
              </tr>)
          })}
          <tr className="ec-total">
            <td colSpan={6} className="text-center">{row.lotNo} 계</td>
            <td className="text-right">{inQty ? qty2(inQty) : ''}</td>
            <td className="text-right">{outQty ? qty2(outQty) : ''}</td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6} className="text-center">합계</td>
            <td className="text-right">{inQty ? qty2(inQty) : ''}</td>
            <td className="text-right">{outQty ? qty2(outQty) : ''}</td>
            <td className="text-right">{opening + inQty - outQty ? qty2(opening + inQty - outQty) : ''}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <EcReportFoot />
      <div className="flex gap-[4px] mt-[8px]">
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

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
   * 원본 [기타]의 <b>[사용중단시리얼/로트포함]</b> — <b>켜진 채로</b> 열린다(2026-10-02 loginaa 실측). 예전 주석은 '꺼진 채로' 라
   * 적었는데 이날 직접 읽은 체크 상태가 켜짐이었다 — 더 새로 잰 값을 따른다.
   * 사용중단은 시리얼/로트No.등록의 [사용중단](lots.use_yn)이다 — 끄면 사용중단 로트를 뺀다(예전엔 보류(held)로 걸렀다).
   */
  const [withHeld, setWithHeld] = useState(true)
  /*
   * 원본 [유효기한] — 사용안함(기본) · 직접입력 · 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월(2026-10-02 실측).
   * 고르면 유효기한이 그 구간 안인 로트만 본다. 유효기한이 없는 로트는 걸리지 않는다.
   */
  const EXPIRY_OPTS = ['사용안함', '직접입력', '금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월'] as const
  const [expiryOpt, setExpiryOpt] = useState<typeof EXPIRY_OPTS[number]>('사용안함')
  const [expFrom, setExpFrom] = useState('')
  const [expTo, setExpTo] = useState('')
  /* 원본 [재고수량] — 전체 · 1 · 기타 세 체크(모두 켜짐). 1 은 잔량이 꼭 1 인 것(시리얼 한 개), 기타는 그 밖. */
  const [qtyOne, setQtyOne] = useState(true)
  const [qtyOther, setQtyOther] = useState(true)

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
      if (!withHeld && !l.useYn) return false
      if (expiryOpt !== '사용안함' && (!l.expireDate || (expFrom && l.expireDate < expFrom) || (expTo && l.expireDate > expTo))) return false
      /* 원본은 잔량 0 인 로트를 아예 안 찍는다 — [재고수량] 셋을 다 켜도 0.00 줄이 없다(2026-10-13 실측, 343줄 중 0). */
      if (l.stockQty === 0) return false
      if (l.stockQty === 1 ? !qtyOne : !qtyOther) return false
      if (lotNo && l.lotNo !== lotNo) return false
      if (warehouse && l.warehouseName !== warehouse) return false
      if (item && l.itemName !== item) return false
      if (kw && !l.lotNo.includes(kw) && !l.itemName.includes(kw)) return false
      return true
    })
  }, [lots, withHeld, lotNo, warehouse, item, keyword, expiryOpt, expFrom, expTo, qtyOne, qtyOther])

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


  /**
   * 원본 격자(2026-10-13 실측): 품목코드 · 품목명 · 규격 · 시리얼/로트No. · 유효기한 · 재고수량, 끝에 합계.
   * 줄 차례는 시리얼/로트No. → 품목코드('(01)…' 이 'BEN_0001' 보다 앞, 같은 로트면 G002 → H001).
   */
  const rows = useMemo(() => {
    const m = new Map<string, Row>()
    for (const l of shown) {
      const key = `${l.itemId}|${l.lotNo}`
      const cur = m.get(key)
      if (cur) cur.stockQty += l.stockQty
      else m.set(key, { key, itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName, spec: l.spec,
        lotNo: l.lotNo, expireDate: l.expireDate, stockQty: l.stockQty })
    }
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
    return [...m.values()].filter((r) => r.stockQty !== 0)
      .sort((a, b) => cmp(a.lotNo, b.lotNo) || cmp(a.itemCode, b.itemCode))
  }, [shown])
  const [ledgerOf, setLedgerOf] = useState<Row | null>(null)

  return (
    <EcListShell
      title="시리얼/로트No.재고현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: () => load() }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

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
          <div className="flex items-center gap-[6px] flex-wrap">
            <EcDateInput className="ec-input" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            {/* 한 날짜라 빠른선택은 끝날(to)만 받는다. */}
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={asOf}
                           onPick={(r) => setAsOf(r.to)} />
          </div>
        </EcCond>
        <EcCond label="유효기한">
          <select className="ec-input" value={expiryOpt} style={{ width: 120 }}
                  onChange={(e) => {
                    const v = e.target.value as typeof EXPIRY_OPTS[number]
                    setExpiryOpt(v)
                    const r = v === '사용안함' || v === '직접입력' ? null : periodOf(v)
                    if (r) { setExpFrom(r.from); setExpTo(r.to) }
                    /* 원본 직접입력 — 오늘 ~ 5년 뒤 하루 전(2026-10-04 실측). */
                    if (v === '직접입력') { const d = expiryDirectRange(periodOf('금일')!.from); setExpFrom(d.from); setExpTo(d.to) }
                    if (v === '사용안함') { setExpFrom(''); setExpTo('') }
                  }}>
            {EXPIRY_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {expiryOpt !== '사용안함' && (<>
            <EcDateRange from={{ className: "ec-input", value: expFrom, onChange: (e) => { setExpFrom(e.target.value); setExpiryOpt('직접입력') } }} to={{ className: "ec-input", value: expTo, onChange: (e) => { setExpTo(e.target.value); setExpiryOpt('직접입력') } }} />
          </>)}
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
        <EcCond label="재고수량">
          <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
            <input type="checkbox" checked={qtyOne && qtyOther} onChange={(e) => { setQtyOne(e.target.checked); setQtyOther(e.target.checked) }} /> 전체
          </label>
          <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
            <input type="checkbox" checked={qtyOne} onChange={(e) => setQtyOne(e.target.checked)} /> 1
          </label>
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={qtyOther} onChange={(e) => setQtyOther(e.target.checked)} /> 기타
          </label>
        </EcCond>
        {/*
          원본 [기타]는 [결재방표시]·[사용중단시리얼/로트포함] 둘이다. 결재방은 인쇄물에
          결재란을 찍는 것이라 인쇄 판을 건드려야 해서 아직 없다.
        */}
        <EcCond label="기타">
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={withHeld} onChange={(e) => setWithHeld(e.target.checked)} />
            사용중단시리얼/로트포함
          </label>
        </EcCond>
      </ul>

      {mode === '시리얼/로트No.(창고별)' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th>창고</th>
              <th className="w-[110px] text-right">로트 수</th>
              <th className="w-[140px] text-right">재고수량</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="ec-empty">불러오는 중…</td></tr>
            ) : grouped.length === 0 ? (
              <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : grouped.map((g, i) => (
              <tr key={g.warehouse}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{g.warehouse}</td>
                <td className="text-right">{num(g.lotCount)}</td>
                <td className="text-right">{num(g.stockQty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (<>
        <EcReportHead title="시리얼/로트No.재고현황" period={reportDate(asOf)} />
        <table className="ec-report w-full text-left">
          <thead>
            <tr>
              <th className="w-[119px]">품목코드</th>
              <th>품목명</th>
              <th className="w-[90px]">규격</th>
              <th className="w-[130px]">시리얼/로트No.</th>
              <th className="w-[80px] text-center">유효기한</th>
              <th className="w-[80px] text-right">재고수량</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.key}>
                <td>{r.itemCode}</td>
                <td>{r.itemName}</td>
                <td>{r.spec ?? ''}</td>
                <td>
                  <button type="button" className="ec-link" onClick={() => setLedgerOf(r)}>{r.lotNo}</button>
                </td>
                <td className="text-center">{r.expireDate ? reportDate(r.expireDate) : ''}</td>
                <td className="text-right">{qty2(r.stockQty)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5} className="text-center">합계</td>
                <td className="text-right">{qty2(rows.reduce((a, r) => a + r.stockQty, 0))}</td>
              </tr>
            </tfoot>
          )}
        </table>
        <EcReportFoot />
        {ledgerOf && <LotLedgerModal row={ledgerOf} asOf={asOf} onClose={() => setLedgerOf(null)} />}
      </>
      )}
    </EcListShell>
  )
}
