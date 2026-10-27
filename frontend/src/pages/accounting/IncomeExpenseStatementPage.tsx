import { useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import CodePickerField from '../../components/CodePickerField'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * 회계 I › 출력물 › 주요재무제표 › <b>수입지출명세서</b>(E010832) — 2026-10-20 loginaa 실측.
 *
 * <p>조건: 기준일자(달 구간) · 부서 · 프로젝트 · 구분 [7세목까지인쇄] · 표시방법 ◉집계 ○부서 ○프로젝트 · 인쇄 ◉일반 ○월별 ·
 * [사용중단/삭제포함] · 기타 [결재방표시] [천단위] [금액0포함]. 표 머리 두 줄 — 관 · 항 · 목 · 세목 · 2 ~ 7세목 · 금월(~오늘) · 누계 ·
 * 예산(금월 · 누계 · 누계 % · 연집계 · %).
 *
 * <p>관 · 항 · 목(수입지출 과목 체계)은 원본도 이 회사에 설정이 없어 [검색(F8)] 이 '등록된 데이터가 없습니다.' 였다. 우리도 과목 체계가
 * 없어(계정표 결정 대기와 같은 덩어리) 빈 표를 그린다 — 과목 체계를 들이면 그 집계를 여기 붙인다.
 */
export default function IncomeExpenseStatementPage() {
  const now = new Date()
  const [fromYm, setFromYm] = useState(`${now.getFullYear()}-01`)
  const [toYm, setToYm] = useState(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`)
  const [show, setShow] = useState('집계')
  const [print, setPrint] = useState('일반')
  const [searched, setSearched] = useState(false)
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const deptProject = useDeptProjectItems()
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '수입지출명세서', [])

  return (
    <EcListShell title="수입지출명세서" actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자" span={2}>
          <input type="month" className="ec-input w-[130px]" aria-label="시작월" value={fromYm} onChange={(e) => setFromYm(e.target.value)} />
          <span className="mx-[4px]">~</span>
          <input type="month" className="ec-input w-[130px]" aria-label="끝월" value={toYm} onChange={(e) => setToYm(e.target.value)} />
        </EcCond>
        <EcCond label="부서" pick><CodePickerField label="부서" hideLabel width={220} emptyLabel="전체" value={dept} onChange={setDept} items={deptProject.departments} /></EcCond>
        <EcCond label="프로젝트" pick><CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={project} onChange={setProject} items={deptProject.projects} /></EcCond>
        <EcCond label="구분"><label><input type="checkbox" /> 7세목까지인쇄</label></EcCond>
        <EcCond label="표시방법">
          {['집계', '부서', '프로젝트'].map((v) => (
            <label key={v} className="mr-[10px]"><input type="radio" checked={show === v} onChange={() => setShow(v)} /> {v}</label>
          ))}
        </EcCond>
        <EcCond label="인쇄">
          {['일반', '월별'].map((v) => (
            <label key={v} className="mr-[10px]"><input type="radio" checked={print === v} onChange={() => setPrint(v)} /> {v}</label>
          ))}
          <label><input type="checkbox" /> 사용중단/삭제포함</label>
        </EcCond>
        <EcCond label="기타">
          <label className="mr-[10px]"><input type="checkbox" /> 결재방표시</label>
          <label className="mr-[10px]"><input type="checkbox" /> 천단위</label>
          <label><input type="checkbox" /> 금액0포함</label>
        </EcCond>
        <li className="full">
          <div className="form">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => setSearched(true)}>검색(F8)</button>
          </div>
        </li>
      </ul>

      <table ref={tableRef} className="ec-head700 w-full text-left">
        <thead>
          <tr>
            {['관', '항', '목', '세목', '2세목', '3세목', '4세목', '5세목', '6세목', '7세목', '금월(~오늘)', '누계'].map((h) => (
              <th key={h} rowSpan={2} className="text-center">{h}</th>
            ))}
            <th colSpan={5} className="text-center">예산</th>
          </tr>
          <tr>
            {['금월(~오늘)', '누계', '누계 %', '연집계', '%'].map((h) => <th key={h} className="text-center">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {searched && <tr><td colSpan={17} className="ec-empty" title={`${fromYm} ~ ${toYm} · 부서 ${dept || '전체'} · 프로젝트 ${project || '전체'}`}>등록된 데이터가 없습니다.</td></tr>}
        </tbody>
      </table>
    </EcListShell>
  )
}
