import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel from '../../components/EcStatusPanel'
import { periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { FastVoucher, FastVoucherType, JournalEntry } from '../../types/api'
import { JOURNAL_INQUIRY_PICKS } from '../../utils/periods'
import SlipPrintModal from '../../features/journalprint/SlipPrintModal'
import { journalSlipHtml, loadSlipHeader, splitPerLine, voucherSlipHtml } from '../../features/journalprint/slipPrint'

type Kind = Extract<FastVoucherType, 'EXPENSE_REPORT' | 'DEPOSIT_REPORT' | 'ADVANCE_SETTLEMENT'>
/** 원본 화면 제목 · 아래 단추 · 거래처 열 이름(2026-10-20 실측). */
const SPEC: Record<Kind, { title: string; button: string; who: string }> = {
  EXPENSE_REPORT: { title: '지출결의서인쇄', button: '결의서인쇄', who: '거래처명' },
  DEPOSIT_REPORT: { title: '입금보고서인쇄', button: '보고서인쇄', who: '거래처명' },
  ADVANCE_SETTLEMENT: { title: '가지급금정산서인쇄', button: '정산서인쇄', who: '대상자' },
}
const TABS = ['전체', '미확인', '확인'] as const
type Status = 'UNCONFIRMED' | 'IN_APPROVAL' | 'CONFIRMED'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
/** 원본 [전표일자] '2026/10/20 -3' — 일자와 회계전표 일련. */
const dateNo = (v: FastVoucher) => {
  const m = /-0*(\d+)$/.exec(v.journalDocNo ?? '')
  return `${v.voucherDate.replaceAll('-', '/')}${m ? ` -${m[1]}` : ''}`
}

/**
 * 회계 I › 회계거래관리 › <b>지출결의서인쇄</b>(E010710) · <b>입금보고서인쇄</b> · <b>가지급금정산서인쇄</b>(E010714) — 2026-10-20 loginaa 실측.
 *
 * <p>알약 [전체 · 미확인 · <b>확인</b>], 기간(접힌 조건, 기본 최근30일). 격자 [☐ · 전표일자 · 금액 · 거래처명(정산서는 대상자) · 적요 ·
 * 결의서 · 전표 · 건별] — 끝 셋은 줄마다 '인쇄': 결의서 서식 · 전표 서식 · 결의서 줄 하나씩 전표. 아래 [결의서인쇄](입금 [보고서인쇄] ·
 * 정산 [정산서인쇄]) — 고른 결의서를 이어 찍는다.
 */
export default function VoucherPrintListPage({ kind }: { kind: Kind }) {
  const spec = SPEC[kind]
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [rows, setRows] = useState<FastVoucher[]>([])
  const [journals, setJournals] = useState<Record<number, JournalEntry & { confirmStatus?: Status }>>({})
  const [tab, setTab] = useState<(typeof TABS)[number]>('확인')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [printing, setPrinting] = useState<{ title: string; html: string } | null>(null)

  async function load() {
    setError('')
    try {
      const [v, j] = await Promise.all([
        api.get<{ rows: FastVoucher[] }>('/vouchers', { params: { type: kind, from, to, all: true } }),
        api.get<{ rows: (JournalEntry & { confirmStatus?: Status })[] }>('/journals', { params: { from, to, all: true } }),
      ])
      setRows(v.data.rows.filter((x) => x.type === kind))
      setJournals(Object.fromEntries(j.data.rows.map((e) => [e.id, e])))
      setChecked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [kind])

  const shown = useMemo(() => rows
    .filter((v) => {
      const st = v.journalEntryId ? journals[v.journalEntryId]?.confirmStatus : undefined
      return tab === '전체' || (tab === '확인' ? st === 'CONFIRMED' : st !== 'CONFIRMED')
    })
    .sort((a, b) => b.voucherDate.localeCompare(a.voucherDate) || (b.journalDocNo ?? '').localeCompare(a.journalDocNo ?? '')),
  [rows, journals, tab])

  async function printVouchers(vs: FastVoucher[]) {
    const h = await loadSlipHeader()
    setPrinting({ title: vs[0]?.typeName ?? spec.title, html: voucherSlipHtml(vs, h.company) })
  }
  async function printJournal(v: FastVoucher, perLine: boolean) {
    const e = v.journalEntryId ? journals[v.journalEntryId] : undefined
    if (!e) { setError('이 결의서의 회계전표가 기간 안에 없습니다.'); return }
    const h = await loadSlipHeader()
    setPrinting({ title: '전표', html: journalSlipHtml(perLine ? splitPerLine(e) : [e], h.company, h.sign) })
  }
  const who = (v: FastVoucher) => (kind === 'ADVANCE_SETTLEMENT'
    ? v.lines.find((l) => l.employeeName)?.employeeName ?? v.partnerName ?? ''
    : v.partnerName ?? v.payeeName ?? v.lines.find((l) => l.partnerName)?.partnerName ?? '')

  return (
    <EcListShell
      title={spec.title}
      onSearch={load}
      collapseConditions
      actions={[
        { label: spec.button, primary: true, selected: checked.size, onClick: () => void printVouchers(shown.filter((v) => checked.has(v.id))) },
      ]}
    >
      <EcStatusPanel from={from} to={to} onPeriod={(r) => { setFrom(r.from); setTo(r.to) }} picks={JOURNAL_INQUIRY_PICKS} />

      <div className="ec-pills mb-[8px]">
        {TABS.map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
                  onClick={() => { setTab(t); setChecked(new Set()) }}>{t}</button>
        ))}
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[30px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((v) => checked.has(v.id))}
                     onChange={(ev) => setChecked(ev.target.checked ? new Set(shown.map((v) => v.id)) : new Set())} />
            </th>
            <th className="text-center">전표일자</th>
            <th className="text-right">금액</th>
            <th>{spec.who}</th>
            <th>적요</th>
            <th className="text-center w-[60px]">결의서</th>
            <th className="text-center w-[60px]">전표</th>
            <th className="text-center w-[60px]">건별</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((v) => (
            <tr key={v.id}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${dateNo(v)} 선택`} checked={checked.has(v.id)}
                       onChange={(ev) => setChecked((prev) => {
                         const next = new Set(prev)
                         if (ev.target.checked) next.add(v.id); else next.delete(v.id)
                         return next
                       })} />
              </td>
              <td className="text-center">{dateNo(v)}</td>
              <td className="text-right">{won(v.totalAmount)}</td>
              <td>{who(v)}</td>
              <td>{v.description ?? ''}</td>
              <td className="text-center"><a className="text-ec-navy cursor-pointer" onClick={() => void printVouchers([v])}>인쇄</a></td>
              <td className="text-center"><a className="text-ec-navy cursor-pointer" onClick={() => void printJournal(v, false)}>인쇄</a></td>
              <td className="text-center"><a className="text-ec-navy cursor-pointer" onClick={() => void printJournal(v, true)}>인쇄</a></td>
            </tr>
          ))}
        </tbody>
      </table>
      <SlipPrintModal title={printing?.title ?? ''} html={printing?.html ?? null} onClose={() => setPrinting(null)} />
    </EcListShell>
  )
}
