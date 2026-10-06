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
}

/** 원본 [신규] 창의 기본값 — 귀속 · 지급연월은 이번 달, 신고일자는 이번 달 10일. */
function blankForm(): FormState {
  const today = ymd(new Date())
  return {
    filingType: 'REGULAR', filingMethod: 'MONTHLY',
    attributionMonth: today.slice(0, 7), payMonth: today.slice(0, 7),
    reportDate: `${today.slice(0, 7)}-10`, includeYearEnd: false,
  }
}

function ReturnsView() {
  const [rows, setRows] = useState<WithholdingReturn[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [formError, setFormError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [viewing, setViewing] = useState<WithholdingReturn | null>(null)

  function load() {
    setError('')
    api.get<WithholdingReturn[]>('/withholding/returns')
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
            <th>영수증</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
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
                  })
                }}>{r.attributionMonth.replace('-', '/')}</a>
              </td>
              <td>{r.filingMethodName}{r.includeYearEnd ? '(연말정산)' : ''}</td>
              <td>{r.payMonth.replace('-', '/')}</td>
              <td>{r.reportDate.replace(/-/g, '.')}</td>
              <td>{r.companyName ?? ''}</td>
              <td>{r.bizRegNo ?? ''}</td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); setViewing(r) }}>조회</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); setViewing(r) }}>소득세</a></td>
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <Modal open error={formError} title="원천징수이행상황신고서" onClose={() => setForm(null)} width={780}>
          <ReturnForm form={form} onChange={setForm} />
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
    </EcListShell>
  )
}

/** 원본 [신규] · 귀속연월 눌러 고치기 창. 고칠 때는 신고방법 · 귀속연월 · 지급연월 · 연말정산포함이 막힌다. */
function ReturnForm({ form, onChange }: { form: FormState; onChange: (f: FormState) => void }) {
  const locked = Boolean(form.id)
  const set = (patch: Partial<FormState>) => onChange({ ...form, ...patch })
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
                 onChange={(e) => set({ payMonth: e.target.value })} />
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
        <div className="title">기타</div>
        <div className="form">
          <label>
            <input type="checkbox" disabled={locked} checked={form.includeYearEnd}
                   onChange={(e) => set({ includeYearEnd: e.target.checked })} /> 연말정산포함
          </label>
        </div>
      </li>
    </ul>
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
    api.get<WithholdingStatement>('/withholding/statement', { params: { month: ret.attributionMonth } })
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
