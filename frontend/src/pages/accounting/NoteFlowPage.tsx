import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { NOTE_FLOW_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import type { NoteSummary, NoteType, PromissoryNote } from '../../types/api'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/**
 * 회계 I &gt; 어음거래 &gt; 받을어음 &gt; <b>받을어음증가현황</b>(E010624) · <b>받을어음감소현황</b>(E010625) — 2026-10-02 loginaa 실측.
 *
 * <p>증가현황: 조건 조회일자(구간, 기본 [최근30일]) · 만기일자(구간) · 거래처 · 부서 · 프로젝트 · 계정 · 어음번호 · 적요,
 * 열 일자 · 어음번호 · 거래처명 · 계정명 · 적요 · 만기일자 · 금액. 받은 날(발행일)이 기간 안인 어음이다.
 *
 * <p>감소현황: 조건 기준일자(구간, 기본 [최근30일]) · 거래처 · 부서 · 프로젝트 · 계정 · 어음번호 · 적요(만기일자 없음),
 * 열 일자 · 어음번호 · 거래처명 · 계정명 · 적요 · 금액. 어음이 손을 떠난 날(만기결제 · 할인 · 부도)이 기간 안인 것 —
 * 일자는 그 닫힌 날이다. 부서 · 프로젝트는 어음(PromissoryNote)이 들지 않는다.
 *
 * <p>지급어음증가현황(E010632) · 감소현황(E010633)도 조건 · 열 · 기본값이 글자 하나까지 같다(같은 날 실측) — type 만 바꾼다.
 */
export default function NoteFlowPage({ type, flow }: { type: NoteType; flow: '증가' | '감소' }) {
  const title = type === 'RECEIVABLE'
    ? (flow === '증가' ? '받을어음증가현황' : '받을어음감소현황')
    : (flow === '증가' ? '지급어음증가현황' : '지급어음감소현황')
  const account = type === 'RECEIVABLE' ? '받을어음' : '지급어음'
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [partner, setPartner] = useState('')
  const [noteNo, setNoteNo] = useState('')
  const [remark, setRemark] = useState('')
  const [notes, setNotes] = useState<PromissoryNote[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /*
   * 증가는 받은 날로 기간을 걸 수 있어 서버에 그대로 보낸다. 감소는 닫힌 날로 걸어야 하는데 서버는 발행일로만
   * 자르므로, 기간 끝날까지 발행된 것을 받아 닫힌 날로 화면에서 다시 거른다.
   */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const params = flow === '증가' ? { from, to } : { to }
      const r = await api.get<NoteSummary>('/notes', { params })
      setNotes(r.data.notes)
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, flow, type])

  const dayOf = (n: PromissoryNote) => (flow === '증가' ? n.issueDate : n.closedDate ?? '')
  const shown = useMemo(() => notes
    .filter((n) => n.type === type)
    .filter((n) => { const d = dayOf(n); return !!d && d >= from && d <= to })
    .filter((n) => flow === '감소' || ((!dueFrom || n.dueDate >= dueFrom) && (!dueTo || n.dueDate <= dueTo)))
    .filter((n) => !partner || String(n.partnerId) === partner)
    .filter((n) => !noteNo || n.noteNo.includes(noteNo))
    .filter((n) => !remark || (n.remark ?? '').includes(remark))
    .sort((a, b) => (dayOf(a) < dayOf(b) ? -1 : dayOf(a) > dayOf(b) ? 1 : a.noteNo.localeCompare(b.noteNo))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [notes, type, flow, from, to, dueFrom, dueTo, partner, noteNo, remark])
  const total = shown.reduce((a, n) => a + Number(n.amount), 0)
  const partners = useMemo(() => {
    const m = new Map<number, string>()
    notes.filter((n) => n.type === type).forEach((n) => m.set(n.partnerId, n.partnerName))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: String(id), name }))
  }, [notes, type])
  const cols = flow === '증가' ? 7 : 6
  /* 증가현황만 [만기일자] 열이 있다 — 그려진 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [flow, shown.length])

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setDueFrom(''); setDueTo(''); setPartner(''); setNoteNo(''); setRemark('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label={flow === '증가' ? '조회일자' : '기준일자'}>
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={NOTE_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        {flow === '증가' && (
          <EcCond label="만기일자">
            <input type="date" className="ec-input" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} style={{ width: 145 }} />
            <span style={{ margin: '0 4px' }}>~</span>
            <input type="date" className="ec-input" value={dueTo} onChange={(e) => setDueTo(e.target.value)} style={{ width: 145 }} />
          </EcCond>
        )}
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={partners} />
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
        <EcCond label="적요">
          <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: 220 }} />
        </EcCond>
      </ul>

      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '4px 0 6px' }}>
        {title} <span style={{ fontWeight: 400, color: 'var(--ec-text-hint)' }}>{dateText(from)} ~ {dateText(to)}</span>
      </h3>
      {truncated && <p style={{ fontSize: 12, color: 'var(--ec-warn)', marginBottom: 6 }}>어음이 많아 앞 5,000장까지만 받았습니다 — 기간을 좁혀 보세요.</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>일자</th>
            <th>어음번호</th>
            <th>거래처명</th>
            <th>계정명</th>
            <th>적요</th>
            {flow === '증가' && <th style={{ textAlign: 'center' }}>만기일자</th>}
            <th style={{ textAlign: 'right' }}>금액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={cols} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={cols} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((n) => (
            <tr key={n.id}>
              <td style={{ textAlign: 'center' }}>{dateText(dayOf(n))}</td>
              <td>{n.noteNo}</td>
              <td>{n.partnerName}</td>
              <td>{account}</td>
              <td>{n.remark ?? ''}</td>
              {flow === '증가' && <td style={{ textAlign: 'center' }}>{dateText(n.dueDate)}</td>}
              <td style={{ textAlign: 'right' }}>{won(Number(n.amount))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
            <td colSpan={cols - 1} style={{ textAlign: 'right' }}>합계 ({shown.length}장)</td>
            <td style={{ textAlign: 'right' }}>{won(total)}</td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
