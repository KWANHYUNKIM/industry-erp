import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { stdVsActual } from '../../utils/woEfficiency'

/**
 * 생산관리 > 작업내역현황 — 작업 실적을 기간·조건으로 본다 (/api/work-results).
 *
 * <p>원본 조건 판 실측(사본):
 *   [구분] 내역 | 집계 | 라인별 · 기준일자(금월(~오늘)) · 생산공장 · 작업 · 담당자 ·
 *   작업품목 · 생산품목
 * 우리는 조건 판이 없고 라인 목록 하나뿐이었다 — 기간으로 못 걸러 작업내역 425건이
 * 통째로 쏟아졌고, 공정별로 얼마나 나왔는지는 볼 수가 없었다.
 *
 * <p>원본 라인 열 실측(사본): 일자-No. · 생산공장명 · <b>작업명</b> · <b>생산품목명</b> ·
 * 품목명[규격] · 수량 · <b>자원명</b> · <b>표준작업시간</b> · 작업시간 · <b>차이(표준-실제)</b>.
 * 표준작업시간·차이·자원명·생산품목명이 우리에게 없었다 — 실제 작업시간만 있으면
 * "오래 걸렸다" 를 말할 기준이 없다. BOR(작업소요시간)이 그 기준이라 서버가 그 품목·공정의
 * 표준시간을 계산해 실어 준다.
 *
 * <p>생산공장은 작업내역에 그 값이 없어 칸을 만들지 않는다.
 * 원본의 '작업'은 우리 자료의 공정에 해당한다.
 */
type Mode = '내역' | '집계' | '라인별'
const MODES = ['내역', '집계', '라인별'] as const

interface WorkResult {
  id: number
  workOrderId: number | null
  workOrderNo: string | null
  processId: number | null
  process: string
  productCode: string | null
  productName: string | null
  resourceId: number | null
  resourceName: string | null
  /** BOR 표준작업시간(분). 그 품목·공정의 라우팅이 없으면 null — 0 과 다르다. */
  standardTimeMin: number | null
  worker: string | null
  goodQty: number
  defectQty: number
  workTimeMin: number
  workDate: string
  note: string | null
}

const num = (n: number) => n.toLocaleString('ko-KR')
/** 차이는 부호를 붙여 보여 준다 — 양수면 표준보다 빨리 끝냈다는 뜻이다. */
const gap = (n: number) => (n > 0 ? '+' : '') + n.toLocaleString('ko-KR')
const pct = (defect: number, good: number) => {
  const total = good + defect
  return total > 0 ? ((defect / total) * 100).toFixed(1) : '0.0'
}

