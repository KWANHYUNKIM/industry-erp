import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 재고 II > 출력물 — 실제 데이터 기반 장표 미리보기/인쇄
 *  (/api/stock, /api/stock/transactions, /api/sales, /api/purchases, /api/ledger/partner-balances 연동) */
interface StockRes {
  itemCode: string; itemName: string; unit: string; warehouseName: string
  quantity: number; safetyStock: number; belowSafety: boolean
}
interface TxRes {
  transactionDate: string; itemCode: string; itemName: string; warehouseName: string
  typeName: string; quantityChange: number; balanceAfter: number
}
interface PageRes<T> { content: T[]; totalElements: number }
interface SalesRes { saleDate: string; docNo: string; partnerName: string; supplyAmount: number; vatAmount: number; totalAmount: number }
interface PurchaseRes { purchaseDate: string; docNo: string; partnerName: string; supplyAmount: number; vatAmount: number; totalAmount: number }
interface BalanceRes { code: string; name: string; typeName: string; receivable: number; payable: number }

interface Preview { header: string[]; rows: (string | number)[][]; rightCols: number[] }
interface Report { id: number; category: string; name: string; desc: string; count: number; build: () => Preview }

const catColor = (c: string) => ({ 재고: 'var(--ec-blue)', 영업: '#1c7c3c', 구매: '#c07a00', 회계: '#7a4dbf' }[c] ?? '#5a626e')
const num = (v: number) => Number(v).toLocaleString()

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ name: string; data: Preview } | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [stockR, txR, salesR, purchaseR, balanceR] = await Promise.all([
        api.get<StockRes[]>('/stock'),
        api.get<PageRes<TxRes>>('/stock/transactions', { params: { page: 0, size: 200 } }),
        api.get<SalesRes[]>('/sales'),
        api.get<PurchaseRes[]>('/purchases'),
        api.get<BalanceRes[]>('/ledger/partner-balances'),
      ])
      const stocks = stockR.data
      const txs = txR.data.content
      const sales = salesR.data
      const purchases = purchaseR.data
      const balances = balanceR.data
      const belowSafety = stocks.filter((s) => s.belowSafety)
      const inbound = txs.filter((t) => t.quantityChange > 0)
      const taxed = sales.filter((s) => Number(s.vatAmount) > 0)
      const receivables = balances.filter((b) => Number(b.receivable) > 0)

      setReports([
        {
          id: 1, category: '재고', name: '재고수불부', desc: '품목 입출고 및 잔고 내역', count: txR.data.totalElements,
          build: () => ({
            header: ['일자', '품목코드', '품목명', '창고', '구분', '증감수량', '잔고'],
            rightCols: [5, 6],
            rows: txs.map((t) => [t.transactionDate, t.itemCode, t.itemName, t.warehouseName, t.typeName, num(t.quantityChange), num(t.balanceAfter)]),
          }),
        },
        {
          id: 2, category: '재고', name: '재고자산명세서', desc: '창고별 현재고 수량 현황', count: stocks.length,
          build: () => ({
            header: ['품목코드', '품목명', '창고', '단위', '현재고', '안전재고'],
            rightCols: [4, 5],
            rows: stocks.map((s) => [s.itemCode, s.itemName, s.warehouseName, s.unit, num(s.quantity), num(s.safetyStock)]),
          }),
        },
        {
          id: 3, category: '재고', name: '안전재고 부족 리스트', desc: '안전재고 미달 품목 현황', count: belowSafety.length,
          build: () => ({
            header: ['품목코드', '품목명', '창고', '현재고', '안전재고', '부족수량'],
            rightCols: [3, 4, 5],
            rows: belowSafety.map((s) => [s.itemCode, s.itemName, s.warehouseName, num(s.quantity), num(s.safetyStock), num(Number(s.safetyStock) - Number(s.quantity))]),
          }),
        },
        {
          id: 4, category: '영업', name: '거래명세서', desc: '거래처별 판매 명세', count: sales.length,
          build: () => ({
            header: ['일자', '전표번호', '거래처', '공급가액', '부가세', '합계'],
            rightCols: [3, 4, 5],
            rows: sales.map((s) => [s.saleDate, s.docNo, s.partnerName, num(s.supplyAmount), num(s.vatAmount), num(s.totalAmount)]),
          }),
        },
        {
          id: 5, category: '영업', name: '세금계산서', desc: '과세 판매분 세금계산서 발행 대상', count: taxed.length,
          build: () => ({
            header: ['작성일자', '전표번호', '공급받는자', '공급가액', '세액'],
            rightCols: [3, 4],
            rows: taxed.map((s) => [s.saleDate, s.docNo, s.partnerName, num(s.supplyAmount), num(s.vatAmount)]),
          }),
        },
        {
          id: 6, category: '영업', name: '미수금 현황표', desc: '거래처별 채권 잔액', count: receivables.length,
          build: () => ({
            header: ['거래처코드', '거래처명', '구분', '채권(매출)', '채무(매입)'],
            rightCols: [3, 4],
            rows: receivables.map((b) => [b.code, b.name, b.typeName, num(b.receivable), num(b.payable)]),
          }),
        },
        {
          id: 7, category: '구매', name: '발주서', desc: '구매처 발주(구매 전표) 문서', count: purchases.length,
          build: () => ({
            header: ['일자', '전표번호', '구매처', '공급가액', '부가세', '합계'],
            rightCols: [3, 4, 5],
            rows: purchases.map((p) => [p.purchaseDate, p.docNo, p.partnerName, num(p.supplyAmount), num(p.vatAmount), num(p.totalAmount)]),
          }),
        },
        {
          id: 8, category: '구매', name: '입고검수표', desc: '입고 이력 검수 확인서', count: inbound.length,
          build: () => ({
            header: ['입고일자', '품목코드', '품목명', '창고', '구분', '입고수량'],
            rightCols: [5],
            rows: inbound.map((t) => [t.transactionDate, t.itemCode, t.itemName, t.warehouseName, t.typeName, num(t.quantityChange)]),
          }),
        },
      ])
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openPreview(r: Report) {
    setPreview({ name: r.name, data: r.build() })
  }
  function printReport(r: Report) {
    setPreview({ name: r.name, data: r.build() })
    setTimeout(() => window.print(), 100)
  }

  return (
    <EcListShell title="출력물 (장표)" actions={[{ label: '새로고침', onClick: load }, { label: '양식 관리' }]}>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 90 }}>분류 ▼</th>
            <th style={{ width: 200 }}>장표명 ▼</th>
            <th>설명</th>
            <th style={{ width: 90, textAlign: 'right' }}>대상건수</th>
            <th style={{ width: 160, textAlign: 'center' }}>출력</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : reports.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ color: catColor(r.category), fontWeight: 700 }}>{r.category}</td>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td style={{ color: '#5a626e' }}>{r.desc}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: r.count > 0 ? 'var(--ec-blue-dark)' : '#9aa1ab' }}>{r.count.toLocaleString()}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 10px', marginRight: 4 }} onClick={() => openPreview(r)}>미리보기</button>
                <button className="ec-btn" style={{ height: 20, padding: '0 10px' }} onClick={() => printReport(r)}>🖨 인쇄</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {preview && (
        <div style={{ marginTop: 14, border: '1px solid #d5dae2', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #eef1f5' }}>
            <b style={{ fontSize: 13.5 }}>{preview.name}</b>
            <span style={{ marginLeft: 8, fontSize: 12, color: '#8a929c' }}>총 {preview.data.rows.length.toLocaleString()}건 (미리보기 상위 30건)</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <button className="ec-btn" style={{ height: 20, padding: '0 10px' }} onClick={() => window.print()}>🖨 인쇄</button>
              <button className="ec-btn" style={{ height: 20, padding: '0 10px' }} onClick={() => setPreview(null)}>닫기</button>
            </div>
          </div>
          <div style={{ maxHeight: 320, overflow: 'auto', padding: 8 }}>
            <table className="w-full text-left">
              <thead>
                <tr>
                  {preview.data.header.map((h, ci) => (
                    <th key={ci} style={preview.data.rightCols.includes(ci) ? { textAlign: 'right' } : undefined}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.data.rows.length === 0 ? (
                  <tr><td colSpan={preview.data.header.length} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>출력할 데이터가 없습니다.</td></tr>
                ) : preview.data.rows.slice(0, 30).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((c, ci) => (
                      <td key={ci} style={preview.data.rightCols.includes(ci) ? { textAlign: 'right' } : undefined}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </EcListShell>
  )
}
