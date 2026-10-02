import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import type { LotTransaction } from '../../types/api'

/** 원본 [유효기한] 후보 — 시리얼/로트No.재고현황과 같다(2026-10-02 실측). */
const EXPIRY_OPTS = ['사용안함', '직접입력', '금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월'] as const

/**
 * 재고 II &gt; 시리얼/로트No. &gt; <b>시리얼/로트No.내역조회</b>(E040618) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일(+1개월)</b>) · 유효기한(기본 [사용안함]) · 거래처그룹1 · 품목.
 * 열: 일자-No. · 품목명[규격] · 시리얼/로트No. · 수량 · 전표구분 · 연결전표-No. · 유효기한. 원본은 줄이 일자 내림차순이다.
 *
 * <p>한 줄은 로트 하나의 움직임(입고 · 출고 · 조정)이다. 전표구분은 그 움직임의 이름이다 — 원본은 '구매' 처럼 근거 전표 종류를 찍는데
 * 우리 로트 움직임은 근거 전표를 물지 않아 [연결전표-No.] 열을 두지 않았고, 같은 까닭으로 [거래처그룹1] 도 걸 거래처가 없다.
 * 수량은 원본처럼 소수 둘째 자리까지(1.00) 찍는다. 로트 움직임에는 그날의 일련번호가 없어 [일자-No.] 는 일자만 찍는다.
 */
export default function LotTxListPage() {
  const pickers = useCondPickers(['items'])
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [expiryOpt, setExpiryOpt] = useState<typeof EXPIRY_OPTS[number]>('사용안함')
  const [expFrom, setExpFrom] = useState('')
  const [expTo, setExpTo] = useState('')
  const [item, setItem] = useState('')
  const [rows, setRows] = useState<LotTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<LotTransaction[]>('/lots/transactions', { params: { from, to } })
      setRows(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const specOf = useMemo(() => new Map(pickers.items.map((i) => [i.value, (i as { sub?: string | null }).sub ?? ''])), [pickers.items])
  const shown = useMemo(() => rows
    .filter((r) => r.txDate >= from && r.txDate <= to)
    .filter((r) => expiryOpt === '사용안함' || (!!r.expireDate && (!expFrom || r.expireDate >= expFrom) && (!expTo || r.expireDate <= expTo)))
    .filter((r) => !item || String(r.itemId) === item)
    .sort((a, b) => (a.txDate > b.txDate ? -1 : a.txDate < b.txDate ? 1 : b.id - a.id)),
  [rows, from, to, expiryOpt, expFrom, expTo, item])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '시리얼/로트No.내역조회', [shown.length])

  return (
    <EcListShell
      title="시리얼/로트No.내역조회"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setExpiryOpt('사용안함'); setExpFrom(''); setExpTo(''); setItem('') } },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
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
            <input type="date" className="ec-input" value={expFrom} onChange={(e) => { setExpFrom(e.target.value); setExpiryOpt('직접입력') }} style={{ width: 145, marginLeft: 6 }} />
            <span className="my-0 mx-[4px]">~</span>
            <input type="date" className="ec-input" value={expTo} onChange={(e) => { setExpTo(e.target.value); setExpiryOpt('직접입력') }} style={{ width: 145 }} />
          </>)}
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="text-center">일자-No.</th>
            <th>품목명[규격]</th>
            <th>시리얼/로트No.</th>
            <th className="text-right">수량</th>
            <th className="text-center">전표구분</th>
            <th className="text-center">유효기한</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const spec = specOf.get(String(r.itemId))
            return (
              <tr key={r.id}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td className="text-center">{dateText(r.txDate)}</td>
                <td>{r.itemName}{spec ? ` [${spec}]` : ''}</td>
                <td>{r.lotNo}</td>
                <td className="text-right">{Number(r.quantityChange).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="text-center">{r.typeName}</td>
                <td className="text-center">{r.expireDate ? dateText(r.expireDate) : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
