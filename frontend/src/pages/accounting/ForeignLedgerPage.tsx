import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField, { type CodeItem } from '../../components/CodePickerField'
import EcPeriodPicks, { NOTE_FLOW_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { useCondPickers } from '../../utils/useCondPickers'

const num = (n: number | null | undefined, frac = 0) =>
  n == null || Number(n) === 0 ? '' : Number(n).toLocaleString('ko-KR', { minimumFractionDigits: frac, maximumFractionDigits: frac })
const fx = (n: number | null | undefined) => num(n, 2)

interface Row {
  kind: 'CARRY' | 'LINE' | 'TOTAL' | 'SUM'
  date: string | null; docNo: string | null; description: string | null
  accountCode: string | null; accountName: string | null
  partnerCode: string | null; partnerName: string | null
  currencyCode: string | null
  foreignCarry: number | null; foreignDebit: number | null; foreignCredit: number | null; foreignBalance: number | null
  krwCarry: number | null; krwDebit: number | null; krwCredit: number | null; krwBalance: number | null
}
interface Resp { mode: 'PARTNER' | 'DETAIL'; rows: Row[] }

/**
 * 회계 I &gt; 출력물 &gt; 장부 &gt; <b>외화장부</b>(E010831).
 *
 * <p>조건(2026-10-21 loginaa 실측): 검색구분(◉거래처별집계 ○건별) · 기준일자(최근30일) · 계정 · 거래처 · 부서 · 프로젝트 · 외화 ·
 * 기타 ☑사용중단거래처포함 · 대표거래처로 합산(◉거래처관계기준 ○개별거래처기준) · 양식구분 ☐결재방표시.
 *
 * <p>표는 원본에서 못 쟀다 — 이 회사 계정이 전표 [입력화면설정]에 '권한없음'이라 외화 칸이 든 회계전표를 만들 수 없었다(2026-10-22).
 * 그래서 열은 원본 장부(거래처관리대장 · 계정별원장)의 짜임을 따른 임시다: 거래처별집계 = 거래처 · 외화 · 계정 · 이월 · 증가 · 감소 · 잔액
 * (외화 · 원화 두 단), 건별 = 일자-No. · 적요 · 외화 차변 · 대변 · 잔액 · 원화 차변 · 대변 · 잔액, 묶음마다 '이월' · '계'.
 */
export default function ForeignLedgerPage() {
  const { companyName } = useAuth()
  const init = periodOf('최근30일')!
  const [mode, setMode] = useState<'PARTNER' | 'DETAIL'>('PARTNER')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [account, setAccount] = useState('')
  const [partner, setPartner] = useState('')
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const [currency, setCurrency] = useState('')
  const [withStopped, setWithStopped] = useState(true)
  const [groupBy, setGroupBy] = useState<'relation' | 'each'>('relation')
  const [signBox, setSignBox] = useState(false)
  const [data, setData] = useState<Resp | null>(null)
  const [error, setError] = useState('')
  const [accounts, setAccounts] = useState<CodeItem[]>([])
  const [currencies, setCurrencies] = useState<{ code: string; name: string }[]>([])
  const pickers = useCondPickers(['partners'])
  const deptProject = useDeptProjectItems()

  useEffect(() => {
    api.get<{ id: number; code: string; name: string }[]>('/accounts')
      .then((r) => setAccounts(r.data.map((a) => ({ value: String(a.id), code: a.code, name: a.name })))).catch(() => {})
    api.get<{ code: string; name: string }[]>('/currencies').then((r) => setCurrencies(r.data)).catch(() => {})
  }, [])

  async function load() {
    setError('')
    try {
      const r = await api.get<Resp>('/accounting/foreign-ledger', {
        params: {
          mode, from, to,
          accountId: account || undefined, partnerId: partner || undefined,
          departmentId: dept || undefined, projectId: project || undefined, currency: currency || undefined,
          includeStopped: withStopped,
        },
      })
      setData(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  const reset = () => {
    setMode('PARTNER'); setFrom(init.from); setTo(init.to); setAccount(''); setPartner(''); setDept(''); setProject('')
    setCurrency(''); setWithStopped(true); setGroupBy('relation'); setSignBox(false); setData(null)
  }
  const partnerItems = useMemo(() => pickers.partners, [pickers.partners])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '외화장부', [data?.rows.length ?? 0, data?.mode])
  const rows = data?.rows ?? []
  const detail = data?.mode === 'DETAIL'

  return (
    <EcListShell
      signLine={signBox}
      title="외화장부"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="검색구분">
          <label className="mr-[10px]"><input type="radio" name="fx-mode" checked={mode === 'PARTNER'} onChange={() => setMode('PARTNER')} /> 거래처별집계</label>
          <label><input type="radio" name="fx-mode" checked={mode === 'DETAIL'} onChange={() => setMode('DETAIL')} /> 건별</label>
        </EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" aria-label="기준일자 시작" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" aria-label="기준일자 끝" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={NOTE_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" popupTitle="계정검색" hideLabel pair width={260} emptyLabel="전체" value={account} onChange={setAccount} items={accounts} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel pair width={260} emptyLabel="전체" value={partner} onChange={setPartner} items={partnerItems} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} emptyLabel="전체" value={dept} onChange={setDept} items={deptProject.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={project} onChange={setProject} items={deptProject.projects} />
        </EcCond>
        <EcCond label="외화" pick>
          <CodePickerField label="외화" popupTitle="외화검색" hideLabel pair width={220} emptyLabel="전체" value={currency} onChange={setCurrency}
                           items={currencies.map((c) => ({ value: c.code, code: c.code, name: c.name }))} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={withStopped} onChange={(e) => setWithStopped(e.target.checked)} /> 사용중단거래처포함
          </label>
        </EcCond>
        <EcCond label="대표거래처로 합산">
          <label className="mr-[10px]"><input type="radio" name="fx-group" checked={groupBy === 'relation'} onChange={() => setGroupBy('relation')} /> 거래처관계기준</label>
          <label><input type="radio" name="fx-group" checked={groupBy === 'each'} onChange={() => setGroupBy('each')} /> 개별거래처기준</label>
        </EcCond>
        <EcCond label="양식구분">
          <label className="inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} /> 결재방표시
          </label>
        </EcCond>
      </ul>

      {/* 원본은 외화 자료가 없으면 표를 그리지 않는다(안내 글도 없음, 2026-10-21 실측). */}
      {data && rows.length > 0 && (
        <>
          <div className="flex flex-col text-[12px] mt-0 mx-0 mb-[4px]">
            <span>회사명 : {companyName ?? ''}</span>
            <span>{from.replace(/-/g, '/')} ~ {to.replace(/-/g, '/')}</span>
          </div>
          {detail ? (
            <table ref={tableRef} className="w-full text-left">
              <thead>
                <tr>
                  <th rowSpan={2} className="text-center">일자-No.</th>
                  <th rowSpan={2}>적요</th>
                  <th colSpan={3} className="text-center">외화</th>
                  <th colSpan={3} className="text-center">원화</th>
                </tr>
                <tr>
                  <th className="text-right">차변</th><th className="text-right">대변</th><th className="text-right">잔액</th>
                  <th className="text-right">차변</th><th className="text-right">대변</th><th className="text-right">잔액</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => r.kind === 'SUM' ? (
                  <tr key={i} className="font-bold bg-ec-page">
                    <td colSpan={5}>합계</td>
                    <td className="text-right">{num(r.krwDebit)}</td><td className="text-right">{num(r.krwCredit)}</td><td className="text-right">{num(r.krwBalance)}</td>
                  </tr>
                ) : (
                  <tr key={i} className={r.kind === 'TOTAL' ? 'font-bold bg-ec-page' : undefined}>
                    <td className="text-center">
                      {r.kind === 'LINE' && r.date ? `${r.date.replace(/-/g, '/')}-${r.docNo ?? ''}` : ''}
                      {r.kind === 'CARRY' ? `[${r.partnerCode ?? ''}] ${r.partnerName ?? ''} · ${r.currencyCode} · ${r.accountName}` : ''}
                    </td>
                    <td>{r.description}</td>
                    <td className="text-right">{fx(r.foreignDebit)}</td><td className="text-right">{fx(r.foreignCredit)}</td><td className="text-right">{fx(r.foreignBalance)}</td>
                    <td className="text-right">{num(r.krwDebit)}</td><td className="text-right">{num(r.krwCredit)}</td><td className="text-right">{num(r.krwBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table ref={tableRef} className="w-full text-left">
              <thead>
                <tr>
                  <th rowSpan={2}>거래처</th>
                  <th rowSpan={2} className="text-center">외화</th>
                  <th rowSpan={2}>계정</th>
                  <th colSpan={4} className="text-center">외화</th>
                  <th colSpan={4} className="text-center">원화</th>
                </tr>
                <tr>
                  <th className="text-right">이월</th><th className="text-right">증가</th><th className="text-right">감소</th><th className="text-right">잔액</th>
                  <th className="text-right">이월</th><th className="text-right">증가</th><th className="text-right">감소</th><th className="text-right">잔액</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => r.kind === 'SUM' ? (
                  <tr key={i} className="font-bold bg-ec-page">
                    <td colSpan={7}>합계</td>
                    <td className="text-right">{num(r.krwCarry)}</td><td className="text-right">{num(r.krwDebit)}</td>
                    <td className="text-right">{num(r.krwCredit)}</td><td className="text-right">{num(r.krwBalance)}</td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <td>{r.partnerName}</td>
                    <td className="text-center">{r.currencyCode}</td>
                    <td>{r.accountName}</td>
                    <td className="text-right">{fx(r.foreignCarry)}</td><td className="text-right">{fx(r.foreignDebit)}</td>
                    <td className="text-right">{fx(r.foreignCredit)}</td><td className="text-right">{fx(r.foreignBalance)}</td>
                    <td className="text-right">{num(r.krwCarry)}</td><td className="text-right">{num(r.krwDebit)}</td>
                    <td className="text-right">{num(r.krwCredit)}</td><td className="text-right">{num(r.krwBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </EcListShell>
  )
}