export default function WorkResultListPage() {
  const [rows, setRows] = useState<WorkResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [mode, setMode] = useState<Mode>('내역')
  const [process, setProcess] = useState('')
  const [worker, setWorker] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [product, setProduct] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<WorkResult[]>('/work-results')
      setRows([...res.data].sort((a, b) =>
        (a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : b.id - a.id)))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const reset = () => {
    setFrom(init.from); setTo(init.to)
    setMode('내역'); setProcess(''); setWorker(''); setOrderNo(''); setProduct('')
  }

  const shown = useMemo(() => rows.filter((r) => {
    if (r.workDate < from || r.workDate > to) return false
    if (process && !r.process.includes(process)) return false
    if (worker && !(r.worker ?? '').includes(worker)) return false
    if (orderNo && !(r.workOrderNo ?? '').includes(orderNo)) return false
    if (product && !(r.productName ?? '').includes(product)) return false
    return true
  }), [rows, from, to, process, worker, orderNo, product])

  const totals = useMemo(() => shown.reduce(
    (s, r) => ({ good: s.good + r.goodQty, defect: s.defect + r.defectQty, time: s.time + r.workTimeMin }),
    { good: 0, defect: 0, time: 0 },
  ), [shown])

  /**
   * 표준 대 실제. 표준을 모르는 줄은 표준·차이에서 빼고 세기만 한다 —
   * 0 으로 치면 라우팅을 안 세운 품목 때문에 합계 차이가 통째로 마이너스가 된다.
   */
  const time = useMemo(() => stdVsActual(
    shown.map((r) => ({ standard: r.standardTimeMin, actual: r.workTimeMin })),
  ), [shown])

  /** 내역 — 작업지시 하나를 한 줄로 접는다. 지시가 없는 실적은 따로 모은다. */
  const byOrder = useMemo(() => {
    const m = new Map<string, {
      key: string; orderNo: string; date: string; process: string; lineCount: number
      good: number; defect: number; time: number
    }>()
    for (const r of shown) {
      const key = r.workOrderNo ?? '(작업지시 없음)'
      const cur = m.get(key)
      if (!cur) {
        m.set(key, {
          key, orderNo: key, date: r.workDate, process: r.process, lineCount: 1,
          good: r.goodQty, defect: r.defectQty, time: r.workTimeMin,
        })
      } else {
        cur.lineCount += 1
        cur.good += r.goodQty
        cur.defect += r.defectQty
        cur.time += r.workTimeMin
        if (r.workDate > cur.date) cur.date = r.workDate
      }
    }
    return [...m.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [shown])

  /** 집계 — 공정(원본의 '작업') 단위로 모은다. */
  const byProcess = useMemo(() => {
    const m = new Map<string, {
      process: string; count: number; good: number; defect: number; time: number
    }>()
    for (const r of shown) {
      const cur = m.get(r.process)
      if (!cur) m.set(r.process, { process: r.process, count: 1, good: r.goodQty, defect: r.defectQty, time: r.workTimeMin })
      else { cur.count += 1; cur.good += r.goodQty; cur.defect += r.defectQty; cur.time += r.workTimeMin }
    }
    return [...m.values()].sort((a, b) => b.good - a.good)
  }, [shown])

  return (
    <EcListShell
      title="작업내역현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
      >
        <EcCond label="작업(공정)" pick>
          <input className="ec-input" placeholder="공정명 일부" value={process}
                 onChange={(e) => setProcess(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="담당자" pick>
          <input className="ec-input" placeholder="작업자 일부" value={worker}
                 onChange={(e) => setWorker(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="작업지시No." pick>
          <input className="ec-input" placeholder="작업지시번호 일부" value={orderNo}
                 onChange={(e) => setOrderNo(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="생산품목" pick>
          <input className="ec-input" placeholder="품목명 일부" value={product}
                 onChange={(e) => setProduct(e.target.value)} style={{ width: 200 }} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        작업 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        양품 <b style={{ color: '#1c7c3c', fontSize: 14 }}>{num(totals.good)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        불량 <b style={{ color: '#c60a2e', fontSize: 14 }}>{num(totals.defect)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        불량률 <b style={{ color: '#c60a2e', fontSize: 14 }}>{pct(totals.defect, totals.good)}%</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        표준 <b style={{ color: '#3c4553' }}>{num(time.standard)}</b>분
        <span style={{ margin: '0 2px' }}>/</span>
        실제 <b style={{ color: '#3c4553' }}>{num(time.actual)}</b>분
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        차이 <b style={{ color: time.diff < 0 ? '#c60a2e' : '#1c7c3c', fontSize: 14 }}>{gap(time.diff)}</b>
        {time.unknown > 0 && (
          <span style={{ marginLeft: 6, color: '#c07a00' }}>※ 표준 미정 {time.unknown}건 제외</span>
        )}
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>작업(공정)</th>
              <th style={{ width: 90, textAlign: 'right' }}>건수</th>
              <th style={{ width: 110, textAlign: 'right' }}>양품</th>
              <th style={{ width: 110, textAlign: 'right' }}>불량</th>
              <th style={{ width: 110, textAlign: 'right' }}>불량률(%)</th>
              <th style={{ width: 130, textAlign: 'right' }}>작업시간(분)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byProcess.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>작업내역이 없습니다.</td></tr>
            ) : byProcess.map((g, i) => (
              <tr key={g.process}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>{g.process}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                <td style={{ textAlign: 'right', color: '#1c7c3c', fontWeight: 600 }}>{num(g.good)}</td>
                <td style={{ textAlign: 'right', color: g.defect > 0 ? '#c60a2e' : '#8a929c' }}>{num(g.defect)}</td>
                <td style={{ textAlign: 'right', color: g.defect > 0 ? '#c60a2e' : '#8a929c' }}>{pct(g.defect, g.good)}</td>
                <td style={{ textAlign: 'right' }}>{num(g.time)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={2} style={{ textAlign: 'right' }}>합계 ({byProcess.length}공정)</td>
              <td style={{ textAlign: 'right' }}>{num(shown.length)}</td>
              <td style={{ textAlign: 'right', color: '#1c7c3c' }}>{num(totals.good)}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{num(totals.defect)}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{pct(totals.defect, totals.good)}</td>
              <td style={{ textAlign: 'right' }}>{num(totals.time)}</td>
            </tr>
          </tfoot>
        </table>
      ) : mode === '라인별' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 110 }}>일자</th>
              <th style={{ width: 170 }}>작업지시번호</th>
              <th>작업(공정)</th>
              <th style={{ width: 160 }}>생산품목명</th>
              <th style={{ width: 110 }}>담당자</th>
              <th style={{ width: 120 }}>자원명</th>
              <th style={{ width: 100, textAlign: 'right' }}>양품</th>
              <th style={{ width: 100, textAlign: 'right' }}>불량</th>
              <th style={{ width: 120, textAlign: 'right' }}>표준작업시간</th>
              <th style={{ width: 120, textAlign: 'right' }}>작업시간(분)</th>
              <th style={{ width: 130, textAlign: 'right' }}>차이(표준-실제)</th>
              <th style={{ width: 100, textAlign: 'right' }}>불량률(%)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>작업내역이 없습니다.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.workDate}</td>
                <td style={{ fontFamily: 'monospace', color: r.workOrderNo ? '#5a626e' : '#c9ced6' }}>
                  {r.workOrderNo ?? '-'}
                </td>
                <td>{r.process}</td>
                <td>{r.productName ?? ''}</td>
                <td>{r.worker ?? ''}</td>
                <td>{r.resourceName ?? ''}</td>
                <td style={{ textAlign: 'right', color: '#1c7c3c', fontWeight: 600 }}>{num(r.goodQty)}</td>
                <td style={{ textAlign: 'right', color: r.defectQty > 0 ? '#c60a2e' : '#8a929c' }}>{num(r.defectQty)}</td>
                <td style={{ textAlign: 'right', color: r.standardTimeMin == null ? '#c9ced6' : undefined }}>
                  {r.standardTimeMin == null ? '-' : num(r.standardTimeMin)}
                </td>
                <td style={{ textAlign: 'right' }}>{num(r.workTimeMin)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: r.standardTimeMin == null ? '#c9ced6' : (r.standardTimeMin - r.workTimeMin) < 0 ? '#c60a2e' : '#1c7c3c' }}>
                  {r.standardTimeMin == null ? '-' : gap(r.standardTimeMin - r.workTimeMin)}
                </td>
                <td style={{ textAlign: 'right', color: r.defectQty > 0 ? '#c60a2e' : '#8a929c' }}>
                  {pct(r.defectQty, r.goodQty)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={7} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right', color: '#1c7c3c' }}>{num(totals.good)}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{num(totals.defect)}</td>
              <td style={{ textAlign: 'right' }}>{num(time.standard)}</td>
              <td style={{ textAlign: 'right' }}>{num(totals.time)}</td>
              <td style={{ textAlign: 'right', color: time.diff < 0 ? '#c60a2e' : '#1c7c3c' }}>{gap(time.diff)}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{pct(totals.defect, totals.good)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 110 }}>일자</th>
              <th style={{ width: 200 }}>작업지시번호</th>
              <th>작업(공정)</th>
              <th style={{ width: 90, textAlign: 'right' }}>작업건수</th>
              <th style={{ width: 110, textAlign: 'right' }}>양품</th>
              <th style={{ width: 110, textAlign: 'right' }}>불량</th>
              <th style={{ width: 130, textAlign: 'right' }}>작업시간(분)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byOrder.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>작업내역이 없습니다.</td></tr>
            ) : byOrder.map((g, i) => (
              <tr key={g.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{g.date}</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{g.orderNo}</td>
                <td>{g.process}{g.lineCount > 1 ? ` 외 ${g.lineCount - 1}건` : ''}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.lineCount)}</td>
                <td style={{ textAlign: 'right', color: '#1c7c3c', fontWeight: 600 }}>{num(g.good)}</td>
                <td style={{ textAlign: 'right', color: g.defect > 0 ? '#c60a2e' : '#8a929c' }}>{num(g.defect)}</td>
                <td style={{ textAlign: 'right' }}>{num(g.time)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({byOrder.length}건)</td>
              <td style={{ textAlign: 'right' }}>{num(shown.length)}</td>
              <td style={{ textAlign: 'right', color: '#1c7c3c' }}>{num(totals.good)}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{num(totals.defect)}</td>
              <td style={{ textAlign: 'right' }}>{num(totals.time)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </EcListShell>
  )
}
