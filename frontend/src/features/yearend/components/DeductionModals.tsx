import { useState } from 'react'
import Modal from '../../../components/Modal'
import { ecAlert, requireSelection } from '../../../components/EcDialog'
import { extractErrorMessage } from '../../../api/client'
import { won, yearEndApi, type Deduction, type DeductionKind, type PrevEmployer, type Settlement } from '../api'
import { NumInput } from './parts'
import { EcDateRange } from '../../../components/ui/EcDateInput'
import { pad2 } from '../../../utils/periods'

const today = new Date()

/** 원본 (11) 근무기간 기본값 — 귀속연도 1월 1일 ~ 귀속연도의 오늘(2025/01/01 ~ 2025/10/13 실측). */
const blankPrev = (year: number): PrevEmployer => ({
  bizNo: '', companyName: '', periodFrom: `${year}-01-01`, periodTo: `${year}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`,
  salary: 0, bonus: 0, otherPay: 0, nonTaxable: 0, reducedIncome: 0, nationalPension: 0, otherPension: 0,
  healthInsurance: 0, employmentInsurance: 0, decidedIncomeTax: 0, decidedLocalTax: 0, decidedRuralTax: 0,
})

/**
 * `종(전)근무지 및 납세조합` 창(plans/세무/연말정산.md 3.1) — 위 목록 · [신규(F2)] · 사업자번호를 누르면 아래 입력 표.
 * 저장하면 원본 안내 셋째 줄까지 그대로. 결정세액은 <b>저장 직전 계산</b> 기준이다(계산처리 전이면 0원 — 원본도 그렇다).
 */
