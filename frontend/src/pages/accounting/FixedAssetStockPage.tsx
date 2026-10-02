import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcReportHead, reportPeriod } from '../../components/EcReportFrame'

interface Asset {
  id: number; assetNo: string; name: string; assetAccountId: number; assetAccountName: string
  acquisitionDate: string; status: 'IN_USE' | 'DISPOSED'; disposalDate: string | null; remark: string | null
}
type Mode = '일반' | '집계표'
interface Move { key: string; date: string; text: string; inc: number; dec: number; end: number }

const qty = (n: number) => (n === 0 ? '' : n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

/**
 * 회계 I &gt; 고정자산 &gt; 고정자산관련출력물 &gt; <b>고정자산수불부</b>(E010618) — 2026-10-03 loginaa 실측(자산 둘, 움직임 없는 판).
 *
 * <p>조건: 구분(<b>일반</b> | 집계표) · 조회일자(구간, 기본 <b>금월(~오늘)</b>, 빠른선택 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 종료일) ·
 * 부서 · 고정자산계정 · 고정자산 · 적용양식 · 양식구분([결재방표시]).
 *
 * <p>일반: 자산마다 한 판(머리에 'B001(PC)'), 열 일자 · 거래처명 · 적요 · 증가수량 · 감소수량 · 기말수량. 첫 줄 [전월이월](세 칸 묶음)에 기간 앞 수량,
 * 기간 안 취득은 증가 1 · 처분은 감소 1, 끝 [합계]는 증가 · 감소만 더한다. 원본이 자산 하나를 수량 1.00 으로 센다.
 * 집계표: 고정자산코드 · 고정자산명 · 기초수량 · 증가수량 · 감소수량 · 기말수량, 끝 [합계](두 칸 묶음).
 * 기간 동안 한 번이라도 가지고 있던 자산만 나온다. 거래처명은 자산 취득 · 처분에 거래처가 없어 비고, 적요는 취득 줄에 자산 적요를 쓴다.
 * 부서는 자산에 없다.
 */
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
    .filter((a) => a.acquisitionDate <= to && (!a.disposalDate || a.disposalDate >= from))
    .filter((a) => !account || String(a.assetAccountId) === account)
    .filter((a) => !asset || String(a.id) === asset)
    .sort((x, y) => x.assetNo.localeCompare(y.assetNo))
    .map((a) => {
      const open = a.acquisitionDate < from ? 1 : 0
      const moves: Move[] = []
      let end = open
      if (a.acquisitionDate >= from) { end += 1; moves.push({ key: 'in', date: a.acquisitionDate, text: a.remark ?? '', inc: 1, dec: 0, end }) }
      if (a.disposalDate && a.disposalDate <= to) { end -= 1; moves.push({ key: 'out', date: a.disposalDate, text: '', inc: 0, dec: 1, end }) }
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
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mx-1">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
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

      <EcReportHead title="고정자산수불부" period={reportPeriod(from, to)} />
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
      ) : books.map((b) => (
        <Fragment key={b.a.id}>
          <p className="mt-3 mb-1 font-bold">{b.a.assetNo}({b.a.name})</p>
          <table ref={tableRef} className="ec-report w-full text-left">
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
              <tr>
                <td colSpan={3} className="text-center">전월이월</td>
                <td className="text-right"></td>
                <td className="text-right"></td>
                <td className="text-right">{qty(b.open)}</td>
              </tr>
              {b.moves.map((m) => (
                <tr key={m.key}>
                  <td className="text-center">{m.date.replace(/-/g, '/')}</td>
                  <td></td>
                  <td>{m.text}</td>
                  <td className="text-right">{qty(m.inc)}</td>
                  <td className="text-right">{qty(m.dec)}</td>
                  <td className="text-right">{qty(m.end)}</td>
                </tr>
              ))}
              <tr className="ec-total">
                <td colSpan={3} className="text-center">합계</td>
                <td className="text-right">{qty(b.inc)}</td>
                <td className="text-right">{qty(b.dec)}</td>
                <td className="text-right"></td>
              </tr>
            </tbody>
          </table>
        </Fragment>
      ))}
    </EcListShell>
  )
}
