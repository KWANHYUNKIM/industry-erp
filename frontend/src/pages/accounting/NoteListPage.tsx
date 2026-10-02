import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import type { NoteSummary, NoteType, PromissoryNote } from '../../types/api'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/** 어음 한 장이 남기는 움직임 — 받은(발행한) 날 증가, 손을 떠난 날(결제 · 할인 · 부도) 감소. */
interface Move { key: string; date: string; inc: boolean; n: PromissoryNote }

/**
 * 회계 I &gt; 어음거래 &gt; 받을어음 &gt; <b>받을어음조회</b>(E010622) — 2026-10-03 loginaa 실측(빈 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일(+1개월)</b>) · 만기일자(구간, 옆 [사용] 체크로 켠다 — 기본 꺼짐) · 어음번호 ·
 * 증감구분(전체 · 어음증가 · 어음감소, 다 켜짐) · 거래유형 · 입력구분(전체 · 연결전표 · 직접입력, 다 켜짐) · 거래처 · 부서 · 프로젝트 · 적요 ·
 * 최초작성자 · 최종수정자. 열: 일자 · 어음번호 · 증감구분 · 거래처명 · 금액 · 만기일자 · 적요 · 거래유형 · 회계전표일자-No.
 * 버튼줄 받을어음증가 · 내역만등록 · 선택삭제 · Excel. 수령수표조회와 같은 판이다.
 *
 * <p>한 줄은 어음이 아니라 <b>움직임</b>이다 — 받은 날 '어음증가', 결제 · 할인 · 부도로 손을 떠난 날 '어음감소'.
 * 우리 어음은 모두 어음등록 화면에서 직접 적어 입력구분은 늘 '직접입력'이다. 부서 · 프로젝트는 어음이 들지 않고,
 * 회계전표일자-No. 는 어음 분개를 어음에 잇지 않아(수표는 V239 로 이었다) 열을 두지 않았다.
 * <b>지급어음조회</b>(E010630)도 같은 판이다(type).
 */
