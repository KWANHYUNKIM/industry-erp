import { useEffect, useState } from 'react'
import EcListShell from '../../../components/EcListShell'
import Modal from '../../../components/Modal'
import { ErrTip } from '../../../components/codepicker/GridCode'
import { EcCond } from '../../../components/EcStatusPanel'
import { historyTime, type HistoryRow } from '../../../components/EcHistory'
import { api, extractErrorMessage } from '../../../api/client'
import EcDateInput from '../../../components/ui/EcDateInput'
import { pad2 } from '../../../utils/periods'

type Kind = 'BATCH' | 'LABOR' | 'RETIREMENT' | 'RESIDENT_OTHER' | 'RESIDENT_BUSINESS' | 'NONRESIDENT' | 'INTEREST_DIVIDEND' | 'MEDICAL'
type Basis = 'ATTRIBUTION' | 'PAYMENT'
type OtherIncome = 'INCLUDE' | 'EXCLUDE' | 'PARTIAL'
type Submitter = 'DIRECT' | 'AGENT'

interface PaymentStatementFile {
  id: number; kind: Kind; kindName: string; attrYear: number; attrMonth: number; reportDate: string
  midSettlement: boolean; basis: Basis; otherIncome: OtherIncome
  managerDept: string; managerName: string; managerPhone: string; submitter: Submitter
}
type Company = { name?: string; bizRegNo?: string }

/**
 * 원본 자료구분 차례 · 꼬리표(2026-10-14 실측). 신고구분 '연간합산제출' 은 모두에 붙고,
 * 중도정산은 일괄생성 · 근로소득, 반영기준은 일괄생성 · 거주자 사업소득 · 비거주자, 기타소득은 일괄생성 · 거주자 기타소득.
 */
const KINDS: { value: Kind; label: string; mid?: boolean; basis?: boolean; other?: boolean }[] = [
  { value: 'BATCH', label: '일괄생성', mid: true, basis: true, other: true },
  { value: 'LABOR', label: '근로소득', mid: true },
  { value: 'RETIREMENT', label: '퇴직소득' },
  { value: 'RESIDENT_OTHER', label: '거주자 기타소득', other: true },
  { value: 'RESIDENT_BUSINESS', label: '거주자 사업소득', basis: true },
  { value: 'NONRESIDENT', label: '비거주자 사업,기타소득', basis: true },
  { value: 'INTEREST_DIVIDEND', label: '이자,배당소득' },
  { value: 'MEDICAL', label: '의료비명세서' },
]
const kindOf = (k: Kind) => KINDS.find((x) => x.value === k)!

type Form = Omit<PaymentStatementFile, 'id' | 'kindName'> & { id?: number }

/** 원본 [신규] 기본값 — 귀속연월 작년 12월, 신고일자 올해 3월 10일(지급명세서 제출 기한), 꼬리표 포함 · 귀속연월 · 포함. */
function blank(): Form {
  const y = new Date().getFullYear()
  return {
    kind: 'BATCH', attrYear: y - 1, attrMonth: 12, reportDate: `${y}-03-10`,
    midSettlement: true, basis: 'ATTRIBUTION', otherIncome: 'INCLUDE',
    managerDept: '', managerName: '', managerPhone: '', submitter: 'DIRECT',
  }
}

/** 국세청 전자파일 [생성] · [목록](내려받기)은 사용자 승인 전이라 잠가 둔다 — 눌러도 파일을 만들지 않는다. */
const FILE_LOCKED = '전자파일 생성 · 내려받기는 아직 열지 않았습니다(국세청 제출 파일은 사용자 승인 뒤에 엽니다).'

