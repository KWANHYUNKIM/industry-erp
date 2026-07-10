import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { exportTableToXlsx } from '../../utils/excel'
import { printTable } from '../../utils/print'
import { findDataTable } from '../../utils/tableExport'
import type { Attendance } from '../../api/types'

const TITLE = '출/퇴근기록부(ID)'

const fmtMin = (m: number | null) => {
  if (m == null) return ''
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h}시간 ${mm}분`
}

/** 그룹웨어 > 근태관리 > 출/퇴근기록부 — 출근/퇴근 처리 + 현황 */
export default function AttendancePage() {
  const [rows, setRows] = useState<Attendance[]>([])
  const [today, setToday] = useState<Attendance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 표 내보내기/인쇄/검색 직접 배선
  const bodyRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [optionOpen, setOptionOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 2500)
  }

  // 렌더된 tbody 행을 텍스트 부분일치로 숨기는 클라이언트 필터
  const filterRows = (q: string) => {
    const table = findDataTable(bodyRef.current)
    if (!table) return
    const needle = q.trim().toLowerCase()
    let hit = 0
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const row = tr as HTMLTableRowElement
      if (row.cells.length === 1 && row.cells[0].colSpan > 1) return
      const match = !needle || (row.textContent ?? '').toLowerCase().includes(needle)
      row.style.display = match ? '' : 'none'
      if (match) hit += 1
    })
    if (needle) flash(`'${q.trim()}' 검색결과 ${hit}건`)
  }

  async function doExcel() {
    const table = findDataTable(bodyRef.current)
    if (!table) return flash('이 화면에는 내보낼 표가 없습니다.')
    if (!(await exportTableToXlsx(table, TITLE))) flash('내보낼 자료가 없습니다.')
  }

  function doPrint() {
    const table = findDataTable(bodyRef.current)
    if (!table) return flash('이 화면에는 인쇄할 표가 없습니다.')
    if (!printTable(table, TITLE)) flash('인쇄할 자료가 없습니다.')
  }

  async function load() {
    setLoading(true)
    try {
      const [list, t] = await Promise.all([
        api.get<Attendance[]>('/attendances'),
        api.get<Attendance | ''>('/attendances/today'),
      ])
      setRows(list.data)
      setToday(t.data || null)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function punch(kind: 'clock-in' | 'clock-out') {
    setError('')
    try {
      await api.post(`/attendances/${kind}`)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>출/퇴근기록부(ID)</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
          <button className="ec-btn" onClick={load}>새로고침</button>
          <input
            className="ec-input"
            placeholder="입력 후 [Enter]"
            value={search}
            onChange={(e) => { setSearch(e.target.value); filterRows(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') filterRows(search) }}
            style={{ width: 150 }}
          />
          <button className="ec-btn ec-btn-primary" onClick={() => filterRows(search)}>Search(F3)</button>
          <button className="ec-btn" onClick={() => setOptionOpen((v) => !v)}>Option</button>
          <button className="ec-btn" onClick={() => setHelpOpen(true)}>도움말</button>

          {optionOpen && (
            <>
              <div onClick={() => setOptionOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 41, background: '#fff', border: '1px solid #c9d1da', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,.12)', minWidth: 150, padding: 4 }}>
                {[
                  { label: 'Excel 내려받기', run: () => { void doExcel() } },
                  { label: '인쇄', run: () => doPrint() },
                  { label: '검색조건 초기화', run: () => { setSearch(''); filterRows('') } },
                ].map((m) => (
                  <button key={m.label} onClick={() => { setOptionOpen(false); m.run() }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 12, background: 'none', border: 0, cursor: 'pointer' }}>{m.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {/* 오늘 출퇴근 카드 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, border: '1px solid var(--ec-border)', background: '#fff', padding: '14px 18px', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)' }}>오늘 근무</div>
        <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
          <div><span style={{ color: '#8a929c' }}>출근</span> <b style={{ marginLeft: 6 }}>{today?.clockIn ?? '--:--'}</b></div>
          <div><span style={{ color: '#8a929c' }}>퇴근</span> <b style={{ marginLeft: 6 }}>{today?.clockOut ?? '--:--'}</b></div>
          <div><span style={{ color: '#8a929c' }}>근무시간</span> <b style={{ marginLeft: 6 }}>{fmtMin(today?.workMinutes ?? null) || '-'}</b></div>
          {today?.late && <span style={{ color: '#c60a2e', fontWeight: 700 }}>지각</span>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="ec-btn ec-btn-primary" onClick={() => punch('clock-in')} disabled={!!today?.clockIn}>출근하기</button>
          <button className="ec-btn" onClick={() => punch('clock-out')} disabled={!today?.clockIn || !!today?.clockOut}>퇴근하기</button>
        </div>
      </div>

      <div ref={bodyRef} style={{ flex: 1, minHeight: 0 }}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>일자 ▼</th>
              <th>사용자</th>
              <th style={{ textAlign: 'center' }}>출근</th>
              <th style={{ textAlign: 'center' }}>퇴근</th>
              <th style={{ textAlign: 'center' }}>근무시간</th>
              <th style={{ textAlign: 'center' }}>지각</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>출퇴근 기록이 없습니다.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.workDate}</td>
                <td>{r.userName}</td>
                <td style={{ textAlign: 'center' }}>{r.clockIn ?? ''}</td>
                <td style={{ textAlign: 'center' }}>{r.clockOut ?? ''}</td>
                <td style={{ textAlign: 'center' }}>{fmtMin(r.workMinutes)}</td>
                <td style={{ textAlign: 'center' }}>{r.late ? <span style={{ color: '#c60a2e' }}>지각</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #eef1f5' }}>
        <button className="ec-btn" onClick={() => { void doExcel() }}>Excel</button>
        <button className="ec-btn" onClick={() => doPrint()}>인쇄</button>
      </div>

      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 420, maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>{TITLE} · 도움말</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setHelpOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <ul style={{ paddingLeft: 16, margin: 0 }}>
                <li>상단 <b>출근하기·퇴근하기</b> 버튼으로 오늘 근무를 기록합니다.</li>
                <li><b>Search(F3)</b> — 일자·사용자 등 입력한 낱말이 포함된 행만 추립니다.</li>
                <li><b>Excel/인쇄</b> — 지금 화면의 출퇴근 기록표를 파일로 내려받거나 인쇄합니다.</li>
                <li>정시보다 늦게 출근하면 <b>지각</b>으로 표시됩니다.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
