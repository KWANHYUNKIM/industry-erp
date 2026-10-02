import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { STAGED_PROGRESS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import type { StagedAdjustment } from '../../types/api'

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
export default function StagedProgressPage() {
  const pickers = useCondPickers(['warehouses', 'items'])
  const init = periodOf('금년')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouse, setWarehouse] = useState('')
  const [item, setItem] = useState('')
  const [person, setPerson] = useState('')
  const [adjusted, setAdjusted] = useState<'전체' | '조정' | '미조정'>('전체')
  const [rows, setRows] = useState<StagedAdjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<StagedAdjustment[]>('/staged-adjustments', { params: { from, to } })
      setRows(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const shown = useMemo(() => rows
    .filter((r) => r.requestDate >= from && r.requestDate <= to)
    .filter((r) => !warehouse || String(r.warehouseId) === warehouse)
    .filter((r) => !item || String(r.itemId) === item)
    .filter((r) => !person || (r.requester ?? '') === person)
    .filter((r) => adjusted === '전체' || (adjusted === '조정') === (r.status === 'APPLIED'))
    .sort((a, b) => (a.requestDate > b.requestDate ? -1 : a.requestDate < b.requestDate ? 1 : b.adjustNo.localeCompare(a.adjustNo))),
  [rows, from, to, warehouse, item, person, adjusted])
  const people = useMemo(() => [...new Set(rows.map((r) => r.requester).filter(Boolean) as string[])].sort(), [rows])
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
      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
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
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="staged-adjusted" checked={adjusted === v} onChange={() => setAdjusted(v)} /> {v}
            </label>
          ))}
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>실사전표</th>
            <th>담당자</th>
            <th>품목</th>
            <th style={{ textAlign: 'center' }}>진행단계</th>
            <th>창고명</th>
            <th style={{ textAlign: 'right' }}>장부수량</th>
            <th style={{ textAlign: 'right' }}>실사수량</th>
            <th style={{ textAlign: 'right' }}>차이</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center' }}>{dateText(r.requestDate)}</td>
              <td>{r.requester ?? ''}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                <span style={pill(r.status !== 'APPLIED')}>실사</span>
                <span style={pill(r.status === 'APPLIED')}>조정</span>
              </td>
              <td>{r.warehouseName}</td>
              <td style={{ textAlign: 'right' }}>{num(Number(r.bookQty))}</td>
              <td style={{ textAlign: 'right' }}>{num(Number(r.actualQty))}</td>
              <td style={{ textAlign: 'right' }}>{num(Number(r.diff))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
