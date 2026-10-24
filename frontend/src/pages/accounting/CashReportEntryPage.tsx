import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import EcSlipShell from '../../components/EcSlipShell'
import EcDateField from '../../components/EcDateField'
import EcNumInput from '../../components/EcNumInput'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import type { CodeItem } from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import { ymd } from '../../components/EcPeriodPicks'
import { partnerCodeItems } from '../../utils/codeItems'
import SlipGridTools, { type SlipTool } from '../../features/fastentry/components/SlipGridTools'
import VoucherVatModal, { type LineVat, vatCellText } from '../../features/fastentry/components/VoucherVatModal'
import SlipPrintModal from '../../features/journalprint/SlipPrintModal'
import { journalSlipHtml, loadSlipHeader } from '../../features/journalprint/slipPrint'
import type { BankAccountRow, FastVoucher, JournalEntry, Partner } from '../../types/api'

/**
 * 회계 I › 현금거래 › 현금예금출금 [지출결의서](E010408) · 현금예금입금 [입금보고서](E010403).
 *
 * 2026-10-12 loginaa 실측. 원본은 목록이 아니라 <b>입력 화면</b>이다 — 머리 [일자] · [첨언내용] 아래 격자에
 * 줄마다 [돈 나간(들어온) 계좌] · [계정코드] · [거래처] · [금액] · [적요명]을 넣고 [저장(F8)] 하면 빈 화면으로 돌아간다.
 * 저장한 것은 [리스트](회계거래조회)에서 열어 고치고 지운다.
 *
 * - 계좌검색: 등록한 계좌 + 000 현금. 계좌를 고르면 빈 계정칸에 기본 계정이 찬다(지출 8109 복리후생비(판) ·
 *   입금 1089 외상매출금 — 우리 계정표로는 811 · 108).
 * - 분개: 지출 차) 줄 계정 / 대) 그 줄의 계좌 계정 — 26/10/12-2 복리후생비(판) 15,000 / 현금 15,000, 둘 다 적요 'QA회계1 식대'.
 * - 빈 채로 저장 → 계정칸에 '계정코드를 입력 바랍니다.', 계정만 있고 계좌가 없으면 계좌칸에 '자료를 입력 바랍니다.'
 * - 수정: 일자는 막힌다. 삭제: '전표를 삭제하겠습니까?' → 분개도 같이 사라진다.
 * - [저장/전표(F7)](2026-10-21 실측): 저장하고 '일반전표' 창(전표 서식 · [인쇄] [닫기])을 띄운다 — 신규는 뒤가 빈 입력 화면,
 *   수정은 창을 닫으면 목록으로.
 * - 격자 끝 [추가정보](2026-10-21 실측): 지출결의서 · 가지급금정산서는 [입력] → '추가정보입력'(VoucherVatModal) 부가세정보.
 *   적용하면 칸이 '[세금계산서] 10,909 / 1,091', 줄 금액 = 공급가액 + 부가세, 분개는 차) 줄 계정 공급가액 · 부가세대급금 부가세.
 *   부가세가 든 줄의 [금액]을 누르면 그 창이 뜬다. 입금보고서는 계좌 없는 줄의 [입력]에 '계좌번호를 먼저 선택 바랍니다.'
 *   (계좌가 있으면 원본도 창이 안 떴다 — 무엇을 받는지 못 잼).
 *
 * FastEntry [가지급금정산서](E010505)도 같은 틀이다(2026-10-12 실측) — 첫 열이 계좌 대신 [정산자 검색](사원검색 창) ·
 * [정산대상자명], 사원을 고르면 계정칸에 8109 복리후생비(판). 분개는 차) 줄 계정 / 대) 가지급금(정산자별로 묶음) —
 * 26/10/12-17 고준희 복리후생비(판) 9,000 / 가지급금 9,000. 돈이 오가지 않아 계좌 잔액은 그대로다.
 */

type Kind = 'EXPENSE_REPORT' | 'DEPOSIT_REPORT' | 'ADVANCE_SETTLEMENT'

interface AccountOption { id: number; code: string; name: string }
interface EmployeeOption { id: number; code: string; name: string }

