import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import EcDateField from '../../../components/EcDateField'
import { EcCond } from '../../../components/EcStatusPanel'
import { ymd } from '../../../components/EcPeriodPicks'
import type { BankCheck, CheckType } from '../../../types/api'

type MemoMode = 'SAME' | 'CHECKNO' | 'DIRECT'

/**
 * 수령수표입금처리 · 발행수표출금처리 하단 [입금보고서작성 ▴] · [지출결의서작성 ▴] 펼침 <b>[수표만감소]</b> 창(2026-10-21 loginaa 실측).
 *
 * <p>창 제목 '수표만감소', 칸은 전표일자(기본 오늘) · 적요(증가적요동일 · 수표번호 · 직접입력 — 직접입력이면 '적요' 칸이 하나 생긴다),
 * 버튼 저장(F8) · 닫기. 저장하면 회계전표 없이 수표만 줄어(수표내역입력 감소와 같다) 처리 목록에서 빠지고, 수령(발행)수표조회에
 * '2026/10/21 -2 · 감소 · 거래유형 수표만감소 · 회계전표 빈칸' 줄이 생긴다. 그 줄의 [일자-No.] → 수표내역입력(감소) 창 [삭제]
 * ('전표를 삭제하겠습니까? - 수령수표내역입력')로 지우면 수표가 다시 처리 목록에 돌아온다.
 * 아무것도 안 고르고 누르면 '리스트에 선택된 자료가 없습니다. …' — 부르는 쪽(CheckDepositPage)이 띄운다.
 */
export default function CheckOnlyDecreaseModal({ type, checks, onClose, onSaved }: {
  type: CheckType
  checks: BankCheck[] | null
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(ymd(new Date()))
  const [memoMode, setMemoMode] = useState<MemoMode>('SAME')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!checks) return
    setDate(ymd(new Date())); setMemoMode('SAME'); setMemo(''); setError('')
  }, [checks])

  async function save() {
    if (!checks || saving) return
    setSaving(true)
    setError('')
    try {
      const bankAccountId = checks.find((c) => c.bankAccountId != null)?.bankAccountId ?? null
      await api.post('/checks/direct', {
        type, date, increase: false, partnerId: null, bankAccountId,
        lines: checks.map((c) => ({
          checkNo: c.checkNo, amount: Number(c.amount),
          /* 증가적요동일은 비워 보낸다 — 감소 줄이 증가 적요를 그대로 보인다(서버 out_remark 비움). */
          remark: memoMode === 'CHECKNO' ? c.checkNo : memoMode === 'DIRECT' ? (memo || null) : null,
        })),
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={checks != null} title="수표만감소" width={640} error={error} onClose={onClose}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void save() } }}>
        <ul className="ec-form mb-[8px]">
          <EcCond label="전표일자" span={2}>
            <EcDateField value={date} onChange={setDate} />
          </EcCond>
          <EcCond label="적요" span={2}>
            <span className="inline-flex items-center gap-[10px]">
              {([['SAME', '증가적요동일'], ['CHECKNO', '수표번호'], ['DIRECT', '직접입력']] as [MemoMode, string][]).map(([v, label]) => (
                <label key={v} className="inline-flex items-center gap-[4px]">
                  <input type="radio" name="onlyDecreaseMemo" checked={memoMode === v} onChange={() => setMemoMode(v)} />{label}
                </label>
              ))}
              {memoMode === 'DIRECT' && (
                <input className="ec-input w-[200px]" placeholder="적요" aria-label="적요" value={memo} onChange={(e) => setMemo(e.target.value)} />
              )}
            </span>
          </EcCond>
        </ul>
        <div className="flex gap-[5px] mt-[14px]">
          <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={() => void save()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  )
}
