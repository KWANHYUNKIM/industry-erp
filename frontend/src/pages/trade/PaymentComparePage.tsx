import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { COMPARE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'

/** 영업 > 결제내역자료비교 — 장부(결제전표) 금액과 통장(은행거래) 확인 금액 대사 (/api/settlements 연동)
 *  통장금액: 계좌이체/카드 등 은행 추적 가능한 결제수단은 통장에서 확인된 것으로, 현금/어음 등은 통장 미확인(0)으로 대사한다. */
interface SettlementRow {
  id: number
  docNo: string
  typeName: string
  partnerName: string
  settleDate: string
  amount: number
  method: string | null
}

const BANK_METHODS = ['계좌이체', '이체', '카드', '온라인', '자동이체']

function bankTraceable(method: string | null): boolean {
  if (!method) return false
  return BANK_METHODS.some((m) => method.includes(m))
}

/**
 * 원본 조건 판 실측(사본 · 결제내역자료비교):
 *   기준일자(금월(~오늘)) · 거래처 · [자료기준] 전체 | 일치 | 불일치 ·
 *   양식 · 정렬/소계기준
 *   기간 빠른선택에 <b>이번기수(~전월)</b> 가 있다.
 *
 * <p>우리는 검색어 한 칸이 전부였다. 대사는 "안 맞는 것만 골라 보는" 화면인데
 * 정작 불일치만 볼 방법이 없었다.
 */
type Basis = '전체' | '일치' | '불일치'

export default function PaymentComparePage() {
  const [rows, setRows] = useState<SettlementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [partner, setPartner] = useState('')
  const [basis, setBasis] = useState<Basis>('전체')
  // '이번기수(~전월)' 은 회사 회계연도 시작월을 알아야 계산된다. 1월로 넘겨짚지 않는다.
  const [fiscalStart, setFiscalStart] = useState<number | undefined>(undefined)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SettlementRow[]>('/settlements')
      const list = [...res.data].sort((a, b) => (a.settleDate < b.settleDate ? 1 : a.settleDate > b.settleDate ? -1 : 0))
      setRows(list)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => {
        const m = Number(r.data?.fiscalStart)
        if (m >= 1 && m <= 12) setFiscalStart(m)
      })
      .catch(() => { /* 못 받으면 기수 버튼만 안 눌린다 */ })
  }, [])

  const shown = useMemo(() => rows.filter((r) => {
    if (r.settleDate < from || r.settleDate > to) return false
    if (partner && !(r.partnerName.includes(partner) || r.docNo.includes(partner))) return false
    if (basis !== '전체') {
      const matched = bankTraceable(r.method)
      if (basis === '일치' ? !matched : matched) return false
    }
    return true
  }), [rows, from, to, partner, basis])
  const mismatchCount = useMemo(() => shown.filter((r) => !bankTraceable(r.method)).length, [shown])
  const totals = useMemo(() => shown.reduce(
    (a, r) => ({ book: a.book + r.amount, bank: a.bank + (bankTraceable(r.method) ? r.amount : 0) }),
    { book: 0, bank: 0 },
  ), [shown])

  return (
    <EcListShell
      title="결제내역자료비교"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => {
          setFrom(init.from); setTo(init.to); setPartner(''); setBasis('전체')
        } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={COMPARE_PICKS}
        fiscalStart={fiscalStart}
      >
        <EcCond label="거래처" pick>
          <input className="ec-input" placeholder="거래처명·전표번호 일부" value={partner}
                 onChange={(e) => setPartner(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="자료기준">
          <div className="ec-pills">
            {(['전체', '일치', '불일치'] as const).map((b) => (
              <button key={b} type="button" className={`ec-pill no-ec${basis === b ? ' active' : ''}`}
                      onClick={() => setBasis(b)}>{b}</button>
            ))}
          </div>
        </EcCond>
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        불일치 <b style={{ color: '#c60a2e', fontSize: 14 }}>{mismatchCount}</b>건 / 전체 {shown.length}건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        장부 <b>{totals.book.toLocaleString('ko-KR')}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        통장 <b>{totals.bank.toLocaleString('ko-KR')}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        차이 <b style={{ color: totals.book - totals.bank ? '#c60a2e' : '#1c7c3c' }}>
          {(totals.book - totals.bank).toLocaleString('ko-KR')}
        </b>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자</th><th>거래처</th><th>결제수단</th>
            <th style={{ textAlign: 'right' }}>장부금액</th><th style={{ textAlign: 'right' }}>통장금액</th>
            <th style={{ textAlign: 'right' }}>차이</th>
            <th style={{ textAlign: 'center' }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const bankAmount = bankTraceable(r.method) ? r.amount : 0
            const diff = r.amount - bankAmount
            const status = diff === 0 ? '일치' : '불일치'
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.settleDate}</td>
                <td>{r.partnerName}</td>
                <td>{r.method ?? '-'}</td>
                <td style={{ textAlign: 'right' }}>{r.amount.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{bankAmount.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: diff !== 0 ? '#c60a2e' : '#9aa1ab' }}>{diff.toLocaleString()}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: diff === 0 ? '#1c7c3c' : '#c60a2e' }}>{status}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