export function PrevEmployerModal({ s, onClose, onSaved }: { s: Settlement; onClose: () => void; onSaved: (s: Settlement) => void }) {
  const [rows, setRows] = useState<PrevEmployer[]>(s.prevEmployers)
  const [edit, setEdit] = useState<{ i: number; p: PrevEmployer } | null>(s.prevEmployers.length ? null : { i: -1, p: blankPrev(s.attributionYear) })
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const set = (patch: Partial<PrevEmployer>) => edit && setEdit({ ...edit, p: { ...edit.p, ...patch } })

  async function persist(next: PrevEmployer[]) {
    setError('')
    try {
      const saved = await yearEndApi.savePrevEmployers(s.id, next)
      setRows(saved.prevEmployers)
      onSaved(saved)
      return saved
    } catch (e) {
      const m = extractErrorMessage(e)
      if (m === '사업자등록번호를 입력하세요.') await ecAlert(m)
      else setError(m)
      return null
    }
  }

  async function save() {
    if (!edit) return
    if (!edit.p.bizNo.trim()) { await ecAlert('사업자등록번호를 입력하세요.'); return }
    const next = edit.i < 0 ? [...rows, edit.p] : rows.map((r, i) => (i === edit.i ? edit.p : r))
    const saved = await persist(next)
    if (!saved) return
    setEdit(null)
    await ecAlert(`현재 입력된 자료 기준으로 결정세액 ${won(saved.decidedIncomeTax)}원으로 계산되었습니다.\n추가자료를 입력해도 더 발생되는 공제혜택은 없습니다.\n※ 공제자료를 다시 수정할 경우 결정세액이 달라질 수 있습니다.`)
  }

  async function removePicked() {
    if (!requireSelection(picked.size)) return
    await persist(rows.filter((_, i) => !picked.has(i)))
    setPicked(new Set())
  }

  const p = edit?.p
  const total = p ? p.salary + p.bonus + p.otherPay : 0
  return (
    <Modal open title="종(전)근무지 및 납세조합" onClose={onClose} width={900} error={error}>
      <ul className="ec-alert mb-[8px] list-none">
        <li>종(전)근무지 또는 이중근로자의 종(전)근무지 및 납세조합 내역을 작성합니다.</li>
        <li>신규 등록은 [신규(F2)] 버튼을 클릭합니다.</li>
        <li>등록된 내역을 수정하려면 사업자등록번호를 클릭합니다.</li>
      </ul>
      <table className="w-full text-center mb-[8px]">
        <thead><tr><th className="w-[36px]" /><th>사업자등록번호</th><th>근무처명</th><th>과세소득 계</th><th>비과세소득 계</th><th>감면소득 계</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr> : rows.map((r, i) => (
            <tr key={i}>
              <td><input type="checkbox" aria-label={`${r.companyName} 선택`} checked={picked.has(i)}
                         onChange={() => setPicked((x) => { const n = new Set(x); if (n.has(i)) n.delete(i); else n.add(i); return n })} /></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); setEdit({ i, p: r }) }}>{r.bizNo}</a></td>
              <td className="text-left">{r.companyName}</td>
              <td className="text-right">{won(r.salary + r.bonus + r.otherPay)}</td>
              <td className="text-right">{won(r.nonTaxable)}</td>
              <td className="text-right">{won(r.reducedIncome)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {p && (
        <table className="w-full mb-[8px]">
          <thead><tr><th>항목</th><th>내용</th><th>항목</th><th>내용</th></tr></thead>
          <tbody>
            <tr><th>근로소득유형</th><td>갑종(종,전)</td><th>국민연금보험료</th><td><NumInput label="국민연금보험료" value={p.nationalPension} onChange={(v) => set({ nationalPension: v })} /></td></tr>
            <tr><th>(9) 근무처명</th><td><input className="ec-input w-[200px]" aria-label="근무처명" value={p.companyName} onChange={(e) => set({ companyName: e.target.value })} /></td>
              <th>기타연금보험료</th><td><NumInput label="기타연금보험료" value={p.otherPension} onChange={(v) => set({ otherPension: v })} /></td></tr>
            <tr><th>(10) 사업자등록번호</th><td><input className="ec-input w-[200px]" aria-label="사업자등록번호" value={p.bizNo} onChange={(e) => set({ bizNo: e.target.value })} /></td>
              <th>건강보험료</th><td><NumInput label="건강보험료" value={p.healthInsurance} onChange={(v) => set({ healthInsurance: v })} /></td></tr>
            <tr><th>(11) 근무기간</th><td>
                <EcDateRange from={{ className: "ec-input w-[140px]", 'aria-label': "근무기간 시작", value: p.periodFrom ?? '', onChange: (e) => set({ periodFrom: e.target.value || null }) }} to={{ className: "ec-input w-[140px]", 'aria-label': "근무기간 끝", value: p.periodTo ?? '', onChange: (e) => set({ periodTo: e.target.value || null }) }} />
              </td>
              <th>고용보험료</th><td><NumInput label="고용보험료" value={p.employmentInsurance} onChange={(v) => set({ employmentInsurance: v })} /></td></tr>
            <tr><th>(13) 급여</th><td><NumInput label="급여" value={p.salary} onChange={(v) => set({ salary: v })} /></td>
              <th>(73) 결정세액 소득세</th><td><NumInput label="결정세액 소득세" value={p.decidedIncomeTax} onChange={(v) => set({ decidedIncomeTax: v })} /></td></tr>
            <tr><th>(14) 상여</th><td><NumInput label="상여" value={p.bonus} onChange={(v) => set({ bonus: v })} /></td>
              <th>(73) 결정세액 지방소득세</th><td><NumInput label="결정세액 지방소득세" value={p.decidedLocalTax} onChange={(v) => set({ decidedLocalTax: v })} /></td></tr>
            <tr><th>(15) 인정상여</th><td><NumInput label="인정상여" value={p.otherPay} onChange={(v) => set({ otherPay: v })} /></td>
              <th>(73) 결정세액 농특세</th><td><NumInput label="결정세액 농특세" value={p.decidedRuralTax} onChange={(v) => set({ decidedRuralTax: v })} /></td></tr>
            <tr><th>(16) 합계</th><td className="text-right">{won(total)}</td><th>비과세소득 계</th><td><NumInput label="비과세소득" value={p.nonTaxable} onChange={(v) => set({ nonTaxable: v })} /></td></tr>
          </tbody>
        </table>
      )}
      <div className="flex gap-[4px]">
        {p ? (
          <>
            <button className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
            <button className="ec-btn" onClick={() => setEdit({ i: edit!.i, p: blankPrev(s.attributionYear) })}>다시작성</button>
          </>
        ) : (
          <>
            <button className="ec-btn ec-btn-primary" onClick={() => setEdit({ i: -1, p: blankPrev(s.attributionYear) })}>신규(F2)</button>
            <button className="ec-btn" onClick={removePicked}>선택삭제</button>
          </>
        )}
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

const KIND_LABEL: Record<DeductionKind, string> = {
  PROTECTION_INSURANCE: '보장성보험료', DISABLED_INSURANCE: '장애인 전용 보장성 보험료', MEDICAL: '의료비',
}
const blankDed = (kind: DeductionKind | null, unlimited: boolean): Deduction =>
  ({ kind, targetName: '', relation: '', dataSource: 'NTS', unlimited, amount: 0, receiptCount: null })
const threeRows = (have: Deduction[], blank: () => Deduction) => [...have, ...Array.from({ length: Math.max(0, 3 - have.length) }, blank)]

/**
 * `보험료 세액공제` 창(3.2) · `의료비` 창(3.3) — 줄 3개. 대상자는 본인 하나(가족 등록은 아직 없다).
 * 금액만 넣고 보험료 구분을 비우면 원본 문구 `보험료 구분을 입력 바랍니다.`
 */
export function DeductionModal({ s, group, empName, onClose, onSaved }: {
  s: Settlement; group: 'INSURANCE' | 'MEDICAL'; empName: string; onClose: () => void; onSaved: (s: Settlement) => void
}) {
  const medical = group === 'MEDICAL'
  const mine = s.deductions.filter((d) => (medical ? d.kind === 'MEDICAL' : d.kind !== 'MEDICAL'))
  const [rows, setRows] = useState<Deduction[]>(threeRows(mine, () => blankDed(medical ? 'MEDICAL' : null, true)))
  const [error, setError] = useState('')
  const setRow = (i: number, patch: Partial<Deduction>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  async function save() {
    const filled = rows.filter((r) => r.amount || r.targetName || (!medical && r.kind))
    if (!medical && filled.some((r) => !r.kind)) { await ecAlert('보험료 구분을 입력 바랍니다.'); return }
    setError('')
    try {
      onSaved(await yearEndApi.saveDeductions(s.id, group, filled))
      onClose()   // 원본: 저장하면 안내 없이 닫힌다
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  return (
    <Modal open title={medical ? '의료비' : '보험료 세액공제'} onClose={onClose} width={medical ? 1000 : 760} error={error}>
      <ul className="ec-alert mb-[8px] list-none">
        {medical ? (
          <>
            <li>의료비 세액공제:</li>
            <li>의료비 세액공제 대상금액의 15%(난임시술비는 30%, 미숙아·선천성이상아 의료비는 20%)를 근로소득 산출세액에서 공제</li>
          </>
        ) : (
          <>
            <li>대상자 및 자료 구분, 보험료 구분을 선택하고 납입금액을 작성합니다.</li>
            <li>- 부양가족이 기본공제대상자인 경우에 한하여 대상자로 선택 가능합니다.</li>
            <li>보장성보험료는 보험료 납입액의 12%가 세액공제됩니다.</li>
            <li>- 장애인 전용 보장성 보험료의 경우 납입액의 15% 세액공제</li>
            <li>보장성 보험료는 공제대상금액 기준 연간 100만원, 세액공제액 기준 연간 12만원을 한도로 하여 공제됩니다.</li>
            <li>- 장애인 전용 보장성 보험료는 공제대상금액 기준 연간 100만원, 세액공제액 기준 연간 15만원을 한도로 하여 공제됩니다.</li>
          </>
        )}
      </ul>
      <table className="w-full text-center mb-[8px]">
        <thead>
          {medical ? (
            <tr><th>대상자</th><th>구분</th><th>의료증빙코드</th><th>난임/미숙아 여부</th><th>지급처 사업자등록번호</th><th>지급처 상호</th><th>건수</th><th>금액</th></tr>
          ) : (
            <tr><th>대상자</th><th>자료구분</th><th>보험료 구분</th><th>납입금액</th></tr>
          )}
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <select className="ec-input w-[150px]" aria-label={`대상자 ${i + 1}`} value={r.targetName}
                        onChange={(e) => setRow(i, { targetName: e.target.value, relation: e.target.value ? '본인' : '', unlimited: true })}>
                  <option value="">대상자 선택</option>
                  <option value={empName}>{empName}</option>
                </select>
              </td>
              {medical ? (
                <>
                  <td>{r.relation}</td>
                  <td>
                    <select className="ec-input w-[210px]" aria-label={`의료증빙코드 ${i + 1}`} value={r.dataSource} onChange={(e) => setRow(i, { dataSource: e.target.value as Deduction['dataSource'] })}>
                      <option value="NTS">국세청장이 제공하는 의료비자료</option>
                      <option value="OTHER">그 밖의 의료비 증빙</option>
                    </select>
                  </td>
                  <td>해당없음</td>
                  <td><input className="ec-input w-[120px]" aria-label={`지급처 사업자등록번호 ${i + 1}`} disabled /></td>
                  <td><input className="ec-input w-[120px]" aria-label={`지급처 상호 ${i + 1}`} disabled /></td>
                  <td><input className="ec-input w-[60px] text-right" aria-label={`건수 ${i + 1}`} value={r.receiptCount ?? ''}
                             onChange={(e) => setRow(i, { receiptCount: Number(e.target.value.replace(/\D/g, '')) || null })} /></td>
                  <td><NumInput label={`금액 ${i + 1}`} value={r.amount} onChange={(v) => setRow(i, { amount: v })} /></td>
                </>
              ) : (
                <>
                  <td>
                    <select className="ec-input w-[120px]" aria-label={`자료구분 ${i + 1}`} value={r.dataSource} onChange={(e) => setRow(i, { dataSource: e.target.value as Deduction['dataSource'] })}>
                      <option value="NTS">국세청 자료</option>
                      <option value="OTHER">그밖의 자료</option>
                    </select>
                  </td>
                  <td>
                    <select className="ec-input w-[200px]" aria-label={`보험료 구분 ${i + 1}`} value={r.kind ?? ''} onChange={(e) => setRow(i, { kind: (e.target.value || null) as DeductionKind | null })}>
                      <option value="" />
                      <option value="PROTECTION_INSURANCE">{KIND_LABEL.PROTECTION_INSURANCE}</option>
                      <option value="DISABLED_INSURANCE">{KIND_LABEL.DISABLED_INSURANCE}</option>
                    </select>
                  </td>
                  <td><NumInput label={`납입금액 ${i + 1}`} value={r.amount} onChange={(v) => setRow(i, { amount: v })} /></td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-[4px]">
        <button className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
        <button className="ec-btn" onClick={() => setRows(threeRows([], () => blankDed(medical ? 'MEDICAL' : null, true)))}>다시작성</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

