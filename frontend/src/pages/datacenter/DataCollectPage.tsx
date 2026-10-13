import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { api } from '../../api/client'
import type { CollectSource } from '../../types/api'

/**
 * 데이터센터 > 데이터수집 — 모듈별 실데이터 수집 현황.
 * 수집 소스는 수집데이터등록(collect_sources)에서 관리하는 활성 소스를 읽어 실행한다(더 이상 하드코딩 아님).
 * 실행 = 각 소스의 GET 엔드포인트를 호출해 행수(또는 페이지 totalElements)를 집계.
 */
type Status = '성공' | '실행중' | '실패' | '대기'
interface Row {
  id: number
  source: string
  type: string
  endpoint: string
  paged: boolean
  lastRun: string
  rows: number
  status: Status
}
interface PageRes { totalElements: number }

const statusColor = (s: Status) => ({ 성공: 'var(--ec-success)', 실행중: 'var(--ec-blue)', 실패: 'var(--ec-danger)', 대기: 'var(--ec-text-hint)' }[s])

function nowText() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function DataCollectPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [keyword, setKeyword] = useState('')
  const [logOpen, setLogOpen] = useState(false)  // 수집 로그 모달

  async function runAll(rowsToRun?: Row[]) {
    const target = rowsToRun ?? rows
    if (target.length === 0) return
    setRows((rs) => rs.map((r) => ({ ...r, status: '실행중' as Status })))
    const results = await Promise.allSettled(
      target.map(async (s) => {
        const res = await api.get<unknown>(s.endpoint)
        return s.paged
          ? (res.data as PageRes).totalElements
          : Array.isArray(res.data) ? res.data.length : 0
      }),
    )
    const ts = nowText()
    setRows((rs) => rs.map((r) => {
      const idx = target.findIndex((t) => t.id === r.id)
      if (idx < 0) return r
      const result = results[idx]
      return result.status === 'fulfilled'
        ? { ...r, lastRun: ts, rows: result.value, status: '성공' as Status }
        : { ...r, lastRun: ts, rows: 0, status: '실패' as Status }
    }))
  }

  useEffect(() => {
    api.get<CollectSource[]>('/collect-sources').then((r) => {
      const active = r.data.filter((s) => s.active)
      const initial: Row[] = active.map((s) => ({ id: s.id, source: s.name, type: s.category, endpoint: s.endpoint, paged: s.paged, lastRun: '-', rows: 0, status: '대기' as Status }))
      setRows(initial)
      runAll(initial)
    }).catch(() => setRows([]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const shownRows = rows.filter((r) => !keyword || r.source.includes(keyword) || r.type.includes(keyword))

  /*
   * 네 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. [최근 실행]은 아직 안 돈 줄이 '-' 라
   * 빈 값이 아니다 — 그대로 두면 '-' 가 날짜 사이에 섞인다. 안 돈 줄은 빈 값으로 넘겨
   * 방향과 상관없이 뒤로 보낸다.
   */
  const sort = useTableSort(shownRows, {
    수집소스: (r) => r.source,
    모듈: (r) => r.type,
    '최근 실행': (r) => (r.lastRun === '-' ? '' : r.lastRun),
    상태: (r) => r.status,
  })
  const shown = sort.sorted
  const totalRows = rows.reduce((s, r) => s + r.rows, 0)
  const failCount = rows.filter((r) => r.status === '실패').length

  return (
    <EcListShell
      title="데이터수집"
      search={keyword}
      onSearchChange={setKeyword}
      actions={[{ label: '전체 수집 실행', primary: true, onClick: () => runAll() }, { label: '수집 로그', onClick: () => setLogOpen(true) }]}
    >
      <div className="mb-[8px] text-[12.5px] text-ec-label text-right">
        수집소스 <b className="text-ec-navy">{rows.length}</b>개
        <span className="my-0 mx-[8px] text-ec-off">|</span>
        누적 수집건수 <b className="text-ec-navy">{totalRows.toLocaleString()}</b>
        <span className="my-0 mx-[8px] text-ec-off">|</span>
        실패 <b style={{ color: failCount > 0 ? 'var(--ec-danger)' : 'var(--ec-success)' }}>{failCount}</b>건
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="cursor-pointer" onClick={() => sort.toggle('수집소스')}>수집소스 {sort.mark('수집소스')}</th>
            <th className="w-[100px] text-center cursor-pointer" onClick={() => sort.toggle('모듈')}>모듈 {sort.mark('모듈')}</th>
            <th className="w-[220px]">엔드포인트</th>
            <th className="w-[140px] cursor-pointer" onClick={() => sort.toggle('최근 실행')}>최근 실행 {sort.mark('최근 실행')}</th>
            <th className="w-[100px] text-right">수집건수</th>
            <th className="w-[80px] text-center cursor-pointer" onClick={() => sort.toggle('상태')}>상태 {sort.mark('상태')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="font-semibold">{r.source}</td>
              <td className="text-center">{r.type}</td>
              <td className="text-[11.5px] text-ec-label">GET /api{r.endpoint}</td>
              <td>{r.lastRun}</td>
              <td className="text-right">{r.rows.toLocaleString()}</td>
              <td style={{ textAlign: 'center', color: statusColor(r.status), fontWeight: 700 }}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {logOpen && (() => {
        // 이번 세션의 수집 결과를 로그 형태로 정리 (아직 실행되지 않은 소스는 '대기'로 표기)
        const executed = rows.filter((r) => r.lastRun !== '-')
        return (
          <div onClick={() => setLogOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 660, maxWidth: '94vw', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
              <div className="py-[10px] px-[14px] border-b border-b-ec-line-soft border-solid font-extrabold text-[14px] flex items-center">
                <span>수집 로그 · 이번 세션</span>
                <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setLogOpen(false)}>닫기</button>
              </div>
              <div className="p-[14px] text-[12.5px] text-ec-text">
                <p className="mt-0 mx-0 mb-[8px] text-ec-label">현재 세션에서 실행된 수집 결과입니다. 실행 <b>{executed.length}</b>건 · 실패 <b style={{ color: failCount > 0 ? 'var(--ec-danger)' : 'var(--ec-success)' }}>{failCount}</b>건.</p>
                <table className="w-full text-left">
                  <thead><tr><th className="text-center w-[34px]">No</th><th>수집소스</th><th className="w-[130px]">실행시각</th><th className="w-[90px] text-right">건수</th><th className="w-[70px] text-center">결과</th></tr></thead>
                  <tbody>
                    {executed.length === 0 ? (
                      <tr><td colSpan={5} className="text-center text-ec-hint p-[16px]">아직 실행된 수집이 없습니다. [전체 수집 실행]을 눌러주세요.</td></tr>
                    ) : executed.map((r, i) => (
                      <tr key={r.id}>
                        <td className="text-center text-ec-hint">{i + 1}</td>
                        <td className="font-semibold">{r.source} <span className="text-ec-hint text-[11px]">GET /api{r.endpoint}</span></td>
                        <td>{r.lastRun}</td>
                        <td className="text-right">{r.rows.toLocaleString()}</td>
                        <td style={{ textAlign: 'center', color: statusColor(r.status), fontWeight: 700 }}>{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-[8px] mx-0 mb-0 text-[11.5px] text-ec-warn">* 서버측 수집 이력 저장/조회 API가 없어 이번 브라우저 세션의 실행 결과만 표시합니다.</p>
              </div>
            </div>
          </div>
        )
      })()}
    </EcListShell>
  )
}
