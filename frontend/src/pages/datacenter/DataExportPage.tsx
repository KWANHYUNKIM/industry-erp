import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 데이터센터 > 데이터내보내기 — 실제 API 데이터를 CSV/Excel/JSON 으로 추출 */
interface ItemRes { code: string; name: string; spec: string | null; unit: string; categoryName: string; unitPrice: number; safetyStock: number; active: boolean }
interface StockRes { itemCode: string; itemName: string; warehouseName: string; unit: string; quantity: number; safetyStock: number; belowSafety: boolean }
interface TxRes { transactionDate: string; itemCode: string; itemName: string; warehouseName: string; typeName: string; quantityChange: number; balanceAfter: number }
interface PageRes<T> { content: T[]; totalElements: number }
interface SalesRes { saleDate: string; docNo: string; partnerName: string; warehouseName: string; supplyAmount: number; vatAmount: number; totalAmount: number }
interface PurchaseRes { purchaseDate: string; docNo: string; partnerName: string; warehouseName: string; supplyAmount: number; vatAmount: number; totalAmount: number }
interface PartnerRes { code: string; name: string; typeName: string; bizRegNo: string | null; ceoName: string | null; manager: string | null; phone: string | null }
interface BalanceRes { code: string; name: string; typeName: string; receivable: number; payable: number }

type Cell = string | number | boolean | null
interface Table { header: string[]; rows: Cell[][] }

interface Dataset {
  id: number
  module: string
  name: string
  /** 기간 필터가 적용되는 날짜 컬럼 index (없으면 null = 마스터성 데이터) */
  dateCol: number | null
  fetch: () => Promise<Table>
}

const DATASETS: Dataset[] = [
  {
    id: 1, module: '재고', name: '품목 마스터', dateCol: null,
    fetch: async () => {
      const { data } = await api.get<ItemRes[]>('/items')
      return {
        header: ['품목코드', '품목명', '규격', '단위', '분류', '단가', '안전재고', '사용여부'],
        rows: data.map((r) => [r.code, r.name, r.spec, r.unit, r.categoryName, r.unitPrice, r.safetyStock, r.active ? 'Y' : 'N']),
      }
    },
  },
  {
    id: 2, module: '재고', name: '현재고 (품목x창고)', dateCol: null,
    fetch: async () => {
      const { data } = await api.get<StockRes[]>('/stock')
      return {
        header: ['품목코드', '품목명', '창고', '단위', '현재고', '안전재고', '안전재고미달'],
        rows: data.map((r) => [r.itemCode, r.itemName, r.warehouseName, r.unit, r.quantity, r.safetyStock, r.belowSafety ? 'Y' : 'N']),
      }
    },
  },
  {
    id: 3, module: '재고', name: '재고 수불 내역', dateCol: 0,
    fetch: async () => {
      const { data } = await api.get<PageRes<TxRes>>('/stock/transactions', { params: { page: 0, size: 1000 } })
      return {
        header: ['일자', '품목코드', '품목명', '창고', '구분', '증감수량', '잔고'],
        rows: data.content.map((r) => [r.transactionDate, r.itemCode, r.itemName, r.warehouseName, r.typeName, r.quantityChange, r.balanceAfter]),
      }
    },
  },
  {
    id: 4, module: '영업', name: '판매 전표', dateCol: 0,
    fetch: async () => {
      const { data } = await api.get<SalesRes[]>('/sales')
      return {
        header: ['판매일자', '전표번호', '거래처', '출고창고', '공급가액', '부가세', '합계'],
        rows: data.map((r) => [r.saleDate, r.docNo, r.partnerName, r.warehouseName, r.supplyAmount, r.vatAmount, r.totalAmount]),
      }
    },
  },
  {
    id: 5, module: '구매', name: '구매 전표', dateCol: 0,
    fetch: async () => {
      const { data } = await api.get<PurchaseRes[]>('/purchases')
      return {
        header: ['구매일자', '전표번호', '거래처', '입고창고', '공급가액', '부가세', '합계'],
        rows: data.map((r) => [r.purchaseDate, r.docNo, r.partnerName, r.warehouseName, r.supplyAmount, r.vatAmount, r.totalAmount]),
      }
    },
  },
  {
    id: 6, module: '거래처', name: '거래처 마스터', dateCol: null,
    fetch: async () => {
      const { data } = await api.get<PartnerRes[]>('/partners')
      return {
        header: ['거래처코드', '상호', '구분', '사업자번호', '대표자', '담당자', '전화'],
        rows: data.map((r) => [r.code, r.name, r.typeName, r.bizRegNo, r.ceoName, r.manager, r.phone]),
      }
    },
  },
  {
    id: 7, module: '회계', name: '거래처 채권/채무', dateCol: null,
    fetch: async () => {
      const { data } = await api.get<BalanceRes[]>('/ledger/partner-balances')
      return {
        header: ['거래처코드', '거래처명', '구분', '채권(매출)', '채무(매입)'],
        rows: data.map((r) => [r.code, r.name, r.typeName, r.receivable, r.payable]),
      }
    },
  },
]

