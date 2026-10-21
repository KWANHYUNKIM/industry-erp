import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import type { BankAccountRow, BankCheck, CheckType, Partner } from '../../types/api'
import { dateText } from '../../utils/dateText'
import CheckOnlyDecreaseModal from '../../features/bankcheck/components/CheckOnlyDecreaseModal'
import CheckDepositReportModal, { bankLabel, type CheckDepositPick } from '../../features/bankcheck/components/CheckDepositReportModal'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/**
 * 회계 II › 수표관리 › 수령수표 › <b>수령수표입금처리</b>(E060602) — 2026-10-13 loginaa 실측.
 *
 * <p>오늘 보유 중인 받은수표 목록(수령일자 차례, 옛것부터). 열: 수표번호 · 수령일자 · 계정명 · 수령수표계좌명 · 거래처코드 · 거래처명 ·
 * 잔액 · 감소금액 · 적요 · 부서명 · 프로젝트명, 합계줄 '합 계'(번호 칸부터 일곱 칸) · 잔액 합 · 감소 합.
 * 체크하면 그 줄 [감소금액]에 잔액 전부가 들어간다(500,000 → 500,000, 합계줄 감소 합도).
 * 계정명은 수표내역입력으로 넣은 수표면 수표계좌의 계정(보통예금), 분개로 받은 수표면 받을수표.
 *
 * <p>하단 [입금보고서작성 ▴] — 아무것도 안 고르면 '리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.',
 * 고르면 CheckDepositReportModal(입금보고서작성 → 입금보고서 → 저장). 펼침 ▴ [수표만감소] 는 CheckOnlyDecreaseModal(회계전표 없이 수표만 줄임,
 * 2026-10-21 실측 — 빈 선택이면 같은 알림).
 *
 * <p><b>발행수표출금처리</b>(E060606, type="ISSUED") 는 같은 틀이다(2026-10-14 실측): 열 [발행수표계좌명](나머지 같음 — [수령일자]도 그대로),
 * 계정명은 수표계좌의 계정, 하단 [지출결의서작성 ▴](펼침 [수표만감소]) → 지출결의서작성 → 지출결의서 → 저장.
 */
