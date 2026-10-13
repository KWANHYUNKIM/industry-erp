import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { api, extractErrorMessage } from '../../api/client'
import { yearEndApi, type Settlement, type SettlementKind } from '../../features/yearend/api'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { CandidateModal, InstallmentModal, ReceiptModal, SettlementFormModal } from '../../features/yearend/components/SettlementModals'

type Emp = { id: number; code: string; name: string; resignDate?: string | null }
type Company = { name?: string; bizRegNo?: string }

/** 원본 퇴사일 YY.MM.DD */
const yymmdd = (d?: string | null) => (d ? d.slice(2).replace(/-/g, '.') : '')

/**
 * 연말정산등록/수정 (원본 세무 › 원천징수 › 연말정산 › 정산내역등록/수정 E030109, plans/세무/연말정산.md 1장).
 * 화면 제목은 메뉴 이름(정산내역등록/수정)과 달리 '연말정산등록/수정'. 조건은 접혀 있다 — 귀속연도(기본 작년) ·
 * 원천세신고 사업자등록번호 · 사원번호 · 기타 [기부금 조정명세 입력 대상]. 격자 18열(분납처리 포함).
 * 버튼 [계산처리] · [대상자추가] · Email · 인쇄 · [선택삭제] · [지급명세서 바로가기].
 *
 * <p>중도정산(E030114)도 같은 서식이라 kind 만 바꿔 쓴다(대상자 = 귀속연도 퇴사자, 분납처리 열 없음, 퇴사일자 조건).
 */
