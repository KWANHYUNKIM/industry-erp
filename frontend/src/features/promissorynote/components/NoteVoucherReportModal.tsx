import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import EcDateField from '../../../components/EcDateField'
import { EcCond } from '../../../components/EcStatusPanel'
import GridCode from '../../../components/GridCode'
import type { CodeItem } from '../../../components/CodePickerField'
import { ymd } from '../../../components/EcPeriodPicks'
import type { BankAccountRow, PromissoryNote } from '../../../types/api'
import { bankPickLabel } from '../../../utils/bankLabel'
import { fmtAmount } from '../../../utils/format'

type MemoMode = 'SAME' | 'NOTENO' | 'DIRECT'
type Group = 'LINE' | 'PARTNER'

/** 결의서 한 줄 — 고른 어음 하나. */
export interface NoteVoucherPick { note: PromissoryNote; partnerCode: string }

interface Line { pick: NoteVoucherPick; memo: string }


/**
 * 회계 I › 어음거래 › 받을어음일괄감소(E010621) [입금보고서작성] · 지급어음일괄감소(E010629) [지출결의서작성] — 2026-10-20 loginaa 실측.
 *
 * <p>1) <b>지출결의서작성</b>(입금보고서작성) 창: 돈나간계좌번호(입금계좌) · 적요(증가적요동일 · 어음번호 · 직접입력) ·
 * 전표 묶음기준(라인별 · 거래처별/계정별), [적용(F8)] [닫기].
 * <br>2) [적용] → <b>지출결의서</b>(입금보고서) 창: 줄마다 돈 나간 계좌 · 계정 지급어음(받을어음) · 거래처 · 금액(어음 금액) · 적요 ·
 * 추가정보 '지급어음 QA1-P1'. [저장(F8)] 하면 결의서 한 장 + 고른 어음 감소(일괄감소 목록에서 빠진다). 결의서를 지우면 어음이 보유로 돌아온다.
 * 틀은 수령수표입금처리의 CheckDepositReportModal 과 같다.
 */
