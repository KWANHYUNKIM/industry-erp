import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import EcDateField from '../../../components/EcDateField'
import EcNumInput from '../../../components/EcNumInput'
import CodePickerField, { type CodeItem } from '../../../components/CodePickerField'
import EcHistoryButton from '../../../components/EcHistory'
import { EcCond } from '../../../components/EcStatusPanel'
import { ymd } from '../../../components/EcPeriodPicks'
import type { FundPlan, FundPlanDirection, FundPlanMethod } from '../types'

export interface FundPlanMasters {
  departments: CodeItem[]
  projects: CodeItem[]
  bankAccounts: CodeItem[]
  accounts: CodeItem[]
  partners: CodeItem[]
}

interface Form {
  direction: FundPlanDirection
  planDate: string
  departmentId: string
  projectId: string
  method: FundPlanMethod
  bankAccountId: string
  noteNo: string
  counterAccountId: string
  partnerId: string
  amount: string
  memo: string
}

const blank = (): Form => ({
  direction: 'OUT', planDate: ymd(new Date()), departmentId: '', projectId: '', method: 'DEPOSIT',
  bankAccountId: '', noteNo: '', counterAccountId: '', partnerId: '', amount: '', memo: '',
})

/**
 * 회계 II › 자금계획 › 계획전표조회 [신규(F2)] — <b>계획전표입력</b> 창 · 줄을 누르면 <b>계획전표수정</b>(2026-10-12 loginaa 실측).
 *
 * <p>칸 차례: 입출구분(출금 · 입금, 기본 출금) · 발생일자 · 부서코드 · 프로젝트코드 · 입력구분(예금(현금) · 어음) + 계좌번호 ·
 * 상대계정 · 거래처 · 금액 · 적요. 버튼줄 신규: 저장(F8) · 다시 작성 · 닫기 / 수정: 저장(F8) · 삭제 · 닫기.
 * 원본은 필수 칸이 없다 — 빈 창을 저장해도 금액 빈 줄이 하나 생긴다. 수정 창은 모든 칸을 고칠 수 있다.
 * '어음'을 고르면 계좌 줄이 사라진다(어음번호 칸은 원본에도 없다). [반복설정] · [H](이력)는 두지 않았다.
 * 2026-10-14 다시 잼: 창 폭 960, 코드칸은 [코드][이름] 두 칸(계좌번호 1122334455 + Enter → '기업은행-1122').
 */
