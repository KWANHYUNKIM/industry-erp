import EcNumInput from '../../../components/EcNumInput'

export type InsuranceCalc = 'AUTO' | 'NONE'
/** 건강 · 고용보험 — 보수월액기준 · 자동계산 · 안함 */
export type InsuranceBasis = 'BASE' | 'AUTO' | 'NONE'
export type HouseholdType = 'HEAD' | 'MEMBER' | 'HEAD_SPOUSE'

/** 사원등록 [기타설정] — /pay-settings/employees/{id}/settings 와 같은 꼴(금액 · 명 은 입력칸 글자). */
export interface PayrollSettingForm {
  healthMode: InsuranceBasis
  healthBaseAmount: string
  healthCardNo: string
  insuranceReduction: boolean
  longTermCare: boolean
  pensionMode: InsuranceCalc
  pensionBaseAmount: string
  employmentMode: InsuranceBasis
  employmentBaseAmount: string
  spouseDeduction: boolean
  dependents: string
  children: string
  taxScale: 80 | 100 | 120
  religiousWorker: boolean
  householdType: HouseholdType
  homeless: boolean
  foreigner: boolean
  nationality: string
  nonResident: boolean
  residenceCountry: string
  singleTaxRate: boolean
  domesticDispatched: boolean
}

export interface PayrollSettingResponse {
  healthMode: InsuranceBasis
  healthBaseAmount: number | null
  healthCardNo: string | null
  insuranceReduction: boolean
  longTermCare: boolean
  pensionMode: InsuranceCalc
  pensionBaseAmount: number | null
  employmentMode: InsuranceBasis
  employmentBaseAmount: number | null
  spouseDeduction: boolean
  dependents: number
  children: number
  taxScale: 80 | 100 | 120
  religiousWorker: boolean
  householdType: HouseholdType
  homeless: boolean
  foreigner: boolean
  nationality: string | null
  nonResident: boolean
  residenceCountry: string | null
  singleTaxRate: boolean
  domesticDispatched: boolean
}

/** 원본 처음 값 — 자동계산 · 대상아님 · 가입 · 기준소득월액기준 · 공제대상아님 · 빈칸 · 100 % · 종교 부 · 세대주 · 유주택자. */
export const emptyPayrollSetting: PayrollSettingForm = {
  healthMode: 'AUTO', healthBaseAmount: '', healthCardNo: '', insuranceReduction: false, longTermCare: true,
  pensionMode: 'AUTO', pensionBaseAmount: '', employmentMode: 'AUTO', employmentBaseAmount: '',
  spouseDeduction: false, dependents: '', children: '', taxScale: 100,
  religiousWorker: false, householdType: 'HEAD', homeless: false, foreigner: false, nationality: '',
  nonResident: false, residenceCountry: '', singleTaxRate: false, domesticDispatched: false,
}

const amountText = (v: number | null) => (v == null ? '' : String(Number(v)))

export function payrollSettingForm(r: PayrollSettingResponse): PayrollSettingForm {
  return {
    healthMode: r.healthMode, healthBaseAmount: amountText(r.healthBaseAmount), healthCardNo: r.healthCardNo ?? '',
    insuranceReduction: r.insuranceReduction, longTermCare: r.longTermCare, pensionMode: r.pensionMode,
    pensionBaseAmount: amountText(r.pensionBaseAmount),
    employmentMode: r.employmentMode, employmentBaseAmount: amountText(r.employmentBaseAmount),
    spouseDeduction: r.spouseDeduction,
    dependents: r.dependents ? String(r.dependents) : '', children: r.children ? String(r.children) : '',
    taxScale: r.taxScale, religiousWorker: r.religiousWorker, householdType: r.householdType, homeless: r.homeless,
    foreigner: r.foreigner, nationality: r.nationality ?? '', nonResident: r.nonResident,
    residenceCountry: r.residenceCountry ?? '', singleTaxRate: r.singleTaxRate, domesticDispatched: r.domesticDispatched,
  }
}

