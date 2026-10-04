import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { EcReportFoot, EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import { api, extractErrorMessage } from '../../api/client'
import type { WithholdingLineReportRow } from '../../types/api'

const won = (n: number) => Math.trunc(n).toLocaleString('ko-KR')
const ym = (s: string) => s.replace('-', '/')
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const TYPES = ['사업소득', '이자배당소득', '기타소득']

/** 원본 기본 기간 — 오늘 기준 한 달 전 같은 날 ~ 한 달 뒤 전날(2026/10/04 → 2026/09/04 ~ 2026/11/03). */
function defaultPeriod() {
  const t = new Date()
  const from = new Date(t.getFullYear(), t.getMonth() - 1, t.getDate())
  const to = new Date(t.getFullYear(), t.getMonth() + 1, t.getDate() - 1)
  return [iso(from), iso(to)]
}

/**
 * 기타원천세현황 (원본 세무 › 기타원천세 › 기타원천세현황 E030316, 2026-10-04 loginaa 실측).
 *
 * <p>조건 [지급일자(기본 한 달 전 ~ 한 달 뒤 전날) · 귀속연월 · 지급연월(둘 다 [사용]을 켜야 건다) · 소득구분 · 소득자 · 소득코드],
 * 출력물은 지급 줄마다 [지급일자-No. · 귀속연월 · 지급연월 · 소득자명 · 소득구분 · 소득코드 · 지급총액 · 세액합계 ·
 * 세무신고사업장번호 · 세무신고사업장], 달이 바뀔 때 '2026/08 계' 소계, 끝에 '합계'. 소득자가 빈 줄도 찍는다(조회 · 집계와 다르다).
 * 사업소득의 소득코드는 원본처럼 '00'. 지급일자-No. 를 누르면 그 전표를 연다. 자료가 없으면 '등록된 데이터가 없습니다.'.
 *
 * <p>두지 않은 것: 조건의 세무신고사업장 · 금액 범위 · 세율 · 적요 · 작성자 · 수정일자순, 아래 [인쇄 · Excel].
 */
export default function OtherWithholdingStatusPage() {
  const navigate = useNavigate()
  const [[from, to], setPeriod] = useState(defaultPeriod)
  const thisMonth = iso(new Date()).slice(0, 7)
  const [useAttr, setUseAttr] = useState(false)
  const [attrFrom, setAttrFrom] = useState(thisMonth)
  const [attrTo, setAttrTo] = useState(thisMonth)
  const [usePay, setUsePay] = useState(false)
  const [payFrom, setPayFrom] = useState(thisMonth)
  const [payTo, setPayTo] = useState(thisMonth)
  const [type, setType] = useState('')
  const [payee, setPayee] = useState('')
  const [code, setCode] = useState('')
  const [rows, setRows] = useState<WithholdingLineReportRow[] | null>(null)
  const [shown, setShown] = useState<[string, string]>(['', ''])
  const [company, setCompany] = useState<{ name: string; bizRegNo: string | null } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ name: string; bizRegNo: string | null } | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])

  async function search() {
    setError('')
    try {
      const { data } = await api.get<WithholdingLineReportRow[]>('/other-withholdings/lines', { params: { from, to } })
      setRows(data.filter((r) =>
        (!useAttr || (r.attributionMonth >= attrFrom && r.attributionMonth <= attrTo))
        && (!usePay || (r.payMonth >= payFrom && r.payMonth <= payTo))
        && (!type || r.incomeTypeName === type)
        && (!payee.trim() || (r.payeeName ?? '').includes(payee.trim()))
        && (!code.trim() || r.incomeCode === code.trim())))
      setShown([from, to])
    } catch (e) {
      setRows([]); setError(extractErrorMessage(e))
    }
  }

  // 지급일자의 달마다 묶어 소계를 단다.
  const groups: { month: string; rows: WithholdingLineReportRow[] }[] = []
  for (const r of rows ?? []) {
    const m = r.payDate.slice(0, 7)
    if (groups.length === 0 || groups[groups.length - 1].month !== m) groups.push({ month: m, rows: [] })
    groups[groups.length - 1].rows.push(r)
  }
  const sum = (rs: WithholdingLineReportRow[], k: 'grossAmount' | 'taxTotal') => rs.reduce((a, r) => a + Number(r[k]), 0)

  return (
    <EcListShell title="기타원천세현황" onSearch={search}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="지급일자">
          <input type="date" className="ec-input w-[150px]" value={from} onChange={(e) => setPeriod([e.target.value, to])} />
          ~
          <input type="date" className="ec-input w-[150px]" value={to} onChange={(e) => setPeriod([from, e.target.value])} />
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
        <EcCond label="소득코드">
          <input className="ec-input w-[120px]" placeholder="소득코드" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} />
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
          </div>
        </li>
      </ul>

      {rows !== null && (
        <>
          <EcReportHead title="기타원천세현황" period={reportPeriod(shown[0], shown[1])} />
          <table className="w-full ec-report">
            <thead>
              <tr>
                <th className="text-center">지급일자-No.</th>
                <th className="text-center">귀속연월</th>
                <th className="text-center">지급연월</th>
                <th>소득자명</th>
                <th>소득구분</th>
                <th>소득코드</th>
                <th className="text-right">지급총액</th>
                <th className="text-right">세액합계</th>
                <th>세무신고사업장번호</th>
                <th>세무신고사업장</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : <>
                {groups.map((g) => (
                  <Fragment key={g.month}>
                    {g.rows.map((r, i) => (
                      <tr key={`${r.slipNo}-${i}`}>
                        <td className="text-center">
                          <button className="ec-link" onClick={() => navigate(`/accounting/other-withholding/input?date=${r.payDate}&seq=${r.slipSeq}`)}>
                            {r.slipNo.replace(/-(\d+)$/, ' -$1')}
                          </button>
                        </td>
                        <td className="text-center">{ym(r.attributionMonth)}</td>
                        <td className="text-center">{ym(r.payMonth)}</td>
                        <td>{r.payeeName ?? ''}</td>
                        <td>{r.incomeTypeName}</td>
                        <td>{r.incomeCode ?? ''}</td>
                        <td className="text-right">{won(r.grossAmount)}</td>
                        <td className="text-right">{won(r.taxTotal)}</td>
                        <td>{(company?.bizRegNo ?? '').replace(/-/g, '')}</td>
                        <td>{company?.name ?? ''}</td>
                      </tr>
                    ))}
                    <tr className="ec-total">
                      <td colSpan={6} className="text-center">{ym(g.month)} 계</td>
                      <td className="text-right">{won(sum(g.rows, 'grossAmount'))}</td>
                      <td className="text-right">{won(sum(g.rows, 'taxTotal'))}</td>
                      <td colSpan={2} />
                    </tr>
                  </Fragment>
                ))}
                <tr className="ec-total">
                  <td colSpan={6} className="text-center">합계</td>
                  <td className="text-right">{won(sum(rows, 'grossAmount'))}</td>
                  <td className="text-right">{won(sum(rows, 'taxTotal'))}</td>
                  <td colSpan={2} />
                </tr>
              </>}
            </tbody>
          </table>
          <EcReportFoot />
        </>
      )}
    </EcListShell>
  )
}
