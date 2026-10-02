import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import type { NoteSummary, NoteType, PromissoryNote } from '../../types/api'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/**
 * 회계 I &gt; 어음거래 &gt; <b>보유어음현황</b>(E010626) · <b>미지급어음현황</b>(E010634) — 2026-10-02 loginaa 실측.
 *
 * <p>두 화면은 조건 · 열이 같고 어음 쪽만 다르다(받을어음 · 지급어음). <b>기준일자 하루</b>에 아직 들고 있는(갚지 않은) 어음을
 * 본다: 조건 기준일자 · 만기일자(구간) · 계정 · 어음번호 · 거래처 · 부서 · 프로젝트, 열 어음번호 · 거래처명 · 계정명 · 발생일자 ·
 * 만기일자 · 적요 · 잔액. 기간 빠른선택은 금일 … 전월 · 이번기수 · 직전기수 · 종료일(고른 구간의 끝날이 기준일자).
 *
 * <p>우리 메뉴의 [어음현황]은 어음등록 화면을 한 번 더 가리키고 있었다 — 그 화면은 <b>지금 상태</b>(보유 · 결제완료 …)만 보여
 * "지난달 말에 들고 있던 어음" 을 낼 수 없다. 여기서는 발행일 ≤ 기준일자 이고, 닫힌 날(결제 · 할인 · 부도)이 없거나 기준일자
 * <b>뒤</b>인 어음을 그날 들고 있던 것으로 센다. 우리 어음은 나눠 갚지 않으므로 잔액은 곧 액면이다.
 * 부서 · 프로젝트는 어음(PromissoryNote)이 들지 않는다.
 */
export default function NoteHoldingPage({ type }: { type: NoteType }) {
  const title = type === 'RECEIVABLE' ? '보유어음현황' : '미지급어음현황'
  const account = type === 'RECEIVABLE' ? '받을어음' : '지급어음'
  const init = periodOf('금월(~오늘)')!
  const [asOf, setAsOf] = useState(init.to)
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [noteNo, setNoteNo] = useState('')
  const [partner, setPartner] = useState('')
  const [notes, setNotes] = useState<PromissoryNote[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 기준일자까지 발행된 것만 받는다 — 그 뒤에 받은 어음은 그날 들고 있을 수 없다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<NoteSummary>('/notes', { params: { to: asOf } })
      setNotes(r.data.notes)
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [asOf])

  const shown = useMemo(() => notes
    .filter((n) => n.type === type)
    .filter((n) => n.issueDate <= asOf && (!n.closedDate || n.closedDate > asOf))
    .filter((n) => !dueFrom || n.dueDate >= dueFrom)
    .filter((n) => !dueTo || n.dueDate <= dueTo)
    .filter((n) => !noteNo || n.noteNo.includes(noteNo))
    .filter((n) => !partner || String(n.partnerId) === partner)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.noteNo.localeCompare(b.noteNo))),
  [notes, type, asOf, dueFrom, dueTo, noteNo, partner])
  const total = shown.reduce((a, n) => a + Number(n.amount), 0)
  const partners = useMemo(() => {
    const m = new Map<number, string>()
    notes.filter((n) => n.type === type).forEach((n) => m.set(n.partnerId, n.partnerName))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: String(id), name }))
  }, [notes, type])

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setAsOf(init.to); setDueFrom(''); setDueTo(''); setNoteNo(''); setPartner('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={SETTLE_PICKS} currentFrom={asOf} onPick={(r) => setAsOf(r.to)} />
          </span>
        </EcCond>
        <EcCond label="만기일자">
          <input type="date" className="ec-input" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={dueTo} onChange={(e) => setDueTo(e.target.value)} style={{ width: 145 }} />
        </EcCond>
        {/* 원본 [계정] — 이 화면의 어음 계정은 하나뿐이다(받을어음 · 지급어음). */}
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
      </ul>

      <h3 className="text-[13px] font-bold mt-[4px] mx-0 mb-[6px]">
        {title} <span className="font-normal text-ec-hint">{dateText(asOf)}</span>
      </h3>
      {truncated && <p className="text-[12px] text-ec-warn mb-[6px]">어음이 많아 앞 5,000장까지만 받았습니다 — 기준일자를 좁혀 보세요.</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th>어음번호</th>
            <th>거래처명</th>
            <th>계정명</th>
            <th className="text-center">발생일자</th>
            <th className="text-center">만기일자</th>
            <th>적요</th>
            <th className="text-right">잔액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((n) => (
            <tr key={n.id}>
              <td>{n.noteNo}</td>
              <td>{n.partnerName}</td>
              <td>{account}</td>
              <td className="text-center">{dateText(n.issueDate)}</td>
              <td className="text-center">{dateText(n.dueDate)}</td>
              <td>{n.remark ?? ''}</td>
              <td className="text-right">{won(Number(n.amount))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-ec-page">
            <td colSpan={6} className="text-right">합계 ({shown.length}장)</td>
            <td className="text-right">{won(total)}</td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
