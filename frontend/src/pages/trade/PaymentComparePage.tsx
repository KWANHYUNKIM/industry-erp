import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { COMPARE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 영업 > 결제내역자료비교.
 *
 * <p>원본 결과 열 실측(사본): 왼쪽 <b>[결제내역]</b> 결제요청일시 · 거래처 · 공급가액 ·
 * 부가세 · 합계, 오른쪽 <b>[판매전표II]</b> 일자-No. · 거래처명 · 공급가액합계 ·
 * 부가세합계 · 금액합계, 그리고 <b>차이</b>. 즉 <b>받은 돈과 판 금액을 맞대는</b> 화면이다.
 *
 * <p>우리 화면은 "장부금액 대 통장금액" 을 비교했는데, 통장금액을 <b>결제수단 문자열로
 * 추정</b>했다 — 계좌이체·카드면 통장에서 확인된 것으로 치고 현금·어음이면 0 으로 쳤다.
 * 은행 거래 자료를 읽은 것이 아니라 글자만 보고 지어낸 값이라, 현금으로 받은 돈은
 * 전부 '불일치' 로 찍혔다. 대사표가 늘 틀리면 아무도 안 본다.
 *
 * <p>이제 원본대로 <b>판매전표 금액과 결제(수금) 금액</b>을 맞댄다. 둘 다 우리가 실제로
 * 가진 자료다. 한 줄은 (일자 × 거래처)이고, 차이는 판매 − 수금이다 — 양수면 아직 못 받은 돈.
 */
interface SettlementRow {
  id: number
  docNo: string
  typeName: string
  partnerName: string
  settleDate: string
  amount: number
  method: string | null
}

interface SalesDoc {
  id: number
  docNo: string
  partnerName: string
  saleDate: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
}

/** 한 줄 = 일자 × 거래처. 판매와 수금을 같은 칸에 맞댄다. */
interface CompareRow {
  key: string
  date: string
  partnerName: string
  saleDocNos: string[]
  supplyAmount: number
  vatAmount: number
  saleTotal: number
  payDocNos: string[]
  payTotal: number
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
  const [sales, setSales] = useState<SalesDoc[]>([])
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
      const [res, sl] = await Promise.all([
        api.get<SettlementRow[]>('/settlements'),
        api.get<SalesDoc[]>('/sales'),
      ])
      const list = [...res.data].sort((a, b) => (a.settleDate < b.settleDate ? 1 : a.settleDate > b.settleDate ? -1 : 0))
      setRows(list)
      setSales(sl.data)
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

  /**
   * 한 줄 = 일자 × 거래처. 판매전표 금액과 그날 받은 결제(수금)를 맞댄다.
   *
   * <p>수금만 있고 판매가 없는 날(선수금)도, 판매만 있고 수금이 없는 날(외상)도 한 줄로 낸다 —
   * 한쪽만 있는 것이야말로 대사에서 봐야 할 것이다.
   */
  const compared = useMemo(() => {
    const m = new Map<string, CompareRow>()
    const at = (date: string, partnerName: string) => {
      const key = `${date}|${partnerName}`
      const cur = m.get(key) ?? {
        key, date, partnerName,
        saleDocNos: [], supplyAmount: 0, vatAmount: 0, saleTotal: 0,
        payDocNos: [], payTotal: 0,
      }
      m.set(key, cur)
      return cur
    }
    for (const d of sales) {
      if (d.saleDate < from || d.saleDate > to) continue
      const r = at(d.saleDate, d.partnerName)
      r.saleDocNos.push(d.docNo)
      r.supplyAmount += d.supplyAmount
      r.vatAmount += d.vatAmount
      r.saleTotal += d.totalAmount
    }
    for (const p of rows) {
      if (p.settleDate < from || p.settleDate > to) continue
      // 지급(구매 대금)은 판매와 맞댈 것이 아니다 — 수금만 본다.
      if (p.typeName !== '수금') continue
      const r = at(p.settleDate, p.partnerName)
      r.payDocNos.push(p.docNo)
      r.payTotal += p.amount
    }
    return [...m.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.partnerName.localeCompare(b.partnerName)))
  }, [sales, rows, from, to])

  const shown = useMemo(() => compared.filter((r) => {
    if (partner && !(r.partnerName.includes(partner)
      || r.saleDocNos.some((n) => n.includes(partner))
      || r.payDocNos.some((n) => n.includes(partner)))) return false
    if (basis !== '전체') {
      const same = Math.abs(r.saleTotal - r.payTotal) < 0.005
      if (basis === '일치' ? !same : same) return false
    }
    return true
  }), [compared, partner, basis])

  const mismatchCount = useMemo(
    () => shown.filter((r) => Math.abs(r.saleTotal - r.payTotal) >= 0.005).length, [shown])
  const totals = useMemo(() => shown.reduce(
    (a, r) => ({ sale: a.sale + r.saleTotal, pay: a.pay + r.payTotal }),
    { sale: 0, pay: 0 },
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
        판매 <b>{totals.sale.toLocaleString('ko-KR')}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        결제 <b>{totals.pay.toLocaleString('ko-KR')}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        차이 <b style={{ color: totals.sale - totals.pay ? '#c60a2e' : '#1c7c3c' }}>
          {(totals.sale - totals.pay).toLocaleString('ko-KR')}
        </b>
      </div>
      {/* 원본은 [결제내역] 과 [판매전표II] 를 좌우로 놓고 맨 끝에 차이를 둔다. */}
      <div className="overflow-x-auto">
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 100 }}>일자</th>
              <th>거래처명</th>
              <th>판매전표</th>
              <th style={{ width: 120, textAlign: 'right' }}>공급가액합계</th>
              <th style={{ width: 110, textAlign: 'right' }}>부가세합계</th>
              <th style={{ width: 120, textAlign: 'right' }}>금액합계</th>
              <th>결제내역</th>
              <th style={{ width: 120, textAlign: 'right' }}>결제합계</th>
              <th style={{ width: 120, textAlign: 'right' }}>차이</th>
              <th style={{ width: 70, textAlign: 'center' }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.slice(0, 300).map((r, i) => {
              const diff = r.saleTotal - r.payTotal
              const same = Math.abs(diff) < 0.005
              return (
                <tr key={r.key}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.date.replace(/-/g, '/')}</td>
                  <td>{r.partnerName}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#5a626e' }}>
                    {r.saleDocNos.length === 0
                      ? <span style={{ color: '#c9ced6' }}>없음</span>
                      : `${r.saleDocNos[0]}${r.saleDocNos.length > 1 ? ` 외 ${r.saleDocNos.length - 1}` : ''}`}
                  </td>
                  <td style={{ textAlign: 'right' }}>{r.supplyAmount.toLocaleString('ko-KR')}</td>
                  <td style={{ textAlign: 'right' }}>{r.vatAmount.toLocaleString('ko-KR')}</td>
                  <td style={{ textAlign: 'right' }}>{r.saleTotal.toLocaleString('ko-KR')}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#5a626e' }}>
                    {r.payDocNos.length === 0
                      ? <span style={{ color: '#c9ced6' }}>없음</span>
                      : `${r.payDocNos[0]}${r.payDocNos.length > 1 ? ` 외 ${r.payDocNos.length - 1}` : ''}`}
                  </td>
                  <td style={{ textAlign: 'right' }}>{r.payTotal.toLocaleString('ko-KR')}</td>
                  {/* 양수는 아직 못 받은 돈, 음수는 판 것보다 더 받은 돈(선수금) */}
                  <td style={{ textAlign: 'right', fontWeight: 700, color: same ? '#9aa1ab' : diff > 0 ? '#c60a2e' : '#c07a00' }}>
                    {diff.toLocaleString('ko-KR')}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: same ? '#1c7c3c' : '#c60a2e' }}>
                    {same ? '일치' : '불일치'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={6} style={{ textAlign: 'right' }}>합계 ({shown.length}줄)</td>
                <td style={{ textAlign: 'right' }}>{totals.sale.toLocaleString('ko-KR')}</td>
                <td></td>
                <td style={{ textAlign: 'right' }}>{totals.pay.toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>
                  {(totals.sale - totals.pay).toLocaleString('ko-KR')}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
        {shown.length > 300 && (
          <p style={{ fontSize: 11.5, color: '#c07a00', marginTop: 6 }}>
            * 앞의 300줄만 보여 줍니다({shown.length}줄 중). 기간이나 거래처를 좁혀 주세요.
          </p>
        )}
      </div>
    </EcListShell>
  )
}