export default function NoteVoucherReportModal({ receivable, picks, onClose, onSaved }: {
  receivable: boolean
  picks: NoteVoucherPick[] | null
  onClose: () => void
  onSaved: () => void
}) {
  const received = receivable
  const doc = received ? '입금보고서' : '지출결의서'
  const flow = received ? '돈 들어온 계좌' : '돈 나간 계좌'
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [settle, setSettle] = useState('')
  const [memoMode, setMemoMode] = useState<MemoMode>('SAME')
  const [group, setGroup] = useState<Group>('LINE')
  const [lines, setLines] = useState<Line[] | null>(null)
  const [date, setDate] = useState(ymd(new Date()))
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!picks) return
    setSettle(''); setMemoMode('SAME'); setGroup('LINE')
    setLines(null); setDate(ymd(new Date())); setMemo(''); setError('')
    api.get<BankAccountRow[]>('/bank-cards/accounts').then((r) => setBanks(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [picks])

  const settleItems: CodeItem[] = useMemo(() => [
    ...banks.filter((b) => b.active).map((b) => ({ value: `b${b.id}`, code: b.code ?? b.accountNo, name: bankPickLabel(b) })),
    { value: '000', code: '000', name: '현금' },
  ], [banks])
  const settleName = settleItems.find((x) => x.value === settle)?.name ?? ''
  const settleCode = settleItems.find((x) => x.value === settle)?.code ?? ''

  function apply() {
    if (!picks) return
    const memoOf = (p: NoteVoucherPick) => (memoMode === 'SAME' ? p.note.remark ?? '' : memoMode === 'NOTENO' ? p.note.noteNo : '')
    let ls = picks.map((p) => ({ pick: p, memo: memoOf(p) }))
    if (group === 'PARTNER') {
      ls = [...ls].sort((a, b) => String(a.pick.note.partnerId).localeCompare(String(b.pick.note.partnerId)))
    }
    setLines(ls)
  }

  async function save() {
    if (!lines) return
    setError('')
    if (!settle) { setError(received ? '돈 들어온 계좌를 입력 바랍니다.' : `${flow}: 자료를 입력 바랍니다.`); return }
    setSaving(true)
    try {
      await api.post(received ? '/notes/deposit-report' : '/notes/withdraw-report', {
        date,
        bankAccountId: settle.startsWith('b') ? Number(settle.slice(1)) : undefined,
        cash: settle === '000' || undefined,
        description: memo.trim() || undefined,
        lines: lines.map((l) => ({ noteId: l.pick.note.id, memo: l.memo.trim() || undefined })),
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const radio = <T extends string>(name: string, cur: T, set: (v: T) => void, opts: [T, string][]) => (
    <span className="inline-flex items-center gap-[10px]">
      {opts.map(([v, label]) => (
        <label key={v} className="inline-flex items-center gap-[4px]">
          <input type="radio" name={name} checked={cur === v} onChange={() => set(v)} />{label}
        </label>
      ))}
    </span>
  )

  /* 우리 계정코드 — 받을어음 110 · 지급어음 252(원본 1109 · 2529). */
  const accCode = received ? '1109' : '2529'
  const accName = received ? '받을어음' : '지급어음'
  const total = (lines ?? []).reduce((s, l) => s + Number(l.pick.note.amount), 0)

  return (
    <>
      <Modal open={picks != null && lines == null} title={`${doc}작성`} width={780} error={error} onClose={onClose}>
        <ul className="ec-form mb-[8px]">
          <EcCond label={received ? '입금계좌' : '돈나간계좌번호'} span={2}>
            <span className="flex w-full items-center gap-[6px]">
              <span className="w-[160px]">
                <GridCode title="계좌검색" codeHead={received ? '입금계좌' : '돈나간계좌번호'} nameHead="계좌명" items={settleItems}
                          value={settle} onPick={setSettle} />
              </span>
              <span className="flex-1">{settleName}</span>
            </span>
          </EcCond>
          <EcCond label="적요" span={2}>
            {radio('memoMode', memoMode, setMemoMode, [['SAME', '증가적요동일'], ['NOTENO', '어음번호'], ['DIRECT', '직접입력']])}
          </EcCond>
          <EcCond label="전표 묶음기준" span={2}>
            {radio('group', group, setGroup, [['LINE', '라인별'], ['PARTNER', '거래처별/계정별']])}
          </EcCond>
        </ul>
        <div className="flex gap-[5px] mt-[14px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>

      <Modal open={picks != null && lines != null} title={doc} width={1100} error={error} onClose={onClose}>
        <ul className="ec-form mb-[8px]">
          <EcCond label="일자" span={2}>
            <EcDateField value={date} onChange={setDate} />
          </EcCond>
          <EcCond label="첨언내용" span={2}>
            <textarea className="ec-input w-full h-[37px] resize-y" placeholder="첨언내용" maxLength={200}
                      value={memo} onChange={(e) => setMemo(e.target.value)} />
          </EcCond>
        </ul>
        <div className="overflow-x-auto">
          <table className="ec-grid-input no-ec table-fixed min-w-[1000px]">
            <thead>
              <tr>
                <th className="w-[32px]" />
                <th>{flow} 검색</th>
                <th>{flow}명</th>
                <th>{received ? '계정코드(대변)' : '계정코드(차변)'}</th>
                <th>계정코드명</th>
                <th>거래처 검색</th>
                <th>거래처명</th>
                <th>금액</th>
                <th>적요명</th>
                <th className="w-[120px]">추가정보</th>
              </tr>
            </thead>
            <tbody>
              {(lines ?? []).map((l, i) => (
                <tr key={l.pick.note.id}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{settleCode}</td>
                  <td>{settleName}</td>
                  <td>{accCode}</td>
                  <td>{accName}</td>
                  <td>{l.pick.partnerCode}</td>
                  <td>{l.pick.note.partnerName ?? ''}</td>
                  <td className="text-right">{fmtAmount(Number(l.pick.note.amount))}</td>
                  <td>
                    <input className="ec-input w-full" aria-label={`${i + 1}줄 적요명`} maxLength={200} value={l.memo}
                           onChange={(e) => setLines((ls) => ls!.map((x, j) => (j === i ? { ...x, memo: e.target.value } : x)))} />
                  </td>
                  <td className="text-ec-navy">{accName} {l.pick.note.noteNo}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7} />
                <td className="text-right">{fmtAmount(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex gap-[5px] mt-[14px]">
          <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={() => void save()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>
    </>
  )
}
