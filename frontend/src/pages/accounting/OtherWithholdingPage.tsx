import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { WithholdingSlipListRow } from '../../types/api'

const won = (n: number) => Math.trunc(n).toLocaleString('ko-KR')
const ym = (s: string) => s.replace('-', '/')
const today = () => new Date().toISOString().slice(0, 10)
const TYPES = ['사업소득', '이자배당소득', '기타소득']

/**
 * 기타원천세 조회 (원본 세무 › 기타원천세 › 기타원천세조회 E030315, 2026-10-04 loginaa 실측).
 *
 * <p>전표마다 한 줄 [☐ · 지급일자-No · 귀속연월 · 지급연월 · 소득자명 · 소득구분 · 지급총액 · 세액합계 · 실지급액합계 · 세무신고사업장],
 * 최근 지급일자부터. 소득자명은 원본처럼 '두뇌발달센터 외 2건'. 소득자가 하나도 없는 전표는 원본도 목록에 안 나온다
 * (현황에만 보인다). 조건은 접혀 있고 [Search(F3)] 로 편다 — 지급일자(기본 이번 달 1일 ~ 오늘) · 귀속연월 · 지급연월(둘 다 [사용]
 * 을 켜야 건다) · 소득구분 · 소득자. 아래 [신규(F2) · 선택삭제]. 지급일자-No 를 누르면 기타원천세입력에서 그 전표를 고친다.
 *
 * <p>두지 않은 것: [일반전표작성](회계 전표 연결) · [Excel] · 조건의 세무신고사업장 · 소득코드 · 금액 범위 · 세율 · 적요 · 작성자.
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

  const allPicked = rows.length > 0 && picked.size === rows.length

  return (
    <EcListShell title="기타원천세 조회" onSearch={search}
                 onNew={() => navigate('/accounting/other-withholding/input')}
                 actions={[{ label: '선택삭제', onClick: () => setConfirmDelete(true), disabled: picked.size === 0 }]}>
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