/**
 * 지급명세서파일생성 (원본 세무 › 원천징수 › 지급명세서 E030503, 2026-10-14 loginaa 실측).
 *
 * <p>목록 [☐ · 귀속연월 · 신고구분 · 신고일자 · 회사명 · 사업자등록번호 · 자료구분 · 전자파일(생성 / 목록) · 이력], [신규(F2) · 선택삭제].
 * 조건(접혀 있다 — [Search(F3)]): 귀속연도 작년-1 ~ 작년 · 세무신고사업장 · 자료구분(기본 일괄생성 = 전체).
 * [신규] 창 '지급명세서파일생성' — 자료구분 · 꼬리표(누르면 펼친다) · 귀속연월 · 신고일자 · 담당자 부서명 · 성명 · 전화번호 · 제출자.
 * 비우면 '부서명을 입력바랍니다.' · '성명을 입력바랍니다.' · '전화번호를 입력바랍니다.', 같은 자료구분 · 귀속연월은
 * '이미 생성된 자료입니다.'. 수정 창은 자료구분 · 귀속연월이 잠기고 [H] 가 붙는다. 저장해도 간이지급명세서 ·
 * 소득자료제출집계표 숫자는 그대로다(원본도 같다).
 */
export default function PaymentStatementFilePage() {
  const y = new Date().getFullYear()
  const [cond, setCond] = useState({ fromYear: y - 2, toYear: y - 1, kind: 'BATCH' as Kind })
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<PaymentStatementFile[]>([])
  const [company, setCompany] = useState<Company | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [tip, setTip] = useState<'dept' | 'name' | 'phone' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [history, setHistory] = useState<PaymentStatementFile | null>(null)

  function load(c: typeof cond = cond) {
    setError('')
    api.get<PaymentStatementFile[]>('/payment-statement-files', { params: { fromYear: c.fromYear, toYear: c.toYear, kind: c.kind } })
      .then((r) => { setRows(r.data); setPicked(new Set()) })
      .catch((e) => { setRows([]); setError(extractErrorMessage(e)) })
  }
  useEffect(() => {
    load()
    api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  function open(f: Form) { setFormError(''); setTip(null); setTagsOpen(false); setForm(f) }

  async function save() {
    if (!form) return
    /* 원본: 글줄 알림 없이 그 칸만 빨간 테두리 + 말풍선(첫 빈 칸). 칸에 글자를 넣으면 사라진다. */
    const miss = !form.managerDept.trim() ? 'dept' : !form.managerName.trim() ? 'name' : !form.managerPhone.trim() ? 'phone' : null
    setTip(miss)
    if (miss) return
    const id = form.id
    const body = {
      kind: form.kind, attrYear: form.attrYear, attrMonth: form.attrMonth, reportDate: form.reportDate,
      midSettlement: form.midSettlement, basis: form.basis, otherIncome: form.otherIncome,
      managerDept: form.managerDept, managerName: form.managerName, managerPhone: form.managerPhone, submitter: form.submitter,
    }
    try {
      if (id) await api.put(`/payment-statement-files/${id}`, body)
      else await api.post('/payment-statement-files', body)
      setForm(null)
      load()
    } catch (e) {
      const m = extractErrorMessage(e)
      if (m === '이미 생성된 자료입니다.') setNotice(m)
      else setFormError(m)
    }
  }

  async function doDelete() {
    setConfirmDelete(false)
    try {
      await api.post('/payment-statement-files/delete', [...picked])
      load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const q = search.trim()
  const shown = q ? rows.filter((r) => `${r.attrYear}.${pad2(r.attrMonth)} ${r.kindName}`.includes(q)) : rows
  const allPicked = shown.length > 0 && shown.every((r) => picked.has(r.id))
  const condYears = [y + 1, y, y - 1, y - 2]
  const k = form ? kindOf(form.kind) : null
  const radio = <T extends string | boolean>(name: string, value: T, set: (v: T) => void, opts: [T, string][]) => (
    opts.map(([v, l]) => (
      <label key={String(v)} className="inline-flex items-center gap-[3px] mr-[10px]">
        <input type="radio" name={name} checked={value === v} onChange={() => set(v)} /> {l}
      </label>
    ))
  )

  return (
    <EcListShell title="지급명세서파일생성" option={false} search={search} onSearchChange={setSearch} onSearch={() => load()}
                 onNew={() => open(blank())}
                 actions={[{ label: '선택삭제', selected: picked.size, onClick: () => setConfirmDelete(true) }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="귀속연도">
          <select className="ec-input w-[90px]" aria-label="귀속연도 시작" value={cond.fromYear} onChange={(e) => setCond({ ...cond, fromYear: Number(e.target.value) })}>
            {condYears.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          {' ~ '}
          <select className="ec-input w-[90px]" aria-label="귀속연도 끝" value={cond.toYear} onChange={(e) => setCond({ ...cond, toYear: Number(e.target.value) })}>
            {condYears.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="세무신고사업장">
          <input className="ec-input w-full" disabled value={company ? `${company.name ?? ''} ${company.bizRegNo ?? ''}`.trim() : ''} />
        </EcCond>
        <EcCond label="자료구분">
          <select className="ec-input w-full" aria-label="조건 자료구분" value={cond.kind} onChange={(e) => setCond({ ...cond, kind: e.target.value as Kind })}>
            {KINDS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </EcCond>
      </ul>

      <table className="w-full text-center">
        <thead>
          <tr>
            <th className="w-[49px]">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map((r) => r.id)))} />
            </th>
            <th>귀속연월</th>
            <th>신고구분</th>
            <th>신고일자</th>
            <th>회사명</th>
            <th>사업자등록번호</th>
            <th>자료구분</th>
            <th>전자파일</th>
            <th className="w-[101px]">이력</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">
                <input type="checkbox" aria-label={`${r.attrYear}.${pad2(r.attrMonth)} ${r.kindName} 선택`} checked={picked.has(r.id)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                {' '}{i + 1}
              </td>
              <td><button className="ec-link" onClick={() => open({ ...r })}>{r.attrYear}.{pad2(r.attrMonth)}</button></td>
              <td>정기신고</td>
              <td>{r.reportDate.replace(/-/g, '.')}</td>
              <td>{company?.name ?? ''}</td>
              <td>{company?.bizRegNo ?? ''}</td>
              <td>{r.kindName}</td>
              <td>
                <div><button className="ec-link" onClick={() => setNotice(FILE_LOCKED)}>생성</button></div>
                <div><button className="ec-link" onClick={() => setNotice(FILE_LOCKED)}>목록</button></div>
              </td>
              <td><button className="ec-link" onClick={() => setHistory(r)}>이력</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {form && k && (
        <Modal open error={formError} title="지급명세서파일생성" width={960} onClose={() => setForm(null)}>
          <ul className="ec-form">
            <EcCond label="자료구분" span={2}>
              <div className="w-full">
                <select className="ec-input w-full" aria-label="자료구분" value={form.kind} disabled={!!form.id}
                        onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
                  {KINDS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {!tagsOpen ? (
                  <div className="flex gap-[4.5px] mt-[6px]">
                    {['연간합산제출', k.mid && '중도정산포함', k.basis && '자료반영기준', k.other && '기타소득'].filter(Boolean).map((t) => (
                      <button key={String(t)} type="button" className="ec-label-chip bg-ec-disabled text-ec-ink cursor-pointer"
                              onClick={() => setTagsOpen(true)}>{t}</button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-[6px] flex flex-col gap-[6px]">
                    <div><span className="ec-label-chip bg-ec-disabled text-ec-ink mr-[4.5px]">신고구분</span>연간합산제출</div>
                    {k.mid && <div><span className="ec-label-chip bg-ec-disabled text-ec-ink mr-[4.5px]">중도정산</span>
                      {radio('psf-mid', form.midSettlement, (v) => setForm({ ...form, midSettlement: v }), [[true, '포함'], [false, '미포함']])}</div>}
                    {k.basis && <div><span className="ec-label-chip bg-ec-disabled text-ec-ink mr-[4.5px]">반영기준</span>
                      {radio<Basis>('psf-basis', form.basis, (v) => setForm({ ...form, basis: v }), [['ATTRIBUTION', '귀속연월'], ['PAYMENT', '지급연월']])}</div>}
                    {k.other && <div><span className="ec-label-chip bg-ec-disabled text-ec-ink mr-[4.5px]">기타소득</span>
                      {radio<OtherIncome>('psf-other', form.otherIncome, (v) => setForm({ ...form, otherIncome: v }), [['INCLUDE', '포함'], ['EXCLUDE', '미포함'], ['PARTIAL', '일부포함']])}</div>}
                  </div>
                )}
              </div>
            </EcCond>
            <EcCond label="귀속연월">
              <select className="ec-input w-[70px]" aria-label="귀속연도" value={form.attrYear} disabled={!!form.id}
                      onChange={(e) => setForm({ ...form, attrYear: Number(e.target.value) })}>
                {[y, y - 1].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select className="ec-input w-[60px]" aria-label="귀속월" value={form.attrMonth} disabled={!!form.id}
                      onChange={(e) => setForm({ ...form, attrMonth: Number(e.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{pad2(i + 1)}</option>)}
              </select>
            </EcCond>
            <EcCond label="신고일자">
              <EcDateInput className="ec-input w-[150px]" value={form.reportDate} onChange={(e) => setForm({ ...form, reportDate: e.target.value })} />
            </EcCond>
            <EcCond label="담당자 부서명">
              <div className={`relative w-full ${tip === 'dept' && !form.managerDept.trim() ? 'ec-invalid' : ''}`}>
                <input className="ec-input w-full" placeholder="담당자 부서명" value={form.managerDept}
                       onChange={(e) => setForm({ ...form, managerDept: e.target.value })} />
                {tip === 'dept' && !form.managerDept.trim() && <ErrTip msg="부서명을 입력바랍니다." />}
              </div>
            </EcCond>
            <EcCond label="담당자 성명">
              <div className={`relative w-full ${tip === 'name' && !form.managerName.trim() ? 'ec-invalid' : ''}`}>
                <input className="ec-input w-full" placeholder="담당자 성명" value={form.managerName}
                       onChange={(e) => setForm({ ...form, managerName: e.target.value })} />
                {tip === 'name' && !form.managerName.trim() && <ErrTip msg="성명을 입력바랍니다." />}
              </div>
            </EcCond>
            <EcCond label="담당자 전화번호">
              <div className={`relative w-full ${tip === 'phone' && !form.managerPhone.trim() ? 'ec-invalid' : ''}`}>
                <input className="ec-input w-full" placeholder="담당자 전화번호" value={form.managerPhone}
                       onChange={(e) => setForm({ ...form, managerPhone: e.target.value })} />
                {tip === 'phone' && !form.managerPhone.trim() && <ErrTip msg="전화번호를 입력바랍니다." />}
              </div>
            </EcCond>
            <EcCond label="제출자">
              {radio<Submitter>('psf-submitter', form.submitter, (v) => setForm({ ...form, submitter: v }), [['DIRECT', '직접제출'], ['AGENT', '세무대리인']])}
            </EcCond>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
            <button className="ec-btn" onClick={() => setForm(null)}>닫기</button>
            {form.id && <button className="ec-btn ml-auto" onClick={() => {
              const r = rows.find((x) => x.id === form.id); if (r) setHistory(r)
            }}>H</button>}
          </div>
        </Modal>
      )}

      {notice && (
        <Modal open title="알림" width={420} error={error} onClose={() => setNotice(null)}>
          <p className="mb-[12px]">{notice}</p>
          <button className="ec-btn ec-btn-primary" onClick={() => setNotice(null)}>확인</button>
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

      {history && <HistoryModal file={history} onClose={() => setHistory(null)} />}
    </EcListShell>
  )
}

/** 원본 [이력] — '지급명세서전자파일 이력보기' [순번 · 작업자ID · 작업일시 · 신고서종류 · 상태(신규 · 수정)] + [닫기]. */
function HistoryModal({ file, onClose }: { file: PaymentStatementFile; onClose: () => void }) {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    api.get<HistoryRow[]>(`/payment-statement-files/${file.id}/history`).then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [file.id])
  return (
    <Modal open title="지급명세서전자파일 이력보기" width={760} error={error} onClose={onClose}>
      <table className="w-full text-center">
        <thead><tr><th>순번</th><th>작업자ID</th><th>작업일시</th><th>신고서종류</th><th>상태</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.seq}>
              <td>{r.seq}</td>
              <td>{(r.worker ?? '').toUpperCase()}</td>
              <td>{historyTime(r.workedAt)}</td>
              <td>{file.kindName}</td>
              <td>{r.action}</td>
            </tr>
          ))}
          {rows.length === 0 && !error && <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
        </tbody>
      </table>
      <div className="flex gap-[6px] mt-[10px]">
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
