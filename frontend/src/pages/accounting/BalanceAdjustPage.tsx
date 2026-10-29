import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcNumInput from '../../components/EcNumInput'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { ecAlert } from '../../components/EcDialog'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { useCondPickers } from '../../utils/useCondPickers'
import {
  ACCOUNT_KINDS, fetchAccounts, fetchAudit, saveAdjustment, saveAggregation, slashDate, won,
  type AccountBalanceRow, type AuditResponse,
} from '../../features/balanceadjust/api'

const PICKS = ['금일', '전일', '말일', '전월', '직전기수'] as const

/** 실사 창의 한 줄(화면 상태). 빈 줄은 거래처(거래처별) · 부서 · 프로젝트를 골라 새 묶음을 넣는다. */
interface AuditLine {
  partnerId: string; partnerCode: string; partnerName: string
  departmentId: string; projectId: string; book: number; actual: number | null; memo: string; existing: boolean
}
const blankLine = (): AuditLine => ({ partnerId: '', partnerCode: '', partnerName: '', departmentId: '', projectId: '', book: 0, actual: null, memo: '', existing: false })
/** 빈 줄을 늘 몇 줄 남겨 둔다 — 원본 잔액실사(거래처별)는 빈 줄에 거래처를 골라 더한다. */
const BLANKS = 3
const withBlanks = (ls: AuditLine[]) => {
  const out = [...ls]
  let tail = 0
  for (let i = out.length - 1; i >= 0 && !out[i].existing && !out[i].partnerId && !out[i].departmentId && !out[i].projectId && out[i].actual == null; i--) tail++
  while (tail++ < BLANKS) out.push(blankLine())
  return out
}

/**
 * 회계 I › FastEntry › <b>잔액조정입력</b>(E010209) — 2026-10-14 loginaa 실측(plans/회계1/E010209.md).
 *
 * <p>조건(펼쳐 둠): 기준일자(기본 전월 말일 — 10/14 에 2026/09/30) · 계정종류(전체 ☑ 자산 · 부채 · 자본 · 손익 · 원가1~3 · 없음) ·
 * 부서 · 프로젝트 · 계정 · 기타 ☑잔액0포함, 빠른선택 금일 · 전일 · 말일 · 전월 · 직전기수.
 * 격자: 계정 · 계정명 · 거래처별집계구분 · 차변금액 · 대변금액 · 진행단계([조정]), 합계줄 빨간 굵은 글자.
 * 차변 쪽 계정(자산 · 비용)은 잔액을 차변금액에, 나머지는 대변금액에 둔다(외상매출금 −1,143,134,300 도 차변금액 칸).
 *
 * <p>[조정] → '잔액실사(계정별)' 창: 기준일자 · 계정 / 부서 · 프로젝트 · 장부잔액 · 실잔액 · 조정금액 · 적요코드 · 적요명,
 * 실잔액을 고치면 칸이 분홍이 되고 조정금액 = 장부잔액 − 실잔액(6,620,000 → 6,631,000 이면 −11,000).
 * ☑잔액조정 · ☐실잔액을 변경하지 않은 내역의 잔액을 0으로 조정 · [저장(F8)] · [닫기]. 아무것도 안 고치고 저장하면 '변경된정보가 없습니다.'
 * 저장하면 안내 없이 창이 닫히고 그 계정의 잔액이 실잔액 합이 된다(한쪽 전표 — 차변 11,000 · 대변 없음).
 * 그 뒤 진행단계는 [수정] · [추가] · [조회].
 *
 * <p>2026-10-29 데이터이관 QA 루프 73 실측(기준 2026/09/30): 격자 '거래처별집계구분' 은 계정 설정 글자(현금 · 상품은 '계정별',
 * 1089 외상매출금은 '거래처별/부서별/프로젝트별')이고 누르면 '거래처별집계구분' 창(○없음 ◉거래처별 · ☑부서별집계 · ☑프로젝트별집계,
 * [저장] [닫기])이 뜬다 — 계정등록의 [거래처별집계구분]과 같은 값이다(accounts.partner_aggregate · aggregate_by_dept · aggregate_by_project).
 * 거래처별 계정의 [조정] → <b>'잔액실사(거래처별)'</b> 창: 기준일자 · 계정 [1089] 외상매출금 / 격자 ☐ · 거래처코드 · 거래처명 · 부서 · 프로젝트 ·
 * 장부잔액 · 실잔액(입력) · 조정금액 · 적요코드 · 적요명, 빈 줄에 거래처를 골라 더하고 합계줄 / ☑잔액조정 ·
 * ☐실잔액을 등록하지 않은 내역의 잔액을 0으로 조정 · [저장(F8)] · [웹자료올리기] · [닫기]. 9/30 1089 줄: 구로조명유통 −25,485,000 ·
 * 빛나오토파츠 −8,287,400 · 의료기기판매점 −6,844,000 · 이카건설 −5,366,900 · 좋은컴퓨터 −125,290,000 · 휴대폰매장아울렛 −37,400,000.
 * 저장하면 기준일자로 거래처마다 조정 줄(줄 거래처 = 그 거래처)이 든 잔액조정 전표 한 장 — 거래처별채권 · 채권채무현황이 그 줄을 읽는다.
 * 장부잔액이 0 인 거래처는 줄로 안 나온다(빈 줄로 더한다 — 원본이 0 인 거래처를 늘어놓는지는 못 쟀다).
 *
 * <p>없는 것: 적요코드(적요 마스터 없음) · [웹자료올리기] · 하단 [변경](못 잼) · 실사 창 ☐ 체크칸(모양만 — 무엇을 하는지 못 쟀다).
 */
