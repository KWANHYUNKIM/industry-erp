import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcPeriodPicks, { AS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import EcBarChart from '../../components/EcBarChart'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import ItemSuggestInput from '../../features/item/components/ItemSuggestInput'
import { EcReportHead, EcReportFoot, reportDate, reportPeriod } from '../../components/EcReportFrame'
import { AsAggControls, AsAggregateTable, type AsAggKey, type AsAggLine } from '../../features/as/AsAggregate'

/**
 * 재고 II > A/S관리 > A/S접수현황 (이카운트 E040610). 데이터는 GET /api/as-requests 의 접수와 그 품목 줄.
 *
 * <p>2026-10-04 원본 실측(두 접수 · 네 줄로 [구분]을 하나씩 바꿔 가며 잼):
 * <ul>
 *   <li><b>◉내역</b> 아래 선택상자 일별 · 월별 · <b>라인별</b>(기본) · 전표별 · 품목별 · 전표별품목별 · 거래처별 · 담당자별 ·
 *       거래처별라인별(전송용). 열은 모두 같고, 묶은 줄은 <b>처음 줄의 값</b>에 수량만 더한다 —
 *       전표별은 첫 품목 하나(외 n건 없음, -2 A001 6.00), 품목별은 전표를 넘어 묶는다(A001 1+1+3 = 5),
 *       일별은 [일자-No.] 칸에 2026/10/04, 월별은 2026/10.</li>
 *   <li><b>○집계</b> — [집계조건1] · [집계조건2] 를 고른다. 안 고르고 검색하면 "집계조건은 1개 이상 선택해야 합니다.".
 *       열은 [조건 이름 · 수량], [코드포함] 이면 이름 앞에 [이름+코드] 열(창고코드 · 품목명[규격]코드).
 *       조건2 가 있으면 조건1 묶음 끝에 '<b>본사창고 계</b>' 소계 줄, 맨 끝 [합계].
 *       품목 이름은 '익스트림 울트라 명품 조립PC [1EA]' 처럼 규격 앞에 한 칸을 띄운다(내역은 붙인다).</li>
 *   <li>출력물 머리 — 내역은 'AS접수현황', 집계는 'A/S접수현황'(원본이 둘을 다르게 적는다) · 회사명 · 기간, 꼬리 [P.1].</li>
 * </ul>
 * 예전엔 원본에 없는 건수 · 상태별 · 평균처리 요약 줄과 [수리일자] 조건을 두었다 — 수리일로 보는 것은
 * A/S수리현황(/quality/as-repair-status)이 따로 맡는다. 접수/수리 입력·전이는 AsManagePage.
 */
type AsStatus = 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
const STATUSES: AsStatus[] = ['RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED']
const LABEL: Record<AsStatus, string> = { RECEIVED: '접수', IN_PROGRESS: '수리중', COMPLETED: '완료', CANCELED: '취소' }

/** 원본 수량 칸은 소수 둘째 자리까지 찍는다(2.00). */
const qty2 = (n: number) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type AsLine = { id: number; itemId: number; itemCode: string; itemName: string; itemSpec: string | null; quantity: number }

interface AsRow {
  id: number; asNo: string; partnerId: number; partnerName: string; itemId: number; itemName: string
  receiptDate: string; symptom: string | null; charge: string | null
  warehouseId: number | null; warehouseName: string | null; projectId: number | null; projectName: string | null
  status: AsStatus; statusName: string; doneDate: string | null; repairNote: string | null
  /*
   * 2026-09-08 에 원본(E040610)의 조건 판을 재니 <b>스물아홉</b>이다(사본에는 아홉).
   * 아래 넷은 <code>AsResponse</code> 가 진작 싣는데 이 화면이 안 받고 있었다.
   */
  itemCategoryName: string | null
  /* 격자를 재면서 응답을 넓혀 받아 온다 - 원본 열이 [품목코드]·[품목명[규격]] 이다. */
  itemCode: string | null
  itemSpec: string | null
  title: string | null
  scheduledDate: string | null
  createdBy: string | null
  /** 접수 품목 줄 — 원본 격자는 줄마다 한 행이다(2026-10-03 실측: 두 줄 접수 → 두 행 + [합계] 수량). */
  lines?: AsLine[]
}

interface Filters {
  dateFrom: string; dateTo: string
  /*
   * 원본 A/S수리현황(E040611)의 <b>[기준일자]</b> — 그 화면은 수리한 날로 거르고
   * [접수일자]를 따로 둔다(2026-09-01 실측, 접수일자 기본은 [사용안함]).
   * 우리는 한 화면이 접수현황·수리현황을 겸하는데 <b>접수일로만</b> 걸러,
   * 이번 달에 <b>고친</b> 건이 몇 건인지를 볼 수가 없었다 — 접수는 지난달인데
   * 수리가 이번 달인 건이 통째로 빠진다.
   */
  /** 원본 [구분] — ◉내역(아래 선택상자) · ○집계(집계조건1 · 2 · 코드포함). 검색할 때 걸린다. */
  gubun: '내역' | '집계'; form: Form; agg1: AsAggKey | ''; agg2: AsAggKey | ''; codeIncl: boolean
  warehouse: string; project: string
  partner: string; item: string; charge: string; status: '' | AsStatus
  /** 2026-09-08 실측으로 드러난 일곱. */
  partnerGroup: string; category: string; itemGroup: string
  schedFrom: string; schedTo: string
  title: string; remark: string; author: string
}
/*
 * 원본 A/S접수현황은 <b>금월</b>을 보고 열리고, 기간 단추에 <b>직전분기·직전반기</b>가
 * 더 있다(사본 실측). A/S 는 분기·반기로 접수량을 견주는 일이 흔해서다.
 * 우리는 기간을 비워 두고 단추도 없어서, 열면 접수가 통째로 쏟아졌다.
 */
const init = periodOf('금월(~오늘)')!

const EMPTY_FILTERS: Filters = { dateFrom: init.from, dateTo: init.to, gubun: '내역', form: '라인별', agg1: '', agg2: '', codeIncl: false, warehouse: '', project: '', partner: '', item: '', charge: '', status: '',
  partnerGroup: '', category: '', itemGroup: '', schedFrom: '', schedTo: '', title: '', remark: '', author: '' }

/** 원본 ◉내역 선택상자(차례 그대로). 거래처별라인별(전송용)은 내보내기용 판이라 두지 않는다. */
const FORMS = ['일별', '월별', '라인별', '전표별', '품목별', '전표별품목별', '거래처별', '담당자별'] as const
type Form = (typeof FORMS)[number]
export default function AsStatusPage() {
  const [rows, setRows] = useState<AsRow[]>([])
  /* 거래처그룹1·품목그룹1 은 마스터에 붙는 값이라 마스터를 받아 이름·id 로 잇는다. */
  const pgroup = usePartnerGroups()
  const mgmt = useItemMgmt()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  const [panelOpen, setPanelOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<AsRow[]>('/as-requests', {
        params: { from: filters.dateFrom || undefined, to: filters.dateTo || undefined },
      })
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  /*
   * <b>기간을 서버에 보낸다.</b> 조건 판에 [기간]을 물어 놓고 서버에는 아무것도 안 보내
   * 전 기간을 받아 브라우저에서 걸렀다. 기간이 바뀌면 다시 물어본다.
   */
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters.dateFrom, filters.dateTo])

  /**
   * 원본 [데이터 보기형식] · [그래프로 보기] — 조건 판 <b>맨 끝</b>이다(사본 실측:
   * 창고 · 프로젝트 · 담당자 · 접수진행상태 · 거래처 · 품목 · 적용양식 · 양식구분 · 데이터 보기형식).
   *
   * <p>무엇을 그리나 — A/S 는 <b>어디에 얼마나 밀려 있나</b> 를 보는 화면이다.
   * 그래서 <b>접수진행상태</b>로 묶어 건수를 그린다. 품목으로 묶으면 '무엇이 자주 고장나나'
   * 는 보이지만 '지금 몇 건이 안 끝났나' 는 안 보인다 — 이 화면 위쪽 요약이 이미 그 물음이다.
   */
  const [view, setView] = useState<'표' | '그래프'>('표')

  const shown = useMemo(() => {
    const kw = keyword.trim()
    const f = filters
    return rows.filter((r) => {
      if (kw && !r.partnerName.includes(kw) && !r.itemName.includes(kw) && !r.asNo.includes(kw)) return false
      if (f.dateFrom && r.receiptDate < f.dateFrom) return false
      if (f.dateTo && r.receiptDate > f.dateTo) return false
      if (f.partner && !r.partnerName.includes(f.partner)) return false
      if (f.item && !(r.lines?.length ? r.lines.some((l) => l.itemName.includes(f.item)) : r.itemName.includes(f.item))) return false
      if (f.warehouse && (r.warehouseName ?? '') !== f.warehouse) return false
      if (f.project && (r.projectName ?? '') !== f.project) return false
      if (f.charge && !(r.charge ?? '').includes(f.charge)) return false
      if (f.status && r.status !== f.status) return false
      if (f.partnerGroup && pgroup.groupOfName(r.partnerName) !== f.partnerGroup) return false
      if (f.category && (r.itemCategoryName ?? '') !== f.category) return false
      if (f.itemGroup && mgmt.groupOf(r.itemId) !== f.itemGroup) return false
      if (f.schedFrom && (r.scheduledDate ?? '') < f.schedFrom) return false
      if (f.schedTo && ((r.scheduledDate ?? '') === '' || (r.scheduledDate ?? '') > f.schedTo)) return false
      if (f.title && !(r.title ?? '').includes(f.title)) return false
      if (f.remark && !(r.repairNote ?? '').includes(f.remark)) return false
      if (f.author && (r.createdBy ?? '') !== f.author) return false
      return true
    }).sort((a, b) => (a.receiptDate < b.receiptDate ? 1 : a.receiptDate > b.receiptDate ? -1 : b.id - a.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, keyword, filters, pgroup.groupOptions, mgmt.groupOptions])

  const activeCount = useMemo(() => {
    let n = 0
    if (filters.dateFrom || filters.dateTo) n++
    if (filters.partner) n++
    if (filters.item) n++
    if (filters.charge) n++
    if (filters.status) n++
    return n
  }, [filters])

  const applyDraft = () => { setFilters(draft); setPanelOpen(false) }
  const resetDraft = () => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS) }
  const openPanel = () => { setDraft(filters); setPanelOpen((v) => !v) }


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    접수일: (r) => r.receiptDate,
  })

  /*
   * 원본 A/S접수현황은 접수 <b>품목 줄마다</b> 한 행이고 맨 아래 [합계]에 수량을 더한다(2026-10-03 실측).
   * 줄이 없는 옛 접수(줄 테이블 전)는 머리 품목 1개로 본다.
   */
  const lineRows = sort.sorted.flatMap((r) => (r.lines?.length ? r.lines : [{ id: 0, itemId: r.itemId, itemCode: r.itemCode ?? '', itemName: r.itemName, itemSpec: r.itemSpec, quantity: 1 }])
    .filter((l) => !filters.item || l.itemName.includes(filters.item))
    .map((l) => ({ r, l })))

  /*
   * ◉내역 — 고른 판으로 묶는다. 묶은 줄은 <b>처음 줄</b>의 값을 두고 수량만 더한다(원본 실측, 위 머리 주석).
   * 일별 · 월별은 [일자-No.] 칸에 날짜(달)만 적는다.
   */
  const listRows = useMemo(() => {
    const form = filters.form
    const one = ({ r, l }: { r: AsRow; l: AsLine }) => ({ key: `${r.id}-${l.id}`, r, l, qty: Number(l.quantity), dateCell: dateNo(r.receiptDate, r.asNo) })
    if (form === '라인별') return lineRows.map(one)
    const keyOf = ({ r, l }: { r: AsRow; l: AsLine }) => form === '일별' ? r.receiptDate : form === '월별' ? r.receiptDate.slice(0, 7)
      : form === '전표별' ? String(r.id) : form === '품목별' ? String(l.itemId) : form === '전표별품목별' ? `${r.id}|${l.itemId}`
      : form === '거래처별' ? String(r.partnerId) : (r.charge ?? '')
    const m = new Map<string, { r: AsRow; l: AsLine }[]>()
    lineRows.forEach((x) => m.set(keyOf(x), [...(m.get(keyOf(x)) ?? []), x]))
    return [...m.entries()].map(([k, ls]) => ({
      ...one(ls[0]), key: k, qty: ls.reduce((n, x) => n + Number(x.l.quantity), 0),
      dateCell: form === '일별' ? reportDate(ls[0].r.receiptDate) : form === '월별' ? reportDate(ls[0].r.receiptDate).slice(0, 7) : dateNo(ls[0].r.receiptDate, ls[0].r.asNo),
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineRows.length, sort.sorted, filters.form, filters.item])

  /* [코드포함] 의 코드 — 응답에는 창고 · 거래처 · 프로젝트의 id 만 있어 마스터에서 잇는다. */
  const [codes, setCodes] = useState<{ wh: Map<number, string>; pa: Map<number, string>; pj: Map<number, string> }>({ wh: new Map(), pa: new Map(), pj: new Map() })
  useEffect(() => {
    type C = { id: number; code: string }
    const get = (u: string) => api.get<C[]>(u).then((r) => new Map(r.data.map((x) => [x.id, x.code] as [number, string]))).catch(() => new Map<number, string>())
    Promise.all([get('/warehouses'), get('/partners'), get('/projects')]).then(([wh, pa, pj]) => setCodes({ wh, pa, pj }))
  }, [])

  /** ○집계가 읽는 줄 — 접수 품목 줄마다 하나. 코드는 마스터에서 잇는다. */
  const aggLines: AsAggLine[] = lineRows.map(({ r, l }) => ({
    date: r.receiptDate, charge: r.charge ?? '',
    warehouse: [r.warehouseName ?? '', r.warehouseId != null ? codes.wh.get(r.warehouseId) ?? '' : ''],
    mgmt: mgmt.nameOf(l.itemId) ?? '',
    partner: [r.partnerName, codes.pa.get(r.partnerId) ?? ''], partnerGroup: pgroup.groupOfName(r.partnerName) ?? '',
    itemName: l.itemName, itemSpec: l.itemSpec, itemCode: l.itemCode, itemGroup: mgmt.groupOf(l.itemId) ?? '',
    project: [r.projectName ?? '', r.projectId != null ? codes.pj.get(r.projectId) ?? '' : ''],
    qty: Number(l.quantity),
  }))
  const totalQty = lineRows.reduce((a, x) => a + Number(x.l.quantity), 0)

  return (
    <EcListShell
      title="A/S접수현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: '인쇄' }, { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="flex items-center gap-[8px] mb-[8px]">
        <button className="ec-btn" onClick={openPanel}>
          상세검색 {panelOpen ? '▲' : '▼'}{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
        {activeCount > 0 && !panelOpen && (
          <button className="ec-btn" onClick={resetDraft} style={{ fontSize: 12, color: 'var(--ec-text-hint)' }}>조건 해제</button>
        )}
      </div>

      {panelOpen && (
        <SearchPanel draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} onApply={applyDraft} onReset={resetDraft}
                     view={view} onViewChange={setView} />
      )}

      {view === '그래프' ? (
        <EcBarChart unit=" 건" emptyText="조회된 접수가 없습니다."
                    rows={(() => {
                      const m = new Map<string, number>()
                      for (const r of shown) m.set(r.statusName, (m.get(r.statusName) ?? 0) + 1)
                      return [...m].map(([label, value]) => ({ label, value }))
                    })()} />
      ) : filters.gubun === '집계' ? (
        <AsAggregateTable title="A/S접수현황" period={reportPeriod(filters.dateFrom, filters.dateTo)} lines={aggLines}
                          value={{ agg1: filters.agg1, agg2: filters.agg2, codeIncl: filters.codeIncl }} />
      ) : (
      <>
      <EcReportHead title="AS접수현황" period={reportPeriod(filters.dateFrom, filters.dateTo)} />
      <table className="w-full text-left">
        <thead>
          {/*
            원본 격자(2026-09-09 E040610 실측, 2026-10-04 다시 잼):
            <b>일자-No. · 진행상태 · 창고명 · 담당자명 · 거래처명 · 제목 · 품목코드 ·
            품목명[규격] · 수량 · 관리항목명 · 적요</b>. ◉내역의 어느 판이든 열은 같다.
          */}
          <tr>
            <th className="w-[34px]"></th>
            <th className="cursor-pointer text-center" onClick={() => sort.toggle('접수일')}>일자-No. {sort.mark('접수일')}</th>
            <th className="text-center">진행상태</th>
            <th>창고명</th>
            <th>담당자명</th>
            <th>거래처명</th>
            <th>제목</th>
            <th>품목코드</th>
            <th>품목명[규격]</th>
            <th className="text-right">수량</th>
            <th>관리항목명</th>
            <th>적요</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} className="ec-empty">불러오는 중…</td></tr>
          ) : listRows.length === 0 ? (
            <tr><td colSpan={12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : listRows.map(({ key, r, l, qty, dateCell }, i) => (
              <tr key={key}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                {/* 원본은 일자와 번호를 한 칸에 적는다(일별 · 월별은 날짜 · 달만). */}
                <td className="text-center">{dateCell}</td>
                <td className="text-center">{r.statusName || LABEL[r.status]}</td>
                <td>{r.warehouseName || ''}</td>
                <td>{r.charge || ''}</td>
                <td>{r.partnerName}</td>
                <td>{r.title || ''}</td>
                <td>{l.itemCode || ''}</td>
                {/* 원본은 규격을 품목명 뒤 대괄호에 붙인다. */}
                <td>{l.itemName}{l.itemSpec ? '[' + l.itemSpec + ']' : ''}</td>
                <td className="text-right">{qty2(qty)}</td>
                {/* 관리항목은 품목 마스터에 붙는 값이라 줄에는 없다 - itemId 로 화면에서 잇는다. */}
                <td className="text-ec-label">{mgmt.nameOf(l.itemId)}</td>
                <td>{r.repairNote || ''}</td>
              </tr>
          ))}
        </tbody>
        {listRows.length > 0 && (
          <tfoot><tr className="ec-total">
            <td colSpan={9} className="text-center">합계</td>
            <td className="text-right">{qty2(totalQty)}</td>
            <td></td><td></td>
          </tr></tfoot>
        )}
      </table>
      <EcReportFoot />
      </>
      )}
    </EcListShell>
  )
}

/** 이카운트 Search 패널 — 접수일/거래처/품목/담당/상태 */
function SearchPanel({
  draft, onChange, onApply, onReset, view, onViewChange,
}: {
  draft: Filters
  onChange: (patch: Partial<Filters>) => void
  onApply: () => void
  onReset: () => void
  /** 원본 [데이터 보기형식] — 조건 판 맨 끝이다. 셸을 안 쓰는 화면이라 여기 직접 그린다. */
  view: '표' | '그래프'
  onViewChange: (v: '표' | '그래프') => void
}) {
  const label: React.CSSProperties = {
    width: 90, fontSize: 12.5, color: 'var(--ec-text)', fontWeight: 600,
    display: 'flex', alignItems: 'center', paddingRight: 8,
  }
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--ec-line-soft)',
  }
  return (
    <div
      onKeyDown={(e) => { if (e.key === 'Enter') onApply() }}
      style={{ border: '1px solid var(--ec-line)', borderRadius: 4, background: 'var(--ec-bg-page)', padding: '4px 14px 12px', marginBottom: 10 }}
    >
      {/* 원본 첫 줄 [구분] — ◉내역 ○집계, 내역이면 판 선택상자, 집계면 집계조건1 · 2 · [기타] 코드포함. */}
      <div style={rowStyle}>
        <span style={label}>구분</span>
        <div className="flex flex-wrap items-center gap-[8px]">
          {(['내역', '집계'] as const).map((g) => (
            <label key={g} className="inline-flex items-center gap-[3px]">
              <input type="radio" name="as-gubun" checked={draft.gubun === g} onChange={() => onChange({ gubun: g })} /> {g}
            </label>
          ))}
          {draft.gubun === '내역' ? (
            <select className="ec-input w-[140px]" value={draft.form} onChange={(e) => onChange({ form: e.target.value as Form })}>
              {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          ) : (<>
            <AsAggControls value={{ agg1: draft.agg1, agg2: draft.agg2, codeIncl: draft.codeIncl }} onChange={onChange} />
          </>)}
        </div>
      </div>
      <div style={rowStyle}>
        <span style={label}>기준일자</span>
        <input type="date" className="ec-input" value={draft.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })} style={{ width: 150 }} />
        <span className="my-0 mx-[6px] text-ec-hint">~</span>
        <input type="date" className="ec-input" value={draft.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })} style={{ width: 150 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={AS_PICKS} currentFrom={draft.dateFrom}
              onPick={(r) => onChange({ dateFrom: r.from, dateTo: r.to })} />
          </span>
      </div>
      <div style={rowStyle}>
        {/* 원본 A/S접수현황 차례: <b>창고 · 프로젝트</b> · 담당자 · 접수진행상태 · 거래처 · 품목 */}
        <span style={label}>창고</span>
        <input className="ec-input" placeholder="창고명" value={draft.warehouse}
          onChange={(e) => onChange({ warehouse: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>프로젝트</span>
        <input className="ec-input" placeholder="프로젝트명" value={draft.project}
          onChange={(e) => onChange({ project: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        {/* 원본 A/S접수현황의 이름은 [담당]이 아니라 <b>[담당자]</b> 다(사본 실측). */}
        <span style={label}>담당자</span>
        <input className="ec-input" placeholder="담당자명 일부" value={draft.charge}
          onChange={(e) => onChange({ charge: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        {/* 원본 A/S접수현황의 이름은 [상태]가 아니라 <b>[접수진행상태]</b> 다(사본 실측). */}
        <span style={label}>접수진행상태</span>
        <select className="ec-input" value={draft.status}
          onChange={(e) => onChange({ status: e.target.value as Filters['status'] })} style={{ width: 150 }}>
          <option value="">전체</option>
          {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
        </select>
      </div>
      {/*
        원본 차례(2026-09-08 실측, 스물아홉): 구분 · 기준일자 · 창고 · (창고계층그룹) ·
        프로젝트 · (프로젝트그룹1/2) · 담당자 · 접수진행상태 · 거래처 ·
        <b>거래처그룹1</b> · (거래처그룹2 · 거래처계층그룹) · 품목 ·
        <b>품목구분 · 품목그룹1</b> · (품목그룹2/3 · 품목계층그룹) · <b>수리예정일자 ·
        제목 · 적요 · 최초작성자</b> · (최종수정자 · 양식) · 적용양식 · 양식구분 ·
        정렬/소계기준 · 데이터 보기형식.
      */}
      <div style={rowStyle}>
        <span style={label}>거래처</span>
        <input className="ec-input" placeholder="거래처명 일부" value={draft.partner}
          onChange={(e) => onChange({ partner: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>거래처그룹1</span>
        <input className="ec-input" placeholder="거래처그룹1 이름" value={draft.partnerGroup}
          onChange={(e) => onChange({ partnerGroup: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>품목</span>
        <ItemSuggestInput field="name" value={draft.item} placeholder="품목명 일부"
                          onChange={(v) => onChange({ item: v })} width={220} />
      </div>
      <div style={rowStyle}>
        <span style={label}>품목구분</span>
        <input className="ec-input" placeholder="원재료·상품 …" value={draft.category}
          onChange={(e) => onChange({ category: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>품목그룹1</span>
        <input className="ec-input" placeholder="품목그룹1 이름" value={draft.itemGroup}
          onChange={(e) => onChange({ itemGroup: e.target.value })} style={{ width: 220 }} />
      </div>
      {/* 원본 [수리예정일자] — <b>언제 고쳐 주기로 했나</b> 다. 아래 [수리일자](실제로 고친 날)와 다르다. */}
      <div style={rowStyle}>
        <span style={label}>수리예정일자</span>
        <input type="date" className="ec-input" value={draft.schedFrom}
          onChange={(e) => onChange({ schedFrom: e.target.value })} style={{ width: 150 }} />
        <span className="my-0 mx-[6px] text-ec-hint">~</span>
        <input type="date" className="ec-input" value={draft.schedTo}
          onChange={(e) => onChange({ schedTo: e.target.value })} style={{ width: 150 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>제목</span>
        <input className="ec-input" placeholder="제목 일부" value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>적요</span>
        <input className="ec-input" placeholder="수리 적요 일부" value={draft.remark}
          onChange={(e) => onChange({ remark: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>최초작성자</span>
        <input className="ec-input" placeholder="만든 사람" value={draft.author}
          onChange={(e) => onChange({ author: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span style={label}>데이터 보기형식</span>
        <div className="ec-pills">
          {(['표', '그래프'] as const).map((v) => (
            <button key={v} type="button" className={`ec-pill no-ec${view === v ? ' active' : ''}`}
                    onClick={() => onViewChange(v)}>{v}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-[6px] mt-[12px] justify-end">
        <button className="ec-btn" onClick={onReset}>초기화</button>
        <button className="ec-btn ec-btn-primary" onClick={onApply}>조회</button>
      </div>
    </div>
  )
}
