import EcSettingSheet, { type SheetSection } from '../../components/EcSettingSheet'

/**
 * Self-Customizing > 환경설정 > 기본값설정 (원본 C001124).
 *
 * <p>원본은 [공통] 알약 하나 아래 '공통 기본값 설정 · 입력 기본값 설정 · 출력 기본값 설정 · 회계 기본값 설정'
 * 판을 펴 둔다(글꼴 · 숫자 소수점 · 0값표시 · 반올림 · 날짜형식 · 인쇄 여백 …). 틀은 기능설정과 같다.
 *
 * <p>우리 ERP 는 이 값들을 고를 수 없고 코드에 박혀 있다. 그래서 <b>코드에서 확인한 것만</b> 고정값으로 보인다:
 * 부가세 반올림(trade/VatAllocator — HALF_UP, 원 단위) · 날짜형식 2026/10/03(utils/dateText) ·
 * 천단위 콤마 · 소수점 점(toLocaleString('ko-KR')). 확인 못 한 것(공급가액 처리 · 소계/합계 표시 · 인쇄 여백)은 싣지 않는다.
 */
const TABS = ['공통'] as const

function today() {
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

const SHEET: Record<typeof TABS[number], SheetSection[]> = {
  공통: [
    { title: '공통 기본값 설정', groups: [
      { title: '숫자형항목', rows: [
        { label: '천단위구분기호', value: ',(콤마)' },
        { label: '소수점구분기호', value: '.(점)' },
      ] },
    ] },
    { title: '입력 기본값 설정', groups: [
      { title: '소수점이하 처리방법', rows: [{ label: '부가세', value: '반올림' }] },
      { title: '날짜 및 시간', rows: [{ label: '날짜형식', value: today() }] },
    ] },
    { title: '출력 기본값 설정', groups: [
      { title: '날짜 및 시간', rows: [{ label: '날짜형식', value: today() }] },
    ] },
  ],
}

export default function DefaultsPage() {
  return <EcSettingSheet title="기본값설정" tabs={TABS} sheet={SHEET} />
}
