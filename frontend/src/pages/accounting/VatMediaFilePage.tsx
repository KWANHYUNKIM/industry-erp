import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { fillAndPrint, openPrintWindow } from '../../utils/print'
import { InvoiceSummarySheet, loadVatSheet, type AccountOpt, type CompanyInfo, type Sheet } from './VatReturnPage'

interface MediaRow {
  id: number; year: number; monthFrom: number; monthTo: number; omittedFrom: number | null; omittedTo: number | null
  invoiceSummary: boolean; taxInvoiceSummary: boolean; kindName: string; reportDate: string
}
interface MediaForm {
  id?: number; year: number; monthFrom: number; monthTo: number; omittedFrom: number | null; omittedTo: number | null
  invoiceSummary: boolean; taxInvoiceSummary: boolean; reportDate: string
}
type Attach = '매출세금계산서' | '매입세금계산서'

const pad = (n: number) => String(n).padStart(2, '0')
const MONTHS = Array.from({ length: 12 }, (_, k) => k + 1)
const PRINT_CSS = 'body{font-family:sans-serif;font-size:11px;margin:16px}'
  + 'table{border-collapse:collapse;width:100%;margin-bottom:8px}th,td{border:1px solid gray;padding:3px}'
  + '.text-right{text-align:right}.text-center{text-align:center}.ec-report-title{font-size:16px;font-weight:bold;text-align:center}'

/**
 * 세무 › 부가세 › <b>과세자료전산매체</b>(E030208) — 2026-10-12 loginaa 실측.
 *
 * <p>목록 [☐ · 신고기간('2026 / 07 ~ 12') · 예정누락('없음') · 회사명 · 사업자등록번호 · 자료구분(전체) · 합계표(조회) · 전자파일 · PDF · 이력],
 * 아래 [신규(F2) · 선택삭제 · 이전자료보기]. 빈 목록 '등록된 데이터가 없습니다.'
 *
 * <ul>
 *   <li>[신규(F2)] '전산매체 파일생성' 창: 전산매체 ☑전체 ☑계산서합계표 ☑세금계산서합계표 · 신고기간(올해 + 시작월 ~ 끝월, 기본은 이번 기의
 *       여섯 달 07월 ~ 12월) · 예정누락기간(=== ~ ===) · 세무신고사업장 · 신고작성일자(기본 이달 25일) · [저장(F8) · 닫기].</li>
 *   <li>같은 기간을 또 저장하면 '동일한 기간에 이미 생성된 자료가 있습니다. 해당 기간의 자료를 새로불러오거나 삭제 후 재생성 하시기 바랍니다.'</li>
 *   <li>[신고기간]을 누르면 같은 창이 열리고 신고작성일자만 고칠 수 있다.</li>
 *   <li>[합계표 › 조회] → '(세금)계산서합계표' 창: [신고기간 · 사업자등록번호 · 예정누락기간 · 신고(작성)일자] 한 줄, 첨부서류
 *       [매출세금계산서 · 매입세금계산서 · 매출계산서 · 매입계산서] 마다 [조회] → 별지 제38호서식(2) 매출처별세금계산서합계표(갑).</li>
 *   <li>[선택삭제] '삭제한 데이터는 복구되지 않습니다. 삭제하겠습니까?'</li>
 * </ul>
 *
 * <p>합계표 숫자는 부가세신고서(일반)와 같은 계산(loadVatSheet)으로 그 기간의 회계전표 · (세금)계산서발행/수령에서 센다.
 *
 * <p>두지 않은 것: [전자파일 생성/목록](국세청 전산매체 파일 형식) · [PDF 생성/목록] · [이력] · [이전자료보기] ·
 * 합계표 창의 [새로불러오기 · 자료비교 · 선택삭제] · 매출계산서 · 매입계산서(면세 계산서합계표 서식) — 우리에게 그 서식이 없다.
 * 사업장이 하나라 [세무신고사업장]은 고르지 않는다.
 */
