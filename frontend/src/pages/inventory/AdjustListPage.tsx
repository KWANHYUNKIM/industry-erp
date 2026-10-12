import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import SimpleAdjustDialog from '../../features/stockadjust/components/SimpleAdjustDialog'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { shortDateNo } from '../../utils/dateNo'
import { useNavigate } from 'react-router-dom'
import type { StockAdjustment } from '../../types/api'

interface AdjustmentList { rows: StockAdjustment[]; totalRows: number; truncated: boolean }

/** 단계별재고조정을 반영하면 서버가 적요 앞에 이 말을 붙여 재고조정(ADJUST)을 만든다(StagedStockAdjustmentService.apply). */
const STAGED_PREFIX = '단계별조정 '
const sortOf = (r: StockAdjustment) => ((r.reason ?? '').startsWith(STAGED_PREFIX) ? '단계별' : '간편')

/**
 * 재고 I &gt; 기타이동 &gt; 재고조정 &gt; <b>재고조정조회</b>(E040614) — 2026-10-03 loginaa 실측(빈 판).
 *
 * <p>조건: 구분(<b>전체</b> | 간편 | 단계별) · 기준일자(구간, 기본 최근30일(+1개월)) · 창고 · 품목 · 담당자 · 최종수정자.
 * 열: 구분 · 입력일자 · 창고 · 품목 · 수량 · 담당자. 버튼줄 간편재고조정 · 단계별재고실사 · 인쇄 · 선택삭제 · Excel · 이력조회.
 *
 * <p>간편 = 기타이동에서 바로 맞춘 재고조정, 단계별 = 단계별재고조정을 반영해 생긴 재고조정(적요가 '단계별조정 '으로 시작).
 * <p>2026-10-12 실측(간편재고조정 C001 본사창고 장부 348 → 실사 350): 줄 '간편 · 26/10/12-1 · 본사창고 · 포장김치 [1KG] · <b>-2</b>' —
 * 수량은 <b>장부 − 실사</b>(늘었으면 음수)다. 재고수불부도 '[조정]' 을 <b>출고 -2</b> 로 적는다(출고 전표의 수량이다).
 * 입력일자는 링크가 아니다. [선택삭제]는 '선택한 전표를 삭제 하겠습니까?' 뒤 지우고, 실사 기록(재고실사조회)은 조정전표 칸만 빈 채로 남는다
 * — 우리는 간편 실사를 조정과 따로 적지 않아 같이 사라진다.
 */
export default function AdjustListPage() {
  const navigate = useNavigate()
  /* 원본 [간편재고조정] — 품목 × 창고 재고 표에서 실사수량을 넣는 창(SimpleAdjustDialog). */
  const [simpleOpen, setSimpleOpen] = useState(false)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const pickers = useCondPickers(['warehouses', 'items', 'employees'])
  const init = periodOf('최근30일(+1개월)')!
  const [sort, setSort] = useState<'전체' | '간편' | '단계별'>('전체')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouse, setWarehouse] = useState('')
  const [item, setItem] = useState('')
  const [employee, setEmployee] = useState('')
  const [rows, setRows] = useState<StockAdjustment[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<AdjustmentList>('/stock-adjustments', { params: { from, to, type: 'ADJUST' } })
      setRows(r.data.rows)
      setTruncated(r.data.truncated)
      setPicked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const empName = useMemo(() => new Map(pickers.employees.map((e) => [(e as { id?: number }).id, e.name])), [pickers.employees])
  const shown = useMemo(() => rows
    .filter((r) => r.type === 'ADJUST')
    .filter((r) => r.adjustDate >= from && r.adjustDate <= to)
    .filter((r) => sort === '전체' || sortOf(r) === sort)
    .filter((r) => !warehouse || String(r.warehouseId) === warehouse)
    .filter((r) => !item || String(r.itemId) === item)
    .filter((r) => !employee || (r.employeeId != null && empName.get(r.employeeId) === employee))
    .sort((a, b) => (a.adjustDate > b.adjustDate ? -1 : a.adjustDate < b.adjustDate ? 1 : b.adjustNo.localeCompare(a.adjustNo))),
  [rows, from, to, sort, warehouse, item, employee, empName])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '재고조정조회', [shown.length])
  const allPicked = shown.length > 0 && shown.every((r) => picked.has(r.id))

  /** 원본 [선택삭제] — 고른 조정을 지우고 재고를 되돌린다(서버가 반대 거래를 남긴다). */
  async function removePicked() {
    if (picked.size === 0) return setError('삭제할 전표를 선택하세요.')
    if (!confirm('선택한 전표를 삭제 하겠습니까?')) return
    try {
      for (const id of picked) await api.delete(`/stock-adjustments/${id}`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    await load()
  }

  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title="재고조정조회"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setSort('전체'); setFrom(init.from); setTo(init.to); setWarehouse(''); setItem(''); setEmployee('') } },
        { label: '간편재고조정', onClick: () => setSimpleOpen(true) },
        { label: '단계별재고실사', onClick: () => navigate('/inventory/stocktake') },
        { label: '선택삭제', onClick: () => void removePicked(), disabled: picked.size === 0 },
        { label: 'Excel' },
      ]}
    >
      <SimpleAdjustDialog open={simpleOpen} onClose={() => setSimpleOpen(false)} onDone={() => void load()} />
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          {(['전체', '간편', '단계별'] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="adjust-sort" checked={sort === v} onChange={() => setSort(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체" value={employee} onChange={setEmployee} items={pickers.employees} />
        </EcCond>
      </ul>

      {truncated && <p className="text-[12px] text-ec-warn mb-[6px]">자료가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map((r) => r.id)))} />
            </th>
            <th className="text-center">구분</th>
            <th className="text-center">입력일자</th>
            <th>창고</th>
            <th>품목</th>
            <th className="text-right">수량</th>
            <th>담당자</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center text-ec-hint whitespace-nowrap">
                <input type="checkbox" aria-label={`${i + 1}줄 선택`} checked={picked.has(r.id)}
                       onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                {' '}{i + 1}
              </td>
              <td className="text-center">{sortOf(r)}</td>
              <td className="text-center">{shortDateNo(r.adjustDate, r.adjustNo)}</td>
              <td>{r.warehouseName}</td>
              <td>{r.itemName}{r.spec ? ` [${r.spec}]` : ''}</td>
              {/* 원본은 장부 − 실사(늘린 조정이 음수)다 — 우리 증감의 반대 부호. */}
              <td className="text-right">{(-Number(r.quantityChange)).toLocaleString('ko-KR')}</td>
              <td>{r.employeeId != null ? empName.get(r.employeeId) ?? '' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
