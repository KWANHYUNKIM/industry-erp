import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcNumInput from '../../components/EcNumInput'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'
import { fetchBonds, useBondMasters } from '../../features/bond/api'
import BondEntryModal, { type BondPrefillLine } from '../../features/bond/components/BondEntryModal'
import DepositReportModal, { type DepositPick } from '../../features/bond/components/DepositReportModal'
import { openBonds, type OpenBond } from '../../features/bond/ledger'
import { flatten, sideWord, won, type BondRow, type BondSide } from '../../features/bond/types'

/**
 * 회계 II › 채권관리 › <b>채권감소등록</b>(E060402) · 채무관리 › 채무감소등록 — 2026-10-12 loginaa 실측.
 *
 * <p>오늘 잔액이 남은 채권번호 목록(채권번호 차례). 열: 채권번호 · 발생일자 · 만기일자 · 채권계정명 · 거래처코드 · 거래처명 · 잔액 ·
 * 잔액환율 · 외화잔액 · 할인금액 · 감소금액 · 적요 · 부서명 · 프로젝트명. 합계줄은 잔액 · 외화잔액 · 할인 · 감소 합.
 * [감소금액] 칸을 누르면 그 줄이 체크되고 잔액 전부가 채워진다(50,000 → 20,000 으로 고쳐 씀).
 *
 * <p>버튼 [입금보고서작성 ▴] 의 펼침 [채권만감소] — 체크한 줄로 <b>채권내역입력 감소 창</b>을 채워 연다(계정 · 거래처 · 채권번호 ·
 * 감소금액 · 증가 줄의 적요). 아무것도 안 고르면 '리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'
 * 본 버튼 [입금보고서작성](2026-10-13 실측): 수금형태 · 입금계좌 · 적요 · 전표 묶음기준 창 → [적용] → 채워진 입금보고서 → [저장] 하면
 * 회계전표(차 입금계좌 / 대 외상매출금)와 채권 감소(출처업무 입금보고서)가 함께 생긴다 — DepositReportModal. 외화(잔액환율 · 외화잔액)는 채권내역에 통화가 없어 빈칸 · 0 이다.
 */
