import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'

/**
 * 생산관리 > 작업 > 작업내역조회 (/api/work-results).
 *
 * <p>원본 열 실측(사본): <b>일자-No.</b> · 생산공장명 · <b>작업품목명[규격명]</b> ·
 * <b>작업수량</b> · <b>작업시간</b>. 탭은 [전체] 하나, 버튼은 신규(F2) · 보내기 ·
 * 바코드(품목) · 선택삭제 · 이력조회 · 인쇄다.
 *
 * <p>원본 [작업] 메뉴는 입력 · <b>조회</b> · 현황 셋인데 우리는 조회가 없었다.
 * 입력 화면이 목록을 겸하고 있었지만 거기서는 기간으로 못 거르고 한 줄씩만 지울 수 있어,
 * "지난달에 잘못 올린 작업내역을 골라 지운다" 를 할 자리가 없었다. 현황은 집계를 보는
 * 자리라 전표를 지우지 않는다 — 그래서 조회를 따로 둔다.
 *
 * <p><b>작업품목</b>은 작업내역이 실제로 든다(work_results.work_item_id). 예전에는 그 자리에
 * 공정명을 대신 넣어 '작업품목(공정)' 이라고 적어 두었는데, 원본의 작업품목은 품목이지
 * 공정이 아니다 — 품목별로 작업량을 셀 수가 없었다. 아직 안 적힌 옛 자료는 빈 칸이다.
 */
interface Row {
  id: number
  workOrderNo: string | null
  process: string
  /** 원본 [작업품목명[규격명]]. 옛 자료에는 없다. */
  workItemCode: string | null
  workItemName: string | null
  workItemSpec: string | null
  warehouseName: string | null
  productCode: string | null
  productName: string | null
  resourceName: string | null
  worker: string | null
  goodQty: number
  defectQty: number
  workTimeMin: number
  workDate: string
  note: string | null
}

const num = (n: number) => n.toLocaleString('ko-KR')

export default function WorkResultInquiryPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [process, setProcess] = useState('')
  const [product, setProduct] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<Row[]>('/work-results')
      setRows([...res.data].sort((a, b) =>
        (a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : b.id - a.id)))
      setChecked(new Set())
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => rows.filter((r) => {
    if (r.workDate < from || r.workDate > to) return false
    if (process && !r.process.includes(process)) return false
    if (product && !(r.productName ?? '').includes(product)) return false
    return true
  }), [rows, from, to, process, product])

  const totals = useMemo(() => shown.reduce(
    (s, r) => ({ qty: s.qty + r.goodQty + r.defectQty, time: s.time + r.workTimeMin }),
    { qty: 0, time: 0 },
  ), [shown])

  const toggle = (id: number) => setChecked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const allOn = shown.length > 0 && shown.every((r) => checked.has(r.id))
  const toggleAll = () => setChecked(allOn ? new Set() : new Set(shown.map((r) => r.id)))

  async function removeChecked() {
    if (checked.size === 0) return setError('지울 작업내역을 고르세요.')
    if (!confirm(`${checked.size}건을 삭제할까요?`)) return
    setError('')
    try {
      for (const id of checked) await api.delete(`/work-results/${id}`)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  return (
    <EcListShell
      title="작업내역조회"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '신규(F2)', onClick: () => navigate('/production/work-result') },
        { label: `선택삭제${checked.size ? ` (${checked.size})` : ''}`, onClick: removeChecked },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div className="ec-pills" style={{ marginBottom: 8 }}>
        <button type="button" className="ec-pill no-ec active">전체</button>
      </div>

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="작업일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
          <span style={{ marginLeft: 6, display: 'inline-flex', gap: 3 }}>
            {STATUS_PICKS.slice(0, 4).map((label) => (
              <button key={label} type="button" className="ec-btn"
                      onClick={() => { const r = periodOf(label); if (r) { setFrom(r.from); setTo(r.to) } }}>
                {label}
              </button>
            ))}
          </span>
        </EcCond>
        <EcCond label="작업(공정)" pick>
          <input className="ec-input" placeholder="공정명 일부" value={process}
                 onChange={(e) => setProcess(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="생산품목" pick>
          <input className="ec-input" placeholder="품목명 일부" value={product}
                 onChange={(e) => setProduct(e.target.value)} style={{ width: 180 }} />
        </EcCond>
      </ul>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {shown.length}건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        작업수량 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{num(totals.qty)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        작업시간 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{num(totals.time)}</b>분
      </div>

      <div className="overflow-x-auto">
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34, textAlign: 'center' }}>
                <input type="checkbox" checked={allOn} onChange={toggleAll} />
              </th>
              <th style={{ width: 110 }}>일자</th>
              <th style={{ width: 170 }}>작업지시No.</th>
              <th style={{ width: 130 }}>생산공장명</th>
              <th style={{ width: 170 }}>작업품목명[규격명]</th>
              <th style={{ width: 120 }}>작업(공정)</th>
              <th>생산품목명</th>
              <th style={{ width: 120 }}>자원명</th>
              <th style={{ width: 100 }}>담당자</th>
              <th style={{ width: 110, textAlign: 'right' }}>작업수량</th>
              <th style={{ width: 110, textAlign: 'right' }}>작업시간</th>
              <th style={{ width: 160 }}>적요</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td style={{ fontFamily: 'monospace' }}>{r.workDate}</td>
                <td style={{ fontFamily: 'monospace', color: r.workOrderNo ? '#5a626e' : '#c9ced6' }}>{r.workOrderNo ?? '-'}</td>
                <td style={{ color: r.warehouseName ? undefined : '#c9ced6' }}>{r.warehouseName ?? '-'}</td>
                {/* 원본은 '작업품목명[규격명]'. 안 적힌 옛 자료는 비워 둔다 — 공정명으로 채우면 또 거짓말이 된다. */}
                <td style={{ color: r.workItemName ? undefined : '#c9ced6' }}>
                  {r.workItemName ? `${r.workItemName}${r.workItemSpec ? `[${r.workItemSpec}]` : ''}` : '-'}
                </td>
                <td>{r.process}</td>
                <td>{r.productName ? `[${r.productCode}] ${r.productName}` : ''}</td>
                <td style={{ color: r.resourceName ? undefined : '#c9ced6' }}>{r.resourceName ?? '-'}</td>
                <td>{r.worker ?? ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{num(r.goodQty + r.defectQty)}</td>
                <td style={{ textAlign: 'right' }}>{num(r.workTimeMin)}</td>
                <td style={{ color: '#8a929c' }}>{r.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={9} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right' }}>{num(totals.qty)}</td>
              <td style={{ textAlign: 'right' }}>{num(totals.time)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </EcListShell>
  )
}
