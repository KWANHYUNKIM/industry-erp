import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'
import EcListShell from '../../../components/EcListShell'
import { EcCond } from '../../../components/EcStatusPanel'
import { useDeptProjectItems } from '../../../features/cashquick/useDeptProject'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import EcPeriodPicks, { NOTE_FLOW_PICKS, periodOf } from '../../../components/EcPeriodPicks'
import { useCondPickers } from '../../../utils/useCondPickers'
import { dateText } from '../../../utils/dateText'
import { EcReportFoot, EcReportHead, reportDate } from '../../../components/EcReportFrame'
import type { BankAccountRow, BankCheck, CheckType } from '../../../types/api'
import { CheckSortModal, SortHead, arrange, sortSetup, useHeadSort, type SortSetup } from '../../../features/bankcheck/components/CheckSortSetup'
import type { SortValue } from '../../../utils/useTableSort'
import EcDateInput from '../../../components/ui/EcDateInput'
import { fmtAmount } from '../../../utils/format'

/** 원본 소계 · 합계줄 모양(2026-10-02 실측): 바탕 rgb(243,243,243) · 굵게. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }

/**
 * 회계 II &gt; 수표관리 &gt; 수령수표 &gt; <b>수령수표현황</b>(E060604) — 2026-10-02 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(<b>하루</b>, 빠른선택 금일 … 전월 · 종료일 · 최근30일 — 기본 [최근30일]의 끝날 = 오늘) · 계정 · 수표번호 ·
 * 수령수표계좌 · 부서 · 프로젝트. 열: 수령일자 · 수표번호 · 거래처명 · 계정명 · 적요 · 금액.
 * 줄은 <b>거래처마다 묶이고</b> 묶음 끝에 '거래처명 [코드] 계' 줄(바탕 회색 · 굵게), 맨 끝에 '합계'. 묶음 안은 수령일 오름차순,
 * <b>묶음이 하나뿐이면 '계' 줄이 없다</b>(합계만 — 2026-10-14 실측: 김치좋아 35,000 한 장 → '합계 35,000',
 * (주)구로 25,000 을 더하면 '(주)구로 [00010] 계' · '김치좋아 [1234567004] 계' · '합계 60,000').
 * 조건 [정렬/소계기준] [설정] 과 머리 정렬은 features/bankcheck/components/CheckSortSetup — 기본 1 거래처명(표시) · 2 수령일자 · 3 없음.
 * 묶음끼리는 <b>거래처명 차례</b> — 한글 이름이 먼저, 영문 이름은 뒤(2026-10-14 실측: (주)구로 · 구로조명유통 · 김치좋아 ·
 * 휴대폰매장아울렛 · Bisket World 차례 — 2026/10/14 에 받은 김치좋아가 2015 년 묶음들 사이에 섰다).
 *
 * <p>기준일자에 아직 들고 있는(입금 · 부도 전) 받은수표를 센다 — 받은 날 ≤ 기준일자, 닫힌 날(settledDate)이 없거나 그 뒤.
 * 계정명은 우리 분개가 쓰는 <b>받을수표</b>(104)다. 원본이 보통예금을 찍은 줄은 수표내역입력(분개 없음)으로 넣은 것이었다 —
 * 그 수표는 고른 수표계좌의 계정을 찍는다(2026-10-13 실측: 계좌 5544332211 → 보통예금, 거래처 없으면 '[] 계' 묶음).
 * 조건 [부서] · [프로젝트] 는 수표내역입력 줄의 부서 · 프로젝트로 거른다.
 * 원본 [검색] 앞 '잔액재집계' 창은 두지 않는다(우리는 [검색] 마다 새로 센다 — CheckLedgerPage 참고).
 *
 * <p><b>발행수표현황</b>(E060608)도 조건 · 열이 같다(조건의 [수령수표계좌] 자리가 [발행수표계좌], 첫 열이 [발행일자]) —
 * 아직 은행에서 안 빠져나간(결제 전) 발행수표다. 계정명은 그 수표를 끊은 계좌의 계정(분개가 대변에 쓰는 것)이다.
 */
