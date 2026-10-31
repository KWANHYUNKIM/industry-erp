import { useEffect, useMemo, useState } from 'react'
import Modal from '../../../components/Modal'
import { ecAlert, ecConfirm } from '../../../components/EcDialog'
import { extractErrorMessage } from '../../../api/client'
import { yearEndApi, type Candidate, type Settlement, type SettlementKind } from '../api'
import { DeductionModal, PrevEmployerModal } from './DeductionModals'
import { NumInput } from './parts'
import { fmtNumberOrZero } from '../../../utils/format'

const KIND_NAME: Record<SettlementKind, string> = { YEAR_END: '연말정산', MID_TERM: '중도정산' }

/**
 * `연말정산 대상자 추가` 창(plans/세무/연말정산.md 2장) — 재직 사원(+ [퇴직자 포함] 이면 귀속연도 퇴사자), 이미 있는 사람은 안 나온다.
 * 성명 가나다 차례. 주민번호 열은 원본 자리만 둔다(우리 사원에 주민번호가 없다 — '주민번호오류' 잠금도 없음, 사용자 결정 대기).
 */
export function CandidateModal({ year, kind, onClose, onApplied }: {
  year: number; kind: SettlementKind; onClose: () => void; onApplied: () => void
}) {
  const [includeRetired, setIncludeRetired] = useState(false)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Candidate[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')

  useEffect(() => {
    yearEndApi.candidates(year, kind, includeRetired).then(setRows).catch((e) => { setRows([]); setError(extractErrorMessage(e)) })
  }, [year, kind, includeRetired])

  const shown = useMemo(() => rows.filter((r) => !q || r.code.includes(q) || r.name.includes(q)), [rows, q])
  const all = shown.length > 0 && shown.every((r) => picked.has(r.employeeId))

  async function apply() {
    if (picked.size === 0) { await ecAlert('등록할 사원이 선택되지 않았습니다.'); return }
    try {
      await yearEndApi.addTargets(year, kind, [...picked])
      onApplied()   // 원본: 안내 없이 창이 닫히고 목록에 줄이 생긴다
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  return (
    <Modal open title={`${KIND_NAME[kind]} 대상자 추가`} onClose={onClose} width={640} error={error}>
      <div className="flex items-center gap-[6px] mb-[8px] justify-end">
        <input className="ec-input w-[180px]" placeholder="사번, 사원명" aria-label="검색어" value={q} onChange={(e) => setQ(e.target.value)} />
        {kind === 'YEAR_END' && (
          <label className="inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={includeRetired} onChange={(e) => setIncludeRetired(e.target.checked)} /> 퇴직자 포함
          </label>
        )}
      </div>
      <table className="w-full text-center mb-[8px]">
        <thead>
          <tr>
            <th className="w-[36px]"><input type="checkbox" aria-label="전체 선택" checked={all}
                   onChange={() => setPicked(all ? new Set() : new Set(shown.map((r) => r.employeeId)))} /></th>
            <th>사번</th><th>성명</th><th>주민번호</th><th>퇴사일</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr> : shown.map((r) => (
            <tr key={r.employeeId}>
              <td><input type="checkbox" aria-label={`${r.name} 선택`} checked={picked.has(r.employeeId)}
                         onChange={() => setPicked((x) => { const n = new Set(x); if (n.has(r.employeeId)) n.delete(r.employeeId); else n.add(r.employeeId); return n })} /></td>
              <td>{r.code}</td><td className="text-left">{r.name}</td><td /><td>{r.resignDate ? r.resignDate.replace(/-/g, '.') : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-[4px]">
        <button className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/** 표 한 줄 — 이름 · [수정] · 사용금액 · 공제액 */
function Row({ name, onEdit, used, amount }: { name: string; onEdit?: () => void; used?: number | string; amount?: number | string }) {
  return (
    <tr>
      <th className="text-left">{name}{onEdit && <> <button type="button" className="ec-btn ec-btn-sm" onClick={onEdit}>수정</button></>}</th>
      <td className="text-right">{typeof used === 'number' ? fmtNumberOrZero(used) : used}</td>
      <td className="text-right">{typeof amount === 'number' ? fmtNumberOrZero(amount) : amount}</td>
    </tr>
  )
}

/**
 * `정산공제항목 입력` 창(연말정산.md 3장 · E030114.md 3.2) — 최소판: 기본정보 · 급여 및 예상세액 알약 8개 · 종(전)근무지 ·
 * 소득공제(인적 · 연금 · 건강/고용) · 세액공제(근로소득 · 보장성보험료 · 의료비 · 표준). 나머지 공제 줄은 아직 없다.
 * [저장/계산처리(F8)] 는 hr 이 한 해 확정 급여를 모아 다시 셈한다 — 원본처럼 안내 없이 창이 열린 채 숫자가 바뀐다.
 */
export function SettlementFormModal({ id, empName, onClose, onChanged }: {
  id: number; empName: string; onClose: () => void; onChanged: () => void
}) {
  const [s, setS] = useState<Settlement | null>(null)
  const [pills, setPills] = useState(false)
  const [sub, setSub] = useState<'prev' | 'INSURANCE' | 'MEDICAL' | null>(null)
  const [monthOpen, setMonthOpen] = useState(false)
  const [error, setError] = useState('')

  // 중도정산은 원천징수연월이 비어 있으면 '원천징수연월 선택' 창이 이 창 위에 먼저 뜬다(E030114.md 3.1)
  useEffect(() => {
    yearEndApi.get(id).then((n) => { setS(n); setMonthOpen(n.kind === 'MID_TERM' && !n.withholdingMonth) })
      .catch((e) => setError(extractErrorMessage(e)))
  }, [id])
  const changed = (n: Settlement) => { setS(n); onChanged() }

  async function calculate() {
    setError('')
    try {
      const [n] = await yearEndApi.calculate([id])
      changed(n)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function remove() {
    if (!(await ecConfirm(`체크한 사원의 ${KIND_NAME[s?.kind ?? 'YEAR_END']} 내역이 사라지고 리스트에서 제외됩니다.\n삭제한 데이터는 복구되지 않습니다.\n삭제하겠습니까?`))) return
    try {
      await yearEndApi.remove([id])
      onChanged()
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const r = s?.receipt
  const prevSum = (f: (p: Settlement['prevEmployers'][number]) => number) => (s?.prevEmployers ?? []).reduce((a, p) => a + f(p), 0)
  const insUsed = (s?.deductions ?? []).filter((d) => d.kind !== 'MEDICAL').reduce((a, d) => a + d.amount, 0)
  const medUsed = (s?.deductions ?? []).filter((d) => d.kind === 'MEDICAL').reduce((a, d) => a + d.amount, 0)

  return (
    <Modal open title="정산공제항목 입력" onClose={onClose} width={980} error={error}>
      {s && (
        <>
          <div className="flex justify-end gap-[6px] mb-[6px] text-ec-hint">입력 후 [Enter]</div>
          <table className="w-full mb-[8px]">
            <thead><tr><th className="w-[260px]">기본정보</th><th>입력내용</th></tr></thead>
            <tbody>
              {s.kind === 'MID_TERM' && (
                <tr>
                  <th className="text-left">원천징수연월 <button type="button" className="ec-btn ec-btn-sm" onClick={() => setMonthOpen(true)}>수정</button></th>
                  <td>{s.withholdingMonth ? `${s.withholdingMonth.slice(0, 4)}년${s.withholdingMonth.slice(5)}월` : ''}</td>
                </tr>
              )}
              <tr><th className="text-left">◢ 소득자 인적 사항</th><td>{empName} / 일반 / 세대주 / 부(유주택자) · 내국인 / 거주자</td></tr>
              <tr><th className="text-left">계산설정</th><td>{s.standardAuto ? '표준세액공제 자동계산' : '표준세액공제 미적용'} / {s.childCredit ? '자녀세액공제 적용' : '자녀세액공제 미적용'} / {s.singleRate ? '단일세율 적용' : '단일세율 미적용'}</td></tr>
              <tr>
                <th className="text-left">급여 및 예상세액 <button type="button" className="ec-btn ec-btn-sm" onClick={() => setPills((v) => !v)}>조회</button></th>
                <td>
                  {pills && (
                    <span className="ec-pills flex-wrap">
                      {([['총 급여', s.totalSalary], ['근로소득금액', s.earnedIncomeAmount], ['과세표준', s.taxBase], ['산출세액', s.computedTax],
                        ['결정세액', s.decidedIncomeTax], ['기납부(소득세)', s.prevIncomeTax + s.currentIncomeTax], ['납부(환급)', s.balanceIncomeTax],
                        ['농특세', s.decidedRuralTax]] as const).map(([l, v]) => (
                        <span key={l} className="ec-pill">{l} {fmtNumberOrZero(v)}</span>
                      ))}
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <th className="text-left">◢ 종(전)근무지 및 납세조합 <button type="button" className="ec-btn ec-btn-sm" onClick={() => setSub('prev')}>수정</button></th>
                <td>
                  {s.prevEmployers.map((p) => (
                    <div key={p.lineNo}>종(전)근무지{p.lineNo} | 사업자등록번호 {p.bizNo} · 근무처명 {p.companyName} · 과세소득 {fmtNumberOrZero(p.taxablePay)} · 비과세소득 {fmtNumberOrZero(p.nonTaxable)} · 감면소득 {fmtNumberOrZero(p.reducedIncome)}</div>
                  ))}
                </td>
              </tr>
            </tbody>
          </table>

          <table className="w-full mb-[8px]">
            <thead><tr><th className="w-[260px]">소득공제</th><th>사용(납입)금액</th><th>소득공제액</th></tr></thead>
            <tbody>
              <Row name="인적공제 -기본공제" used={`${s.basicDeductionCount}명`} amount={r?.personalDeduction ?? 0} />
              <Row name="연금보험료 공제" used={prevSum((p) => p.nationalPension + p.otherPension)} amount={r?.pensionDeduction ?? 0} />
              <Row name="특별소득공제 -건강.고용보험료" used={prevSum((p) => p.healthInsurance + p.employmentInsurance)} amount={r?.specialIncomeDeduction ?? 0} />
              <Row name="그밖의 소득공제" amount={r?.otherIncomeDeduction ?? 0} />
            </tbody>
          </table>

          <table className="w-full mb-[8px]">
            <thead><tr><th className="w-[260px]">세액공제</th><th>사용(납입)금액</th><th>세액공제액</th></tr></thead>
            <tbody>
              <Row name="세액감면" amount={r?.taxReduction ?? 0} />
              <Row name="근로소득" amount={r?.earnedIncomeTaxCredit ?? 0} />
              <Row name="-보장성보험료" onEdit={() => setSub('INSURANCE')} used={insUsed} amount={r?.insuranceCredit ?? 0} />
              <Row name="-의료비" onEdit={() => setSub('MEDICAL')} used={medUsed} amount={r?.medicalCredit ?? 0} />
              <Row name="-표준세액공제" amount={r?.standardTaxCredit ?? 0} />
            </tbody>
          </table>

          <div className="flex gap-[4px]">
            <button className="ec-btn ec-btn-primary" onClick={calculate}>저장/계산처리(F8)</button>
            <button className="ec-btn" onClick={onClose}>닫기</button>
            <button className="ec-btn" onClick={remove}>삭제</button>
            {s.kind === 'YEAR_END' && <button className="ec-btn" disabled title="바깥 연동 — 누르지 않는다">연말정산 간소화 PDF</button>}
          </div>

          {monthOpen && <WithholdingMonthModal s={s} onClose={() => setMonthOpen(false)} onSaved={(n) => { changed(n); setMonthOpen(false) }} />}
          {sub === 'prev' && <PrevEmployerModal s={s} onClose={() => setSub(null)} onSaved={changed} />}
          {(sub === 'INSURANCE' || sub === 'MEDICAL') && <DeductionModal s={s} group={sub} empName={empName} onClose={() => setSub(null)} onSaved={changed} />}
        </>
      )}
    </Modal>
  )
}

/**
 * `중도정산 원천징수연월(지급연월) 선택` 창(E030114.md 3.1) — 연 · 월 두 칸, 기본 <b>이번 달</b>(퇴사월이 아니다).
 * [저장(F8)] 하면 안내 없이 닫힌다. 목록 · 퇴사자리스트의 '중도정산원천징수연월' 이 이 달이 된다.
 */
export function WithholdingMonthModal({ s, onClose, onSaved }: { s: Settlement; onClose: () => void; onSaved: (n: Settlement) => void }) {
  const now = new Date()
  const init = s.withholdingMonth ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [y, setY] = useState(init.slice(0, 4))
  const [m, setM] = useState(init.slice(5, 7))
  const [error, setError] = useState('')
  const years = Array.from({ length: 6 }, (_, i) => String(now.getFullYear() + 1 - i))
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))

  async function save() {
    try {
      onSaved(await yearEndApi.saveWithholdingMonth(s.id, `${y}-${m}`))
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  return (
    <Modal open title="중도정산 원천징수연월(지급연월) 선택" onClose={onClose} width={560} error={error}>
      <ul className="mb-[8px] list-disc pl-[18px]">
        <li>중도정산의 원천징수연월을 선택합니다.</li>
        <li>원천징수이행상황 신고서에 중도정산내역 자동반영시 퇴사자의 퇴사일자를 귀속연월,<br />
          원천징수연월을 지급연월로 하여 귀속연월과 지급연월이 일치하는 신고서에 반영됩니다.</li>
      </ul>
      <table className="w-full mb-[8px]">
        <thead><tr><th className="w-[160px]">항목</th><th>내용</th></tr></thead>
        <tbody>
          <tr>
            <th className="text-left">원천징수연월</th>
            <td>
              <span className="inline-flex gap-[4px]">
                <select className="ec-input w-[80px]" aria-label="원천징수연월 연" value={y} onChange={(e) => setY(e.target.value)}>
                  {years.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <select className="ec-input w-[60px]" aria-label="원천징수연월 월" value={m} onChange={(e) => setM(e.target.value)}>
                  {months.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="flex gap-[4px]">
        <button className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/** 원천징수영수증 [조회] — 원본 칸 번호 그대로(연말정산.md 4장 아래). 계산처리 전이면 빈 영수증. */
export function ReceiptModal({ s, empName, onClose }: { s: Settlement; empName: string; onClose: () => void }) {
  const r = s.receipt
  const line = (no: string, name: string, a: number | undefined, b?: number) => (
    <tr key={no}><th className="text-left w-[70px]">{no}</th><th className="text-left">{name}</th>
      <td className="text-right">{r ? fmtNumberOrZero(a) : ''}</td><td className="text-right">{b === undefined ? '' : r ? fmtNumberOrZero(b) : ''}</td></tr>
  )
  const prev = s.prevEmployers
  return (
    <Modal open title="근로소득원천징수영수증 (발행자 보고용)" onClose={onClose} width={760}>
      <p className="mb-[6px]">귀속연도 {s.attributionYear} · 소득자 {empName}</p>
      <table className="w-full mb-[8px]">
        <thead><tr><th>칸</th><th>항목</th><th>금액 · 소득세</th><th>지방소득세</th></tr></thead>
        <tbody>
          {line('(21)', '총급여', r?.totalSalary)}
          {line('(22)', '근로소득공제', r?.earnedIncomeDeduction)}
          {line('(23)', '근로소득금액', r?.earnedIncomeAmount)}
          {line('(24)', '기본공제 본인', r?.personalDeduction)}
          {line('(31)', '국민연금보험료', r?.pensionDeduction)}
          {line('(33)', '특별소득공제', r?.specialIncomeDeduction)}
          {line('(36)', '차감소득금액', r ? r.earnedIncomeAmount - r.personalDeduction - r.pensionDeduction - r.specialIncomeDeduction : 0)}
          {line('(48)', '종합소득 과세표준', r?.taxBase)}
          {line('(49)', '산출세액', r?.computedTax)}
          {line('(54)', '세액감면 계', r?.taxReduction)}
          {line('(55)', '근로소득 세액공제', r?.earnedIncomeTaxCredit)}
          {line('(61)', '보장성보험 공제대상 · 세액공제', r?.insuranceBase, r?.insuranceCredit)}
          {line('(62)', '의료비 공제대상 · 세액공제', r?.medicalBase, r?.medicalCredit)}
          {line('', '표준세액공제', r?.standardTaxCredit)}
          {line('(71)', '세액공제 계', r?.taxCreditTotal)}
          {line('(72)', '결정세액', r?.decidedIncomeTax)}
          {line('(73)', '결정세액', r?.decidedIncomeTax, r?.decidedLocalTax)}
          {prev.length > 0 && line('(74)', `기납부세액 종(전)근무지 ${prev.map((p) => p.bizNo).join(', ')}`, r?.prevIncomeTax, r?.prevLocalTax)}
          {line('(75)', '기납부세액 주(현)근무지', r?.currentIncomeTax, r?.currentLocalTax)}
          {line('(77)', '차감징수세액', r?.balanceIncomeTax, r?.balanceLocalTax)}
        </tbody>
      </table>
      <p className="mb-[8px]">◈국민연금 : {r ? fmtNumberOrZero(r.pensionDeduction) : ''} ◈건강보험 : ◈고용보험 :</p>
      <div className="flex gap-[4px]"><button className="ec-btn" onClick={onClose}>닫기</button></div>
    </Modal>
  )
}

/**
 * `분납처리 [입력]` 창(3.4) — 납부합계 = 차감징수세액, 완납/1차 · 2차 · 3차. [자동분배] 는 1차에 전부(원본 처음 값).
 * 분납 저장은 아직 없다(테이블 없음 — 남은 것).
 */
export function InstallmentModal({ s, onClose }: { s: Settlement; onClose: () => void }) {
  const tax = Math.max(0, s.balanceIncomeTax), local = Math.max(0, s.balanceLocalTax)
  const init = () => [[tax, local], [0, 0], [0, 0]]
  const [rows, setRows] = useState<number[][]>(init)
  const set = (i: number, j: number, v: number) => setRows((x) => x.map((r, a) => (a === i ? r.map((c, b) => (b === j ? v : c)) : r)))
  const names = ['완납/1차 분납', '2차 분납', '3차 분납']
  return (
    <Modal open title="분납처리" onClose={onClose} width={520}>
      <table className="w-full mb-[8px]">
        <thead><tr><th>구분</th><th>소득세</th><th>지방소득세</th></tr></thead>
        <tbody><tr><th>납부합계</th><td className="text-right">{fmtNumberOrZero(tax)}</td><td className="text-right">{fmtNumberOrZero(local)}</td></tr></tbody>
      </table>
      <table className="w-full mb-[8px]">
        <thead><tr><th>구분</th><th>소득세</th><th>지방소득세</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}><th>{names[i]}</th>
              <td className="text-right"><NumInput label={`${names[i]} 소득세`} value={r[0]} onChange={(v) => set(i, 0, v)} /></td>
              <td className="text-right"><NumInput label={`${names[i]} 지방소득세`} value={r[1]} onChange={(v) => set(i, 1, v)} /></td></tr>
          ))}
          <tr><th>합계</th><td className="text-right">{fmtNumberOrZero(rows.reduce((a, r) => a + r[0], 0))}</td><td className="text-right">{fmtNumberOrZero(rows.reduce((a, r) => a + r[1], 0))}</td></tr>
        </tbody>
      </table>
      <div className="flex gap-[4px]">
        <button className="ec-btn" onClick={() => setRows(init())}>자동분배</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