export default function NoteListPage({ type }: { type: NoteType }) {
  const receivable = type === 'RECEIVABLE'
  const title = receivable ? '받을어음조회' : '지급어음조회'
  const navigate = useNavigate()
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [useDue, setUseDue] = useState(false)
  const [dueFrom, setDueFrom] = useState(init.from)
  const [dueTo, setDueTo] = useState(init.to)
  const [noteNo, setNoteNo] = useState('')
  const [showInc, setShowInc] = useState(true)
  const [showDec, setShowDec] = useState(true)
  const [kind, setKind] = useState('')
  const [direct, setDirect] = useState(true)
  const [partner, setPartner] = useState('')
  const [remark, setRemark] = useState('')
  const [author, setAuthor] = useState('')
  const [notes, setNotes] = useState<PromissoryNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 감소는 닫힌 날로 걸어야 해 기간 끝날까지 받은(발행한) 어음을 다 받아 화면에서 날짜로 다시 거른다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<NoteSummary>('/notes', { params: { to } })
      setNotes(r.data.notes)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, type])

  const ofType = useMemo(() => notes.filter((n) => n.type === type), [notes, type])
  const kindOf = (m: Move) => (m.inc ? (receivable ? '수취' : '발행') : m.n.statusName)
  const moves = useMemo(() => {
    const out: Move[] = []
    for (const n of ofType) {
      out.push({ key: `${n.id}-i`, date: n.issueDate, inc: true, n })
      if (n.closedDate) out.push({ key: `${n.id}-d`, date: n.closedDate, inc: false, n })
    }
    return out
      .filter((m) => m.date >= from && m.date <= to)
      .filter((m) => !useDue || (m.n.dueDate >= dueFrom && m.n.dueDate <= dueTo))
      .filter((m) => !noteNo || m.n.noteNo.includes(noteNo))
      .filter((m) => (m.inc ? showInc : showDec))
      .filter((m) => !kind || kindOf(m) === kind)
      .filter(() => direct)
      .filter((m) => !partner || String(m.n.partnerId) === partner)
      .filter((m) => !remark || (m.n.remark ?? '').includes(remark))
      .filter((m) => !author || (m.n.createdBy ?? '') === author)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.n.noteNo.localeCompare(b.n.noteNo) || (a.inc ? -1 : 1)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ofType, from, to, useDue, dueFrom, dueTo, noteNo, showInc, showDec, kind, direct, partner, remark, author])
  const partners = useMemo(() => {
    const m = new Map<number, string>()
    ofType.forEach((n) => m.set(n.partnerId, n.partnerName))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: String(id), name }))
  }, [ofType])
  const authors = useMemo(() => [...new Set(ofType.map((n) => n.createdBy).filter(Boolean) as string[])].sort(), [ofType])
  const kinds = useMemo(() => [...new Set([receivable ? '수취' : '발행', ...ofType.filter((n) => n.closedDate).map((n) => n.statusName)])], [ofType, receivable])
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
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setUseDue(false); setNoteNo(''); setShowInc(true); setShowDec(true); setKind(''); setDirect(true); setPartner(''); setRemark(''); setAuthor('') } },
        { label: receivable ? '받을어음증가' : '지급어음증가', onClick: () => navigate('/accounting/notes') },
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
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="만기일자">
          <input type="date" className="ec-input" value={dueFrom} disabled={!useDue} onChange={(e) => setDueFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={dueTo} disabled={!useDue} onChange={(e) => setDueTo(e.target.value)} style={{ width: 145 }} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 8, fontSize: 12.5 }}>
            <input type="checkbox" checked={useDue} onChange={(e) => setUseDue(e.target.checked)} /> 사용
          </label>
        </EcCond>
        <EcCond label="어음번호">
          <input className="ec-input" value={noteNo} onChange={(e) => setNoteNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="증감구분">
          {box('전체', showInc && showDec, (v) => { setShowInc(v); setShowDec(v) })}
          {box('어음증가', showInc, setShowInc)}
          {box('어음감소', showDec, setShowDec)}
        </EcCond>
        <EcCond label="거래유형">
          <select className="ec-input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 120 }}>
            <option value="">전체</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </EcCond>
        {/* 원본 [입력구분] — 우리 어음은 모두 어음등록 화면에서 직접 적는다. 연결전표에서 생기는 어음이 없다. */}
        <EcCond label="입력구분">
          {box('전체', direct, setDirect)}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5, color: '#9aa1ab' }}>
            <input type="checkbox" checked={false} disabled /> 연결전표
          </label>
          {box('직접입력', direct, setDirect)}
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={partners} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={170} emptyLabel="전체" value={author} onChange={setAuthor}
                           items={authors.map((a) => ({ value: a, name: a }))} />
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>일자</th>
            <th>어음번호</th>
            <th style={{ textAlign: 'center' }}>증감구분</th>
            <th>거래처명</th>
            <th style={{ textAlign: 'right' }}>금액</th>
            <th style={{ textAlign: 'center' }}>만기일자</th>
            <th>적요</th>
            <th style={{ textAlign: 'center' }}>거래유형</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : moves.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : moves.map((m) => (
            <tr key={m.key}>
              <td style={{ textAlign: 'center' }}>{dateText(m.date)}</td>
              <td>{m.n.noteNo}</td>
              <td style={{ textAlign: 'center' }}>{m.inc ? '어음증가' : '어음감소'}</td>
              <td>{m.n.partnerName}</td>
              <td style={{ textAlign: 'right' }}>{won(Number(m.n.amount))}</td>
              <td style={{ textAlign: 'center' }}>{dateText(m.n.dueDate)}</td>
              <td>{m.n.remark ?? ''}</td>
              <td style={{ textAlign: 'center' }}>{kindOf(m)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
