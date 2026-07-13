import { useEffect, useMemo, useState, Fragment } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { SalesConfirmStatus, SalesDoc, PurchaseDoc } from '../../api/types'

/** 판매조회 / 구매조회 — 전표(문서) 단위 조회. 행 클릭 시 품목 상세 펼침. */
type Mode = 'sales' | 'purchase'
interface NormalDoc {
  id: number; docNo: string; partnerName: string; warehouseName: string
  date: string; supplyAmount: number; vatAmount: number; totalAmount: number
  createdBy: string | null; remark: string | null
  confirmStatus?: SalesConfirmStatus; confirmStatusName?: string
  lines: { itemCode: string; itemName: string; unit: string; quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number }[]
}

// 판매조회 탭 (이카운트). '결재중'은 전자결재 진행중, '확인/미확인'은 확인상태.
const SALES_TABS = ['전체', '결재중', '미확인', '확인'] as const
type SalesTab = (typeof SALES_TABS)[number]
const TAB_STATUS: Record<Exclude<SalesTab, '전체'>, SalesConfirmStatus> = {
  결재중: 'IN_APPROVAL',
  미확인: 'UNCONFIRMED',
  확인: 'CONFIRMED',
}
const confirmColor = (s?: SalesConfirmStatus) =>
  s === 'CONFIRMED' ? '#1c7c3c' : s === 'IN_APPROVAL' ? 'var(--ec-blue)' : '#8a929c'

const won = (n: number) => n.toLocaleString('ko-KR')
const CFG: Record<Mode, { title: string; url: string; dateKey: 'saleDate' | 'purchaseDate'; partnerLabel: string; accent: string }> = {
  sales: { title: '판매조회', url: '/sales', dateKey: 'saleDate', partnerLabel: '매출처', accent: 'var(--ec-blue)' },
  purchase: { title: '구매조회', url: '/purchases', dateKey: 'purchaseDate', partnerLabel: '매입처', accent: '#a5561b' },
}