interface Line {
  /** '000' = 현금, 'b<id>' = 계좌, 'e<id>' = 정산자 사원(가지급금정산서), '' = 안 고름 */
  settle: string
  accountId: string
  partnerId: string
  amount: string
  description: string
  /** [추가정보] 부가세정보 — 없으면 null */
  vat: LineVat | null
}

const blank = (): Line => ({ settle: '', accountId: '', partnerId: '', amount: '', description: '', vat: null })
const START_ROWS = 3
const won = (n: number) => n.toLocaleString('ko-KR')

interface Conf {
  title: string; settleHead: string; settleNameHead: string; accountHead: string; partnerHead: string; defaultAccount: string
  /** 격자 위 툴바 — 원본 화면마다 다르다(SlipGridTools). */
  tools: SlipTool[]
  /** 첫 열 검색 창 — 계좌검색 · 사원검색 */
  settlePicker: { title: string; codeHead: string; nameHead: string }
}
const BANK_PICKER = { title: '계좌검색', codeHead: '계좌코드', nameHead: '계좌명' }
const CONF: Record<Kind, Conf> = {
  EXPENSE_REPORT: { title: '지출결의서', settleHead: '돈 나간 계좌', settleNameHead: '돈 나간 계좌명', accountHead: '계정코드(차변)',
    partnerHead: '거래처 검색', defaultAccount: '811', settlePicker: BANK_PICKER,
    tools: ['찾기(F3)', '보류', '자금계획', '계좌입출금내역', '카드매입내역', '계정별잔액'] },
  DEPOSIT_REPORT: { title: '입금보고서', settleHead: '돈 들어온 계좌', settleNameHead: '돈 들어온 계좌명', accountHead: '계정코드(대변)',
    partnerHead: '거래처 검색', defaultAccount: '108', settlePicker: BANK_PICKER,
    tools: ['찾기(F3)', '보류', '자금계획', '계좌입출금내역', '결제대행사내역'] },
  ADVANCE_SETTLEMENT: { title: '가지급금정산서', settleHead: '정산자', settleNameHead: '정산대상자명', accountHead: '계정코드(차변)',
    partnerHead: '거래처', defaultAccount: '811', settlePicker: { title: '사원검색', codeHead: '사원코드', nameHead: '사원명' },
    tools: ['찾기(F3)', '보류'] },
}

