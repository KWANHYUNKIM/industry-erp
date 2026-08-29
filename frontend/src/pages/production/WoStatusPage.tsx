import { useEffect, useMemo, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'

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

/*
 * 원본 작업지시서현황은 <b>금월</b>을 보고 열린다(사본 실측 — 달 스핀박스가 07 하나).
 * 우리는 기간 칸이 <b>아예 없어서</b> 지시가 쌓이면 몇 해치가 한 화면에 쏟아졌다.
 */
const initP = periodOf('금월(~오늘)')!

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
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  /*
   * 원본 작업지시서현황의 <b>[구분]</b>은 [내역]·[집계] 다(사본 실측 — checked 는 내역).
   * 우리는 내역만 있어 "이 품목을 이번 달 몇 개 지시했나" 를 눈으로 세야 했다.
   *
   * <p>집계 <b>축</b>은 사본에서 못 읽었다 — 그 선택상자를 스크립트가 그려서 담기지
   * 않았다. 그래서 <b>이 화면의 줄이 실제로 가진 축</b>만 둔다(품목·창고·거래처·
   * 담당자·월). 없는 축을 그려 두면 눌러도 늘 같은 표가 나온다.
   *
   * <p>판매·구매현황의 집계(utils/statusAggregate)는 <b>돈</b>을 더한다. 작업지시에는
   * 금액이 없어 그 계산을 그대로 쓸 수 없다 — 여기서는 <b>수량 셋</b>(지시·생산·잔량)을 센다.
   */
  const [mode, setMode] = useState<'내역' | '집계'>('내역')
  const AXES = ['품목별', '창고별', '거래처별', '담당자별', '월별'] as const
  const [axis, setAxis] = useState<typeof AXES[number]>('품목별')
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
    && (!itemCond || r.productName.includes(itemCond))
    && (!from || r.orderDate >= from) && (!to || r.orderDate <= to))

  /** 고른 축으로 묶어 수량 셋을 더한다. 줄이 없으면 빈 배열이라 표가 스스로 비운다. */
  const grouped = useMemo(() => {
      if (mode !== '집계') return []
      const keyOf = (r: Row) => (
        axis === '품목별' ? r.productName
          : axis === '창고별' ? (r.warehouseName || '(없음)')
            : axis === '거래처별' ? (r.partnerName || '(없음)')
              : axis === '담당자별' ? empName(r.employeeId)
                : r.orderDate.slice(0, 7).replace(/-/g, '/'))
      const by = new Map<string, { key: string; count: number; planned: number; produced: number; remaining: number }>()
      for (const r of shown) {
        const k = keyOf(r)
        const cur = by.get(k) ?? { key: k, count: 0, planned: 0, produced: 0, remaining: 0 }
        cur.count += 1
        cur.planned += r.plannedQty
        cur.produced += r.producedQty
        cur.remaining += r.remainingQty
        by.set(k, cur)
      }
      return [...by.values()].sort((a, b) => a.key.localeCompare(b.key))
    }, [shown, mode, axis])

  /* 축을 바꿔도 열 수는 그대로지만, 표가 통째로 갈리므로 머리와 칸을 함께 본다. */
  const aggRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(aggRef, '작업지시서현황 집계', [axis, grouped.length])

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
        {/* 원본 조건 판 첫째 <b>[구분]</b> — 내역·집계(사본 실측). */}
        <EcCond label="구분">
          <div className="ec-pills">
            {(['내역', '집계'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
          {mode === '집계' && (
            <select className="ec-input" value={axis} onChange={(e) => setAxis(e.target.value as typeof AXES[number])}
                    style={{ width: 130, marginLeft: 6 }}>
              {AXES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
        </EcCond>
        {/* 원본 조건 첫째 <b>[기준일자]</b>(사본 실측). */}
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from}
                 onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input type="date" className="ec-input" value={to}
                 onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from}
              onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
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
      {mode === '집계' ? (
        <table ref={aggRef} className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>{axis}</th>
              <th style={{ width: 90, textAlign: 'right' }}>건수</th>
              <th style={{ width: 120, textAlign: 'right' }}>지시수량</th>
              <th style={{ width: 120, textAlign: 'right' }}>생산수량</th>
              <th style={{ width: 120, textAlign: 'right' }}>잔량</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : grouped.map((g, i) => (
              <tr key={g.key}>
                <td style={{ textAlign: 'center', color: '#8a929c', background: '#f3f3f3' }}>{i + 1}</td>
                <td>{g.key}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.count.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.planned.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.produced.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: g.remaining > 0 ? '#c60a2e' : '#8a929c' }}>{g.remaining.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={2} style={{ textAlign: 'right' }}>합계 ({grouped.length}개 그룹)</td>
              <td style={{ textAlign: 'right' }}>{grouped.reduce((a, g) => a + g.count, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{grouped.reduce((a, g) => a + g.planned, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{grouped.reduce((a, g) => a + g.produced, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{grouped.reduce((a, g) => a + g.remaining, 0).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
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
              <td style={{ color: r.partnerName ? undefined : '#c9ced6' }}>{r.partnerName ?? ''}</td>
              <td style={{ color: r.employeeId ? undefined : '#c9ced6' }}>{empName(r.employeeId)}</td>
              <td>{r.warehouseName}</td>
              <td style={{ fontFamily: 'monospace' }}>{dateText(r.dueDate) || ''}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: STATUS_COLOR[r.status] }}>{r.statusName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    </EcListShell>
  )
}
