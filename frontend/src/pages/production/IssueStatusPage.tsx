import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import type { Warehouse } from '../../api/types'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { subtotalBy } from '../../utils/subtotalBy'

/**
 * 생산관리 > 생산불출현황 — 자재 불출을 기간·조건으로 본다 (/api/material-issues).
 *
 * <p>원본 조건 판 실측(사본):
 *   [구분] 내역 | 집계 | 라인별 · 일자(금월(~오늘)) · 창고 · 프로젝트 · 품목 · 담당자 · 적요
 * 우리는 조건 판이 없고 <b>자재별 집계 하나</b>만 보여 줬다. 원본의 세 시야 중 '집계'만 있고
 * 언제·어느 작업지시로 나갔는지는 볼 수가 없었다.
 *
 * <p>우리 불출 자료는 한 건이 자재 한 줄이라 원본의 '내역'(전표 단위)에 대응하는 것이
 * <b>작업지시 단위</b>다. 그렇게 접는다.
 *
 * <p>[담당자] 는 예전에 "불출에 그 값이 없어" 만들지 않았는데, 이제 불출이 담당자를 든다
 * (원본 생산불출입력 머리의 항목이다). 프로젝트는 여전히 없어 만들지 않는다.
 * 담당자 <b>이름</b>은 서버가 못 붙인다 — production 은 hr 을 참조할 수 없어
 * (hr → accounting → production 순환) id 만 온다. 화면이 사원 목록에서 붙인다.
 */
type Mode = '내역' | '집계' | '라인별'
const MODES = ['내역', '집계', '라인별'] as const

interface MaterialIssue {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  warehouseId: number
  warehouseName: string
  /** 원본 생산불출조회 열은 [보내는창고명]과 [받는공장명] 둘이다. */
  toWarehouseName: string | null
  workOrderId: number
  workOrderNo: string
  /** 담당자(사원) id. 이름은 화면이 붙인다. */
  employeeId: number | null
  qty: number
  issueDate: string
  note: string | null
}

const num = (n: number) => n.toLocaleString('ko-KR')

