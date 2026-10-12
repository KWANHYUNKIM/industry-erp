import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import EcDateField from '../../../components/EcDateField'
import EcNumInput from '../../../components/EcNumInput'
import GridCode, { ErrTip } from '../../../components/GridCode'
import { ymd } from '../../../components/EcPeriodPicks'
import type { BondMasters } from '../api'
import { newBondNo, sideWord, won, type BondDirection, type BondEntry, type BondSide } from '../types'

interface Line {
  accountId: string
  partnerId: string
  bondNo: string
  amount: string
  dueDate: string
  departmentId: string
  projectId: string
  memo: string
}

const blank = (date: string): Line => ({
  accountId: '', partnerId: '', bondNo: '', amount: '', dueDate: date, departmentId: '', projectId: '', memo: '',
})

/**
 * 회계 II › 채권관리 [채권조회] · 채무관리 [채무조회] 의 <b>[신규(F2)] 창 — 채권(채무)내역입력</b>(2026-10-12 loginaa 실측).
 *
 * <p>머리: 전표일자 · 증감구분(증가 · 감소). 격자: 계정코드 · 계정명 · 거래처 · 거래처명 · 채권번호 · 금액 · 채권 만기일자 · 부서 · 프로젝트 · 적요,
 * 처음 세 줄. <b>감소</b>를 고르면 [채권 만기일자] 열이 없어진다. 만기일자 기본값은 전표일자다.
 * [채권번호]는 필수 — 비우고 저장하면 그 칸에 '유효키항목 필수입력'. 칸 끝 [Fn] 의 [코드생성]이 번호를 만든다.
 * 계정 '108' 처럼 코드를 쳐서 Enter 하면 한 건일 때 바로 고른다(1089 외상매출금).
 *
 * <p>수정 창(줄의 [일자-No.] 를 누름): 제목 '…(수정)', 전표일자 · 증감구분은 글자로만 보이고 못 바꾼다.
 * 버튼줄 저장(F8) · 닫기 · 삭제. 원본의 [웹자료올리기] · [H] · [최종이력] 과 [Fn ▸ 중복확인] 은 두지 않았다(엑셀 업로드 · 이력 기능이 없다).
 */