export function payrollSettingBody(f: PayrollSettingForm) {
  const int = (s: string) => (s.trim() === '' ? 0 : Math.max(0, Math.trunc(Number(s) || 0)))
  const amount = (s: string) => (s === '' ? null : Number(s) || 0)
  return {
    healthMode: f.healthMode, healthBaseAmount: amount(f.healthBaseAmount), healthCardNo: f.healthCardNo,
    insuranceReduction: f.insuranceReduction, longTermCare: f.longTermCare, pensionMode: f.pensionMode,
    pensionBaseAmount: amount(f.pensionBaseAmount),
    employmentMode: f.employmentMode, employmentBaseAmount: amount(f.employmentBaseAmount),
    spouseDeduction: f.spouseDeduction,
    dependents: int(f.dependents), children: int(f.children), taxScale: f.taxScale,
    religiousWorker: f.religiousWorker, householdType: f.householdType, homeless: f.homeless,
    foreigner: f.foreigner, nationality: f.nationality, nonResident: f.nonResident,
    residenceCountry: f.residenceCountry, singleTaxRate: f.singleTaxRate, domesticDispatched: f.domesticDispatched,
  }
}

/** 원본 '자동계산' 을 고르면 뜨는 알림(2026-10-13 실측 글자 그대로). */
export const AUTO_CALC_NOTICE = '자동계산 선택 시 보수월액은 수당 항목의 비과세 항목(8종 포함)을 제외한 금액으로 계산되고 있습니다.\n\n정확한 계산을 원한다면 보수월액 기준으로 설정 바랍니다.'