/** 원본 계좌검색의 [계좌명] — 등록한 이름이 없으면 '은행-끝 4자리'(기업은행-1122). */
function bankLabel(b: BankAccountRow) {
  if (b.name) return b.name
  const digits = (b.accountNo ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `${b.bankName}-${digits.slice(-4)}` : b.bankName
}

type CellErr = { row: number; col: 'settle' | 'account' | 'amount' | 'extra'; msg: string }

export default function CashReportEntryPage({ kind }: { kind: Kind }) {
  const conf = CONF[kind]
  const advance = kind === 'ADVANCE_SETTLEMENT'
  const navigate = useNavigate()
  /* 집계(가지급금정산서집계 등)의 [일자-No.] 로 들어왔으면 저장 · 삭제 뒤 그 집계로 돌아간다(원본 — 창이 닫히고 집계가 다시 그려짐). */
  const back = (useLocation().state as { back?: string } | null)?.back ?? '/accounting/journals'
  const [params] = useSearchParams()
  const editId = params.get('id')
  const journalId = params.get('journal')

  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [editing, setEditing] = useState<FastVoucher | null>(null)
  const [date, setDate] = useState(ymd(new Date()))
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<Line[]>(() => Array.from({ length: START_ROWS }, blank))
  const [cellErr, setCellErr] = useState<CellErr | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** [추가정보] 창을 연 줄 */
  const [vatRow, setVatRow] = useState<number | null>(null)
  /** [저장/전표(F7)] 뒤 '일반전표' 창 */
  const [slip, setSlip] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<AccountOption[]>('/accounts'),
      api.get<BankAccountRow[]>('/bank-cards/accounts'),
      api.get<Partner[]>('/partners'),
      advance ? api.get<EmployeeOption[]>('/employees') : Promise.resolve({ data: [] as EmployeeOption[] }),
    ]).then(([a, b, p, e]) => { setAccounts(a.data); setBanks(b.data); setPartners(p.data); setEmployees(e.data) })
      .catch((e) => setError(extractErrorMessage(e)))
  }, [advance])

  /* 회계전표조회에서 전표를 눌러 들어오면(?journal=) 그 전표를 만든 결의서를, ?id= 면 그 결의서를 연다. */
  useEffect(() => {
    if (!editId && !journalId) { setEditing(null); reset(); return }
    const url = editId ? `/vouchers/${editId}` : `/vouchers/by-journal/${journalId}`
    api.get<FastVoucher>(url).then(({ data }) => {
      setEditing(data)
      setDate(data.voucherDate)
      setMemo(data.description ?? '')
      const ls: Line[] = data.lines.map((l) => ({
        settle: l.employeeId ? `e${l.employeeId}` : l.settleAccountId ? `a${l.settleAccountId}` : l.bankAccountId ? `b${l.bankAccountId}` : l.cash || data.method === 'CASH' ? '000'
          : data.bankAccountId ? `b${data.bankAccountId}` : '',
        accountId: String(l.accountId),
        partnerId: l.partnerId ? String(l.partnerId) : '',
        amount: String(l.amount),
        description: l.description ?? '',
        vat: l.vatType ? { vatType: l.vatType, vatDate: l.vatDate ?? data.voucherDate, partnerId: l.vatPartnerId ? String(l.vatPartnerId) : '',
          supply: String(l.vatSupply ?? 0), vat: String(l.vatAmount ?? 0) } : null,
      }))
      while (ls.length < START_ROWS) ls.push(blank())
      setLines(ls)
    }).catch((e) => setError(extractErrorMessage(e)))
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [editId, journalId])

  const settleItems: CodeItem[] = useMemo(() => advance
    ? employees.map((e) => ({ value: `e${e.id}`, code: e.code, name: e.name }))
    : [
      ...banks.filter((b) => b.active).map((b) => ({ value: `b${b.id}`, code: b.code ?? b.accountNo, name: bankLabel(b) })),
      { value: '000', code: '000', name: '현금' },
      /* 수금형태 '어음'으로 만든 결의서 — 돈 들어온 쪽이 계정(1109 받을어음)이라 그 계정도 고를 수 있게 둔다. */
      ...[...new Map((editing?.lines ?? []).filter((l) => l.settleAccountId)
        .map((l) => [l.settleAccountId!, { value: `a${l.settleAccountId}`, code: l.settleAccountCode ?? '', name: l.settleAccountName ?? '' }])).values()],
    ], [advance, banks, employees, editing])
  const accountItems: CodeItem[] = useMemo(
    () => accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name })), [accounts])
  const partnerItems: CodeItem[] = useMemo(() => partnerCodeItems(partners), [partners])

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)

  function reset() {
    setDate(ymd(new Date()))
    setMemo('')
    setLines(Array.from({ length: START_ROWS }, blank))
    setCellErr(null)
    setError('')
  }

  function setLine(i: number, patch: Partial<Line>) {
    setCellErr(null)
    setLines((ls) => {
      const next = ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l))
      /* 마지막 줄에 쓰기 시작하면 원본처럼 빈 줄이 하나 더 생긴다. */
      if (i === next.length - 1) next.push(blank())
      return next
    })
  }

  function pickSettle(i: number, v: string) {
    const patch: Partial<Line> = { settle: v }
    /* 원본: 계좌(정산자)를 고르면 빈 계정칸에 기본 계정(지출 · 가지급금 복리후생비 · 입금 외상매출금)이 찬다. */
    if (v && !lines[i].accountId) {
      const def = accounts.find((a) => a.code === conf.defaultAccount)
      if (def) patch.accountId = String(def.id)
    }
    setLine(i, patch)
  }

  async function save(thenSlip = false) {
    setError('')
    const used = lines.map((l, i) => ({ l, i }))
      .filter(({ l }) => l.settle || l.accountId || l.partnerId || l.amount || l.description)
    if (used.length === 0) return setCellErr({ row: 0, col: 'account', msg: '계정코드를 입력 바랍니다.' })
    for (const { l, i } of used) {
      if (!l.accountId) return setCellErr({ row: i, col: 'account', msg: '계정코드를 입력 바랍니다.' })
      if (!l.settle) return setCellErr({ row: i, col: 'settle', msg: '자료를 입력 바랍니다.' })
      if (!(Number(l.amount) > 0)) return setCellErr({ row: i, col: 'amount', msg: '자료를 입력 바랍니다.' })
    }
    const body = {
      type: kind,
      voucherDate: date,
      method: 'CASH',
      description: memo.trim() || undefined,
      lines: used.map(({ l }) => ({
        accountId: Number(l.accountId),
        amount: Number(l.amount),
        description: l.description.trim() || undefined,
        cash: l.settle === '000' || undefined,
        bankAccountId: l.settle.startsWith('b') ? Number(l.settle.slice(1)) : undefined,
        employeeId: l.settle.startsWith('e') ? Number(l.settle.slice(1)) : undefined,
        settleAccountId: l.settle.startsWith('a') ? Number(l.settle.slice(1)) : undefined,
        employeeName: l.settle.startsWith('e') ? settleItems.find((x) => x.value === l.settle)?.name : undefined,
        partnerId: l.partnerId ? Number(l.partnerId) : undefined,
        vat: l.vat ? { vatType: l.vat.vatType, vatDate: l.vat.vatDate || undefined, partnerId: Number(l.vat.partnerId),
          supply: Number(l.vat.supply) || 0, vat: Number(l.vat.vat) || 0 } : undefined,
      })),
    }
    setSaving(true)
    try {
      const { data } = editing
        ? await api.put<FastVoucher>(`/vouchers/${editing.id}`, body)
        : await api.post<FastVoucher>('/vouchers', body)
      if (thenSlip && data.journalEntryId) {
        /* 원본 [저장/전표(F7)]: 저장한 전표를 '일반전표' 창으로 — 수정 창은 닫힌 채(창을 닫으면 목록). */
        const [{ data: je }, h] = await Promise.all([api.get<JournalEntry>(`/journals/${data.journalEntryId}`), loadSlipHeader()])
        if (!editing) reset()
        setSlip(journalSlipHtml([je], h.company, h.sign))
      } else if (editing) {
        navigate(back)
      } else {
        /* 원본은 저장하면 빈 입력 화면으로 돌아간다. */
        reset()
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!editing) return
    setConfirmDelete(false)
    try {
      await api.delete(`/vouchers/${editing.id}`)
      navigate(back)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const errAt = (row: number, col: CellErr['col']) => (cellErr && cellErr.row === row && cellErr.col === col ? cellErr.msg : null)

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save() }}>
      <EcSlipShell
        title={conf.title}
        formTabs={[{ id: 'main', label: conf.title }]} activeFormTab="main"
        actions={editing ? [
          { label: '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '저장/전표(F7)', onClick: () => void save(true), disabled: saving },
          { label: '삭제', onClick: () => setConfirmDelete(true) },
          { label: '리스트', onClick: () => navigate('/accounting/journals') },
        ] : [
          { label: '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '저장/전표(F7)', onClick: () => void save(true), disabled: saving },
          { label: '다시 작성', onClick: reset },
          { label: '리스트', onClick: () => navigate('/accounting/journals') },
        ]}>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

        <ul className="ec-form mb-[8px]">
          <EcCond label="일자" span={2}>
            <span className="inline-flex items-center gap-[6px]">
              <EcDateField value={date} onChange={setDate} disabled={!!editing} />
              {editing && <span className="text-ec-label">{editing.voucherNo}</span>}
            </span>
          </EcCond>
          <EcCond label="첨언내용" span={2}>
            <textarea className="ec-input w-full h-[37px] resize-y" placeholder="첨언내용" maxLength={200}
                      value={memo} onChange={(e) => setMemo(e.target.value)} />
          </EcCond>
        </ul>

        <SlipGridTools tools={conf.tools} />
        <div className="overflow-x-auto">
          {/* 원본 본문 줄 36.5 = 칸 안 입력(span.grid-input-data) 25.2 + 위아래 5.4 — 우리 입력칸 26 이 줄을 37.3 으로 밀었다.
              머리 33.8 = 9 + 7.2 + 줄높이 17.14(12px × 1.42857) — 우리 줄높이 18 이 34.7 로 만들었다. */}
          <table className="ec-grid-input no-ec table-fixed min-w-[1100px] [&_tbody_tr]:h-[36.5px] [&_td.pad]:p-[5.4px_2.7px] [&_tbody_input]:h-[var(--ec-grid-ctl-h)] [&_tbody_select]:h-[var(--ec-grid-ctl-h)] [&_tbody_button]:h-[var(--ec-grid-ctl-h)] [&_th]:leading-[1.42857] [&_tfoot_td]:leading-[1.42857]">
            <colgroup>
              <col className="w-[42px]" /><col className="w-[208px]" /><col className="w-[206px]" /><col className="w-[198px]" />
              <col className="w-[151px]" /><col className="w-[178px]" /><col className="w-[151px]" /><col className="w-[167px]" /><col />
              <col className="w-[60px]" />
            </colgroup>
            <thead>
              <tr>
                <th />
                <th>{conf.settleHead} 검색</th>
                <th>{conf.settleNameHead}</th>
                <th>{conf.accountHead}</th>
                <th>계정코드명</th>
                <th>{conf.partnerHead}</th>
                <th>거래처명</th>
                <th>금액</th>
                <th>적요명</th>
                <th>추가정보</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="pad text-center text-ec-hint">{i + 1}</td>
                  <td className="pad">
                    <GridCode {...conf.settlePicker} items={settleItems}
                              value={l.settle} onPick={(v) => pickSettle(i, v)} err={errAt(i, 'settle')} />
                  </td>
                  <td className="pad">{settleItems.find((x) => x.value === l.settle)?.name ?? ''}</td>
                  <td className="pad">
                    <GridCode title="계정검색" codeHead="계정코드" nameHead="계정명" items={accountItems}
                              value={l.accountId} onPick={(v) => setLine(i, { accountId: v })} err={errAt(i, 'account')} />
                  </td>
                  <td className="pad">{accountItems.find((x) => x.value === l.accountId)?.name ?? ''}</td>
                  <td className="pad">
                    <GridCode title="거래처검색" codeHead="거래처코드" nameHead="거래처명" items={partnerItems}
                              value={l.partnerId} onPick={(v) => setLine(i, { partnerId: v })} />
                  </td>
                  <td className="pad">{partnerItems.find((x) => x.value === l.partnerId)?.name ?? ''}</td>
                  <td className="pad relative">
                    {l.vat
                      ? <input className="ec-input w-full text-right border-transparent cursor-pointer" readOnly aria-label={`${i + 1}줄 금액`}
                               value={won(Number(l.amount) || 0)} onClick={() => setVatRow(i)} />
                      : <EcNumInput className={`ec-input w-full text-right border-transparent focus:border-ec-line-focus${errAt(i, 'amount') ? ' outline outline-1 outline-ec-danger' : ''}`}
                                aria-label={`${i + 1}줄 금액`} value={l.amount} onValue={(v) => setLine(i, { amount: v })} />}
                    {errAt(i, 'amount') && <ErrTip msg={errAt(i, 'amount')!} />}
                  </td>
                  <td className="pad">
                    <input className="ec-input w-full border-transparent focus:border-ec-line-focus" aria-label={`${i + 1}줄 적요명`} maxLength={200}
                           value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                  </td>
                  <td className="pad relative text-center">
                    <a href="#" role="button" aria-label={`${i + 1}줄 추가정보`}
                       className={l.vat ? 'inline-block rounded-[6px] px-[1.8px] py-[0.9px] text-[12px] leading-[13.2px] bg-[var(--ec-tag-warn)] text-[var(--ec-bg-panel)] no-underline' : 'text-ec-navy'}
                       onClick={(e) => {
                         e.preventDefault()
                         if (kind === 'DEPOSIT_REPORT') {
                           if (!l.settle) setCellErr({ row: i, col: 'extra', msg: '계좌번호를 먼저 선택 바랍니다.' })
                           return
                         }
                         setVatRow(i)
                       }}>{l.vat ? vatCellText(l.vat) : '입력'}</a>
                    {errAt(i, 'extra') && <ErrTip msg={errAt(i, 'extra')!} />}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7} />
                <td className="text-right">{won(total)}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </EcSlipShell>

      <VoucherVatModal open={vatRow != null} amount={vatRow != null ? Number(lines[vatRow]?.amount) || 0 : 0} date={date}
                       value={vatRow != null ? lines[vatRow]?.vat ?? null : null} partners={partnerItems}
                       onApply={(v) => { if (vatRow != null) setLine(vatRow, { vat: v, amount: String((Number(v.supply) || 0) + (Number(v.vat) || 0)) }); setVatRow(null) }}
                       onRemove={() => { if (vatRow != null) setLine(vatRow, { vat: null }); setVatRow(null) }}
                       onClose={() => setVatRow(null)} />
      <SlipPrintModal title="일반전표" html={slip} onClose={() => { setSlip(null); if (editing) navigate(back) }} />

      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?<br />- {conf.title}</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void remove()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </form>
  )
}