export default function VatMediaFilePage() {
  const today = new Date()
  const thisYear = today.getFullYear()
  const [rows, setRows] = useState<MediaRow[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [form, setForm] = useState<MediaForm | null>(null)
  const [formError, setFormError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [summary, setSummary] = useState<MediaRow | null>(null)
  const [attach, setAttach] = useState<{ kind: Attach; sheet: Sheet } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<CompanyInfo | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
  }, [])

  async function load() {
    setError('')
    try {
      const r = await api.get<MediaRow[]>('/vat-media-files', { params: { fromYear: thisYear - 1, toYear: thisYear } })
      setRows(r.data)
      setPicked(new Set())
    } catch (e) {
      setRows([]); setError(extractErrorMessage(e))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const openNew = () => {
    /* 원본 기본값(2026-10-12): 이번 기의 여섯 달(07월 ~ 12월) · 신고작성일자 이달 25일. */
    const first = today.getMonth() < 6 ? 1 : 7
    setFormError(''); setConfirmDelete(false)
    setForm({ year: thisYear, monthFrom: first, monthTo: first + 5, omittedFrom: null, omittedTo: null,
      invoiceSummary: true, taxInvoiceSummary: true, reportDate: `${thisYear}-${pad(today.getMonth() + 1)}-25` })
  }
  const openRow = (r: MediaRow) => {
    setFormError(''); setConfirmDelete(false)
    setForm({ id: r.id, year: r.year, monthFrom: r.monthFrom, monthTo: r.monthTo, omittedFrom: r.omittedFrom, omittedTo: r.omittedTo,
      invoiceSummary: r.invoiceSummary, taxInvoiceSummary: r.taxInvoiceSummary, reportDate: r.reportDate })
  }
  const set = (patch: Partial<MediaForm>) => form && setForm({ ...form, ...patch })

  async function save() {
    if (!form) return
    const body = { year: form.year, monthFrom: form.monthFrom, monthTo: form.monthTo, omittedFrom: form.omittedFrom, omittedTo: form.omittedTo,
      invoiceSummary: form.invoiceSummary, taxInvoiceSummary: form.taxInvoiceSummary, reportDate: form.reportDate }
    try {
      if (form.id) await api.put(`/vat-media-files/${form.id}`, body)
      else await api.post('/vat-media-files', body)
      setForm(null)
      await load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function removePicked() {
    try {
      await api.post('/vat-media-files/delete', [...picked])
      setConfirmDelete(false)
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function openAttach(r: MediaRow, kind: Attach) {
    setError('')
    try {
      const sheet = await loadVatSheet({ id: r.id, filingType: 'REGULAR', returnKind: 'PRELIM', year: r.year, monthFrom: r.monthFrom, monthTo: r.monthTo,
        includesOmitted: r.omittedFrom != null, periodName: '', reportDate: r.reportDate, dueDate: r.reportDate, taxAgent: false, closure: false }, accounts)
      setAttach({ kind, sheet })
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  function printAttach() {
    const el = document.getElementById('vat-media-sheet')
    const win = openPrintWindow()
    if (!win || !el) return
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${attach?.kind ?? ''}</title><style>${PRINT_CSS}</style></head>`
      + `<body>${el.innerHTML}</body></html>`)
  }

  const period = (r: { year: number; monthFrom: number; monthTo: number }) => `${r.year} / ${pad(r.monthFrom)} ~ ${pad(r.monthTo)}`
  const omitted = (r: { omittedFrom: number | null; omittedTo: number | null }) =>
    r.omittedFrom != null && r.omittedTo != null ? `${pad(r.omittedFrom)} ~ ${pad(r.omittedTo)}` : '없음'
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id))
  const locked = !!form?.id
  const written = (d: string) => { const [y, m, dd] = d.split('-'); return `${y}년 ${m}월 ${dd}일` }

  return (
    <EcListShell title="과세자료전산매체" option={false} onNew={openNew}
                 actions={[{ label: '선택삭제', onClick: () => setConfirmDelete(true), selected: picked.size }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {confirmDelete && (
        <div className="ec-alert mb-[8px] flex items-center gap-[6px]">
          삭제한 데이터는 복구되지 않습니다. 삭제하겠습니까?
          <button className="ec-btn ec-btn-primary" onClick={() => void removePicked()}>확인</button>
          <button className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      )}

      <table className="w-full text-center">
        <thead>
          <tr>
            <th className="w-[34px]">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} />
            </th>
            <th>신고기간</th>
            <th>예정누락</th>
            <th>회사명</th>
            <th>사업자등록번호</th>
            <th>자료구분</th>
            <th>합계표</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">
                <input type="checkbox" aria-label={`${period(r)} 선택`} checked={picked.has(r.id)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                {' '}{i + 1}
              </td>
              <td><button className="ec-link" onClick={() => openRow(r)}>{period(r)}</button></td>
              <td>{omitted(r)}</td>
              <td>{company?.name ?? ''}</td>
              <td>{company?.bizRegNo ?? ''}</td>
              <td>{r.kindName}</td>
              <td><button className="ec-link" onClick={() => setSummary(r)}>조회</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <Modal open error={formError} title="전산매체 파일생성" width={780} onClose={() => setForm(null)}>
          <ul className="ec-form [&>li>.title]:basis-[120px]">
            <EcCond label="전산매체" span={2}>
              <label className="inline-flex items-center gap-[3px] mr-[10px]">
                <input type="checkbox" disabled={locked} checked={form.invoiceSummary && form.taxInvoiceSummary}
                       onChange={(e) => set({ invoiceSummary: e.target.checked, taxInvoiceSummary: e.target.checked })} /> 전체
              </label>
              <label className="inline-flex items-center gap-[3px] mr-[10px]">
                <input type="checkbox" disabled={locked} checked={form.invoiceSummary} onChange={(e) => set({ invoiceSummary: e.target.checked })} /> 계산서합계표
              </label>
              <label className="inline-flex items-center gap-[3px]">
                <input type="checkbox" disabled={locked} checked={form.taxInvoiceSummary} onChange={(e) => set({ taxInvoiceSummary: e.target.checked })} /> 세금계산서합계표
              </label>
            </EcCond>
            <EcCond label="신고기간" span={2}>
              <select className="ec-input flex-1" aria-label="신고연도" disabled={locked} value={form.year} onChange={(e) => set({ year: Number(e.target.value) })}>
                <option value={thisYear}>{thisYear}</option>
              </select>
              <select className="ec-input flex-1" aria-label="시작월" disabled={locked} value={form.monthFrom} onChange={(e) => set({ monthFrom: Number(e.target.value) })}>
                {MONTHS.map((m) => <option key={m} value={m}>{pad(m)}월</option>)}
              </select>
              ~
              <select className="ec-input flex-1" aria-label="끝월" disabled={locked} value={form.monthTo} onChange={(e) => set({ monthTo: Number(e.target.value) })}>
                {MONTHS.map((m) => <option key={m} value={m}>{pad(m)}월</option>)}
              </select>
            </EcCond>
            <EcCond label="예정누락기간" span={2}>
              <select className="ec-input flex-1" aria-label="예정누락 시작월" disabled={locked} value={form.omittedFrom ?? ''}
                      onChange={(e) => set({ omittedFrom: e.target.value ? Number(e.target.value) : null })}>
                <option value="">===</option>
                {MONTHS.map((m) => <option key={m} value={m}>{pad(m)}월</option>)}
              </select>
              ~
              <select className="ec-input flex-1" aria-label="예정누락 끝월" disabled={locked} value={form.omittedTo ?? ''}
                      onChange={(e) => set({ omittedTo: e.target.value ? Number(e.target.value) : null })}>
                <option value="">===</option>
                {MONTHS.map((m) => <option key={m} value={m}>{pad(m)}월</option>)}
              </select>
            </EcCond>
            <EcCond label="세무신고사업장" span={2}>
              <select className="ec-input w-full" disabled><option>{[company?.name, company?.bizRegNo].filter(Boolean).join(' ')}</option></select>
            </EcCond>
            <EcCond label="신고작성일자" span={2}>
              <input type="date" className="ec-input w-[150px]" aria-label="신고작성일자" value={form.reportDate}
                     onChange={(e) => set({ reportDate: e.target.value })} />
            </EcCond>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
            <button className="ec-btn" onClick={() => setForm(null)}>닫기</button>
          </div>
        </Modal>
      )}

      {summary && !attach && (
        <Modal open error={error} title="(세금)계산서합계표" width={780} onClose={() => setSummary(null)}>
          <table className="w-full text-center mb-[12px]">
            <thead><tr><th>신고기간</th><th>사업자등록번호</th><th>예정누락기간</th><th>신고(작성)일자</th></tr></thead>
            <tbody>
              <tr><td>{period(summary)}</td><td>{company?.bizRegNo ?? ''}</td><td>{omitted(summary)}</td><td>{summary.reportDate.replace(/-/g, '/')}</td></tr>
            </tbody>
          </table>
          <table className="w-full">
            <thead><tr><th className="w-[40px]" /><th>첨부서류명</th><th className="w-[120px] text-center">조회</th></tr></thead>
            <tbody>
              {summary.taxInvoiceSummary ? (['매출세금계산서', '매입세금계산서'] as const).map((k, i) => (
                <tr key={k}>
                  <td className="text-center">{i + 1}</td>
                  <td>{k}</td>
                  <td className="text-center"><button className="ec-link" onClick={() => void openAttach(summary, k)}>조회</button></td>
                </tr>
              )) : <tr><td colSpan={3} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn" onClick={() => setSummary(null)}>닫기</button>
          </div>
        </Modal>
      )}

      {summary && attach && (
        <Modal open error={error} title={attach.kind} width={900} onClose={() => setAttach(null)}>
          <div id="vat-media-sheet">
            {attach.kind === '매출세금계산서' && <p className="mb-[6px]">※ 과세기간 종료일 다음달 11일까지 전송된 전자세금계산서는 매출처별 명세가 기재되지 않습니다.</p>}
            <InvoiceSummarySheet side={attach.kind === '매출세금계산서' ? '매출' : '매입'} s={attach.sheet} c={company}
                                 invoices={attach.kind === '매출세금계산서' ? attach.sheet.salesInvoices : attach.sheet.purchaseInvoices}
                                 written={written(summary.reportDate)} />
          </div>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn" onClick={printAttach}>인쇄</button>
            <button className="ec-btn" onClick={() => setAttach(null)}>닫기</button>
          </div>
        </Modal>
      )}
    </EcListShell>
  )
}
