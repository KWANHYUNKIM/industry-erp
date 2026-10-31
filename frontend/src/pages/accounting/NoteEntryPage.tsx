import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcSlipShell from '../../components/EcSlipShell'
import EcDateField from '../../components/EcDateField'
import EcNumInput from '../../components/EcNumInput'
import Modal from '../../components/Modal'
import CodePickerField, { type CodeItem } from '../../components/codepicker/CodePickerField'
import { useRequired } from '../../utils/useRequired'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { ymd } from '../../components/EcPeriodPicks'
import type { BankAccountRow, NoteSummary, Partner, PromissoryNote } from '../../types/api'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { bankPickLabel } from '../../utils/bankLabel'

/**
 * 회계 I › 어음거래 › 받을어음 의 한 장 입력 둘 — 2026-10-20 loginaa 실측.
 *
 * <b>받을어음증가</b>(C000014): 전표일자 · 회계전표No. · 부서 · 프로젝트 · 거래처 · 어음번호 · 만기일자(기본 오늘) · 금액 · 적요,
 * 단추 [저장(F8)] · [저장/전표(F7)] · [다시 작성]. 빈 저장은 거래처 · 어음번호 칸이 막는다. 저장하면 안내 없이 칸이 다 비고 같은 화면에 남는다.
 * 전표 '26/10/20-25 | 받을어음증가 | 100,000 | QA회계1' = 차) 받을어음 / 대) 외상매출금.
 *
 * <b>받을어음감소</b>(E010602): 전표일자 · 회계전표No. · 부서 · 프로젝트 · 입금계좌 · 어음번호 · 총금액 · 금액 · 수수료 · 적요.
 * 어음번호를 고르면 거래처명 · 총금액(어음 금액)이 들어온다. 빈 저장은 입금계좌 · 어음번호가 막는다. 저장하면 입금계좌만 남는다.
 * 전표 '26/10/20-26 | 받을어음감소 | 100,000' = 차) 보통예금(입금계좌) 99,000 · 이자비용 1,000 / 대) 받을어음 100,000.
 * 받을어음조회에서 감소 일자를 누르면 일자가 막힌 수정 창 — [저장(F8)] · [저장/전표(F7)] · [삭제] '전표를 삭제하겠습니까? - 받을어음감소' · [닫기].
 *
 * <b>받을어음거래처지급</b>(E010603, 화면 제목 '받을어음결제-받을어음거래처결제'): 전표일자 · 회계전표No. · 부서 · 프로젝트 · 거래처 ·
 * 어음번호 · 총금액(막힘) · 지급금액 · 적요. 어음번호를 고르면 어음 거래처명 · 총금액 · 지급금액이 어음 금액으로 들어온다.
 * 빈 저장은 거래처 · 어음번호가 막는다. 저장하면 칸이 다 빈다. 전표 '26/10/20-32 | 받을어음거래처지급 | 100,000' =
 * 차) 외상매입금(거래처) / 대) 받을어음(어음 거래처, 적요 '(No.QA1-N2,2026/10/20 )'). 받을어음조회 감소 줄 일자 → 같은 수정 창.
 *
 * <b>지급어음증가</b>(E010604) · <b>지급어음감소</b>(E010605) — 2026-10-20 실측. 증가는 받을어음증가와 같은 칸
 * (QA1-P1 100,000 → 칸이 다 빈다, 전표 '26/10/20-36 | 지급어음증가' = 차) 외상매입금 / 대) 지급어음).
 * 감소는 전표일자 · 회계전표No. · 부서 · 프로젝트 · <b>출금계좌</b> · 어음번호 · 금액 · 적요(총금액 · 수수료 없음). 어음번호를 고르면
 * 거래처명 · 금액이 들어오고, 저장하면 출금계좌만 남는다. 전표 '26/10/20-37 | 지급어음감소' = 차) 지급어음 / 대) 보통예금.
 * 지급어음조회 감소 줄 일자 → 수정 창, 삭제 확인은 원본도 '- 받을어음감소'(증가는 '- 지급어음증가').
 */

type Note = PromissoryNote & { departmentId?: number | null; projectId?: number | null; recordOnly?: boolean; closeRemark?: string | null; closeDepartmentId?: number | null; closeProjectId?: number | null; closeJournalEntryId?: number | null; closePartnerId?: number | null }