export default function CheckDepositPage({ type = 'RECEIVED' }: { type?: CheckType }) {
  const received = type === 'RECEIVED'
  const title = received ? '수령수표입금처리' : '발행수표출금처리'
  const [checks, setChecks] = useState<BankCheck[]>([])
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [alert, setAlert] = useState(false)
  const [deposit, setDeposit] = useState<CheckDepositPick[] | null>(null)
  const [onlyDecrease, setOnlyDecrease] = useState<BankCheck[] | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [c, b, p] = await Promise.all([
        api.get<BankCheck[]>('/checks'),
        api.get<BankAccountRow[]>('/bank-cards/accounts'),
        api.get<Partner[]>('/partners'),
      ])
      setChecks(c.data)
      setBanks(b.data)
      setPartners(p.data)
      setPicked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const bankById = useMemo(() => new Map(banks.map((b) => [b.id, b])), [banks])
  const partnerCode = (id: number | null) => (id == null ? '' : partners.find((p) => p.id === id)?.code ?? '')
  const held = useMemo(() => checks.filter((c) => c.type === type && c.status === 'HELD')
    .sort((a, b) => (a.issueDate < b.issueDate ? -1 : a.issueDate > b.issueDate ? 1 : a.id - b.id)), [checks, type])
  /** 계정코드(대변 · 발행수표는 차변) · 계정명 — 수표내역입력 수표 · 발행수표는 수표계좌의 계정, 분개로 받은 수표는 받을수표(104). */
  const accountOf = (c: BankCheck) => {
    const b = (c.directEntry || !received) && c.bankAccountId != null ? bankById.get(c.bankAccountId) : undefined
    return b ? { code: b.glAccountCode, name: b.glAccountName } : { code: '104', name: '받을수표' }
  }
  const accountName = (c: BankCheck) => (c.bankAccountId != null && bankById.get(c.bankAccountId) ? bankLabel(bankById.get(c.bankAccountId)!) : '')
  const total = held.reduce((s, c) => s + Number(c.amount), 0)
  const pickedTotal = held.filter((c) => picked.has(c.id)).reduce((s, c) => s + Number(c.amount), 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [held.length])

  const toggle = (id: number, on: boolean) => setPicked((s) => {
    const n = new Set(s)
    if (on) n.add(id)
    else n.delete(id)
    return n
  })

  function depositReport() {
    const chosen = held.filter((c) => picked.has(c.id))
    if (chosen.length === 0) { setAlert(true); return }
    setDeposit(chosen.map((c) => ({ check: c, accountCode: accountOf(c).code, accountName: accountOf(c).name, partnerCode: partnerCode(c.partnerId) })))
  }

  function checkOnlyDecrease() {
    const chosen = held.filter((c) => picked.has(c.id))
    if (chosen.length === 0) { setAlert(true); return }
    setOnlyDecrease(chosen)
  }

  return (
    <EcListShell
      title={title}
      actions={[{ label: received ? '입금보고서작성' : '지출결의서작성', primary: true, onClick: depositReport,
                  menu: [{ label: '수표만감소', onClick: checkOnlyDecrease }] }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[30px] text-center">
              <input type="checkbox" aria-label="전체선택" checked={held.length > 0 && held.every((c) => picked.has(c.id))}
                     onChange={(e) => held.forEach((c) => toggle(c.id, e.target.checked))} />
            </th>
            <th>수표번호</th>
            <th>수령일자</th>
            <th>계정명</th>
            <th>{received ? '수령수표계좌명' : '발행수표계좌명'}</th>
            <th>거래처코드</th>
            <th>거래처명</th>
            <th className="text-right">잔액</th>
            <th className="text-right">감소금액</th>
            <th>적요</th>
            <th>부서명</th>
            <th>프로젝트명</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} className="ec-empty">불러오는 중…</td></tr>
          ) : held.length === 0 ? (
            <tr><td colSpan={12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : held.map((c) => (
            <tr key={c.id}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${c.checkNo} 선택`} checked={picked.has(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />
              </td>
              <td className="text-ec-navy">{c.checkNo}</td>
              <td>{dateText(c.issueDate)}</td>
              <td>{accountOf(c).name}</td>
              <td>{accountName(c)}</td>
              <td>{partnerCode(c.partnerId)}</td>
              <td>{c.partnerName ?? ''}</td>
              <td className="text-right">{won(Number(c.amount))}</td>
              {/* 원본은 체크하면 잔액 전부가 들어간다 — 수표는 한 장을 통째로 입금한다(일부 감소 · 칸 입력은 아직 못 잼, 글자로 보인다). */}
              <td className="text-right cursor-pointer" aria-label={`${c.checkNo} 감소금액`} onClick={() => { if (!picked.has(c.id)) toggle(c.id, true) }}>
                {picked.has(c.id) ? won(Number(c.amount)) : ''}
              </td>
              <td>{c.remark ?? ''}</td>
              <td />
              <td />
            </tr>
          ))}
        </tbody>
        {held.length > 0 && (
          <tfoot>
            {/* 원본 합계줄은 700(회색 바탕 · 여백 2.7px 은 토큰이 없어 남은 것) */}
            <tr className="font-bold">
              <td colSpan={7} className="text-center">합 계</td>
              <td className="text-right">{won(total)}</td>
              <td className="text-right">{pickedTotal ? won(pickedTotal) : ''}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        )}
      </table>

      <Modal open={alert} title="알림" width={420} error={error} onClose={() => setAlert(false)}>
        <p className="mb-[12px]">리스트에 선택된 자료가 없습니다.<br /><br />체크박스에 체크한 후 다시 시도 바랍니다.</p>
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => setAlert(false)}>확인</button>
      </Modal>
      <CheckOnlyDecreaseModal type={type} checks={onlyDecrease} onClose={() => setOnlyDecrease(null)} onSaved={() => void load()} />
      <CheckDepositReportModal type={type} picks={deposit} onClose={() => setDeposit(null)} onSaved={() => void load()} />
    </EcListShell>
  )
}
