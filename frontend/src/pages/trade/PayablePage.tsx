import { Fragment, useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { PartnerBalance, PurchaseDoc } from '../../api/types'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/** 매입일로부터 오늘까지 경과일 */
const daysSince = (date: string) =>
  Math.floor((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86_400_000)

const BUCKETS = [
  { label: '30일 이내', max: 30 },
  { label: '31~60일', max: 60 },
  { label: '61~90일', max: 90 },
  { label: '90일 초과', max: Infinity },
] as const

const bucketOf = (days: number) => BUCKETS.findIndex((b) => days <= b.max)

interface OpenDoc {
  id: number
  docNo: string
  purchaseDate: string
  totalAmount: number
  balance: number
  days: number
}

interface PayableRow {
  partnerId: number
  code: string
  name: string
  purchased: number
  paid: number
  balance: number
  docs: OpenDoc[]
  oldestDays: number
  buckets: number[]
}

/**
 * 회계 II > 채무관리 — 거래처별 미지급 잔액과 연령분석.
 *
 * 지급(정산)은 전표에 배분되지 않고 거래처 단위로만 쌓이므로, 미지급 전표는
 * 오래된 매입부터 지급액을 채워(선입선출) 남은 잔액으로 본다. 잔액 합계는
 * /api/ledger 의 순 미지급(매입−지급)과 일치한다.
 */
export default function PayablePage() {
  const [balances, setBalances] = useState<PartnerBalance[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [openId, setOpenId] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [b, p] = await Promise.all([
        api.get<PartnerBalance[]>('/ledger/partner-balances'),
        api.get<PurchaseDoc[]>('/purchases'),
      ])
      setBalances(b.data)
      setPurchases(p.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const rows = useMemo<PayableRow[]>(() => {
    const byPartner = new Map<number, PurchaseDoc[]>()
    for (const d of purchases) {
      const list = byPartner.get(d.partnerId)
      if (list) list.push(d)
      else byPartner.set(d.partnerId, [d])
    }

    return balances.map((b) => {
      const docs = (byPartner.get(b.partnerId) ?? [])
        .slice()
        .sort((x, y) => x.purchaseDate.localeCompare(y.purchaseDate))
      const purchased = docs.reduce((a, d) => a + d.totalAmount, 0)
      const balance = Math.max(b.payable, 0)
      // 오래된 매입부터 지급액으로 소진 → 남은 전표가 미지급
      let paidLeft = Math.max(purchased - balance, 0)
      const open: OpenDoc[] = []
      for (const d of docs) {
        const consumed = Math.min(paidLeft, d.totalAmount)
        paidLeft -= consumed
        const left = d.totalAmount - consumed
        if (left > 0) {
          open.push({
            id: d.id,
            docNo: d.docNo,
            purchaseDate: d.purchaseDate,
            totalAmount: d.totalAmount,
            balance: left,
            days: daysSince(d.purchaseDate),
          })
        }
      }
      const buckets = BUCKETS.map(() => 0)
      for (const d of open) buckets[bucketOf(d.days)] += d.balance

      return {
        partnerId: b.partnerId,
        code: b.code,
        name: b.name,
        purchased,
        paid: purchased - balance,
        balance,
        docs: open,
        oldestDays: open.length ? Math.max(...open.map((d) => d.days)) : 0,
        buckets,
      }
    })
  }, [balances, purchases])

  const shown = rows.filter((r) => {
    if (onlyOpen && r.balance <= 0) return false
    if (keyword && !r.name.includes(keyword) && !r.code.includes(keyword)) return false
    return true
  })

  const total = shown.reduce((a, r) => a + r.balance, 0)
  const overdue = shown.reduce((a, r) => a + r.buckets[3], 0)
  const totalBuckets = BUCKETS.map((_, i) => shown.reduce((a, r) => a + r.buckets[i], 0))

  return (
    <EcListShell
      title="채무관리 (미지급 현황)"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: '#f4faf5', padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: '#1c6b32' }}>총 미지급 (줄 돈)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2f8401' }}>{won(total)} <span style={{ fontSize: 13, fontWeight: 400 }}>원</span></div>
        </div>
        <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: '#fdf6f6', padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: '#c60a2e' }}>90일 초과 (장기 미지급)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#c60a2e' }}>{won(overdue)} <span style={{ fontSize: 13, fontWeight: 400 }}>원</span></div>
        </div>
        <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: '#f7f9fb', padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: '#5a626e' }}>미지급 거래처</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ec-blue-dark)' }}>{shown.filter((r) => r.balance > 0).length} <span style={{ fontSize: 13, fontWeight: 400 }}>곳</span></div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          미지급 잔액이 있는 거래처만
        </label>
        <span style={{ fontSize: 12, color: '#9aa1ab' }}>행을 클릭하면 미지급 전표가 펼쳐집니다. 지급 처리는 「수금/지급(정산)」 화면에서 합니다.</span>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>거래처코드</th>
            <th>거래처명</th>
            <th style={{ textAlign: 'right' }}>매입 합계</th>
            <th style={{ textAlign: 'right' }}>지급 합계</th>
            <th style={{ textAlign: 'right' }}>미지급 잔액</th>
            {BUCKETS.map((b) => <th key={b.label} style={{ textAlign: 'right' }}>{b.label}</th>)}
            <th style={{ textAlign: 'center' }}>최장 경과</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>미지급 잔액이 있는 거래처가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <Fragment key={r.partnerId}>
              <tr onClick={() => setOpenId(openId === r.partnerId ? null : r.partnerId)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{openId === r.partnerId ? '▾ ' : '▸ '}{r.code}</td>
                <td>{r.name}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{won(r.purchased)}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{won(r.paid)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: r.balance > 0 ? '#2f8401' : '#bbb' }}>{won(r.balance)}</td>
                {r.buckets.map((v, bi) => (
                  <td key={bi} style={{ textAlign: 'right', color: v === 0 ? '#ccd1d7' : bi === 3 ? '#c60a2e' : '#5a626e' }}>{won(v)}</td>
                ))}
                <td style={{ textAlign: 'center', color: r.oldestDays > 90 ? '#c60a2e' : '#5a626e' }}>
                  {r.balance > 0 ? `${r.oldestDays}일` : '-'}
                </td>
              </tr>
              {openId === r.partnerId && (
                <tr className="no-ec">
                  <td colSpan={11} style={{ padding: 0, background: '#fafbfc' }}>
                    {r.docs.length === 0 ? (
                      <div style={{ padding: 10, fontSize: 12, color: '#9aa1ab' }}>미지급 전표가 없습니다.</div>
                    ) : (
                      <table className="w-full text-left" style={{ margin: '4px 0' }}>
                        <thead>
                          <tr>
                            <th style={{ width: 34 }}></th>
                            <th>매입전표</th>
                            <th>매입일</th>
                            <th style={{ textAlign: 'right' }}>전표금액</th>
                            <th style={{ textAlign: 'right' }}>미지급 잔액</th>
                            <th style={{ textAlign: 'center' }}>경과일</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.docs.map((d, di) => (
                            <tr key={d.id}>
                              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{di + 1}</td>
                              <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{d.docNo}</td>
                              <td>{d.purchaseDate}</td>
                              <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(d.totalAmount)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(d.balance)}</td>
                              <td style={{ textAlign: 'center', color: d.days > 90 ? '#c60a2e' : '#5a626e' }}>{d.days}일</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={5} style={{ border: '1px solid var(--ec-border)', padding: '5px 8px' }}>합계</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: '#2f8401' }}>{won(total)}</td>
              {totalBuckets.map((v, i) => (
                <td key={i} style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: i === 3 && v > 0 ? '#c60a2e' : '#5a626e' }}>{won(v)}</td>
              ))}
              <td style={{ border: '1px solid var(--ec-border)' }}></td>
            </tr>
          </tfoot>
        )}
      </table>

      <p style={{ marginTop: 10, fontSize: 11.5, color: '#9aa1ab' }}>
        ※ 미지급 잔액 = 매입 합계 − 지급 합계(정산). 지급액은 거래처 단위로 관리되므로 오래된 매입전표부터 충당해 전표별 잔액을 계산합니다.
      </p>
    </EcListShell>
  )
}
