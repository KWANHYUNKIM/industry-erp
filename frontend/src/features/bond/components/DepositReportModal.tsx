import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import EcDateField from '../../../components/EcDateField'
import EcNumInput from '../../../components/EcNumInput'
import GridCode from '../../../components/GridCode'
import type { CodeItem } from '../../../components/CodePickerField'
import { ymd } from '../../../components/EcPeriodPicks'
import type { BankAccountRow } from '../../../types/api'
import type { BondMasters } from '../api'
import { won } from '../types'

/** 채권감소등록에서 고른 채권 한 줄 — 감소금액 · 채권번호 · 증가 줄의 적요를 들고 온다. */
export interface DepositPick {
  accountId: number
  partnerId: number | null
  bondNo: string
  amount: number
  departmentId: number | null
  projectId: number | null
  /** 증가 줄의 적요 — [적요] 증가적요동일. */
  memo: string | null
}

type Collect = 'CASH' | 'NOTE' | 'CHECK' | 'OTHER'
type MemoMode = 'SAME' | 'BONDNO' | 'DIRECT'
type Group = 'LINE' | 'PARTNER'

interface Line { accountId: number; partnerId: number | null; bondNo: string; amount: string; memo: string
  departmentId: number | null; projectId: number | null }

/** 원본 계좌검색의 [계좌명] — 등록한 이름이 없으면 '은행-끝 4자리'(기업은행-1122). */
function bankLabel(b: BankAccountRow) {
  if (b.name) return b.name
  const digits = (b.accountNo ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `${b.bankName}-${digits.slice(-4)}` : b.bankName
}

/**
 * 회계 II › 채권관리 › 채권감소등록(E060402) [입금보고서작성] — 2026-10-13 loginaa 실측.
 *
 * <p>1) <b>입금보고서작성</b> 창: 수금형태(현금/예금 · 어음 · 수표 · 기타계정) + [입금계좌] 코드도움, 적요(증가적요동일 · 채권번호 · 직접입력),
 * 전표 묶음기준(라인별 · 거래처별/계정별). [입금계좌]를 비우고 [적용(F8)] 하면 그 칸이 빨갛게 된다.
 * <br>2) [적용] → <b>입금보고서</b> 창이 채워진 채 열린다: 돈 들어온 계좌 · 계정코드(대변) 1089 외상매출금 · 거래처 · 금액 · 적요명.
 * [저장(F8)] 하면 회계전표(차 입금계좌 / 대 외상매출금)와 채권 감소(출처업무 입금보고서)가 함께 생긴다.
 * 원본 QA2B001 50,000 → 20,000 입금 → 잔액 30,000, 회계일자-No. 2026/10/13 -18.
 *
 * <p>어음 · 수표 · 기타계정 수금은 받을어음 · 수령수표 추가정보 · 계정 코드도움으로 이어지는데 그 연결이 아직 없어 고를 수만 있고 [적용]에서 막는다.
 */
export default function DepositReportModal({ picks, masters, onClose, onSaved }: {
  picks: DepositPick[] | null
  masters: BondMasters
  onClose: () => void
  onSaved: () => void
}) {
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [collect, setCollect] = useState<Collect>('CASH')
  const [settle, setSettle] = useState('')
  const [memoMode, setMemoMode] = useState<MemoMode>('SAME')
  const [group, setGroup] = useState<Group>('LINE')
  const [settleErr, setSettleErr] = useState(false)
  const [note, setNote] = useState('')
  /** 2단계 — 입금보고서 창 */
  const [lines, setLines] = useState<Line[] | null>(null)
  const [date, setDate] = useState(ymd(new Date()))
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!picks) return
    setCollect('CASH'); setSettle(''); setMemoMode('SAME'); setGroup('LINE'); setSettleErr(false); setNote('')
    setLines(null); setDate(ymd(new Date())); setMemo(''); setError('')
    api.get<BankAccountRow[]>('/bank-cards/accounts').then((r) => setBanks(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [picks])

  const settleItems: CodeItem[] = useMemo(() => [
    ...banks.filter((b) => b.active).map((b) => ({ value: `b${b.id}`, code: b.code ?? b.accountNo, name: bankLabel(b) })),
    { value: '000', code: '000', name: '현금' },
  ], [banks])
  const settleName = settleItems.find((x) => x.value === settle)?.name ?? ''
  const settleCode = settleItems.find((x) => x.value === settle)?.code ?? ''
  const accName = (id: number) => masters.accounts.find((a) => a.value === String(id))
  const ptn = (id: number | null) => (id == null ? undefined : masters.partners.find((p) => p.value === String(id)))

  function apply() {
    if (!picks) return
    if (collect !== 'CASH') {
      setNote(`${collect === 'NOTE' ? '어음' : collect === 'CHECK' ? '수표' : '기타계정'} 수금은 아직 지원하지 않습니다. 현금/예금으로 골라 주세요.`)
      return
    }
    if (!settle) { setSettleErr(true); return }
    const memoOf = (p: DepositPick) => (memoMode === 'SAME' ? p.memo ?? '' : memoMode === 'BONDNO' ? p.bondNo : '')
    let ls: Line[] = picks.map((p) => ({ accountId: p.accountId, partnerId: p.partnerId, bondNo: p.bondNo,
      amount: String(p.amount), memo: memoOf(p), departmentId: p.departmentId, projectId: p.projectId }))
    /* 거래처별/계정별: 같은 계정 · 거래처 줄을 금액 합으로 한 줄씩 — 채권번호가 여럿이면 줄마다 따로 감소해야 해서 원본도 분개만 묶는다.
       우리는 채권 감소가 줄마다 채권번호를 들어야 하므로 줄은 그대로 두고 화면 표시만 원본 라인별과 같게 한다. */
    if (group === 'PARTNER') ls = [...ls].sort((a, b) => `${a.accountId}/${a.partnerId}`.localeCompare(`${b.accountId}/${b.partnerId}`))
    setLines(ls)
  }

  async function save() {
    if (!lines) return
    setError('')
    const bad = lines.findIndex((l) => !(Number(l.amount) > 0))
    if (bad >= 0) { setError('금액을 입력 바랍니다.'); return }
    setSaving(true)
    try {
      await api.post('/bonds/deposit-report', {
        date,
        bankAccountId: settle.startsWith('b') ? Number(settle.slice(1)) : undefined,
        cash: settle === '000' || undefined,
        description: memo.trim() || undefined,
        lines: lines.map((l) => ({ accountId: l.accountId, partnerId: l.partnerId, bondNo: l.bondNo, amount: Number(l.amount),
          departmentId: l.departmentId, projectId: l.projectId, memo: l.memo.trim() || undefined })),
      }, { params: { side: 'RECEIVABLE' } })
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

  const total = (lines ?? []).reduce((s, l) => s + (Number(l.amount) || 0), 0)

  return (
    <>
      <Modal open={picks != null && lines == null} title="입금보고서작성" width={780} error={error} onClose={onClose}>
        <ul className="ec-form mb-[8px]">
          <li className="flex items-start gap-[8px] py-[4px]">
            <span className="w-[120px] text-ec-label pt-[4px]">수금형태</span>
            <span className="flex-1 flex flex-col gap-[6px]">
              {radio('collect', collect, (v) => { setCollect(v); setNote('') },
                [['CASH', '현금/예금'], ['NOTE', '어음'], ['CHECK', '수표'], ['OTHER', '기타계정']])}
              <span className={`block${settleErr ? ' outline outline-1 outline-ec-danger rounded-ec' : ''}`}>
                <span className="inline-flex w-full items-center gap-[6px]">
                  <span className="text-ec-label whitespace-nowrap">입금계좌</span>
                  <span className="flex-1">
                    <GridCode title="계좌검색" codeHead="입금계좌" nameHead="계좌명" items={settleItems}
                              value={settle} onPick={(v) => { setSettle(v); setSettleErr(false) }} />
                  </span>
                  <span className="min-w-[120px]">{settleName}</span>
                </span>
              </span>
            </span>
          </li>
          <li className="flex items-center gap-[8px] py-[4px]">
            <span className="w-[120px] text-ec-label">적요</span>
            {radio('memoMode', memoMode, setMemoMode, [['SAME', '증가적요동일'], ['BONDNO', '채권번호'], ['DIRECT', '직접입력']])}
          </li>
          <li className="flex items-center gap-[8px] py-[4px]">
            <span className="w-[120px] text-ec-label">전표 묶음기준</span>
            {radio('group', group, setGroup, [['LINE', '라인별'], ['PARTNER', '거래처별/계정별']])}
          </li>
        </ul>
        {note && <p className="ec-alert ec-alert-danger mb-[8px]">{note}</p>}
        <div className="flex gap-[5px] mt-[14px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>

      <Modal open={picks != null && lines != null} title="입금보고서" width={1100} error={error} onClose={onClose}>
        <ul className="ec-form mb-[8px]">
          <li className="flex items-center gap-[8px] py-[4px]">
            <span className="w-[120px] text-ec-label">일자</span>
            <EcDateField value={date} onChange={setDate} />
          </li>
          <li className="flex items-center gap-[8px] py-[4px]">
            <span className="w-[120px] text-ec-label">첨언내용</span>
            <textarea className="ec-input flex-1 h-[37px] resize-y" placeholder="첨언내용" maxLength={200}
                      value={memo} onChange={(e) => setMemo(e.target.value)} />
          </li>
        </ul>
        <div className="overflow-x-auto">
          <table className="ec-grid-input no-ec table-fixed min-w-[1000px]">
            <thead>
              <tr>
                <th className="w-[32px]" />
                <th>돈 들어온 계좌 검색</th>
                <th>돈 들어온 계좌명</th>
                <th>계정코드(대변)</th>
                <th>계정코드명</th>
                <th>거래처 검색</th>
                <th>거래처명</th>
                <th>금액</th>
                <th>적요명</th>
                <th className="w-[60px]">채권번호</th>
              </tr>
            </thead>
            <tbody>
              {(lines ?? []).map((l, i) => (
                <tr key={i}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{settleCode}</td>
                  <td>{settleName}</td>
                  <td>{accName(l.accountId)?.code ?? ''}</td>
                  <td>{accName(l.accountId)?.name ?? ''}</td>
                  <td>{ptn(l.partnerId)?.code ?? ''}</td>
                  <td>{ptn(l.partnerId)?.name ?? ''}</td>
                  <td>
                    <EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 금액`} value={l.amount}
                                onValue={(v) => setLines((ls) => ls!.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
                  </td>
                  <td>
                    <input className="ec-input w-full" aria-label={`${i + 1}줄 적요명`} maxLength={200} value={l.memo}
                           onChange={(e) => setLines((ls) => ls!.map((x, j) => (j === i ? { ...x, memo: e.target.value } : x)))} />
                  </td>
                  <td className="text-ec-navy">{l.bondNo}</td>
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