export default function BalanceAdjustPage() {
  const navigate = useNavigate()
  const { departments, projects } = useDeptProjectItems()
  const pickers = useCondPickers(['partners'])
  const [aggFor, setAggFor] = useState<AccountBalanceRow | null>(null)
  const [aggForm, setAggForm] = useState({ byPartner: false, byDept: true, byProject: true })
  const [aggError, setAggError] = useState('')
  const [asOf, setAsOf] = useState(periodOf('전월')!.to)
  const [kinds, setKinds] = useState<Set<string>>(new Set(ACCOUNT_KINDS.map((k) => k.key)))
  const [dept, setDept] = useState('')
  const [proj, setProj] = useState('')
  const [account, setAccount] = useState('')
  const [withZero, setWithZero] = useState(true)
  const [rows, setRows] = useState<AccountBalanceRow[] | null>(null)
  const [shownAsOf, setShownAsOf] = useState(asOf)
  const [error, setError] = useState('')

  const [audit, setAudit] = useState<AuditResponse | null>(null)
  const [editEntry, setEditEntry] = useState<number | null>(null)
  const [lines, setLines] = useState<AuditLine[]>([])
  const [zeroUnchanged, setZeroUnchanged] = useState(false)
  const [doAdjust, setDoAdjust] = useState(true)
  const [auditError, setAuditError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setError('')
    try {
      setRows(await fetchAccounts(asOf, Number(dept) || 0, Number(proj) || 0))
      setShownAsOf(asOf)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const accountItems = useMemo(() => (rows ?? []).map((r) => ({ value: String(r.accountId), code: r.code, name: r.name })), [rows])
  const divisions = useMemo(() => new Set(ACCOUNT_KINDS.filter((k) => kinds.has(k.key)).flatMap((k) => k.divisions)), [kinds])
  const shown = (rows ?? [])
    .filter((r) => divisions.has(r.division))
    .filter((r) => !account || String(r.accountId) === account)
    .filter((r) => withZero || Number(r.debitAmount) !== 0 || Number(r.creditAmount) !== 0)
  const sumDebit = shown.reduce((s, r) => s + Number(r.debitAmount), 0)
  const sumCredit = shown.reduce((s, r) => s + Number(r.creditAmount), 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '잔액조정입력', [shown.length])

  const allKinds = kinds.size === ACCOUNT_KINDS.length
  const toggleKind = (key: string, on: boolean) => setKinds((s) => { const n = new Set(s); if (on) n.add(key); else n.delete(key); return n })

  async function openAudit(r: AccountBalanceRow, entryId?: number) {
    setAuditError('')
    try {
      const a = await fetchAudit(shownAsOf, r.accountId, entryId)
      const ls: AuditLine[] = a.rows.map((g) => ({
        partnerId: g.partnerId == null ? '' : String(g.partnerId), partnerCode: g.partnerCode ?? '', partnerName: g.partnerName ?? '',
        departmentId: g.departmentId == null ? '' : String(g.departmentId), projectId: g.projectId == null ? '' : String(g.projectId),
        book: Number(g.bookAmount), actual: Number(g.actualAmount), memo: g.memo ?? '', existing: true,
      }))
      if (!a.byPartner) while (ls.length < 4) ls.push(blankLine())
      setLines(a.byPartner ? withBlanks(ls) : ls)
      setEditEntry(entryId ?? null)
      setZeroUnchanged(false)
      setAudit(a)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const changed = (l: AuditLine) => l.actual != null && l.actual !== l.book
  const setLine = (i: number, patch: Partial<AuditLine>) => setLines((ls) => {
    const next = ls.map((l, k) => (k === i ? { ...l, ...patch } : l))
    return audit?.byPartner ? withBlanks(next) : next
  })

  function openAgg(r: AccountBalanceRow) {
    setAggError('')
    setAggForm({ byPartner: r.byPartner, byDept: r.byDept, byProject: r.byProject })
    setAggFor(r)
  }
  async function saveAgg() {
    if (!aggFor) return
    try {
      await saveAggregation(aggFor.accountId, aggForm)
      setAggFor(null)
      await load()
    } catch (e) {
      setAggError(extractErrorMessage(e))
    }
  }

  async function save() {
    if (!audit || saving) return
    const send = lines.filter((l) => (l.existing ? changed(l) || (editEntry != null && l.actual != null) : l.actual != null && l.actual !== 0))
    if (send.length === 0 && !zeroUnchanged) { await ecAlert('변경된정보가 없습니다.'); return }
    if (audit.byPartner && send.some((l) => !l.existing && !l.partnerId)) { await ecAlert('거래처코드를 입력 바랍니다.'); return }
    setSaving(true)
    setAuditError('')
    try {
      await saveAdjustment({
        asOf: audit.asOf, accountId: audit.accountId, zeroUnchanged, replaceEntryId: editEntry,
        rows: send.map((l) => ({
          partnerId: l.partnerId ? Number(l.partnerId) : null,
          departmentId: l.departmentId ? Number(l.departmentId) : null, projectId: l.projectId ? Number(l.projectId) : null,
          actualAmount: l.actual, memo: l.memo || null,
        })),
      })
      setAudit(null)
      await load()
    } catch (e) {
      const msg = extractErrorMessage(e)
      if (msg === '변경된정보가 없습니다.') await ecAlert(msg)
      else setAuditError(msg)
    } finally {
      setSaving(false)
    }
  }

  const nameOf = (items: { value: string; name: string }[], v: string) => items.find((x) => x.value === v)?.name ?? ''
  const auditBook = lines.reduce((s, l) => s + l.book, 0)
  const auditActual = lines.reduce((s, l) => s + (l.actual ?? l.book), 0)

  return (
    <EcListShell title="잔액조정입력" searchable={false} actions={[{ label: '변경', primary: true, disabled: true }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" aria-label="기준일자" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </EcCond>
        <EcCond label="계정종류" span={2}>
          <label className="mr-[10px]"><input type="checkbox" checked={allKinds} onChange={(e) => setKinds(e.target.checked ? new Set(ACCOUNT_KINDS.map((k) => k.key)) : new Set())} /> 전체</label>
          {ACCOUNT_KINDS.map((k) => (
            <label key={k.key} className="mr-[10px]"><input type="checkbox" checked={kinds.has(k.key)} onChange={(e) => toggleKind(k.key, e.target.checked)} /> {k.label}</label>
          ))}
        </EcCond>
        <EcCond label="부서" pick><CodePickerField label="부서" hideLabel width={220} value={dept} onChange={setDept} items={departments} /></EcCond>
        <EcCond label="프로젝트" pick><CodePickerField label="프로젝트" hideLabel width={220} value={proj} onChange={setProj} items={projects} /></EcCond>
        <EcCond label="계정" pick><CodePickerField label="계정" hideLabel width={220} value={account} onChange={setAccount} items={accountItems} /></EcCond>
        <EcCond label="기타">
          <label><input type="checkbox" checked={withZero} onChange={(e) => setWithZero(e.target.checked)} /> 잔액0포함</label>
        </EcCond>
        <li className="full">
          <div className="form">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void load()}>검색(F8)</button>
            <span className="ml-[6px]"><EcPeriodPicks labels={PICKS} currentFrom={asOf} onPick={(r) => setAsOf(r.to)} /></span>
          </div>
        </li>
      </ul>

      {rows && (
        <>
          <div className="text-right mb-[4px]">{slashDate(shownAsOf)}</div>
          <table ref={tableRef} className="w-full text-left">
            <thead>
              <tr>
                <th className="w-[38px]" />
                <th>계정</th>
                <th>계정명</th>
                <th>거래처별집계구분</th>
                <th className="text-right">차변금액</th>
                <th className="text-right">대변금액</th>
                <th className="text-center">진행단계</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((r, i) => (
                <tr key={r.accountId}>
                  <td className="text-center">{i + 1}</td>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td><button type="button" className="ec-link" onClick={() => openAgg(r)}>{r.aggregation}</button></td>
                  <td className="text-right">{won(r.debitAmount)}</td>
                  <td className="text-right">{won(r.creditAmount)}</td>
                  <td className="text-center">
                    {r.adjustmentIds.length === 0 ? (
                      <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openAudit(r)}>조정</button>
                    ) : (
                      <>
                        <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openAudit(r, r.adjustmentIds[0])}>수정</button>{' '}
                        <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openAudit(r)}>추가</button>{' '}
                        <button type="button" className="ec-btn ec-btn-sm" onClick={() => navigate('/accounting/balance-audits')}>조회</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr className="ec-list-total">
                  <td colSpan={2} />
                  <td className="text-center font-bold">합계</td>
                  <td />
                  <td className="text-right font-bold text-ec-danger">{won(sumDebit)}</td>
                  <td className="text-right font-bold text-ec-danger">{won(sumCredit)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </>
      )}

      <Modal open={aggFor != null} title="거래처별집계구분" width={420} error={aggError} onClose={() => setAggFor(null)}>
        {aggFor && (
          <>
            <ul className="ec-form mb-[8px]">
              <li><span className="title">계정</span><div className="form">[{aggFor.code}] {aggFor.name}</div></li>
              <li><span className="title">거래처별집계구분</span>
                <div className="form flex items-center gap-[12px]">
                  <label><input type="radio" name="agg-partner" checked={!aggForm.byPartner} onChange={() => setAggForm({ ...aggForm, byPartner: false })} /> 없음</label>
                  <label><input type="radio" name="agg-partner" checked={aggForm.byPartner} onChange={() => setAggForm({ ...aggForm, byPartner: true })} /> 거래처별</label>
                </div></li>
              <li><span className="title" />
                <div className="form flex items-center gap-[12px]">
                  <label><input type="checkbox" disabled={!aggForm.byPartner} checked={aggForm.byDept} onChange={(e) => setAggForm({ ...aggForm, byDept: e.target.checked })} /> 부서별집계</label>
                  <label><input type="checkbox" disabled={!aggForm.byPartner} checked={aggForm.byProject} onChange={(e) => setAggForm({ ...aggForm, byProject: e.target.checked })} /> 프로젝트별집계</label>
                </div></li>
            </ul>
            <div className="flex gap-[4px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveAgg()}>저장</button>
              <button type="button" className="ec-btn" onClick={() => setAggFor(null)}>닫기</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={audit != null} title={audit?.byPartner ? '잔액실사(거래처별)' : '잔액실사(계정별)'} width={audit?.byPartner ? 1040 : 820}
             error={auditError} onClose={() => setAudit(null)}>
        {audit && (
          <>
            <ul className="ec-cond mb-[8px]">
              <EcCond label="기준일자"><span>{slashDate(audit.asOf)}</span></EcCond>
              <EcCond label="계정"><span>[{audit.accountCode}] {audit.accountName}</span></EcCond>
            </ul>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="w-[30px]">{audit.byPartner && <input type="checkbox" aria-label="전체 선택" />}</th>
                  {audit.byPartner && <><th>거래처코드</th><th>거래처명</th></>}
                  <th>부서</th>
                  <th>프로젝트</th>
                  <th className="text-right">장부잔액</th>
                  <th className="text-right">실잔액</th>
                  <th className="text-right">조정금액</th>
                  <th>적요코드</th>
                  <th>적요명</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="text-center">{audit.byPartner ? <input type="checkbox" aria-label={`${i + 1} 선택`} /> : i + 1}</td>
                    {audit.byPartner && (l.existing ? (
                      <><td>{l.partnerCode}</td><td>{l.partnerName}</td></>
                    ) : (
                      <>
                        <td>
                          <CodePickerField label="거래처" hideLabel fill showCode emptyLabel="" value={l.partnerId} items={pickers.partners}
                                           onChange={(v, it) => setLine(i, { partnerId: v, partnerCode: it?.code ?? '', partnerName: it?.name ?? '' })} />
                        </td>
                        <td>{l.partnerName}</td>
                      </>
                    ))}
                    <td>
                      {l.existing || (audit.byPartner && !audit.byDept) ? nameOf(departments, l.departmentId)
                        : <CodePickerField label="부서" hideLabel width={130} value={l.departmentId} onChange={(v) => setLine(i, { departmentId: v })} items={departments} />}
                    </td>
                    <td>
                      {l.existing || (audit.byPartner && !audit.byProject) ? nameOf(projects, l.projectId)
                        : <CodePickerField label="프로젝트" hideLabel width={130} value={l.projectId} onChange={(v) => setLine(i, { projectId: v })} items={projects} />}
                    </td>
                    <td className="text-right">{l.existing ? won(l.book) : ''}</td>
                    <td className={`text-right ${changed(l) ? 'bg-ec-danger-bg' : ''}`}>
                      <EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1} 실잔액`} value={l.actual == null ? '' : String(l.actual)}
                                  onValue={(v) => setLine(i, { actual: v === '' || v === '-' ? null : Number(v) })} />
                    </td>
                    <td className="text-right">{won(l.book - (l.actual ?? l.book))}</td>
                    <td />
                    <td><input className="ec-input w-full" aria-label={`${i + 1} 적요명`} value={l.memo} onChange={(e) => setLine(i, { memo: e.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="ec-list-total font-bold">
                  <td colSpan={audit.byPartner ? 5 : 3} />
                  <td className="text-right">{won(auditBook)}</td>
                  <td className="text-right">{won(auditActual)}</td>
                  <td className="text-right">{won(auditBook - auditActual)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
            <div className="mt-[10px]">
              {/* ☑잔액조정 — 끄면 무엇이 달라지는지는 원본에서 못 쟀다(늘 켠 채로 저장). */}
              <label className="mr-[12px]"><input type="checkbox" checked={doAdjust} onChange={(e) => setDoAdjust(e.target.checked)} /> 잔액조정</label>
              <label><input type="checkbox" checked={zeroUnchanged} onChange={(e) => setZeroUnchanged(e.target.checked)} />{' '}
                {audit.byPartner ? '실잔액을 등록하지 않은 내역의 잔액을 0으로 조정' : '실잔액을 변경하지 않은 내역의 잔액을 0으로 조정'}</label>
            </div>
            <div className="mt-[8px] flex gap-[4px]">
              <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={() => void save()}>저장(F8)</button>
              <button type="button" className="ec-btn" onClick={() => setAudit(null)}>닫기</button>
            </div>
          </>
        )}
      </Modal>
    </EcListShell>
  )
}
