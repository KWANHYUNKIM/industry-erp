import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { STAGED_PROGRESS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import type { StagedAdjustment, StockAdjustment } from '../../types/api'

const num = (n: number) => (n === 0 ? '' : n.toLocaleString('ko-KR'))
/** 원본 진행단계 알약(2026-10-03 실측): 지금 단계는 파랑 rgb(31,72,212), 나머지는 회색 rgb(134,141,147), 글자 흰색. */
const pill = (on: boolean): React.CSSProperties => ({
  display: 'inline-block', padding: '1px 6px', marginRight: 3, borderRadius: 3, fontSize: 11.5, color: '#fff',
  background: on ? 'rgb(31, 72, 212)' : 'rgb(134, 141, 147)',
})

/**
 * 재고 I &gt; 기타이동 &gt; 재고조정 &gt; <b>재고조정진행단계</b>(C000089) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>금년</b>, 빠른선택 금일 … 전월 · 전월+금월 · 종료일 · 최근40일(+1개월) · 금년) · 창고 · 품목 · 담당자 ·
 * 재고조정여부(전체 | 조정 | 미조정). 열: 실사전표 · 담당자 · 품목 · 진행단계 · 창고명 · 장부수량 · 실사수량 · 차이 · 이력.
 * 버튼줄 간편재고조정 · 단계별재고실사 · 재고조정.
 *
 * <p>우리 단계별재고조정 한 건이 실사 전표 한 장이다. 진행단계는 [실사 · 조정] 알약 둘이고 <b>지금 단계</b>가 파랗다 —
 * 원본에서 조정까지 끝난 줄은 '조정'만 파랬다. 반려된 건은 조정으로 못 가 실사가 마지막이다.
 * 담당자는 실사를 올린 사람(requester)이다. [이력] 열은 전표 변경 이력 창인데 우리는 이력을 따로 남기지 않는다.
 */
/** 단계별재고조정을 반영하면 서버가 적요 앞에 이 말을 붙여 재고조정을 만든다 — 그것은 단계별 줄이 이미 맡는다. */
const STAGED_PREFIX = '단계별조정 '
/** 표 한 줄 — 단계별 실사 한 건이거나, 간편재고조정 한 건. */
interface Row {
  key: string; date: string; no: string; person: string; itemId: number; itemName: string
  warehouseId: number; warehouseName: string; book: number; actual: number; diff: number; applied: boolean
}

export default function StagedProgressPage() {
  const pickers = useCondPickers(['warehouses', 'items', 'employees'])
  const init = periodOf('금년')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouse, setWarehouse] = useState('')
  const [item, setItem] = useState('')
  const [person, setPerson] = useState('')
  const [adjusted, setAdjusted] = useState<'전체' | '조정' | '미조정'>('전체')
  const [staged, setStaged] = useState<StagedAdjustment[]>([])
  const [quick, setQuick] = useState<StockAdjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [r, q] = await Promise.all([
        api.get<StagedAdjustment[]>('/staged-adjustments', { params: { from, to } }),
        api.get<{ rows: StockAdjustment[] }>('/stock-adjustments', { params: { from, to, type: 'ADJUST' } }),
      ])
      setStaged(r.data)
      setQuick(q.data.rows.filter((a) => !(a.reason ?? '').startsWith(STAGED_PREFIX)))
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const empName = useMemo(() => new Map(pickers.employees.map((e) => [(e as { id?: number }).id, e.name])), [pickers.employees])
  /*
   * 원본은 <b>간편재고조정</b>도 이 표에 세운다 — 실사와 조정이 한꺼번에 끝나 '조정' 이 파랗고 장부 · 실사 · 차이가 찍힌다
   * (2026-10-12 실측: C001 본사창고 348 → 350 → '2026/10/12 · (담당자 빈칸) · 포장김치 · 실사 조정 · 본사창고 · 348 · 350 · 2').
   */
  const rows = useMemo<Row[]>(() => [
    ...staged.map((r) => ({ key: `s${r.id}`, date: r.requestDate, no: r.adjustNo, person: r.requester ?? '', itemId: r.itemId,
      itemName: r.itemName, warehouseId: r.warehouseId, warehouseName: r.warehouseName,
      book: Number(r.bookQty), actual: Number(r.actualQty), diff: Number(r.diff), applied: r.status === 'APPLIED' })),
    ...quick.map((a) => ({ key: `a${a.id}`, date: a.adjustDate, no: a.adjustNo,
      person: a.employeeId != null ? empName.get(a.employeeId) ?? '' : '', itemId: a.itemId, itemName: a.itemName,
      warehouseId: a.warehouseId, warehouseName: a.warehouseName,
      book: Number(a.beforeQty), actual: Number(a.afterQty), diff: Number(a.quantityChange), applied: true })),
  ], [staged, quick, empName])
  const shown = useMemo(() => rows
    .filter((r) => r.date >= from && r.date <= to)
    .filter((r) => !warehouse || String(r.warehouseId) === warehouse)
    .filter((r) => !item || String(r.itemId) === item)
    .filter((r) => !person || r.person === person)
    .filter((r) => adjusted === '전체' || (adjusted === '조정') === r.applied)
    .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : b.no.localeCompare(a.no))),
  [rows, from, to, warehouse, item, person, adjusted])
  const people = useMemo(() => [...new Set(rows.map((r) => r.person).filter(Boolean))].sort(), [rows])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '재고조정진행단계', [shown.length])

  return (
    <EcListShell
      title="재고조정진행단계"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setWarehouse(''); setItem(''); setPerson(''); setAdjusted('전체') } },
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
            <EcPeriodPicks labels={STAGED_PROGRESS_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체" value={person} onChange={setPerson}
                           items={people.map((p) => ({ value: p, name: p }))} />
        </EcCond>
        <EcCond label="재고조정여부">
          {(['전체', '조정', '미조정'] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="staged-adjusted" checked={adjusted === v} onChange={() => setAdjusted(v)} /> {v}
            </label>
          ))}
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">실사전표</th>
            <th>담당자</th>
            <th>품목</th>
            <th className="text-center">진행단계</th>
            <th>창고명</th>
            <th className="text-right">장부수량</th>
            <th className="text-right">실사수량</th>
            <th className="text-right">차이</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.key}>
              <td className="text-center">{dateText(r.date)}</td>
              <td>{r.person}</td>
              <td>{r.itemName}</td>
              <td className="text-center whitespace-nowrap">
                <span style={pill(!r.applied)}>실사</span>
                <span style={pill(r.applied)}>조정</span>
              </td>
              <td>{r.warehouseName}</td>
              <td className="text-right">{num(r.book)}</td>
              <td className="text-right">{num(r.actual)}</td>
              <td className="text-right">{num(r.diff)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
