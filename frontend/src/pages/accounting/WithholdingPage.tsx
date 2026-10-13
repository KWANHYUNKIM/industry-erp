import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { WithholdingReceipt, WithholdingReturn, WithholdingStatement } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'

const won = (n: number) => n.toLocaleString('ko-KR')

/**
 * 원천징수이행상황신고서 (원본 세무 › 원천징수 › 세무신고 E030101, 2026-10-03 loginaa 실측).
 *
 * 원본은 귀속월을 골라 그때그때 세는 화면이 <b>아니다</b>. [신규(F2)]로 신고서를 만들어 두고
 * 목록(귀속연월 · 신고구분(연말정산) · 지급연월 · 신고일자 · 회사명 · 사업자등록번호 · 신고서 …)에서 연다.
 * 우리는 귀속월 칸 + 타일 + 사원 표였다. 금액은 저장하지 않고 [조회] 때마다 확정 급여명세 · 일용근로 ·
 * 기타원천세에서 센다(원본도 급여대장을 고치면 [새로불러오기]로 다시 읽는다).
 *
 * 메뉴 [근로소득원천징수영수증]은 ?tab=영수증 으로 이 파일의 아래 화면을 연다(원본 세무신고 묶음에는 없는 우리 화면).
 */
export default function WithholdingPage() {
  const [params] = useSearchParams()
  return params.get('tab') === '영수증' ? <ReceiptsView /> : <ReturnsView />
}

type FormState = {
  id?: number
  filingType: 'REGULAR' | 'LATE'
  filingMethod: 'MONTHLY' | 'HALF'
  attributionMonth: string
  payMonth: string
  reportDate: string
  includeYearEnd: boolean
  /** 원본 [소득자료반영기준] ◉신고기간 ○직접지정 */
  directIncome: boolean
  /** 직접지정의 [급여대장] 에서 고른 대장 */
  payLedgerIds: number[]
  /**
   * 원본 [전월미환급세액] ◉직전 신고서 ○직접지정 · 직접지정의 '원천세신고서검색' 에서 고른 신고서.
   * 화면만 맞췄다 — 우리 신고서는 환급세액을 세지 않아 저장하지 않는다(창의 차월이월환급세액 · 환급신청액이 늘 0).
   */
  prevRefundDirect: boolean
  prevRefundReturnId: number | null
}

/** 목록 한 줄 + 소득자료반영기준(서버 응답에 있다). */
type ReturnRow = WithholdingReturn & { directIncome: boolean; payLedgerIds: number[] }
/** 원본 '급여대장검색' 한 줄 — 신고대상금액은 급여대장금액에서 제출제외 비과세(차량유지비)만 뺀 것. */
interface LedgerPick { id: number; code: string; payMonth: string; kind: string; name: string; headcount: number; ledgerAmount: number; reportAmount: number }
/** 원본 '간이소득내역' 한 줄. */
interface SimpleIncomeRow {
  employeeCode: string; employeeName: string; hireDate: string | null; resignDate: string | null
  ledgerAmount: number; excludedNonTaxable: number; submittedNonTaxable: number; submitAmount: number; incomeTax: number
}

