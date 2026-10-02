import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import type { BankCheck, CheckType } from '../../types/api'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/** 수표 한 장이 남기는 움직임 — 받은(발행한) 날 증가, 손을 떠난 날(입금 · 부도 · 결제완료) 감소. */
interface Move { key: string; date: string; inc: boolean; c: BankCheck }

/**
 * 회계 II &gt; 수표관리 &gt; 수령수표 &gt; <b>수령수표조회</b>(E060603) · 발행수표 &gt; <b>발행수표조회</b>(E060607) — 2026-10-03 loginaa 실측.
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일(+1개월)</b> — 2026/09/03 ~ 2026/11/02) · 수표번호 · 증감구분(전체 · 증가 · 감소 체크, 다 켜짐) ·
 * 거래유형 · 입력구분(전체 · 연결전표 · 직접입력, 다 켜짐) · 거래처 · 부서 · 프로젝트 · 수령(발행)수표계좌 · 적요 · 최초작성자 · 최종수정자.
 * 열: 일자 · 수표번호 · 증감구분 · 거래처명 · 금액 · 적요 · 거래유형 · 회계전표일자-No. (발행수표조회는 적요 뒤에 [인쇄] 열이 하나 더 있다.)
 * 버튼줄: 신규(F2) · (발행수표인쇄) · 선택삭제 · Excel.
 *
 * <p>한 줄은 수표가 아니라 <b>움직임</b>이다 — 받은 날 '수령수표증가', 입금 · 부도한 날 '수령수표감소'(발행은 발행 · 결제완료).
 * 우리 수표는 모두 수표관리 화면에서 직접 적으므로 [입력구분]은 늘 '직접입력'이다. 수표를 지우는 API 가 없어
 * [선택삭제]와 그 체크 열은 두지 않는다. [인쇄] 열 · [발행수표인쇄]는 수표 용지 인쇄 이력인데 우리는 수표를 인쇄하지 않는다.
 * [신규(F2)]는 수표를 적는 수표관리 화면으로 보낸다. 원본 판이 비어 합계줄이 있는지 못 쟀다 — 증가 · 감소를 더한 합은 뜻이 없어 두지 않는다.
 */
