import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import EcDateField from '../../../components/EcDateField'
import EcNumInput from '../../../components/EcNumInput'
import GridCode from '../../../components/GridCode'
import type { CodeItem } from '../../../components/CodePickerField'
import { ymd } from '../../../components/EcPeriodPicks'
import { EcHistoryModal } from '../../../components/EcHistory'
import { useDeptProjectItems } from '../../cashquick/useDeptProject'
import { dateText } from '../../../utils/dateText'
import { requireSelection } from '../../../components/EcDialog'
import NumCheck from '../../../components/NumCheck'
import type { BankAccountRow, BankCheck, CheckType, Partner } from '../../../types/api'

interface Line { id?: number; checkNo: string; amount: string; remark: string; departmentId: string; projectId: string }
const blank = (): Line => ({ checkNo: '', amount: '', remark: '', departmentId: '', projectId: '' })

/**
 * 원본 [H] 는 수표가 아니라 전표 한 장의 이력(머리 '[2026/10/14 -4]', 저장 '신규' → 고쳐 저장 '수정')이다 —
 * 서버 BankCheckService.historyTarget · historyId 와 같은 규칙(대상 CHECK_ENTRY_{R|I}_{IN|OUT}, id = yyyymmdd·10000 + 번호).
 */
const historyTarget = (type: CheckType, increase: boolean) => `CHECK_ENTRY_${type === 'RECEIVED' ? 'R' : 'I'}_${increase ? 'IN' : 'OUT'}`
const historyId = (date: string, no: number) => Number(date.replaceAll('-', '')) * 10000 + no

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
 * 줄의 [부서] · [프로젝트] 는 코드도움으로 고르고 칸에는 이름이 남는다(2026-10-14 실측 '개발팀' · '20210801A Project') — 수표거래내역 [부서명] · [프로젝트명].
 * [웹자료올리기]는 없다.
 *
 * <p><b>voucher</b> 를 주면 수표조회 [일자-No.] 링크로 연 그 전표다(2026-10-13 실측): 전표일자는 막히고 뒤에 ' - 10' 번호,
 * 전표구분은 글자('증가'), 거래처 · 수표계좌 · 줄은 고칠 수 있고 저장해도 번호는 그대로. 버튼은 저장(F8) · 삭제 · 닫기 · H(이력).
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
  const [historyOpen, setHistoryOpen] = useState(false)
  /* 줄 첫 칸 번호 체크칸으로 고른 줄 — 격자 위 [선택삭제] 가 그 줄을 비운다(2026-10-14 실측: 줄은 남고 번호는 그대로, 확인 창 없음). */
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const { departments, projects } = useDeptProjectItems()
  const editing = !!voucher

  function reset() {
    setAccountErr(false); setError(''); setPicked(new Set())
    if (voucher) {
      const first = voucher.checks[0]
      setDate(voucher.date); setIncrease(voucher.increase)
      setPartnerId(first?.partnerId != null ? String(first.partnerId) : ''); setAccountId(first?.bankAccountId != null ? String(first.bankAccountId) : '')
      setLines(pad3(voucher.checks.map((c) => ({
        id: c.id, checkNo: c.checkNo, amount: String(Number(c.amount)), remark: (voucher.increase ? c.remark : c.outRemark ?? c.remark) ?? '',
        departmentId: c.departmentId != null ? String(c.departmentId) : '', projectId: c.projectId != null ? String(c.projectId) : '',
      }))))
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
        lines: filled.map((l) => ({
          id: l.id ?? null, checkNo: l.checkNo.trim(), amount: Number(l.amount), remark: l.remark || null,
          departmentId: l.departmentId ? Number(l.departmentId) : null, projectId: l.projectId ? Number(l.projectId) : null,
        })),
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
            {/* 원본 — 코드칸 옆에 이름칸('1234567004' · '김치좋아', 2026-10-14 실측) */}
            <span className="flex-1 flex gap-[4px]">
              <span className="w-[140px]">
                <GridCode title="거래처검색" codeHead="거래처코드" nameHead="거래처명" items={partners} value={partnerId} onPick={setPartnerId} />
              </span>
              <input className="ec-input flex-1" aria-label="거래처명" readOnly tabIndex={-1} value={partners.find((x) => x.value === partnerId)?.name ?? ''} />
            </span>
          </li>
          <li className="flex items-center gap-[8px]">
            <span className="w-[93px] text-ec-hint">수표계좌</span>
            <span className="flex-1 flex gap-[4px]">
              <span className={`w-[140px]${accountErr ? ' outline outline-1 outline-ec-danger rounded-ec' : ''}`} aria-invalid={accountErr}>
                <GridCode title="계좌검색" codeHead="계좌코드" nameHead="계좌명" items={accounts} value={accountId}
                          onPick={(v) => { setAccountId(v); setAccountErr(false) }} />
              </span>
              <input className="ec-input flex-1" aria-label="수표계좌명" readOnly tabIndex={-1} value={accounts.find((x) => x.value === accountId)?.name ?? ''} />
            </span>
          </li>
        </ul>

        {/* 원본 격자 위 툴바 — [찾기(F3)] [선택삭제](h22 · btn-sm). 고른 줄 없이 [선택삭제] → '리스트에 선택된 자료가 없습니다.' */}
        <div className="flex gap-[5px] mb-[4px]">
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => {
            if (!requireSelection(picked.size)) return
            setLines((ls) => ls.map((l, i) => (picked.has(i) ? blank() : l)))
            setPicked(new Set())
          }}>선택삭제</button>
        </div>
        <div className="overflow-x-auto">
          <table className="ec-grid-input no-ec table-fixed min-w-[800px] [&_tbody_tr]:h-[36.5px] [&_td.pad]:p-[5.4px_2.7px] [&_tbody_input]:h-[var(--ec-grid-ctl-h)] [&_tbody_select]:h-[var(--ec-grid-ctl-h)] [&_tbody_button]:h-[var(--ec-grid-ctl-h)] [&_th]:leading-[1.42857] [&_tfoot_td]:leading-[1.42857]">
            <thead>
              <tr>
                {/* 원본 첫 두 칸 — 번호 체크칸(41) · 줄 옮기기 ⬇(43, fa-arrow-circle-down — 무엇을 하는지 못 잼) */}
                <th className="w-[41px] text-center [&>label]:h-[17px]">
                  <NumCheck no="" head label="전체 선택" on={lines.length > 0 && picked.size === lines.length}
                            onChange={(v) => setPicked(v ? new Set(lines.map((_, i) => i)) : new Set())} />
                </th>
                <th className="w-[43px] text-center"><span aria-hidden className="inline-block w-[14px] h-[14px] leading-[14px] rounded-full bg-ec-navy text-ec-panel text-[10px]">↓</span></th>
                <th className="w-[240px]">수표번호</th>
                <th>금액</th>
                <th className="w-[140px]">부서</th>
                <th className="w-[160px]">프로젝트</th>
                <th>적요</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="pad text-center">
                    <NumCheck no={i + 1} label={`${i + 1}줄 선택`} on={picked.has(i)}
                              onChange={(v) => setPicked((p) => { const n = new Set(p); if (v) n.add(i); else n.delete(i); return n })} />
                  </td>
                  <td className="pad text-center"><span aria-hidden className="inline-block w-[14px] h-[14px] leading-[14px] rounded-full bg-ec-navy text-ec-panel text-[10px]">↓</span></td>
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
                    {!increase && l.id != null
                      ? <span className="block px-[5px]">{departments.find((d) => d.value === l.departmentId)?.name ?? ''}</span>
                      : <GridCode title="부서검색" codeHead="부서코드" nameHead="부서명" items={departments} value={l.departmentId} showName
                                  onPick={(v) => setLine(i, { departmentId: v })} />}
                  </td>
                  <td className="pad">
                    {!increase && l.id != null
                      ? <span className="block px-[5px]">{projects.find((p) => p.value === l.projectId)?.name ?? ''}</span>
                      : <GridCode title="프로젝트검색" codeHead="프로젝트코드" nameHead="프로젝트명" items={projects} value={l.projectId} showName
                                  onPick={(v) => setLine(i, { projectId: v })} />}
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
                <td colSpan={3} />
                <td className="text-right">{won(total)}</td>
                <td colSpan={3} />
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
          {editing && <button type="button" className="ec-btn" onClick={() => setHistoryOpen(true)}>H</button>}
        </div>
      </div>
      {historyOpen && voucher && (
        <EcHistoryModal url={`/change-history?target=${historyTarget(type, voucher.increase)}&id=${historyId(voucher.date, voucher.entryNo)}`}
                        head={`[${dateText(voucher.date)} -${voucher.entryNo}]`} onClose={() => setHistoryOpen(false)} />
      )}
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
