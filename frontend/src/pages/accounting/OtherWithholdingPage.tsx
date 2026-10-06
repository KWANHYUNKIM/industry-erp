import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { WithholdingSlip, WithholdingSlipListRow } from '../../types/api'

const won = (n: number) => Math.trunc(n).toLocaleString('ko-KR')
const ym = (s: string) => s.replace('-', '/')
const today = () => new Date().toISOString().slice(0, 10)
const TYPES = ['사업소득', '이자배당소득', '기타소득', '비거주자사업기타소득']

/**
 * 기타원천세 조회 (원본 세무 › 기타원천세 › 기타원천세조회 E030315, 2026-10-04 loginaa 실측).
 *
 * <p>전표마다 한 줄 [☐ · 지급일자-No · 귀속연월 · 지급연월 · 소득자명 · 소득구분 · 지급총액 · 세액합계 · 실지급액합계 · 세무신고사업장],
 * 최근 지급일자부터. 소득자명은 원본처럼 '두뇌발달센터 외 2건'. 소득자가 하나도 없는 전표는 원본도 목록에 안 나온다
 * (현황에만 보인다). 조건은 접혀 있고 [Search(F3)] 로 편다 — 지급일자(기본 이번 달 1일 ~ 오늘) · 귀속연월 · 지급연월(둘 다 [사용]
 * 을 켜야 건다) · 소득구분 · 소득자. 아래 [신규(F2) · 선택삭제]. 지급일자-No 를 누르면 기타원천세입력에서 그 전표를 고친다.
 *
 * <p>[일반전표작성]은 고른 전표로 일반전표 창을 채운다(아래 JournalModal).
 *
 * <p>두지 않은 것: [Excel] · 조건의 세무신고사업장 · 소득코드 · 금액 범위 · 세율 · 적요 · 작성자.
 */