export default function BondDecreasePage({ side }: { side: BondSide }) {
  const word = sideWord(side)
  const title = `${word}감소등록`
  const masters = useBondMasters()
  const [rows, setRows] = useState<BondRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Record<string, { dc: string; amt: string }>>({})
  const [alert, setAlert] = useState(false)
  const [prefill, setPrefill] = useState<BondPrefillLine[] | null>(null)
  const today = ymd(new Date())

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(flatten(await fetchBonds(side, today)))
      setPicked({})
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [side])

  const open = useMemo(() => openBonds(rows, today).sort((a, b) => a.bondNo.localeCompare(b.bondNo)), [rows, today])
  const total = open.reduce((a, b) => a + b.balance, 0)
  const sumOf = (k: 'dc' | 'amt') => Object.values(picked).reduce((a, p) => a + (Number(p[k]) || 0), 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [open.length])

  const toggle = (b: OpenBond, on: boolean) => setPicked((s) => {
    const n = { ...s }
    if (on) n[b.key] = n[b.key] ?? { dc: '', amt: String(Math.round(b.balance)) }
    else delete n[b.key]
    return n
  })
  const setCell = (b: OpenBond, k: 'dc' | 'amt', v: string) =>
    setPicked((s) => ({ ...s, [b.key]: { ...(s[b.key] ?? { dc: '', amt: String(Math.round(b.balance)) }), [k]: v } }))

  const [deposit, setDeposit] = useState<DepositPick[] | null>(null)

  function chosenLines(): BondPrefillLine[] | null {
    const chosen = open.filter((b) => picked[b.key])
    if (chosen.length === 0) { setAlert(true); return null }
    return chosen.map((b) => ({
      accountId: b.accountId, partnerId: b.partnerId, bondNo: b.bondNo,
      amount: Number(picked[b.key].amt) || 0, departmentId: b.departmentId,
      projectId: rows.find((r) => r.bondNo === b.bondNo && r.direction === 'INCREASE')?.projectId ?? null,
      memo: b.memo,
    }))
  }

  function decreaseOnly() {
    const ls = chosenLines()
    if (ls) setPrefill(ls)
  }

  /** [입금보고서작성] — 고른 줄로 입금보고서작성 창을 연다(채권만). */
  function depositReport() {
    const ls = chosenLines()
    if (ls) setDeposit(ls)
  }

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={side === 'RECEIVABLE'
        ? [{ label: '입금보고서작성', primary: true, onClick: depositReport, menu: [{ label: '채권만감소', onClick: decreaseOnly }] }]
        : [{ label: `${word}만감소`, primary: true, onClick: decreaseOnly }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[30px] text-center">
              <input type="checkbox" aria-label="전체선택" checked={open.length > 0 && open.every((b) => picked[b.key])}
                     onChange={(e) => open.forEach((b) => toggle(b, e.target.checked))} />
            </th>
            <th>{word}번호</th>
            <th>발생일자</th>
            <th>만기일자</th>
            <th>{word}계정명</th>
            <th>거래처코드</th>
            <th>거래처명</th>
            <th className="text-right">잔액</th>
            <th className="text-right">잔액환율</th>
            <th className="text-right">외화잔액</th>
            <th className="text-right">할인금액</th>
            <th className="text-right">감소금액</th>
            <th>적요</th>
            <th>부서명</th>
            <th>프로젝트명</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={15} className="ec-empty">불러오는 중…</td></tr>
          ) : open.length === 0 ? (
            <tr><td colSpan={15} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : open.map((b) => (
            <tr key={b.key}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${b.bondNo} 선택`} checked={!!picked[b.key]} onChange={(e) => toggle(b, e.target.checked)} />
              </td>
              <td className="text-ec-navy">{b.bondNo}</td>
              <td>{b.issueDate.replaceAll('-', '/')}</td>
              <td>{b.dueDate ? b.dueDate.replaceAll('-', '/') : ''}</td>
              <td>{b.accountName}</td>
              <td>{b.partnerCode ?? ''}</td>
              <td>{b.partnerName ?? ''}</td>
              <td className="text-right">{won(b.balance)}</td>
              <td className="text-right" />
              <td className="text-right" />
              <td className="text-right">
                <EcNumInput className="ec-input w-full text-right" aria-label={`${b.bondNo} 할인금액`}
                            value={picked[b.key]?.dc ?? ''} onValue={(v) => setCell(b, 'dc', v)} />
              </td>
              <td className="text-right">
                <EcNumInput className="ec-input w-full text-right" aria-label={`${b.bondNo} 감소금액`}
                            value={picked[b.key]?.amt ?? ''} onFocus={() => { if (!picked[b.key]) toggle(b, true) }}
                            onValue={(v) => setCell(b, 'amt', v)} />
              </td>
              <td>{b.memo ?? ''}</td>
              <td>{masters.deptName(b.departmentId)}</td>
              <td>{b.projectName ?? ''}</td>
            </tr>
          ))}
        </tbody>
        {open.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={7} />
              <td className="text-right">{won(total)}</td>
              <td />
              <td className="text-right">0</td>
              {/* 원본 합계줄은 할인 · 감소 칸이 두 줄 — 위 '외화 0', 아래 원화 합(2026-10-13 실측). */}
              <td className="text-right"><span className="flex justify-between"><span className="text-ec-label">외화</span>0</span>{won(sumOf('dc'))}</td>
              <td className="text-right"><span className="flex justify-between"><span className="text-ec-label">외화</span>0</span>{won(sumOf('amt'))}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        )}
      </table>

      <Modal open={alert} title="알림" width={420} error={error} onClose={() => setAlert(false)}>
        <p className="mb-[12px]">리스트에 선택된 자료가 없습니다.<br /><br />체크박스에 체크한 후 다시 시도 바랍니다.</p>
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => setAlert(false)}>확인</button>
      </Modal>
      <DepositReportModal picks={deposit} masters={masters} onClose={() => setDeposit(null)} onSaved={() => void load()} />
      <BondEntryModal side={side} open={prefill != null} entryId={null} prefill={prefill} masters={masters}
                      onClose={() => setPrefill(null)} onSaved={() => void load()} />
    </EcListShell>
  )
}
