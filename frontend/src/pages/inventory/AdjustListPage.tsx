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
import Modal from '../../components/Modal'
import { fillAndPrint, openPrintWindow } from '../../utils/print'
import { adjustSlipHtml } from '../../utils/adjustSlipDocument'
import { ecAlert, ecConfirm } from '../../components/EcDialog'

/** [이력조회] 한 줄(GET /stock-adjustments/histories). 거래처 · 담당자는 id 만 온다. */
interface HistoryRow {
  id: number; workedAt: string; adjustNo: string; adjustDate: string
  action: string; itemLabel: string | null; partnerId: number | null; employeeId: number | null; worker: string | null
}
const NO_PICK = '리스트에 선택된 자료가 없습니다.\n\n체크박스에 체크한 후 다시 시도 바랍니다.'

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
 * <p>2026-10-13 실측: [인쇄] 는 안 고르면 '리스트에 선택된 자료가 없습니다.', 고르면 '재고조정전표' 미리보기(utils/adjustSlipDocument).
 * [이력조회 ▴] 는 '간편조정 이력조회' · '단계별조정 이력조회' 창: 기간(기본 금월(~오늘)) · 작업일자 · 전표번호 · 행위(신규 · 삭제) ·
 * 거래처코드 · 거래처명 · 품목명 · 담당자코드 · 담당자명 · 작업자 · 전표상태 · 이력, 하단 Excel · 닫기.
 * 우리는 ▴ 메뉴 대신 창 안 알약으로 둘을 고른다(하단 버튼줄에 펼침 메뉴가 없다). [이력] 열의 H(전표이력보기)는 아직 없다.
 */
export default function AdjustListPage() {
  const navigate = useNavigate()
  /* 원본 [간편재고조정] — 품목 × 창고 재고 표에서 실사수량을 넣는 창(SimpleAdjustDialog). */
  const [simpleOpen, setSimpleOpen] = useState(false)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const pickers = useCondPickers(['warehouses', 'items', 'employees', 'partners'])
  const [histOpen, setHistOpen] = useState(false)
  const [histSort, setHistSort] = useState<'간편' | '단계별'>('간편')
  const monthStart = periodOf('금월(~오늘)')!
  const [histFrom, setHistFrom] = useState(monthStart.from)
  const [histTo, setHistTo] = useState(monthStart.to)
  const [hist, setHist] = useState<HistoryRow[]>([])
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

  /** [인쇄] — 고른 줄을 전표(번호)별로 묶어 재고조정전표 미리보기. 창은 누른 순간 연다(팝업 차단). */
  function printPicked() {
    const sel = shown.filter((r) => picked.has(r.id))
    if (sel.length === 0) return ecAlert(NO_PICK)
    const win = openPrintWindow()
    if (!win) return
    const byNo = new Map<string, StockAdjustment[]>()
    sel.forEach((r) => byNo.set(r.adjustNo, [...(byNo.get(r.adjustNo) ?? []), r]))
    const whCode = (id: number) => pickers.warehouses.find((w) => w.value === String(id))?.code
    fillAndPrint(win, adjustSlipHtml([...byNo.values()].map((rs) => ({
      docLabel: shortDateNo(rs[0].adjustDate, rs[0].adjustNo).replace(/^(\d{2})\//, '20$1/').replace('-', ' -'),
      date: rs[0].adjustDate,
      employeeName: rs[0].employeeId != null ? empName.get(rs[0].employeeId) ?? '' : '',
      warehouseLabel: rs[0].warehouseName + (whCode(rs[0].warehouseId) ? `(${whCode(rs[0].warehouseId)})` : ''),
      lines: rs.map((r) => ({ itemCode: r.itemCode, itemLabel: r.itemName + (r.spec ? ` [${r.spec}]` : ''), quantity: -Number(r.quantityChange), remark: r.reason ?? '' })),
    }))), false)
  }

  async function loadHist(sortName = histSort) {
    try {
      setHist((await api.get<HistoryRow[]>('/stock-adjustments/histories', { params: { sort: sortName, from: histFrom, to: histTo } })).data)
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  /** 원본 [선택삭제] — 고른 조정을 지우고 재고를 되돌린다(서버가 반대 거래를 남긴다). */
  async function removePicked() {
    if (picked.size === 0) return setError('삭제할 전표를 선택하세요.')
    if (!(await ecConfirm('선택한 전표를 삭제 하겠습니까?'))) return
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
        { label: '인쇄', onClick: printPicked },
        { label: '선택삭제', onClick: () => void removePicked(), selected: picked.size },
        { label: 'Excel' },
        { label: '이력조회', onClick: () => { setHistOpen(true); void loadHist() } },
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
      <Modal error={error} open={histOpen} title={`${histSort}조정 이력조회`} width={1000} onClose={() => setHistOpen(false)}>
        <div className="ec-pills mb-[8px]">
          {(['간편', '단계별'] as const).map((v) => (
            <button key={v} type="button" className={`ec-pill no-ec${histSort === v ? ' active' : ''}`}
              onClick={() => { setHistSort(v); void loadHist(v) }}>{v}조정 이력조회</button>
          ))}
        </div>
        <div className="flex items-center gap-[4px] mb-[6px] flex-wrap">
          <input type="date" className="ec-input w-[145px]" value={histFrom} onChange={(e) => setHistFrom(e.target.value)} />
          <span>~</span>
          <input type="date" className="ec-input w-[145px]" value={histTo} onChange={(e) => setHistTo(e.target.value)} />
          <EcPeriodPicks labels={['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '종료일']} currentFrom={histFrom}
            onPick={(r) => { setHistFrom(r.from); setHistTo(r.to) }} />
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void loadHist()}>검색(F8)</button>
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th>작업일자</th><th>전표번호</th><th>행위</th><th>거래처코드</th><th>거래처명</th><th>품목명</th>
              <th>담당자코드</th><th>담당자명</th><th>작업자</th><th>전표상태</th><th className="text-center">이력</th>
            </tr>
          </thead>
          <tbody>
            {hist.length === 0 ? (
              <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : hist.map((h) => {
              const p = h.partnerId != null ? pickers.partners.find((x) => x.id === h.partnerId) : undefined
              const e = h.employeeId != null ? pickers.employees.find((x) => x.id === h.employeeId) : undefined
              return (
                <tr key={h.id}>
                  <td>{h.workedAt.slice(0, 10).replace(/-/g, '/')}</td>
                  <td>{h.adjustDate.replace(/-/g, '/')} -{Number(h.adjustNo.split('-').pop())}</td>
                  <td>{h.action}</td>
                  <td>{p?.code ?? ''}</td>
                  <td>{p?.name ?? ''}</td>
                  <td>{h.itemLabel ?? ''}</td>
                  <td>{e?.code ?? ''}</td>
                  <td>{e?.name ?? ''}</td>
                  <td>{h.worker ?? ''}</td>
                  <td />
                  <td className="text-center">H</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="mt-[9px]">
          <button type="button" className="ec-btn" onClick={() => setHistOpen(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
