import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 영업 > <b>결제내역조회</b> — 거래처별 수금/지급 결제 이력.
 *
 * <p>원본 열 실측(사본): 결제요청일시 · <b>결제요청자ID</b> · 거래처 · 품목 · 결제금액 ·
 * 결제방법 · 결제상태 · 승인번호 · 재고전표 · 상태별처리기능 · <b>회계전표</b> · 내역.
 * 위쪽 탭은 전체 · <b>미반영 · 회계반영</b> · 강제회계반영이다.
 *
 * <p>그 탭과 [회계전표] 열이 말하는 것은 <b>결제 전표도 회계로 넘어간다</b>는 것이다.
 * 우리는 넘기지 않았다 — JournalSourceType 에 결제가 아예 없었다. 그래서 판매하면
 * 외상매출금이 잡히는데 수금해도 안 줄어, 원장의 외상매출금이 한 방향으로만 쌓였다.
 * 채권현황은 따로 세니까 맞고, 어긋난 것은 원장뿐이라 결산할 때까지 아무도 모른다.
 *
 * <p>승인번호·재고전표·상태별처리기능은 만들지 않았다. 원본의 결제내역은 PG(카드결제)
 * 연동에서 들어오는 자료인데 우리에겐 그 연동이 없다 — 칸만 만들면 늘 비어 있다.
 */
interface SettlementRow {
  id: number
  docNo: string
  typeName: string // 수금 | 지급
  partnerName: string
  settleDate: string
  amount: number
  method: string | null
  note: string | null
  createdBy: string | null
  accountingReflected: boolean
}

const TABS = ['전체', '미반영', '회계반영'] as const
type Tab = typeof TABS[number]

export default function PaymentHistoryPage() {
  const [rows, setRows] = useState<SettlementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState<Tab>('전체')
  const [picked, setPicked] = useState<number[]>([])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SettlementRow[]>('/settlements')
      const list = [...res.data].sort((a, b) =>
        (a.settleDate < b.settleDate ? 1 : a.settleDate > b.settleDate ? -1 : b.id - a.id))
      setRows(list)
      setPicked([])
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows
    .filter((r) => tab === '전체' || (tab === '미반영' ? !r.accountingReflected : r.accountingReflected))
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.docNo.includes(keyword))
  const total = useMemo(() => shown.reduce((s, r) => s + r.amount, 0), [shown])
  const unreflected = rows.filter((r) => !r.accountingReflected).length

  /** 고른 전표를 회계로 넘긴다. 수금은 차)현금 / 대)외상매출금. */
  async function reflect(reverse: boolean) {
    if (picked.length === 0) return
    setError(''); setOk('')
    try {
      const res = await api.post<{ reflectedCount: number }>(
        `/accounting-reflection/${reverse ? 'unreflect' : 'reflect'}`,
        { kind: 'SETTLEMENT', ids: picked })
      setOk(`${res.data.reflectedCount}건 회계${reverse ? '반영취소' : '반영'} 완료`)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  return (
    <EcListShell title="결제내역조회" search={keyword} onSearchChange={setKeyword} onSearch={load}
                 actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf5ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      {/* 원본 위쪽 탭. 미반영이 몇 건인지 붙여 둔다 — 안 보이면 끝난 줄 안다. */}
      <ul className="ec-tabs" style={{ marginBottom: 8 }}>
        {TABS.map((t) => (
          <li key={t} className={`ec-tab${tab === t ? ' active' : ''}`}
              onClick={() => { setTab(t); setPicked([]) }}>
            {t}{t === '미반영' && unreflected > 0 ? ` (${unreflected})` : ''}
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" disabled={picked.length === 0}
                onClick={() => reflect(false)}>회계반영</button>
        <button className="ec-btn" disabled={picked.length === 0}
                onClick={() => reflect(true)}>반영취소</button>
        <span style={{ fontSize: 11.5, color: '#8a929c' }}>
          수금 차)현금·예금 / 대)외상매출금 · 지급 차)외상매입금 / 대)현금·예금
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b>
        </span>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 30, textAlign: 'center' }}></th>
            <th style={{ width: 100 }}>일자</th>
            <th style={{ width: 150 }}>전표번호</th>
            <th>거래처</th>
            <th style={{ width: 60, textAlign: 'center' }}>구분</th>
            <th style={{ width: 110 }}>결제방법</th>
            <th style={{ width: 130, textAlign: 'right' }}>결제금액</th>
            <th style={{ width: 110 }}>결제요청자</th>
            <th style={{ width: 90, textAlign: 'center' }}>회계전표</th>
            <th>내역</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} />
              </td>
              <td style={{ fontFamily: 'monospace' }}>{r.settleDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
              <td>{r.partnerName}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: r.typeName === '수금' ? '#1c7c3c' : '#c60a2e' }}>{r.typeName}</td>
              <td>{r.method ?? '-'}</td>
              <td style={{ textAlign: 'right' }}>{r.amount.toLocaleString()}</td>
              <td style={{ color: '#5a626e', fontSize: 11.5 }}>{r.createdBy ?? ''}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 11.5,
                           color: r.accountingReflected ? '#1c7c3c' : '#c07a00' }}>
                {r.accountingReflected ? '반영' : '미반영'}
              </td>
              <td style={{ color: '#8a929c' }}>{r.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={7} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{total.toLocaleString()}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