function csvEscape(v: Cell): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function DataExportPage() {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [format, setFormat] = useState<'Excel' | 'CSV' | 'JSON'>('Excel')
  const [from, setFrom] = useState('2026-07-01')
  const [to, setTo] = useState('2026-07-07')
  const [counts, setCounts] = useState<Record<number, number | null>>({})
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  async function loadCounts() {
    setLoading(true)
    setError('')
    const results = await Promise.allSettled(DATASETS.map((d) => d.fetch()))
    const next: Record<number, number | null> = {}
    results.forEach((r, i) => {
      next[DATASETS[i].id] = r.status === 'fulfilled' ? r.value.rows.length : null
    })
    setCounts(next)
    setLoading(false)
  }

  useEffect(() => { loadCounts() }, [])

  const toggle = (id: number) => setChecked((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const allChecked = checked.size === DATASETS.length
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(DATASETS.map((d) => d.id)))

  function applyPeriod(d: Dataset, t: Table): Table {
    if (d.dateCol === null) return t
    const c = d.dateCol
    return { ...t, rows: t.rows.filter((row) => {
      const v = String(row[c] ?? '')
      return v >= from && v <= to
    }) }
  }

  async function exportNow() {
    if (checked.size === 0) { alert('내보낼 데이터셋을 선택하세요.'); return }
    setExporting(true)
    setError('')
    try {
      const targets = DATASETS.filter((d) => checked.has(d.id))
      for (const d of targets) {
        const table = applyPeriod(d, await d.fetch())
        const base = `${d.module}_${d.name}_${to}`.replace(/[\\/:*?"<>| ]/g, '_')
        if (format === 'JSON') {
          const objs = table.rows.map((row) => Object.fromEntries(table.header.map((h, i) => [h, row[i]])))
          download(`${base}.json`, JSON.stringify(objs, null, 2), 'application/json;charset=utf-8')
        } else {
          const lines = [table.header.map(csvEscape).join(','), ...table.rows.map((row) => row.map(csvEscape).join(','))]
          // Excel 형식은 한글 인코딩을 위해 UTF-8 BOM 포함 CSV 로 저장
          const bom = format === 'Excel' ? '﻿' : ''
          download(`${base}.csv`, bom + lines.join('\r\n'), 'text/csv;charset=utf-8')
        }
      }
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <EcListShell
      title="데이터내보내기"
      actions={[
        { label: exporting ? '내보내는 중…' : `${format}로 내보내기`, primary: true, onClick: exportNow },
        { label: '건수 새로고침', onClick: loadCounts },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12.5 }}>기간&nbsp;
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          &nbsp;~&nbsp;
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label style={{ fontSize: 12.5 }}>형식&nbsp;
          <select className="ec-input" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
            <option>Excel</option><option>CSV</option><option>JSON</option>
          </select>
        </label>
        <span style={{ fontSize: 11.5, color: '#8a929c' }}>* 기간은 일자 컬럼이 있는 전표성 데이터에만 적용</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>선택 <b style={{ color: 'var(--ec-blue-dark)' }}>{checked.size}</b> / {DATASETS.length}</span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34, textAlign: 'center' }}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
            </th>
            <th style={{ width: 90 }}>모듈 ▼</th>
            <th>데이터셋 ▼</th>
            <th style={{ width: 160 }}>유형</th>
            <th style={{ width: 110, textAlign: 'right' }}>건수</th>
          </tr>
        </thead>
        <tbody>
          {DATASETS.map((d) => {
            const c = counts[d.id]
            return (
              <tr key={d.id}>
                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={checked.has(d.id)} onChange={() => toggle(d.id)} /></td>
                <td style={{ fontWeight: 700, color: 'var(--ec-blue-dark)' }}>{d.module}</td>
                <td>{d.name}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#5a626e' }}>{d.dateCol !== null ? '전표성(기간필터)' : '마스터'}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>
                  {loading ? '…' : c === null ? <span style={{ color: '#c60a2e' }}>조회실패</span> : (c ?? 0).toLocaleString()}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
