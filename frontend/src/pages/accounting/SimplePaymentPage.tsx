import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { SimplePaymentKind, SimplePaymentSheet, SimplePaymentStatement } from '../../types/api'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

const won = (n: number | null | undefined) => (n == null ? '' : Number(n).toLocaleString('ko-KR'))
const pad2 = (n: number) => String(n).padStart(2, '0')
const dot = (d: string) => d.replace(/-/g, '.')
type Company = { name?: string; ceo?: string; bizRegNo?: string; corpRegNo?: string; tel?: string; email?: string; address?: string; addressDetail?: string }

const KINDS: { value: SimplePaymentKind; label: string }[] = [
  { value: 'LABOR', label: '간이 근로소득' },
  { value: 'BUSINESS', label: '간이 거주자 사업소득' },
  { value: 'OTHER', label: '간이 거주자 기타소득' },
]

/** 원본 목록의 [지급연월] — '2026년 하반기 (7~12)' · '2026년 09 - 09월' */
function periodText(s: { kind: SimplePaymentKind; payYear: number; period: number }) {
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
 * <p>전자파일(생성 · 목록) · 이력 열은 국세청 제출 파일이라 두지 않았다. 원본 사업소득 서식의 ⑤총 지급액 칸은 비어 있는데
 * (기타소득 서식은 합계가 찍힌다) 우리는 두 서식 모두 합계를 찍는다.
 */
export default function SimplePaymentPage() {
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
    api.get<SimplePaymentStatement[]>('/simple-payment-statements')
      .then((r) => { setRows(r.data); setPicked(new Set()) })
      .catch((e) => { setRows([]); setError(extractErrorMessage(e)) })
  }
  useEffect(() => {
    load()
    api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])

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
    <EcListShell title="간이지급명세서" option={false}
                 onNew={() => { setFormError(''); setForm(defaults('LABOR')) }}
                 actions={[{ label: '선택삭제', onClick: () => setConfirmDelete(true), disabled: picked.size === 0 }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table className="w-full text-center">
        <thead>
          <tr>
            <th className="w-[47px]">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} />
            </th>
            <th>지급연월</th>
            <th>자료구분</th>
            <th>제출일자</th>
            <th>회사명</th>
            <th>사업자등록번호</th>
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
              <td>{r.kindName}</td>
              <td>{dot(r.reportDate)}</td>
              <td>{company?.name ?? ''}</td>
              <td>{company?.bizRegNo ?? ''}</td>
              <td><button className="ec-link" onClick={() => setViewing(r.id)}>조회</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <Modal open error={formError} title="간이지급명세서파일생성" width={760} onClose={() => setForm(null)}>
          <ul className="ec-form">
            <EcCond label="자료구분" span="full">
              <select className="ec-input w-full" value={form.kind}
                      onChange={(e) => setForm(defaults(e.target.value as SimplePaymentKind, form))}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </EcCond>
            <EcCond label="세무신고사업장" span="full">
              <select className="ec-input w-full" disabled value="">
                <option value="">{company?.name ?? ''} {company?.bizRegNo ?? ''}</option>
              </select>
            </EcCond>
            <EcCond label="지급연월" span="full">
              <select className="ec-input w-[160px]" value={form.payYear}
                      onChange={(e) => setForm({ ...form, payYear: Number(e.target.value) })}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select className="ec-input w-[160px]" value={form.period}
                      onChange={(e) => setForm({ ...form, period: Number(e.target.value) })}>
                {form.kind === 'LABOR'
                  ? <><option value={1}>상반기(1~6)</option><option value={2}>하반기(7~12)</option></>
                  : Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
              </select>
            </EcCond>
            <EcCond label="신고일자">
              <input type="date" className="ec-input w-[150px]" value={form.reportDate}
                     onChange={(e) => setForm({ ...form, reportDate: e.target.value })} />
            </EcCond>
            <EcCond label="담당자 부서명" span="full">
              <input className="ec-input w-full" placeholder="담당자 부서명" value={form.managerDept}
                     onChange={(e) => setForm({ ...form, managerDept: e.target.value })} />
            </EcCond>
            <EcCond label="담당자 성명" span="full">
              <input className="ec-input w-full" placeholder="담당자 성명" value={form.managerName}
                     onChange={(e) => setForm({ ...form, managerName: e.target.value })} />
            </EcCond>
            <EcCond label="담당자 전화번호" span="full">
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
        <Modal open title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
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

/** [조회] — 국세청 간이지급명세서 서식 1쪽. */
function SheetModal({ id, company, onClose }: { id: number; company: Company | null; onClose: () => void }) {
  const [sheet, setSheet] = useState<SimplePaymentSheet | null>(null)
  const [error, setError] = useState('')
  function load() {
    setError('')
    api.get<SimplePaymentSheet>(`/simple-payment-statements/${id}/sheet`)
      .then((r) => setSheet(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id])
  const s = sheet?.statement
  const address = [company?.address, company?.addressDetail].filter(Boolean).join(' ')
  const [y, m, d] = (s?.reportDate ?? '').split('-')

  return (
    <Modal open title="간이지급명세서" width={900} error={error} onClose={onClose}>
      {s && (
        <div>
          {s.kind === 'LABOR'
            ? <LaborSheet sheet={sheet!} company={company} address={address} />
            : <PayeeSheet sheet={sheet!} company={company} address={address} />}
          <p className="mt-[12px]">
            {s.kind === 'LABOR' ? '원천징수의무자는 소득세법 제164조의3제1항에 따라 위의 내용을 제출하며 위 내용을 충분히 검토하고 원천징수의무자가 알고 있는 사실 그대로를 정확하게 적었음을 확인합니다.'
              : '지급자는 「소득세법」 제164조의3제1항에 따라 위의 내용을 제출하며, 위 내용을 충분히 검토하고 지급자가 알고 있는 사실 그대로를 정확하게 적었음을 확인합니다.'}
          </p>
          <p className="text-center my-[8px]">{y} 년 {m} 월 {d} 일</p>
          <p className="text-right">제출자: {company?.name ?? ''} (서명 또는 인)</p>
        </div>
      )}
      <div className="flex gap-[6px] mt-[12px]">
        <button className="ec-btn" onClick={load}>새로불러오기</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

function LaborSheet({ sheet, company, address }: { sheet: SimplePaymentSheet; company: Company | null; address: string }) {
  const s = sheet.statement
  const months = s.period === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12]
  const total = sheet.labor.reduce((t, r) => t + Number(r.total), 0)
  return (
    <>
      <p>소득세법 시행규칙 [별지 제24호의4서식(1)]</p>
      <div className="ec-report-title">간이지급명세서<br />(근로소득)</div>
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
          <tr><th>⑩ 근로자 총 인원</th><td className="text-right">{sheet.labor.length}</td><th>⑪ 과세소득</th><td colSpan={3} className="text-right">{won(total)}</td></tr>
        </tbody>
      </table>
      <p className="mb-[4px]">② 소득자 인적사항 및 근로소득 내용</p>
      <table className="w-full ec-report ec-report-head400">
        <thead>
          <tr><th className="text-center">일련번호</th><th>⑬ 성명</th><th>⑯ 근무기간</th><th className="text-center">⑰ 지급월</th><th className="text-right">⑱ 급여 등</th><th>⑲ 인정상여</th></tr>
        </thead>
        <tbody>
          {sheet.labor.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : sheet.labor.flatMap((r, i) => [
            ...months.map((mo, k) => (
              <tr key={`${i}-${mo}`}>
                {k === 0 && <td rowSpan={7} className="text-center">{i + 1}</td>}
                {k === 0 && <td rowSpan={7}>{r.employeeName}</td>}
                {k === 0 && <td rowSpan={7}>{dot(r.workFrom)}-{dot(r.workTo)}</td>}
                <td className="text-center">{mo - (s.period === 1 ? 0 : 6)}월/{mo}월</td>
                <td className="text-right">{won(r.monthlyPay[k])}</td>
                <td></td>
              </tr>
            )),
            <tr key={`${i}-sum`}><td className="text-center">합계</td><td className="text-right">{won(r.total)}</td><td></td></tr>,
          ])}
        </tbody>
      </table>
    </>
  )
}

function PayeeSheet({ sheet, company, address }: { sheet: SimplePaymentSheet; company: Company | null; address: string }) {
  const s = sheet.statement
  const other = s.kind === 'OTHER'
  const gross = sheet.payees.reduce((t, r) => t + Number(r.gross), 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '간이지급명세서', [sheet])
  return (
    <>
      <p>소득세법 시행규칙 [별지 제24호의4서식(2)]</p>
      <div className="ec-report-title">간 이 지 급 명 세 서<br />({other ? '거 주 자 의 기 타 소 득' : '거 주 자 의 사 업 소 득'})</div>
      <p className="mb-[4px]">① 지급자 인적사항 및 지급내용 합계사항</p>
      <table className="w-full ec-report ec-report-head400 mb-[12px]">
        <tbody>
          <tr><th>① 상호(법인명, 성명)</th><th>② 사업자(주민)등록번호</th><th>③ 소재지(주소)</th><th>④ 소득인원</th><th>⑤ 총 지급액</th></tr>
          <tr><td>{company?.name ?? ''}</td><td>{company?.bizRegNo ?? ''}</td><td>{address}</td><td className="text-right">{sheet.payees.length}</td><td className="text-right">{won(gross)}</td></tr>
          <tr>
            <th>⑥ 지급연도</th><td>{s.payYear} 년</td>
            <th>⑦ 지급월</th>
            <td colSpan={2}>{Array.from({ length: 12 }, (_, i) => `[${s.period === i + 1 ? 'O' : ' '}] ${i + 1}월`).join('  ')}</td>
          </tr>
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
            <th className="text-right">세율</th><th className="text-right">소득세</th><th className="text-right">지방소득세</th><th className="text-right">계</th>
          </tr>
        </thead>
        <tbody>
          {sheet.payees.length === 0 ? (
            <tr><td colSpan={other ? 15 : 12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : sheet.payees.map((r, i) => (
            <tr key={i}>
              <td className="text-center">{i + 1}</td>
              <td className="text-center">{s.payYear}</td>
              <td className="text-center">{pad2(s.period)}</td>
              <td></td>
              <td>{r.payeeName}</td>
              <td>{r.payeeRegNo ?? ''}</td>
              <td></td>
              {other && <td className="text-right">{r.count}</td>}
              <td className="text-right">{won(r.gross)}</td>
              {other && <><td className="text-right">{won(r.expense)}</td><td className="text-right">{won(r.taxable)}</td></>}
              <td className="text-right">{r.rate}</td>
              <td className="text-right">{won(r.incomeTax)}</td>
              <td className="text-right">{won(r.localIncomeTax)}</td>
              <td className="text-right">{won(Number(r.incomeTax) + Number(r.localIncomeTax))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