export default function CheckHoldingPage({ type }: { type: CheckType }) {
  const received = type === 'RECEIVED'
  const title = received ? '수령수표현황' : '발행수표현황'
  const acctLabel = received ? '수령수표계좌' : '발행수표계좌'
  const account = '받을수표'
  /* 발행수표의 계정명 — 그 수표를 끊은 계좌의 총계정(당좌예금 등). */
  const [glByAccount, setGlByAccount] = useState<Map<number, string>>(new Map())
  useEffect(() => {
    /* 받은수표도 수표내역입력(분개 없음)으로 넣은 것은 그 수표계좌의 계정을 찍는다(2026-10-13 실측 — 5544332211 → 보통예금). */
    api.get<BankAccountRow[]>('/bank-cards/accounts')
      .then((r) => setGlByAccount(new Map(r.data.map((a) => [a.id, a.glAccountName]))))
      .catch(() => setGlByAccount(new Map()))
  }, [received])
  const accountOf = (c: BankCheck) => (received && !c.directEntry ? account : (c.bankAccountId != null ? glByAccount.get(c.bankAccountId) ?? '' : ''))
  const pickers = useCondPickers(['partners'])
  const init = periodOf('최근30일')!
  const [asOf, setAsOf] = useState(init.to)
  const [checkNo, setCheckNo] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const { departments, projects } = useDeptProjectItems()
  const [checks, setChecks] = useState<BankCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 기준일자까지 받은 것만 받는다 — 그 뒤에 받은 수표는 그날 들고 있을 수 없다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<BankCheck[]>('/checks', { params: { to: asOf } })
      setChecks(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [asOf, type])

  const held = useMemo(() => checks
    .filter((c) => c.type === type)
    .filter((c) => c.issueDate <= asOf && (!c.settledDate || c.settledDate > asOf))
    .filter((c) => !checkNo || c.checkNo.includes(checkNo))
    .filter((c) => !bankAccount || (c.bankAccountName ?? '') === bankAccount)
    .filter((c) => !dept || String(c.departmentId ?? '') === dept)
    .filter((c) => !project || String(c.projectId ?? '') === project),
  [checks, type, asOf, checkNo, bankAccount, dept, project])

  const codeOf = (partnerId: number | null) => pickers.partners.find((p) => p.id === partnerId)?.code ?? ''
  const dateHead = received ? '수령일자' : '발행일자'
  const [setup, setSetup] = useState<SortSetup>(() => sortSetup(['거래처명', true], [dateHead, false]))
  const [setupOpen, setSetupOpen] = useState(false)
  const headSort = useHeadSort()
  /* 정렬 · 묶음 값 — 거래처명은 한글 이름이 먼저, 영문 이름은 뒤, 거래처 없는 묶음은 끝(원본 실측 차례). 같은 이름이면 거래처로 가른다. */
  const rank = (n: string) => (!n ? 2 : /^[A-Za-z]/.test(n) ? 1 : 0)
  const getters: Record<string, (c: BankCheck) => SortValue> = {
    [dateHead]: (c) => c.issueDate,
    수표번호: (c) => c.checkNo,
    거래처명: (c) => `${rank(c.partnerName ?? '')}${c.partnerName ?? ''}\u0000${c.partnerId ?? ''}`,
    계정명: (c) => accountOf(c),
    적요: (c) => c.remark ?? '',
    금액: (c) => Number(c.amount),
  }
  const { groups, subKey } = arrange(held, setup, getters, (c) => Number(c.amount), headSort)
  const total = groups.reduce((a, g) => a + g.sum, 0)
  /* '계' 줄 글 — 거래처면 '이름 [코드] 계', 다른 기준이면 그 값 + ' 계'. */
  const subLabel = (c: BankCheck) => subKey === '거래처명' ? `${c.partnerName ? `${c.partnerName} ` : ''}[${codeOf(c.partnerId)}] 계`
    : subKey === dateHead ? `${dateText(c.issueDate)} 계` : subKey === '금액' ? `${fmtAmount(Number(c.amount))} 계`
    : `${subKey ? String(getters[subKey](c) ?? '') : ''} 계`
  const showSub = !!subKey && groups.length > 1
  const accounts = useMemo(() => [...new Set(checks.map((c) => c.bankAccountName).filter(Boolean) as string[])].sort(), [checks])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [groups.length])

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setAsOf(init.to); setCheckNo(''); setBankAccount(''); setDept(''); setProject('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <EcDateInput className="ec-input" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={NOTE_FLOW_PICKS} currentFrom={asOf} onPick={(r) => setAsOf(r.to)} />
          </span>
        </EcCond>
        {/* 원본 [계정] — 받은수표는 받을수표 하나, 발행수표는 끊은 계좌의 계정이라 계좌 조건이 그 몫을 한다. */}
        <EcCond label="계정">
          <select className="ec-input" value={received ? account : ''} disabled style={{ width: 140 }}>
            <option value={received ? account : ''}>{received ? account : '계좌의 계정'}</option>
          </select>
        </EcCond>
        <EcCond label="수표번호">
          <input className="ec-input" value={checkNo} onChange={(e) => setCheckNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label={received ? '수령수표계좌' : '발행수표계좌'} pick>
          <CodePickerField label={acctLabel} hideLabel width={200} emptyLabel="전체" value={bankAccount} onChange={setBankAccount}
                           items={accounts.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={200} emptyLabel="전체" value={dept} onChange={setDept} items={departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={project} onChange={setProject} items={projects} />
        </EcCond>
        <EcCond label="정렬/소계기준">
          <a href="#" className="text-ec-navy" onClick={(e) => { e.preventDefault(); setSetupOpen(true) }}>설정</a>
        </EcCond>
      </ul>
      <CheckSortModal open={setupOpen} options={[dateHead, '수표번호', '거래처명', '계정명', '적요', '금액']} value={setup}
                      onApply={(s) => { setSetup(s); headSort.reset(); setSetupOpen(false) }} onClose={() => setSetupOpen(false)} />

      {/* 원본 출력물 머리 — 제목 24px · '회사명 :' · 기준일자, 아래 [P.1] · 출력한 때(2026-10-14 실측) */}
      <EcReportHead title={title} period={reportDate(asOf)} />
      <table ref={tableRef} className="ec-report w-full text-left">
        <thead>
          <tr>
            {[dateHead, '수표번호', '거래처명', '계정명', '적요'].map((h) => <SortHead key={h} label={h} sort={headSort} />)}
            <SortHead label="금액" sort={headSort} className="text-right" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : groups.flatMap((g) => [
            ...g.rows.map((c) => (
              <tr key={c.id}>
                <td>{dateText(c.issueDate)}</td>
                <td>{c.checkNo}</td>
                <td>{c.partnerName ?? ''}</td>
                <td>{accountOf(c)}</td>
                <td>{c.remark ?? ''}</td>
                <td className="text-right">{fmtAmount(Number(c.amount))}</td>
              </tr>
            )),
            ...(showSub ? [<tr key={`sub-${g.key}`} style={SUB_ROW}>
              <td colSpan={5} className="text-center">{subLabel(g.rows[0])}</td>
              <td className="text-right">{fmtAmount(g.sum)}</td>
            </tr>] : []),
          ])}
        </tbody>
        {/* 원본 발행수표현황 빈 판은 '등록된 데이터가 없습니다.' 한 줄뿐 — 합계 줄이 없다(2026-10-14 실측) */}
        {groups.length > 0 && setup.total && (
          <tfoot>
            <tr style={SUB_ROW}>
              <td colSpan={5} className="text-center">합계</td>
              <td className="text-right">{fmtAmount(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      <EcReportFoot />
    </EcListShell>
  )
}
