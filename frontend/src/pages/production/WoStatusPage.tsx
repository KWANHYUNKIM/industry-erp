import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 생산관리 > 작업지시서현황 — 작업지시 진행 현황 (/api/work-orders).
 *
 * <p>원본 열 실측(사본): 일자-No. · 품목명[규격명] · 수량 · <b>거래처명</b> ·
 * <b>담당자명</b> · 납기일자.
 *
 * <p>거래처명·담당자명이 없었다. 작업지시에 그 값이 아예 없었기 때문인데, 이제 있다
 * (원본 작업지시서입력 머리의 [납품처]·[담당자]).
 *
 * <p>담당자 <b>이름</b>은 서버가 못 붙인다 — production 은 hr 을 참조할 수 없어
 * (hr → accounting → production 순환) id 만 온다. 화면이 사원 목록에서 붙인다.
 */
type WoStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'

const STATUS_COLOR: Record<WoStatus, string> = {
  PLANNED: '#8a929c',
  IN_PROGRESS: '#c07a00',
  COMPLETED: '#1c7c3c',
}

interface Row {
  id: number
  orderNo: string
  productCode: string
  productName: string
  productUnit: string
  warehouseName: string
  /** 납품처. 원본 [거래처명] 열. */
  partnerName: string | null
  /** 담당자(사원) id. 이름은 화면이 붙인다. */
  employeeId: number | null
  plannedQty: number
  producedQty: number
  remainingQty: number
  status: WoStatus
  statusName: string
  orderDate: string
  dueDate: string | null
}

export default function WoStatusPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [res, emps] = await Promise.all([
        api.get<Row[]>('/work-orders'),
        api.get<{ id: number; name: string }[]>('/employees'),
      ])
      const sorted = [...res.data].sort((a, b) => (a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : b.id - a.id))
      setRows(sorted)
      setEmployees(emps.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  /** 담당자 이름. 서버가 못 붙여서 화면이 붙인다 — 지워진 사원이면 '-'. */
  const empName = (id: number | null) =>
    id == null ? '-' : (employees.find((x) => x.id === id)?.name ?? '-')

  const shown = rows.filter((r) => !keyword || r.orderNo.includes(keyword) || r.productName.includes(keyword))

  return (
    <EcListShell
      title="작업지시서현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: '인쇄' }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 200, textAlign: 'center' }}>일자-No.</th>
            <th>품목명</th>
            <th style={{ width: 140 }}>거래처명</th>
            <th style={{ width: 90 }}>담당자명</th>
            <th>입고창고</th>
            <th style={{ textAlign: 'right' }}>지시수량</th>
            <th style={{ textAlign: 'right' }}>생산수량</th>
            <th style={{ textAlign: 'right' }}>잔여수량</th>
            <th style={{ textAlign: 'right' }}>진행률(%)</th>
            <th>납기</th>
            <th style={{ textAlign: 'center' }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{r.orderDate} {r.orderNo}</td>
              <td>[{r.productCode}] {r.productName}</td>
              <td style={{ color: r.partnerName ? undefined : '#c9ced6' }}>{r.partnerName ?? '-'}</td>
              <td style={{ color: r.employeeId ? undefined : '#c9ced6' }}>{empName(r.employeeId)}</td>
              <td>{r.warehouseName}</td>
              <td style={{ textAlign: 'right' }}>{r.plannedQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{r.producedQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: r.remainingQty > 0 ? '#c60a2e' : '#8a929c' }}>{r.remainingQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.plannedQty ? Math.round((r.producedQty / r.plannedQty) * 100) : 0}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.dueDate ?? '-'}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: STATUS_COLOR[r.status] }}>{r.statusName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
