import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'

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
  /** 원본 열 이름이 [품목명[규격명]] 이다. */
  productSpec: string | null
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
  /*
   * 원본 작업지시서현황의 조건은 <b>작업지시No. · 창고 · 거래처 · 품목</b> 이다(사본 실측).
   * 우리는 이름 한 칸(keyword)뿐이라, 창고로 좁히려면 눈으로 훑어야 했다 —
   * 네 값 모두 이미 목록에 실려 오고 있었다.
   */
  const [orderNoCond, setOrderNoCond] = useState('')
  const [warehouseCond, setWarehouseCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const pickers = useCondPickers(['warehouses', 'partners', 'items'])

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

  const shown = rows.filter((r) => (!keyword || r.orderNo.includes(keyword) || r.productName.includes(keyword))
    && (!orderNoCond || r.orderNo.includes(orderNoCond))
    && (!warehouseCond || (r.warehouseName ?? '').includes(warehouseCond))
    && (!partnerCond || (r.partnerName ?? '').includes(partnerCond))
    && (!itemCond || r.productName.includes(itemCond)))

  return (
    <EcListShell
      title="작업지시서현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: '인쇄' }, { label: 'Excel' }]}
    >
      {/* 원본 조건 차례: 작업지시No. · 창고 · 거래처 · 품목 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="작업지시No.">
          <input className="ec-input" value={orderNoCond}
                 onChange={(e) => setOrderNoCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        {/* 마스터를 고르는 조건은 직접 입력이 아니라 코드도움이다 — 다른 화면과 같은 규칙. */}
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={warehouseCond} onChange={setWarehouseCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
      </ul>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 200, textAlign: 'center' }}>일자-No.</th>
            <th>품목명[규격명]</th>
            {/* 원본 [수량] — 지시수량을 말한다. 생산·잔여는 우리가 더 보여 주는 것이다. */}
            <th style={{ textAlign: 'right' }}>수량</th>
            <th style={{ textAlign: 'right' }}>생산수량</th>
            <th style={{ textAlign: 'right' }}>잔여수량</th>
            <th style={{ textAlign: 'right' }}>진행률(%)</th>
            {/* 원본은 [거래처명]을 183 으로 둔다 — 일자-No. 보다 넓다. */}
            <th style={{ width: 200 }}>거래처명</th>
            <th style={{ width: 90 }}>담당자명</th>
            <th>입고창고</th>
            {/* 원본 열 이름은 [납기일자]다. */}
            <th>납기일자</th>
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
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{dateText(r.orderDate)} {r.orderNo}</td>
              <td>{r.productName}{r.productSpec ? `[${r.productSpec}]` : ''}</td>
              <td style={{ textAlign: 'right' }}>{r.plannedQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{r.producedQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: r.remainingQty > 0 ? '#c60a2e' : '#8a929c' }}>{r.remainingQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.plannedQty ? Math.round((r.producedQty / r.plannedQty) * 100) : 0}</td>
              <td style={{ color: r.partnerName ? undefined : '#c9ced6' }}>{r.partnerName ?? '-'}</td>
              <td style={{ color: r.employeeId ? undefined : '#c9ced6' }}>{empName(r.employeeId)}</td>
              <td>{r.warehouseName}</td>
              <td style={{ fontFamily: 'monospace' }}>{dateText(r.dueDate) || '-'}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: STATUS_COLOR[r.status] }}>{r.statusName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
