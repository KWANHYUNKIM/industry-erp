import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { ecConfirm } from '../../components/EcDialog'
import { api, extractErrorMessage } from '../../api/client'
import { useLocation, useNavigate } from 'react-router-dom'
import SimpleAdjustDialog from '../../features/stockadjust/components/SimpleAdjustDialog'
import StagedAdjustDialog from '../../features/stockadjust/components/StagedAdjustDialog'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { STAGED_PROGRESS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import type { StagedAdjustment, StockAdjustment } from '../../types/api'

const num = (n: number) => (n === 0 ? '' : n.toLocaleString('ko-KR'))
/**
 * 원본 진행단계 알약(2026-10-03 실측): 파랑 rgb(31,72,212) · 회색 rgb(134,141,147), 글자 흰색.
 * 2026-10-13 다시 재니 <b>[실사]는 늘 회색, [조정]은 늘 파랑</b>이다 — 조정 전 실사(포장김치 100)도, 조정한 뒤에도 같았다.
 * 단계에 따라 바뀌는 색이 아니다. [실사]를 누르면 [조회 · 현황] 이 뜬다(재고실사조회 · 재고실사현황).
 */
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
 * 담당자는 실사 전표 머리의 [담당자]다(2026-10-28 실측 — 로그인 계정이 아니다). [이력] 열은 전표 변경 이력 창인데 우리는 이력을 따로 남기지 않는다.
 */
/** 단계별재고조정을 반영하면 서버가 적요 앞에 이 말을 붙여 재고조정을 만든다 — 그것은 단계별 줄이 이미 맡는다. */
const STAGED_PREFIX = '단계별조정 '
/** 원본 줄 [조정] → '조정' 확인 창 문구(2026-10-28 실측). */
const ADJUST_CONFIRM = '재고조정전표를 생성하시겠습니까?\n재고조정 시, 실사입력된 전표만 조정이 됩니다.\n조정대상을 선택하려면, [재고조정]버튼을 눌러 진행해야 합니다.'
/** 표 한 줄 — 단계별 실사 한 건이거나, 간편재고조정 한 건. */
interface Row {
  key: string; date: string; no: string; person: string; itemId: number; itemName: string
  warehouseId: number; warehouseName: string; book: number; actual: number; diff: number; applied: boolean
  /** 단계별 실사 전표 번호 — 간편재고조정 줄은 없다. */
  slip?: string
}

export default function StagedProgressPage() {
  const pickers = useCondPickers(['warehouses', 'items', 'employees'])
  const init = periodOf('금년')!
  /* 원본 [간편재고조정] — 품목 × 창고 재고 표에서 실사수량을 넣는 창(SimpleAdjustDialog). */
  const [simpleOpen, setSimpleOpen] = useState(false)
  /* 원본 [재고조정] — 단계별재고조정 창(StagedAdjustDialog). */
  const [stagedOpen, setStagedOpen] = useState(false)
  /* 단계별재고실사 저장 뒤 돌아오면 원본 알림 '요청된 [단계별재고실사] 작업이 완료되었습니다.' 를 띄운다. */
  const location = useLocation()
  const [notice, setNotice] = useState((location.state as { notice?: string } | null)?.notice ?? '')
  /* [실사] 알약을 누른 줄 — 그 아래 [조회 · 현황] 이 뜬다. [조정] 알약을 누른 줄 — 그 아래 [조정] 이 뜬다. */
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [adjustFor, setAdjustFor] = useState<string | null>(null)
  const navigate = useNavigate()
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
    ...staged.map((r) => ({ key: `s${r.id}`, date: r.requestDate, no: r.adjustNo, slip: r.slipNo,
      /* 원본 [담당자]는 실사 전표에서 고른 담당자다(박태선, 2026-10-28 실측) — 비우면 빈칸. */
      person: r.employeeId != null ? empName.get(r.employeeId) ?? '' : '', itemId: r.itemId,
      itemName: r.itemName, warehouseId: r.warehouseId, warehouseName: r.warehouseName,
      /*
       * 원본은 조정 안 한 실사 줄의 [장부수량] · [차이]를 비운다(2026-10-13 실측). [재고조정]을 켜고 저장한 실사는
       * 장부 · 실사 · 차이를 찍는다(2026-10-21 실측: 포장김치 제2창고 311 · 7 · -304).
       */
      book: r.adjustmentNo ? Number(r.bookQty) : 0, actual: Number(r.actualQty),
      diff: r.adjustmentNo ? Number(r.actualQty) - Number(r.bookQty) : 0, applied: r.status === 'APPLIED' })),
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
  /**
   * 원본 줄 [조정] 알약 → '조정' → 확인 창 → <b>그 실사 전표만</b> 조정전표를 만든다 → 알림(2026-10-28 loginaa 실측).
   * 창고 · 기준일자로 고르는 버튼줄 [재고조정] 과 다르다.
   */
  async function adjustSlip(slipNo: string) {
    setAdjustFor(null)
    if (!(await ecConfirm(ADJUST_CONFIRM))) return
    try {
      await api.post(`/staged-adjustments/slips/${encodeURIComponent(slipNo)}/adjust`)
      setNotice('요청된 [단계별재고조정] 작업이 완료되었습니다.')
      setError('')
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '재고조정진행단계', [shown.length])

  return (
    <EcListShell
      title="재고조정진행단계"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setWarehouse(''); setItem(''); setPerson(''); setAdjusted('전체') } },
        /* 원본 버튼줄 간편재고조정 · 단계별재고실사 · 재고조정(2026-10-12 실측). [재고조정]은 단계별재고조정 창을 연다(2026-10-13). */
        { label: '간편재고조정', onClick: () => setSimpleOpen(true) },
        { label: '단계별재고실사', onClick: () => navigate('/inventory/stocktake') },
        { label: '재고조정', onClick: () => { setNotice(''); setStagedOpen(true) } },
        { label: 'Excel' },
      ]}
    >
      <SimpleAdjustDialog open={simpleOpen} onClose={() => setSimpleOpen(false)} onDone={() => void load()} />
      <StagedAdjustDialog open={stagedOpen} onClose={() => setStagedOpen(false)}
                          onDone={() => { setNotice('요청된 [단계별재고조정] 작업이 완료되었습니다.'); void load() }} />
      {notice && <p className="ec-alert ec-alert-success mb-[8px]">{notice}</p>}
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
              <td className="text-center whitespace-nowrap relative">
                <button type="button" style={pill(false)} onClick={() => { setAdjustFor(null); setMenuFor(menuFor === r.key ? null : r.key) }}>실사</button>
                {/* 간편재고조정 줄은 이미 조정이라 메뉴가 없다(원본 미실측). */}
                <button type="button" style={pill(true)} onClick={() => { setMenuFor(null); setAdjustFor(r.slip && adjustFor !== r.key ? r.key : null) }}>조정</button>
                {adjustFor === r.key && r.slip && (
                  <span className="absolute left-1/2 top-full z-10 bg-ec-panel border border-ec-line border-solid rounded-ec p-[4px] flex flex-col">
                    <button type="button" className="ec-btn ec-btn-sm" onClick={() => void adjustSlip(r.slip!)}>조정</button>
                  </span>
                )}
                {menuFor === r.key && (
                  <span className="absolute left-1/2 top-full z-10 bg-ec-panel border border-ec-line border-solid rounded-ec p-[4px] flex flex-col">
                    {/* 원본 [조회] 는 재고실사조회 창을 그 실사 전표 날짜로 걸러 연다(2026-10-28 실측). */}
                    <button type="button" className="ec-btn ec-btn-sm" onClick={() => navigate('/inventory/stocktake-list', { state: { from: r.date, to: r.date } })}>조회</button>
                    <button type="button" className="ec-btn ec-btn-sm" onClick={() => navigate('/inventory/stocktake-status')}>현황</button>
                  </span>
                )}
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
