import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import { dateText } from '../../utils/dateText'
import EcPeriodPicks, { AS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import EcBarChart from '../../components/EcBarChart'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { useItemMgmt } from '../../utils/itemMgmtItems'

/**
 * 재고 II > A/S관리 > A/S현황 (이카운트 E040610 A/S접수현황 · E040611 A/S수리현황)
 * A/S 접수·수리를 기간·상태로 필터하고 상태별 건수와 평균 처리일수를 집계하는 현황.
 * 접수/수리 입력·전이는 A/S 접수·수리 관리(AsManagePage). 데이터는 GET /api/as-requests 그대로(백엔드 무변경).
 *
 * 우리 모델은 접수→처리중→완료를 하나의 AsRequest 상태전이로 다룬다(별도 수리 전표 없음).
 * 따라서 접수현황과 수리현황을 한 화면에서 상태 필터로 함께 본다.
 */
type AsStatus = 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
const STATUSES: AsStatus[] = ['RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED']
const LABEL: Record<AsStatus, string> = { RECEIVED: '접수', IN_PROGRESS: '처리중', COMPLETED: '완료', CANCELED: '취소' }
const COLOR: Record<AsStatus, string> = { RECEIVED: '#c07a00', IN_PROGRESS: 'var(--ec-blue)', COMPLETED: '#1c7c3c', CANCELED: '#8a929c' }

interface AsRow {
  id: number; asNo: string; partnerId: number; partnerName: string; itemId: number; itemName: string
  receiptDate: string; symptom: string | null; charge: string | null
  warehouseName: string | null; projectName: string | null
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
  doneFrom: string; doneTo: string
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

const EMPTY_FILTERS: Filters = { dateFrom: init.from, dateTo: init.to, doneFrom: '', doneTo: '', warehouse: '', project: '', partner: '', item: '', charge: '', status: '',
  partnerGroup: '', category: '', itemGroup: '', schedFrom: '', schedTo: '', title: '', remark: '', author: '' }

/** receiptDate ~ doneDate 사이 일수(완료건만). 둘 다 YYYY-MM-DD 문자열. */
function daysBetween(from: string, to: string | null): number | null {
  if (!to) return null
  const a = Date.parse(from), b = Date.parse(to)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

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
      /*
       * 원본 A/S수리현황(E040611)의 주 조건은 <b>수리한 날</b>이다 — 그것을 주면 서버가
       * 그 축으로 좁혀 준다(안 고친 건은 그 날이 없어 빠진다). 안 주면 예전처럼 접수일로 건다.
       */
      const res = await api.get<AsRow[]>('/as-requests', {
        params: {
          from: filters.dateFrom || undefined, to: filters.dateTo || undefined,
          doneFrom: filters.doneFrom || undefined, doneTo: filters.doneTo || undefined,
        },
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
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters.dateFrom, filters.dateTo, filters.doneFrom, filters.doneTo])

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
      /*
       * 원본 A/S수리현황의 [기준일자] — 수리한 날. 이제 <b>서버가</b> 그 축으로 좁혀 주지만,
       * 받아 온 뒤 조건을 다시 만져도 표가 맞도록 화면에서도 같은 잣대로 한 번 더 거른다.
       */
      if (f.doneFrom && (r.doneDate == null || r.doneDate < f.doneFrom)) return false
      if (f.doneTo && (r.doneDate == null || r.doneDate > f.doneTo)) return false
      if (f.partner && !r.partnerName.includes(f.partner)) return false
      if (f.item && !r.itemName.includes(f.item)) return false
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

  const stats = useMemo(() => {
    const byStatus: Record<AsStatus, number> = { RECEIVED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELED: 0 }
    let doneDaysSum = 0, doneCount = 0
    for (const r of shown) {
      byStatus[r.status]++
      const d = r.status === 'COMPLETED' ? daysBetween(r.receiptDate, r.doneDate) : null
      if (d !== null) { doneDaysSum += d; doneCount++ }
    }
    const open = byStatus.RECEIVED + byStatus.IN_PROGRESS
    const avgDays = doneCount > 0 ? doneDaysSum / doneCount : null
    return { byStatus, open, avgDays }
  }, [shown])

  const activeCount = useMemo(() => {
    let n = 0
    if (filters.dateFrom || filters.dateTo) n++
    if (filters.doneFrom || filters.doneTo) n++
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

  return (
    <EcListShell
      title="A/S현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: '인쇄' }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button className="ec-btn" onClick={openPanel}>
          상세검색 {panelOpen ? '▲' : '▼'}{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
        {activeCount > 0 && !panelOpen && (
          <button className="ec-btn" onClick={resetDraft} style={{ fontSize: 12, color: '#8a929c' }}>조건 해제</button>
        )}
      </div>

      {panelOpen && (
        <SearchPanel draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} onApply={applyDraft} onReset={resetDraft}
                     view={view} onViewChange={setView} />
      )}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        건수 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        {STATUSES.map((s) => (
          <span key={s} style={{ marginLeft: 8 }}>
            {LABEL[s]} <b style={{ color: COLOR[s] }}>{stats.byStatus[s]}</b>
          </span>
        ))}
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        미완료 <b style={{ color: '#c07a00', fontSize: 14 }}>{stats.open}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        평균처리 <b style={{ color: '#3c4553' }}>{stats.avgDays === null ? '-' : `${stats.avgDays.toFixed(1)}일`}</b>
      </div>

      {view === '그래프' ? (
        <EcBarChart unit=" 건" emptyText="조회된 접수가 없습니다."
                    rows={(() => {
                      const m = new Map<string, number>()
                      for (const r of shown) m.set(r.statusName, (m.get(r.statusName) ?? 0) + 1)
                      return [...m].map(([label, value]) => ({ label, value }))
                    })()} />
      ) : (
      <table className="w-full text-left">
        <thead>
          {/*
            원본 격자(2026-09-09 E040610 실측):
            <b>일자-No. · 진행상태 · 창고명 · 담당자명 · 거래처명 · 제목 · 품목코드 ·
            품목명[규격] · 수량 · 관리항목명 · 적요</b>.
            우리는 (1) 일자와 번호를 두 칸으로 갈랐고, (2) <b>[창고명]·[제목]·[품목코드]·
            [관리항목명] 넷을 아예 안 찍고</b> 있었다(넷 다 진작 받아 두거나 받을 수 있던 값이다),
            (3) 이름이 넷 달랐다 - 거래처/품목/담당/상태.
            [수량]은 못 만든다 - A/S 접수에 수량 칸이 없다(예외에 적었다).
            증상·완료일·처리일수는 원본에 없지만 우리가 더 두는 열이다.
          */}
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => sort.toggle('접수일')}>일자-No. {sort.mark('접수일')}</th>
            <th style={{ textAlign: 'center' }}>진행상태</th>
            <th>창고명</th>
            <th>담당자명</th>
            <th>거래처명</th>
            <th>제목</th>
            <th>품목코드</th>
            <th>품목명[규격]</th>
            <th>관리항목명</th>
            <th>적요</th>
            <th>증상</th>
            <th>완료일</th>
            <th style={{ textAlign: 'right' }}>처리일수</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? 'A/S 내역이 없습니다.' : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : sort.sorted.map((r, i) => {
            const days = r.status === 'COMPLETED' ? daysBetween(r.receiptDate, r.doneDate) : null
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                {/* 원본은 일자와 번호를 한 칸에 적는다. */}
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>{dateText(r.receiptDate)} {r.asNo}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ color: COLOR[r.status], fontWeight: 700, fontSize: 12 }}>{r.statusName || LABEL[r.status]}</span>
                </td>
                <td style={{ color: r.warehouseName ? undefined : '#c5cbd3' }}>{r.warehouseName || ''}</td>
                <td style={{ color: r.charge ? undefined : '#c5cbd3' }}>{r.charge || ''}</td>
                <td>{r.partnerName}</td>
                <td style={{ color: r.title ? undefined : '#c5cbd3' }}>{r.title || ''}</td>
                <td style={{ fontFamily: 'monospace', color: r.itemCode ? undefined : '#c5cbd3' }}>{r.itemCode || ''}</td>
                {/* 원본은 규격을 품목명 뒤 대괄호에 붙인다. */}
                <td>{r.itemName}{r.itemSpec ? ' [' + r.itemSpec + ']' : ''}</td>
                {/* 관리항목은 품목 마스터에 붙는 값이라 줄에는 없다 - itemId 로 화면에서 잇는다. */}
                <td style={{ color: '#5a626e' }}>{mgmt.nameOf(r.itemId)}</td>
                {/* 원본 [적요] - A/S 전표의 적요는 수리내역이다(A/S소모현황과 같은 매핑). */}
                <td style={{ color: r.repairNote ? '#5a626e' : '#c5cbd3', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.repairNote || ''}</td>
                <td style={{ color: r.symptom ? undefined : '#c5cbd3', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.symptom || ''}</td>
                <td style={{ fontFamily: 'monospace', color: r.doneDate ? '#5a626e' : '#c5cbd3' }}>{dateText(r.doneDate) || ''}</td>
                <td style={{ textAlign: 'right', color: days === null ? '#c5cbd3' : '#3c4553' }}>{days === null ? '-' : `${days}일`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
    width: 90, fontSize: 12.5, color: '#3c4553', fontWeight: 600,
    display: 'flex', alignItems: 'center', paddingRight: 8,
  }
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #eef1f5',
  }
  return (
    <div
      onKeyDown={(e) => { if (e.key === 'Enter') onApply() }}
      style={{ border: '1px solid #d4dae2', borderRadius: 4, background: '#fbfcfe', padding: '4px 14px 12px', marginBottom: 10 }}
    >
      <div style={rowStyle}>
        <span style={label}>기준일자</span>
        <input type="date" className="ec-input" value={draft.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })} style={{ width: 150 }} />
        <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
        <input type="date" className="ec-input" value={draft.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })} style={{ width: 150 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={AS_PICKS} currentFrom={draft.dateFrom}
              onPick={(r) => onChange({ dateFrom: r.from, dateTo: r.to })} />
          </span>
      </div>
      {/*
        원본 A/S수리현황(E040611)의 <b>[기준일자]</b> 자리다 — 그 화면은 <b>수리한 날</b>로
        거르고 접수일자를 따로 둔다. 우리는 한 화면이 접수현황·수리현황을 겸하면서
        접수일 하나뿐이라, 이번 달에 <b>고친</b> 건을 볼 수가 없었다.
        (원본은 이쪽이 주 조건이고 접수일자가 보조인데, 우리는 서버가 접수일로 기간을 받아
         차례가 반대다. 접수일로 좁힌 안에서 수리일을 다시 거른다.)
      */}
      <div style={rowStyle}>
        <span style={label}>수리일자</span>
        <input type="date" className="ec-input" value={draft.doneFrom}
          onChange={(e) => onChange({ doneFrom: e.target.value })} style={{ width: 150 }} />
        <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
        <input type="date" className="ec-input" value={draft.doneTo}
          onChange={(e) => onChange({ doneTo: e.target.value })} style={{ width: 150 }} />
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
        <input className="ec-input" placeholder="품목명 일부" value={draft.item}
          onChange={(e) => onChange({ item: e.target.value })} style={{ width: 220 }} />
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
        <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
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
      <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="ec-btn" onClick={onReset}>초기화</button>
        <button className="ec-btn ec-btn-primary" onClick={onApply}>조회</button>
      </div>
    </div>
  )
}
