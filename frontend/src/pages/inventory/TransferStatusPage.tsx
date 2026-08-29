import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { printDocuments } from '../../utils/printDocument'
import { useCondPickers } from '../../utils/useCondPickers'

/**
 * 재고 > 창고이동현황 (이카운트 E040505)
 *
 * 창고이동은 재고 총량을 바꾸지 않아서 수불부에서 눈에 안 띈다. 그래서 "분명히 있었는데
 * 창고에 없다"가 생기면 여기부터 본다. 우리는 입력(`/inventory/transfer`)만 있고 현황이 없었다.
 *
 * 원본 [구분]은 <b>내역 / 집계 / 라인별</b>인데, 우리 창고이동 전표는 <b>한 줄짜리</b>라
 * 내역과 라인별이 같은 표가 된다. 없는 구분을 흉내내지 않고 [내역|집계] 둘만 둔다.
 * 집계는 <b>출고창고 → 입고창고 × 품목</b>으로 묶는다 — "어느 창고에서 어디로 얼마나 흘렀나".
 *
 * 원본 조건 중 프로젝트·담당자는 StockTransfer 에 없어 넣지 않았다.
 * 창고 조건은 출고·입고 <b>어느 쪽이든</b> 걸리면 잡는다(한쪽만 보면 이동의 반쪽만 보인다).
 */
interface Transfer {
  id: number
  transferNo: string
  transferDate: string
  /** 원본 조건의 [프로젝트]·[담당자]. 담당자는 id 만 온다 — 이름은 화면이 붙인다. */
  projectName: string | null
  employeeId: number | null
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  fromWarehouseId: number
  fromWarehouseName: string
  toWarehouseId: number
  toWarehouseName: string
  quantity: number
  reason: string | null
  createdBy: string | null
}

const num = (n: number) => n.toLocaleString()

/**
 * 원본 창고이동조회의 마지막 열 <b>[인쇄]</b> — 그 한 건을 이동증으로 찍는다.
 *
 * <p>금액 칸은 안 그린다. 창고이동은 <b>사내 이동</b>이라 금액이 없다 —
 * 0 으로 채워 그리면 "0원짜리 거래" 로 읽힌다. 공급자/공급받는자 칸도 없다(상대가 없다).
 * 생산불출증과 같은 규칙이다.
 */
async function printTransfer(r: Transfer) {
  await printDocuments([{
    title: '창고이동증',
    docNo: r.transferNo,
    docDate: r.transferDate,
    hideAmounts: true,
    hideParties: true,
    supplier: { label: '', name: '' },
    customer: { label: '', name: '' },
    extra: [
      { label: '보내는창고', value: r.fromWarehouseName },
      { label: '받는창고', value: r.toWarehouseName },
      { label: '프로젝트', value: r.projectName },
    ],
    remark: r.reason,
    lines: [{
      itemCode: r.itemCode, itemName: r.itemName, unit: r.unit,
      quantity: r.quantity, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
    }],
  }])
}

