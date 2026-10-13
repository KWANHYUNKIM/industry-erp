import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { PartnerBalance, PurchaseDoc } from '../../types/api'
import { dateText } from '../../utils/dateText'

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
  /**
   * 구매전표로 설명되지 않는 잔액 — 외주비 회계반영처럼 회계전표가 외상매입금을 올린 몫(60회차부터 잔액에 들어온다).
   * 매입일이 없어 연령 칸에 못 넣는다. 예전엔 이 몫이 어느 칸에도 없어 연령 합계가 잔액보다 작았다(QA 65회차).
   */
  extra: number
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
  /* 칸이 자료 따라 변하는 표라 정적으로 못 센다 — 렌더된 표를 직접 재는 훅을 단다. */
  const tableRef = useRef<HTMLTableElement>(null)
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
      /*
       * 회계전표가 올린 몫(외주비 회계반영 등)은 서버가 따로 준다 — 잔액에서 그만큼 떼어 [회계전표 등] 에 두고,
       * 나머지(구매전표 몫)로만 오래된 매입부터 지급을 채운다. 잔액 − 매입으로 거꾸로 짐작하면
       * 지급 40,000 이 사라지고 회계전표 몫이 줄어 보였다(QA 65회차). 지급어음처럼 내린 몫(음수)은 지급과 같다.
       */
      const extra = Math.min(Math.max(b.payableJournal ?? 0, 0), balance)
      const slipBalance = balance - extra
      // 오래된 매입부터 지급액으로 소진 → 남은 전표가 미지급
      let paidLeft = Math.max(purchased - slipBalance, 0)
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
      const openSum = open.reduce((a, d) => a + d.balance, 0)

      return {
        partnerId: b.partnerId,
        code: b.code,
        name: b.name,
        purchased,
        /* 매입 중 갚은 몫 — 잔액에서 회계전표 몫(extra)을 뺀 나머지로 센다. 그러지 않으면 외주비만 있는 거래처의 지급이 음수로 찍힌다. */
        paid: purchased - openSum,
        balance,
        docs: open,
        oldestDays: open.length ? Math.max(...open.map((d) => d.days)) : 0,
        buckets,
        extra,
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
  const totalExtra = shown.reduce((a, r) => a + r.extra, 0)


  useTableColumnCheck(tableRef, '지급현황', [loading])

  return (
    <EcListShell
      title="채무관리 (미지급 현황)"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="flex gap-[10px] mb-[10px]">
        <div className="flex-1 border border-ec-line border-solid bg-ec-success-bg py-[12px] px-[16px]">
          <div style={{ fontSize: 12, color: '#1c6b32' }}>총 미지급 (줄 돈)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2f8401' }}>{won(total)} <span className="text-[13px] font-normal">원</span></div>
        </div>
        <div className="flex-1 border border-ec-line border-solid bg-ec-danger-bg py-[12px] px-[16px]">
          <div className="text-[12px] text-ec-danger">90일 초과 (장기 미지급)</div>
          <div className="text-[22px] font-extrabold text-ec-danger">{won(overdue)} <span className="text-[13px] font-normal">원</span></div>
        </div>
        <div className="flex-1 border border-ec-line border-solid bg-ec-page py-[12px] px-[16px]">
          <div className="text-[12px] text-ec-label">미지급 거래처</div>
          <div className="text-[22px] font-extrabold text-ec-navy">{shown.filter((r) => r.balance > 0).length} <span className="text-[13px] font-normal">곳</span></div>
        </div>
      </div>

      <div className="flex items-center gap-[8px] mb-[6px]">
        <label className="text-[12.5px] flex items-center gap-[4px]">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          미지급 잔액이 있는 거래처만
        </label>
        <span className="text-[12px] text-ec-hint">행을 클릭하면 미지급 전표가 펼쳐집니다. 지급 처리는 「수금/지급(정산)」 화면에서 합니다.</span>
      </div>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th>거래처코드</th>
            <th>거래처명</th>
            <th className="text-right">매입 합계</th>
            <th className="text-right">지급 합계</th>
            <th className="text-right">미지급 잔액</th>
            {BUCKETS.map((b) => <th key={b.label} className="text-right">{b.label}</th>)}
            <th className="text-right">회계전표 등</th>
            <th className="text-center">최장 경과</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <Fragment key={r.partnerId}>
              <tr onClick={() => setOpenId(openId === r.partnerId ? null : r.partnerId)} className="cursor-pointer">
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{openId === r.partnerId ? '▾ ' : '▸ '}{r.code}</td>
                <td>{r.name}</td>
                <td className="text-right text-ec-label">{won(r.purchased)}</td>
                <td className="text-right text-ec-label">{won(r.paid)}</td>
                {/* 음수 = 줄 돈보다 더 준 것(선급금). 0 과 같은 회색으로 죽이면 놓친다. */}
                <td style={{ textAlign: 'right', fontWeight: 700, color: r.balance > 0 ? '#2f8401' : r.balance < 0 ? 'var(--ec-danger)' : '#bbb' }}>
                  {won(r.balance)}{r.balance < 0 ? ' (선급금)' : ''}
                </td>
                {r.buckets.map((v, bi) => (
                  <td key={bi} style={{ textAlign: 'right', color: v === 0 ? '#ccd1d7' : bi === 3 ? 'var(--ec-danger)' : 'var(--ec-label)' }}>{won(v)}</td>
                ))}
                <td style={{ textAlign: 'right', color: r.extra === 0 ? '#ccd1d7' : 'var(--ec-label)' }}>{won(r.extra)}</td>
                <td style={{ textAlign: 'center', color: r.oldestDays > 90 ? 'var(--ec-danger)' : 'var(--ec-label)' }}>
                  {r.balance > 0 ? `${r.oldestDays}일` : '-'}
                </td>
              </tr>
              {openId === r.partnerId && (
                <tr className="no-ec">
                  <td colSpan={12} className="p-0 bg-ec-page">
                    {r.docs.length === 0 ? (
                      <div className="p-[10px] text-[12px] text-ec-hint">미지급 전표가 없습니다.</div>
                    ) : (
                      <table className="w-full text-left my-[4px] mx-0">
                        <thead>
                          <tr>
                            <th className="w-[34px]"></th>
                            <th>매입전표</th>
                            <th>매입일</th>
                            <th className="text-right">전표금액</th>
                            <th className="text-right">미지급 잔액</th>
                            <th className="text-center">경과일</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.docs.map((d, di) => (
                            <tr key={d.id}>
                              <td className="text-center text-ec-hint">{di + 1}</td>
                              <td className="text-ec-blue">{d.docNo}</td>
                              <td>{dateText(d.purchaseDate)}</td>
                              <td className="text-right text-ec-hint">{won(d.totalAmount)}</td>
                              <td className="text-right font-semibold">{won(d.balance)}</td>
                              <td style={{ textAlign: 'center', color: d.days > 90 ? 'var(--ec-danger)' : 'var(--ec-label)' }}>{d.days}일</td>
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
            <tr className="font-bold bg-ec-page">
              <td colSpan={5} className="border border-ec-line border-solid py-[5px] px-[8px]">합계</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: '#2f8401' }}>{won(total)}</td>
              {totalBuckets.map((v, i) => (
                <td key={i} style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: i === 3 && v > 0 ? 'var(--ec-danger)' : 'var(--ec-label)' }}>{won(v)}</td>
              ))}
              <td className="border border-ec-line border-solid py-[5px] px-[8px] text-right text-ec-label">{won(totalExtra)}</td>
              <td className="border border-ec-line border-solid"></td>
            </tr>
          </tfoot>
        )}
      </table>

      <p className="mt-[10px] text-[11.5px] text-ec-hint">
        ※ 미지급 잔액 = 매입 합계 − 지급 합계(정산) ± 회계전표가 외상매입금을 직접 움직인 것(외주비 회계반영·지급어음 등). 지급액은 거래처 단위로 관리되므로 오래된 매입전표부터 충당해 전표별 잔액을 계산합니다.
        <br />※ [회계전표 등] 은 구매전표로 설명되지 않는 잔액입니다 — 매입일이 없어 경과일 칸에 넣지 않습니다. 연령 네 칸 + [회계전표 등] = 미지급 잔액.
      </p>
    </EcListShell>
  )
}