export default function YearEndSettlementPage({ kind = 'YEAR_END' }: { kind?: SettlementKind }) {
  const mid = kind === 'MID_TERM'
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(mid ? thisYear : thisYear - 1)
  const [condEmp, setCondEmp] = useState('')
  const [donation, setDonation] = useState(false)
  const [rows, setRows] = useState<Settlement[]>([])
  const [shownYear, setShownYear] = useState(year)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [emps, setEmps] = useState<Emp[]>([])
  const [company, setCompany] = useState<Company | null>(null)
  const [adding, setAdding] = useState(false)
  const [formId, setFormId] = useState<number | null>(null)
  const [receipt, setReceipt] = useState<Settlement | null>(null)
  const [installment, setInstallment] = useState<Settlement | null>(null)
  const [error, setError] = useState('')
  const kindName = mid ? '중도정산' : '연말정산'

  function load(y = year) {
    setError('')
    yearEndApi.list(y, kind)
      .then((r) => {
        // [기부금 조정명세 입력 대상] — 기부금 이월 조정명세가 있는 사람만. 우리는 기부금 공제를 아직 못 넣어(남은 것) 켜면 아무도 없다.
        const byEmp = condEmp ? r.filter((x) => String(x.employeeId) === condEmp) : r
        setRows(donation ? [] : byEmp); setShownYear(y); setPicked(new Set())
      })
      .catch((e) => { setRows([]); setError(extractErrorMessage(e)) })
  }
  useEffect(() => {
    load()
    api.get<Emp[]>('/employees/all').then((r) => setEmps(r.data)).catch(() => setEmps([]))
    api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emp = (id: number) => emps.find((e) => e.id === id)
  const nameOf = (id: number) => emp(id)?.name ?? ''

  async function calculate() {
    if (picked.size === 0) { await ecAlert('계산처리할 사원이 선택되지 않았습니다.'); return }
    try {
      const done = await yearEndApi.calculate([...picked])
      const codes = done.map((d) => emp(d.employeeId)?.code ?? '').join('\n')
      await ecAlert(`처리가 완료 되었습니다.\n----- 성공(${done.length}건) ----------------------\n${codes}`)
      load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function removePicked() {
    if (picked.size === 0) { await ecAlert('삭제할 사원이 선택되지 않았습니다.'); return }
    if (!(await ecConfirm(`체크한 사원의 ${kindName} 내역이 사라지고 리스트에서 제외됩니다.\n삭제한 데이터는 복구되지 않습니다.\n삭제하겠습니까?`))) return
    try {
      await yearEndApi.remove([...picked])
      load()   // 원본: 안내 없이 줄이 사라진다
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const allPicked = rows.length > 0 && picked.size === rows.length
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const link = (label: string, on?: () => void) =>
    on ? <a href="#" onClick={(e) => { e.preventDefault(); on() }}>{label}</a> : <span className="text-ec-navy">{label}</span>
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i)
  const colCount = mid ? 17 : 18
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, `${kindName}등록/수정`, [rows.length, mid])

  return (
    <EcListShell
      title={`${kindName}등록/수정`}
      onSearch={() => load()}
      collapseConditions
      actions={[
        { label: '계산처리', onClick: calculate, primary: true },
        { label: '대상자추가', onClick: () => setAdding(true) },
        { label: 'Email', disabled: true },   // 바깥 발송 — 누르지 않는다
        { label: '인쇄' },
        // 원본은 빈 선택에 이 화면 문구('삭제할 사원이 선택되지 않았습니다.')를 띄운다 — 셸의 공용 문구 대신 removePicked 가 띄우게 0 은 넘기지 않는다
        { label: '선택삭제', onClick: removePicked, selected: picked.size || undefined },
        ...(mid ? [] : [{ label: '지급명세서 바로가기', disabled: true }]),
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="귀속연도">
          <select className="ec-input w-[100px]" aria-label="귀속연도" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </EcCond>
        <EcCond label="원천세신고 사업자등록번호">
          <select className="ec-input w-[260px]" aria-label="원천세신고 사업자등록번호" value="" disabled>
            <option value="">{company?.name ? `${company.name} ${company.bizRegNo ?? ''}` : '전체'}</option>
          </select>
        </EcCond>
        <EcCond label="사원번호" pick>
          <CodePickerField label="사원번호" hideLabel width={200} emptyLabel="전체" value={condEmp} onChange={setCondEmp}
                           items={emps.map((e) => ({ value: String(e.id), code: e.code, name: e.name }))} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={donation} onChange={(e) => setDonation(e.target.checked)} /> 기부금 조정명세 입력 대상
          </label>
        </EcCond>
        <li><button className="ec-btn ec-btn-primary" onClick={() => load()}>검색(F8)</button></li>
      </ul>

      <p className="text-right mb-[4px]">회사명 : {company?.name ?? ''} / 귀속연도 : {shownYear}년도</p>

      <table ref={tableRef} className="w-full text-center">
        <thead>
          <tr>
            <th className="w-[36px]">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} />
            </th>
            <th>성명</th><th>사번</th><th>주민등록번호</th><th>원천징수연월</th><th>정산내역등록</th>
            {!mid && <th>분납처리</th>}
            <th>원천징수부</th><th>원천징수영수증</th><th>의료비명세서</th><th>기부금명세서</th><th>연금·저축명세서</th>
            <th>신용카드소득공제신청서</th><th>월세액·거주자간주택임차차입금명세서</th><th>출산지원금비과세적용명세서</th>
            <th>소득·세액공제신고서</th><th>퇴사일</th><th>메모</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={colCount} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">
                <input type="checkbox" aria-label={`${nameOf(r.employeeId)} 선택`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                {' '}{i + 1}
              </td>
              <td className="text-left">{nameOf(r.employeeId)}</td>
              <td>{emp(r.employeeId)?.code ?? ''}</td>
              <td />
              <td>{r.withholdingMonth ? r.withholdingMonth.replace('-', '/') : ''}</td>
              <td>{link('등록', () => setFormId(r.id))}</td>
              {!mid && <td>{link('입력', () => setInstallment(r))}</td>}
              <td>{link('조회')}</td>
              <td>{link('조회', () => setReceipt(r))}</td>
              <td>{link('조회')}</td>
              <td>{link('입력')}</td>
              <td>{link('조회')}</td>
              <td>{link('조회')}</td>
              <td>{link('조회')}</td>
              <td>{link('입력')}</td>
              <td>{link('조회')}</td>
              <td>{yymmdd(emp(r.employeeId)?.resignDate)}</td>
              <td className="text-left">{r.memo ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {adding && <CandidateModal year={year} kind={kind} onClose={() => setAdding(false)} onApplied={() => { setAdding(false); load() }} />}
      {formId !== null && (
        <SettlementFormModal id={formId} empName={nameOf(rows.find((r) => r.id === formId)?.employeeId ?? 0)}
                             onClose={() => setFormId(null)} onChanged={() => load()} />
      )}
      {receipt && <ReceiptModal s={receipt} empName={nameOf(receipt.employeeId)} onClose={() => setReceipt(null)} />}
      {installment && <InstallmentModal s={installment} onClose={() => setInstallment(null)} />}
    </EcListShell>
  )
}
