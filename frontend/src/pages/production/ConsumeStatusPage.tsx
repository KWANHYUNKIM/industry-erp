import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 생산관리 > 생산입고 소모현황 — 예정소모(BOM기준) 대비 실제소모 차이 현황 (/api/productions + /api/boms 연동) */
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
  productId: number
  productCode: string
  productName: string
  producedQty: number
  productionDate: string
  materials: ProductionMaterial[]
}

interface BomLine {
  componentId: number
  quantity: number
}

interface Bom {
  id: number
  productId: number
  lines: BomLine[]
}

interface Row {
  key: string
  date: string
  prodNo: string
  productName: string
  materialName: string
  planConsume: number | null
  actualConsume: number
}

export default function ConsumeStatusPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [prodRes, bomRes] = await Promise.all([
        api.get<Production[]>('/productions'),
        api.get<Bom[]>('/boms'),
      ])
      // 제품별 BOM 소요량(개당) 맵: productId:componentId → 개당 소요량
      const bomPer = new Map<string, number>()
      for (const b of bomRes.data) {
        for (const l of b.lines) bomPer.set(`${b.productId}:${l.componentId}`, l.quantity)
      }
      const flat: Row[] = []
      const sorted = [...prodRes.data].sort((a, b) => (a.productionDate < b.productionDate ? 1 : a.productionDate > b.productionDate ? -1 : b.id - a.id))
      for (const p of sorted) {
        for (const m of p.materials) {
          const per = bomPer.get(`${p.productId}:${m.componentId}`)
          flat.push({
            key: `${p.id}-${m.componentId}`,
            date: p.productionDate,
            prodNo: p.prodNo,
            productName: `[${p.productCode}] ${p.productName}`,
            materialName: `[${m.componentCode}] ${m.componentName}`,
            planConsume: per !== undefined ? per * p.producedQty : null,
            actualConsume: m.quantity,
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

  const shown = rows.filter((r) => !keyword || r.productName.includes(keyword) || r.materialName.includes(keyword))

  return (
    <EcListShell
      title="생산입고 소모현황"
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
            <th>일자</th>
            <th>입고번호</th>
            <th>완제품명</th>
            <th>소모자재</th>
            <th style={{ textAlign: 'right' }}>예정소모</th>
            <th style={{ textAlign: 'right' }}>실제소모</th>
            <th style={{ textAlign: 'right' }}>차이</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const diff = r.planConsume !== null ? r.actualConsume - r.planConsume : null
            return (
              <tr key={r.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.date}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.prodNo}</td>
                <td>{r.productName}</td>
                <td>{r.materialName}</td>
                <td style={{ textAlign: 'right' }}>{r.planConsume !== null ? r.planConsume.toLocaleString() : '-'}</td>
                <td style={{ textAlign: 'right' }}>{r.actualConsume.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: diff !== null && diff !== 0 ? '#c60a2e' : '#9aa1ab' }}>{diff !== null ? diff.toLocaleString() : '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
