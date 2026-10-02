import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { STOCKTAKE_LIST_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import type { StagedAdjustment, StockAdjustment } from '../../types/api'

interface AdjustmentList { rows: StockAdjustment[]; totalRows: number; truncated: boolean }
/** 단계별재고조정을 반영하면 서버가 적요 앞에 이 말 + 실사번호를 붙여 재고조정(ADJUST)을 만든다(StagedStockAdjustmentService.apply). */
const STAGED_PREFIX = '단계별조정 '

interface Line {
  key: string; sort: '간편' | '단계별'; date: string; no: string
  warehouseId: number; warehouseName: string; person: string
  itemId: number; itemName: string; spec: string | null; qty: number; slip: string
}

/**
 * 재고 I &gt; 기타이동 &gt; 재고조정 &gt; <b>재고실사조회</b>(E040613) — 2026-10-03 loginaa 실측(빈 판).
 *
 * <p>조건: 구분(<b>전체</b> | 간편 | 단계별) · 기준일자(구간, 기본 <b>차월</b> — 다음 달 1일 ~ 말일, 빠른선택 끝에 전월+금월 · 종료일 · 차월) ·
 * 창고 · 품목 · 담당자. 열: 구분 · 입력일자 · 창고명 · 담당자 · 품목명[규격명] · 수량 · 조정전표.
 *
 * <p>간편 = 재고실사 화면에서 실사수량을 넣어 <b>바로</b> 맞춘 재고조정 — 우리는 실사를 따로 적지 않고 그 조정이 곧 실사 기록이다
 * (수량은 맞춘 뒤 수량, 조정전표는 그 조정 자신). 단계별 = 단계별재고조정의 실사 요청 — 수량은 실사수량, 조정전표는 반영할 때
 * 생긴 재고조정(적요 '단계별조정 {실사번호}')이고 아직 안 반영했으면 비어 있다.
 * 담당자는 간편이 조정의 작성자, 단계별이 요청자다.
 */
export default function StocktakeListPage() {
  const pickers = useCondPickers(['warehouses', 'items'])
  const init = periodOf('차월')!
  const [sort, setSort] = useState<'전체' | '간편' | '단계별'>('전체')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouse, setWarehouse] = useState('')
  const [item, setItem] = useState('')
  const [person, setPerson] = useState('')
  const [adjusts, setAdjusts] = useState<StockAdjustment[]>([])
  const [staged, setStaged] = useState<StagedAdjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 단계별의 조정전표는 실사일 뒤에 생길 수 있어 조정은 실사 기간 끝 이후까지 넉넉히 받는다(끝날을 비운다). */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const [a, s] = await Promise.all([
        api.get<AdjustmentList>('/stock-adjustments', { params: { from, type: 'ADJUST' } }),
        api.get<StagedAdjustment[]>('/staged-adjustments', { params: { from, to } }),
      ])
      setAdjusts(a.data.rows)
      setStaged(s.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const lines = useMemo(() => {
    const slipOf = new Map<string, StockAdjustment>()
    for (const a of adjusts) {
      const reason = a.reason ?? ''
      if (reason.startsWith(STAGED_PREFIX)) slipOf.set(reason.slice(STAGED_PREFIX.length).split(' ')[0], a)
    }
    const out: Line[] = []
    for (const a of adjusts) {
      if (a.type !== 'ADJUST' || (a.reason ?? '').startsWith(STAGED_PREFIX)) continue
      out.push({ key: `a${a.id}`, sort: '간편', date: a.adjustDate, no: a.adjustNo, warehouseId: a.warehouseId, warehouseName: a.warehouseName,
        person: a.createdBy ?? '', itemId: a.itemId, itemName: a.itemName, spec: a.spec ?? null, qty: Number(a.afterQty),
        slip: `${dateText(a.adjustDate)} ${a.adjustNo}` })
    }
    for (const s of staged) {
      const slip = slipOf.get(s.adjustNo)
      out.push({ key: `s${s.id}`, sort: '단계별', date: s.requestDate, no: s.adjustNo, warehouseId: s.warehouseId, warehouseName: s.warehouseName,
        person: s.requester ?? '', itemId: s.itemId, itemName: s.itemName, spec: null, qty: Number(s.actualQty),
        slip: slip ? `${dateText(slip.adjustDate)} ${slip.adjustNo}` : '' })
    }
    return out
      .filter((l) => l.date >= from && l.date <= to)
      .filter((l) => sort === '전체' || l.sort === sort)
      .filter((l) => !warehouse || String(l.warehouseId) === warehouse)
      .filter((l) => !item || String(l.itemId) === item)
      .filter((l) => !person || l.person === person)
      .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : b.no.localeCompare(a.no)))
  }, [adjusts, staged, from, to, sort, warehouse, item, person])
  const people = useMemo(() => [...new Set([
    ...adjusts.map((a) => a.createdBy), ...staged.map((s) => s.requester),
  ].filter(Boolean) as string[])].sort(), [adjusts, staged])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '재고실사조회', [lines.length])

  return (
    <EcListShell
      title="재고실사조회"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setSort('전체'); setFrom(init.from); setTo(init.to); setWarehouse(''); setItem(''); setPerson('') } },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          {(['전체', '간편', '단계별'] as const).map((v) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="stocktake-sort" checked={sort === v} onChange={() => setSort(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={STOCKTAKE_LIST_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
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
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ textAlign: 'center' }}>구분</th>
            <th style={{ textAlign: 'center' }}>입력일자</th>
            <th>창고명</th>
            <th>담당자</th>
            <th>품목명[규격명]</th>
            <th style={{ textAlign: 'right' }}>수 량</th>
            <th style={{ textAlign: 'center' }}>조정전표</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : lines.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : lines.map((l, i) => (
            <tr key={l.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ textAlign: 'center' }}>{l.sort}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{dateText(l.date)} {l.no}</td>
              <td>{l.warehouseName}</td>
              <td>{l.person}</td>
              <td>{l.itemName}{l.spec ? `[${l.spec}]` : ''}</td>
              <td style={{ textAlign: 'right' }}>{l.qty.toLocaleString('ko-KR')}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{l.slip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
