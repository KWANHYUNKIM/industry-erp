import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api } from '../../api/client'

/** 데이터센터 > 데이터수집 — 모듈별 실데이터 수집 현황 (기존 read 엔드포인트 집계) */
type Status = '성공' | '실행중' | '실패' | '대기'
interface Row {
  id: number
  source: string
  type: string
  endpoint: string
  lastRun: string
  rows: number
  status: Status
}
interface PageRes { totalElements: number }

/** 수집 대상: 모듈명 · 엔드포인트 · 응답에서 건수 뽑는 방법 */
const SOURCES: { id: number; source: string; type: string; endpoint: string; paged?: boolean }[] = [
  { id: 1, source: '품목 마스터', type: '기준정보', endpoint: '/items' },
  { id: 2, source: '거래처 마스터', type: '기준정보', endpoint: '/partners' },
  { id: 3, source: '창고 마스터', type: '기준정보', endpoint: '/warehouses' },
  { id: 4, source: '현재고 (품목x창고)', type: '재고', endpoint: '/stock' },
  { id: 5, source: '재고 수불 이력', type: '재고', endpoint: '/stock/transactions?page=0&size=1', paged: true },
  { id: 6, source: '판매 전표', type: '영업', endpoint: '/sales' },
  { id: 7, source: '구매 전표', type: '구매', endpoint: '/purchases' },
  { id: 8, source: '작업지시', type: '생산', endpoint: '/work-orders' },
  { id: 9, source: '생산실적', type: '생산', endpoint: '/productions' },
]

const statusColor = (s: Status) => ({ 성공: '#1c7c3c', 실행중: 'var(--ec-blue)', 실패: '#c60a2e', 대기: '#8a929c' }[s])

function nowText() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function DataCollectPage() {
  const [rows, setRows] = useState<Row[]>(
    SOURCES.map((s) => ({ id: s.id, source: s.source, type: s.type, endpoint: s.endpoint, lastRun: '-', rows: 0, status: '대기' as Status })),
  )
  const [keyword, setKeyword] = useState('')

  async function runAll() {
    setRows((rs) => rs.map((r) => ({ ...r, status: '실행중' as Status })))
    const results = await Promise.allSettled(
      SOURCES.map(async (s) => {
        const res = await api.get<unknown>(s.endpoint)
        const count = s.paged
          ? (res.data as PageRes).totalElements
          : Array.isArray(res.data) ? res.data.length : 0
        return count
      }),
    )
    const ts = nowText()
    setRows((rs) => rs.map((r, i) => {
      const result = results[i]
      return result.status === 'fulfilled'
        ? { ...r, lastRun: ts, rows: result.value, status: '성공' as Status }
        : { ...r, lastRun: ts, rows: 0, status: '실패' as Status }
    }))
  }

  useEffect(() => { runAll() }, [])

  const shown = rows.filter((r) => !keyword || r.source.includes(keyword) || r.type.includes(keyword))
  const totalRows = rows.reduce((s, r) => s + r.rows, 0)
  const failCount = rows.filter((r) => r.status === '실패').length

  return (
    <EcListShell
      title="데이터수집"
      search={keyword}
      onSearchChange={setKeyword}
      actions={[{ label: '전체 수집 실행', primary: true, onClick: runAll }, { label: '수집 로그' }]}
    >
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        수집소스 <b style={{ color: 'var(--ec-blue-dark)' }}>{rows.length}</b>개
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        누적 수집건수 <b style={{ color: 'var(--ec-blue-dark)' }}>{totalRows.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        실패 <b style={{ color: failCount > 0 ? '#c60a2e' : '#1c7c3c' }}>{failCount}</b>건
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>수집소스 ▼</th>
            <th style={{ width: 100, textAlign: 'center' }}>모듈 ▼</th>
            <th style={{ width: 220 }}>엔드포인트</th>
            <th style={{ width: 140 }}>최근 실행 ▼</th>
            <th style={{ width: 100, textAlign: 'right' }}>수집건수</th>
            <th style={{ width: 80, textAlign: 'center' }}>상태 ▼</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 수집 소스가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontWeight: 600 }}>{r.source}</td>
              <td style={{ textAlign: 'center' }}>{r.type}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#5a626e' }}>GET /api{r.endpoint}</td>
              <td>{r.lastRun}</td>
              <td style={{ textAlign: 'right' }}>{r.rows.toLocaleString()}</td>
              <td style={{ textAlign: 'center', color: statusColor(r.status), fontWeight: 700 }}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
