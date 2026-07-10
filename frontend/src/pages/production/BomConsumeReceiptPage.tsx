import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 생산관리 > 생산입고 I - BOM기준소모 — 완제품 입고 시 BOM대로 자동소모된 자재 내역 (/api/productions 연동) */
interface ProductionMaterial {
  componentId: number
  componentCode: string
  componentName: string
  unit: string
  quantity: number
}

interface Production {
  id: number
  prodNo: string
  workOrderNo: string
  productCode: string
  productName: string
  warehouseName: string
  producedQty: number
  productionDate: string
  materials: ProductionMaterial[]
}

interface Row {
  key: string
  woNo: string
  productName: string
  receiptQty: number
  materialName: string
  bomQtyPer: number | null
  totalConsume: number
  unit: string
  warehouse: string
}

export default function BomConsumeReceiptPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<Production[]>('/productions')
      const sorted = [...res.data].sort((a, b) => (a.productionDate < b.productionDate ? 1 : a.productionDate > b.productionDate ? -1 : b.id - a.id))
      const flat: Row[] = []
      for (const p of sorted) {
        for (const m of p.materials) {
          flat.push({
            key: `${p.id}-${m.componentId}`,
            woNo: p.workOrderNo,
            productName: `[${p.productCode}] ${p.productName}`,
            receiptQty: p.producedQty,
            materialName: `[${m.componentCode}] ${m.componentName}`,
            bomQtyPer: p.producedQty ? m.quantity / p.producedQty : null,
            totalConsume: m.quantity,
            unit: m.unit,
            warehouse: p.warehouseName,
          })
        }
      }
      setRows(flat)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => !keyword || r.productName.includes(keyword) || r.materialName.includes(keyword) || r.woNo.includes(keyword))

  return (
    <EcListShell
      title="생산입고 I - BOM기준소모"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>작업지시번호</th>
            <th>완제품명</th>
            <th style={{ textAlign: 'right' }}>입고수량</th>
            <th>소모자재</th>
            <th style={{ textAlign: 'right' }}>BOM소요량/개</th>
            <th style={{ textAlign: 'right' }}>총소모량</th>
            <th>단위</th>
            <th>입고창고</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.woNo}</td>
              <td>{r.productName}</td>
              <td style={{ textAlign: 'right' }}>{r.receiptQty.toLocaleString()}</td>
              <td>{r.materialName}</td>
              <td style={{ textAlign: 'right' }}>{r.bomQtyPer !== null ? r.bomQtyPer.toLocaleString() : '-'}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{r.totalConsume.toLocaleString()}</td>
              <td>{r.unit}</td>
              <td>{r.warehouse}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
