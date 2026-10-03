import { useRef } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

const ALLOWANCES = [
  { code: '02', name: '일근무', order: 1, method: '변동(일)', rate: '', record: '', tax: '전액과세', formula: 'R( 일근무(급여지급사항) * 일근무(근무기록확정) , 0 )' },
]
const DEDUCTIONS = [
  { code: '01', name: '소득세', order: 1, formula: 'R( 소득세(급여지급사항) , 0 )' },
  { code: '02', name: '지방소득세', order: 2, formula: 'R( 지방소득세(급여지급사항) , 0 )' },
]

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 기본사항 등록 &gt; <b>일용근로 수당등록</b>(원본 E020136 '일용근로 수당리스트') ·
 * <b>일용근로 공제등록</b>(E020137 '일용근로 공제리스트').
 *
 * <p>2026-10-03 loginaa 실측: 수당리스트 열 수당항목코드 · 수당항목명 · 표시순서 · 지급유형 · 배율 · 근무기록 · 과세구분 · 계산식 · 산출방법,
 * 기본 항목 02 일근무(변동(일) · 전액과세 · R( 일근무(급여지급사항) * 일근무(근무기록확정) , 0 )).
 * 공제리스트 열 공제항목코드 · 공제항목명 · 표시순서 · 계산식 · 산출방법, 01 소득세 R( 소득세(급여지급사항) , 0 ) · 02 지방소득세.
 * 버튼 저장(F8) · 사용중단/재사용 · 사용중단포함 · 웹자료올리기 · H.
 *
 * <p>우리 일용근로 급여계산(DailyPayService)은 이 세 계산식을 그대로 셈한다. 항목을 더하거나 계산식을 고치는 것은 아직 없다 —
 * 그래서 이 화면은 보기만 한다(빈 줄 · 저장 · 사용중단 · 웹자료올리기 · H 없음).
 */
export default function DailyPayItemListPage({ kind = 'ALLOWANCE' }: { kind?: 'ALLOWANCE' | 'DEDUCTION' }) {
  const allowance = kind === 'ALLOWANCE'
  const title = allowance ? '일용근로 수당리스트' : '일용근로 공제리스트'
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [kind])

  return (
    <EcListShell title={title} searchable={false}>
      <p className="ec-alert ec-alert-info mb-[8px]">일용근로 급여계산은 아래 계산식대로 셈합니다. 항목 추가 · 계산식 수정은 아직 지원하지 않습니다.</p>
      <div className="overflow-x-auto">
        {allowance ? (
          <table ref={tableRef} className="w-full text-left">
            <thead>
              <tr>
                <th className="w-[34px]"></th>
                <th>수당항목코드</th>
                <th>수당항목명</th>
                <th className="text-right">표시순서</th>
                <th>지급유형</th>
                <th className="text-right">배율</th>
                <th>근무기록</th>
                <th>과세구분</th>
                <th>계산식</th>
              </tr>
            </thead>
            <tbody>
              {ALLOWANCES.map((r, i) => (
                <tr key={r.code}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td className="text-right">{r.order}</td>
                  <td>{r.method}</td>
                  <td className="text-right">{r.rate}</td>
                  <td>{r.record}</td>
                  <td>{r.tax}</td>
                  <td>{r.formula}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table ref={tableRef} className="w-full text-left">
            <thead>
              <tr>
                <th className="w-[34px]"></th>
                <th>공제항목코드</th>
                <th>공제항목명</th>
                <th className="text-right">표시순서</th>
                <th>계산식</th>
              </tr>
            </thead>
            <tbody>
              {DEDUCTIONS.map((r, i) => (
                <tr key={r.code}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td className="text-right">{r.order}</td>
                  <td>{r.formula}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </EcListShell>
  )
}
