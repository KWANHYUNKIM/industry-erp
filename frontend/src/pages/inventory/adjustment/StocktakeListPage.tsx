import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'
import SimpleAdjustDialog from '../../../features/stockadjust/components/SimpleAdjustDialog'
import EcListShell from '../../../components/EcListShell'
import { EcCond } from '../../../components/EcStatusPanel'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import EcPeriodPicks, { STOCKTAKE_LIST_PICKS, periodOf } from '../../../components/EcPeriodPicks'
import { useCondPickers } from '../../../utils/useCondPickers'
import { dateNo } from '../../../utils/dateNo'
import type { StagedAdjustment, StockAdjustment } from '../../../types/api'
import { ecAlert, ecConfirm } from '../../../components/EcDialog'
import { EcDateRange } from '../../../components/ui/EcDateInput'

interface AdjustmentList { rows: StockAdjustment[]; totalRows: number; truncated: boolean }
/** 단계별재고조정을 반영하면 서버가 적요 앞에 이 말 + 실사번호를 붙여 재고조정(ADJUST)을 만든다(StagedStockAdjustmentService.apply). */
const STAGED_PREFIX = '단계별조정 '

/** 간편재고조정이 남긴 실사(GET /stock-adjustments/stocktakes). 조정을 지웠으면 adjustNo 가 비어 있다. */
interface SimpleStocktake {
  id: number; stocktakeNo: string; stocktakeDate: string
  warehouseId: number; warehouseName: string
  itemId: number; itemName: string; spec: string | null
  actualQty: number; employeeId: number | null
  adjustNo: string | null; adjustDate: string | null
}

interface Line {
  key: string; id: number; sort: '간편' | '단계별'; date: string; no: string
  warehouseId: number; warehouseName: string; person: string
  itemId: number; itemName: string; spec: string | null; qty: number; slip: string
}

/**
 * 재고 I &gt; 기타이동 &gt; 재고조정 &gt; <b>재고실사조회</b>(E040613) — 2026-10-03 loginaa 실측(빈 판).
 *
 * <p>조건: 구분(<b>전체</b> | 간편 | 단계별) · 기준일자(구간, 기본 <b>전월+금월</b> — 2026-10-31 loginad 실측 2026/09/01 ~ 10/31.
 * 10-03 loginaa 사본은 차월이었다. 빠른선택 끝에 전월+금월 · 종료일 · 차월) ·
 * 창고 · 품목 · 담당자. 열: 구분 · 입력일자 · 창고명 · 담당자 · 품목명[규격명] · 수량 · 조정전표.
 *
 * <p>간편 = 간편재고조정이 남긴 <b>실사</b>(stocktakes) — 수량은 실사수량, 조정전표는 그때 만든 재고조정.
 * 원본은 실사와 조정이 따로 남는다(2026-10-12 실측): 조정을 지워도 실사는 조정전표 빈 채로 남고, 실사를 여기 [선택삭제]
 * ('선택한 전표를 삭제 하겠습니까?')로 지우면 그 조정까지 같이 지워진다(2026-10-13 실측). 예전에는 조정을 그대로 실사로 보여 줘서 조정을 지우면 실사도 사라졌다. 단계별 = 단계별재고조정의 실사 요청 — 수량은 실사수량, 조정전표는 반영할 때
 * 생긴 재고조정(적요 '단계별조정 {실사번호}')이고 아직 안 반영했으면 비어 있다.
 * 담당자는 간편이 간편재고조정 창의 담당자, 단계별이 실사 전표 머리의 담당자다.
 */