export default function BondEntryModal({ side, open, entryId, masters, onClose, onSaved }: {
  side: BondSide
  open: boolean
  /** 수정할 장. 없으면 신규. */
  entryId: number | null
  masters: BondMasters
  onClose: () => void
  onSaved: () => void
}) {
  const word = sideWord(side)
  const today = ymd(new Date())
  const [date, setDate] = useState(today)
  const [direction, setDirection] = useState<BondDirection>('INCREASE')
  const [lines, setLines] = useState<Line[]>([blank(today), blank(today), blank(today)])
  const [entry, setEntry] = useState<BondEntry | null>(null)
  const [cellErr, setCellErr] = useState<{ row: number; col: string; msg: string } | null>(null)
  const [error, setError] = useState('')
  const [fnRow, setFnRow] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  function reset() {
    setDate(today); setDirection('INCREASE'); setLines([blank(today), blank(today), blank(today)])
    setEntry(null); setCellErr(null); setError(''); setFnRow(null)
  }

  useEffect(() => {
    if (!open) return
    reset()
    if (entryId == null) return
    api.get<BondEntry>(`/bonds/${entryId}`).then((r) => {
      const e = r.data
      setEntry(e)
      setDate(e.entryDate)
      setDirection(e.direction)
      const ls = e.lines.map((l) => ({
        accountId: String(l.accountId), partnerId: l.partnerId != null ? String(l.partnerId) : '',
        bondNo: l.bondNo, amount: String(Number(l.amount)), dueDate: l.dueDate ?? e.entryDate,
        departmentId: l.departmentId != null ? String(l.departmentId) : '',
        projectId: l.projectId != null ? String(l.projectId) : '', memo: l.memo ?? '',
      }))
      /* 원본 수정 창은 저장된 줄 아래에 빈 줄을 세 줄 더 붙여 네 줄로 보였다(한 줄 저장한 장). */
      setLines([...ls, ...Array.from({ length: Math.max(1, 4 - ls.length) }, () => blank(e.entryDate))])
    }).catch((e) => setError(extractErrorMessage(e)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entryId])

  const editing = entryId != null
  const inc = direction === 'INCREASE'
  const setLine = (i: number, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
    setCellErr(null)
  }
  /** 전표일자를 바꾸면 아직 손대지 않은(전표일자와 같던) 만기일자도 따라간다. */
  const changeDate = (v: string) => {
    setLines((ls) => ls.map((l) => (l.dueDate === date ? { ...l, dueDate: v } : l)))
    setDate(v)
  }
  const used = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.accountId || l.partnerId || l.bondNo || l.amount)
  const total = lines.reduce((a, l) => a + (Number(l.amount) || 0), 0)
  const errAt = (row: number, col: string) => (cellErr && cellErr.row === row && cellErr.col === col ? cellErr.msg : null)

  async function save() {
    if (busy) return
    if (used.length === 0) return setCellErr({ row: 0, col: 'account', msg: '계정코드를 입력 바랍니다.' })
    for (const { l, i } of used) {
      if (!l.accountId) return setCellErr({ row: i, col: 'account', msg: '계정코드를 입력 바랍니다.' })
      if (!l.bondNo.trim()) return setCellErr({ row: i, col: 'bondNo', msg: '유효키항목 필수입력' })
      if (!Number(l.amount)) return setCellErr({ row: i, col: 'amount', msg: '필수입력' })
    }
    const body = used.map(({ l }) => ({
      accountId: Number(l.accountId),
      partnerId: l.partnerId ? Number(l.partnerId) : null,
      bondNo: l.bondNo.trim(),
      amount: Number(l.amount),
      dueDate: inc ? (l.dueDate || date) : null,
      departmentId: l.departmentId ? Number(l.departmentId) : null,
      projectId: l.projectId ? Number(l.projectId) : null,
      memo: l.memo || null,
    }))
    setBusy(true)
    setError('')
    try {
      if (editing) await api.put(`/bonds/${entryId}`, { lines: body })
      else await api.post('/bonds', { side, entryDate: date, direction, lines: body })
      onSaved()
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setConfirmDelete(false)
    try {
      await api.post('/bonds/delete', { ids: [entryId] })
      onSaved()
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const title = `${word}내역입력${editing ? '(수정)' : ''}`
  const cols = inc ? 11 : 10

  return (
    <Modal open={open} title={title} width={1100} error={error} onClose={onClose}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void save() } }}>
        <h3 className="text-[14px] font-bold mb-[8px]">{title}</h3>
        <ul className="ec-cond mb-[8px] grid grid-cols-2 mobile:grid-cols-1">
          <li className="flex items-center gap-[8px]">
            <span className="w-[93px] text-ec-hint">전표일자</span>
            {editing && entry
              ? <span>{entry.entryDate.replaceAll('-', '/')} - {entry.entryNo}</span>
              : <EcDateField value={date} onChange={changeDate} />}
          </li>
          <li className="flex items-center gap-[8px]">
            <span className="w-[93px] text-ec-hint">증감구분</span>
            {editing
              ? <span>{inc ? '증가' : '감소'}</span>
              : (
                <select className="ec-input flex-1" aria-label="증감구분" value={direction}
                        onChange={(e) => { setDirection(e.target.value as BondDirection); setCellErr(null) }}>
                  <option value="INCREASE">증가</option>
                  <option value="DECREASE">감소</option>
                </select>
              )}
          </li>
        </ul>

        <div className="overflow-x-auto">
          <table className="ec-grid-input no-ec table-fixed min-w-[1000px] [&_tbody_tr]:h-[30px]">
            <thead>
              <tr>
                <th className="w-[34px]" />
                <th>계정코드</th>
                <th>계정명</th>
                <th>거래처</th>
                <th>거래처명</th>
                <th className="w-[170px]">{word}번호</th>
                <th>금액</th>
                {inc && <th className="w-[150px]">{word} 만기일자</th>}
                <th>부서</th>
                <th>프로젝트</th>
                <th>적요</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="pad text-center text-ec-hint">{i + 1}</td>
                  <td className="pad">
                    <GridCode title="계정검색" codeHead="계정코드" nameHead="계정명" items={masters.accounts}
                              value={l.accountId} onPick={(v) => setLine(i, { accountId: v })} err={errAt(i, 'account')} />
                  </td>
                  <td className="pad">{masters.accounts.find((x) => x.value === l.accountId)?.name ?? ''}</td>
                  <td className="pad">
                    <GridCode title="거래처검색" codeHead="거래처" nameHead="거래처명" items={masters.partners}
                              value={l.partnerId} onPick={(v) => setLine(i, { partnerId: v })} />
                  </td>
                  <td className="pad">{masters.partners.find((x) => x.value === l.partnerId)?.name ?? ''}</td>
                  <td className="pad relative">
                    <span className="flex items-center gap-[2px]">
                      <input className={`ec-input w-full${errAt(i, 'bondNo') ? ' outline outline-1 outline-ec-danger' : ''}`}
                             aria-label={`${i + 1}줄 ${word}번호`} placeholder={`${word}번호`} maxLength={30}
                             value={l.bondNo} onChange={(e) => setLine(i, { bondNo: e.target.value })} />
                      <button type="button" className="ec-btn ec-btn-sm" aria-label={`${i + 1}줄 ${word}번호 Fn`}
                              onClick={() => setFnRow(fnRow === i ? null : i)}>Fn</button>
                    </span>
                    {fnRow === i && (
                      <span className="absolute right-0 top-full z-10 flex flex-col rounded-ec bg-white p-[4px] shadow-[var(--ec-shadow-pop)] border border-ec-line">
                        <button type="button" className="ec-btn ec-btn-sm"
                                onClick={() => { setLine(i, { bondNo: newBondNo(i + 1) }); setFnRow(null) }}>코드생성</button>
                      </span>
                    )}
                    {errAt(i, 'bondNo') && <ErrTip msg={errAt(i, 'bondNo')!} />}
                  </td>
                  <td className="pad relative">
                    <EcNumInput className={`ec-input w-full text-right${errAt(i, 'amount') ? ' outline outline-1 outline-ec-danger' : ''}`}
                                aria-label={`${i + 1}줄 금액`} value={l.amount} onValue={(v) => setLine(i, { amount: v })} />
                    {errAt(i, 'amount') && <ErrTip msg={errAt(i, 'amount')!} />}
                  </td>
                  {inc && (
                    <td className="pad">
                      <input type="date" className="ec-input w-full" aria-label={`${i + 1}줄 만기일자`}
                             value={l.dueDate} onChange={(e) => setLine(i, { dueDate: e.target.value })} />
                    </td>
                  )}
                  <td className="pad">
                    <GridCode title="부서검색" codeHead="부서코드" nameHead="부서명" items={masters.departments}
                              value={l.departmentId} onPick={(v) => setLine(i, { departmentId: v })} />
                  </td>
                  <td className="pad">
                    <GridCode title="프로젝트검색" codeHead="프로젝트코드" nameHead="프로젝트명" items={masters.projects}
                              value={l.projectId} onPick={(v) => setLine(i, { projectId: v })} />
                  </td>
                  <td className="pad">
                    <input className="ec-input w-full" aria-label={`${i + 1}줄 적요`} maxLength={300}
                           value={l.memo} onChange={(e) => setLine(i, { memo: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} />
                <td className="text-right">{won(total)}</td>
                <td colSpan={cols - 7} />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-[6px]">
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setLines((ls) => [...ls, blank(date)])}>+ 줄추가</button>
        </div>

        <div className="flex gap-[5px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" disabled={busy} onClick={() => void save()}>저장(F8)</button>
          {!editing && <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>}
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
          {editing && <button type="button" className="ec-btn" onClick={() => setConfirmDelete(true)}>삭제</button>}
        </div>
      </div>

      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?<br />- {word}조회</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void remove()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </Modal>
  )
}
