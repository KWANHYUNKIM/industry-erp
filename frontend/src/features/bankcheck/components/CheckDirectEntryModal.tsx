import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import EcDateField from '../../../components/EcDateField'
import EcNumInput from '../../../components/EcNumInput'
import GridCode from '../../../components/GridCode'
import type { CodeItem } from '../../../components/CodePickerField'
import { ymd } from '../../../components/EcPeriodPicks'
import type { BankAccountRow, CheckType, Partner } from '../../../types/api'

interface Line { checkNo: string; amount: string; remark: string }
const blank = (): Line => ({ checkNo: '', amount: '', remark: '' })
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/** 원본 수표번호 자동값 — 연월일시분초 + 밀리초 + 줄번호 5자리(2026-10-13 실측 '26101307155833500001'). */
function newCheckNo(row: number, now = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(now.getFullYear() % 100)}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}${p(now.getMilliseconds(), 3)}${p(row, 5)}`
}

/**
 * 회계 II › 수표관리 › 수령(발행)수표조회 [신규(F2)] → <b>수령수표내역입력</b> · <b>발행수표내역입력</b> 창 — 2026-10-13 loginaa 실측.
 *
 * <p>머리: 전표일자(오늘) · 전표구분(증가 · 감소, 기본 증가) · 거래처코드 · 수표계좌(필수 — 비우고 저장하면 칸만 빨갛게).
 * 줄(3줄): 수표번호(칸에 들어가면 자동번호) · 금액 · 부서 · 프로젝트 · 적요, 아래 금액 합계. 버튼 저장(F8) · 다시 작성 · 닫기.
 * 저장하면 창이 닫히고 목록에 '수표만증가' · '수표만감소' 줄이 생긴다 — 분개가 없어 [회계전표일자-No.] 는 빈칸.
 * 부서 · 프로젝트는 우리 수표에 그 칸이 없어 두지 않는다. [웹자료올리기]는 없다.
 */
export default function CheckDirectEntryModal({ type, open, onClose, onSaved }: {
  type: CheckType; open: boolean; onClose: () => void; onSaved: () => void
}) {
  const title = type === 'RECEIVED' ? '수령수표내역입력' : '발행수표내역입력'
  const [date, setDate] = useState(ymd(new Date()))
  const [increase, setIncrease] = useState(true)
  const [partnerId, setPartnerId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [lines, setLines] = useState<Line[]>([blank(), blank(), blank()])
  const [partners, setPartners] = useState<CodeItem[]>([])
  const [accounts, setAccounts] = useState<CodeItem[]>([])
  const [accountErr, setAccountErr] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function reset() {
    setDate(ymd(new Date())); setIncrease(true); setPartnerId(''); setAccountId('')
    setLines([blank(), blank(), blank()]); setAccountErr(false); setError('')
  }

  useEffect(() => {
    if (!open) return
    reset()
    Promise.all([api.get<Partner[]>('/partners'), api.get<BankAccountRow[]>('/bank-cards/accounts')])
      .then(([p, a]) => {
        setPartners(p.data.map((x) => ({ value: String(x.id), code: x.code, name: x.name })))
        setAccounts(a.data.filter((x) => x.active).map((x) => ({
          value: String(x.id), code: x.code ?? x.accountNo, name: x.name ?? `${x.bankName}-${x.accountNo.slice(-4)}`,
        })))
      })
      .catch((e) => setError(extractErrorMessage(e)))
  }, [open])

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const filled = lines.filter((l) => l.checkNo.trim() && Number(l.amount) > 0)
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)

  async function save() {
    if (!accountId) { setAccountErr(true); return }
    setBusy(true)
    setError('')
    try {
      await api.post('/checks/direct', {
        type, date, increase, partnerId: partnerId ? Number(partnerId) : null, bankAccountId: Number(accountId),
        lines: filled.map((l) => ({ checkNo: l.checkNo.trim(), amount: Number(l.amount), remark: l.remark || null })),
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={title} width={1000} error={error} onClose={onClose}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void save() } }}>
        <h3 className="text-[14px] font-bold mb-[8px]">{title}</h3>
        <ul className="ec-cond mb-[8px] grid grid-cols-2 mobile:grid-cols-1">
          <li className="flex items-center gap-[8px]">
            <span className="w-[93px] text-ec-hint">전표일자</span>
            <EcDateField value={date} onChange={setDate} />
          </li>
          <li className="flex items-center gap-[8px]">
            <span className="w-[93px] text-ec-hint">전표구분</span>
            <select className="ec-input flex-1" aria-label="전표구분" value={increase ? 'INC' : 'DEC'}
                    onChange={(e) => setIncrease(e.target.value === 'INC')}>
              <option value="INC">증가</option>
              <option value="DEC">감소</option>
            </select>
          </li>
          <li className="flex items-center gap-[8px]">
            <span className="w-[93px] text-ec-hint">거래처코드</span>
            <span className="flex-1">
              <GridCode title="거래처검색" codeHead="거래처코드" nameHead="거래처명" items={partners} value={partnerId} onPick={setPartnerId} />
            </span>
          </li>
          <li className="flex items-center gap-[8px]">
            <span className="w-[93px] text-ec-hint">수표계좌</span>
            <span className={`flex-1${accountErr ? ' outline outline-1 outline-ec-danger rounded-ec' : ''}`} aria-invalid={accountErr}>
              <GridCode title="계좌검색" codeHead="계좌코드" nameHead="계좌명" items={accounts} value={accountId}
                        onPick={(v) => { setAccountId(v); setAccountErr(false) }} />
            </span>
          </li>
        </ul>

        <div className="overflow-x-auto">
          <table className="ec-grid-input no-ec table-fixed min-w-[800px] [&_tbody_tr]:h-[30px]">
            <thead>
              <tr>
                <th className="w-[34px]" />
                <th className="w-[240px]">수표번호</th>
                <th>금액</th>
                <th>적요</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="pad text-center text-ec-hint">{i + 1}</td>
                  <td className="pad">
                    <input className="ec-input w-full" aria-label={`${i + 1}줄 수표번호`} maxLength={30} value={l.checkNo}
                           onFocus={() => { if (!l.checkNo) setLine(i, { checkNo: newCheckNo(i + 1) }) }}
                           onChange={(e) => setLine(i, { checkNo: e.target.value })} />
                  </td>
                  <td className="pad">
                    <EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 금액`}
                                value={l.amount} onValue={(v) => setLine(i, { amount: v })} />
                  </td>
                  <td className="pad">
                    <input className="ec-input w-full" aria-label={`${i + 1}줄 적요`} maxLength={200}
                           value={l.remark} onChange={(e) => setLine(i, { remark: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} />
                <td className="text-right">{won(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex gap-[5px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" disabled={busy} onClick={() => void save()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  )
}
