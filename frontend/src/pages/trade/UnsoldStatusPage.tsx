import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_FULL_PICKS, periodOf } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

/**
 * 영업관리 > 미판매현황 (이카운트 E040212)
 *
 * 미주문(견적→수주)·미출하(수주→출하)는 있었는데 <b>미판매(수주→매출)</b>만 없었다.
 * 셋은 다른 질문이다 — 물건은 나갔는데 매출을 못 잡은 건은 미출하에는 안 잡히고 여기 남는다.
 *
 * 미판매수량 = 주문수량 − 그 수주를 근거전표로 끊은 판매 라인의 같은 품목 수량 합.
 * 판매 라인은 수주 <b>헤더</b>만 가리키므로(SalesLine.sourceOrder) 라인 대 라인이 아니라
 * 품목으로 맞춘다. 주문보다 많이 판 경우는 음수 대신 0 으로 둔다(GET /api/sales-orders/unsold).
 *
 * 원본 조건: 구분(품목별/라인별) · 기준일자(영업주기) · 품목별납기일자 · 창고 · 프로젝트 ·
 * 거래처 · 품목 · 담당자 · 거래처관리담당자 · 미판매수량(범위).
 * 창고·프로젝트·담당자·거래처관리담당자는 수주 라인에 없어 넣지 않았다(미출하현황과 같은 이유).
 */
interface UnsoldLine {
  orderId: number
  orderNo: string
  orderLineId: number
  partnerId: number
  partnerName: string
  orderDate: string
  dueDate: string | null
  status: 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
  statusName: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  orderQty: number
  soldQty: number
  unsoldQty: number
  unitPrice: number
  unsoldAmount: number
}

const num = (n: number) => n.toLocaleString()

/*
 * 원본 미판매현황은 <b>금월</b>을 보고 열린다(사본 실측 — 달 스핀박스가 07 하나).
 * 우리는 기간을 비워 두어 주문이 쌓일수록 열자마자 몇 해치가 쏟아졌다.
 */
const init = periodOf('금월(~오늘)')!

