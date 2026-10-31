import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { NOTE_FLOW_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import { EcReportFoot, EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import type { BankAccountRow, BankCheck, CheckType } from '../../types/api'
import { CheckSortModal, SortHead, arrange, sortSetup, useHeadSort, type SortSetup } from '../../features/bankcheck/components/CheckSortSetup'
import type { SortValue } from '../../utils/useTableSort'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { fmtAmount } from '../../utils/format'


/**
 * 회계 II &gt; 수표관리 &gt; 수령수표 &gt; <b>수령수표증가현황</b>(E060609) · <b>수령수표감소현황</b>(E060610) — 2026-10-02 loginaa 실측.
 *
 * <p>두 화면은 조건 · 열이 같다. 조건: 기준일자(구간, 기본 [최근30일]) · 거래처 · 부서 · 프로젝트 · 수령수표계좌 · 계정 · 수표번호 ·
 * 적요 · 거래유형 · 최초작성자 · 최종수정자. 열: 일자-No. · 수표번호 · 거래처명 · 계정명 · 거래유형 · 적요 · 금액.
 * 증가는 받은 날이 기간 안인 수표, 감소는 손을 떠난 날(입금 · 부도)이 기간 안인 수표다.
 *
 * <p>[일자-No.]는 그 움직임을 적은 회계전표다 — 받을 때 분개(source_id)와 손을 떠날 때 분개(V239 settle_journal_id).
 * [거래유형]은 원본 현황 판에 자료가 없어 못 쟀다 — 우리는 그 움직임의 이름(수령 · 입금완료 · 부도)을 열에 적고 같은 값으로 거른다.
 * 수표내역입력으로 분개 없이 넣은 수표는 수령수표조회에서 잰 값(2026-10-13) '수표만증가' · '수표만감소' 를 쓰고, [일자-No.] 는 그 수표 전표 번호('2026/10/13 -5').
 * 같은 날 같은 번호(한 전표의 여러 줄)는 수표번호 차례.
 * 조건 [부서] · [프로젝트] 는 수표내역입력 줄의 부서 · 프로젝트로 거른다.
 *
 * <p>수령수표는 줄을 거래처마다 묶는다(2026-10-13 QA회계2 수표 셋으로 잼 — 증가 · 감소 둘 다): 거래처코드 차례(거래처 없는 묶음이 먼저),
 * 묶음 안은 일자-No. 차례, 묶음 끝에 '거래처명 계'(거래처 없으면 '[] 계', 가운데 · 굵게 · 회색) 줄, 맨 끝 '합계'(가운데).
 * <b>증가현황은 묶음이 하나뿐이면 '계' 줄이 없다</b>(합계만 — 2026-10-14 수령수표증가현황 실측: 김치좋아 한 장 → '합계 35,000',
 * (주)구로를 더하면 '(주)구로 계 25,000' · '김치좋아 계 35,000' · '합계 60,000'). 10-13 의 '발행 증가는 안 묶는다' 는 거래처 한 곳 판이었다.
 * 감소현황은 한 묶음 판에도 '계' 가 있었다(2026-10-13 발행 수표만감소 1줄 '[] 계' 5,000 · 10-14 수령 입금보고서 1줄 '[] 계' 30,000) — 그대로 둔다.
 * 조건 [정렬/소계기준] [설정] 과 머리 정렬은 CheckSortSetup — 기본 1 거래처명(표시) · 2 · 3 없음(감소현황 실측).
 *
 * <p><b>발행수표증가현황</b>(E060611) · <b>감소현황</b>(E060612)도 조건 · 열이 같다(계좌 조건이 [발행수표계좌]). 증가는 발행한 날,
 * 감소는 은행에서 빠져나간(결제완료) 날이다. 계정명은 끊은 계좌의 총계정이고, 결제는 분개를 안 만들어(발행 때 이미 반영)
 * 감소의 [일자-No.] 번호는 비어 있다.
 */
export default function CheckFlowPage({ type, flow }: { type: CheckType; flow: '증가' | '감소' }) {
  const received = type === 'RECEIVED'
  const title = received
    ? (flow === '증가' ? '수령수표증가현황' : '수령수표감소현황')
    : (flow === '증가' ? '발행수표증가현황' : '발행수표감소현황')
  const acctLabel = received ? '수령수표계좌' : '발행수표계좌'
  /* '계' 줄 — 증가는 묶음이 둘 이상일 때만, 감소는 하나여도(원본 실측). */
  const minGroups = flow === '증가' ? 2 : 1
  const account = '받을수표'
  /* 발행수표의 계정명 — 끊은 계좌의 총계정(분개가 대변에 쓰는 것). */
  const [glByAccount, setGlByAccount] = useState<Map<number, string>>(new Map())
  useEffect(() => {
    /* 받은수표도 수표내역입력(분개 없음)으로 넣은 것은 그 수표계좌의 계정을 찍는다(2026-10-13 실측 — 5544332211 → 보통예금). */
    api.get<BankAccountRow[]>('/bank-cards/accounts')
      .then((r) => setGlByAccount(new Map(r.data.map((a) => [a.id, a.glAccountName]))))
      .catch(() => setGlByAccount(new Map()))
  }, [received])
  const accountOf = (c: BankCheck) => (received && !c.directEntry ? account : (c.bankAccountId != null ? glByAccount.get(c.bankAccountId) ?? '' : ''))
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [partner, setPartner] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const { departments, projects } = useDeptProjectItems()
  const [checkNo, setCheckNo] = useState('')
  const [remark, setRemark] = useState('')
  const [author, setAuthor] = useState('')
  const [editor, setEditor] = useState('')
  const [kind, setKind] = useState('')
  const [checks, setChecks] = useState<BankCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 증가는 받은 날로 서버가 자른다. 감소는 닫힌 날로 걸어야 해 기간 끝날까지 받은 것을 받아 화면에서 다시 거른다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const params = flow === '증가' ? { from, to } : { to }
      const r = await api.get<BankCheck[]>('/checks', { params })
      setChecks(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, flow, type])

  const dayOf = (c: BankCheck) => (flow === '증가' ? c.issueDate : c.settledDate ?? '')
  /** 감소현황은 감소 줄의 적요(비면 증가 적요 — 원본 [수표만감소] '증가적요동일'). */
  const remarkOf = (c: BankCheck) => (flow === '감소' ? c.outRemark ?? c.remark : c.remark)
  /* 수표내역입력으로 넣은 움직임은 그 전표 자체 번호(원본 '2026/10/13 -5'), 분개로 움직인 것은 회계전표 번호. */
  const entryNoOf = (c: BankCheck) => (flow === '증가' ? c.directInNo : c.directOutNo) ?? null
  const noOf = (c: BankCheck) => {
    const n = entryNoOf(c)
    if (n != null) return `-${n}`
    /* 원본 '2026/10/13 -12' — 우리 GL 번호(GL-20261013-0012)의 끝 일련번호만 */
    const gl = (flow === '증가' ? c.issueJournalNo : c.settleJournalNo) ?? ''
    return gl ? `-${Number(gl.split('-').pop()) || gl}` : ''
  }
  /* 입금처리 · 출금처리로 줄인 감소 — 원본 발행수표감소현황 '2026/10/14 -2 · (거래처 빈칸) · 지출결의서' · '[] 계'(2026-10-14 실측).
     그 분개의 거래처는 수표계좌라 수표의 거래처를 찍지 않는다. */
  const byVoucher = (c: BankCheck) => flow === '감소' && !!c.settledByVoucher
  const partnerOf = (c: BankCheck) => (byVoucher(c) ? null : c.partnerId)
  /* 채권감소 [입금보고서작성] 수금형태 '수표'(채무감소 지급형태 '수표')로 늘어난 수표 — 증가도 거래유형 '입금보고서' · '지출결의서'(2026-10-14 실측). */
  const kindOf = (c: BankCheck) => (byVoucher(c) || (flow === '증가' && c.issuedByVoucher) ? (received ? '입금보고서' : '지출결의서')
    : c.directEntry ? (flow === '증가' ? '수표만증가' : '수표만감소')
    : flow === '증가' ? (received ? '수령' : '발행') : c.statusName)
  const shown = useMemo(() => checks
    .filter((c) => c.type === type)
    .filter((c) => { const d = dayOf(c); return !!d && d >= from && d <= to })
    .filter((c) => !partner || String(partnerOf(c)) === partner)
    .filter((c) => !bankAccount || (c.bankAccountName ?? '') === bankAccount)
    .filter((c) => !dept || String(c.departmentId ?? '') === dept)
    .filter((c) => !project || String(c.projectId ?? '') === project)
    .filter((c) => !checkNo || c.checkNo.includes(checkNo))
    .filter((c) => !remark || (remarkOf(c) ?? '').includes(remark))
    .filter((c) => !author || (c.createdBy ?? '') === author)
    .filter((c) => !editor || (c.updatedBy ?? '') === editor)
    .filter((c) => !kind || kindOf(c) === kind)
    .sort((a, b) => (dayOf(a) < dayOf(b) ? -1 : dayOf(a) > dayOf(b) ? 1
      : (entryNoOf(a) ?? 0) - (entryNoOf(b) ?? 0) || a.checkNo.localeCompare(b.checkNo))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [checks, type, flow, from, to, partner, dept, project, bankAccount, checkNo, remark, author, editor, kind])
  const total = shown.reduce((a, c) => a + Number(c.amount), 0)
  const pickers = useCondPickers(['partners'])
  const codeOf = (partnerId: number | null) => pickers.partners.find((p) => p.id === partnerId)?.code ?? ''
  const [setup, setSetup] = useState<SortSetup>(() => sortSetup(['거래처명', true]))
  const [setupOpen, setSetupOpen] = useState(false)
  const headSort = useHeadSort()
  const COLS = ['일자-No.', '수표번호', '거래처명', '계정명', '거래유형', '적요', '금액']
  /* 거래처 묶음 차례는 거래처코드(거래처 없는 묶음이 먼저 — 2026-10-13 셋으로 잰 판). */
  const getters: Record<string, (c: BankCheck) => SortValue> = {
    '일자-No.': (c) => `${dayOf(c)} ${String(entryNoOf(c) ?? 0).padStart(6, '0')}`,
    수표번호: (c) => c.checkNo,
    거래처명: (c) => (partnerOf(c) == null ? '' : `${codeOf(partnerOf(c))}\u0000${partnerOf(c)}`),
    계정명: (c) => accountOf(c),
    거래유형: (c) => kindOf(c),
    적요: (c) => remarkOf(c) ?? '',
    금액: (c) => Number(c.amount),
  }
  const { groups, subKey } = arrange(shown, setup, getters, (c) => Number(c.amount), headSort)
  const showSub = !!subKey && groups.length >= minGroups
  const subLabel = (c: BankCheck) => subKey === '거래처명'
    ? `${partnerOf(c) != null && c.partnerName ? c.partnerName : `[${partnerOf(c) == null ? '' : codeOf(partnerOf(c))}]`} 계`
    : subKey === '금액' ? `${fmtAmount(Number(c.amount))} 계` : subKey === '일자-No.' ? `${dateText(dayOf(c))} ${noOf(c)} 계`
    : `${subKey ? String(getters[subKey](c) ?? '') : ''} 계`
  const ofType = useMemo(() => checks.filter((c) => c.type === type), [checks, type])
  const partners = useMemo(() => {
    const m = new Map<number, string>()
    ofType.forEach((c) => { if (c.partnerId != null) m.set(c.partnerId, c.partnerName ?? '') })
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: String(id), name }))
  }, [ofType])
  const accounts = useMemo(() => [...new Set(ofType.map((c) => c.bankAccountName).filter(Boolean) as string[])].sort(), [ofType])
  const authors = useMemo(() => [...new Set(ofType.map((c) => c.createdBy).filter(Boolean) as string[])].sort(), [ofType])
  const editors = useMemo(() => [...new Set(ofType.map((c) => c.updatedBy).filter(Boolean) as string[])].sort(), [ofType])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [shown.length])

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setPartner(''); setDept(''); setProject(''); setBankAccount(''); setCheckNo(''); setRemark(''); setAuthor(''); setEditor(''); setKind('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={NOTE_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={partners} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={200} emptyLabel="전체" value={dept} onChange={setDept} items={departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={project} onChange={setProject} items={projects} />
        </EcCond>
        <EcCond label={received ? '수령수표계좌' : '발행수표계좌'} pick>
          <CodePickerField label={acctLabel} hideLabel width={200} emptyLabel="전체" value={bankAccount} onChange={setBankAccount}
                           items={accounts.map((a) => ({ value: a, name: a }))} />
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
        <EcCond label="적요">
          <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="거래유형">
          <select className="ec-input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 120 }}>
            <option value="">전체</option>
            {(flow === '증가' ? [received ? '수령' : '발행', '수표만증가', received ? '입금보고서' : '지출결의서'] : received ? ['입금완료', '부도', '수표만감소', '입금보고서'] : ['결제완료', '수표만감소', '지출결의서']).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={170} emptyLabel="전체" value={author} onChange={setAuthor}
                           items={authors.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        <EcCond label="최종수정자" pick>
          <CodePickerField label="최종수정자" hideLabel width={170} emptyLabel="전체" value={editor} onChange={setEditor}
                           items={editors.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        <EcCond label="정렬/소계기준">
          <a href="#" className="text-ec-navy" onClick={(e) => { e.preventDefault(); setSetupOpen(true) }}>설정</a>
        </EcCond>
      </ul>
      <CheckSortModal open={setupOpen} options={COLS} value={setup}
                      onApply={(s) => { setSetup(s); headSort.reset(); setSetupOpen(false) }} onClose={() => setSetupOpen(false)} />

      {/* 원본 출력물 머리 — 제목 24px · '회사명 :' · 기간, 아래 [P.1] · 출력한 때(2026-10-14 실측) */}
      <EcReportHead title={title} period={reportPeriod(from, to)} />
      <table ref={tableRef} className="ec-report w-full text-left">
        <thead>
          <tr>
            {COLS.slice(0, 6).map((h) => <SortHead key={h} label={h} sort={headSort} />)}
            <SortHead label="금액" sort={headSort} className="text-right" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : groups.flatMap((g) => [
            ...g.rows.map((c) => (
              <tr key={c.id}>
                <td>{dateText(dayOf(c))} {noOf(c)}</td>
                <td>{c.checkNo}</td>
                <td>{byVoucher(c) ? '' : c.partnerName ?? ''}</td>
                <td>{accountOf(c)}</td>
                <td>{kindOf(c)}</td>
                <td>{remarkOf(c) ?? ''}</td>
                <td className="text-right">{fmtAmount(Number(c.amount))}</td>
              </tr>
            )),
            ...(showSub ? [<tr key={`sub-${g.key}`} className="font-bold bg-ec-stripe">
              <td colSpan={6} className="text-center">{subLabel(g.rows[0])}</td>
              <td className="text-right">{fmtAmount(g.sum)}</td>
            </tr>] : []),
          ])}
        </tbody>
        {setup.total && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'rgb(243, 243, 243)' }}>
              <td colSpan={6} className="text-center">합계</td>
              <td className="text-right">{fmtAmount(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      <EcReportFoot />
    </EcListShell>
  )
}
