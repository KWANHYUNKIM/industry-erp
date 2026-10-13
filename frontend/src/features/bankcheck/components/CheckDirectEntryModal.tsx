import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import EcDateField from '../../../components/EcDateField'
import EcNumInput from '../../../components/EcNumInput'
import GridCode from '../../../components/GridCode'
import type { CodeItem } from '../../../components/CodePickerField'
import { ymd } from '../../../components/EcPeriodPicks'
import type { BankAccountRow, BankCheck, CheckType, Partner } from '../../../types/api'

interface Line { id?: number; checkNo: string; amount: string; remark: string }
const blank = (): Line => ({ checkNo: '', amount: '', remark: '' })

/** 수표조회 [일자-No.] 링크로 연 전표 한 장 — 같은 (종류, 날짜, 번호, 증가/감소) 의 수표들. */
export interface CheckVoucher { date: string; increase: boolean; entryNo: number; checks: BankCheck[] }
const pad3 = (ls: Line[]) => [...ls, ...Array.from({ length: Math.max(0, 3 - ls.length) }, blank)]
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
 *
 * <p><b>voucher</b> 를 주면 수표조회 [일자-No.] 링크로 연 그 전표다(2026-10-13 실측): 전표일자는 막히고 뒤에 ' - 10' 번호,
 * 전표구분은 글자('증가'), 거래처 · 수표계좌 · 줄은 고칠 수 있고 저장해도 번호는 그대로. 버튼은 저장(F8) · 삭제 · 닫기.
 * [삭제]는 알림 '전표를 삭제하겠습니까?' / '- 수령수표내역입력' 확인 · 취소 → 목록에서 그 줄이 사라진다.
 * 감소 전표의 금액 · 적요는 수표 한 장의 값(증가 쪽)이라 막는다.
 */
export default function CheckDirectEntryModal({ type, open, onClose, onSaved, voucher }: {
  type: CheckType; open: boolean; onClose: () => void; onSaved: () => void; voucher?: CheckVoucher | null
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
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editing = !!voucher

  function reset() {
    setAccountErr(false); setError('')
    if (voucher) {
      const first = voucher.checks[0]
      setDate(voucher.date); setIncrease(voucher.increase)
      setPartnerId(first?.partnerId != null ? String(first.partnerId) : ''); setAccountId(first?.bankAccountId != null ? String(first.bankAccountId) : '')
      setLines(pad3(voucher.checks.map((c) => ({ id: c.id, checkNo: c.checkNo, amount: String(Number(c.amount)), remark: c.remark ?? '' }))))
      return
    }
    setDate(ymd(new Date())); setIncrease(true); setPartnerId(''); setAccountId('')
    setLines([blank(), blank(), blank()])
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, voucher])

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const filled = lines.filter((l) => l.checkNo.trim() && Number(l.amount) > 0)
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)

  async function save() {
    if (!accountId) { setAccountErr(true); return }
    setBusy(true)
    setError('')
    try {
      const body = {
        type, date, increase, partnerId: partnerId ? Number(partnerId) : null, bankAccountId: Number(accountId),
        lines: filled.map((l) => ({ id: l.id ?? null, checkNo: l.checkNo.trim(), amount: Number(l.amount), remark: l.remark || null })),
      }
      if (voucher) await api.put('/checks/direct', { ...body, entryNo: voucher.entryNo })
      else await api.post('/checks/direct', body)
      onSaved()
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  /* 원본 [삭제] — 그 전표의 움직임만 지운다([선택삭제]와 같은 길). */
  async function remove() {
    if (!voucher) return
    setConfirmDelete(false)
    const ids = voucher.checks.map((c) => c.id)
    try {
      await api.post('/checks/delete', voucher.increase ? { decreaseIds: [], increaseIds: ids } : { decreaseIds: ids, increaseIds: [] })
      onSaved()
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  return (
    <Modal open={open} title={title} width={1000} error={error} onClose={onClose}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void save() } }}>
        <h3 className="text-[14px] font-bold mb-[8px]">{title}</h3>
        <ul className="ec-cond mb-[8px] grid grid-cols-2 mobile:grid-cols-1">
          <li className="flex items-center gap-[8px]">
            <span className="w-[93px] text-ec-hint">전표일자</span>
            {editing ? (
              <span className="flex items-center gap-[4px]">
                <EcDateField value={date} onChange={setDate} disabled />
                <span>- {voucher!.entryNo}</span>
              </span>
            ) : <EcDateField value={date} onChange={setDate} />}
          </li>
          <li className="flex items-center gap-[8px]">
            <span className="w-[93px] text-ec-hint">전표구분</span>
            {editing ? <span className="flex-1">{increase ? '증가' : '감소'}</span> : (
              <select className="ec-input flex-1" aria-label="전표구분" value={increase ? 'INC' : 'DEC'}
                      onChange={(e) => setIncrease(e.target.value === 'INC')}>
                <option value="INC">증가</option>
                <option value="DEC">감소</option>
              </select>
            )}
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
                    <EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 금액`} disabled={!increase && l.id != null}
                                value={l.amount} onValue={(v) => setLine(i, { amount: v })} />
                  </td>
                  <td className="pad">
                    <input className="ec-input w-full" aria-label={`${i + 1}줄 적요`} maxLength={200} disabled={!increase && l.id != null}
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
          {editing
            ? <button type="button" className="ec-btn" onClick={() => setConfirmDelete(true)}>삭제</button>
            : <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>}
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
      <Modal open={confirmDelete} title="알림" width={420} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?<br />- {title}</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void remove()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </Modal>
  )
}