export default function UnsoldStatusPage() {
  const navigate = useNavigate()
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['partners', 'items'])
  const [rows, setRows] = useState<UnsoldLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /** 원본 [구분] — 품목별(품목으로 합침) / 라인별(주문 라인 그대로). */
  const [mode, setMode] = useState<'품목별' | '라인별'>('라인별')
  const [cond, setCond] = useState({ from: init.from, to: init.to, partner: '', item: '', orderNo: '', qtyFrom: '', qtyTo: '' })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<UnsoldLine[]>('/sales-orders/unsold')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows
    // 기준일자는 납기일로 본다 — '언제까지 매출을 잡아야 했나'가 이 화면의 질문이다.
    .filter((r) => !cond.from || (r.dueDate ?? r.orderDate) >= cond.from)
    .filter((r) => !cond.to || (r.dueDate ?? r.orderDate) <= cond.to)
    .filter((r) => !cond.partner || r.partnerName.includes(cond.partner))
    .filter((r) => !cond.item || r.itemName.includes(cond.item) || r.itemCode.includes(cond.item))
    .filter((r) => !cond.orderNo || r.orderNo.includes(cond.orderNo))
    .filter((r) => !cond.qtyFrom || r.unsoldQty >= Number(cond.qtyFrom))
    .filter((r) => !cond.qtyTo || r.unsoldQty <= Number(cond.qtyTo))

  /** 품목별 보기 — 주문번호가 여럿 섞이므로 건수로 대신 보여 준다. */
  const byItem = useMemo(() => {
    const m = new Map<number, { itemCode: string; itemName: string; unit: string; orderQty: number; soldQty: number; unsoldQty: number; unsoldAmount: number; count: number }>()
    shown.forEach((r) => {
      const g = m.get(r.itemId) ?? { itemCode: r.itemCode, itemName: r.itemName, unit: r.unit, orderQty: 0, soldQty: 0, unsoldQty: 0, unsoldAmount: 0, count: 0 }
      g.orderQty += r.orderQty; g.soldQty += r.soldQty; g.unsoldQty += r.unsoldQty
      g.unsoldAmount += r.unsoldAmount; g.count += 1
      m.set(r.itemId, g)
    })
    return [...m.entries()].map(([itemId, g]) => ({ itemId, ...g }))
      .sort((a, b) => b.unsoldQty - a.unsoldQty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cond])

  const totals = shown.reduce(
    (a, r) => ({ qty: a.qty + r.unsoldQty, amount: a.amount + r.unsoldAmount }),
    { qty: 0, amount: 0 },
  )
  const reset = () => { setMode('라인별'); setCond({ from: init.from, to: init.to, partner: '', item: '', orderNo: '', qtyFrom: '', qtyTo: '' }) }

  return (
    <EcListShell
      title="미판매현황"
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
        picks={INQUIRY_FULL_PICKS}
        dateLabel="납기일자"
      >
        <EcCond label="구분">
          <div className="ec-pills">
            {(['품목별', '라인별'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={cond.partner} onChange={(v) => setC({ partner: v })}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="주문번호">
          <input className="ec-input" placeholder="SO-…" value={cond.orderNo}
                 onChange={(e) => setC({ orderNo: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="미판매수량">
          <input className="ec-input" type="number" value={cond.qtyFrom}
                 onChange={(e) => setC({ qtyFrom: e.target.value })} style={{ width: 120 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input className="ec-input" type="number" value={cond.qtyTo}
                 onChange={(e) => setC({ qtyTo: e.target.value })} style={{ width: 120 }} />
        </EcCond>
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {mode === '품목별' ? '품목' : '라인'}{' '}
        <b style={{ color: '#3c4553' }}>{num(mode === '품목별' ? byItem.length : shown.length)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        미판매수량 <b style={{ color: '#a5561b', fontSize: 14 }}>{num(totals.qty)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        미판매금액 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{num(totals.amount)}</b>
      </div>

      <div className="overflow-x-auto">
        {mode === '라인별' ? (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '4%' }} /><col style={{ width: '12%' }} /><col style={{ width: '10%' }} />
              <col style={{ width: '15%' }} /><col />
              <col style={{ width: '9%' }} /><col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>주문번호</th>
                <th>납기일자</th>
                <th>거래처</th>
                <th>품목</th>
                <th style={{ textAlign: 'right' }}>주문수량</th>
                <th style={{ textAlign: 'right' }}>판매수량</th>
                <th style={{ textAlign: 'right' }}>미판매수량</th>
                <th style={{ textAlign: 'right' }}>미판매금액</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((r, i) => (
                <tr key={r.orderLineId} style={{ cursor: 'pointer' }}
                    onClick={() => navigate('/sales/order-status')}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{r.orderNo}</td>
                  <td>{(r.dueDate ?? r.orderDate).replace(/-/g, '/')}</td>
                  <td>{r.partnerName}</td>
                  <td>{r.itemName} <span style={{ fontSize: 11, color: '#9aa1ab' }}>{r.itemCode}</span></td>
                  <td style={{ textAlign: 'right' }}>{num(r.orderQty)}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(r.soldQty)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#a5561b' }}>
                    {num(r.unsoldQty)} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{r.unit}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{num(r.unsoldAmount)}</td>
                </tr>
              ))}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={7} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: '#a5561b' }}>{num(totals.qty)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: 'var(--ec-blue)' }}>{num(totals.amount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '4%' }} /><col style={{ width: '14%' }} /><col />
              <col style={{ width: '8%' }} /><col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: '13%' }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>품목코드</th>
                <th>품목명</th>
                <th style={{ textAlign: 'right' }}>건수</th>
                <th style={{ textAlign: 'right' }}>주문수량</th>
                <th style={{ textAlign: 'right' }}>판매수량</th>
                <th style={{ textAlign: 'right' }}>미판매수량</th>
                <th style={{ textAlign: 'right' }}>미판매금액</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : byItem.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : byItem.map((g, i) => (
                <tr key={g.itemId}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{g.itemCode}</td>
                  <td>{g.itemName}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                  <td style={{ textAlign: 'right' }}>{num(g.orderQty)}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.soldQty)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#a5561b' }}>
                    {num(g.unsoldQty)} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{g.unit}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{num(g.unsoldAmount)}</td>
                </tr>
              ))}
            </tbody>
            {byItem.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: '#a5561b' }}>{num(totals.qty)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: 'var(--ec-blue)' }}>{num(totals.amount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </EcListShell>
  )
}
