import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

/**
 * 재고 > 기타이동현황 — 자가사용(E040506) · 불량처리(E040509) · 대체사용(E040510) ·
 * 폐기(E040511) · 재고조정(E040608)
 *
 * 원본 `출력물 > 기타이동현황` 그룹은 여덟 화면인데(창고이동·자가사용·불량처리·대체사용·
 * 폐기·불량률파악보고서·재고실사·재고조정) 우리에겐 <b>입력 화면만</b> 있고 현황이 하나도 없었다.
 * 기타이동은 넣고 나면 다시 볼 일이 없어 보이지만, 재고가 안 맞을 때 제일 먼저 뒤지는 곳이다.
 *
 * 다섯 화면이 같은 표를 유형만 바꿔 보여 주므로 한 컴포넌트에 `type` 을 넘긴다
 * (`StockAdjustmentType` 이 원본 다섯 메뉴와 그대로 대응한다).
 *
 * 원본 [구분]은 <b>내역 / 집계 / 라인별</b> 셋이지만 우리 기타이동 전표는 <b>한 줄짜리</b>라
 * 내역과 라인별이 같은 표가 된다. 없는 구분을 흉내내지 않고 [내역|집계] 둘만 둔다.
 *
 * 원본 조건 중 프로젝트·담당자는 StockAdjustment 에 없어 넣지 않았다.
 */
export type AdjustKind = 'SELF_USE' | 'DEFECT' | 'SUBSTITUTE' | 'DISPOSAL' | 'ADJUST'

const TITLE: Record<AdjustKind, string> = {
  SELF_USE: '자가사용현황',
  DEFECT: '불량처리현황',
  SUBSTITUTE: '대체사용현황',
  DISPOSAL: '폐기현황',
  ADJUST: '재고조정현황',
}

interface Adjustment {
  id: number
  adjustNo: string
  adjustDate: string
  type: AdjustKind
  typeName: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  warehouseId: number
  warehouseName: string
  beforeQty: number
  quantityChange: number
  afterQty: number
  reason: string | null
  createdBy: string | null
}

const num = (n: number) => n.toLocaleString()

export default function StockMoveStatusPage({ kind }: { kind: AdjustKind }) {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items'])
  const [rows, setRows] = useState<Adjustment[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [mode, setMode] = useState<'내역' | '집계'>('내역')
  // 원본 기본값이 금월(~오늘)이다.
  const init = periodOf('금월(~오늘)', new Date()) ?? { from: ymd(new Date()), to: ymd(new Date()) }
  const [cond, setCond] = useState({ from: init.from, to: init.to, warehouseId: '', item: '', reason: '' })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      api.get<Adjustment[]>('/stock-adjustments'),
      api.get<Warehouse[]>('/warehouses'),
    ])
      .then(([a, w]) => { setRows(a.data); setWarehouses(w.data) })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  // 같은 컴포넌트를 다섯 메뉴가 쓰므로 메뉴를 갈아타도 다시 마운트되지 않는다 — 유형이 바뀌면 조건만 되돌린다.
  useEffect(() => { setMode('내역') }, [kind])

  const shown = rows
    .filter((r) => r.type === kind)
    .filter((r) => !cond.from || r.adjustDate >= cond.from)
    .filter((r) => !cond.to || r.adjustDate <= cond.to)
    .filter((r) => !cond.warehouseId || String(r.warehouseId) === cond.warehouseId)
    .filter((r) => !cond.item || r.itemName.includes(cond.item) || r.itemCode.includes(cond.item))
    .filter((r) => !cond.reason || (r.reason ?? '').includes(cond.reason))

  /** 집계 — 창고 × 품목으로 묶어 증감 합을 낸다. */
  const summary = useMemo(() => {
    const m = new Map<string, { warehouseName: string; itemCode: string; itemName: string; unit: string; change: number; count: number }>()
    shown.forEach((r) => {
      const k = `${r.warehouseId}:${r.itemId}`
      const g = m.get(k) ?? { warehouseName: r.warehouseName, itemCode: r.itemCode, itemName: r.itemName, unit: r.unit, change: 0, count: 0 }
      g.change += r.quantityChange
      g.count += 1
      m.set(k, g)
    })
    return [...m.entries()].map(([k, g]) => ({ k, ...g }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, kind, cond])

  const totalChange = shown.reduce((n, r) => n + r.quantityChange, 0)
  const reset = () => {
    setMode('내역')
    setCond({ from: init.from, to: init.to, warehouseId: '', item: '', reason: '' })
  }

  return (
    <EcListShell
      title={TITLE[kind]}
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
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={cond.reason}
                 onChange={(e) => setC({ reason: e.target.value })} style={{ width: 220 }} />
        </EcCond>
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {mode === '내역' ? '건수' : '품목×창고'}{' '}
        <b style={{ color: '#3c4553' }}>{num(mode === '내역' ? shown.length : summary.length)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        증감계 <b style={{ color: totalChange < 0 ? '#c60a2e' : 'var(--ec-blue)', fontSize: 14 }}>{num(totalChange)}</b>
      </div>

      <div className="overflow-x-auto">
        {mode === '내역' ? (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '4%' }} /><col style={{ width: '14%' }} /><col style={{ width: '10%' }} />
              <col style={{ width: '14%' }} /><col />
              <col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>전표번호</th>
                <th>일자</th>
                <th>창고</th>
                <th>품목</th>
                <th style={{ textAlign: 'right' }}>이전재고</th>
                <th style={{ textAlign: 'right' }}>증감</th>
                <th style={{ textAlign: 'right' }}>이후재고</th>
                <th>적요</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.adjustNo}</td>
                  <td>{r.adjustDate.replace(/-/g, '/')}</td>
                  <td>{r.warehouseName}</td>
                  <td>{r.itemName} <span style={{ fontSize: 11, color: '#9aa1ab' }}>{r.itemCode}</span></td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(r.beforeQty)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: r.quantityChange < 0 ? '#c60a2e' : 'var(--ec-blue)' }}>
                    {num(r.quantityChange)} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{r.unit}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{num(r.afterQty)}</td>
                  <td style={{ color: '#5a626e' }}>{r.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: totalChange < 0 ? '#c60a2e' : 'var(--ec-blue)' }}>{num(totalChange)}</td>
                  <td colSpan={2} style={{ background: '#f5f7fa' }}></td>
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '5%' }} /><col style={{ width: '20%' }} />
              <col style={{ width: '15%' }} /><col />
              <col style={{ width: '10%' }} /><col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>창고</th>
                <th>품목코드</th>
                <th>품목명</th>
                <th style={{ textAlign: 'right' }}>건수</th>
                <th style={{ textAlign: 'right' }}>증감계</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : summary.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : summary.map((g, i) => (
                <tr key={g.k}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td>{g.warehouseName}</td>
                  <td style={{ fontFamily: 'monospace' }}>{g.itemCode}</td>
                  <td>{g.itemName}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: g.change < 0 ? '#c60a2e' : 'var(--ec-blue)' }}>
                    {num(g.change)} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{g.unit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            {summary.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: totalChange < 0 ? '#c60a2e' : 'var(--ec-blue)' }}>{num(totalChange)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </EcListShell>
  )
}
