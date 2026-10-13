import EcNumInput from '../../../components/EcNumInput'

export type InsuranceCalc = 'AUTO' | 'NONE'

/** 사원등록 [기타설정] — /pay-settings/employees/{id}/settings 와 같은 꼴(금액 · 명 은 입력칸 글자). */
export interface PayrollSettingForm {
  healthMode: InsuranceCalc
  longTermCare: boolean
  pensionMode: InsuranceCalc
  pensionBaseAmount: string
  employmentMode: InsuranceCalc
  spouseDeduction: boolean
  dependents: string
  children: string
  taxScale: 80 | 100 | 120
}

export interface PayrollSettingResponse {
  healthMode: InsuranceCalc
  longTermCare: boolean
  pensionMode: InsuranceCalc
  pensionBaseAmount: number | null
  employmentMode: InsuranceCalc
  spouseDeduction: boolean
  dependents: number
  children: number
  taxScale: 80 | 100 | 120
}

/** 원본 처음 값 — 자동계산 · 가입 · 기준소득월액기준 · 공제대상아님 · 빈칸 · 100 %. */
export const emptyPayrollSetting: PayrollSettingForm = {
  healthMode: 'AUTO', longTermCare: true, pensionMode: 'AUTO', pensionBaseAmount: '',
  employmentMode: 'AUTO', spouseDeduction: false, dependents: '', children: '', taxScale: 100,
}

export function payrollSettingForm(r: PayrollSettingResponse): PayrollSettingForm {
  return {
    healthMode: r.healthMode, longTermCare: r.longTermCare, pensionMode: r.pensionMode,
    pensionBaseAmount: r.pensionBaseAmount == null ? '' : String(Number(r.pensionBaseAmount)),
    employmentMode: r.employmentMode, spouseDeduction: r.spouseDeduction,
    dependents: r.dependents ? String(r.dependents) : '', children: r.children ? String(r.children) : '',
    taxScale: r.taxScale,
  }
}

export function payrollSettingBody(f: PayrollSettingForm) {
  const int = (s: string) => (s.trim() === '' ? 0 : Math.max(0, Math.trunc(Number(s) || 0)))
  return {
    healthMode: f.healthMode, longTermCare: f.longTermCare, pensionMode: f.pensionMode,
    pensionBaseAmount: f.pensionBaseAmount === '' ? null : Number(f.pensionBaseAmount) || 0,
    employmentMode: f.employmentMode, spouseDeduction: f.spouseDeduction,
    dependents: int(f.dependents), children: int(f.children), taxScale: f.taxScale,
  }
}

/** 원본 '자동계산' 을 고르면 뜨는 알림(2026-10-13 실측 글자 그대로). */
export const AUTO_CALC_NOTICE = '자동계산 선택 시 보수월액은 수당 항목의 비과세 항목(8종 포함)을 제외한 금액으로 계산되고 있습니다.\n\n정확한 계산을 원한다면 보수월액 기준으로 설정 바랍니다.'

/**
 * 사원등록 <b>[기타설정]</b> (원본 E090101, 2026-10-13 loginaa 실측 — 2019-002 변종호).
 *
 * <p>급여계산이 이 값으로 4대보험 · 소득세를 셈한다(EmployeePayrollSetting · PayrollService):
 * 건강 · 고용보험 '안함' 이면 그 공제 줄이 없고(장기요양은 건강보험료 기준이라 같이 빈다), 국민연금은 기준소득월액에 요율,
 * 소득세는 간이세액표[본인 + 배우자 + 공제대상가족] − 8~20세 자녀 공제, × 80/100/120 %.
 *
 * <p>원본에 있으나 아직 두지 않은 칸: 우편번호 · 주소 · 외국어성명 · 주민등록번호 · 급여통장(기본 탭에 있다), 건강보험 증번호 ·
 * 보험료경감, 건강 · 고용보험 '보수월액기준'(보수월액 칸을 재지 않았다), 사원구분 · 종교관련종사자 · 세무신고사업장 · 사업자단위과세 ·
 * 세대주여부(기본 탭) · 무주택자 · 외국인 · 비거주자 · 단일세율 · 국내파견 · 감면소득.
 */
