import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { asOf as movesAsOf, movesOf, type Move } from '../../features/fixedasset/movements'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcReportHead, reportDate, reportPeriod } from '../../components/EcReportFrame'
import { useAuth } from '../../features/auth/AuthContext'
import { dateNo } from '../../utils/dateNo'
import { EcDateRange } from '../../components/ui/EcDateInput'

interface Asset {
  id: number; assetNo: string; name: string; assetAccountId: number; assetAccountName: string
  acquisitionDate: string; status: 'IN_USE' | 'DISPOSED'; disposalDate: string | null; remark: string | null
  quantityManaged: boolean; quantity: number
  acquisitionCost: number; movements?: Move[]
}
type Mode = '일반' | '집계표'
interface StockMove { key: string; date: string; no: string; partner: string; text: string; inc: number; dec: number; end: number }

/** 꼬리의 출력한 때 — '2026/10/22  오전 0:56:33'(날짜와 오전 · 오후 사이 두 칸, 원본 꼴) */
const nowText = () => {
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}  ${d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`
}
const qty = (n: number) => (n === 0 ? '' : n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

/**
 * 회계 I &gt; 고정자산 &gt; 고정자산관련출력물 &gt; <b>고정자산수불부</b>(E010618) — 2026-10-03 loginaa 실측(자산 둘, 움직임 없는 판).
 *
 * <p>조건: 구분(<b>일반</b> | 집계표) · 조회일자(구간, 기본 <b>금월(~오늘)</b>, 빠른선택 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 종료일) ·
 * 부서 · 고정자산계정 · 고정자산 · 적용양식 · 양식구분([결재방표시]).
 *
 * <p>일반: 자산마다 한 판(머리에 'B001(PC)'), 열 일자 · 거래처명 · 적요 · 증가수량 · 감소수량 · 기말수량. 첫 줄 [전월이월](세 칸 묶음)에 기간 앞 수량,
 * 기간 안 취득은 증가 [수량] · 처분은 감소 [수량], 끝 [합계]는 증가 · 감소만 더한다. **수량관리 사용 자산만** 나온다(2026-10-21 실측 — 사용안함 자산은 아예 빠짐).
 * 집계표: 고정자산코드 · 고정자산명 · 기초수량 · 증가수량 · 감소수량 · 기말수량, 끝 [합계](두 칸 묶음).
 * 기간 동안 한 번이라도 가지고 있던 자산만 나온다. 거래처명은 자산 취득 · 처분에 거래처가 없어 비고, 적요는 취득 줄에 자산 적요를 쓴다.
 * 부서는 자산에 없다.
 */
/** from 의 하루 앞(yyyy-mm-dd) — 전월이월 수량은 그날까지 남은 것 */
const prevDay = (d: string) => { const t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() - 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` }