export default function CheckListPage({ type }: { type: CheckType }) {
  const received = type === 'RECEIVED'
  const title = received ? '수령수표조회' : '발행수표조회'
  const acctLabel = received ? '수령수표계좌' : '발행수표계좌'
  const incName = received ? '수령수표증가' : '발행수표증가'
  const decName = received ? '수령수표감소' : '발행수표감소'
  const navigate = useNavigate()
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [checkNo, setCheckNo] = useState('')
  const [showInc, setShowInc] = useState(true)
  const [showDec, setShowDec] = useState(true)
  const [kind, setKind] = useState('')
  const [direct, setDirect] = useState(true)
  const [partner, setPartner] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [remark, setRemark] = useState('')
  const [author, setAuthor] = useState('')
  const [checks, setChecks] = useState<BankCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 감소는 닫힌 날로 걸어야 해 기간 끝날까지 받은(발행한) 수표를 다 받아 화면에서 날짜로 다시 거른다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<BankCheck[]>('/checks', { params: { to } })
      setChecks(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, type])

  const ofType = useMemo(() => checks.filter((c) => c.type === type), [checks, type])
  const kindOf = (m: Move) => (m.inc ? (received ? '수령' : '발행') : m.c.statusName)
  const moves = useMemo(() => {
    const out: Move[] = []
    for (const c of ofType) {
      out.push({ key: `${c.id}-i`, date: c.issueDate, inc: true, c })
      if (c.settledDate) out.push({ key: `${c.id}-d`, date: c.settledDate, inc: false, c })
    }
    return out
      .filter((m) => m.date >= from && m.date <= to)
      .filter((m) => (m.inc ? showInc : showDec))
      .filter(() => direct)
      .filter((m) => !checkNo || m.c.checkNo.includes(checkNo))
      .filter((m) => !kind || kindOf(m) === kind)
      .filter((m) => !partner || String(m.c.partnerId) === partner)
      .filter((m) => !bankAccount || (m.c.bankAccountName ?? '') === bankAccount)
      .filter((m) => !remark || (m.c.remark ?? '').includes(remark))
      .filter((m) => !author || (m.c.createdBy ?? '') === author)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.c.checkNo.localeCompare(b.c.checkNo) || (a.inc ? -1 : 1)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ofType, from, to, showInc, showDec, direct, checkNo, kind, partner, bankAccount, remark, author])
  const partners = useMemo(() => {
    const m = new Map<number, string>()
    ofType.forEach((c) => { if (c.partnerId != null) m.set(c.partnerId, c.partnerName ?? '') })
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: String(id), name }))
  }, [ofType])
  const accounts = useMemo(() => [...new Set(ofType.map((c) => c.bankAccountName).filter(Boolean) as string[])].sort(), [ofType])
  const authors = useMemo(() => [...new Set(ofType.map((c) => c.createdBy).filter(Boolean) as string[])].sort(), [ofType])
  const kinds = received ? ['수령', '입금완료', '부도'] : ['발행', '결제완료']
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [moves.length])

  const box = (label: string, checked: boolean, set: (v: boolean) => void) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setCheckNo(''); setShowInc(true); setShowDec(true); setKind(''); setDirect(true); setPartner(''); setBankAccount(''); setRemark(''); setAuthor('') } },
        { label: '신규(F2)', onClick: () => navigate('/accounting/checks') },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="수표번호">
          <input className="ec-input" value={checkNo} onChange={(e) => setCheckNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="증감구분">
          {box('전체', showInc && showDec, (v) => { setShowInc(v); setShowDec(v) })}
          {box(incName, showInc, setShowInc)}
          {box(decName, showDec, setShowDec)}
        </EcCond>
        <EcCond label="거래유형">
          <select className="ec-input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 120 }}>
            <option value="">전체</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </EcCond>
        {/* 원본 [입력구분] — 우리 수표는 모두 수표관리 화면에서 직접 적는다. 연결전표에서 생기는 수표가 없다. */}
        <EcCond label="입력구분">
          {box('전체', direct, setDirect)}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5, color: 'var(--ec-text-hint)' }}>
            <input type="checkbox" checked={false} disabled /> 연결전표
          </label>
          {box('직접입력', direct, setDirect)}
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={partners} />
        </EcCond>
        <EcCond label={received ? '수령수표계좌' : '발행수표계좌'} pick>
          <CodePickerField label={acctLabel} hideLabel width={200} emptyLabel="전체" value={bankAccount} onChange={setBankAccount}
                           items={accounts.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={170} emptyLabel="전체" value={author} onChange={setAuthor}
                           items={authors.map((a) => ({ value: a, name: a }))} />
        </EcCond>
      </ul>

      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '4px 0 6px' }}>
        {title} <span style={{ fontWeight: 400, color: 'var(--ec-text-hint)' }}>{dateText(from)} ~ {dateText(to)}</span>
      </h3>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>일자</th>
            <th>수표번호</th>
            <th style={{ textAlign: 'center' }}>증감구분</th>
            <th>거래처명</th>
            <th style={{ textAlign: 'right' }}>금액</th>
            <th>적요</th>
            <th style={{ textAlign: 'center' }}>거래유형</th>
            <th style={{ textAlign: 'center' }}>회계전표일자-No.</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>불러오는 중…</td></tr>
          ) : moves.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : moves.map((m) => {
            const no = (m.inc ? m.c.issueJournalNo : m.c.settleJournalNo) ?? ''
            return (
              <tr key={m.key}>
                <td style={{ textAlign: 'center' }}>{dateText(m.date)}</td>
                <td>{m.c.checkNo}</td>
                <td style={{ textAlign: 'center' }}>{m.inc ? incName : decName}</td>
                <td>{m.c.partnerName ?? ''}</td>
                <td style={{ textAlign: 'right' }}>{won(Number(m.c.amount))}</td>
                <td>{m.c.remark ?? ''}</td>
                <td style={{ textAlign: 'center' }}>{kindOf(m)}</td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{no ? `${dateText(m.date)} ${no}` : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
