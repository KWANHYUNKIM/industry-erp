import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { ymd } from '../../components/EcPeriodPicks'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { dateNo } from '../../utils/dateNo'
import type { BankAccountRow, BankTxn, CardUsage, Partner } from '../../types/api'
import { EcDateRange } from '../../components/ui/EcDateInput'

/**
 * 회계 I › <b>계좌/카드</b> 네 화면 — 2026-10-14 loginaa 실측(입/출금계좌 조회 C001137 · 카드매입조회 E010206 ·
 * 카드매출조회 E010215 · 결제대행사매출조회 E010207).
 *
 * <p>원본은 넷 다 은행 · 카드사 · 결제대행사에서 <b>긁어 온</b> 줄을 보여 주고, 줄을 골라 [입금보고서작성] ·
 * [지출결의서작성] · [매출전표생성] 으로 전표를 만든다(만들면 '미반영' → '회계반영'). 처음 알약은 <b>미반영</b>.
 * 우리는 연동이 없어서, 계좌/카드 화면의 [계좌입출금] · [카드사용] 으로 넣은 줄(넣을 때 전표가 같이 생긴다 — 늘 회계반영)을
 * 앞의 두 화면에 보이고, 카드매출 · 결제대행사매출은 받을 자료가 없어 빈 목록이다.
 * 즉시조회 · 통장등록 · 연동대상등록 · 인증정보관리 · 자동알림 · 수집처별확인사항 · 매핑조회는 연동 단추라 두지 않았다(plans/회계1.md 남은 것).
 */
export type LinkedKind = 'bank' | 'cardBuy' | 'cardSale' | 'pg'

const PILLS = ['전체', '미반영', '회계반영', '강제회계반영'] as const
type Pill = (typeof PILLS)[number]
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '종료일'] as const

/** 원본 처음 기간 [최근7일] — 10/14 에 2026/10/07 ~ 2026/10/14(이레 전부터). */
function recent7() {
  const t = new Date()
  const f = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 7)
  return { from: ymd(f), to: ymd(t) }
}

const TITLE: Record<LinkedKind, string> = {
  bank: '입/출금계좌 조회', cardBuy: '카드매입조회', cardSale: '카드매출조회', pg: '결제대행사매출조회',
}
const HEAD: Record<LinkedKind, string[]> = {
  bank: ['입/출금일자', '구분', '계좌번호', '계좌명', '거래처코드', '거래처명', '입금처(출금처)', '금액', '원화잔액', '상대은행명', '회계전표'],
  cardBuy: ['일시', '카드명', '거래업체명', '총금액', '부가세', '상대계정코드', '상대계정명', '상태', '전표종류', '전표번호'],
  cardSale: ['일시', '카드사', '제휴카드사', '카드번호', '승인번호', '승인금액', '할부기간', '구분'],
  pg: ['일자', '구분', '결제대행사ID', '결제대행사', '거래처코드', '거래처명', '입금처', '금액', '회계전표', '결제수단'],
}
const RIGHT = new Set(['금액', '원화잔액', '총금액', '부가세', '승인금액'])
/** 원본 하단 첫 단추(파란 · 고른 줄로 전표를 만든다)와 그 전표 입력 화면. */
const MAKE: Record<LinkedKind, { label: string; to: string }> = {
  bank: { label: '입금보고서작성', to: '/accounting/vouchers?type=DEPOSIT_REPORT' },
  cardBuy: { label: '지출결의서작성', to: '/accounting/vouchers' },
  cardSale: { label: '매출전표생성', to: '/accounting/sales-slip' },
  pg: { label: '입금보고서작성', to: '/accounting/vouchers?type=DEPOSIT_REPORT' },
}

interface AccountLite { id: number; code: string; name: string }
interface Row { id: number; cells: string[]; reflected: boolean; date: string; amount: number; text: string }

const won = (n: number | null | undefined) => (n == null ? '' : Number(n).toLocaleString('ko-KR'))
const slash = (d: string) => d.replaceAll('-', '/')

