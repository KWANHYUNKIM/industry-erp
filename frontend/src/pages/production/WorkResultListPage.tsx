import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { subtotalBy } from '../../utils/subtotalBy'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { stdVsActual } from '../../utils/woEfficiency'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'

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
 * <p>원본의 '작업'은 우리 자료의 공정에 해당한다.
 */
type Mode = '내역' | '집계' | '라인별'
const MODES = ['내역', '집계', '라인별'] as const

interface WorkResult {
  id: number
  workOrderId: number | null
  workOrderNo: string | null
  processId: number | null
  process: string
  warehouseName: string | null
  productCode: string | null
  productName: string | null
  /** 원본 라인 열의 [품목명[규격]] — 작업품목. 생산품목명과 다른 열이다. */
  workItemName: string | null
  workItemSpec: string | null
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
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['employees', 'items'])
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
  /**
   * 원본 작업내역현황 조건 실측(사본): 구분 · 기준일자 · <b>생산공장</b> · 작업 · 담당자 ·
   * <b>작업품목</b> · 생산품목. 둘이 빠져 있었다 — 작업품목은 이번에 자리가 생겨서,
   * 생산공장은 응답에 있는데 조건이 없어서 못 걸렀다.
   */
  const [workItem, setWorkItem] = useState('')
  const [plant, setPlant] = useState('')

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
    setWorkItem(''); setPlant('')
  }

  const shown = useMemo(() => rows.filter((r) => {
    if (r.workDate < from || r.workDate > to) return false
    if (process && !r.process.includes(process)) return false
    if (worker && !(r.worker ?? '').includes(worker)) return false
    if (orderNo && !(r.workOrderNo ?? '').includes(orderNo)) return false
    if (product && !(r.productName ?? '').includes(product)) return false
    if (workItem && !(r.workItemName ?? '').includes(workItem)) return false
    if (plant && !(r.warehouseName ?? '').includes(plant)) return false
    return true
  }), [rows, from, to, process, worker, orderNo, product, workItem, plant])

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
  /*
   * 원본 [정렬/소계기준]. 우리는 <b>공정으로만</b> 묶고 있었는데, 같은 자료를
   * 생산품목별로 보고 싶은 사람과 작업자별·생산공장별로 보고 싶은 사람이 따로 있다.
   */
  const SUBTOTALS = ['작업(공정)', '생산품목', '작업자', '생산공장'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('작업(공정)')
  const keyOf = (r: WorkResult) => (
    subtotal === '생산품목' ? r.productName
      : subtotal === '작업자' ? r.worker
        : subtotal === '생산공장' ? r.warehouseName
          : r.process)

  const byProcess = useMemo(() => {
    return subtotalBy(shown, keyOf, {
      good: (r) => r.goodQty, defect: (r) => r.defectQty, time: (r) => r.workTimeMin,
    })
      .map((g) => ({ process: g.label, count: g.count, good: g.sums.good, defect: g.sums.defect, time: g.sums.time }))
      .sort((a, b) => b.good - a.good)
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [shown, subtotal])
  const [view, setView] = useState<'표' | '그래프'>('표')
  /* 원본 [그래프로 보기]. 작업내역은 <b>어느 공정에서 얼마나 나왔나</b> 를 보는 화면이다. */
  const chartRows = useMemo(() =>
    mode === '집계'
      ? byProcess.map((r) => ({ label: r.process, value: r.good }))
      : shown.map((r) => ({ label: `${r.workDate} ${r.process}`, value: r.goodQty })),
    [mode, byProcess, shown])

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
        view={view} onViewChange={setView}
        subtotal={subtotal} subtotals={SUBTOTALS}
        onSubtotalChange={(v) => setSubtotal(v as typeof SUBTOTALS[number])}
      >
        <EcCond label="작업(공정)" pick>
          <input className="ec-input" placeholder="공정명 일부" value={process}
                 onChange={(e) => setProcess(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="생산공장" pick>
          <input className="ec-input" placeholder="공장명 일부" value={plant}
                 onChange={(e) => setPlant(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={200} emptyLabel="전체"
                           value={worker} onChange={(v) => setWorker(v)}
                           items={pickers.employees} />
        </EcCond>
        <EcCond label="작업지시No." pick>
          <input className="ec-input" placeholder="작업지시번호 일부" value={orderNo}
                 onChange={(e) => setOrderNo(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        {/* 원본 조건의 [작업품목]. 그 작업이 실제로 다루는 품목 — 생산품목과 다르다. */}
        <EcCond label="작업품목" pick>
          <input className="ec-input" placeholder="작업품목명 일부" value={workItem}
                 onChange={(e) => setWorkItem(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="생산품목" pick>
          <CodePickerField label="생산품목" hideLabel width={200} emptyLabel="전체"
                           value={product} onChange={(v) => setProduct(v)}
                           items={pickers.items} />
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

      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 개" emptyText="조회된 작업내역이 없습니다." />
      ) : mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>{subtotal}</th>
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
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
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
              <td colSpan={2} style={{ textAlign: 'right' }}>합계 ({byProcess.length}건 묶음)</td>
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
              {/*
                원본 작업내역현황은 일자와 번호를 <b>한 칸</b>에 적는다([일자-No.], 사본 실측).
                우리는 둘로 나눠 두어 원본과 차례가 어긋나 있었다 — 작업지시서조회·현황은 이미 합쳐 두었다.
              */}
              <th style={{ width: 200, textAlign: 'center' }}>일자-No.</th>
              <th style={{ width: 130 }}>생산공장명</th>
              {/* 원본 열 이름은 [작업명]이다. */}
              <th>작업명</th>
              <th style={{ width: 160 }}>생산품목명</th>
              {/* 원본 라인 열: … 작업명 · 생산품목명 · [품목명[규격]] · 수량 · 자원명 · … */}
              <th style={{ width: 160 }}>품목명[규격]</th>
              {/* 원본 [수량]. 우리는 양품·불량을 나눠 세지만 원본은 그 둘을 합한 작업량 한 칸을 둔다. */}
              <th style={{ width: 100, textAlign: 'right' }}>수량</th>
              <th style={{ width: 110 }}>담당자</th>
              <th style={{ width: 120 }}>자원명</th>
              <th style={{ width: 100, textAlign: 'right' }}>양품</th>
              <th style={{ width: 100, textAlign: 'right' }}>불량</th>
              <th style={{ width: 120, textAlign: 'right' }}>표준작업시간</th>
              <th style={{ width: 120, textAlign: 'right' }}>작업시간</th>
              <th style={{ width: 130, textAlign: 'right' }}>차이(표준-실제)</th>
              <th style={{ width: 100, textAlign: 'right' }}>불량률(%)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={15} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={15} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>
                  {r.workDate}{r.workOrderNo ? ' ' + r.workOrderNo : ''}
                </td>
                <td style={{ color: r.warehouseName ? undefined : '#c9ced6' }}>{r.warehouseName ?? ''}</td>
                {/*
                  <b>마스터에 없는 공정</b>은 그렇다고 말해 준다. 공정명은 자유입력이라
                  '조립 ' 처럼 한 글자만 달라도 마스터에 안 걸리는데, 그러면 아래
                  [표준작업시간]이 조용히 빈다 — 왜 비었는지 화면 어디에도 없었다.
                  응답은 진작 그 연결(processId)을 들고 왔는데 <b>아무도 안 보고</b> 있었다.
                */}
                <td>
                  {r.process}
                  {r.processId == null && (
                    <span title="공정 마스터에 없는 이름이라 표준시간을 낼 수 없습니다"
                          style={{ marginLeft: 4, fontSize: 11, color: '#c07a00' }}>· 마스터 없음</span>
                  )}
                </td>
                <td>{r.productName ?? ''}</td>
                {/* 작업품목. 안 적힌 옛 자료는 비워 둔다 — 생산품목으로 채우면 두 열이 늘 같아진다. */}
                <td style={{ color: r.workItemName ? undefined : '#c9ced6' }}>
                  {r.workItemName ? `${r.workItemName}${r.workItemSpec ? `[${r.workItemSpec}]` : ''}` : '-'}
                </td>
                <td style={{ textAlign: 'right' }}>{num(r.goodQty + r.defectQty)}</td>
                <td>{r.worker ?? ''}</td>
                <td>{r.resourceName ?? ''}</td>
                <td style={{ textAlign: 'right', color: '#1c7c3c', fontWeight: 600 }}>{num(r.goodQty)}</td>
                <td style={{ textAlign: 'right', color: r.defectQty > 0 ? '#c60a2e' : '#8a929c' }}>{num(r.defectQty)}</td>
                {/*
                  표준이 빈 까닭은 둘이고 <b>고치는 방법이 다르다</b> —
                  공정이 마스터에 안 걸렸으면 <b>이름을 고쳐야</b> 하고,
                  걸렸는데 없으면 그 품목·공정의 <b>BOR 을 세워야</b> 한다.
                  '-' 만 찍어 두면 어느 쪽인지 몰라 엉뚱한 데를 뒤진다.
                */}
                <td style={{ textAlign: 'right', color: r.standardTimeMin == null ? '#c9ced6' : undefined }}
                    title={r.standardTimeMin != null ? undefined
                      : r.processId == null ? '공정이 마스터에 없습니다 — 공정명을 고치세요'
                        : '이 품목·공정의 BOR(작업소요시간)이 없습니다'}>
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
              <td colSpan={9} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
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
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : byOrder.map((g, i) => (
              <tr key={g.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{dateText(g.date)}</td>
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
