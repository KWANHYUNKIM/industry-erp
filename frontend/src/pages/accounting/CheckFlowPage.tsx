import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { NOTE_FLOW_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import type { BankAccountRow, BankCheck, CheckType } from '../../types/api'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/**
 * 회계 II &gt; 수표관리 &gt; 수령수표 &gt; <b>수령수표증가현황</b>(E060609) · <b>수령수표감소현황</b>(E060610) — 2026-10-02 loginaa 실측.
 *
 * <p>두 화면은 조건 · 열이 같다. 조건: 기준일자(구간, 기본 [최근30일]) · 거래처 · 부서 · 프로젝트 · 수령수표계좌 · 계정 · 수표번호 ·
 * 적요 · 거래유형 · 최초작성자 · 최종수정자. 열: 일자-No. · 수표번호 · 거래처명 · 계정명 · 거래유형 · 적요 · 금액.
 * 증가는 받은 날이 기간 안인 수표, 감소는 손을 떠난 날(입금 · 부도)이 기간 안인 수표다.
 *
 * <p>[일자-No.]는 그 움직임을 적은 회계전표다 — 받을 때 분개(source_id)와 손을 떠날 때 분개(V239 settle_journal_id).
 * [거래유형]은 원본에 자료가 없어 무슨 값이 찍히는지 못 쟀다 — 우리는 그 움직임의 이름(수령 · 입금완료 · 부도)을 열에 적고
 * 같은 값으로 거른다.
 * 부서 · 프로젝트는 수표에 없다.
 *
 * <p><b>발행수표증가현황</b>(E060611) · <b>감소현황</b>(E060612)도 조건 · 열이 같다(계좌 조건이 [발행수표계좌]). 증가는 발행한 날,
 * 감소는 은행에서 빠져나간(결제완료) 날이다. 계정명은 끊은 계좌의 총계정이고, 결제는 분개를 안 만들어(발행 때 이미 반영)
 * 감소의 [일자-No.] 번호는 비어 있다.
 */
export default function CheckFlowPage({ type, flow }: { type: CheckType; flow: '증가' | '감소' }) {
  const received = type === 'RECEIVED'
  const title = received
    ? (flow === '증가' ? '수령수표증가현황' : '수령수표감소현황')
    : (flow === '증가' ? '발행수표증가현황' : '발행수표감소현황')
  const acctLabel = received ? '수령수표계좌' : '발행수표계좌'
  const account = '받을수표'
  /* 발행수표의 계정명 — 끊은 계좌의 총계정(분개가 대변에 쓰는 것). */
  const [glByAccount, setGlByAccount] = useState<Map<number, string>>(new Map())
  useEffect(() => {
    if (received) return
    api.get<BankAccountRow[]>('/bank-cards/accounts')
      .then((r) => setGlByAccount(new Map(r.data.map((a) => [a.id, a.glAccountName]))))
      .catch(() => setGlByAccount(new Map()))
  }, [received])
  const accountOf = (c: BankCheck) => (received ? account : (c.bankAccountId != null ? glByAccount.get(c.bankAccountId) ?? '' : ''))
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [partner, setPartner] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [checkNo, setCheckNo] = useState('')
  const [remark, setRemark] = useState('')
  const [author, setAuthor] = useState('')
  const [kind, setKind] = useState('')
  const [checks, setChecks] = useState<BankCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 증가는 받은 날로 서버가 자른다. 감소는 닫힌 날로 걸어야 해 기간 끝날까지 받은 것을 받아 화면에서 다시 거른다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const params = flow === '증가' ? { from, to } : { to }
      const r = await api.get<BankCheck[]>('/checks', { params })
      setChecks(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, flow, type])

  const dayOf = (c: BankCheck) => (flow === '증가' ? c.issueDate : c.settledDate ?? '')
  const noOf = (c: BankCheck) => (flow === '증가' ? c.issueJournalNo : c.settleJournalNo) ?? ''
  const kindOf = (c: BankCheck) => (flow === '증가' ? (received ? '수령' : '발행') : c.statusName)
  const shown = useMemo(() => checks
    .filter((c) => c.type === type)
    .filter((c) => { const d = dayOf(c); return !!d && d >= from && d <= to })
    .filter((c) => !partner || String(c.partnerId) === partner)
    .filter((c) => !bankAccount || (c.bankAccountName ?? '') === bankAccount)
    .filter((c) => !checkNo || c.checkNo.includes(checkNo))
    .filter((c) => !remark || (c.remark ?? '').includes(remark))
    .filter((c) => !author || (c.createdBy ?? '') === author)
    .filter((c) => !kind || kindOf(c) === kind)
    .sort((a, b) => (dayOf(a) < dayOf(b) ? -1 : dayOf(a) > dayOf(b) ? 1 : a.checkNo.localeCompare(b.checkNo))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [checks, type, flow, from, to, partner, bankAccount, checkNo, remark, author, kind])
  const total = shown.reduce((a, c) => a + Number(c.amount), 0)
  const ofType = useMemo(() => checks.filter((c) => c.type === type), [checks, type])
  const partners = useMemo(() => {
    const m = new Map<number, string>()
    ofType.forEach((c) => { if (c.partnerId != null) m.set(c.partnerId, c.partnerName ?? '') })
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: String(id), name }))
  }, [ofType])
  const accounts = useMemo(() => [...new Set(ofType.map((c) => c.bankAccountName).filter(Boolean) as string[])].sort(), [ofType])
  const authors = useMemo(() => [...new Set(ofType.map((c) => c.createdBy).filter(Boolean) as string[])].sort(), [ofType])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [shown.length])

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setPartner(''); setBankAccount(''); setCheckNo(''); setRemark(''); setAuthor(''); setKind('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={NOTE_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={partners} />
        </EcCond>
        <EcCond label={received ? '수령수표계좌' : '발행수표계좌'} pick>
          <CodePickerField label={acctLabel} hideLabel width={200} emptyLabel="전체" value={bankAccount} onChange={setBankAccount}
                           items={accounts.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        {/* 원본 [계정] — 받은수표는 받을수표 하나, 발행수표는 끊은 계좌의 계정이라 계좌 조건이 그 몫을 한다. */}
        <EcCond label="계정">
          <select className="ec-input" value={received ? account : ''} disabled style={{ width: 140 }}>
            <option value={received ? account : ''}>{received ? account : '계좌의 계정'}</option>
          </select>
        </EcCond>
        <EcCond label="수표번호">
          <input className="ec-input" value={checkNo} onChange={(e) => setCheckNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="거래유형">
          <select className="ec-input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 120 }}>
            <option value="">전체</option>
            {(flow === '증가' ? [received ? '수령' : '발행'] : received ? ['입금완료', '부도'] : ['결제완료']).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={170} emptyLabel="전체" value={author} onChange={setAuthor}
                           items={authors.map((a) => ({ value: a, name: a }))} />
        </EcCond>
      </ul>

      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '4px 0 6px' }}>
        {title} <span style={{ fontWeight: 400, color: '#8a929c' }}>{dateText(from)} ~ {dateText(to)}</span>
      </h3>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>일자-No.</th>
            <th>수표번호</th>
            <th>거래처명</th>
            <th>계정명</th>
            <th style={{ textAlign: 'center' }}>거래유형</th>
            <th>적요</th>
            <th style={{ textAlign: 'right' }}>금액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((c) => (
            <tr key={c.id}>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{dateText(dayOf(c))} {noOf(c)}</td>
              <td>{c.checkNo}</td>
              <td>{c.partnerName ?? ''}</td>
              <td>{accountOf(c)}</td>
              <td style={{ textAlign: 'center' }}>{kindOf(c)}</td>
              <td>{c.remark ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{won(Number(c.amount))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: 'rgb(243, 243, 243)' }}>
            <td colSpan={6}>합계</td>
            <td style={{ textAlign: 'right' }}>{won(total)}</td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
