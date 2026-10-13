import { useEffect, useState, useRef} from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import EcRowCap, { capRows } from '../../components/EcRowCap'

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

const catColor = (c: string) => ({ 재고: 'var(--ec-blue)', 영업: 'var(--ec-success)', 구매: 'var(--ec-warn)', 회계: '#7a4dbf' }[c] ?? 'var(--ec-label)')
const num = (v: number) => Number(v).toLocaleString()

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ name: string; data: Preview } | null>(null)
  const [formMgmtOpen, setFormMgmtOpen] = useState(false)  // 양식 관리 모달

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

  /* 두 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. */
  const sort = useTableSort(reports, {
    분류: (r) => r.category,
    장표명: (r) => r.name,
  })


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '재고 보고서', [])

  return (
    <EcListShell title="출력물" actions={[{ label: '새로고침', onClick: load }, { label: '양식 관리', onClick: () => setFormMgmtOpen(true) }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[90px] cursor-pointer" onClick={() => sort.toggle('분류')}>분류 {sort.mark('분류')}</th>
            <th className="w-[200px] cursor-pointer" onClick={() => sort.toggle('장표명')}>장표명 {sort.mark('장표명')}</th>
            <th>설명</th>
            <th className="w-[90px] text-right">대상건수</th>
            <th className="w-[160px] text-center">출력</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
          ) : sort.sorted.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td style={{ color: catColor(r.category), fontWeight: 700 }}>{r.category}</td>
              <td className="font-semibold">{r.name}</td>
              <td className="text-ec-label">{r.desc}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: r.count > 0 ? 'var(--ec-blue-dark)' : 'var(--ec-text-hint)' }}>{r.count.toLocaleString()}</td>
              <td className="text-center">
                <button className="ec-btn" style={{ height: 20, padding: '0 10px', marginRight: 4 }} onClick={() => openPreview(r)}>미리보기</button>
                <button className="ec-btn" style={{ height: 20, padding: '0 10px' }} onClick={() => printReport(r)}>🖨 인쇄</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {preview && (
        <div style={{ marginTop: 14, border: '1px solid #d5dae2', background: '#fff' }}>
          <div className="flex items-center py-[6px] px-[10px] border-b border-b-ec-line-soft border-solid">
            <b className="text-[13.5px]">{preview.name}</b>
            <span className="ml-[8px] text-[12px] text-ec-hint">총 {preview.data.rows.length.toLocaleString()}건 (미리보기 상위 30건)</span>
            <div className="ml-auto flex gap-[4px]">
              <button className="ec-btn" style={{ height: 20, padding: '0 10px' }} onClick={() => window.print()}>🖨 인쇄</button>
              <button className="ec-btn" style={{ height: 20, padding: '0 10px' }} onClick={() => setPreview(null)}>닫기</button>
            </div>
          </div>
          <div className="max-h-[320px] overflow-auto p-[8px]">
            {/* 미리보기라도 <b>몇 중 몇</b>인지는 적는다 — 안 적으면 30줄이 전부인 줄 안다. */}
            <EcRowCap capped={preview.data.rows.length > 30} shown={30}
                      total={preview.data.rows.length} sums={false}
                      hint="내려받으면 전부 들어 있습니다." />
            <table ref={tableRef} className="w-full text-left">
              <thead>
                <tr>
                  {preview.data.header.map((h, ci) => (
                    <th key={ci} style={preview.data.rightCols.includes(ci) ? { textAlign: 'right' } : undefined}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.data.rows.length === 0 ? (
                  <tr><td colSpan={preview.data.header.length} className="text-center text-ec-hint p-[16px]">등록된 데이터가 없습니다.</td></tr>
                ) : capRows(preview.data.rows, 30).rows.map((row, ri) => (
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

      {formMgmtOpen && (
        <div onClick={() => setFormMgmtOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 620, maxWidth: '94vw', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div className="py-[10px] px-[14px] border-b border-b-ec-line-soft border-solid font-extrabold text-[14px] flex items-center">
              <span>양식 관리 · 장표 양식 목록</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setFormMgmtOpen(false)}>닫기</button>
            </div>
            <div className="p-[14px] text-[12.5px] text-ec-text">
              <p className="mt-0 mx-0 mb-[8px] text-ec-label">이 화면에서 제공하는 장표(출력 양식) <b>{reports.length}</b>종입니다. 분류별로 어떤 양식이 있고 현재 출력 가능한 대상 건수가 얼마인지 확인할 수 있습니다.</p>
              <table className="w-full text-left">
                <thead><tr><th className="text-center w-[34px]">No</th><th className="w-[80px]">분류</th><th className="w-[180px]">양식명</th><th>설명</th><th className="w-[80px] text-right">대상</th></tr></thead>
                <tbody>
                  {reports.map((r, i) => (
                    <tr key={r.id}>
                      <td className="text-center text-ec-hint">{i + 1}</td>
                      <td style={{ color: catColor(r.category), fontWeight: 700 }}>{r.category}</td>
                      <td className="font-semibold">{r.name}</td>
                      <td className="text-ec-label">{r.desc}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: r.count > 0 ? 'var(--ec-blue-dark)' : 'var(--ec-text-hint)' }}>{r.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-[8px] mx-0 mb-0 text-[11.5px] text-ec-warn">* 양식 신규 추가·레이아웃 편집·머리글/로고 커스터마이징은 백엔드 미연동입니다. 현재는 기본 제공 양식의 조회·미리보기·인쇄만 지원합니다.</p>
            </div>
          </div>
        </div>
      )}
    </EcListShell>
  )
}