export default function FundPlanModal({ open, planId, masters, onClose, onSaved }: {
  open: boolean
  planId: number | null
  masters: FundPlanMasters
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState<Form>(blank())
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const editing = planId != null

  useEffect(() => {
    if (!open) return
    setError('')
    setF(blank())
    if (planId == null) return
    api.get<FundPlan>(`/fund-plans/${planId}`).then(({ data: p }) => setF({
      direction: p.direction, planDate: p.planDate,
      departmentId: p.departmentId != null ? String(p.departmentId) : '',
      projectId: p.projectId != null ? String(p.projectId) : '',
      method: p.method, bankAccountId: p.bankAccountId != null ? String(p.bankAccountId) : '', noteNo: p.noteNo ?? '',
      counterAccountId: p.counterAccountId != null ? String(p.counterAccountId) : '',
      partnerId: p.partnerId != null ? String(p.partnerId) : '',
      amount: Number(p.amount) ? String(Number(p.amount)) : '', memo: p.memo ?? '',
    })).catch((e) => setError(extractErrorMessage(e)))
  }, [open, planId])

  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }))
  const num = (v: string) => (v ? Number(v) : null)

  async function save() {
    if (busy) return
    setBusy(true)
    setError('')
    const body = {
      direction: f.direction, planDate: f.planDate, departmentId: num(f.departmentId), projectId: num(f.projectId),
      method: f.method, bankAccountId: f.method === 'DEPOSIT' ? num(f.bankAccountId) : null,
      noteNo: null,
      counterAccountId: num(f.counterAccountId), partnerId: num(f.partnerId),
      amount: Number(f.amount) || 0, memo: f.memo || null,
    }
    try {
      if (editing) await api.put(`/fund-plans/${planId}`, body)
      else await api.post('/fund-plans', body)
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
      await api.post('/fund-plans/delete', { ids: [planId] })
      onSaved()
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const title = editing ? '계획전표수정' : '계획전표입력'
  const radio = <T extends string>(name: string, value: T, cur: T, label: string, on: (v: T) => void) => (
    <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="radio" name={name} checked={cur === value} onChange={() => on(value)} /> {label}
    </label>
  )

  return (
    <Modal open={open} title={title} width={960} error={error} onClose={onClose}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void save() } }}>
        <h3 className="text-[14px] font-bold mb-[8px]">{title}</h3>
        <ul className="ec-cond mb-[8px]">
          <EcCond label="입출구분">
            {radio('fp-dir', 'OUT', f.direction, '출금', (v) => set({ direction: v }))}
            {radio('fp-dir', 'IN', f.direction, '입금', (v) => set({ direction: v }))}
          </EcCond>
          <EcCond label="발생일자">
            <EcDateField value={f.planDate} onChange={(v) => set({ planDate: v })} />
          </EcCond>
          <EcCond label="부서코드" pick>
            <CodePickerField pair label="부서코드" hideLabel width={420} emptyLabel="선택 안 함" value={f.departmentId}
                             onChange={(v) => set({ departmentId: v })} items={masters.departments} />
          </EcCond>
          <EcCond label="프로젝트코드" pick>
            <CodePickerField pair label="프로젝트코드" hideLabel width={420} emptyLabel="선택 안 함" value={f.projectId}
                             onChange={(v) => set({ projectId: v })} items={masters.projects} />
          </EcCond>
          <EcCond label="입력구분">
            <div className="flex flex-col gap-[4px]">
              <span>
                {radio('fp-method', 'DEPOSIT', f.method, '예금(현금)', (v) => set({ method: v }))}
                {radio('fp-method', 'NOTE', f.method, '어음', (v) => set({ method: v }))}
              </span>
              {/* 원본은 '어음'을 고르면 계좌 줄이 사라지고 다른 칸이 나오지 않는다(2026-10-12 실측) */}
              {f.method === 'DEPOSIT' && (
                <CodePickerField pair label="계좌번호" hideLabel width={420} emptyLabel="선택 안 함" value={f.bankAccountId}
                                 onChange={(v) => set({ bankAccountId: v })} items={masters.bankAccounts} />
              )}
            </div>
          </EcCond>
          <EcCond label="상대계정" pick>
            <CodePickerField pair label="상대계정" hideLabel width={420} emptyLabel="선택 안 함" value={f.counterAccountId}
                             onChange={(v) => set({ counterAccountId: v })} items={masters.accounts} />
          </EcCond>
          <EcCond label="거래처" pick>
            <CodePickerField pair label="거래처" hideLabel width={420} emptyLabel="선택 안 함" value={f.partnerId}
                             onChange={(v) => set({ partnerId: v })} items={masters.partners} />
          </EcCond>
          <EcCond label="금액">
            <EcNumInput className="ec-input w-[420px] text-right" aria-label="금액" placeholder="0"
                        value={f.amount} onValue={(v) => set({ amount: v })} />
          </EcCond>
          <EcCond label="적요">
            <input className="ec-input w-[420px]" aria-label="적요" placeholder="적요" maxLength={300}
                   value={f.memo} onChange={(e) => set({ memo: e.target.value })} />
          </EcCond>
        </ul>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" disabled={busy} onClick={() => void save()}>저장(F8)</button>
          {editing
            ? <button type="button" className="ec-btn" onClick={() => setConfirmDelete(true)}>삭제</button>
            : <button type="button" className="ec-btn" onClick={() => setF(blank())}>다시 작성</button>}
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
          <EcHistoryButton target="FUND_PLAN" id={planId} />
        </div>
      </div>
      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void remove()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </Modal>
  )
}
