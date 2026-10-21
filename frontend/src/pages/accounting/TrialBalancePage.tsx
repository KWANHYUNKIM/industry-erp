import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { TRIAL_BALANCE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../features/auth/AuthContext'
import type { AccountDivision, TrialBalance } from '../../types/api'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import CodePickerField from '../../components/CodePickerField'

/** 원본 묶음 줄 · [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243). 묶음은 보통 굵기, [합계]만 굵게. */
const GROUP_ROW: React.CSSProperties = { background: 'rgb(243, 243, 243)' }
const TOTAL_ROW: React.CSSProperties = { background: 'rgb(243, 243, 243)', fontWeight: 700 }
/** 원본 계정명 칸 — 가운데 정렬 · 남색 rgb(25,53,140). */
const NAME_CELL: React.CSSProperties = { textAlign: 'center', color: 'rgb(25, 53, 140)' }
const slash = (d: string) => d.slice(0, 7).replace(/-/g, '/')

interface AccountOpt { id: number; code: string; name: string; division: AccountDivision; detailCategory: string | null }
/** 원본 계정 차례 — 자산 · 부채 · 자본 · 수익 · 비용. */
const DIV_ORDER: AccountDivision[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
const debitNormal = (d: AccountDivision) => d === 'ASSET' || d === 'EXPENSE'
/** 잔액을 쌓는 것은 재무상태표 계정뿐이다 — 원본도 매출 · 비용 줄의 기말잔액 칸을 비운다. */
const isBalanceSheet = (d: AccountDivision) => d === 'ASSET' || d === 'LIABILITY' || d === 'EQUITY'

interface Line { id: number; code: string; name: string; division: AccountDivision; chain: string[]; pd: number; pc: number; bal: number }
/** 표에 그리는 한 줄 — 계정(leaf) · 묶음(group) · 계산 줄(calc, 매출총이익 …). */
interface Row { kind: 'leaf' | 'group' | 'calc'; key: string; name: string; division: AccountDivision; bs: boolean; pd: number; pc: number; bal: number }

/** 원본 묶음 차례(2026-10-21 실측) — 유동자산 &gt; 당좌자산 &gt; 현금및현금성자산 · 매출채권 · 기타, 재고자산 / 유동부채 &gt; 매입채무 … / 매출 · 매출원가 · 판매비및일반관리비 · 영업외수익 · 영업외비용. */
const RANK = ['유동자산', '당좌자산', '현금및현금성자산', '매출채권', '기타', '재고자산', '비유동자산', '투자자산', '유형자산', '무형자산',
  '유동부채', '매입채무', '비유동부채', '자본금', '자본잉여금', '이익잉여금', '미처분이익잉여금',
  '매출', '매출원가', '제조원가', '판매비및일반관리비', '영업외수익', '영업외비용', '법인세비용']
const rankOf = (n: string) => { const i = RANK.indexOf(n); return i < 0 ? 500 : i }
/** 우리 계정은 세부분류 한 층만 든다 — 원본 묶음 층으로 펼친다(손익은 원본 이름으로 한 층). */
function chainOf(division: AccountDivision, cat: string, code: string, name: string): string[] {
  if (division === 'ASSET') {
    if (cat === '유동자산') return ['유동자산', '당좌자산', ['101', '102', '103'].includes(code) || /예금$/.test(name) ? '현금및현금성자산' : '기타']
    if (cat === '매출채권') return ['유동자산', '당좌자산', '매출채권']
    if (cat === '재고자산') return ['유동자산', '재고자산']
    return ['비유동자산', cat || '기타']
  }
  if (division === 'LIABILITY') {
    if (cat === '매입채무') return ['유동부채', '매입채무']
    if (cat === '유동부채' || !cat) return ['유동부채']
    return [cat]
  }
  if (division === 'EQUITY') return [cat || '자본금']
  const pl: Record<string, string> = { 매출액: '매출', 판매관리비: '판매비및일반관리비' }
  return [pl[cat] ?? (cat || (division === 'REVENUE' ? '영업외수익' : '영업외비용'))]
}

/**
 * 회계 I &gt; 출력물 &gt; 주요재무제표 &gt; <b>합계잔액시산표</b>(E010811) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 조회일자(<b>달</b> 구간, 기본 2026/01 ~ 2026/09 = <b>이번기수(~전월)</b>, 빠른선택 금월(~오늘) · 이번기수(~전월) · 전월 · 직전기수) ·
 * 부서 · 프로젝트 · 기타([결재방표시] · [천단위] · [잔액0포함] · [전표발생계정] 꺼짐 · [결산후] 켜짐).
 * [결산후]는 결산 분개를 넣고 볼지 고르는 칸인데 우리는 결산 분개를 따로 두지 않아(JournalSourceType 에 결산이 없다) 두지 않았다.
 *
 * <p>열은 다섯 — 기말잔액(차변) · 기말금액(차변) · 계정명 · 기말금액(대변) · 기말잔액(대변). 기말금액은 재무상태표 계정이면 누계 차 · 대 합
 * (원본 기본양식(누계) — 기말잔액 = 기말금액 차 − 대), 손익 계정이면 기간 안 차 · 대 합이고 기간 앞 손익은 미처분이익잉여금 한 줄로 넘긴다.
 * 기말잔액은 처음부터 기간 끝까지 쌓은 잔액을 계정의 제 쪽(자산 → 차변, 부채 · 자본 → 대변)에 부호째 찍는다.
 * 원본은 유동자산 &gt; 당좌자산 &gt; 현금및현금성자산 &gt; 보통예금처럼 여러 층으로 묶고 매출총이익 · 영업이익 같은 계산 줄을 끼운다.
 * 우리 계정은 세부분류 한 층만 들어 chainOf 로 원본 층(유동자산 &gt; 당좌자산 &gt; 현금및현금성자산 …)을 세우고, 손익은 묶음 한 층 + 계산 줄(2026-10-21).
 * 끝 [합계](굵게). [부서] · [프로젝트]는 회계전표 줄의 것(V343)으로 거른다.
 */
export default function TrialBalancePage() {
  /* 원본 조건 [부서] · [프로젝트] — 서버가 회계전표 줄의 것(V343)으로 거른다. */
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const deptProject = useDeptProjectItems()
  const dp = { departmentId: dept || undefined, projectId: project || undefined }
  const { companyName } = useAuth()
  const init = periodOf('이번기수(~전월)', new Date(), undefined) ?? periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [fiscalStart, setFiscalStart] = useState<number | undefined>(undefined)
  const [thousand, setThousand] = useState(false)
  const [withZero, setWithZero] = useState(false)
  const [usedOnly, setUsedOnly] = useState(false)
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [period, setPeriod] = useState<TrialBalance | null>(null)
  const [cumul, setCumul] = useState<TrialBalance | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) setFiscalStart(m) })
      .catch(() => { /* 못 받으면 기수 버튼만 안 눌린다 */ })
  }, [])

  /* 시작월을 받으면 원본 기본 기간([이번기수(~전월)])으로 한 번 다시 건다. */
  const applied = useRef(false)
  useEffect(() => {
    if (applied.current || !fiscalStart) return
    /* 사람이 이미 기간을 고쳤으면 늦게 온 시작월로 덮지 않는다(흐름 시험에서 금월로 바꾼 기간이 01 ~ 09 로 되돌아갔다). */
    if (from !== init.from || to !== init.to) { applied.current = true; return }
    const r = periodOf('이번기수(~전월)', new Date(), fiscalStart)
    if (r) { applied.current = true; setFrom(r.from); setTo(r.to) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalStart])

  function load() {
    setError('')
    Promise.all([
      api.get<TrialBalance>('/journals/trial-balance', { params: { ...dp, from, to } }),
      api.get<TrialBalance>('/journals/trial-balance', { params: { ...dp, from: '1900-01-01', to } }),
    ])
      .then(([p, c]) => { setPeriod(p.data); setCumul(c.data) })
      .catch((err) => setError(extractErrorMessage(err)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [dept, project, from, to])

  const rows = useMemo(() => {
    if (!period || !cumul) return [] as Row[]
    const accById = new Map(accounts.map((a) => [a.id, a]))
    const pBy = new Map(period.rows.map((r) => [r.accountId, r]))
    const cBy = new Map(cumul.rows.map((r) => [r.accountId, r]))
    const ids = new Set([...pBy.keys(), ...cBy.keys(), ...(withZero ? accounts.map((a) => a.id) : [])])
    const lines: Line[] = []
    for (const id of ids) {
      const p = pBy.get(id), c = cBy.get(id), a = accById.get(id)
      const division = (p ?? c)?.division ?? a?.division
      if (!division) continue
      const isBS = isBalanceSheet(division)
      const cd = Number(c?.debit ?? 0), cc = Number(c?.credit ?? 0)
      /* 원본 기본양식(누계) — 재무상태표 계정의 기말금액은 처음부터 기간 끝까지 쌓은 차 · 대(그래서 기말잔액 = 기말금액 차 − 대).
         손익 계정은 기간 안 것을 제 쪽에 순액으로(수익 → 대변, 비용 → 차변 — 원본 제품매출원가 차변 −222,070,000 처럼 음수도 그대로). */
      const d = Number(p?.debit ?? 0), cr = Number(p?.credit ?? 0)
      const pd = isBS ? cd : division === 'EXPENSE' ? d - cr : 0
      const pc = isBS ? cc : division === 'REVENUE' ? cr - d : 0
      const bal = isBS ? (debitNormal(division) ? cd - cc : cc - cd) : 0
      if (usedOnly && d === 0 && cr === 0) continue
      if (!withZero && cd === 0 && cc === 0 && d === 0 && cr === 0) continue
      const code = (p ?? c)?.accountCode ?? a?.code ?? ''
      const name = (p ?? c)?.accountName ?? a?.name ?? ''
      lines.push({ id, code, name, division, chain: chainOf(division, a?.detailCategory ?? '', code, name), pd, pc, bal })
    }
    /* 손익의 제자리 — 기간 앞 손익은 전기이월미처분이익잉여금(금액 · 잔액 대변), 기간 손익은 당기순이익(잔액 대변).
       원본 이익잉여금 &gt; 미처분이익잉여금 &gt; 당기순이익 처럼 두 줄을 미처분이익잉여금 묶음 아래에 둔다. */
    const plNet = (tb: TrialBalance) => tb.rows.filter((r) => !isBalanceSheet(r.division))
      .reduce((t, r) => t + Number(r.credit) - Number(r.debit), 0)
    const cur = plNet(period), prior = plNet(cumul) - cur
    const RE = ['이익잉여금', '미처분이익잉여금']
    if (prior !== 0 || withZero) lines.push({ id: -1, code: '~1', name: '전기이월미처분이익잉여금', division: 'EQUITY', chain: RE, pd: 0, pc: prior, bal: prior })
    if (cur !== 0 || withZero) lines.push({ id: -2, code: '~2', name: '당기순이익', division: 'EQUITY', chain: RE, pd: 0, pc: 0, bal: cur })
    const key = (l: Line) => [DIV_ORDER.indexOf(l.division), ...l.chain.map(rankOf), 999]
    lines.sort((x, y) => {
      const kx = key(x), ky = key(y)
      for (let i = 0; i < Math.max(kx.length, ky.length); i++) {
        const d = (kx[i] ?? -1) - (ky[i] ?? -1)
        if (d) return d
      }
      return x.code.localeCompare(y.code)
    })

    const out: Row[] = []
    /* 재무상태표 — 여러 층 묶음(원본 유동자산 &gt; 당좌자산 &gt; 현금및현금성자산 &gt; 현금). 묶음 줄 = 아래 계정의 합. */
    const bs = lines.filter((l) => isBalanceSheet(l.division))
    let prev: string[] = []
    let prevDiv: AccountDivision | null = null
    for (const l of bs) {
      let same = 0
      if (prevDiv === l.division) while (same < prev.length && same < l.chain.length && prev[same] === l.chain[same]) same++
      for (let k = same; k < l.chain.length; k++) {
        const path = l.chain.slice(0, k + 1)
        const kids = bs.filter((x) => x.division === l.division && path.every((n, i) => x.chain[i] === n))
        out.push({ kind: 'group', key: `${l.division}|${path.join('>')}`, name: path[k], division: l.division, bs: true,
          pd: kids.reduce((t, x) => t + x.pd, 0), pc: kids.reduce((t, x) => t + x.pc, 0), bal: kids.reduce((t, x) => t + x.bal, 0) })
      }
      out.push({ kind: 'leaf', key: `a${l.id}`, name: l.name, division: l.division, bs: true, pd: l.pd, pc: l.pc, bal: l.bal })
      prev = l.chain; prevDiv = l.division
    }
    /* 손익계산서 — 묶음 한 층(묶음 줄은 순액을 차 · 대 두 칸에 같은 숫자로)과 계산 줄(매출총이익 · 영업이익 · 법인세비용차감전순손익 · 당기순이익). */
    const pl = lines.filter((l) => !isBalanceSheet(l.division))
    const net = (g: string) => pl.filter((l) => l.chain[0] === g).reduce((t, l) => t + l.pd + l.pc, 0)
    const sign = (g: string) => (pl.find((l) => l.chain[0] === g)?.division === 'REVENUE' ? 1 : -1)
    const groupsIn = [...new Set(pl.map((l) => l.chain[0]))]
    const pushGroup = (g: string) => {
      const kids = pl.filter((l) => l.chain[0] === g)
      if (kids.length === 0) return
      const v = net(g)
      out.push({ kind: 'group', key: `pl|${g}`, name: g, division: kids[0].division, bs: false, pd: v, pc: v, bal: 0 })
      for (const l of kids) out.push({ kind: 'leaf', key: `a${l.id}`, name: l.name, division: l.division, bs: false, pd: l.pd, pc: l.pc, bal: 0 })
    }
    const calc = (name: string, v: number) => out.push({ kind: 'calc', key: `calc|${name}`, name, division: 'REVENUE', bs: false, pd: v, pc: v, bal: 0 })
    if (pl.length > 0) {
      const sumOf = (gs: string[]) => gs.filter((g) => groupsIn.includes(g)).reduce((t, g) => t + sign(g) * net(g), 0)
      const head = ['매출', '매출원가', '제조원가']
      head.forEach(pushGroup)
      const gp = sumOf(head)
      calc('매출총이익', gp)
      pushGroup('판매비및일반관리비')
      const op = gp + sumOf(['판매비및일반관리비'])
      calc('영업이익', op)
      const others = groupsIn.filter((g) => ![...head, '판매비및일반관리비', '법인세비용'].includes(g))
        .sort((x, y) => rankOf(x) - rankOf(y))
      others.forEach(pushGroup)
      const pbt = op + sumOf(others)
      calc('법인세비용차감전순손익', pbt)
      pushGroup('법인세비용')
      calc('당기순이익', pbt + sumOf(['법인세비용']))
    }
    return out
  }, [period, cumul, accounts, withZero, usedOnly])

  const leafCount = rows.filter((r) => r.kind === 'leaf').length
  /* 원본 [합계] 기말금액은 차 · 대 두 칸에 같은 숫자 = 재무상태표 계정 줄의 기말금액(차변) 합 + 손익 묶음 줄의 순액 합
     (2026-10-21 실측 2,178,978,400 = 1,342,369,900 + 836,608,500 — 그래서 한쪽 전표 잔액조정도 차 · 대 둘 다 늘었다).
     기말잔액은 자산 잔액 합(차) · 부채 · 자본 잔액 합(대). */
  const amountTotal = rows.filter((r) => (r.bs && r.kind === 'leaf') || (!r.bs && r.kind === 'group')).reduce((t, r) => t + r.pd, 0)
  const total = {
    db: rows.filter((r) => r.bs && r.kind === 'leaf' && debitNormal(r.division)).reduce((s, r) => s + r.bal, 0),
    pd: amountTotal,
    pc: amountTotal,
    cb: rows.filter((r) => r.bs && r.kind === 'leaf' && !debitNormal(r.division)).reduce((s, r) => s + r.bal, 0),
  }
  const fmt = (n: number) => (n === 0 ? '' : Math.round(thousand ? n / 1000 : n).toLocaleString('ko-KR'))
  /** 기말잔액은 계정의 제 쪽에만 찍는다. */
  const cells = (division: AccountDivision, bal: number, pd: number, pc: number, name: React.ReactNode, isBS: boolean) => (
    <>
      <td className="text-right">{isBS && debitNormal(division) ? fmt(bal) : ''}</td>
      <td className="text-right">{fmt(pd)}</td>
      <td style={NAME_CELL}>{name}</td>
      <td className="text-right">{fmt(pc)}</td>
      <td className="text-right">{isBS && !debitNormal(division) ? fmt(bal) : ''}</td>
    </>
  )

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '합계잔액시산표', [rows.length])

  const reset = () => {
    setDept(''); setProject('')
    const r = periodOf('이번기수(~전월)', new Date(), fiscalStart) ?? periodOf('금월(~오늘)')!
    setFrom(r.from); setTo(r.to); setThousand(false); setWithZero(false); setUsedOnly(false)
  }
  const check = (label: string, v: boolean, set: (b: boolean) => void) => (
    <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )

  return (
    <EcListShell
      title="합계잔액시산표"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="조회일자">
          <input type="month" className="ec-input" value={from.slice(0, 7)} onChange={(e) => e.target.value && setFrom(`${e.target.value}-01`)} style={{ width: 130 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="month" className="ec-input" value={to.slice(0, 7)}
                 onChange={(e) => { if (!e.target.value) return; const [y, m] = e.target.value.split('-').map(Number); const d = new Date(y, m, 0); setTo(`${e.target.value}-${String(d.getDate()).padStart(2, '0')}`) }}
                 style={{ width: 130 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={TRIAL_BALANCE_PICKS} currentFrom={from} fiscalStart={fiscalStart} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} emptyLabel="전체" value={dept} onChange={setDept} items={deptProject.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={project} onChange={setProject} items={deptProject.projects} />
        </EcCond>
        <EcCond label="기타">
          {check('천단위', thousand, setThousand)}
          {check('잔액0포함', withZero, setWithZero)}
          {check('전표발생계정', usedOnly, setUsedOnly)}
        </EcCond>
      </ul>

      {period && cumul && (
        <>
          <h3 className="text-[20px] font-bold text-center mt-[6px] mx-0 mb-[12px]">합계잔액시산표</h3>
          <div className="flex justify-between text-[12px] mt-0 mx-0 mb-[4px]">
            <span>회사명 : {companyName ?? ''}</span>
            <span>{slash(from)} ~{slash(to)}</span>
          </div>
          <table ref={tableRef} className="w-full text-left">
            <thead>
              <tr>
                <th className="text-right">기말잔액(차변)</th>
                <th className="text-right">기말금액(차변)</th>
                <th className="text-center">계정명</th>
                <th className="text-right">기말금액(대변)</th>
                <th className="text-right">기말잔액(대변)</th>
              </tr>
            </thead>
            <tbody>
              {leafCount === 0 && <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
              {leafCount > 0 && rows.map((r) => (
                <tr key={r.key} style={r.kind === 'leaf' ? undefined : GROUP_ROW}>{cells(r.division, r.bal, r.pd, r.pc, r.name, r.bs)}</tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={TOTAL_ROW}>
                <td className="text-right">{fmt(total.db)}</td>
                <td className="text-right">{fmt(total.pd)}</td>
                <td className="text-center">합계</td>
                <td className="text-right">{fmt(total.pc)}</td>
                <td className="text-right">{fmt(total.cb)}</td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </EcListShell>
  )
}