/** 신고일자 기본값 — 원본은 지급연월 다음 달 10일(지급 2026/10 → 2026/11/10, 2026/09 로 바꾸면 2026/10/10). */
function reportDateFor(payMonth: string) {
  const [y, m] = payMonth.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, '0')}-10`
}

/** 원본 [신규] 창의 기본값 — 귀속 · 지급연월은 이번 달, 신고일자는 다음 달 10일. */
function blankForm(): FormState {
  const today = ymd(new Date())
  return {
    filingType: 'REGULAR', filingMethod: 'MONTHLY',
    attributionMonth: today.slice(0, 7), payMonth: today.slice(0, 7),
    reportDate: reportDateFor(today.slice(0, 7)), includeYearEnd: false,
    directIncome: false, payLedgerIds: [], prevRefundDirect: false, prevRefundReturnId: null,
  }
}

function ReturnsView() {
  const [rows, setRows] = useState<ReturnRow[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [formError, setFormError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [viewing, setViewing] = useState<WithholdingReturn | null>(null)
  /** 원본 [영수증] 소득세 · 지방소득세 · [이력] 창 */
  const [receipt, setReceipt] = useState<{ ret: WithholdingReturn; kind: 'income' | 'local' } | null>(null)
  const [historyOf, setHistoryOf] = useState<WithholdingReturn | null>(null)

  function load() {
    setError('')
    api.get<ReturnRow[]>('/withholding/returns')
      .then((r) => { setRows(r.data); setPicked(new Set()) })
      .catch((e) => { setRows([]); setError(extractErrorMessage(e)) })
  }
  useEffect(load, [])

  async function save() {
    if (!form) return
    setFormError('')
    const body = {
      filingType: form.filingType, filingMethod: form.filingMethod,
      attributionMonth: form.attributionMonth, payMonth: form.payMonth,
      reportDate: form.reportDate, includeYearEnd: form.includeYearEnd,
      directIncome: form.directIncome, payLedgerIds: form.directIncome ? form.payLedgerIds : [],
    }
    try {
      if (form.id) await api.put(`/withholding/returns/${form.id}`, body)
      else await api.post('/withholding/returns', body)
      setForm(null)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  function askDelete() {
    if (picked.size === 0) {
      setError('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.')
      return
    }
    setError('')
    setConfirmDelete(true)
  }

  async function doDelete() {
    setConfirmDelete(false)
    try {
      await api.post('/withholding/returns/delete', [...picked])
      load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const allPicked = rows.length > 0 && picked.size === rows.length
  const company = rows[0]
  const years = rows.map((r) => Number(r.attributionMonth.slice(0, 4)))

  return (
    <EcListShell
      title="원천징수이행상황신고서"
      onNew={() => { setFormError(''); setForm(blankForm()) }}
      actions={[{ label: '선택삭제', onClick: askDelete, disabled: picked.size === 0 }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {company && (
        <p className="text-right text-[12px] mb-[6px]">
          회사명 : {company.companyName ?? ''} / 귀속연도 : {Math.min(...years)}년도 ~ {Math.max(...years)}년도
        </p>
      )}

      <table className="w-full text-center">
        <thead>
          <tr>
            <th className="w-[47px]">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} />
            </th>
            <th>귀속연월</th>
            <th>신고구분<br />(연말정산)</th>
            <th>지급연월</th>
            <th>신고일자</th>
            <th>회사명</th>
            <th>사업자등록번호</th>
            <th>신고서</th>
            <th colSpan={2}>영수증</th>
            <th>이력</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">
                <input type="checkbox" aria-label={`${r.attributionMonth} 선택`} checked={picked.has(r.id)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                {' '}{i + 1}
              </td>
              <td>
                <a href="#" onClick={(e) => {
                  e.preventDefault(); setFormError('')
                  setForm({
                    id: r.id, filingType: r.filingType, filingMethod: r.filingMethod,
                    attributionMonth: r.attributionMonth, payMonth: r.payMonth,
                    reportDate: r.reportDate, includeYearEnd: r.includeYearEnd,
                    directIncome: r.directIncome, payLedgerIds: r.payLedgerIds ?? [],
                    prevRefundDirect: false, prevRefundReturnId: null,
                  })
                }}>{r.attributionMonth.replace('-', '/')}</a>
              </td>
              <td>{r.filingMethodName}{r.includeYearEnd ? '(연말정산)' : ''}</td>
              <td>{r.payMonth.replace('-', '/')}</td>
              <td>{r.reportDate.replace(/-/g, '.')}</td>
              <td>{r.companyName ?? ''}</td>
              <td>{r.bizRegNo ?? ''}</td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); setViewing(r) }}>조회</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); setReceipt({ ret: r, kind: 'income' }) }}>소득세</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); setReceipt({ ret: r, kind: 'local' }) }}>지방소득세</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); setHistoryOf(r) }}>이력</a></td>
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <Modal open error={formError} title="원천징수이행상황신고서" onClose={() => setForm(null)} width={780}>
          <ReturnForm form={form} onChange={setForm} returns={rows} />
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
            <button className="ec-btn" onClick={() => setForm(null)}>닫기</button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal open error={error} title="알림" onClose={() => setConfirmDelete(false)} width={420}>
          <p className="text-[12px] mb-[12px]">삭제한 데이터는 복구되지 않습니다.<br />삭제하겠습니까?</p>
          <div className="flex gap-[6px]">
            <button className="ec-btn ec-btn-primary" onClick={doDelete}>확인</button>
            <button className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
          </div>
        </Modal>
      )}

      {viewing && <StatementModal ret={viewing} onClose={() => setViewing(null)} />}
      {receipt?.kind === 'income' && <IncomeTaxReceiptModal ret={receipt.ret} onClose={() => setReceipt(null)} />}
      {receipt?.kind === 'local' && <LocalTaxReceiptModal ret={receipt.ret} onClose={() => setReceipt(null)} />}
      {historyOf && <ReturnHistoryModal ret={historyOf} onClose={() => setHistoryOf(null)} />}
    </EcListShell>
  )
}

/** 원본 [신규] · 귀속연월 눌러 고치기 창. 고칠 때는 신고방법 · 귀속연월 · 지급연월 · 연말정산포함이 막힌다. */
function ReturnForm({ form, onChange, returns }: { form: FormState; onChange: (f: FormState) => void; returns: ReturnRow[] }) {
  const locked = Boolean(form.id)
  const set = (patch: Partial<FormState>) => onChange({ ...form, ...patch })
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  /** 고른 대장의 이름표(2026/10-1[급여]) — 지급연월을 바꿔 목록에서 빠져도 원본처럼 칸에 남는다. */
  const [ledgerLabels, setLedgerLabels] = useState<Record<number, string>>({})
  useEffect(() => {
    if (!form.directIncome || form.payLedgerIds.every((id) => ledgerLabels[id])) return
    // 고치기 창을 열면 저장된 대장의 지급연월을 모른다 — 대장 목록에서 차수를 세어 이름표를 만든다.
    api.get<{ id: number; payMonth: string }[]>('/pay-ledgers').then((r) => {
      const seq: Record<string, number> = {}
      const next: Record<number, string> = {}
      ;[...r.data].sort((a, b) => a.id - b.id).forEach((l) => {
        seq[l.payMonth] = (seq[l.payMonth] ?? 0) + 1
        next[l.id] = `${l.payMonth.replace('-', '/')}-${seq[l.payMonth]}[급여]`
      })
      setLedgerLabels((cur) => ({ ...next, ...cur }))
    }).catch(() => undefined)
  }, [form.directIncome, form.payLedgerIds, ledgerLabels])
  const refundReturn = returns.find((r) => r.id === form.prevRefundReturnId)
  return (
    <ul className="ec-form">
      <li className="wide">
        <div className="title">신고구분</div>
        <div className="form">
          {([['REGULAR', '정기신고'], ['LATE', '기한후신고']] as const).map(([v, l]) => (
            <label key={v} className="mr-[10px]">
              <input type="radio" name="wh-type" checked={form.filingType === v} onChange={() => set({ filingType: v })} /> {l}
            </label>
          ))}
        </div>
      </li>
      <li className="wide">
        <div className="title">신고방법</div>
        <div className="form">
          {([['MONTHLY', '매월'], ['HALF', '반기']] as const).map(([v, l]) => (
            <label key={v} className="mr-[10px]">
              <input type="radio" name="wh-method" disabled={locked} checked={form.filingMethod === v}
                     onChange={() => set({ filingMethod: v })} /> {l}
            </label>
          ))}
        </div>
      </li>
      <li className="wide">
        <div className="title">귀속연월</div>
        <div className="form">
          <input type="month" className="ec-input w-[150px]" disabled={locked} value={form.attributionMonth}
                 onChange={(e) => set({ attributionMonth: e.target.value })} />
        </div>
      </li>
      <li className="wide">
        <div className="title">지급연월</div>
        <div className="form">
          <input type="month" className="ec-input w-[150px]" disabled={locked} value={form.payMonth}
                 onChange={(e) => set({ payMonth: e.target.value, ...(e.target.value ? { reportDate: reportDateFor(e.target.value) } : {}) })} />
        </div>
      </li>
      <li className="wide">
        <div className="title">신고일자</div>
        <div className="form">
          <input type="date" className="ec-input w-[150px]" value={form.reportDate}
                 onChange={(e) => set({ reportDate: e.target.value })} />
        </div>
      </li>
      <li className="wide">
        <div className="title">소득자료반영기준</div>
        <div className="form">
          {([[false, '신고기간'], [true, '직접지정']] as const).map(([v, l]) => (
            <label key={l} className="mr-[10px]">
              <input type="radio" name="wh-basis" checked={form.directIncome === v}
                     onChange={() => set({ directIncome: v, payLedgerIds: v ? form.payLedgerIds : [] })} /> {l}
            </label>
          ))}
          {form.directIncome && (
            /* 원본 직접지정의 첫 칸 [급여대장] — 돋보기를 누르면 '급여대장검색'(신고서 지급연월의 대장, 여러 개 골라 적용). */
            <div className="flex items-center gap-[6px] mt-[6px]">
              <span className="text-ec-label w-[70px]">급여대장</span>
              <input className="ec-input ec-pick-input flex-1 min-w-0 cursor-pointer" readOnly placeholder="급여대장"
                     value={form.payLedgerIds.map((id) => ledgerLabels[id] ?? `#${id}`).join(', ')}
                     onClick={() => setLedgerOpen(true)} />
              <button type="button" className="ec-btn" title="급여대장검색" onClick={() => setLedgerOpen(true)}>🔍</button>
              {form.payLedgerIds.length > 0 && (
                <button type="button" className="ec-btn text-ec-danger" title="선택 해제" onClick={() => set({ payLedgerIds: [] })}>×</button>
              )}
            </div>
          )}
        </div>
      </li>
      <li className="wide">
        <div className="title">전월미환급세액</div>
        <div className="form">
          {([[false, '직전 신고서'], [true, '직접지정']] as const).map(([v, l]) => (
            <label key={l} className="mr-[10px]">
              <input type="radio" name="wh-refund" checked={form.prevRefundDirect === v}
                     onChange={() => set({ prevRefundDirect: v, prevRefundReturnId: v ? form.prevRefundReturnId : null })} /> {l}
            </label>
          ))}
          {form.prevRefundDirect && (
            <div className="flex items-center gap-[6px] mt-[6px]">
              <span className="text-ec-label w-[110px]">신고서(귀속 - 지급)</span>
              <input className="ec-input ec-pick-input flex-1 min-w-0 cursor-pointer" readOnly placeholder="신고서(귀속 - 지급)"
                     value={refundReturn ? `${refundReturn.attributionMonth.replace('-', '/')}-${refundReturn.payMonth.replace('-', '/')}` : ''}
                     onClick={() => setRefundOpen(true)} />
              <button type="button" className="ec-btn" title="원천세신고서검색" onClick={() => setRefundOpen(true)}>🔍</button>
              {refundReturn && (
                <button type="button" className="ec-btn text-ec-danger" title="선택 해제" onClick={() => set({ prevRefundReturnId: null })}>×</button>
              )}
            </div>
          )}
        </div>
      </li>
      <li className="wide">
        <div className="title">기타</div>
        <div className="form">
          <label>
            <input type="checkbox" disabled={locked} checked={form.includeYearEnd}
                   onChange={(e) => set({ includeYearEnd: e.target.checked })} /> 연말정산포함
          </label>
        </div>
      </li>
      {ledgerOpen && (
        <LedgerPickModal payMonth={form.payMonth} picked={form.payLedgerIds} onClose={() => setLedgerOpen(false)}
                         onApply={(picks) => {
                           setLedgerLabels((cur) => ({ ...cur, ...Object.fromEntries(picks.map((p) => [p.id, `${p.code}[${p.kind}]`])) }))
                           set({ payLedgerIds: [...new Set([...form.payLedgerIds, ...picks.map((p) => p.id)])] })
                           setLedgerOpen(false)
                         }} />
      )}
      {refundOpen && (
        <Modal open title="원천세신고서검색" onClose={() => setRefundOpen(false)} width={780}>
          <p className="text-right text-[12px] mb-[6px]">귀속연도 : {form.attributionMonth.slice(0, 4)}년도</p>
          <table className="w-full">
            <thead><tr>
              <th className="text-center">귀속연월</th><th className="text-center">신고구분<br />(연말정산)</th><th className="text-center">지급연월</th><th className="text-center">신고일자</th><th className="text-right">차월이월환급세액</th><th className="text-right">환급신청액</th>
            </tr></thead>
            <tbody>
              {returns.filter((r) => r.id !== form.id).length === 0 && <tr><td colSpan={6} className="text-center">등록된 데이터가 없습니다.</td></tr>}
              {returns.filter((r) => r.id !== form.id).map((r) => (
                <tr key={r.id}>
                  <td className="text-center">
                    <a href="#" onClick={(e) => { e.preventDefault(); set({ prevRefundReturnId: r.id }); setRefundOpen(false) }}>
                      {r.attributionMonth.replace('-', '/')}
                    </a>
                  </td>
                  <td className="text-center">{r.filingMethodName}{r.includeYearEnd ? '(연말정산)' : ''}</td>
                  <td className="text-center">{r.payMonth.replace('-', '/')}</td>
                  <td className="text-center">{r.reportDate.replace(/-/g, '.')}</td>
                  <td className="text-right">0</td>
                  <td className="text-right">0</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => setRefundOpen(false)}>닫기</button>
          </div>
        </Modal>
      )}
    </ul>
  )
}