/** 원본처럼 칸 위에 뜨는 말풍선 — '계정코드를 입력 바랍니다.' */
function ErrTip({ msg }: { msg: string }) {
  return (
    <span className="absolute left-1/2 -translate-x-1/2 bottom-full z-10 whitespace-nowrap rounded-ec bg-white px-[9px] py-[5px] text-[12px] text-ec-text shadow-[var(--ec-shadow-pop)] border border-ec-line">
      {msg}
    </span>
  )
}

/**
 * 격자 코드칸 — 원본 '…검색' 열. 코드를 쳐서 Enter 하면 코드 · 이름에 걸리는 것이 한 건일 때 바로 고르고,
 * 여러 건 · 없음이면 그 글자로 검색 창을 연다(원본 계좌검색에 '000' → 00003 · 00001 · 00002 · 000 네 건이라 창).
 * F2 · 빈 칸 Enter 도 창을 연다. 이름은 옆 열이 그린다.
 */
function GridCode({ title, codeHead, nameHead, items, value, onPick, err }: {
  title: string; codeHead: string; nameHead: string; items: CodeItem[]
  value: string; onPick: (v: string) => void; err?: string | null
}) {
  const selected = items.find((x) => x.value === value) ?? null
  const [typed, setTyped] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? items.filter((x) => `${x.code ?? ''} ${x.name}`.toLowerCase().includes(n)) : items
  }, [items, q])

  function submit() {
    const n = (typed ?? '').trim()
    setTyped(null)
    if (!n) { setQ(''); setOpen(true); return }
    const hits = items.filter((x) => `${x.code ?? ''} ${x.name}`.toLowerCase().includes(n.toLowerCase()))
    if (hits.length === 1) { onPick(hits[0].value); return }
    setQ(n)
    setOpen(true)
  }

  return (
    <span className="relative block">
      <input className={`ec-input w-full border-transparent focus:border-ec-line-focus${err ? ' outline outline-1 outline-ec-danger' : ''}`} aria-label={title}
             value={typed ?? selected?.code ?? ''}
             onChange={(e) => { setTyped(e.target.value); if (!e.target.value) onPick('') }}
             onKeyDown={(e) => {
               if (e.key === 'Enter') { e.preventDefault(); submit() }
               if (e.key === 'F2') { e.preventDefault(); setQ(''); setOpen(true) }
             }}
             onBlur={() => setTyped(null)} />
      {err && <ErrTip msg={err} />}
      <Modal open={open} title={title} width={760} error={null} onClose={() => setOpen(false)}>
        <div className="flex justify-end gap-[5px] mb-[8px]">
          <input className="ec-input w-[180px]" autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label={`${title} 검색어`} />
        </div>
        <table className="w-full">
          <thead><tr><th>{codeHead}</th><th>{nameHead}</th></tr></thead>
          <tbody>
            {shown.length === 0
              ? <tr><td colSpan={2} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              : shown.map((x) => (
                <tr key={x.value} className="cursor-pointer" onClick={() => { onPick(x.value); setOpen(false) }}>
                  <td className="text-ec-navy">{x.code}</td>
                  <td className="text-ec-navy">{x.name}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="mt-[8px]"><button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button></div>
      </Modal>
    </span>
  )
}