export default function StocktakeListPage() {
  const pickers = useCondPickers(['warehouses', 'items', 'employees'])
  /* 재고조정진행단계 [실사 › 조회] 는 그 실사 전표 날짜로 걸러 연다(2026-10-28 원본 실측). */
  const opened = useLocation().state as { from?: string; to?: string } | null
  const init = opened?.from && opened?.to ? { from: opened.from, to: opened.to } : periodOf('전월+금월')!
  /* 원본 [간편재고조정] — 품목 × 창고 재고 표에서 실사수량을 넣는 창(SimpleAdjustDialog). */
  const [simpleOpen, setSimpleOpen] = useState(false)
  const [sort, setSort] = useState<'전체' | '간편' | '단계별'>('전체')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouse, setWarehouse] = useState('')
  const [item, setItem] = useState('')
  const [person, setPerson] = useState('')
  const navigate = useNavigate()
  const [adjusts, setAdjusts] = useState<StockAdjustment[]>([])
  const [simple, setSimple] = useState<SimpleStocktake[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [staged, setStaged] = useState<StagedAdjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 단계별의 조정전표는 실사일 뒤에 생길 수 있어 조정은 실사 기간 끝 이후까지 넉넉히 받는다(끝날을 비운다). */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const [a, s, t] = await Promise.all([
        api.get<AdjustmentList>('/stock-adjustments', { params: { from, type: 'ADJUST' } }),
        api.get<StagedAdjustment[]>('/staged-adjustments', { params: { from, to } }),
        api.get<SimpleStocktake[]>('/stock-adjustments/stocktakes', { params: { from, to } }),
      ])
      setAdjusts(a.data.rows)
      setStaged(s.data)
      setSimple(t.data)
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
  const lines = useMemo(() => {
    const slipOf = new Map<string, StockAdjustment>()
    for (const a of adjusts) {
      const reason = a.reason ?? ''
      if (reason.startsWith(STAGED_PREFIX)) slipOf.set(reason.slice(STAGED_PREFIX.length).split(' ')[0], a)
    }
    const out: Line[] = []
    for (const t of simple) {
      out.push({ key: `t${t.id}`, id: t.id, sort: '간편', date: t.stocktakeDate, no: t.stocktakeNo, warehouseId: t.warehouseId, warehouseName: t.warehouseName,
        /* 원본 [담당자]는 간편재고조정 창의 담당자다 — 비우면 빈칸(2026-10-12 실측). 작성자가 아니다. */
        person: t.employeeId != null ? empName.get(t.employeeId) ?? '' : '', itemId: t.itemId, itemName: t.itemName, spec: t.spec, qty: Number(t.actualQty),
        slip: t.adjustNo && t.adjustDate ? dateNo(t.adjustDate, t.adjustNo) : '' })
    }
    for (const s of staged) {
      const slip = slipOf.get(s.adjustNo)
      /* 입력일자 번호는 실사 전표 번호(줄들이 같이 쓴다) — 원본 '2026/10/20 -1'. 조정전표는 그 줄로 맞춘 재고조정. */
      out.push({ key: `s${s.id}`, id: s.id, sort: '단계별', date: s.requestDate, no: s.slipNo ?? s.adjustNo, warehouseId: s.warehouseId, warehouseName: s.warehouseName,
        person: s.employeeId != null ? empName.get(s.employeeId) ?? '' : '', itemId: s.itemId, itemName: s.itemName, spec: null, qty: Number(s.actualQty),
        slip: s.adjustmentNo && s.adjustmentDate ? dateNo(s.adjustmentDate, s.adjustmentNo) : slip ? dateNo(slip.adjustDate, slip.adjustNo) : '' })
    }
    return out
      .filter((l) => l.date >= from && l.date <= to)
      .filter((l) => sort === '전체' || l.sort === sort)
      .filter((l) => !warehouse || String(l.warehouseId) === warehouse)
      .filter((l) => !item || String(l.itemId) === item)
      .filter((l) => !person || l.person === person)
      .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : b.no.localeCompare(a.no)))
  }, [adjusts, simple, staged, from, to, sort, warehouse, item, person, empName])
  const people = useMemo(() => [...new Set([
    ...simple.map((t) => (t.employeeId != null ? empName.get(t.employeeId) : null)), ...staged.map((s) => (s.employeeId != null ? empName.get(s.employeeId) : null)),
  ].filter(Boolean) as string[])].sort(), [simple, staged, empName])
  const allPicked = lines.length > 0 && lines.every((l) => picked.has(l.key))

  /**
   * 원본 [선택삭제] — 고른 실사를 지운다. 간편은 그 실사로 맞춘 재고조정도 같이 지워지고 재고가 되돌아온다(2026-10-13 실측),
   * 단계별은 그 요청을 지운다(반영된 요청은 서버가 막는다 — 단계별재고조정 화면과 같은 규칙).
   */
  async function removePicked() {
    if (picked.size === 0) return setError('삭제할 전표를 선택하세요.')
    if (!(await ecConfirm('선택한 전표를 삭제 하겠습니까?'))) return
    try {
      for (const l of lines.filter((x) => picked.has(x.key))) {
        await api.delete(l.sort === '간편' ? `/stock-adjustments/stocktakes/${l.id}` : `/staged-adjustments/${l.id}`)
      }
    } catch (e) {
      /* 서버가 막은 까닭(예: '이미 반영된 조정은 삭제할 수 없습니다.')을 창으로 — setError 는 이어지는 load() 가 바로 지워
         [확인] 뒤 아무 말도 없었다. 조정을 든 실사는 조정과 같이 지워진다(41줄 2026-10-12 · 13 실측). */
      await load()
      return ecAlert(extractErrorMessage(e))
    }
    await load()
  }
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '재고실사조회', [lines.length])

  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title="재고실사조회"
      /* 원본처럼 머리 [입력 후 Enter] · [Search(F3)] — 조건 판은 접어 두고 Search(F3) 로 편다. 판 아래 [검색(F8)] · [다시작성] 은 셸이 단다(2026-10-31 loginad 실측). */
      onReset={() => { setSort('전체'); setFrom(init.from); setTo(init.to); setWarehouse(''); setItem(''); setPerson('') }}
      actions={[
        /* 원본 버튼줄(2026-10-21 실측): 간편재고조정 · 단계별재고실사 · 선택삭제 · Excel · 이력조회 — 이력조회는 모양만. */
        { label: '간편재고조정', onClick: () => setSimpleOpen(true) },
        { label: '단계별재고실사', onClick: () => navigate('/inventory/stocktake') },
        { label: '선택삭제', onClick: () => void removePicked(), selected: picked.size },
        { label: 'Excel' },
        { label: '이력조회' },
      ]}
    >
      <SimpleAdjustDialog open={simpleOpen} onClose={() => setSimpleOpen(false)} onDone={() => void load()} />
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          {(['전체', '간편', '단계별'] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="stocktake-sort" checked={sort === v} onChange={() => setSort(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
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

      {/* 원본 표 위 알약 [전체] 하나(2026-10-31 loginad 실측). */}
      <div className="ec-pills mb-[6px]" role="tablist" aria-label="리스트탭">
        <button type="button" role="tab" aria-selected className="ec-pill no-ec active">전체</button>
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(lines.map((l) => l.key)))} />
            </th>
            <th className="text-center">구분</th>
            <th className="text-center">입력일자</th>
            <th>창고명</th>
            <th>담당자</th>
            <th>품목명[규격명]</th>
            <th className="text-right">수 량</th>
            <th className="text-center">조정전표</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
          ) : lines.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : lines.map((l, i) => (
            <tr key={l.key}>
              <td className="text-center text-ec-hint whitespace-nowrap">
                <input type="checkbox" aria-label={`${i + 1}줄 선택`} checked={picked.has(l.key)}
                       onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(l.key)) n.delete(l.key); else n.add(l.key); return n })} />
                {' '}{i + 1}
              </td>
              <td className="text-center">{l.sort}</td>
              {/* 원본 단계별 줄의 입력일자를 누르면 단계별실사수정 창이 열린다(2026-10-21 실측). */}
              <td className="text-center">{l.sort === '단계별'
                ? <a className="cursor-pointer" onClick={() => navigate(`/inventory/stocktake?slip=${encodeURIComponent(l.no)}`)}>{dateNo(l.date, l.no)}</a>
                : dateNo(l.date, l.no)}</td>
              <td>{l.warehouseName}</td>
              <td>{l.person}</td>
              <td>{l.itemName}{l.spec ? `[${l.spec}]` : ''}</td>
              {/* 원본은 소수 둘째 자리까지 찍는다 — '350.00'. */}
              <td className="text-right">{l.qty.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="text-center">{l.slip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