export default function TradeInquiryPage({ mode }: { mode: Mode }) {
  const cfg = CFG[mode]
  const isSales = mode === 'sales'
  const [docs, setDocs] = useState<NormalDoc[]>([])
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tab, setTab] = useState<SalesTab>('전체')
  const [openId, setOpenId] = useState<number | null>(null)
  // 이번 세션에서 세금계산서를 발행한 전표 id (버튼 중복 클릭 방지)
  const [taxIssued, setTaxIssued] = useState<Set<number>>(new Set())

  function load() {
    setError('')
    api.get<(SalesDoc | PurchaseDoc)[]>(cfg.url)
      .then((res) => setDocs(res.data.map((d) => ({
        id: d.id, docNo: d.docNo, partnerName: d.partnerName, warehouseName: d.warehouseName,
        date: (d as never)[cfg.dateKey] as string,
        supplyAmount: d.supplyAmount, vatAmount: d.vatAmount, totalAmount: d.totalAmount,
        createdBy: d.createdBy, remark: d.remark,
        confirmStatus: (d as SalesDoc).confirmStatus,
        confirmStatusName: (d as SalesDoc).confirmStatusName,
        lines: d.lines.map((l) => ({ itemCode: l.itemCode, itemName: l.itemName, unit: l.unit, quantity: l.quantity, unitPrice: l.unitPrice, supplyAmount: l.supplyAmount, vatAmount: l.vatAmount })),
      }))))
      .catch((err) => setError(extractErrorMessage(err)))
  }

  useEffect(() => {
    load()
    setTab('전체')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.url, cfg.dateKey])

  async function confirmAct(d: NormalDoc, kind: 'confirm' | 'unconfirm') {
    try {
      await api.post(`/sales/${d.id}/${kind}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function issueTaxInvoice(d: NormalDoc) {
    try {
      await api.post('/tax-invoices', { type: isSales ? 'SALES' : 'PURCHASE', sourceId: d.id })
      setTaxIssued((s) => new Set(s).add(d.id))
      alert(`${d.docNo} 세금계산서를 발행했습니다. (${isSales ? '매출' : '매입'} 세금계산서 화면에서 진행단계 관리)`)
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = useMemo(() => docs
    .filter((d) => !keyword || d.partnerName.includes(keyword) || d.docNo.includes(keyword))
    .filter((d) => !from || d.date >= from)
    .filter((d) => !to || d.date <= to)
    .filter((d) => !isSales || tab === '전체' || d.confirmStatus === TAB_STATUS[tab])
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id), [docs, keyword, from, to, tab, isSales])

  const tabCount = (t: SalesTab) =>
    docs.filter((d) => t === '전체' || d.confirmStatus === TAB_STATUS[t]).length

  const totals = shown.reduce((a, d) => ({ supply: a.supply + d.supplyAmount, vat: a.vat + d.vatAmount, total: a.total + d.totalAmount }), { supply: 0, vat: 0, total: 0 })

  // 판매조회는 확인상태·확인버튼 2컬럼 + 세금계산서 1컬럼, 구매조회는 세금계산서 1컬럼이 더 붙는다.
  const colCount = (isSales ? 11 : 9) + 1

  return (
    <EcListShell title={cfg.title} search={keyword} onSearchChange={setKeyword} actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        <span>기간</span>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        <span style={{ marginLeft: 8, color: '#9aa1ab' }}>총 {shown.length}건 · 행을 클릭하면 품목 상세가 펼쳐집니다.</span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {isSales && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: '1px solid var(--ec-border)' }}>
          {SALES_TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
              padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? 'var(--ec-blue)' : '#5a626e',
              fontWeight: tab === t ? 700 : 400,
              borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
            }}>{t} ({tabCount(t)})</button>
          ))}
        </div>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>전표번호 ▼</th><th>{mode === 'sales' ? '판매일' : '구매일'} ▼</th><th>{cfg.partnerLabel}</th><th>창고</th>
            <th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th><th style={{ textAlign: 'right' }}>합계</th><th>담당</th>
            {isSales && <><th style={{ textAlign: 'center' }}>확인상태</th><th style={{ textAlign: 'center' }}>확인</th></>}
            <th style={{ textAlign: 'center' }}>세금계산서</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={colCount} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>조회 내역이 없습니다.</td></tr>
          ) : shown.map((d, i) => (
            <Fragment key={d.id}>
              <tr onClick={() => setOpenId(openId === d.id ? null : d.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: cfg.accent, fontWeight: 600 }}>{openId === d.id ? '▾ ' : '▸ '}{d.docNo}</td>
                <td>{d.date}</td>
                <td>{d.partnerName}</td>
                <td>{d.warehouseName}</td>
                <td style={{ textAlign: 'right' }}>{won(d.supplyAmount)}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(d.vatAmount)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: cfg.accent }}>{won(d.totalAmount)}</td>
                <td>{d.createdBy ?? ''}</td>
                {isSales && (
                  <>
                    <td style={{ textAlign: 'center', color: confirmColor(d.confirmStatus), fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>
                      {d.confirmStatusName ?? '미확인'}
                    </td>
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      {d.confirmStatus === 'CONFIRMED' ? (
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => confirmAct(d, 'unconfirm')}>확인취소</button>
                      ) : d.confirmStatus === 'IN_APPROVAL' ? (
                        <span style={{ color: '#c9ced6' }}>—</span>
                      ) : (
                        <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => confirmAct(d, 'confirm')}>확인</button>
                      )}
                    </td>
                  </>
                )}
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  {taxIssued.has(d.id) ? (
                    <span style={{ color: '#1c7c3c', fontSize: 11.5 }}>발행됨</span>
                  ) : (
                    <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => issueTaxInvoice(d)}>발행</button>
                  )}
                </td>
              </tr>
              {openId === d.id && (
                <tr className="no-ec">
                  <td colSpan={colCount} style={{ padding: 0, background: '#fafbfc' }}>
                    <table className="w-full text-left" style={{ margin: '4px 0' }}>
                      <thead>
                        <tr><th style={{ width: 34 }}></th><th>품목코드</th><th>품목명</th><th style={{ textAlign: 'right' }}>수량</th><th style={{ textAlign: 'right' }}>단가</th><th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th></tr>
                      </thead>
                      <tbody>
                        {d.lines.map((l, li) => (
                          <tr key={li}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{li + 1}</td>
                            <td style={{ fontFamily: 'monospace' }}>{l.itemCode}</td>
                            <td>{l.itemName}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.quantity)} {l.unit}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.unitPrice)}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.supplyAmount)}</td>
                            <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(l.vatAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {d.remark && <div style={{ padding: '2px 10px 8px', fontSize: 12, color: '#5a626e' }}>비고: {d.remark}</div>}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={5} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
            <td style={{ textAlign: 'right' }}>{won(totals.supply)}</td>
            <td style={{ textAlign: 'right' }}>{won(totals.vat)}</td>
            <td style={{ textAlign: 'right', color: cfg.accent }}>{won(totals.total)}</td>
            <td colSpan={(isSales ? 3 : 1) + 1}></td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
