import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { SimplePaymentKind, SimplePaymentSheet, SimplePaymentStatement } from '../../types/api'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { fillAndPrint, openPrintWindow } from '../../utils/print'
import EcDateInput from '../../components/ui/EcDateInput'
import { pad2 } from '../../utils/periods'
import { fmtNumberOrBlank } from '../../utils/format'

const dot = (d: string) => d.replace(/-/g, '.')
export type Company = { name?: string; ceo?: string; bizRegNo?: string; corpRegNo?: string; tel?: string; email?: string; address?: string; addressDetail?: string }

const KINDS: { value: SimplePaymentKind; label: string }[] = [
  { value: 'LABOR', label: '간이 근로소득' },
  { value: 'BUSINESS', label: '간이 거주자 사업소득' },
  { value: 'OTHER', label: '간이 거주자 기타소득' },
]

/** 원본 목록의 [지급연월] — '2026년 하반기 (7~12)' · '2026년 09 - 09월' */
function periodText(s: { kind: SimplePaymentKind; payYear: number; period: number }) {
  if (s.kind === 'DAILY') return `${s.payYear}년 ${s.period}월`
  if (s.kind === 'LABOR') return `${s.payYear}년 ${s.period === 1 ? '상반기 (1~6)' : '하반기 (7~12)'}`
  return `${s.payYear}년 ${pad2(s.period)} - ${pad2(s.period)}월`
}