export default function LinkedTxnListPage({ kind }: { kind: LinkedKind }) {
  const title = TITLE[kind]
  const navigate = useNavigate()
  const first = recent7()
  const [from, setFrom] = useState(first.from)
  const [to, setTo] = useState(first.to)
  const [shownFrom, setShownFrom] = useState(first.from)
  const [shownTo, setShownTo] = useState(first.to)
  const [pill, setPill] = useState<Pill>('미반영')
  const [keyword, setKeyword] = useState('')
  const [c1, setC1] = useState('')
  const [c2, setC2] = useState('')
  const [c3, setC3] = useState('')
  const [c4, setC4] = useState('')
  const [amountFrom, setAmountFrom] = useState('')
  const [amountTo, setAmountTo] = useState('')
  const [dir, setDir] = useState<string>(kind === 'cardSale' ? '카드사별/일자별' : '전체')
  const [byUpdated, setByUpdated] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const params = { from: from || undefined, to: to || undefined }
      if (kind === 'bank') {
        const [t, accts, partners] = await Promise.all([
          api.get<{ rows: BankTxn[] }>('/bank-cards/transactions', { params }),
          api.get<BankAccountRow[]>('/bank-cards/accounts'),
          api.get<Partner[]>('/partners'),
        ])
        const acctName = new Map(accts.data.map((a) => [a.id, a.name ?? a.bankName]))
        const pCode = new Map(partners.data.map((p) => [p.id, p.code]))
        setRows(t.data.rows.map((x) => ({
          id: x.id, reflected: x.journalEntryId != null, date: x.txnDate, amount: Number(x.amount),
          text: `${x.accountNo} ${x.partnerName ?? ''} ${x.description ?? ''}`,
          cells: [slash(x.txnDate), x.directionName, x.accountNo, acctName.get(x.bankAccountId) ?? '',
            x.partnerId != null ? pCode.get(x.partnerId) ?? '' : '', x.partnerName ?? '', x.description ?? '',
            won(x.amount), won(x.balanceAfter), '', x.journalDocNo ? dateNo(x.txnDate, x.journalDocNo) : ''],
        })))
      } else if (kind === 'cardBuy') {
        const [u, accts] = await Promise.all([
          api.get<CardUsage[]>('/bank-cards/usages', { params }),
          api.get<AccountLite[]>('/accounts'),
        ])
        const aCode = new Map(accts.data.map((a) => [a.id, a.code]))
        setRows(u.data.map((x) => ({
          id: x.id, reflected: x.journalEntryId != null, date: x.usageDate, amount: Number(x.totalAmount),
          text: `${x.cardNo} ${x.usageNo} ${x.merchant}`,
          cells: [slash(x.usageDate), x.cardName, x.merchant, won(x.totalAmount), Number(x.vatAmount) ? won(x.vatAmount) : '',
            aCode.get(x.expenseAccountId) ?? '', x.expenseAccountName, '승인', '',
            x.journalDocNo ? dateNo(x.usageDate, x.journalDocNo) : ''],
        })))
      } else {
        setRows([]) // 카드매출 · 결제대행사매출은 연동으로만 들어온다 — 우리에게 받을 자료가 없다.
      }
      setShownFrom(from)
      setShownTo(to)
      setPicked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [kind])

  const shown = useMemo(() => {
    const inc = (hay: string, q: string) => !q || hay.includes(q)
    const list = rows
      .filter((r) => pill === '전체' || (pill === '회계반영' ? r.reflected : pill === '미반영' ? !r.reflected : false))
      .filter((r) => inc(r.text, keyword))
      .filter((r) => kind !== 'bank' || ((dir === '전체' || r.cells[1] === dir) && inc(`${r.cells[2]} ${r.cells[3]}`, c1) && inc(r.cells[6], c2)))
      .filter((r) => kind !== 'cardBuy' || (inc(r.text, c1) && inc(r.text, c2) && inc(r.cells[2], c3) && inc(r.text, c4)))
      .filter((r) => !amountFrom || r.amount >= Number(amountFrom))
      .filter((r) => !amountTo || r.amount <= Number(amountTo))
    return byUpdated ? list : [...list].sort((a, b) => a.date.localeCompare(b.date))
  }, [rows, pill, keyword, kind, dir, c1, c2, c3, c4, amountFrom, amountTo, byUpdated])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [shown.length])
  const toggle = (id: number, on: boolean) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })
  const head = HEAD[kind]

  const radio = (labels: string[]) => (
    <span className="flex items-center gap-[10px]">
      {labels.map((l) => (
        <label key={l} className="flex items-center gap-[3px]">
          <input type="radio" name={`${kind}-dir`} checked={dir === l} onChange={() => setDir(l)} />{l}
        </label>
      ))}
    </span>
  )
  const text = (label: string, v: string, set: (s: string) => void) => (
    <EcCond label={label}><input className="ec-input w-[220px]" placeholder={label} value={v} onChange={(e) => set(e.target.value)} /></EcCond>
  )
  const amount = (
    <EcCond label="금액">
      <input className="ec-input w-[100px] text-right" placeholder="금액" value={amountFrom} onChange={(e) => setAmountFrom(e.target.value)} />
      <span className="mx-[4px]">~</span>
      <input className="ec-input w-[100px] text-right" aria-label="금액 끝" value={amountTo} onChange={(e) => setAmountTo(e.target.value)} />
    </EcCond>
  )
  const sortBox = (
    <EcCond label="기타">
      <label className="flex items-center gap-[4px]">
        <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />수정일자순(정렬)
      </label>
    </EcCond>
  )
  const period = (
    <EcCond label={kind === 'cardBuy' || kind === 'cardSale' ? '조회일자' : '기준일자'} span={2}>
      <EcDateRange from={{ className: "ec-input w-[145px]", 'aria-label': "시작일", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", 'aria-label': "종료일", value: to, onChange: (e) => setTo(e.target.value) }} />
    </EcCond>
  )

  return (
    <EcListShell
      title={title}
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={() => void load()}
      actions={[
        { label: MAKE[kind].label, primary: true, selected: picked.size, onClick: () => navigate(MAKE[kind].to) },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        {kind === 'cardSale' && <EcCond label="구분">{radio(['건별', '카드사별/일자별'])}</EcCond>}
        {period}
        {kind === 'bank' && <>
          {text('계좌', c1, setC1)}
          {text('입금처(출금처)', c2, setC2)}
          <EcCond label="구분">{radio(['전체', '입금', '출금'])}</EcCond>
          {sortBox}
          {amount}
        </>}
        {kind === 'cardBuy' && <>
          {text('카드번호', c1, setC1)}
          {text('승인번호', c2, setC2)}
          {text('거래업체명', c3, setC3)}
          {text('거래업체사업자등록번호', c4, setC4)}
        </>}
        {kind === 'cardSale' && <>
          {text('카드사', c1, setC1)}
          {text('승인번호', c2, setC2)}
        </>}
        {kind === 'pg' && <>
          {text('결제대행사ID', c1, setC1)}
          {text('입금처', c2, setC2)}
          {amount}
          <EcCond label="구분">{radio(['전체', '승인', '취소', '부분취소'])}</EcCond>
          {sortBox}
        </>}
        <li className="full">
          <div className="form">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void load()}>검색(F8)</button>
            <span className="ml-[6px]"><EcPeriodPicks labels={[...PICKS]} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} /></span>
          </div>
        </li>
      </ul>

      <div className="flex items-center justify-between mb-[8px]">
        <div className="ec-pills">
          {PILLS.map((p) => (
            <button key={p} type="button" className={`ec-pill no-ec${pill === p ? ' active' : ''}`}
                    onClick={() => { setPill(p); setPicked(new Set()) }}>{p}</button>
          ))}
        </div>
        <span className="text-ec-label">{slash(shownFrom)} ~{slash(shownTo)}</span>
      </div>

      <table ref={tableRef} className="ec-head700 w-full text-left">
        <thead>
          <tr>
            <th className="w-[38px] text-center">
              <input type="checkbox" aria-label="전체선택" checked={shown.length > 0 && shown.every((r) => picked.has(r.id))}
                     onChange={(e) => shown.forEach((r) => toggle(r.id, e.target.checked))} />
            </th>
            {head.map((h) => <th key={h} className={RIGHT.has(h) ? 'text-right' : undefined}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={head.length + 1} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={head.length + 1} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${r.cells[0]} 선택`} checked={picked.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} />
              </td>
              {r.cells.map((c, i) => <td key={head[i]} className={RIGHT.has(head[i]) ? 'text-right' : undefined}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