/**
 * 사원등록 <b>[기타설정]</b> (원본 E090101, 2026-10-13 loginaa 실측 — 2019-002 변종호).
 *
 * <p>급여계산이 이 값으로 4대보험 · 소득세를 셈한다(EmployeePayrollSetting · PayrollService):
 * 건강 · 고용보험 '안함' · '보수월액기준' 이면 그 공제 줄이 없고(원본 실측 — 보수월액을 넣어도 대장 칸이 빈다.
 * 장기요양은 건강보험료 기준이라 같이 빈다), 보험료경감 '대상' 이면 장기요양만 0.7 배, 국민연금은 기준소득월액에 요율,
 * 소득세는 간이세액표[본인 + 배우자 + 공제대상가족] − 8~20세 자녀 공제, × 80/100/120 %. 단일세율이면 지급총액(비과세 포함) × 19 %.
 * 종교관련종사자 · 세대주여부 · 무주택자 · 외국인 · 비거주자는 원본에서도 급여 셈이 그대로였다(값만 둔다).
 *
 * <p>원본에 있으나 아직 두지 않은 칸: 우편번호 · 주소 · 외국어성명 · 주민등록번호 · 급여통장(기본 탭에 있다),
 * 사원구분 · 세무신고사업장 · 사업자단위과세 · 감면소득(감면코드 코드도움이 원본에서 안 열려 못 쟀다).
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
  const check = (checked: boolean, label: string, on: (v: boolean) => void) => (
    <label className="inline-flex shrink-0 items-center gap-[4px]">
      <input type="checkbox" checked={checked} onChange={(e) => on(e.target.checked)} /> {label}
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
            {radio('eps-health', value.healthMode === 'BASE', '보수월액기준', () => set('healthMode', 'BASE'))}
            {radio('eps-health', value.healthMode === 'AUTO', '자동계산', auto('healthMode'))}
            {radio('eps-health', value.healthMode === 'NONE', '안함', () => set('healthMode', 'NONE'))}
          </div>
          {value.healthMode === 'BASE' && (
            <div className="mt-[4px] flex items-center gap-[6px]">
              <span className="shrink-0">보수월액</span>
              <EcNumInput className="ec-input w-full text-right" placeholder="보수월액"
                          value={value.healthBaseAmount} onValue={(v) => set('healthBaseAmount', v)} />
            </div>
          )}
          <div className="mt-[4px] flex items-center gap-[6px]">
            <span className="shrink-0">증번호</span>
            <input className="ec-input w-full" placeholder="증번호" maxLength={30}
                   value={value.healthCardNo} onChange={(e) => set('healthCardNo', e.target.value)} />
          </div>
          <div className="mt-[4px]">
            <span className="mr-[8px]">보험료경감</span>
            {radio('eps-reduce', value.insuranceReduction, '대상', () => set('insuranceReduction', true))}
            {radio('eps-reduce', !value.insuranceReduction, '대상아님', () => set('insuranceReduction', false))}
          </div>
          <div className="mt-[4px]">
            <span className="mr-[8px]">장기요양보험가입여부</span>
            {radio('eps-care', value.longTermCare, '가입', () => set('longTermCare', true))}
            {radio('eps-care', !value.longTermCare, '미가입', () => set('longTermCare', false))}
          </div>
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
          <div>
            {radio('eps-employment', value.employmentMode === 'BASE', '보수월액기준', () => set('employmentMode', 'BASE'))}
            {radio('eps-employment', value.employmentMode === 'AUTO', '자동계산', auto('employmentMode'))}
            {radio('eps-employment', value.employmentMode === 'NONE', '안함', () => set('employmentMode', 'NONE'))}
          </div>
          {value.employmentMode === 'BASE' && (
            <div className="mt-[4px] flex items-center gap-[6px]">
              <span className="shrink-0">보수월액</span>
              <EcNumInput className="ec-input w-full text-right" placeholder="보수월액"
                          value={value.employmentBaseAmount} onValue={(v) => set('employmentBaseAmount', v)} />
            </div>
          )}
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
      <li className="wide">
        <span className="title">종교관련종사자</span>
        <div className="form">
          {radio('eps-religious', value.religiousWorker, '여', () => set('religiousWorker', true))}
          {radio('eps-religious', !value.religiousWorker, '부', () => set('religiousWorker', false))}
        </div>
      </li>
      <li className="wide">
        <span className="title">세대주여부</span>
        <div className="form">
          {radio('eps-household', value.householdType === 'HEAD', '세대주', () => set('householdType', 'HEAD'))}
          {radio('eps-household', value.householdType === 'MEMBER', '세대원', () => set('householdType', 'MEMBER'))}
          {radio('eps-household', value.householdType === 'HEAD_SPOUSE', '세대주의 배우자', () => set('householdType', 'HEAD_SPOUSE'))}
        </div>
      </li>
      <li className="wide">
        <span className="title">무주택자 여부</span>
        <div className="form">
          {radio('eps-homeless', value.homeless, '여(무주택자)', () => set('homeless', true))}
          {radio('eps-homeless', !value.homeless, '부(유주택자)', () => set('homeless', false))}
        </div>
      </li>
      <li className="wide">
        <span className="title">외국인</span>
        <div className="form flex items-center gap-[6px]">
          {check(value.foreigner, '외국인', (v) => set('foreigner', v))}
          <input className="ec-input w-full" placeholder="국적" maxLength={50}
                 value={value.nationality} onChange={(e) => set('nationality', e.target.value)} />
        </div>
      </li>
      <li className="wide">
        <span className="title">비거주자</span>
        <div className="form flex items-center gap-[6px]">
          {check(value.nonResident, '비거주자', (v) => set('nonResident', v))}
          <input className="ec-input w-full" placeholder="거주지국" maxLength={50}
                 value={value.residenceCountry} onChange={(e) => set('residenceCountry', e.target.value)} />
        </div>
      </li>
      <li className="wide">
        <span className="title">단일세율</span>
        <div className="form">{check(value.singleTaxRate, '단일세율', (v) => set('singleTaxRate', v))}</div>
      </li>
      <li className="wide">
        <span className="title">국내파견 근로자(고소득)</span>
        <div className="form">{check(value.domesticDispatched, '국내파견 근로자(고소득)', (v) => set('domesticDispatched', v))}</div>
      </li>
    </ul>
  )
}
