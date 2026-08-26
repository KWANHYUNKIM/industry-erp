import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'

/** 구매 > 구매할인현황 — 품목 기준단가 대비 실매입가 할인 내역 (GET /api/purchases/discounts 연동) */
interface DiscountRow {
  date: string
  docNo: string
  partnerName: string
  itemCode: string
  itemName: string
  warehouseName: string | null
  projectName: string | null
  employeeName: string | null
  qty: number
  basePrice: number
  buyPrice: number
  discountPerUnit: number
  discountAmount: number
  discountRate: number
}

export default function PurchaseDiscountPage() {
  const [rows, setRows] = useState<DiscountRow[]>([])
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
    setError('')
    try {
      const res = await api.get<DiscountRow[]>('/purchases/discounts', {
        params: { from: from || undefined, to: to || undefined },
      })
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => {
    if (keyword && !(r.partnerName.includes(keyword) || r.itemName.includes(keyword)
      || r.itemCode.includes(keyword))) return false
    if (warehouse && !(r.warehouseName ?? '').includes(warehouse)) return false
    if (project && !(r.projectName ?? '').includes(project)) return false
    if (employee && !(r.employeeName ?? '').includes(employee)) return false
    if (minDiscount && r.discountAmount < Number(minDiscount)) return false
    return true
  })
  /**
   * 할인(+)과 할증(−)을 나눠 센다.
   *
   * <p>할인액이 음수면 기준단가보다 <b>비싸게</b> 거래한 것이다(할증). 예전에는 그 줄을
   * 잔액 0 과 같은 회색으로 죽여 놔서 눈에 띄지 않았고, 합계도 할인과 상쇄돼 버렸다.
   */
  const discountSide = shown.reduce(
    (a, r) => (r.discountAmount > 0 ? { count: a.count + 1, sum: a.sum + r.discountAmount } : a),
    { count: 0, sum: 0 },
  )
  const premiumSide = shown.reduce(
    (a, r) => (r.discountAmount < 0 ? { count: a.count + 1, sum: a.sum + r.discountAmount } : a),
    { count: 0, sum: 0 },
  )
  const totalDiscount = useMemo(
    () => shown.reduce((s, r) => s + r.discountAmount, 0),
    [shown],
  )

  return (
    <EcListShell
      title="구매할인현황"
      searchable={false}
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
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
      >
        <EcCond label="매입처" pick>
          <input className="ec-input" placeholder="거래처·품목 일부" value={keyword}
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

      {/*
        할인과 할증을 <b>합쳐서</b> 한 숫자로 보여 주면 서로 상쇄돼 실제 규모가 감춰진다.
        구매할인현황은 488줄 중 244줄이 할증인데, 합계 하나만 보면 그 사실이 안 보인다.
        그래서 두 방향을 나눠 적는다.
      */}
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        전체 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        할인 {discountSide.count}건 <b style={{ color: '#c60a2e', fontSize: 14 }}>{discountSide.sum.toLocaleString('ko-KR')}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        할증 {premiumSide.count}건 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{premiumSide.sum.toLocaleString('ko-KR')}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        순액 <b style={{ color: totalDiscount < 0 ? 'var(--ec-blue)' : '#c60a2e', fontSize: 14 }}>
          {totalDiscount.toLocaleString('ko-KR')}
        </b>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자</th><th>전표번호</th><th>매입처</th><th>품목명</th>
            <th style={{ textAlign: 'right' }}>수량</th>
            <th style={{ textAlign: 'right' }}>기준단가</th><th style={{ textAlign: 'right' }}>매입가</th>
            <th style={{ textAlign: 'right' }}>할인액</th><th style={{ textAlign: 'right' }}>할인율(%)</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>구매 내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={`${r.docNo}-${i}`}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.date}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
              <td>{r.partnerName}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.basePrice.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.buyPrice.toLocaleString()}</td>
              {/* 음수 = 기준단가보다 비싸게 거래한 것(할증). 회색으로 죽이면 놓친다. */}
              <td style={{
                textAlign: 'right', fontWeight: r.discountAmount === 0 ? 400 : 600,
                color: r.discountAmount > 0 ? '#c60a2e' : r.discountAmount < 0 ? 'var(--ec-blue)' : '#9aa1ab',
              }}>
                {r.discountAmount.toLocaleString('ko-KR')}{r.discountAmount < 0 ? ' (할증)' : ''}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.discountRate.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
