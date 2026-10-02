import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { NOTE_FLOW_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import type { NoteSummary, NoteType, PromissoryNote } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))

/** 어음 하나가 남기는 움직임 — 받은(발행한) 날 증가, 손을 떠난 날(결제 · 할인 · 부도) 감소. */
interface Move { date: string; kind: '증가' | '감소'; note: PromissoryNote }

/**
 * 회계 I &gt; 어음거래 &gt; <b>받을어음거래내역</b>(E010623) · <b>지급어음거래내역</b>(E010631) — 2026-10-02 loginaa 실측.
 * 두 화면은 조건 · 기본값 · 열이 글자 하나까지 같다 — type 만 바꾼다.
 *
 * <p>조건: 기준일자(구간, 기본 [최근30일]) · 계정 · 어음번호 · 거래처 · 부서 · 프로젝트 · 조회기준(<b>거래처별</b> | 거래처/어음번호별) ·
 * 기타([잔액0포함] 켜짐). 열: 일자 · 증감구분 · 어음번호 · 거래처명 · 계정명 · 부서명 · 프로젝트명 · 적요 · 증가금액 · 감소금액 · 잔액.
 *
 * <p>우리 어음은 부서 · 프로젝트를 들지 않아 그 두 조건과 두 열(부서명 · 프로젝트명)은 두지 않는다 — 열만 세우면 늘 빈칸이다.
 * 원본에 자료가 없어 <b>이월 줄 · 소계 줄의 모양은 못 쟀다</b>. 그래서 이월 줄을 지어내지 않고, 잔액은 기간 안의 증감을
 * 묶음(거래처 · 거래처/어음번호)마다 차례로 더해 센다. 묶음 끝에 '소계' 한 줄을 둔다.
 */
export default function NoteLedgerPage({ type }: { type: NoteType }) {
  const title = type === 'RECEIVABLE' ? '받을어음거래내역' : '지급어음거래내역'
  const account = type === 'RECEIVABLE' ? '받을어음' : '지급어음'
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [noteNo, setNoteNo] = useState('')
  const [partner, setPartner] = useState('')
  const [basis, setBasis] = useState<'거래처별' | '거래처/어음번호별'>('거래처별')
  const [withZero, setWithZero] = useState(true)
  const [notes, setNotes] = useState<PromissoryNote[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 기간 끝날까지 발행된 어음을 받는다 — 감소(닫힌 날)는 화면에서 기간으로 다시 거른다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<NoteSummary>('/notes', { params: { to } })
      setNotes(r.data.notes)
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, type])

  const groups = useMemo(() => {
    const moves: Move[] = []
    for (const n of notes) {
      if (n.type !== type) continue
      if (noteNo && !n.noteNo.includes(noteNo)) continue
      if (partner && String(n.partnerId) !== partner) continue
      if (n.issueDate >= from && n.issueDate <= to) moves.push({ date: n.issueDate, kind: '증가', note: n })
      if (n.closedDate && n.closedDate >= from && n.closedDate <= to) moves.push({ date: n.closedDate, kind: '감소', note: n })
    }
    const keyOf = (m: Move) => (basis === '거래처별' ? m.note.partnerName : `${m.note.partnerName} / ${m.note.noteNo}`)
    const by = new Map<string, Move[]>()
    for (const m of moves) by.set(keyOf(m), [...(by.get(keyOf(m)) ?? []), m])
    return [...by.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, ms]) => {
        ms.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === b.kind ? a.note.noteNo.localeCompare(b.note.noteNo) : a.kind === '증가' ? -1 : 1))
        let bal = 0
        const lines = ms.map((m) => {
          const amt = Number(m.note.amount)
          bal += m.kind === '증가' ? amt : -amt
          return { m, inc: m.kind === '증가' ? amt : 0, dec: m.kind === '감소' ? amt : 0, bal }
        })
        return { key, lines, inc: lines.reduce((a, l) => a + l.inc, 0), dec: lines.reduce((a, l) => a + l.dec, 0), bal }
      })
      .filter((g) => withZero || g.bal !== 0)
  }, [notes, type, from, to, noteNo, partner, basis, withZero])

  const partners = useMemo(() => {
    const m = new Map<number, string>()
    notes.filter((n) => n.type === type).forEach((n) => m.set(n.partnerId, n.partnerName))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: String(id), name }))
  }, [notes, type])
  const total = groups.reduce((a, g) => ({ inc: a.inc + g.inc, dec: a.dec + g.dec, bal: a.bal + g.bal }), { inc: 0, dec: 0, bal: 0 })
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [groups.length, basis])

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setNoteNo(''); setPartner(''); setBasis('거래처별'); setWithZero(true) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={NOTE_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        {/* 원본 [계정] — 이 화면의 어음 계정은 하나다(받을어음 · 지급어음). */}
        <EcCond label="계정">
          <select className="ec-input" value={account} disabled style={{ width: 140 }}>
            <option value={account}>{account}</option>
          </select>
        </EcCond>
        <EcCond label="어음번호">
          <input className="ec-input" value={noteNo} onChange={(e) => setNoteNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={partners} />
        </EcCond>
        <EcCond label="조회기준">
          {(['거래처별', '거래처/어음번호별'] as const).map((b) => (
            <label key={b} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="note-ledger-basis" checked={basis === b} onChange={() => setBasis(b)} /> {b}
            </label>
          ))}
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={withZero} onChange={(e) => setWithZero(e.target.checked)} /> 잔액0포함
          </label>
        </EcCond>
      </ul>

      <h3 className="text-[13px] font-bold mt-[4px] mx-0 mb-[6px]">
        {title} <span className="font-normal text-ec-hint">{dateText(from)} ~ {dateText(to)}</span>
      </h3>
      {truncated && <p className="text-[12px] text-ec-warn mb-[6px]">어음이 많아 앞 5,000장까지만 받았습니다 — 기간을 좁혀 보세요.</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">일자</th>
            <th className="text-center">증감구분</th>
            <th>어음번호</th>
            <th>거래처명</th>
            <th>계정명</th>
            <th>적요</th>
            <th className="text-right">증가금액</th>
            <th className="text-right">감소금액</th>
            <th className="text-right">잔액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="ec-empty">불러오는 중…</td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : groups.flatMap((g) => [
            ...g.lines.map((l, i) => (
              <tr key={`${g.key}-${i}`}>
                <td className="text-center">{dateText(l.m.date)}</td>
                <td className="text-center">{l.m.kind}</td>
                <td>{l.m.note.noteNo}</td>
                <td>{l.m.note.partnerName}</td>
                <td>{account}</td>
                <td>{l.m.note.remark ?? ''}</td>
                <td className="text-right">{won(l.inc)}</td>
                <td className="text-right">{won(l.dec)}</td>
                <td className="text-right">{Math.round(l.bal).toLocaleString('ko-KR')}</td>
              </tr>
            )),
            <tr key={`${g.key}-sub`} style={{ fontWeight: 700, background: '#f7f7f7' }}>
              <td colSpan={6} className="text-right">{g.key} 소계</td>
              <td className="text-right">{won(g.inc)}</td>
              <td className="text-right">{won(g.dec)}</td>
              <td className="text-right">{Math.round(g.bal).toLocaleString('ko-KR')}</td>
            </tr>,
          ])}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-ec-page">
            <td colSpan={6} className="text-right">합계</td>
            <td className="text-right">{won(total.inc)}</td>
            <td className="text-right">{won(total.dec)}</td>
            <td className="text-right">{Math.round(total.bal).toLocaleString('ko-KR')}</td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