export default function FixedAssetStockPage() {
  const init = periodOf('금월(~오늘)')!
  const [mode, setMode] = useState<Mode>('일반')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [account, setAccount] = useState('')
  const [asset, setAsset] = useState('')
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { companyName } = useAuth()

  /* 기간 끝날까지 취득한 자산을 다 받는다 — 기초수량은 기간 앞에 취득한 자산이 만든다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<Asset[]>('/fixed-assets', { params: { to } })
      setAssets(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const books = useMemo(() => assets
    .filter((a) => a.quantityManaged)   // 원본: 수불부는 수량관리 사용 자산만(2026-10-21 실측)
    /* 기간 앞에 남은 것이 있거나 기간 안에 전표가 있는 자산 */
    .filter((a) => movesOf(a).some((m) => m.slipDate >= from && m.slipDate <= to) || movesAsOf(a, prevDay(from)).qty > 0)
    .filter((a) => !account || String(a.assetAccountId) === account)
    .filter((a) => !asset || String(a.id) === asset)
    .sort((x, y) => x.assetNo.localeCompare(y.assetNo))
    .map((a) => {
      /* 증가 · 감소 전표마다 한 줄(원본 10/05 10.00 → 10/15 5.00 · 기말 15.00 → 10/31 감소 6.00 · 기말 9.00) */
      const open = movesAsOf(a, prevDay(from)).qty
      const moves: StockMove[] = []
      let end = open
      for (const m of movesOf(a).filter((x) => x.slipDate >= from && x.slipDate <= to)) {
        const q = Number(m.quantity) || 0
        if (m.kind === 'INCREASE') { end += q; moves.push({ key: `in${m.id}`, date: m.slipDate, no: m.journalDocNo ?? String(m.id), partner: m.partnerName ?? '', text: m.remark ?? '', inc: q, dec: 0, end }) }
        else { end -= q; moves.push({ key: `out${m.id}`, date: m.slipDate, no: m.journalDocNo ?? String(m.id), partner: m.partnerName ?? '', text: m.remark ?? '', inc: 0, dec: q, end }) }
      }
      return { a, open, moves, inc: moves.reduce((s, m) => s + m.inc, 0), dec: moves.reduce((s, m) => s + m.dec, 0), end }
    }), [assets, from, to, account, asset])
  const sum = (k: 'open' | 'inc' | 'dec' | 'end') => books.reduce((s, b) => s + b[k], 0)
  const accounts = useMemo(() => {
    const m = new Map<number, string>()
    assets.forEach((a) => m.set(a.assetAccountId, a.assetAccountName))
    return [...m.entries()].map(([id, name]) => ({ value: String(id), name }))
  }, [assets])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '고정자산수불부', [books.length, mode])

  return (
    <EcListShell
      title="고정자산수불부"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setMode('일반'); setFrom(init.from); setTo(init.to); setAccount(''); setAsset('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-error">{error}</p>}
      <ul className="ec-cond mb-2">
        <EcCond label="구분">
          {(['일반', '집계표'] as Mode[]).map((v) => (
            <label key={v} className="mr-2.5 inline-flex items-center gap-[3px]">
              <input type="radio" name="fa-stock-mode" checked={mode === v} onChange={() => setMode(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="조회일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-1.5">
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="고정자산계정" pick>
          <CodePickerField label="고정자산계정" hideLabel width={180} emptyLabel="전체" value={account} onChange={setAccount} items={accounts} />
        </EcCond>
        <EcCond label="고정자산" pick>
          <CodePickerField label="고정자산" hideLabel width={200} emptyLabel="전체" value={asset} onChange={setAsset}
                           items={assets.map((a) => ({ value: String(a.id), code: a.assetNo, name: a.name }))} />
        </EcCond>
      </ul>

      {mode === '집계표' && <EcReportHead title="고정자산수불부" period={reportPeriod(from, to)} />}
      {loading ? (
        <p className="p-5 text-center text-[var(--ec-text-hint)]">불러오는 중…</p>
      ) : mode === '집계표' ? (
        <table ref={tableRef} className="ec-report w-full text-left">
          <thead>
            <tr>
              <th>고정자산코드</th>
              <th>고정자산명</th>
              <th className="text-right">기초수량</th>
              <th className="text-right">증가수량</th>
              <th className="text-right">감소수량</th>
              <th className="text-right">기말수량</th>
            </tr>
          </thead>
          <tbody>
            {books.length === 0 ? (
              <tr><td colSpan={6} className="p-5 text-center text-[var(--ec-text-hint)]">등록된 데이터가 없습니다.</td></tr>
            ) : (
              <>
                {books.map((b) => (
                  <tr key={b.a.id}>
                    <td>{b.a.assetNo}</td>
                    <td>{b.a.name}</td>
                    <td className="text-right">{qty(b.open)}</td>
                    <td className="text-right">{qty(b.inc)}</td>
                    <td className="text-right">{qty(b.dec)}</td>
                    <td className="text-right">{qty(b.end)}</td>
                  </tr>
                ))}
                <tr className="ec-total">
                  <td colSpan={2} className="text-center">합계</td>
                  <td className="text-right">{qty(sum('open'))}</td>
                  <td className="text-right">{qty(sum('inc'))}</td>
                  <td className="text-right">{qty(sum('dec'))}</td>
                  <td className="text-right">{qty(sum('end'))}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      ) : books.length === 0 ? (
        <p className="p-5 text-center text-[var(--ec-text-hint)]">등록된 데이터가 없습니다.</p>
      ) : (
        <>
          <div className="ec-report-head"><div className="ec-report-title">고정자산수불부</div></div>
          {books.map((b, bi) => (
            <Fragment key={b.a.id}>
              {/* 원본(2026-10-22 실측): 자산마다 한 판 — 머리 '회사명 : … / B001(PC)' + 기간, 꼬리 [P.n] + 출력한 때 */}
              <div className="ec-report-meta">
                <span>회사명 : {companyName ?? ''} / {b.a.assetNo}({b.a.name})</span>
                <span>{reportPeriod(from, to)}</span>
              </div>
              <table ref={bi === 0 ? tableRef : undefined} className="ec-report w-full text-left">
                <thead>
                  <tr>
                    <th className="text-center">일자</th>
                    <th>거래처명</th>
                    <th>적요</th>
                    <th className="text-right">증가수량</th>
                    <th className="text-right">감소수량</th>
                    <th className="text-right">기말수량</th>
                  </tr>
                </thead>
                <tbody>
                  {b.open > 0 && (
                    <tr>
                      <td colSpan={3} className="text-center">전월이월</td>
                      <td className="text-right"></td>
                      <td className="text-right"></td>
                      <td className="text-right">{qty(b.open)}</td>
                    </tr>
                  )}
                  {b.moves.flatMap((m, i) => {
                    const same = b.moves.filter((x) => x.date === m.date)
                    const lastOfDay = same[same.length - 1] === m
                    return [
                      <tr key={m.key}>
                        <td className="text-center">{dateNo(m.date, m.no)}</td>
                        <td>{m.partner}</td>
                        <td>{m.text}</td>
                        <td className="text-right">{qty(m.inc)}</td>
                        <td className="text-right">{qty(m.dec)}</td>
                        <td className="text-right">{qty(m.end)}</td>
                      </tr>,
                      ...(lastOfDay ? [(
                        <tr key={`day${i}`} className="ec-total">
                          <td colSpan={3} className="text-center">{reportDate(m.date)} 계</td>
                          <td className="text-right">{qty(same.reduce((a, x) => a + x.inc, 0))}</td>
                          <td className="text-right">{qty(same.reduce((a, x) => a + x.dec, 0))}</td>
                          <td className="text-right"></td>
                        </tr>
                      )] : []),
                    ]
                  })}
                  <tr className="ec-total">
                    <td colSpan={3} className="text-center">합계</td>
                    <td className="text-right">{qty(b.inc)}</td>
                    <td className="text-right">{qty(b.dec)}</td>
                    <td className="text-right"></td>
                  </tr>
                </tbody>
              </table>
              <div className="ec-report-foot">
                <span>[P.{bi + 1}]</span>
                <span>{nowText()}</span>
              </div>
            </Fragment>
          ))}
        </>
      )}
    </EcListShell>
  )
}