export default function IssueStatusPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items', 'employees'])
  const [rows, setRows] = useState<MaterialIssue[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [mode, setMode] = useState<Mode>('내역')
  const [view, setView] = useState<'표' | '그래프'>('표')
  const [warehouseId, setWarehouseId] = useState('')
  const [item, setItem] = useState('')
  const [note, setNote] = useState('')
  const [emp, setEmp] = useState('')
  /** 담당자 이름표. 서버가 못 붙여서 화면이 붙인다. */
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [issues, wh, emps] = await Promise.all([
        api.get<MaterialIssue[]>('/material-issues'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<{ id: number; name: string }[]>('/employees'),
      ])
      setRows([...issues.data].sort((a, b) =>
        (a.issueDate < b.issueDate ? 1 : a.issueDate > b.issueDate ? -1 : b.id - a.id)))
      setWarehouses(wh.data)
      setEmployees(emps.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const reset = () => {
    setFrom(init.from); setTo(init.to)
    setMode('내역'); setWarehouseId(''); setItem(''); setNote(''); setEmp('')
  }

  /** 담당자 이름. 서버가 못 붙여서 화면이 붙인다. */
  const empName = (id: number | null) =>
    id == null ? '' : (employees.find((x) => x.id === id)?.name ?? '')

  /*
   * 원본 [정렬/소계기준]. 불출은 자재마다·창고마다 여러 줄로 흩어져,
   * 어느 자재가 얼마나 나갔는지를 눈으로 더해야 했다.
   */
  const SUBTOTALS = ['자재', '보내는창고', '받는공장', '담당자'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('자재')
  const shown = useMemo(() => rows.filter((r) => {
    if (r.issueDate < from || r.issueDate > to) return false
    if (warehouseId && String(r.warehouseId) !== warehouseId) return false
    if (item && !`${r.itemCode} ${r.itemName}`.includes(item)) return false
    if (note && !(r.note ?? '').includes(note)) return false
    if (emp && !empName(r.employeeId).includes(emp)) return false
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, from, to, warehouseId, item, note, emp, employees])

  /** 내역 — 작업지시 하나를 한 줄로 접는다. */
  const byOrder = useMemo(() => {
    const m = new Map<number, {
      workOrderId: number; workOrderNo: string; date: string; warehouseName: string; toWarehouseName: string | null
      itemName: string; lineCount: number; qty: number
    }>()
    for (const r of shown) {
      const cur = m.get(r.workOrderId)
      if (!cur) {
        m.set(r.workOrderId, {
          workOrderId: r.workOrderId, workOrderNo: r.workOrderNo, date: r.issueDate,
          warehouseName: r.warehouseName, toWarehouseName: r.toWarehouseName,
          itemName: r.itemName, lineCount: 1, qty: r.qty,
        })
      } else {
        cur.lineCount += 1
        cur.qty += r.qty
        if (r.issueDate > cur.date) cur.date = r.issueDate
      }
    }
    return [...m.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [shown])

  /** 집계 — 자재별로 모은다. 예전 화면이 보여 주던 것이 이거다. */
  const byItem = useMemo(() => {
    const m = new Map<number, {
      itemId: number; itemCode: string; itemName: string; unit: string
      count: number; totalQty: number; lastDate: string
    }>()
    for (const r of shown) {
      const cur = m.get(r.itemId)
      if (!cur) {
        m.set(r.itemId, {
          itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName, unit: r.unit,
          count: 1, totalQty: r.qty, lastDate: r.issueDate,
        })
      } else {
        cur.count += 1
        cur.totalQty += r.qty
        if (r.issueDate > cur.lastDate) cur.lastDate = r.issueDate
      }
    }
    return [...m.values()].sort((a, b) => b.totalQty - a.totalQty)
  }, [shown])

  const totalQty = shown.reduce((n, r) => n + r.qty, 0)

  /*
   * 원본 [데이터 보기형식] · [그래프로 보기]. 표만 있으면 "어느 자재가 많이 나갔나" 를
   * 숫자 스무 줄에서 눈으로 찾아야 한다 — 현황 화면을 여는 이유가 대개 그것이다.
   * 무엇을 그릴지는 지금 보고 있는 [구분]을 따라간다.
   */
  const chartRows = useMemo(() => {
    if (mode === '집계') return byItem.map((r) => ({ label: r.itemName, value: r.totalQty }))
    if (mode === '내역') return byOrder.map((g) => ({ label: g.workOrderNo, value: g.qty }))
    return shown.map((r) => ({ label: `${r.issueDate} ${r.itemName}`, value: r.qty }))
  }, [mode, byItem, byOrder, shown])

  return (
    <EcListShell
      title="생산불출현황"
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
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={warehouseId} onChange={(v) => setWarehouseId(v)}
                           items={warehouses.map((w) => ({ value: String(w.id), code: (w as { code?: string }).code, name: w.name }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={item} onChange={(v) => setItem(v)}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={emp} onChange={(v) => setEmp(v)}
                           items={pickers.employees} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={note}
                 onChange={(e) => setNote(e.target.value)} style={{ width: 220 }} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        불출 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        불출수량 <b style={{ color: '#a5561b', fontSize: 14 }}>{num(totalQty)}</b>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 개" emptyText="조회된 불출이 없습니다." />
      ) : mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 140 }}>자재코드</th>
              <th>자재명</th>
              <th style={{ width: 70 }}>단위</th>
              <th style={{ width: 100, textAlign: 'right' }}>불출건수</th>
              <th style={{ width: 130, textAlign: 'right' }}>총불출수량</th>
              <th style={{ width: 120 }}>최근불출일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byItem.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : byItem.map((g, i) => (
              <tr key={g.itemId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{g.itemCode}</td>
                <td>{g.itemName}</td>
                <td>{g.unit}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#a5561b' }}>{num(g.totalQty)}</td>
                <td style={{ fontFamily: 'monospace' }}>{g.lastDate}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({byItem.length}자재)</td>
              <td style={{ textAlign: 'right' }}>{num(shown.length)}</td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(totalQty)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      ) : mode === '라인별' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 110 }}>불출일</th>
              <th style={{ width: 170 }}>작업지시번호</th>
              <th style={{ width: 140 }}>자재코드</th>
              <th>자재명</th>
              <th style={{ width: 110, textAlign: 'right' }}>불출수량</th>
              <th style={{ width: 130 }}>보내는창고</th>
              <th style={{ width: 130 }}>받는공장</th>
              <th>적요</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.issueDate}</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{r.workOrderNo}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                <td>{r.itemName}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#a5561b' }}>{num(r.qty)} {r.unit}</td>
                <td>{r.warehouseName}</td>
                <td style={{ color: r.toWarehouseName ? undefined : '#c9ced6' }}>{r.toWarehouseName ?? '—'}</td>
                <td style={{ color: r.note ? undefined : '#c9ced6' }}>{r.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={5} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(totalQty)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 110 }}>불출일</th>
              <th style={{ width: 170 }}>작업지시번호</th>
              <th>자재명(요약)</th>
              <th style={{ width: 110, textAlign: 'right' }}>불출수량</th>
              <th style={{ width: 130 }}>보내는창고</th>
              <th style={{ width: 130 }}>받는공장</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byOrder.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : byOrder.map((g, i) => (
              <tr key={g.workOrderId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{g.date}</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{g.workOrderNo}</td>
                <td>{g.itemName}{g.lineCount > 1 ? ` 외 ${g.lineCount - 1}건` : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#a5561b' }}>{num(g.qty)}</td>
                <td>{g.warehouseName}</td>
                <td style={{ color: g.toWarehouseName ? undefined : '#c9ced6' }}>{g.toWarehouseName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({byOrder.length}건)</td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(totalQty)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      )}

      {shown.length > 0 && (() => {
        const groups = subtotalBy(shown,
          (r) => (subtotal === '보내는창고' ? r.warehouseName
            : subtotal === '받는공장' ? r.toWarehouseName
              : subtotal === '담당자' ? (empName(r.employeeId) || null)
                : r.itemName),
          { qty: (r) => r.qty })
        return (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>{subtotal} 소계</h3>
            <table className="w-full text-left">
              <thead><tr>
                <th>{subtotal}</th>
                <th style={{ width: 90, textAlign: 'right' }}>건수</th>
                <th style={{ width: 140, textAlign: 'right' }}>수량</th>
              </tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.label}>
                    <td style={{ fontWeight: 600 }}>{g.label}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.count}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#a5561b' }}>
                      {num(g.sums.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      })()}
    </EcListShell>
  )
}