export default function EmployeePayrollSettingPanel({ value, onChange, onNotice }: {
  value: PayrollSettingForm
  onChange: (v: PayrollSettingForm) => void
  /** 원본은 건강 · 고용보험 '자동계산' 을 고르면 알림 창을 띄운다 */
  onNotice?: (msg: string) => void
}) {
  const set = <K extends keyof PayrollSettingForm>(k: K, v: PayrollSettingForm[K]) => onChange({ ...value, [k]: v })
  const radio = (name: string, checked: boolean, label: string, on: () => void) => (
    <label className="inline-flex items-center gap-[4px] mr-[10px]">
      <input type="radio" name={name} checked={checked} onChange={on} /> {label}
    </label>
  )
  const auto = (k: 'healthMode' | 'employmentMode') => () => {
    set(k, 'AUTO')
    onNotice?.(AUTO_CALC_NOTICE)
  }
  return (
    <ul className="ec-form">
      <li className="wide">
        <span className="title">건강보험</span>
        <div className="form">
          <div>
            {radio('eps-health', value.healthMode === 'AUTO', '자동계산', auto('healthMode'))}
            {radio('eps-health', value.healthMode === 'NONE', '안함', () => set('healthMode', 'NONE'))}
          </div>
          {value.healthMode === 'AUTO' && (
            <div className="mt-[4px]">
              <span className="mr-[8px]">장기요양보험가입여부</span>
              {radio('eps-care', value.longTermCare, '가입', () => set('longTermCare', true))}
              {radio('eps-care', !value.longTermCare, '미가입', () => set('longTermCare', false))}
            </div>
          )}
        </div>
      </li>
      <li className="wide">
        <span className="title">국민연금</span>
        <div className="form">
          <div>
            {radio('eps-pension', value.pensionMode === 'AUTO', '기준소득월액기준', () => set('pensionMode', 'AUTO'))}
            {radio('eps-pension', value.pensionMode === 'NONE', '안함', () => set('pensionMode', 'NONE'))}
          </div>
          {value.pensionMode === 'AUTO' && (
            <div className="mt-[4px] flex items-center gap-[6px]">
              <span className="shrink-0">기준소득월액</span>
              <EcNumInput className="ec-input w-full text-right" placeholder="기준소득월액"
                          value={value.pensionBaseAmount} onValue={(v) => set('pensionBaseAmount', v)} />
            </div>
          )}
        </div>
      </li>
      <li className="wide">
        <span className="title">고용보험</span>
        <div className="form">
          {radio('eps-employment', value.employmentMode === 'AUTO', '자동계산', auto('employmentMode'))}
          {radio('eps-employment', value.employmentMode === 'NONE', '안함', () => set('employmentMode', 'NONE'))}
        </div>
      </li>
      <li className="wide">
        <span className="title">배우자</span>
        <div className="form">
          {radio('eps-spouse', value.spouseDeduction, '공제', () => set('spouseDeduction', true))}
          {radio('eps-spouse', !value.spouseDeduction, '공제대상아님', () => set('spouseDeduction', false))}
        </div>
      </li>
      <li className="wide">
        <span className="title">공제대상가족(본인, 배우자 제외)</span>
        <div className="form">
          <div className="flex items-center gap-[6px]">
            <EcNumInput className="ec-input w-full text-right" placeholder="공제대상가족(본인, 배우자 제외)"
                        value={value.dependents} onValue={(v) => set('dependents', v)} />
            <span className="shrink-0">명</span>
          </div>
          <div className="mt-[4px] flex items-center gap-[6px]">
            <span className="shrink-0">공제대상가족중 8세이상 20세이하 자녀수</span>
            <EcNumInput className="ec-input w-full text-right" placeholder="공제대상가족중 8세이상 20세이하 자녀수"
                        value={value.children} onValue={(v) => set('children', v)} />
            <span className="shrink-0">명</span>
          </div>
        </div>
      </li>
      <li className="wide">
        <span className="title">간이세액표 적용방법</span>
        <div className="form">
          {([80, 100, 120] as const).map((p) => (
            <span key={p}>{radio('eps-scale', value.taxScale === p, `${p} %`, () => set('taxScale', p))}</span>
          ))}
        </div>
      </li>
    </ul>
  )
}
