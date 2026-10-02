import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { WithholdingReceipt, WithholdingStatement } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'

const won = (n: number) => n.toLocaleString('ko-KR')
const thisMonth = () => ymd(new Date()).slice(0, 7)

type Tab = '이행상황신고서' | '원천징수영수증'

/** 원천징수 — 급여에서 뗀 소득세·지방소득세를 신고 단위로 집계. 확정된 급여명세만 대상. */
export default function WithholdingPage() {
  /*
   * 메뉴에 [원천징수이행상황신고서]와 [근로소득원천징수영수증] 두 항목이 있는데 둘 다
   * 이 화면을 가리켰다. 그래서 <b>영수증을 누르든 신고서를 누르든 신고서 탭이 떴다.</b>
   * 둘은 전혀 다른 서류다 — 신고서는 매월 세무서에 내는 것이고, 영수증은 연말정산 뒤
   * 근로자에게 주는 것이다. 메뉴가 ?tab= 으로 지목한다.
   */
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(
    params.get('tab') === '영수증' ? '원천징수영수증' : '이행상황신고서')
  const [month, setMonth] = useState(thisMonth())
  const [year, setYear] = useState(new Date().getFullYear())
  const [stmt, setStmt] = useState<WithholdingStatement | null>(null)
  const [receipts, setReceipts] = useState<WithholdingReceipt[]>([])
  const [error, setError] = useState('')

  function loadStatement() {
    setError('')
    api.get<WithholdingStatement>('/withholding/statement', { params: { month } })
      .then((r) => setStmt(r.data))
      .catch((e) => { setStmt(null); setError(extractErrorMessage(e)) })
  }

  function loadReceipts() {
    setError('')
    api.get<WithholdingReceipt[]>('/withholding/receipts', { params: { year } })
      .then((r) => setReceipts(r.data))
      .catch((e) => { setReceipts([]); setError(extractErrorMessage(e)) })
  }

  useEffect(() => {
    if (tab === '이행상황신고서') loadStatement()
    else loadReceipts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <EcListShell title="원천징수" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div className="flex gap-[2px] mb-[8px] border-b border-b-ec-line border-solid">
        {(['이행상황신고서', '원천징수영수증'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : 'var(--ec-label)',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t}</button>
        ))}
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {tab === '이행상황신고서' ? (
        <>
          <div className="flex items-center gap-[6px] mb-[8px]">
            <span className="text-[12.5px]">귀속월</span>
            <input type="month" className="ec-input" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 150 }} />
            <button className="ec-btn ec-btn-primary" onClick={loadStatement}>조회</button>
            {stmt && stmt.draftCount > 0 && (
              <span className="ml-[8px] text-[12px] text-ec-warn">
                미확정 급여명세 {stmt.draftCount}건은 신고 대상에서 제외됩니다. 급여관리에서 확정하세요.
              </span>
            )}
          </div>

          {stmt && (
            <div className="flex gap-[8px] mb-[10px]">
              <Tile label="인원(근로)" value={`${stmt.headcount}명`} />
              <Tile label="총지급액" value={won(stmt.sections.reduce((a, s) => a + s.grossPay, 0))} />
              <Tile label="소득세" value={won(stmt.grandIncomeTax)} />
              <Tile label="지방소득세" value={won(stmt.grandLocalIncomeTax)} />
              <Tile label="납부할 세액" value={won(stmt.grandWithheld)} strong />
            </div>
          )}

          {/*
            원본 신고서의 [소득구분] 줄 — 근로소득만 세어 일용근로·사업·기타소득 원천세가 신고서에서 빠졌다(QA 68회차).
            아래 사원 표는 그중 근로소득(간이세액)의 내역이다.
          */}
          {stmt && (
            <table className="w-full text-left mb-[12px]">
              <thead>
                <tr>
                  <th className="w-[70px]">코드</th><th>소득구분</th>
                  <th className="text-right">인원(건수)</th>
                  <th className="text-right">총지급액</th>
                  <th className="text-right">소득세</th>
                  <th className="text-right">지방소득세</th>
                  <th className="text-right">원천징수 합계</th>
                </tr>
              </thead>
              <tbody>
                {stmt.sections.map((s) => (
                  <tr key={s.code}>
                    <td className="text-ec-label">{s.code}</td>
                    <td>{s.name}</td>
                    <td className="text-right">{s.count.toLocaleString()}</td>
                    <td className="text-right">{won(s.grossPay)}</td>
                    <td className="text-right">{won(s.incomeTax)}</td>
                    <td className="text-right text-ec-hint">{won(s.localIncomeTax)}</td>
                    <td className="text-right font-bold">{won(s.incomeTax + s.localIncomeTax)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-ec-page">
                  <td colSpan={3}>합계</td>
                  <td className="text-right">{won(stmt.sections.reduce((a, s) => a + s.grossPay, 0))}</td>
                  <td className="text-right">{won(stmt.grandIncomeTax)}</td>
                  <td className="text-right">{won(stmt.grandLocalIncomeTax)}</td>
                  <td className="text-right">{won(stmt.grandWithheld)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="w-[34px]"></th><th>사번</th><th>성명</th>
                <th className="text-right">총지급액</th>
                <th className="text-right">소득세</th>
                <th className="text-right">지방소득세</th>
                <th className="text-right">원천징수 합계</th>
              </tr>
            </thead>
            <tbody>
              {!stmt || stmt.rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-ec-hint p-[20px]">
                  확정된 급여명세가 없습니다.
                </td></tr>
              ) : stmt.rows.map((r, i) => (
                <tr key={r.payslipId}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{r.employeeCode}</td>
                  <td>{r.employeeName}</td>
                  <td className="text-right">{won(r.grossPay)}</td>
                  <td className="text-right">{won(r.incomeTax)}</td>
                  <td className="text-right text-ec-hint">{won(r.localIncomeTax)}</td>
                  <td className="text-right font-bold">{won(r.totalWithheld)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <div className="flex items-center gap-[6px] mb-[8px]">
            <span className="text-[12.5px]">귀속연도</span>
            <input type="number" className="ec-input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }} />
            <button className="ec-btn ec-btn-primary" onClick={loadReceipts}>조회</button>
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
        </>
      )}
    </EcListShell>
  )
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', borderRadius: 3, padding: '8px 10px', background: strong ? 'var(--ec-blue-wash)' : '#fff' }}>
      <div className="text-[11.5px] text-ec-hint">{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: strong ? 'var(--ec-blue-dark)' : 'var(--ec-text)' }}>{value}</div>
    </div>
  )
}