/**
 * 원본 '급여대장검색'(2026-10-13 loginaa 실측) — 신고서 [지급연월] 에 지급한 급여대장만 보인다.
 * 열: 귀속연월 · 지급연월 · 구분 · 급여대장명칭 · 인원 · 급여대장금액 · 신고대상금액 · 상세내역 · 반영여부, 아래 [적용(F8)] [닫기].
 * 원본 2026/10-1: 6명 21,669,000 · 신고대상 20,469,000(차량유지비 200,000 × 6 제외). 반영여부는 원본도 빈칸이었다.
 */
function LedgerPickModal({ payMonth, picked, onApply, onClose }: {
  payMonth: string; picked: number[]; onApply: (picks: LedgerPick[]) => void; onClose: () => void
}) {
  const [rows, setRows] = useState<LedgerPick[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set(picked))
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<LedgerPick | null>(null)
  useEffect(() => {
    api.get<LedgerPick[]>('/withholding/ledger-picks', { params: { payMonth } })
      .then((r) => setRows(r.data))
      .catch((e) => setError(extractErrorMessage(e)))
  }, [payMonth])
  const toggle = (id: number) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allOn = rows.length > 0 && rows.every((r) => checked.has(r.id))
  return (
    <Modal open error={error} title="급여대장검색" onClose={onClose} width={780}>
      <table className="w-full">
        <thead><tr>
          <th className="w-[28px] text-center">
            <input type="checkbox" aria-label="전체 선택" checked={allOn}
                   onChange={() => setChecked(allOn ? new Set() : new Set(rows.map((r) => r.id)))} />
          </th>
          <th className="text-center">귀속연월</th><th className="text-center">지급연월</th><th className="text-center">구분</th><th>급여대장명칭</th><th className="text-right">인원</th>
          <th className="text-right">급여대장금액</th><th className="text-right">신고대상금액</th><th className="text-center">상세내역</th><th className="text-center">반영여부</th>
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={10} className="text-center">등록된 데이터가 없습니다.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${r.code} 선택`} checked={checked.has(r.id)} onChange={() => toggle(r.id)} />
              </td>
              <td className="text-center">{r.code}</td>
              <td className="text-center">{r.payMonth.replace('-', '/')}</td>
              <td className="text-center">{r.kind}</td>
              <td>{r.name}</td>
              <td className="text-right">{won(r.headcount)}</td>
              <td className="text-right">{won(Number(r.ledgerAmount))}</td>
              <td className="text-right">{won(Number(r.reportAmount))}</td>
              <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); setDetail(r) }}>조회</a></td>
              <td className="text-center"></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => onApply(rows.filter((r) => checked.has(r.id)))}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
      {detail && <SimpleIncomeModal ledger={detail} onClose={() => setDetail(null)} />}
    </Modal>
  )
}

/** 원본 '간이소득내역' — 급여대장검색 [상세내역] 조회. 머리 오른쪽에 '소득자료반영기준 : 신고기간'(원본 그대로). */
function SimpleIncomeModal({ ledger, onClose }: { ledger: LedgerPick; onClose: () => void }) {
  const [rows, setRows] = useState<SimpleIncomeRow[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    api.get<SimpleIncomeRow[]>(`/withholding/ledger-picks/${ledger.id}/income`)
      .then((r) => setRows(r.data))
      .catch((e) => setError(extractErrorMessage(e)))
  }, [ledger.id])
  const sum = (k: keyof SimpleIncomeRow) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0)
  const day = (d: string | null) => (d ? d.replace(/-/g, '.') : '')
  return (
    <Modal open error={error} title="간이소득내역" onClose={onClose} width={780}>
      <p className="text-right text-[12px] mb-[6px]">소득자료반영기준 : 신고기간</p>
      <table className="w-full">
        <thead><tr>
          <th>사원번호</th><th className="text-center">성명</th><th className="text-center">입사일</th><th className="text-center">퇴사일</th><th className="text-right">급여대장금액</th>
          <th className="text-right">제출제외<br />비과세</th><th className="text-right">제출대상<br />비과세<br />및 감면</th><th className="text-right">제출대상<br />금액</th><th className="text-right">소득세</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employeeCode}>
              <td>{r.employeeCode}</td>
              <td className="text-center">{r.employeeName}</td>
              <td className="text-center">{day(r.hireDate)}</td>
              <td className="text-center">{day(r.resignDate)}</td>
              <td className="text-right">{won(Number(r.ledgerAmount))}</td>
              <td className="text-right">{won(Number(r.excludedNonTaxable))}</td>
              <td className="text-right">{won(Number(r.submittedNonTaxable))}</td>
              <td className="text-right">{won(Number(r.submitAmount))}</td>
              <td className="text-right">{won(Number(r.incomeTax))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="font-bold">
          <td colSpan={4} className="text-center">합계[{rows.length}]명</td>
          <td className="text-right">{won(sum('ledgerAmount'))}</td>
          <td className="text-right">{won(sum('excludedNonTaxable'))}</td>
          <td className="text-right">{won(sum('submittedNonTaxable'))}</td>
          <td className="text-right">{won(sum('submitAmount'))}</td>
          <td className="text-right">{won(sum('incomeTax'))}</td>
        </tr></tfoot>
      </table>
      <div className="flex gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/**
 * 원본 신고서 서식 [Ⅰ. 원천징수 명세 및 납부세액] 의 줄(코드 · 소득구분). 원본처럼 줄을 모두 그리고
 * 우리에게 자료가 있는 줄(A01 간이세액 · A03 일용근로 · A25 사업 매월징수 · A42 기타 그 외 · A50 이자 · A60 배당 · A80 법인에 준 이자 · 배당)만 채운다.
 * 가감계 줄은 위 줄의 합이고, <b>납부세액은 가감계 · 이자 · 배당 · 총합계 줄에만</b> 찍힌다(원본 그대로).
 */
const FORM_ROWS: { code: string; group: string; label: string; sum?: string[]; pay?: boolean }[] = [
  { code: 'A01', group: '근로소득', label: '간이세액' },
  { code: 'A02', group: '근로소득', label: '중도퇴사' },
  { code: 'A03', group: '근로소득', label: '일용근로' },
  { code: 'A04', group: '근로소득', label: '연말정산 합계' },
  { code: 'A05', group: '근로소득', label: '연말정산 분납신청' },
  { code: 'A06', group: '근로소득', label: '연말정산 납부금액' },
  { code: 'A10', group: '근로소득', label: '가감계', sum: ['A01', 'A02', 'A03', 'A04'], pay: true },
  { code: 'A21', group: '퇴직소득', label: '연금계좌' },
  { code: 'A22', group: '퇴직소득', label: '그 외' },
  { code: 'A20', group: '퇴직소득', label: '가감계', sum: ['A21', 'A22'], pay: true },
  { code: 'A25', group: '사업소득', label: '매월징수' },
  { code: 'A26', group: '사업소득', label: '연말정산 합계' },
  { code: 'A27', group: '사업소득', label: '연말정산 분납신청' },
  { code: 'A28', group: '사업소득', label: '연말정산 납부금액' },
  { code: 'A30', group: '사업소득', label: '가감계', sum: ['A25', 'A26'], pay: true },
  { code: 'A41', group: '기타소득', label: '연금계좌' },
  { code: 'A43', group: '기타소득', label: '종교인소득 매월징수' },
  { code: 'A44', group: '기타소득', label: '종교인소득 연말정산' },
  { code: 'A49', group: '기타소득', label: '가상자산' },
  { code: 'A59', group: '기타소득', label: '인적용역' },
  { code: 'A42', group: '기타소득', label: '그 외' },
  { code: 'A40', group: '기타소득', label: '가감계', sum: ['A41', 'A43', 'A44', 'A49', 'A59', 'A42'], pay: true },
  { code: 'A48', group: '연금소득', label: '연금계좌' },
  { code: 'A45', group: '연금소득', label: '공적연금(매월)' },
  { code: 'A46', group: '연금소득', label: '연말정산' },
  { code: 'A47', group: '연금소득', label: '가감계', sum: ['A48', 'A45', 'A46'], pay: true },
  { code: 'A50', group: '', label: '이자소득', pay: true },
  { code: 'A60', group: '', label: '배당소득', pay: true },
  { code: 'A69', group: '', label: '저축 등 해지 추징세액 등', pay: true },
  { code: 'A70', group: '', label: '비거주자 양도소득', pay: true },
  { code: 'A80', group: '법인', label: '내·외국법인원천', pay: true },
  { code: 'A90', group: '', label: '수정신고(세액)', pay: true },
]
const TOTAL_PARTS = ['A10', 'A20', 'A30', 'A40', 'A47', 'A50', 'A60', 'A69', 'A70', 'A80', 'A90']

type Cell = { count: number; gross: number; tax: number }

function formCells(stmt: WithholdingStatement): Record<string, Cell> {
  const cells: Record<string, Cell> = {}
  for (const s of stmt.sections) {
    const c = cells[s.code] ?? { count: 0, gross: 0, tax: 0 }
    cells[s.code] = { count: c.count + s.count, gross: c.gross + Number(s.grossPay), tax: c.tax + Number(s.incomeTax) }
  }
  const add = (codes: string[]): Cell => codes.reduce<Cell>((t, k) => ({
    count: t.count + (cells[k]?.count ?? 0), gross: t.gross + (cells[k]?.gross ?? 0), tax: t.tax + (cells[k]?.tax ?? 0),
  }), { count: 0, gross: 0, tax: 0 })
  for (const r of FORM_ROWS) if (r.sum) cells[r.code] = add(r.sum)
  cells.A99 = add(TOTAL_PARTS)
  return cells
}

/** 신고서 서식 1쪽 — 조회 창과 원천세신고서 PDF 다운로드의 인쇄가 같이 쓴다. */
export function StatementSheet({ ret, stmt }: { ret: WithholdingReturn; stmt: WithholdingStatement | null }) {
  const cells = stmt ? formCells(stmt) : {}
  const rows = [...FORM_ROWS, { code: 'A99', group: '', label: '총 합 계', pay: true }]
  return (
    <>
      <p className="text-[12px] mb-[6px]">
        ② 귀속연월 {ret.attributionMonth.replace('-', '년 ')}월 · ③ 지급연월 {ret.payMonth.replace('-', '년 ')}월 ·
        ① 신고구분 {ret.filingMethodName} · {ret.filingTypeName}
      </p>
      {stmt && stmt.draftCount > 0 && (
        <p className="ec-alert ec-alert-info mb-[6px]">
          미확정 급여명세 {stmt.draftCount}건은 신고 대상에서 제외됩니다. 급여관리에서 확정하세요.
        </p>
      )}
      <p className="text-[12px] font-bold mb-[4px]">Ⅰ. 원천징수 명세 및 납부세액 (단위:원)</p>
      <table className="w-full ec-report">
        <thead>
          <tr>
            <th rowSpan={2}>소득자 소득구분</th>
            <th rowSpan={2}>코드</th>
            <th colSpan={5}>원천징수명세</th>
            <th rowSpan={2}>⑨당월조정<br />환급세액</th>
            <th colSpan={2}>납부 세액</th>
          </tr>
          <tr>
            <th>④인원</th><th>⑤총지급액</th><th>⑥소득세등</th><th>⑦농어촌특별세</th><th>⑧가산세</th>
            <th>⑩소득세 등<br />(가산세포함)</th><th>⑪농어촌특별세</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const c = cells[r.code] ?? { count: 0, gross: 0, tax: 0 }
            return (
              <tr key={r.code} className={r.sum || r.code === 'A99' ? 'font-bold' : undefined}>
                <td>{r.group ? `${r.group} · ` : ''}{r.label}</td>
                <td className="text-center">{r.code}</td>
                <td className="text-right">{won(c.count)}</td>
                <td className="text-right">{won(c.gross)}</td>
                <td className="text-right">{won(c.tax)}</td>
                <td className="text-right">0</td>
                <td className="text-right">0</td>
                <td className="text-right">{r.pay ? '0' : ''}</td>
                <td className="text-right">{r.pay ? won(c.tax) : ''}</td>
                <td className="text-right">{r.pay ? '0' : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

/** 원본 [신고서 조회] — 서식 1쪽 Ⅰ. 원천징수 명세 및 납부세액(단위: 원). 원천세신고서 PDF 다운로드도 [조회]로 연다. */
export function StatementModal({ ret, onClose }: { ret: WithholdingReturn; onClose: () => void }) {
  const [stmt, setStmt] = useState<WithholdingStatement | null>(null)
  const [error, setError] = useState('')
  function load() {
    setError('')
    api.get<WithholdingStatement>('/withholding/statement', { params: { month: ret.attributionMonth, returnId: ret.id } })
      .then((r) => setStmt(r.data))
      .catch((e) => setError(extractErrorMessage(e)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [ret.id])

  return (
    <Modal open title="원천징수이행상황신고서" onClose={onClose} width={900} error={error}>
      <StatementSheet ret={ret} stmt={stmt} />
      <div className="flex gap-[6px] mt-[12px]">
        <button className="ec-btn" onClick={load}>새로불러오기</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/** 신고서 한 장의 소득구분별 숫자 + 회사정보 — 영수증 두 창이 같이 쓴다. */
interface CompanyLite { name: string | null; ceo: string | null; bizRegNo: string | null; corpRegNo: string | null; tel: string | null; address: string | null; addressDetail: string | null }
function useReceiptData(ret: WithholdingReturn) {
  const [stmt, setStmt] = useState<WithholdingStatement | null>(null)
  const [company, setCompany] = useState<CompanyLite | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.get<WithholdingStatement>('/withholding/statement', { params: { month: ret.attributionMonth, returnId: ret.id } })
      .then((r) => setStmt(r.data)).catch((e) => setError(extractErrorMessage(e)))
    api.get<CompanyLite | null>('/company').then((r) => setCompany(r.data)).catch(() => undefined)
  }, [ret.id, ret.attributionMonth])
  return { stmt, company, error }
}

/**
 * 원본 소득구분(영수증서 창의 고르기 칸 차례 그대로) → 신고서 서식 줄.
 * 세목 코드는 원본에서 잰 근로소득(14)만 적는다 — 나머지는 원본 영수증서를 열어 보지 못해 비워 둔다.
 */
const RECEIPT_KINDS: { key: string; label: string; tax: string; codes: string[]; taxCode?: string }[] = [
  { key: 'labor', label: '근로소득', tax: '근로소득세', codes: ['A01', 'A02', 'A03', 'A04'], taxCode: '14' },
  { key: 'retire', label: '퇴직소득', tax: '퇴직소득세', codes: ['A20', 'A21', 'A22'] },
  { key: 'business', label: '사업소득', tax: '사업소득세', codes: ['A25', 'A26'] },
  { key: 'other', label: '기타소득', tax: '기타소득세', codes: ['A41', 'A42', 'A43', 'A44', 'A49', 'A59'] },
  { key: 'interest', label: '이자소득', tax: '이자소득세', codes: ['A50'] },
  { key: 'dividend', label: '배당소득', tax: '배당소득세', codes: ['A60'] },
  { key: 'corp', label: '법인원천', tax: '법인세', codes: ['A80'] },
]

function sumSections(stmt: WithholdingStatement | null, codes: string[]) {
  const ss = (stmt?.sections ?? []).filter((s) => codes.includes(s.code))
  return {
    count: ss.reduce((a, s) => a + s.count, 0),
    tax: ss.reduce((a, s) => a + Number(s.incomeTax), 0),
    local: ss.reduce((a, s) => a + Number(s.localIncomeTax ?? 0), 0),
  }
}

/** 금액을 원본 납부금액 칸(조 · 천 · 백 · 십 · 억 · 천 · 백 · 십 · 만 · 천 · 백 · 십 · 원) 13칸에 오른쪽부터 한 자씩. */
function digits13(n: number) {
  const s = String(Math.round(n))
  return Array.from({ length: 13 }, (_, i) => s[s.length - 13 + i] ?? '')
}
const DIGIT_HEAD = ['조', '천', '백', '십', '억', '천', '백', '십', '만', '천', '백', '십', '원']

/**
 * 원본 [영수증] 소득세 — 먼저 '소득세 영수증서' 창에서 소득구분을 고르고 [적용(F8)] 하면
 * 영수증서(납세자용) · 납부서(수납기관용) 두 쪽이 뜬다(2026-10-13 loginaa 2026/10: 분류기호 0126 · 납부연월 2611 · 납부구분 4 · 세목 14,
 * '2026 년 귀속 10 기분', 근로소득세 646,370 · 농어촌특별세 0, 납부기한 11월 10일).
 */
function IncomeTaxReceiptModal({ ret, onClose }: { ret: WithholdingReturn; onClose: () => void }) {
  const [kind, setKind] = useState(RECEIPT_KINDS[0].key)
  const [applied, setApplied] = useState<string | null>(null)
  const { stmt, company, error } = useReceiptData(ret)
  if (!applied) {
    return (
      <Modal open title="소득세 영수증서" onClose={onClose} width={780} error={error}>
        <ul className="ec-form">
          <li className="wide">
            <div className="title">소득구분</div>
            <div className="form">
              <select className="ec-input w-full" value={kind} onChange={(e) => setKind(e.target.value)}>
                {RECEIPT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </div>
          </li>
        </ul>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => setApplied(kind)}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>
    )
  }
  const k = RECEIPT_KINDS.find((x) => x.key === applied) ?? RECEIPT_KINDS[0]
  const amt = sumSections(stmt, k.codes)
  const [ry, rm, rd] = ret.reportDate.split('-')
  const [ay, am] = ret.attributionMonth.split('-')
  const addr = [company?.address, company?.addressDetail].filter(Boolean).join(' ')
  const sheet = (title: string, page: string) => (
    <div className="mb-[18px]">
      <div className="flex justify-between items-end mb-[4px]">
        <span className="text-[11px]">[별지 제8호서식] &lt;개정 2019.3.20&gt;</span>
        <b className="text-[15px]">{title}</b>
        <span className="text-[11px]">{page}</span>
      </div>
      <table className="w-full ec-report text-center">
        <tbody>
          <tr><th colSpan={5}>납 부 번 호</th><th colSpan={3}>수입징수관서</th><th rowSpan={3}>QR코드</th></tr>
          <tr><th>분류기호</th><th>납부연월</th><th>납부구분</th><th>세목</th><th>발행번호</th><th>세무서명</th><th>서코드</th><th>계좌번호</th></tr>
          <tr><td>0126</td><td>{ry.slice(2)}{rm}</td><td>4</td><td>{k.taxCode ?? ''}</td><td></td><td></td><td></td><td></td></tr>
          <tr><th>성명<br />(상호)</th><td colSpan={2}>{company?.name ?? ret.companyName ?? ''}</td><th colSpan={2}>주민등록번호<br />(사업자등록번호)</th><td colSpan={2}>{(company?.bizRegNo ?? ret.bizRegNo ?? '').replace(/-/g, ' - ')}</td><th>회계연도</th><td>{ry}</td></tr>
          <tr><th>주소<br />(사업장)</th><td colSpan={4} className="text-left">{addr}</td><td>일반회계</td><td colSpan={2}>기획재정부소관</td><td>조세</td></tr>
        </tbody>
      </table>
      <table className="w-full ec-report text-center mt-[6px]">
        <tbody>
          <tr><th colSpan={2}>귀속연도/기분</th><td colSpan={13}>{ay} 년 귀속 {Number(am)} 기분</td></tr>
          <tr><th colSpan={2} rowSpan={2}>세목명</th><th colSpan={13}>납 부 금 액</th></tr>
          <tr>{DIGIT_HEAD.map((d, i) => <th key={i}>{d}</th>)}</tr>
          <tr><td colSpan={2}>{k.tax}</td>{digits13(amt.tax).map((d, i) => <td key={i}>{d}</td>)}</tr>
          <tr><td colSpan={2}>농어촌특별세</td>{digits13(0).map((d, i) => <td key={i}>{d}</td>)}</tr>
          <tr><td colSpan={2}>계</td>{digits13(amt.tax).map((d, i) => <td key={i}>{d}</td>)}</tr>
        </tbody>
      </table>
      <p className="text-right text-[12px] mt-[4px]">납부기한 {Number(rm)}월 {Number(rd)}일</p>
    </div>
  )
  return (
    <Modal open title="영수증서" onClose={onClose} width={900} error={error}>
      {sheet('영 수 증 서(납세자용)', '1쪽')}
      {sheet('납부서(수납기관용)', '2쪽')}
      <div className="flex gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => window.print()}>인쇄</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/** 원본 지방소득세 영수증의 줄(④ ~ ⑮) — 신고서 서식 줄을 묶는다. */
const LOCAL_ROWS: { no: string; label: string; codes: string[]; sub?: string }[] = [
  { no: '④', label: '이자소득', codes: ['A50'] },
  { no: '⑤', label: '배당소득', codes: ['A60'] },
  { no: '⑥', label: '사업소득', codes: ['A25', 'A26'] },
  { no: '⑦', label: '근로소득', codes: ['A01', 'A02', 'A03', 'A04'] },
  { no: '⑧', label: '연금소득', codes: ['A45', 'A46', 'A48'] },
  { no: '⑨', label: '기타소득', codes: ['A41', 'A42', 'A43', 'A44', 'A49', 'A59'] },
  { no: '⑩', label: '퇴직소득', codes: ['A20', 'A21', 'A22'] },
  { no: '⑪', label: '저축해지추징세액 등', codes: ['A69'] },
  { no: '⑫', label: '비거주자 양도소득', codes: ['A70'] },
  { no: '⑬', label: '법인원천', sub: '내국법인', codes: ['A80'] },
  { no: '', label: '', sub: '외국법인', codes: [] },
  { no: '⑭', label: '가감세액(조정액)', codes: [] },
]

/**
 * 원본 [영수증] 지방소득세 — '지방소득세 영수증' 창. 한 줄에 세 쪽(납부서 및 영수필통지서 · 수납의뢰서 · 영수증),
 * 구분 ④이자 ~ ⑮가산세 · 계 × [인원 · 과세표준 · 지방소득세]. 과세표준은 소득세(원본 2026/10 근로 6명 646,370 → 64,630).
 * 맨 위 경고 문구 그대로.
 */
function LocalTaxReceiptModal({ ret, onClose }: { ret: WithholdingReturn; onClose: () => void }) {
  const { stmt, company, error } = useReceiptData(ret)
  const lines = LOCAL_ROWS.map((r) => ({ ...r, ...sumSections(stmt, r.codes) }))
  const total = lines.reduce((t, l) => ({ count: t.count + l.count, tax: t.tax + l.tax, local: t.local + l.local }), { count: 0, tax: 0, local: 0 })
  const [ry, rm, rd] = ret.reportDate.split('-')
  const [ay, am] = ret.attributionMonth.split('-')
  const [py, pm] = ret.payMonth.split('-')
  const addr = [company?.address, company?.addressDetail].filter(Boolean).join(' ')
  const panel = (title: string, foot: string) => (
    <div className="flex-1 min-w-0">
      <table className="w-full ec-report text-center">
        <tbody>
          <tr><th colSpan={5}>{title}</th></tr>
          <tr><th rowSpan={6}>특별<br />징수<br />의무자</th><th>성 명(상호명)</th><td colSpan={3}>{company?.name ?? ret.companyName ?? ''}</td></tr>
          <tr><th>주민(법인)등록번호</th><td colSpan={3}>{company?.corpRegNo ?? ''}</td></tr>
          <tr><th>대 표 자</th><td colSpan={3}>{company?.ceo ?? ''}</td></tr>
          <tr><th>사업자등록번호</th><td colSpan={3}>{company?.bizRegNo ?? ret.bizRegNo ?? ''}</td></tr>
          <tr><th>주 소(소재지)</th><td colSpan={3} className="text-left">{addr}</td></tr>
          <tr><th>전 화 번 호</th><td colSpan={3}>{company?.tel ?? ''}</td></tr>
          <tr><td colSpan={5}>귀속 {ay} 년 {am} 월 (지급 {py} 년 {pm} 월)</td></tr>
          <tr><th>①세목</th><td>지방소득세</td><th colSpan={3}>②신고하는 특별자치시·특별자치도·시·군·구</th></tr>
          <tr><th>③납부액</th><td colSpan={4}>일금 {won(total.local)} 원정</td></tr>
          <tr><th colSpan={2}>구 분</th><th>인 원</th><th>과세표준</th><th>지방소득세</th></tr>
          {lines.map((l, i) => (
            <tr key={i}>
              <td colSpan={2} className="text-left">{l.no} {l.label}{l.sub ? ` ${l.sub}` : ''}</td>
              <td className="text-right">{won(l.count)}</td>
              <td className="text-right">{won(l.tax)}</td>
              <td className="text-right">{won(l.local)}</td>
            </tr>
          ))}
          <tr><td colSpan={2} className="text-left">⑮ 가산세</td><td></td><td></td><td className="text-right">0</td></tr>
          <tr className="font-bold"><td colSpan={2}>계</td><td className="text-right">{won(total.count)}</td><td className="text-right">{won(total.tax)}</td><td className="text-right">{won(total.local)}</td></tr>
          <tr><td colSpan={5}>{foot}<br />{ry} 년 {rm} 월 {rd} 일</td></tr>
        </tbody>
      </table>
    </div>
  )
  return (
    <Modal open title="지방소득세 영수증" onClose={onClose} width={1100} error={error}>
      <p className="ec-alert ec-alert-danger mb-[8px]">환급세액이 발생한 경우는 자동계산한 금액이 틀릴 수 있습니다. (반드시 확인후 납부하십시오.)</p>
      <div className="flex gap-[12px] mobile:flex-col">
        {panel('지방소득세 특별징수 납부서 및 영수필통지서', '위 금액을 납부 합니다.')}
        {panel('지방소득세 특별징수 수납의뢰서', '위의 금액을 수납 의뢰 합니다.')}
        {panel('지방소득세 특별징수 영수증', '위의 금액을 영수합니다.')}
      </div>
      <div className="flex gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => window.print()}>인쇄</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

interface ReturnHistoryRow { seq: number; changedBy: string | null; changedAt: string; kind: string; action: string }

/** 원본 목록 [이력] — '원천징수이행상황신고서 이력' 창(순번 · 작업자ID · 작업일시 · 신고서종류 · 상태). 작업일시는 원본처럼 '2026/10/13 오전 10:35:57'. */
function ReturnHistoryModal({ ret, onClose }: { ret: WithholdingReturn; onClose: () => void }) {
  const [rows, setRows] = useState<ReturnHistoryRow[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    api.get<ReturnHistoryRow[]>(`/withholding/returns/${ret.id}/history`)
      .then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [ret.id])
  const when = (iso: string) => {
    const d = new Date(iso)
    const h = d.getHours()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }
  return (
    <Modal open title="원천징수이행상황신고서 이력" onClose={onClose} width={780} error={error}>
      <table className="w-full text-center">
        <thead><tr><th>순번</th><th>작업자ID</th><th>작업일시</th><th>신고서종류</th><th>상태</th></tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.seq}>
              <td>{r.seq}</td><td>{(r.changedBy ?? '').toUpperCase()}</td><td>{when(r.changedAt)}</td><td>{r.kind}</td><td>{r.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/** 근로소득 원천징수영수증 — 사원별 연간 근로소득 · 원천징수 합계(확정 급여명세만). */
function ReceiptsView() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [receipts, setReceipts] = useState<WithholdingReceipt[]>([])
  const [error, setError] = useState('')

  function load() {
    setError('')
    api.get<WithholdingReceipt[]>('/withholding/receipts', { params: { year } })
      .then((r) => setReceipts(r.data))
      .catch((e) => { setReceipts([]); setError(extractErrorMessage(e)) })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  return (
    <EcListShell title="근로소득원천징수영수증" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="flex items-center gap-[6px] mb-[8px]">
        <span className="text-[12.5px]">귀속연도</span>
        <input type="number" className="ec-input w-[100px]" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회</button>
        <span className="ml-[8px] text-[12px] text-ec-hint">사원별 연간 근로소득·원천징수 합계</span>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th><th>사번</th><th>성명</th>
            <th className="text-center">지급월수</th>
            <th className="text-right">연간 총급여</th>
            <th className="text-right">사회보험료</th>
            <th className="text-right">소득세</th>
            <th className="text-right">지방소득세</th>
            <th className="text-right">원천징수 합계</th>
          </tr>
        </thead>
        <tbody>
          {receipts.length === 0 ? (
            <tr><td colSpan={9} className="text-center text-ec-hint p-[20px]">
              해당 연도에 확정된 급여명세가 없습니다.
            </td></tr>
          ) : receipts.map((r, i) => (
            <tr key={r.employeeId}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>{r.employeeCode}</td>
              <td>{r.employeeName}</td>
              <td className="text-center">{r.months.length}</td>
              <td className="text-right">{won(r.grossPay)}</td>
              <td className="text-right text-ec-hint">{won(r.socialInsurance)}</td>
              <td className="text-right">{won(r.incomeTax)}</td>
              <td className="text-right text-ec-hint">{won(r.localIncomeTax)}</td>
              <td className="text-right font-bold">{won(r.totalWithheld)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