export default function OtherWithholdingPage() {
  const navigate = useNavigate()
  const [from, setFrom] = useState(today().slice(0, 8) + '01')
  const [to, setTo] = useState(today())
  const [useAttr, setUseAttr] = useState(false)
  const [attrFrom, setAttrFrom] = useState(today().slice(0, 7))
  const [attrTo, setAttrTo] = useState(today().slice(0, 7))
  const [usePay, setUsePay] = useState(false)
  const [payFrom, setPayFrom] = useState(today().slice(0, 7))
  const [payTo, setPayTo] = useState(today().slice(0, 7))
  const [type, setType] = useState('')
  const [payee, setPayee] = useState('')
  const [rows, setRows] = useState<WithholdingSlipListRow[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [company, setCompany] = useState<{ bizRegNo: string | null } | null>(null)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [journal, setJournal] = useState<JournalDraft | null>(null)

  async function search() {
    setError('')
    try {
      const { data } = await api.get<WithholdingSlipListRow[]>('/other-withholdings/slips', { params: { from, to } })
      setRows(data.filter((r) =>
        (!useAttr || (r.attributionMonth >= attrFrom && r.attributionMonth <= attrTo))
        && (!usePay || (r.payMonth >= payFrom && r.payMonth <= payTo))
        && (!type || r.incomeTypeName === type)
        && (!payee.trim() || r.payeeSummary.includes(payee.trim()))))
      setPicked(new Set())
    } catch (e) {
      setRows([]); setError(extractErrorMessage(e))
    }
  }
  useEffect(() => {
    void search()
    api.get<{ bizRegNo: string | null } | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function doDelete() {
    setConfirmDelete(false)
    try {
      await api.post('/other-withholdings/slips/delete',
        rows.filter((r) => picked.has(r.slipNo)).map((r) => ({ payDate: r.payDate, slipSeq: r.slipSeq })))
      await search()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  /**
   * [일반전표작성] — 원본처럼 고른 전표로 일반전표 창을 채운다(2026-10-04 실측, 2026/08/19-1): 지급 줄마다 차변 지급총액
   * (계정은 사람이 고른다), 대변 실지급액 합계(계정 빈칸) · 대변 예수금 세액합계, 전표일자는 오늘. 고른 전표가 없으면
   * '리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'.
   */
  async function openJournal() {
    setError('')
    const keys = rows.filter((r) => picked.has(r.slipNo))
    if (keys.length === 0) return setError('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.')
    try {
      const slips = await Promise.all(keys.map(async (r) => (await api.get<WithholdingSlip>(`/other-withholdings/slips/${r.payDate}/${r.slipSeq}`)).data))
      const lines = slips.flatMap((sl) => sl.lines)
      const net = lines.reduce((a, l) => a + Number(l.netAmount), 0)
      const tax = lines.reduce((a, l) => a + Number(l.taxTotal), 0)
      setJournal({
        description: `기타원천세 ${slips.map((sl) => sl.slipNo).join(', ')}`,
        rows: [
          ...lines.map((l) => ({ accountId: '', debit: String(Number(l.grossAmount)), credit: '', description: l.payeeName ?? '' })),
          { accountId: '', debit: '', credit: String(net), description: '' },
          { accountId: 'WITHHOLDING', debit: '', credit: String(tax), description: '' },
        ],
      })
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const allPicked = rows.length > 0 && picked.size === rows.length

  return (
    <EcListShell title="기타원천세 조회" onSearch={search}
                 onNew={() => navigate('/accounting/other-withholding/input')}
                 actions={[
                   { label: '일반전표작성', onClick: () => void openJournal() },
                   { label: '선택삭제', onClick: () => setConfirmDelete(true), disabled: picked.size === 0 },
                 ]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="지급일자">
          <input type="date" className="ec-input w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          ~
          <input type="date" className="ec-input w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
        </EcCond>
        <EcCond label="귀속연월">
          <label className="inline-flex items-center gap-[3px]"><input type="checkbox" checked={useAttr} onChange={(e) => setUseAttr(e.target.checked)} /> 사용</label>
          <input type="month" className="ec-input w-[130px]" disabled={!useAttr} value={attrFrom} onChange={(e) => setAttrFrom(e.target.value)} />
          ~
          <input type="month" className="ec-input w-[130px]" disabled={!useAttr} value={attrTo} onChange={(e) => setAttrTo(e.target.value)} />
        </EcCond>
        <EcCond label="지급연월">
          <label className="inline-flex items-center gap-[3px]"><input type="checkbox" checked={usePay} onChange={(e) => setUsePay(e.target.checked)} /> 사용</label>
          <input type="month" className="ec-input w-[130px]" disabled={!usePay} value={payFrom} onChange={(e) => setPayFrom(e.target.value)} />
          ~
          <input type="month" className="ec-input w-[130px]" disabled={!usePay} value={payTo} onChange={(e) => setPayTo(e.target.value)} />
        </EcCond>
        <EcCond label="소득구분">
          <select className="ec-input w-[200px]" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">소득구분</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </EcCond>
        <EcCond label="소득자">
          <input className="ec-input w-[200px]" placeholder="소득자" value={payee} onChange={(e) => setPayee(e.target.value)} />
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
          </div>
        </li>
      </ul>

      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[47px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.slipNo)))} />
            </th>
            <th className="text-center">지급일자-No</th>
            <th className="text-center">귀속연월</th>
            <th className="text-center">지급연월</th>
            <th className="text-center">소득자명</th>
            <th className="text-center">소득구분</th>
            <th className="text-right">지급총액</th>
            <th className="text-right">세액합계</th>
            <th className="text-right">실지급액합계</th>
            <th className="text-center">세무신고사업장</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.slipNo}>
              <td className="whitespace-nowrap text-center">
                <input type="checkbox" aria-label={`${r.slipNo} 선택`} checked={picked.has(r.slipNo)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.slipNo)) n.delete(r.slipNo); else n.add(r.slipNo); return n })} />
                {' '}{i + 1}
              </td>
              <td className="text-center">
                <button className="ec-link" onClick={() => navigate(`/accounting/other-withholding/input?date=${r.payDate}&seq=${r.slipSeq}`)}>{r.slipNo}</button>
              </td>
              <td className="text-center">{ym(r.attributionMonth)}</td>
              <td className="text-center">{ym(r.payMonth)}</td>
              <td className="text-center">{r.payeeSummary}</td>
              <td className="text-center">{r.incomeTypeName}</td>
              <td className="text-right">{won(r.grossAmount)}</td>
              <td className="text-right">{won(r.taxTotal)}</td>
              <td className="text-right">{won(r.netAmount)}</td>
              <td className="text-center">{company?.bizRegNo ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {journal && <JournalModal draft={journal} onClose={() => setJournal(null)} />}

      {confirmDelete && (
        <Modal open title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
          <p className="mb-[12px]">삭제한 데이터는 복구되지 않습니다.<br />삭제하겠습니까?</p>
          <div className="flex gap-[6px]">
            <button className="ec-btn ec-btn-primary" onClick={doDelete}>확인</button>
            <button className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
          </div>
        </Modal>
      )}
    </EcListShell>
  )
}

type JournalRow = { accountId: string; debit: string; credit: string; description: string }
type JournalDraft = { description: string; rows: JournalRow[] }
type Account = { id: number; code: string; name: string }

/**
 * 일반전표 창 — 원본 [일반전표작성] 이 여는 '일반전표' 와 같은 판: 전표일자(오늘) · 적요, 격자 [계정 · 차변 · 대변 · 적요] + 합계.
 * 대변 예수금 줄은 계정을 '예수금' 으로 채워 둔다(원본 2549 예수금, 우리 계정과목표에서는 이름으로 찾는다). 저장하면 회계전표 한 장.
 */
function JournalModal({ draft, onClose }: { draft: JournalDraft; onClose: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [entryDate, setEntryDate] = useState(today())
  const [description, setDescription] = useState(draft.description)
  const [rows, setRows] = useState<JournalRow[]>(draft.rows)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  useEffect(() => {
    api.get<Account[]>('/accounts').then((r) => {
      setAccounts(r.data)
      const w = r.data.find((a) => a.name === '예수금')
      setRows((rs) => rs.map((x) => (x.accountId === 'WITHHOLDING' ? { ...x, accountId: w ? String(w.id) : '' } : x)))
    }).catch((e) => setError(extractErrorMessage(e)))
  }, [])

  const debit = rows.reduce((a, r) => a + (Number(r.debit) || 0), 0)
  const credit = rows.reduce((a, r) => a + (Number(r.credit) || 0), 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '일반전표', [rows])
  const set = (i: number, patch: Partial<JournalRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  async function save() {
    setError('')
    if (rows.some((r) => (Number(r.debit) || Number(r.credit)) && !r.accountId)) return setError('계정을 입력하세요.')
    if (debit !== credit) return setError(`차변합(${won(debit)})과 대변합(${won(credit)})이 일치해야 합니다.`)
    try {
      await api.post('/journals', {
        entryDate, description,
        lines: rows.filter((r) => Number(r.debit) || Number(r.credit)).map((r) => ({
          accountId: Number(r.accountId), debit: Number(r.debit) || 0, credit: Number(r.credit) || 0, description: r.description || undefined,
        })),
      })
      setDone('일반전표를 저장했습니다.')
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  return (
    <Modal open title="일반전표" width={900} error={error} onClose={onClose}>
      {done && <p className="ec-alert mb-[8px]">{done}</p>}
      <ul className="ec-form mb-[8px]">
        <EcCond label="전표일자">
          <input type="date" className="ec-input w-[150px]" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input w-full" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
        </EcCond>
      </ul>
      <table ref={tableRef} className="w-full">
        <thead>
          <tr><th className="text-center w-[40px]">No</th><th>계정</th><th className="text-right">차변</th><th className="text-right">대변</th><th>적요</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="text-center">{i + 1}</td>
              <td>
                <select className="ec-input w-full" value={r.accountId} onChange={(e) => set(i, { accountId: e.target.value })}>
                  <option value="">계정 선택</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
              </td>
              <td><input className="ec-input w-full text-right" inputMode="numeric" min={0} value={r.debit} onChange={(e) => set(i, { debit: e.target.value.replace(/\D/g, ''), credit: '' })} /></td>
              <td><input className="ec-input w-full text-right" inputMode="numeric" min={0} value={r.credit} onChange={(e) => set(i, { credit: e.target.value.replace(/\D/g, ''), debit: '' })} /></td>
              <td><input className="ec-input w-full" maxLength={200} value={r.description} onChange={(e) => set(i, { description: e.target.value })} /></td>
            </tr>
          ))}
          <tr className="ec-total">
            <td colSpan={2} className="text-center">합계</td>
            <td className="text-right">{won(debit)}</td>
            <td className="text-right">{won(credit)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <div className="flex gap-[6px] mt-[12px]">
        <button className="ec-btn ec-btn-primary" onClick={() => void save()} disabled={!!done}>저장(F8)</button>
        <button className="ec-btn" onClick={() => setRows((rs) => [...rs, { accountId: '', debit: '', credit: '', description: '' }])}>줄 추가</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
