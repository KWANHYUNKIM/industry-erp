import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import EcDateField from '../../../components/EcDateField'
import { EcCond } from '../../../components/EcStatusPanel'
import GridCode from '../../../components/GridCode'
import type { CodeItem } from '../../../components/CodePickerField'
import { ymd } from '../../../components/EcPeriodPicks'
import type { BankAccountRow, BankCheck, CheckType } from '../../../types/api'

type MemoMode = 'SAME' | 'CHECKNO' | 'DIRECT'
type Group = 'LINE' | 'PARTNER'

/** 입금보고서 한 줄 — 고른 수표 하나. */
export interface CheckDepositPick {
  check: BankCheck
  /** 계정코드(대변) — 수표내역입력으로 넣은 수표는 수표계좌의 계정, 분개로 받은 수표는 받을수표. */
  accountCode: string
  accountName: string
  partnerCode: string
}

interface Line { pick: CheckDepositPick; memo: string }

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/** 원본 계좌검색의 [계좌명] — 등록한 이름이 없으면 '은행-끝 4자리'(기업은행-1122). */
export function bankLabel(b: Pick<BankAccountRow, 'name' | 'bankName' | 'accountNo'>) {
  if (b.name) return b.name
  const digits = (b.accountNo ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `${b.bankName}-${digits.slice(-4)}` : b.bankName
}

/**
 * 회계 II › 수표관리 › 수령수표입금처리(E060602) [입금보고서작성] — 2026-10-13 loginaa 실측.
 *
 * <p>1) <b>입금보고서작성</b> 창: [입금계좌] 코드도움 · 적요(증가적요동일 · 수표번호 · 직접입력) · 전표 묶음기준(라인별 · 거래처별/계정별),
 * [적용(F8)] [닫기]. 채권감소등록의 같은 창과 달리 수금형태 줄이 없고, 입금계좌를 비워도 [적용] 이 막지 않는다(돈 들어온 계좌가 빈 입금보고서가 열린다).
 * <br>2) [적용] → <b>입금보고서</b> 창: 일자 · 첨언내용, 줄마다 돈 들어온 계좌 · 계정코드(대변) 1039 보통예금(수표계좌의 계정) ·
 * 거래처(원본은 수표계좌 1122334455 기업은행-1122) · 금액 70,000(수표 잔액) · 적요명 · 추가정보 '수령수표 QA2C701'.
 * [저장(F8)] 하면 회계전표(2026/10/13 -22)와 수표 감소(수령수표조회 '2026/10/13 -12 · 입금보고서')가 함께 생기고 목록에서 빠진다.
 *
 * <p>type="ISSUED" — 발행수표출금처리(E060606) [지출결의서작성] (2026-10-14 실측): 1) <b>지출결의서작성</b> 창 [돈나간계좌번호] · 적요 · 묶음기준
 * (비워도 [적용] 이 넘어간다) 2) <b>지출결의서</b> 창: 돈 나간 계좌 검색 · 돈 나간 계좌명 · 계정코드(차변) 1039 보통예금(수표계좌의 계정) · 거래처 ·
 * 금액 · 적요명 · 추가정보 '발행수표 …'. 돈 나간 계좌를 비우고 [저장] 하면 그 칸에 '자료를 입력 바랍니다.'.
 * 저장하면 회계전표(2026/10/14 -4)와 발행수표조회 감소 줄 '2026/10/14 -2 · 지출결의서'.
 */
export default function CheckDepositReportModal({ type = 'RECEIVED', picks, onClose, onSaved }: {
  type?: CheckType
  picks: CheckDepositPick[] | null
  onClose: () => void
  onSaved: () => void
}) {
  const received = type === 'RECEIVED'
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
    ...banks.filter((b) => b.active).map((b) => ({ value: `b${b.id}`, code: b.code ?? b.accountNo, name: bankLabel(b) })),
    { value: '000', code: '000', name: '현금' },
  ], [banks])
  const settleName = settleItems.find((x) => x.value === settle)?.name ?? ''
  const settleCode = settleItems.find((x) => x.value === settle)?.code ?? ''

  function apply() {
    if (!picks) return
    const memoOf = (p: CheckDepositPick) => (memoMode === 'SAME' ? p.check.remark ?? '' : memoMode === 'CHECKNO' ? p.check.checkNo : '')
    let ls = picks.map((p) => ({ pick: p, memo: memoOf(p) }))
    if (group === 'PARTNER') {
      ls = [...ls].sort((a, b) => `${a.pick.accountCode}/${a.pick.check.partnerId ?? ''}`.localeCompare(`${b.pick.accountCode}/${b.pick.check.partnerId ?? ''}`))
    }
    setLines(ls)
  }

  async function save() {
    if (!lines) return
    setError('')
    if (!settle) { setError(received ? '돈 들어온 계좌를 입력 바랍니다.' : `${flow}: 자료를 입력 바랍니다.`); return }
    setSaving(true)
    try {
      await api.post(received ? '/checks/deposit-report' : '/checks/withdraw-report', {
        date,
        bankAccountId: settle.startsWith('b') ? Number(settle.slice(1)) : undefined,
        cash: settle === '000' || undefined,
        description: memo.trim() || undefined,
        lines: lines.map((l) => ({ checkId: l.pick.check.id, memo: l.memo.trim() || undefined })),
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

  const total = (lines ?? []).reduce((s, l) => s + Number(l.pick.check.amount), 0)

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
            {radio('memoMode', memoMode, setMemoMode, [['SAME', '증가적요동일'], ['CHECKNO', '수표번호'], ['DIRECT', '직접입력']])}
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
                <tr key={l.pick.check.id}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{settleCode}</td>
                  <td>{settleName}</td>
                  <td>{l.pick.accountCode}</td>
                  <td>{l.pick.accountName}</td>
                  <td>{l.pick.partnerCode}</td>
                  <td>{l.pick.check.partnerName ?? ''}</td>
                  <td className="text-right">{won(Number(l.pick.check.amount))}</td>
                  <td>
                    <input className="ec-input w-full" aria-label={`${i + 1}줄 적요명`} maxLength={200} value={l.memo}
                           onChange={(e) => setLines((ls) => ls!.map((x, j) => (j === i ? { ...x, memo: e.target.value } : x)))} />
                  </td>
                  <td className="text-ec-navy">{received ? '수령수표' : '발행수표'} {l.pick.check.checkNo}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7} />
                <td className="text-right">{won(total)}</td>
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
