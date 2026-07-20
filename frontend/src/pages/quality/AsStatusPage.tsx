import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

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
  status: AsStatus; statusName: string; doneDate: string | null; repairNote: string | null
}

interface Filters {
  dateFrom: string; dateTo: string; partner: string; item: string; charge: string; status: '' | AsStatus
}
const EMPTY_FILTERS: Filters = { dateFrom: '', dateTo: '', partner: '', item: '', charge: '', status: '' }

/** receiptDate ~ doneDate 사이 일수(완료건만). 둘 다 YYYY-MM-DD 문자열. */
function daysBetween(from: string, to: string | null): number | null {
  if (!to) return null
  const a = Date.parse(from), b = Date.parse(to)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

export default function AsStatusPage() {
  const [rows, setRows] = useState<AsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  const [panelOpen, setPanelOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<AsRow[]>('/as-requests')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => {
    const kw = keyword.trim()
    const f = filters
    return rows.filter((r) => {
      if (kw && !r.partnerName.includes(kw) && !r.itemName.includes(kw) && !r.asNo.includes(kw)) return false
      if (f.dateFrom && r.receiptDate < f.dateFrom) return false
      if (f.dateTo && r.receiptDate > f.dateTo) return false
      if (f.partner && !r.partnerName.includes(f.partner)) return false
      if (f.item && !r.itemName.includes(f.item)) return false
      if (f.charge && !(r.charge ?? '').includes(f.charge)) return false
      if (f.status && r.status !== f.status) return false
      return true
    }).sort((a, b) => (a.receiptDate < b.receiptDate ? 1 : a.receiptDate > b.receiptDate ? -1 : b.id - a.id))
  }, [rows, keyword, filters])

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
    if (filters.partner) n++
    if (filters.item) n++
    if (filters.charge) n++
    if (filters.status) n++
    return n
  }, [filters])

  const applyDraft = () => { setFilters(draft); setPanelOpen(false) }
  const resetDraft = () => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS) }
  const openPanel = () => { setDraft(filters); setPanelOpen((v) => !v) }

  return (
    <EcListShell
      title="A/S현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
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
        <SearchPanel draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} onApply={applyDraft} onReset={resetDraft} />
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

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>접수일 ▼</th>
            <th>접수번호</th>
            <th>거래처</th>
            <th>품목</th>
            <th>증상</th>
            <th>담당</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th>완료일</th>
            <th style={{ textAlign: 'right' }}>처리일수</th>
            <th>수리내역</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? 'A/S 내역이 없습니다.' : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => {
            const days = r.status === 'COMPLETED' ? daysBetween(r.receiptDate, r.doneDate) : null
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.receiptDate}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.asNo}</td>
                <td>{r.partnerName}</td>
                <td>{r.itemName}</td>
                <td style={{ color: r.symptom ? undefined : '#c5cbd3', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.symptom || '-'}</td>
                <td style={{ color: r.charge ? undefined : '#c5cbd3' }}>{r.charge || '-'}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ color: COLOR[r.status], fontWeight: 700, fontSize: 12 }}>{r.statusName || LABEL[r.status]}</span>
                </td>
                <td style={{ fontFamily: 'monospace', color: r.doneDate ? '#5a626e' : '#c5cbd3' }}>{r.doneDate ?? '-'}</td>
                <td style={{ textAlign: 'right', color: days === null ? '#c5cbd3' : '#3c4553' }}>{days === null ? '-' : `${days}일`}</td>
                <td style={{ color: r.repairNote ? '#5a626e' : '#c5cbd3', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.repairNote || '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}

/** 이카운트 Search 패널 — 접수일/거래처/품목/담당/상태 */
function SearchPanel({
  draft, onChange, onApply, onReset,
}: {
  draft: Filters
  onChange: (patch: Partial<Filters>) => void
  onApply: () => void
  onReset: () => void
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
        <span style={label}>접수일</span>
        <input type="date" className="ec-input" value={draft.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })} style={{ width: 150 }} />
        <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
        <input type="date" className="ec-input" value={draft.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })} style={{ width: 150 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>거래처</span>
        <input className="ec-input" placeholder="거래처명 일부" value={draft.partner}
          onChange={(e) => onChange({ partner: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>품목</span>
        <input className="ec-input" placeholder="품목명 일부" value={draft.item}
          onChange={(e) => onChange({ item: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>담당</span>
        <input className="ec-input" placeholder="담당자명 일부" value={draft.charge}
          onChange={(e) => onChange({ charge: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span style={label}>상태</span>
        <select className="ec-input" value={draft.status}
          onChange={(e) => onChange({ status: e.target.value as Filters['status'] })} style={{ width: 150 }}>
          <option value="">전체</option>
          {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="ec-btn" onClick={onReset}>초기화</button>
        <button className="ec-btn ec-btn-primary" onClick={onApply}>조회</button>
      </div>
    </div>
  )
}
