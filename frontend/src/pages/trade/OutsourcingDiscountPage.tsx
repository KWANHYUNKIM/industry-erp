import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 판매/구매 > 외주비할인현황 — 구매(외주) 라인의 기준단가 대비 실구매 단가 차이를 할인으로 집계
 * (/api/purchases + /api/items: 정상외주비 = 품목 기준단가 × 수량, 실외주비 = 구매 공급가액)
 *
 * <p>원본 조건 판 실측(사본):
 *   기준일자(금월(~오늘)) · 창고 · 거래처 · 프로젝트 · 거래처관리담당자 · <b>할인금액</b> ·
 *   양식 · 정렬/소계기준
 * 우리는 <b>기간 조건이 아예 없어</b> 구매 전표 전체가 늘 한 화면에 쏟아졌다.
 * 판매·구매할인현황과 같은 조건 판을 붙인다.
 */
interface PurchaseLine { itemId: number; itemName: string; quantity: number; unitPrice: number; supplyAmount: number }
interface PurchaseDoc {
  id: number
  docNo: string
  partnerName: string
  purchaseDate: string
  warehouseName: string | null
  projectName: string | null
  employeeName: string | null
  lines: PurchaseLine[]
}
interface ItemMaster { id: number; unitPrice: number }

interface Row {
  key: string
  date: string
  docNo: string
  partner: string
  process: string
  warehouse: string | null
  project: string | null
  employee: string | null
  qty: number
  listAmount: number
  discountAmount: number
}

export default function OutsourcingDiscountPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouse, setWarehouse] = useState('')
  const [project, setProject] = useState('')
  const [employee, setEmployee] = useState('')
  const [minDiscount, setMinDiscount] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [p, it] = await Promise.all([
        api.get<PurchaseDoc[]>('/purchases'),
        api.get<ItemMaster[]>('/items'),
      ])
      const stdPrice = new Map<number, number>(it.data.map((x) => [x.id, x.unitPrice]))
      const flat: Row[] = []
      for (const d of p.data) {
        d.lines.forEach((l, idx) => {
          const std = stdPrice.get(l.itemId) ?? 0
          // 기준단가가 있으면 정상외주비 = 기준단가×수량, 없으면 실구매액 그대로(할인 0)
          const listAmount = std > 0 ? std * l.quantity : l.supplyAmount
          flat.push({
            key: `${d.id}-${idx}`,
            date: d.purchaseDate,
            docNo: d.docNo,
            partner: d.partnerName,
            process: l.itemName,
            warehouse: d.warehouseName,
            project: d.projectName,
            employee: d.employeeName,
            qty: l.quantity,
            listAmount,
            discountAmount: listAmount - l.supplyAmount,
          })
        })
      }
      flat.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      setRows(flat)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => {
    if (r.date < from || r.date > to) return false
    if (keyword && !(r.partner.includes(keyword) || r.process.includes(keyword))) return false
    if (warehouse && !(r.warehouse ?? '').includes(warehouse)) return false
    if (project && !(r.project ?? '').includes(project)) return false
    if (employee && !(r.employee ?? '').includes(employee)) return false
    if (minDiscount && r.discountAmount < Number(minDiscount)) return false
    return true
  })
  const totalList = useMemo(() => shown.reduce((s, r) => s + r.listAmount, 0), [shown])
  const totalDisc = useMemo(() => shown.reduce((s, r) => s + r.discountAmount, 0), [shown])
  const rate = totalList > 0 ? (totalDisc / totalList) * 100 : 0

  return (
    <EcListShell
      title="외주비할인현황"
      searchable={false}
      onNew={undefined}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => {
          setFrom(init.from); setTo(init.to)
          setKeyword(''); setWarehouse(''); setProject(''); setEmployee(''); setMinDiscount('')
        } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
      >
        <EcCond label="외주처" pick>
          <input className="ec-input" placeholder="외주처·품목 일부" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <input className="ec-input" placeholder="창고명 일부" value={warehouse}
                 onChange={(e) => setWarehouse(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <input className="ec-input" placeholder="프로젝트명 일부" value={project}
                 onChange={(e) => setProject(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <input className="ec-input" placeholder="담당자 일부" value={employee}
                 onChange={(e) => setEmployee(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="할인금액">
          <input className="ec-input" type="number" placeholder="이 금액 이상(할증은 음수)" value={minDiscount}
                 onChange={(e) => setMinDiscount(e.target.value)} style={{ width: 140 }} />
        </EcCond>
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        정상외주비 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{totalList.toLocaleString()}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        할인액 <b style={{ color: '#c60a2e', fontSize: 14 }}>{totalDisc.toLocaleString()}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        할인율 <b style={{ color: '#c60a2e', fontSize: 14 }}>{rate.toFixed(1)}%</b>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 100 }}>일자 ▼</th>
            <th style={{ width: 170 }}>전표번호</th>
            <th>외주처 ▼</th>
            <th>외주품목/공정 ▼</th>
            <th style={{ width: 90, textAlign: 'right' }}>수량</th>
            <th style={{ width: 120, textAlign: 'right' }}>정상외주비</th>
            <th style={{ width: 110, textAlign: 'right' }}>할인액</th>
            <th style={{ width: 110, textAlign: 'right' }}>실외주비</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>외주 할인 내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.date}</td>
              <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{r.docNo}</td>
              <td>{r.partner}</td>
              <td>{r.process}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.listAmount.toLocaleString()}</td>
              {/* 음수 = 정상외주비보다 비싸게 준 것(할증). 회색으로 죽이면 놓친다. */}
              <td style={{
                textAlign: 'right', fontWeight: r.discountAmount === 0 ? 400 : 600,
                color: r.discountAmount > 0 ? '#c60a2e' : r.discountAmount < 0 ? 'var(--ec-blue)' : '#9aa1ab',
              }}>
                {r.discountAmount.toLocaleString('ko-KR')}{r.discountAmount < 0 ? ' (할증)' : ''}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{(r.listAmount - r.discountAmount).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