export default function NoteEntryPage({ mode }: { mode: 'increase' | 'decrease' | 'endorse' | 'pay-increase' | 'pay-decrease' }) {
  /** 지급어음 쪽(E010604 · E010605) */
  const payable = mode === 'pay-increase' || mode === 'pay-decrease'
  const noteType = payable ? 'PAYABLE' : 'RECEIVABLE'
  const dec = mode === 'decrease' || mode === 'pay-decrease'
  const endorse = mode === 'endorse'
  /** 어음번호를 코드도움으로 고르는 화면(감소 · 거래처지급) */
  const picksNote = dec || endorse
  const title = mode === 'pay-increase' ? '지급어음증가' : mode === 'pay-decrease' ? '지급어음감소'
    : dec ? '받을어음감소' : endorse ? '받을어음결제-받을어음거래처결제' : '받을어음증가'
  const listPath = payable ? '/accounting/notes-pay-list' : '/accounting/notes-list'
  const bankLabelText = payable ? '출금계좌' : '입금계좌'
  /** 원본 삭제 확인 '전표를 삭제하겠습니까? - …' 의 꼬리 — 거래처지급 수정 창도 '- 받을어음감소'(2026-10-20 실측). */
  const kindName = dec || endorse ? '받을어음감소' : title
  const navigate = useNavigate()
  const [params] = useSearchParams()
  /* 증가도 받을어음조회 증가 줄 [일자] 로 수정 창을 연다(원본 2026-10-21 실측 — 일자 · 거래처명 막힘, 저장(F8) · 저장/전표(F7) · 복사 · 삭제 · 닫기). */
  const editId = Number(params.get('id')) || null
  const deptProject = useDeptProjectItems()
  const [partners, setPartners] = useState<Partner[]>([])
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [editing, setEditing] = useState<Note | null>(null)

  const [date, setDate] = useState(ymd(new Date()))
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [bankId, setBankId] = useState('')
  const [noteNo, setNoteNo] = useState('')
  const [dueDate, setDueDate] = useState(ymd(new Date()))
  const [total, setTotal] = useState('')
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState('')
  const [remark, setRemark] = useState('')
  const [error, setError] = useState('')
  const req = useRequired()
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function loadNotes() {
    if (!picksNote && !editId) return
    api.get<NoteSummary>('/notes').then((r) => setNotes(r.data.notes as Note[])).catch(() => {})
  }
  useEffect(() => {
    if (dec) api.get<BankAccountRow[]>('/bank-cards/accounts').then((r) => setBanks(r.data)).catch(() => {})
    else api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => {})
    loadNotes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  /* 받을어음조회 감소 일자에서 연 수정 창 — 그 감소의 값을 채운다. */
  useEffect(() => {
    if (!editId) { setEditing(null); return }
    const n = notes.find((x) => x.id === editId)
    if (!n) return
    setEditing(n)
    if (!picksNote) {
      setDate(n.issueDate); setPartnerId(String(n.partnerId)); setNoteNo(n.noteNo); setDueDate(n.dueDate)
      setAmount(String(n.amount)); setRemark(n.remark ?? '')
      setDept(n.departmentId ? String(n.departmentId) : ''); setProject(n.projectId ? String(n.projectId) : '')
      return
    }
    setDate(n.closedDate ?? ymd(new Date()))
    setNoteNo(n.noteNo)
    const f = Number(n.discountFee ?? 0)
    setTotal(String(n.amount)); setFee(f ? String(f) : ''); setAmount(String(Number(n.amount) - f))
    setPartnerId(n.closePartnerId ? String(n.closePartnerId) : '')
    setRemark(n.closeRemark ?? '')
    setDept(n.closeDepartmentId ? String(n.closeDepartmentId) : '')
    setProject(n.closeProjectId ? String(n.closeProjectId) : '')
  }, [editId, notes])

  /* 수정 창의 입금계좌 — 그 감소 전표에 묶인 계좌 입금 줄(그날 입출금 중 같은 전표). 수수료만으로 닫은 감소는 입금이 없어 비운다. */
  useEffect(() => {
    if (!dec || !editing?.closeJournalEntryId || !editing.closedDate || bankId) return
    api.get<{ rows: { bankAccountId: number; journalEntryId: number | null }[] }>('/bank-cards/transactions',
      { params: { from: editing.closedDate, to: editing.closedDate, all: true } }).then((r) => {
      const t = r.data.rows.find((x) => x.journalEntryId === editing.closeJournalEntryId)
      if (t) setBankId(String(t.bankAccountId))
    }).catch(() => {})
  }, [editing, bankId])

  /* 받을어음증가는 매출처, 거래처지급 · 지급어음증가는 매입처 쪽 — 원본 코드도움은 다 거래처 전체. */
  const partnerItems: CodeItem[] = useMemo(() => partners.filter((p) => endorse || payable || p.type !== 'SUPPLIER')
    .map((p) => ({ value: String(p.id), code: p.code, name: p.name })), [partners, endorse, payable])
  const bankItems: CodeItem[] = useMemo(() => banks.filter((b) => b.active !== false)
    .map((b) => ({ value: String(b.id), code: b.code ?? b.accountNo, name: bankPickLabel(b) })), [banks])
  /* 어음번호 코드도움 — 보유 중인 받을어음(수정 창은 그 어음도). 고르면 거래처명이 옆에 붙는다. */
  const noteItems: CodeItem[] = useMemo(() => notes
    .filter((n) => n.type === noteType && (n.status === 'HELD' || n.id === editId))
    .map((n) => ({ value: n.noteNo, code: n.noteNo, name: n.partnerName })), [notes, editId])

  function pickNote(v: string) {
    setNoteNo(v)
    const n = notes.find((x) => x.noteNo === v)
    if (!n) return
    const f = Number(fee) || 0
    setTotal(String(n.amount)); setAmount(String(Math.max(Number(n.amount) - f, 0)))
  }
  /* 총금액 = 금액 + 수수료. 수수료를 바꾸면 금액이, 금액을 바꾸면 수수료가 따라간다. */
  function changeFee(v: string) { setFee(v); if (total) setAmount(String(Math.max((Number(total) || 0) - (Number(v) || 0), 0))) }
  function changeAmount(v: string) { setAmount(v); if (total) setFee(String(Math.max((Number(total) || 0) - (Number(v) || 0), 0))) }

  function reset(keepHead = false) {
    if (!keepHead) setBankId('')
    setPartnerId(''); setNoteNo(''); setDueDate(ymd(new Date())); setTotal(''); setAmount(''); setFee(''); setRemark('')
    setDept(''); setProject(''); setError(''); req.reset()
  }

  async function save(): Promise<boolean> {
    setError('')
    /* 원본 has-error: 빈 필수칸은 글 알림 없이 칸만 빨간 테두리(공용-디자인-정리 A). */
    /* 원본(2026-10-21 받을어음증가 · 지급어음증가 실측)은 두 번에 나눠 두른다 — 먼저 거래처 · 어음번호만,
       그 둘이 차 있을 때 [금액] 0 이면 금액 칸만(말풍선 글 없음, 수정 창도 같다). */
    if (!req.check(dec ? { bank: !!bankId, noteNo: !!noteNo.trim() }
      : { partner: !!partnerId, noteNo: !!noteNo.trim() })) return false
    if (!dec && !req.check({ amount: Number(amount) > 0 })) return false
    setSaving(true)
    try {
      if (dec) {
        const body = {
          noteNo: noteNo.trim(), bankAccountId: Number(bankId), date,
          amount: Number(amount) || 0, fee: Number(fee) || 0, remark: remark.trim() || undefined,
          departmentId: dept ? Number(dept) : undefined, projectId: project ? Number(project) : undefined,
        }
        if (editing) {
          await api.put(`/notes/${editing.id}/decrease`, body)
          navigate(listPath)
          return true
        }
        await api.post('/notes/decrease', body)
        reset(true)
        loadNotes()
      } else if (endorse) {
        const body = {
          noteNo: noteNo.trim(), partnerId: Number(partnerId), date, amount: Number(amount),
          remark: remark.trim() || undefined,
          departmentId: dept ? Number(dept) : undefined, projectId: project ? Number(project) : undefined,
        }
        if (editing) {
          await api.put(`/notes/${editing.id}/endorse`, body)
          navigate(listPath)
          return true
        }
        await api.post('/notes/endorse', body)
        reset()
        loadNotes()
      } else {
        const body = {
          type: noteType, partnerId: Number(partnerId), issueDate: date, dueDate,
          amount: Number(amount), remark: remark.trim() || undefined, noteNo: noteNo.trim(),
          departmentId: dept ? Number(dept) : undefined, projectId: project ? Number(project) : undefined,
        }
        if (editing) {
          await api.put(`/notes/${editing.id}`, body)
          navigate(listPath)
          return true
        }
        await api.post('/notes', body)
        reset()
      }
      return true
    } catch (e) {
      setError(extractErrorMessage(e))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!editing) return
    setConfirmDelete(false)
    try {
      await api.delete(picksNote ? `/notes/${editing.id}/${endorse ? 'endorse' : 'decrease'}` : `/notes/${editing.id}`)
      navigate(listPath)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save() }}>
      <EcSlipShell
        title={title}
        /* 원본: [저장/전표(F7)] 은 [저장(F8)] 과 같다(전표 창이 안 뜬다 — 2026-10-20 감소 수정 창에서 눌러 봄). */
        actions={editing ? [
          { label: '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '저장/전표(F7)', onClick: () => void save(), disabled: saving },
          { label: '삭제', onClick: () => setConfirmDelete(true) },
          { label: '닫기', onClick: () => navigate(listPath) },
        ] : [
          { label: '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '저장/전표(F7)', onClick: () => void save(), disabled: saving },
          { label: '다시 작성', onClick: () => reset() },
        ]}>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        <ul className="ec-form mb-[8px]">
          <EcCond label="전표일자" span={2}>
            <EcDateField value={date} onChange={setDate} disabled={!!editing} />
          </EcCond>
          <EcCond label="회계전표No." span={2}>
            <input className="ec-input w-full" placeholder="회계전표No." disabled value="" />
          </EcCond>
          <EcCond label="부서" span={2}>
            <CodePickerField label="부서" hideLabel pair fill emptyLabel="" value={dept} onChange={setDept} items={deptProject.departments} />
          </EcCond>
          <EcCond label="프로젝트" span={2}>
            <CodePickerField label="프로젝트" hideLabel pair fill emptyLabel="" value={project} onChange={setProject} items={deptProject.projects} />
          </EcCond>
          {dec ? (
            <>
              <EcCond label={bankLabelText} span={2}>
                <CodePickerField label={bankLabelText} hideLabel pair fill emptyLabel="" value={bankId} onChange={setBankId} items={bankItems} invalid={req.on('bank', !!bankId)} />
              </EcCond>
              <EcCond label="어음번호" span={2}>
                <CodePickerField label="어음번호" hideLabel pair fill emptyLabel="" value={noteNo} onChange={pickNote} items={noteItems} invalid={req.on('noteNo', !!noteNo.trim())} />
              </EcCond>
              {!payable && (
                <EcCond label="총금액" span={2}>
                  <input className="ec-input w-full text-right" aria-label="총금액" disabled value={total ? Number(total).toLocaleString('ko-KR') : '0'} />
                </EcCond>
              )}
              <EcCond label="금액" span={2}>
                <EcNumInput className="ec-input w-full text-right" aria-label="금액" value={amount} onValue={payable ? setAmount : changeAmount} placeholder="0" />
              </EcCond>
              {!payable && (
                <EcCond label="수수료" span={2}>
                  <EcNumInput className="ec-input w-full text-right" aria-label="수수료" value={fee} onValue={changeFee} placeholder="0" />
                </EcCond>
              )}
            </>
          ) : endorse ? (
            <>
              <EcCond label="거래처" span={2}>
                <CodePickerField label="거래처" hideLabel pair fill emptyLabel="" value={partnerId} onChange={setPartnerId} items={partnerItems} invalid={req.on('partner', !!partnerId)} />
              </EcCond>
              <EcCond label="어음번호" span={2}>
                <CodePickerField label="어음번호" hideLabel pair fill emptyLabel="" value={noteNo} onChange={pickNote} items={noteItems} invalid={req.on('noteNo', !!noteNo.trim())} />
              </EcCond>
              <EcCond label="총금액" span={2}>
                <input className="ec-input w-full text-right" aria-label="총금액" disabled value={total ? Number(total).toLocaleString('ko-KR') : '0'} />
              </EcCond>
              <EcCond label="지급금액" span={2}>
                <div className={`w-full ${req.cls('amount', Number(amount) > 0)}`}><EcNumInput className="ec-input w-full text-right" aria-label="지급금액" value={amount} onValue={setAmount} placeholder="0" /></div>
              </EcCond>
            </>
          ) : (
            <>
              <EcCond label="거래처" span={2}>
                <CodePickerField label="거래처" hideLabel pair fill emptyLabel="" value={partnerId} onChange={setPartnerId} items={partnerItems} invalid={req.on('partner', !!partnerId)} />
              </EcCond>
              <EcCond label="어음번호" span={2}>
                <div className={`w-full ${req.cls('noteNo', !!noteNo.trim())}`}><input className="ec-input w-full" placeholder="어음번호" aria-label="어음번호" maxLength={30} value={noteNo} onChange={(e) => setNoteNo(e.target.value)} /></div>
              </EcCond>
              <EcCond label="만기일자" span={2}>
                <EcDateField value={dueDate} onChange={setDueDate} />
              </EcCond>
              <EcCond label="금액" span={2}>
                <div className={`w-full ${req.cls('amount', Number(amount) > 0)}`}><EcNumInput className="ec-input w-full text-right" aria-label="금액" value={amount} onValue={setAmount} placeholder="0" /></div>
              </EcCond>
            </>
          )}
          <EcCond label="적요" span={2}>
            <input className="ec-input w-full" placeholder="적요" aria-label="적요" maxLength={300} value={remark} onChange={(e) => setRemark(e.target.value)} />
          </EcCond>
        </ul>
      </EcSlipShell>

      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?<br />- {kindName}</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void remove()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </form>
  )
}