export default function TransferStatusPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items', 'projects', 'employees'])
  const [rows, setRows] = useState<Transfer[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [mode, setMode] = useState<'내역' | '집계'>('내역')
  // 원본 기본값이 금월(~오늘)이다.
  const init = periodOf('금월(~오늘)', new Date()) ?? { from: ymd(new Date()), to: ymd(new Date()) }
  /*
   * 원본 창고이동조회 조건 차례: … 창고 · <b>프로젝트</b> · 품목 · <b>담당자</b> · 적요.
   * 이동 전표에 그 칸이 없어 <b>[적요]에 손으로 적고</b> 있었다 — 칸을 만들고 조건을 세운다.
   */
  const [cond, setCond] = useState({ from: init.from, to: init.to, warehouseId: '', project: '', item: '', employee: '', reason: '' })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      api.get<Transfer[]>('/stock-transfers'),
      api.get<Warehouse[]>('/warehouses'),
    ])
      .then(([t, w]) => { setRows(t.data); setWarehouses(w.data) })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  /* 담당자는 id 만 저장한다(inventory 는 hr 을 참조할 수 없다) — 이름은 코드도움 목록에서 붙인다. */
  const empName = (id: number | null) => pickers.employees.find((e) => e.id === id)?.name ?? ''

  const shown = rows
    .filter((r) => !cond.from || r.transferDate >= cond.from)
    .filter((r) => !cond.to || r.transferDate <= cond.to)
    .filter((r) => !cond.warehouseId
      || String(r.fromWarehouseId) === cond.warehouseId
      || String(r.toWarehouseId) === cond.warehouseId)
    .filter((r) => !cond.project || r.projectName === cond.project)
    .filter((r) => !cond.item || r.itemName.includes(cond.item) || r.itemCode.includes(cond.item))
    .filter((r) => !cond.employee || empName(r.employeeId) === cond.employee)
    .filter((r) => !cond.reason || (r.reason ?? '').includes(cond.reason))

  const summary = useMemo(() => {
    const m = new Map<string, { from: string; to: string; itemCode: string; itemName: string; unit: string; qty: number; count: number }>()
    shown.forEach((r) => {
      const k = `${r.fromWarehouseId}:${r.toWarehouseId}:${r.itemId}`
      const g = m.get(k) ?? { from: r.fromWarehouseName, to: r.toWarehouseName, itemCode: r.itemCode, itemName: r.itemName, unit: r.unit, qty: 0, count: 0 }
      g.qty += r.quantity
      g.count += 1
      m.set(k, g)
    })
    return [...m.entries()].map(([k, g]) => ({ k, ...g })).sort((a, b) => b.qty - a.qty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cond])

  const totalQty = shown.reduce((n, r) => n + r.quantity, 0)
  const reset = () => {
    setMode('내역')
    setCond({ from: init.from, to: init.to, warehouseId: '', project: '', item: '', employee: '', reason: '' })
  }

  return (
    <EcListShell
      title="창고이동현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={INQUIRY_PICKS}
        dateLabel="일자"
      >
        <EcCond label="구분">
          <div className="ec-pills">
            {(['내역', '집계'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={cond.warehouseId} onChange={(v) => setC({ warehouseId: v })}
                           items={warehouses.map((w) => ({ value: String(w.id), code: (w as { code?: string }).code, name: w.name }))} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={cond.project} onChange={(v) => setCond((c) => ({ ...c, project: v }))}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={cond.employee} onChange={(v) => setCond((c) => ({ ...c, employee: v }))}
                           items={pickers.employees} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={cond.reason}
                 onChange={(e) => setC({ reason: e.target.value })} style={{ width: 220 }} />
        </EcCond>
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {mode === '내역' ? '건수' : '이동경로'}{' '}
        <b style={{ color: '#3c4553' }}>{num(mode === '내역' ? shown.length : summary.length)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        이동수량 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{num(totalQty)}</b>
      </div>

      <div className="overflow-x-auto">
        {mode === '내역' ? (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '4%' }} /><col style={{ width: '14%' }} /><col style={{ width: '10%' }} />
              <col /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                {/*
                  원본 창고이동조회의 열은 <b>일자-No. · 보내는창고명 · 받는창고명 ·
                  품목명[규격명] · 수량</b> 이다(사본 실측). 우리는 다섯 칸이 다 다른
                  이름이었고, 일자와 번호도 둘로 나눠 두었다. 생산불출조회는 이미
                  [보내는창고명]·[받는공장명]을 쓰고 있어 <b>우리끼리도 어긋나</b> 있었다.
                */}
                <th>일자-No.</th>
                <th>보내는창고명</th>
                <th>받는창고명</th>
                <th>품목명[규격명]</th>
                <th style={{ textAlign: 'right' }}>수량</th>
                <th>적요</th>
                {/* 원본 창고이동조회의 마지막 열 [인쇄] — 그 한 건을 이동증으로 찍는다. */}
                <th style={{ width: 60, textAlign: 'center' }}>인쇄</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>
                    {r.transferDate.replace(/-/g, '/')} {r.transferNo}
                  </td>
                  <td style={{ color: '#a5561b' }}>{r.fromWarehouseName}</td>
                  <td style={{ color: 'var(--ec-blue)' }}>{r.toWarehouseName}</td>
                  <td>{r.itemName} <span style={{ fontSize: 11, color: '#9aa1ab' }}>{r.itemCode}</span></td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {num(r.quantity)} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{r.unit}</span>
                  </td>
                  <td style={{ color: '#5a626e' }}>{r.reason ?? ''}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => printTransfer(r)}
                            style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>인쇄</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: 'var(--ec-blue)' }}>{num(totalQty)}</td>
                  <td colSpan={2} style={{ background: '#f5f7fa' }}></td>
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '5%' }} /><col style={{ width: '16%' }} /><col style={{ width: '16%' }} />
              <col style={{ width: '15%' }} /><col />
              <col style={{ width: '9%' }} /><col style={{ width: '13%' }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>출고창고</th>
                <th>입고창고</th>
                <th>품목코드</th>
                <th>품목명</th>
                <th style={{ textAlign: 'right' }}>건수</th>
                <th style={{ textAlign: 'right' }}>이동수량</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : summary.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : summary.map((g, i) => (
                <tr key={g.k}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td style={{ color: '#a5561b' }}>{g.from}</td>
                  <td style={{ color: 'var(--ec-blue)' }}>{g.to}</td>
                  <td style={{ fontFamily: 'monospace' }}>{g.itemCode}</td>
                  <td>{g.itemName}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {num(g.qty)} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{g.unit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            {summary.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: 'var(--ec-blue)' }}>{num(totalQty)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </EcListShell>
  )
}