/** 그 달 다음 달의 말일 — 원본 신고일자 기본값(사업소득 9월 → 2026/10/31, 근로 하반기 → 2027/01/31). */
function nextMonthEnd(year: number, month: number) {
  const d = new Date(year, month + 1, 0)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

type Form = {
  id?: number; kind: SimplePaymentKind; payYear: number; period: number; reportDate: string
  managerDept: string; managerName: string; managerPhone: string; submitter: 'DIRECT' | 'AGENT'
}

/** 원본 [신규] 기본값 — 근로소득은 이번 반기, 사업 · 기타소득은 지난달. 신고일자는 그 기간 다음 달 말일. */
function defaults(kind: SimplePaymentKind, keep?: Partial<Form>): Form {
  const t = new Date()
  let payYear: number, period: number, lastMonth: number
  if (kind === 'LABOR') {
    payYear = t.getFullYear(); period = t.getMonth() < 6 ? 1 : 2; lastMonth = period === 1 ? 6 : 12
  } else {
    const p = new Date(t.getFullYear(), t.getMonth() - 1, 1)
    payYear = p.getFullYear(); period = p.getMonth() + 1; lastMonth = period
  }
  return {
    managerDept: '', managerName: '', managerPhone: '', submitter: 'DIRECT', ...keep,
    kind, payYear, period, reportDate: nextMonthEnd(payYear, lastMonth),
  }
}

/**
 * 간이지급명세서 (원본 세무 › 원천징수 E030116, 2026-10-04 loginaa 실측).
 *
 * <p>목록 [☐ · 지급연월 · 자료구분 · 제출일자 · 회사명 · 사업자등록번호 · 조회 · 전자파일 · 이력], [신규(F2) · 선택삭제].
 * [신규]는 '간이지급명세서파일생성' 창 — 자료구분(간이 근로소득 · 간이 거주자 사업소득 · 간이 거주자 기타소득) ·
 * 세무신고사업장 · 지급연월(근로는 연도 + 반기, 사업 · 기타는 연도 + 달) · 신고일자 · 담당자 부서명 · 성명 · 전화번호 · 제출자.
 * 비우면 '부서명을 입력바랍니다.' · '성명을 입력바랍니다.' · '전화번호를 입력바랍니다.' 차례로 막는다.
 * [조회]는 국세청 서식 — 근로소득은 반기 사원별 근무기간 · 달별 급여 등, 사업 · 기타소득은 그 달 기타원천세를 소득자마다.
 *
 * <p>전자파일(생성 · 목록) · 이력 열은 국세청 제출 파일이라 두지 않았다. ⑤총 지급액은 사업 · 기타소득 서식 모두 합계다
 * (원본은 읽기전용 입력칸이라 innerText 로는 빈칸처럼 보인다 — 2026-10-13 2026/08 사업소득 2,119,828 · 기타소득 11,181,764).
 * 같은 자료구분 · 지급연월은 두 번 못 만든다('이미 생성된 자료입니다.'). 수정 창은 자료구분 · 지급연월이 잠긴다.
 *
 * <p>사업 · 기타소득 서식은 만들 때의 기타원천세를 담아 두고, 그 뒤에 넣은 지급은 [새로불러오기] 를 눌러야 들어온다
 * (2026-10-14 원본 QA세무-강사 2026/10: 1,000,000 으로 만들고 200,000 을 더 넣어도 1,000,000 → [새로불러오기] 1,200,000).
 * 같은 소득자 · 업종코드는 한 줄로 합치고, 기타소득은 소득코드 76 · 79 만 싣는다.
 */
export default function SimplePaymentPage() {
  return <StatementListPage daily={false} />
}

/**
 * 간이지급명세서와 지급명세서(일용직, E020146 '일용근로지급명세서파일생성')가 같이 쓰는 목록 · 입력 · 조회.
 * 일용직은 자료구분이 일용근로소득 하나라 입력 창에 자료구분 · 사업장 칸이 없고, 목록의 [자료구분] 이 사업자등록번호 뒤에 선다.
 */
export function StatementListPage({ daily }: { daily: boolean }) {
  const title = daily ? '일용근로지급명세서파일생성' : '간이지급명세서'
  const [rows, setRows] = useState<SimplePaymentStatement[]>([])
  const [company, setCompany] = useState<Company | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [formError, setFormError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)

  function load() {
    setError('')
    api.get<SimplePaymentStatement[]>('/simple-payment-statements', { params: { daily } })
      .then((r) => { setRows(r.data); setPicked(new Set()) })
      .catch((e) => { setRows([]); setError(extractErrorMessage(e)) })
  }
  useEffect(() => {
    load()
    api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!form) return
    if (!form.managerDept.trim()) { setFormError('부서명을 입력바랍니다.'); return }
    if (!form.managerName.trim()) { setFormError('성명을 입력바랍니다.'); return }
    if (!form.managerPhone.trim()) { setFormError('전화번호를 입력바랍니다.'); return }
    const body = {
      kind: form.kind, payYear: form.payYear, period: form.period, reportDate: form.reportDate,
      managerDept: form.managerDept, managerName: form.managerName, managerPhone: form.managerPhone, submitter: form.submitter,
    }
    try {
      if (form.id) await api.put(`/simple-payment-statements/${form.id}`, body)
      else await api.post('/simple-payment-statements', body)
      setForm(null)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function doDelete() {
    setConfirmDelete(false)
    try {
      await api.post('/simple-payment-statements/delete', [...picked])
      load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const allPicked = rows.length > 0 && picked.size === rows.length
  const years = (() => { const y = new Date().getFullYear(); return [y + 1, y, y - 1, y - 2] })()

  return (
    <EcListShell title={title} option={false}
                 onNew={() => { setFormError(''); setForm(defaults(daily ? 'DAILY' : 'LABOR')) }}
                 actions={[{ label: '선택삭제', onClick: () => setConfirmDelete(true), selected: picked.size }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table className="w-full text-center">
        <thead>
          <tr>
            <th className="w-[47px]">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} />
            </th>
            <th>지급연월</th>
            {!daily && <th>자료구분</th>}
            <th>{daily ? '신고일자' : '제출일자'}</th>
            <th>회사명</th>
            <th>사업자등록번호</th>
            {daily && <th>자료구분</th>}
            <th>조회</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">
                <input type="checkbox" aria-label={`${periodText(r)} 선택`} checked={picked.has(r.id)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                {' '}{i + 1}
              </td>
              <td>
                <button className="ec-link" onClick={() => { setFormError(''); setForm({ ...r }) }}>{periodText(r)}</button>
              </td>
              {!daily && <td>{r.kindName}</td>}
              <td>{dot(r.reportDate)}</td>
              <td>{company?.name ?? ''}</td>
              <td>{company?.bizRegNo ?? ''}</td>
              {daily && <td>{r.kindName}</td>}
              <td><button className="ec-link" onClick={() => setViewing(r.id)}>조회</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <Modal open error={formError} title={daily ? '일용근로지급명세서파일생성' : '간이지급명세서파일생성'} width={760} onClose={() => setForm(null)}>
          <ul className="ec-form">
            {!daily && <><EcCond label="자료구분" span={2}>
              <select className="ec-input w-full" value={form.kind} disabled={!!form.id}
                      onChange={(e) => setForm(defaults(e.target.value as SimplePaymentKind, form))}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </EcCond>
            <EcCond label="세무신고사업장" span={2}>
              <select className="ec-input w-full" disabled value="">
                <option value="">{company?.name ?? ''} {company?.bizRegNo ?? ''}</option>
              </select>
            </EcCond></>}
            <EcCond label="지급연월" span={2}>
              <select className="ec-input w-[160px]" value={form.payYear} disabled={!!form.id && !daily}
                      onChange={(e) => setForm({ ...form, payYear: Number(e.target.value) })}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select className="ec-input w-[160px]" value={form.period} disabled={!!form.id && !daily}
                      onChange={(e) => setForm({ ...form, period: Number(e.target.value) })}>
                {form.kind === 'LABOR'
                  ? <><option value={1}>상반기(1~6)</option><option value={2}>하반기(7~12)</option></>
                  : Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
              </select>
            </EcCond>
            <EcCond label="신고일자">
              <EcDateInput className="ec-input w-[150px]" value={form.reportDate} onChange={(e) => setForm({ ...form, reportDate: e.target.value })} />
            </EcCond>
            <EcCond label="담당자 부서명" span={2}>
              <input className="ec-input w-full" placeholder="담당자 부서명" value={form.managerDept}
                     onChange={(e) => setForm({ ...form, managerDept: e.target.value })} />
            </EcCond>
            <EcCond label="담당자 성명" span={2}>
              <input className="ec-input w-full" placeholder="담당자 성명" value={form.managerName}
                     onChange={(e) => setForm({ ...form, managerName: e.target.value })} />
            </EcCond>
            <EcCond label="담당자 전화번호" span={2}>
              <input className="ec-input w-full" placeholder="담당자 전화번호" value={form.managerPhone}
                     onChange={(e) => setForm({ ...form, managerPhone: e.target.value })} />
            </EcCond>
            <EcCond label="제출자">
              {([['DIRECT', '직접제출'], ['AGENT', '세무대리인']] as const).map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
                  <input type="radio" name="sp-submitter" checked={form.submitter === v} onChange={() => setForm({ ...form, submitter: v })} /> {l}
                </label>
              ))}
            </EcCond>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
            <button className="ec-btn" onClick={() => setForm(null)}>닫기</button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal open title="확인" width={420} error={error} onClose={() => setConfirmDelete(false)}>
          <p className="mb-[12px]">삭제한 데이터는 복구되지 않습니다.<br />삭제하겠습니까?</p>
          <div className="flex gap-[6px]">
            <button className="ec-btn ec-btn-primary" onClick={doDelete}>확인</button>
            <button className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
          </div>
        </Modal>
      )}

      {viewing !== null && <SheetModal id={viewing} company={company} onClose={() => setViewing(null)} />}
    </EcListShell>
  )
}

/** 원본 서식 아래 [지급자 보관용 ▼] — 머리의 '( [V]지급자 보관용 [ ]지급자 제출용 )' 표시를 바꾼다. */
type SheetCopy = 'KEEP' | 'SUBMIT'
/** 사업 · 기타소득 서식의 소득자 줄 수(원본은 일련번호 1~15 를 늘 그린다). */
/** 인쇄용 — 입력칸(근로소득 서식 월별 칸)은 값을 글자로 바꿔 찍는다(innerHTML 은 친 값을 담지 않는다). */
function paperHtml(el: HTMLElement) {
  const c = el.cloneNode(true) as HTMLElement
  const src = el.querySelectorAll('input')
  c.querySelectorAll('input').forEach((i, k) => i.replaceWith(document.createTextNode((src[k] as HTMLInputElement).value)))
  return c.innerHTML
}
const SHEET_ROWS = 15
const SHEET_PRINT_CSS = 'body{font-family:sans-serif;font-size:11px;margin:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid;padding:2px 4px}'

/** [조회] — 국세청 간이지급명세서 서식 1쪽. */
function SheetModal({ id, company, onClose }: { id: number; company: Company | null; onClose: () => void }) {
  const [sheet, setSheet] = useState<SimplePaymentSheet | null>(null)
  const [error, setError] = useState('')
  const [copy, setCopy] = useState<SheetCopy>('KEEP')
  const [confirmReload, setConfirmReload] = useState(false)
  const paperRef = useRef<HTMLDivElement>(null)
  function load() {
    setError('')
    api.get<SimplePaymentSheet>(`/simple-payment-statements/${id}/sheet`)
      .then((r) => setSheet(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  /** 원본 [새로불러오기] — 확인 창 뒤 그 달 기타원천세(일용직은 일용근로 급여대장)를 다시 세어 담아 둔다. */
  function reload() {
    setConfirmReload(false)
    setError('')
    api.post<SimplePaymentSheet>(`/simple-payment-statements/${id}/reload`)
      .then((r) => setSheet(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id])
  const s = sheet?.statement
  const address = [company?.address, company?.addressDetail].filter(Boolean).join(' ')
  const [y, m, d] = (s?.reportDate ?? '').split('-')
  const payee = s?.kind === 'BUSINESS' || s?.kind === 'OTHER'
  // 만들 때 숫자를 담아 두는 서식 — [새로불러오기] 는 확인 창 뒤 다시 센다(사업 · 기타 · 일용, 원본 2026-10-14)
  const saved = payee || s?.kind === 'DAILY' || s?.kind === 'LABOR'
  /** 근로소득 서식 칸 직접 고치기(원본 2026-10-21): 월별 칸을 고치면 사원 합계 · 총액이 따라오고 [저장] 하면 다시 열어도 그대로. */
  function editLabor(i: number, k: number, v: number | null) {
    setSheet((cur) => cur && ({ ...cur, labor: cur.labor.map((r, j) => {
      if (j !== i) return r
      const monthlyPay = r.monthlyPay.map((x, m) => (m === k ? v : x))
      return { ...r, monthlyPay, total: monthlyPay.reduce<number>((t, x) => t + Number(x ?? 0), 0) }
    }) }))
  }
  function saveLabor() {
    if (!sheet) return
    setError('')
    api.put<SimplePaymentSheet>(`/simple-payment-statements/${id}/sheet`, sheet.labor).then((r) => setSheet(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  function print() {
    const win = openPrintWindow()
    if (!win || !paperRef.current) return
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>간이지급명세서</title><style>${SHEET_PRINT_CSS}</style></head>`
      + `<body>${paperHtml(paperRef.current)}</body></html>`)
  }

  return (
    <Modal open title={s?.kind === 'DAILY' ? '일용근로소득 지급명세서' : '간이지급명세서'} width={900} error={error} onClose={onClose}>
      {s && (
        <div ref={paperRef}>
          {s.kind === 'LABOR' ? <LaborSheet sheet={sheet!} company={company} address={address} onEdit={editLabor} />
            : s.kind === 'DAILY' ? <DailySheet sheet={sheet!} company={company} address={address} />
              : <PayeeSheet sheet={sheet!} company={company} address={address} copy={copy} />}
          <p className="mt-[12px]">
            {s.kind === 'DAILY' ? '위와 같이 제출합니다.' : s.kind === 'LABOR' ? '원천징수의무자는 소득세법 제164조의3제1항에 따라 위의 내용을 제출하며 위 내용을 충분히 검토하고 원천징수의무자가 알고 있는 사실 그대로를 정확하게 적었음을 확인합니다.'
              : '지급자는 「소득세법」 제164조의3제1항에 따라 위의 내용을 제출하며, 위 내용을 충분히 검토하고 지급자가 알고 있는 사실 그대로를 정확하게 적었음을 확인합니다.'}
          </p>
          <p className="text-center my-[8px]">{y} 년 {m} 월 {d} 일</p>
          <p className="text-right">{s.kind === 'DAILY' ? `징수의무자(지급자) ${company?.ceo ?? ''}` : `제출자: ${company?.name ?? ''}`} (서명 또는 인)</p>
        </div>
      )}
      <div className="flex gap-[6px] mt-[12px]">
        {/* 원본 사업 · 기타소득 서식: [인쇄] · Excel · [새로불러오기] · [닫기] · H · 도장인쇄 · [지급자 보관용 ▼] */}
        {s?.kind === 'LABOR' && <button className="ec-btn ec-btn-primary" onClick={saveLabor}>저장</button>}
        {saved && <button className={s?.kind === 'LABOR' ? 'ec-btn' : 'ec-btn ec-btn-primary'} onClick={print}>인쇄</button>}
        {s?.kind === 'LABOR' && <button className="ec-btn" type="button">Excel</button>}
        <button className="ec-btn" onClick={() => (saved ? setConfirmReload(true) : load())}>새로불러오기</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
        {s?.kind === 'LABOR' && <button className="ec-btn" type="button">H</button>}
        {(payee || s?.kind === 'LABOR') && (
          <select className="ec-input w-[120px]" aria-label="보관용" value={copy} onChange={(e) => setCopy(e.target.value as SheetCopy)}>
            <option value="KEEP">지급자 보관용</option>
            <option value="SUBMIT">지급자 제출용</option>
          </select>
        )}
      </div>
      {confirmReload && (
        <Modal open title="확인" width={420} error={error} onClose={() => setConfirmReload(false)}>
          <p className="mb-[12px]">직접 수정한 사항은 유지되지 않으며,<br />입력된 자료를 바탕으로 새로 불러옵니다.<br />진행하시겠습니까?</p>
          <div className="flex gap-[6px]">
            <button className="ec-btn ec-btn-primary" onClick={reload}>확인</button>
            <button className="ec-btn" onClick={() => setConfirmReload(false)}>취소</button>
          </div>
        </Modal>
      )}
    </Modal>
  )
}

function LaborSheet({ sheet, company, address, onEdit }: { sheet: SimplePaymentSheet; company: Company | null; address: string; onEdit: (i: number, k: number, v: number | null) => void }) {
  const s = sheet.statement
  const months = s.period === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12]
  const total = sheet.labor.reduce((t, r) => t + Number(r.total), 0)
  return (
    <>
      <p className="flex justify-between"><span>■ 소득세법 시행규칙 [별지 제24호의4서식(1)] &lt;개정 2021.7.1&gt;</span><span>(3쪽 중 제1쪽)</span></p>
      <div className="ec-report-title">간이지급명세서(근로소득)</div>
      <p className="text-center mb-[6px]">( [V]지급자 보관용 &nbsp; [ ]지급자 제출용 )</p>
      <p className="mb-[4px]">① 원천징수의무자 인적사항 및 지급내용 합계사항</p>
      <table className="w-full ec-report ec-report-head400 mb-[12px]">
        <tbody>
          <tr><th>① 상호(법인명)</th><td>{company?.name ?? ''}</td><th>② 성명(대표자)</th><td>{company?.ceo ?? ''}</td><th>③ 사업자등록번호</th><td>{company?.bizRegNo ?? ''}</td></tr>
          <tr><th>④ 주민(법인)등록번호</th><td>{company?.corpRegNo ?? ''}</td><th>⑤ 소재지(주소)</th><td colSpan={3}>{address}</td></tr>
          <tr><th>⑥ 전화번호</th><td>{company?.tel ?? ''}</td><th>⑦ 전자우편주소</th><td colSpan={3}>{company?.email ?? ''}</td></tr>
          <tr>
            <th>⑧ 귀속연도</th><td>{s.payYear} 년</td>
            <th>⑨ 지급 시기</th><td colSpan={3}>[{s.period === 1 ? 'V' : ' '}]상반기(1월~6월) [{s.period === 2 ? 'V' : ' '}]하반기(7월~12월)</td>
          </tr>
          <tr><th>⑩근로자 총 인원</th><td className="text-right">{sheet.labor.length} 명</td><th>⑪과세소득 (⑱번 합계 + ⑲번 합계)</th><td colSpan={3} className="text-right">{fmtNumberOrBlank(total)}</td></tr>
        </tbody>
      </table>
      <p className="mb-[4px]">② 소득자 인적사항 및 근로소득 내용</p>
      <table className="w-full ec-report ec-report-head400">
        <thead>
          <tr><th rowSpan={2} className="text-center">일련번호</th><th>⑫주민등록번호</th><th>⑭내·외국인</th><th rowSpan={2}>⑯근무기간</th><th rowSpan={2} className="text-center">⑰지급월</th><th rowSpan={2} className="text-right">⑱급여 등</th><th rowSpan={2}>⑲인정상여</th></tr>
          <tr><th>⑬성명</th><th>⑮거주자구분</th></tr>
        </thead>
        <tbody>
          {sheet.labor.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : sheet.labor.flatMap((r, i) => [
            ...months.map((mo, k) => (
              <tr key={`${i}-${mo}`}>
                {k === 0 && <td rowSpan={7} className="text-center">{i + 1}</td>}
                {k === 0 && <td rowSpan={7}>{r.employeeName}</td>}
                {/* 원본 ⑭내·외국인 · ⑮거주자구분 — 내국인 · 거주자 '1' */}
                {k === 0 && <td rowSpan={7} className="text-center">1<br />1</td>}
                {k === 0 && <td rowSpan={7}>{dot(r.workFrom)}-{dot(r.workTo)}</td>}
                <td className="text-center">{mo - (s.period === 1 ? 0 : 6)}월/{mo}월</td>
                <td className="text-right">
                  {/* 원본: 월별 칸은 입력칸, 사원 합계는 읽기 전용 */}
                  <input className="ec-input w-[120px] text-right" aria-label={`${r.employeeName} ${mo}월`} inputMode="numeric"
                         value={r.monthlyPay[k] == null ? '' : fmtNumberOrBlank(r.monthlyPay[k])}
                         onChange={(e) => { const raw = e.target.value.replace(/[^\d-]/g, ''); onEdit(i, k, raw === '' ? null : Number(raw)) }} />
                </td>
                <td></td>
              </tr>
            )),
            <tr key={`${i}-sum`}><td className="text-center">합계</td><td className="text-right">{fmtNumberOrBlank(r.total)}</td><td></td></tr>,
          ])}
        </tbody>
      </table>
    </>
  )
}

/** 일용근로소득 지급명세서(지급자제출용) [별지 제24호서식(4)] — 월별 집계 + 근로자마다 한 줄. */
export function DailySheet({ sheet, company, address }: { sheet: SimplePaymentSheet; company: Company | null; address: string }) {
  const s = sheet.statement
  const sum = (k: 'taxable' | 'incomeTax' | 'localIncomeTax') => sheet.daily.reduce((t, r) => t + Number(r[k]), 0)
  return (
    <>
      <p>■ 소득세법 시행규칙 [별지 제24호서식(4)] &lt;개정 2023. 3. 20&gt; (3쪽 중 제1쪽)</p>
      <div className="ec-report-title">일용근로소득 지급명세서 (지급자제출용)</div>
      <p className="text-center mb-[8px]">[일용근로소득 지급명세서(원천징수영수증) 월별 제출집계표]</p>
      <table className="w-full ec-report ec-report-head400 mb-[12px]">
        <tbody>
          <tr><th>① 상호(법인명)</th><td>{company?.name ?? ''}</td><th>② 성명(대표자)</th><td>{company?.ceo ?? ''}</td><th>③ 사업자등록번호</th><td>{company?.bizRegNo ?? ''}</td></tr>
          <tr><th>④ 주민(법인)등록번호</th><td>{company?.corpRegNo ?? ''}</td><th>⑤ 소재지(주소)</th><td colSpan={3}>{address}</td></tr>
          <tr><th>⑥ 전화번호</th><td>{company?.tel ?? ''}</td><th>⑦ 전자우편주소</th><td colSpan={3}>{company?.email ?? ''}</td></tr>
        </tbody>
      </table>
      <p className="mb-[4px]">① 월별 원천징수 집계 현황</p>
      <table className="w-full ec-report ec-report-head400 mb-[12px]">
        <tbody>
          <tr>
            <th>⑧ 귀속연도</th><td>{s.payYear}</td><th>⑨ 지급월</th>
            <td colSpan={3}>{Array.from({ length: 12 }, (_, i) => `[ ${s.period === i + 1 ? 'O' : ' '} ] ${i + 1}월`).join('  ')}</td>
          </tr>
          <tr><th>⑩ 일용근로자수</th><th>⑪ 제출자료건수</th><th>⑫ 과세소득 합계</th><th>⑬ 비과세소득 합계</th><th>⑭ 소득세</th><th>⑮ 지방소득세</th></tr>
          <tr>
            <td className="text-right">{sheet.daily.length} 명</td>
            <td className="text-right">{sheet.daily.length} 건</td>
            <td className="text-right">{fmtNumberOrBlank(sum('taxable'))}</td>
            <td className="text-right">0</td>
            <td className="text-right">{fmtNumberOrBlank(sum('incomeTax'))}</td>
            <td className="text-right">{fmtNumberOrBlank(sum('localIncomeTax'))}</td>
          </tr>
        </tbody>
      </table>
      <p className="mb-[4px]">② 소득자 인적사항 및 일용근로소득 지급내용</p>
      <table className="w-full ec-report ec-report-head400">
        <thead>
          <tr>
            <th className="text-center">⑯ 번호</th><th>⑰ 성명</th><th>⑱ 전화번호</th><th className="text-center">⑲ 외국인여부</th>
            <th>⑳ 주민등록번호</th><th className="text-center">㉑ 근무월</th>
            <th className="text-right">㉒ 근무일수</th><th className="text-center">㉓ 최종근무일</th>
            <th className="text-right">㉔ 과세소득</th><th className="text-right">㉕ 비과세소득</th>
            <th className="text-right">㉖ 소득세</th><th className="text-right">㉗ 지방소득세</th>
          </tr>
        </thead>
        <tbody>
          {sheet.daily.length === 0 ? (
            <tr><td colSpan={12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : sheet.daily.map((r, i) => (
            <tr key={i}>
              <td className="text-center">{i + 1}</td>
              <td>{r.name}</td>
              <td></td><td className="text-center"></td><td></td>
              <td className="text-center">{pad2(s.period)}</td>
              <td className="text-right">{Number(r.days)}</td>
              <td className="text-center">{r.lastDate ? r.lastDate.slice(8) : ''}</td>
              <td className="text-right">{fmtNumberOrBlank(r.taxable)}</td>
              <td className="text-right">0</td>
              <td className="text-right">{fmtNumberOrBlank(r.incomeTax)}</td>
              <td className="text-right">{fmtNumberOrBlank(r.localIncomeTax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function PayeeSheet({ sheet, company, address, copy }: { sheet: SimplePaymentSheet; company: Company | null; address: string; copy: SheetCopy }) {
  const s = sheet.statement
  const other = s.kind === 'OTHER'
  const gross = sheet.payees.reduce((t, r) => t + Number(r.gross), 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '간이지급명세서', [sheet])
  return (
    <>
      {other && <p className="mb-[4px]">※ 거주자의 기타소득 간이지급명세서는 소득코드 76(강연료 등), 79(자문료 등)에 해당하는 자료만 제출합니다.</p>}
      <p className="flex justify-between"><span>■ 소득세법 시행규칙 [별지 제24호의4서식(2)] &lt;개정 2023.3.20.&gt;</span><span>({other ? '3쪽 중 제1쪽' : '4쪽 중 제1쪽'})</span></p>
      <div className="ec-report-title">간 이 지 급 명 세 서<br />({other ? '거 주 자 의 기 타 소 득' : '거 주 자 의 사 업 소 득'})</div>
      <p className="text-center mb-[6px]">( [{copy === 'KEEP' ? 'V' : ' '}]지급자 보관용 &nbsp; [{copy === 'SUBMIT' ? 'V' : ' '}]지급자 제출용 )</p>
      <p className="mb-[4px]">① 지급자 인적사항 및 지급내용 합계사항</p>
      <table className="w-full ec-report ec-report-head400 mb-[12px]">
        <tbody>
          <tr><th>① 상호(법인명, 성명)</th><th>② 사업자(주민)등록번호</th><th>③ 소재지(주소)</th><th>④ 소득인원</th><th>⑤ 총 지급액({other ? '⑮' : '⑭'}번 합계)</th></tr>
          <tr><td>{company?.name ?? ''}</td><td>{company?.bizRegNo ?? ''}</td><td>{address}</td><td className="text-right">{sheet.payees.length}</td><td className="text-right">{fmtNumberOrBlank(gross)}</td></tr>
          {/* 원본: 1~6월 · 7~12월 두 줄, 해당 월에 'O' */}
          {[0, 6].map((from) => (
            <tr key={from}>
              {from === 0 && <><th rowSpan={2}>⑥ 지급연도</th><td rowSpan={2}>{s.payYear} 년</td><th rowSpan={2}>⑦지급월 (해당 월에 "O")</th></>}
              <td colSpan={2}>{Array.from({ length: 6 }, (_, i) => `[${s.period === from + i + 1 ? 'O' : ' '}] ${from + i + 1}월`).join('  ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mb-[4px]">② 소득자 인적사항 및 {other ? '기타소득' : '사업소득'} 내용</p>
      <table ref={tableRef} className="w-full ec-report ec-report-head400">
        <thead>
          <tr>
            <th className="text-center">일련번호</th><th className="text-center">⑧ 귀속연도</th><th className="text-center">⑨ 귀속월</th><th>{other ? '⑩ 소득구분' : '⑩ 업종구분'}</th><th>⑪ 소득자 성명(상호)</th>
            <th>⑫ 주민(사업자)등록번호</th><th>⑬ 외국인여부</th>
            {other && <th className="text-right">⑭ 지급건수</th>}
            <th className="text-right">{other ? '⑮ 지급액' : '⑭ 지급액'}</th>
            {other && <><th className="text-right">⑯ 필요경비</th><th className="text-right">⑰ 소득금액</th></>}
            <th className="text-right">{other ? '⑱ 세율' : '⑮ 세율'}</th><th className="text-right">{other ? '⑲ 소득세' : '⑯ 소득세'}</th>
            <th className="text-right">{other ? '⑳ 지방소득세' : '⑰ 지방소득세'}</th><th className="text-right">{other ? '㉑ 계(⑲+⑳)' : '⑱ 계(⑯+⑰)'}</th>
          </tr>
        </thead>
        <tbody>
          {sheet.payees.map((r, i) => (
            <tr key={i}>
              <td className="text-center">{i + 1}</td>
              <td className="text-center">{s.payYear}</td>
              <td className="text-center">{pad2(s.period)}</td>
              <td className="text-center">{r.incomeCode ?? ''}</td>
              <td>{r.payeeName}</td>
              <td>{r.payeeRegNo ?? ''}</td>
              <td></td>
              {other && <td className="text-right">{r.count}</td>}
              <td className="text-right">{fmtNumberOrBlank(r.gross)}</td>
              {other && <><td className="text-right">{fmtNumberOrBlank(r.expense)}</td><td className="text-right">{fmtNumberOrBlank(r.taxable)}</td></>}
              <td className="text-right">{r.rate}</td>
              <td className="text-right">{fmtNumberOrBlank(r.incomeTax)}</td>
              <td className="text-right">{fmtNumberOrBlank(r.localIncomeTax)}</td>
              <td className="text-right">{fmtNumberOrBlank(Number(r.incomeTax) + Number(r.localIncomeTax))}</td>
            </tr>
          ))}
          {/* 원본 서식은 소득자가 적어도 일련번호 15 줄까지 빈 줄을 그린다 */}
          {Array.from({ length: Math.max(0, SHEET_ROWS - sheet.payees.length) }, (_, k) => (
            <tr key={`blank-${k}`}>
              <td className="text-center">{sheet.payees.length + k + 1}</td>
              {Array.from({ length: other ? 14 : 11 }, (_, c) => <td key={c}></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
