import { useEffect, useMemo, useState, Fragment } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { SalesDoc, PurchaseDoc } from '../../api/types'

/** 판매조회 / 구매조회 — 전표(문서) 단위 조회. 행 클릭 시 품목 상세 펼침. */
type Mode = 'sales' | 'purchase'
interface NormalDoc {
  id: number; docNo: string; partnerName: string; warehouseName: string
  date: string; supplyAmount: number; vatAmount: number; totalAmount: number
  createdBy: string | null; remark: string | null
  lines: { itemCode: string; itemName: string; unit: string; quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number }[]
}

const won = (n: number) => n.toLocaleString('ko-KR')
const CFG: Record<Mode, { title: string; url: string; dateKey: 'saleDate' | 'purchaseDate'; partnerLabel: string; accent: string }> = {
  sales: { title: '판매조회', url: '/sales', dateKey: 'saleDate', partnerLabel: '매출처', accent: 'var(--ec-blue)' },
  purchase: { title: '구매조회', url: '/purchases', dateKey: 'purchaseDate', partnerLabel: '매입처', accent: '#a5561b' },
}

export default function TradeInquiryPage({ mode }: { mode: Mode }) {
  const cfg = CFG[mode]
  const [docs, setDocs] = useState<NormalDoc[]>([])
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    setError('')
    api.get<(SalesDoc | PurchaseDoc)[]>(cfg.url)
      .then((res) => setDocs(res.data.map((d) => ({
        id: d.id, docNo: d.docNo, partnerName: d.partnerName, warehouseName: d.warehouseName,
        date: (d as never)[cfg.dateKey] as string,
        supplyAmount: d.supplyAmount, vatAmount: d.vatAmount, totalAmount: d.totalAmount,
        createdBy: d.createdBy, remark: d.remark,
        lines: d.lines.map((l) => ({ itemCode: l.itemCode, itemName: l.itemName, unit: l.unit, quantity: l.quantity, unitPrice: l.unitPrice, supplyAmount: l.supplyAmount, vatAmount: l.vatAmount })),
      }))))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [cfg.url, cfg.dateKey])

  const shown = useMemo(() => docs
    .filter((d) => !keyword || d.partnerName.includes(keyword) || d.docNo.includes(keyword))
    .filter((d) => !from || d.date >= from)
    .filter((d) => !to || d.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id), [docs, keyword, from, to])

  const totals = shown.reduce((a, d) => ({ supply: a.supply + d.supplyAmount, vat: a.vat + d.vatAmount, total: a.total + d.totalAmount }), { supply: 0, vat: 0, total: 0 })

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

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>전표번호 ▼</th><th>{mode === 'sales' ? '판매일' : '구매일'} ▼</th><th>{cfg.partnerLabel}</th><th>창고</th>
            <th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th><th style={{ textAlign: 'right' }}>합계</th><th>담당</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>조회 내역이 없습니다.</td></tr>
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
              </tr>
              {openId === d.id && (
                <tr className="no-ec">
                  <td colSpan={9} style={{ padding: 0, background: '#fafbfc' }}>
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
            <td></td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
