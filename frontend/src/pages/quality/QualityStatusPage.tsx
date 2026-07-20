import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { QualityInspection, QualityInspectionType, QualityResult } from '../../api/types'

/**
 * 재고 II > 품질관리 > 품질검사현황 (이카운트 E040623)
 * 품질검사(검사성적) 전체를 필터·집계해서 보는 현황. 검사입력은 품질관리 화면(QualityInspectionPage).
 * 데이터는 GET /api/quality-inspections 그대로 사용(백엔드 무변경).
 *
 * 이카운트 원본 Search 패널은 검사항목(문자/숫자/코드형)·불량유형·창고·프로젝트·집계조건 등 필드가 방대하지만,
 * 우리 InspectionResponse 로 실제 거를 수 있는 것만 둔다: 기간·검사유형·품목·판정결과·검사자.
 * 나머지는 대응 필드가 없어 **의도적 제외**(값 없는 컨트롤을 만들지 않는다).
 */
const TYPES: QualityInspectionType[] = ['INCOMING', 'PROCESS', 'SHIPMENT']
const TYPE_LABEL: Record<QualityInspectionType, string> = {
  INCOMING: '수입검사', PROCESS: '공정검사', SHIPMENT: '출하검사',
}
const RESULTS: QualityResult[] = ['PASS', 'CONDITIONAL', 'FAIL']
const RESULT_LABEL: Record<QualityResult, string> = {
  PASS: '합격', CONDITIONAL: '조건부합격', FAIL: '불합격',
}
const resultColor = (r: QualityResult | null) =>
  r === 'FAIL' ? '#c60a2e' : r === 'CONDITIONAL' ? '#c07a00' : r === 'PASS' ? '#1c7c3c' : '#9aa1ab'

interface Filters {
  dateFrom: string
  dateTo: string
  type: '' | QualityInspectionType
  item: string
  result: '' | QualityResult
  inspector: string
}
const EMPTY_FILTERS: Filters = { dateFrom: '', dateTo: '', type: '', item: '', result: '', inspector: '' }

const pct = (n: number) => `${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`

export default function QualityStatusPage() {
  const [rows, setRows] = useState<QualityInspection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  const [panelOpen, setPanelOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<QualityInspection[]>('/quality-inspections')
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
      if (kw && !r.itemName.includes(kw) && !r.inspectionNo.includes(kw) && !(r.lotNo ?? '').includes(kw)) return false
      if (f.dateFrom && r.inspectionDate < f.dateFrom) return false
      if (f.dateTo && r.inspectionDate > f.dateTo) return false
      if (f.type && r.type !== f.type) return false
      if (f.item && !r.itemName.includes(f.item)) return false
      if (f.result && r.result !== f.result) return false
      if (f.inspector && !(r.inspector ?? '').includes(f.inspector)) return false
      return true
    }).sort((a, b) => (a.inspectionDate < b.inspectionDate ? 1 : a.inspectionDate > b.inspectionDate ? -1 : b.id - a.id))
  }, [rows, keyword, filters])

  const totals = useMemo(() => {
    const t = shown.reduce((s, r) => ({
      inspected: s.inspected + r.inspectedQty,
      defect: s.defect + r.defectQty,
      good: s.good + r.goodQty,
      pass: s.pass + (r.result === 'PASS' ? 1 : 0),
      fail: s.fail + (r.result === 'FAIL' ? 1 : 0),
    }), { inspected: 0, defect: 0, good: 0, pass: 0, fail: 0 })
    const rate = t.inspected > 0 ? (t.defect / t.inspected) * 100 : 0
    return { ...t, rate }
  }, [shown])

  const activeCount = useMemo(() => {
    let n = 0
    if (filters.dateFrom || filters.dateTo) n++
    if (filters.type) n++
    if (filters.item) n++
    if (filters.result) n++
    if (filters.inspector) n++
    return n
  }, [filters])

  const applyDraft = () => { setFilters(draft); setPanelOpen(false) }
  const resetDraft = () => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS) }
  const openPanel = () => { setDraft(filters); setPanelOpen((v) => !v) }

  return (
    <EcListShell
      title="품질검사현황"
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
        검사수량 <b style={{ color: '#3c4553', fontSize: 14 }}>{totals.inspected.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        불량 <b style={{ color: '#c60a2e', fontSize: 14 }}>{totals.defect.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        불량률 <b style={{ color: totals.rate > 0 ? '#c60a2e' : '#1c6b32', fontSize: 14 }}>{pct(totals.rate)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        합격 <b style={{ color: '#1c7c3c' }}>{totals.pass}</b> / 불합격 <b style={{ color: '#c60a2e' }}>{totals.fail}</b>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>검사일자 ▼</th>
            <th>검사번호</th>
            <th style={{ textAlign: 'center' }}>검사구분</th>
            <th>품목명</th>
            <th>로트</th>
            <th style={{ textAlign: 'right' }}>검사수량</th>
            <th style={{ textAlign: 'right' }}>불량</th>
            <th style={{ textAlign: 'right' }}>양품</th>
            <th style={{ textAlign: 'right' }}>불량률</th>
            <th style={{ textAlign: 'center' }}>판정</th>
            <th>검사자</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '품질검사 내역이 없습니다.' : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.inspectionDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.inspectionNo}</td>
              <td style={{ textAlign: 'center' }}>{r.typeName}</td>
              <td>{r.itemName}</td>
              <td style={{ fontFamily: 'monospace', color: r.lotNo ? '#5a626e' : '#c5cbd3' }}>{r.lotNo ?? '-'}</td>
              <td style={{ textAlign: 'right' }}>{r.inspectedQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: r.defectQty > 0 ? '#c60a2e' : '#8a929c', fontWeight: r.defectQty > 0 ? 600 : 400 }}>{r.defectQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: '#1c6b32' }}>{r.goodQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: r.defectRate > 0 ? '#c60a2e' : '#8a929c' }}>{pct(r.defectRate)}</td>
              <td style={{ textAlign: 'center', color: resultColor(r.result), fontWeight: 700 }}>{r.resultName || '미판정'}</td>
              <td style={{ color: r.inspector ? undefined : '#c5cbd3' }}>{r.inspector || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

/** 이카운트 Search 패널 — 검사일자/검사유형/품목/판정결과/검사자 */
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
        <span style={label}>검사일자</span>
        <input type="date" className="ec-input" value={draft.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })} style={{ width: 150 }} />
        <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
        <input type="date" className="ec-input" value={draft.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })} style={{ width: 150 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>검사유형</span>
        <select className="ec-input" value={draft.type}
          onChange={(e) => onChange({ type: e.target.value as Filters['type'] })} style={{ width: 150 }}>
          <option value="">전체</option>
          {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
      </div>
      <div style={rowStyle}>
        <span style={label}>품목</span>
        <input className="ec-input" placeholder="품목명 일부" value={draft.item}
          onChange={(e) => onChange({ item: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>판정결과</span>
        <select className="ec-input" value={draft.result}
          onChange={(e) => onChange({ result: e.target.value as Filters['result'] })} style={{ width: 150 }}>
          <option value="">전체</option>
          {RESULTS.map((r) => <option key={r} value={r}>{RESULT_LABEL[r]}</option>)}
        </select>
      </div>
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span style={label}>검사자</span>
        <input className="ec-input" placeholder="검사자명 일부" value={draft.inspector}
          onChange={(e) => onChange({ inspector: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="ec-btn" onClick={onReset}>초기화</button>
        <button className="ec-btn ec-btn-primary" onClick={onApply}>조회</button>
      </div>
    </div>
  )
}
