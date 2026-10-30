import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { extractErrorMessage } from '../../api/client'
import { ecAlert } from '../../components/EcDialog'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { fetchBonds, useBondMasters } from '../../features/bond/api'
import { BOND_FLOW_PICKS, byPartnerName } from '../../features/bond/ledger'
import { dateNo, flatten, sideWord, won, type BondDirection, type BondRow, type BondSide } from '../../features/bond/types'
import { EcDateRange } from '../../components/ui/EcDateInput'

/**
 * 회계 II › 채권관리 › <b>채권증가현황</b>(E060406) · <b>채권감소현황</b> · 채무관리의 같은 둘 — 2026-10-12 loginaa 실측.
 *
 * <p>조건(펼쳐 둠): 구분(내역 · 집계 · 라인별) · 비교기간 · 기준일자(기본 <b>최근30일</b>) · 채권 만기일자(증가만) · 거래처 · 부서 · 프로젝트 · 계정 · 채권번호 · 적요.
 * 열(증가): 일자-No. · 채권번호 · 거래처명 · 계정명 · 적요 · 채권 만기일자 · 금액. 감소는 만기일자 열이 없다.
 * 거래처마다 '{거래처명} 계', 맨 끝 '총합계'. 버튼줄 인쇄 · Excel(화면).
 * 격자는 출력물(.ec-report)이 아니라 <b>조회 목록 격자</b>다(2026-10-13 실측 table-list: 머리 33.8 · 윗선 파랑회색 · 줄 28.4 ·
 * 여백 9px 2.7px 7.2px / 5.4px 2.7px). 계 · 총합계 줄은 굵게 · 바탕 247 · 이름 가운데 — 거래내역(.ec-report, 243)과 다르다.
 * 증가 50,000(김치좋아) → 증가현황 한 줄 50,000 · 김치좋아 계 50,000 · 총합계 50,000. 감소 20,000 → 감소현황 같은 꼴로 20,000.
 *
 * <p>[구분] 내역 · 집계(집계조건1 · 2 — 원본 21항목 다. 입금계좌별 · 거래처그룹 · 프로젝트그룹은 줄에 값이 없어 한 묶음(빈 이름)). 비우면 '집계 조건은 1개 이상 선택하셔야 합니다.'
 * 라인별 · [비교기간] · 그래프로 보기는 원본에서 펼친 모양을 아직 못 쟀다.
 */
/** 원본 집계조건 [항목추가] 창 나무(2026-10-21 loginaa 채권증가현황 실측) — 채권내역 › 상단-기본 · 하단-기본 · 거래처 · 프로젝트 · 채권번호, 21항목. */
const AGG_TREE: [string, string[]][] = [
  ['상단-기본', ['일별', '주차별', '월별', '분기별', '반기별', '연별', '전표별', '진행상태별']],
  ['하단-기본', ['채권번호별', '거래처별', '입금계좌별', '계정별', '부서별', '프로젝트별', '라인별']],
  ['거래처', ['거래처그룹1별', '거래처그룹2별']],
  ['프로젝트', ['프로젝트그룹1별', '프로젝트그룹2별']],
  ['채권번호', ['만기월별', '발생월별']],
]

export default function BondFlowPage({ side, direction }: { side: BondSide; direction: BondDirection }) {
  const word = sideWord(side)
  const inc = direction === 'INCREASE'
  const title = `${word}${inc ? '증가' : '감소'}현황`
  const init = periodOf('최근30일')!
  const masters = useBondMasters()
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [partner, setPartner] = useState('')
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const [account, setAccount] = useState('')
  const [bondNo, setBondNo] = useState('')
  const [memo, setMemo] = useState('')
  const [mode, setMode] = useState<'내역' | '집계'>('내역')
  const [agg1, setAgg1] = useState('')
  const [agg2, setAgg2] = useState('')
  const [aggOn, setAggOn] = useState(false)
  const [rows, setRows] = useState<BondRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(flatten(await fetchBonds(side, to)))
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [side, to])

  const groups = useMemo(() => {
    const shown = rows
      .filter((r) => r.direction === direction && r.entryDate >= from && r.entryDate <= to)
      .filter((r) => !inc || !dueFrom || (r.dueDate ?? '') >= dueFrom)
      .filter((r) => !inc || !dueTo || (!!r.dueDate && r.dueDate <= dueTo))
      .filter((r) => !partner || String(r.partnerId) === partner)
      .filter((r) => !dept || String(r.departmentId) === dept)
      .filter((r) => !project || String(r.projectId) === project)
      .filter((r) => !account || String(r.accountId) === account)
      .filter((r) => !bondNo || r.bondNo.includes(bondNo))
      .filter((r) => !memo || (r.memo ?? '').includes(memo))
      .sort((a, b) => byPartnerName(a, b) || (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.entryNo - b.entryNo))
    const m = new Map<string, { name: string; rows: BondRow[]; total: number }>()
    for (const r of shown) {
      const k = String(r.partnerId ?? '')
      const g = m.get(k) ?? { name: r.partnerName ?? '', rows: [], total: 0 }
      g.rows.push(r)
      g.total += Number(r.amount)
      m.set(k, g)
    }
    return [...m.entries()]
  }, [rows, direction, inc, from, to, dueFrom, dueTo, partner, dept, project, account, bondNo, memo])
  const aggMode = mode === '집계'
  /** 집계조건 → 줄의 묶음 열쇠(이름). 21항목 중 우리 자료로 셀 수 있는 것만 — 나머지는 원본 재기 필요. */
  const keyOf = (c: string, r: BondRow): string => {
    const d = r.entryDate
    const y = d.slice(0, 4), m = Number(d.slice(5, 7))
    switch (c) {
      case '일별': return d.replaceAll('-', '/')
      case '주차별': { const t = new Date(`${d}T00:00:00`); const first = new Date(t.getFullYear(), 0, 1); return `${y}년 ${Math.ceil(((t.getTime() - first.getTime()) / 86400000 + first.getDay() + 1) / 7)}주차` }
      case '월별': return d.slice(0, 7).replaceAll('-', '/')
      case '분기별': return `${y}/${Math.ceil(m / 3)}분기`
      case '반기별': return `${y}/${m <= 6 ? '상반기' : '하반기'}`
      case '연별': return y
      case '전표별': return dateNo(r)
      case '진행상태별': return r.direction === 'INCREASE' ? '증가' : '감소'
      case '채권번호별': return r.bondNo
      case '부서별': return masters.departments.find((x) => x.value === String(r.departmentId))?.name ?? ''
      case '라인별': return `${dateNo(r)} ${r.lineNo}`
      case '만기월별': return r.dueDate ? r.dueDate.slice(0, 7).replaceAll('-', '/') : ''
      case '발생월별': return d.slice(0, 7).replaceAll('-', '/')
      case '거래처별': return r.partnerName ?? ''
      case '계정별': return r.accountName
      case '프로젝트별': return r.projectName ?? ''
      default: return ''
    }
  }
  const aggGroups = useMemo(() => {
    if (!aggMode || !aggOn) return []
    const flat = groups.flatMap(([, g]) => g.rows)
    const m = new Map<string, { k1: string; k2: string; row: BondRow; amount: number }>()
    for (const r of flat) {
      const k1 = keyOf(agg1, r); const k2 = agg2 ? keyOf(agg2, r) : ''
      const key = `${k1}\u0000${k2}`
      const g = m.get(key)
      if (g) g.amount += Number(r.amount); else m.set(key, { k1, k2, row: r, amount: Number(r.amount) })
    }
    const by = new Map<string, { k1: string; items: { k2: string; row: BondRow; amount: number }[]; total: number }>()
    for (const v of m.values()) {
      const g = by.get(v.k1) ?? { k1: v.k1, items: [], total: 0 }
      g.items.push(v); g.total += v.amount; by.set(v.k1, g)
    }
    return [...by.values()].sort((a, b) => a.k1.localeCompare(b.k1, 'ko'))
  }, [groups, aggMode, aggOn, agg1, agg2])
  const aggCols = 1 + (agg2 ? 1 : 0) + 1 + (inc ? 1 : 0) + 1
  const total = groups.reduce((a, [, g]) => a + g.total, 0)
  const cols = inc ? 7 : 6
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [groups.length, aggMode, aggOn, agg2])
  function search() {
    if (aggMode && !agg1) { void ecAlert('집계 조건은 1개 이상 선택하셔야 합니다.'); return }
    setAggOn(aggMode)
    void load()
  }

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: search },
        { label: '다시작성', onClick: () => { setFrom(init.from); setTo(init.to); setDueFrom(''); setDueTo(''); setPartner(''); setDept(''); setProject(''); setAccount(''); setBondNo(''); setMemo(''); setMode('내역'); setAgg1(''); setAgg2(''); setAggOn(false) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="구분">
          <select className="ec-input w-[120px]" aria-label="구분" value={mode} onChange={(e) => { setMode(e.target.value as '내역' | '집계'); setAggOn(false) }}>
            <option>내역</option><option>집계</option>
          </select>
        </EcCond>
        {aggMode && (
          <EcCond label="집계조건1">
            <select className="ec-input w-[160px]" aria-label="집계조건1" value={agg1} onChange={(e) => { setAgg1(e.target.value); setAggOn(false) }}>
              <option value=""></option>{AGG_TREE.map(([g, os]) => <optgroup key={g} label={g}>{os.map((o) => <option key={o}>{o}</option>)}</optgroup>)}
            </select>
          </EcCond>
        )}
        {aggMode && agg1 && (
          <EcCond label="집계조건2">
            <select className="ec-input w-[160px]" aria-label="집계조건2" value={agg2} onChange={(e) => { setAgg2(e.target.value); setAggOn(false) }}>
              <option value=""></option>{AGG_TREE.map(([g, os]) => <optgroup key={g} label={g}>{os.filter((o) => o !== agg1).map((o) => <option key={o}>{o}</option>)}</optgroup>)}
            </select>
          </EcCond>
        )}
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={BOND_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        {inc && (
          <EcCond label={`${word} 만기일자`}>
            <EcDateRange from={{ className: "ec-input w-[145px]", value: dueFrom, onChange: (e) => setDueFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", value: dueTo, onChange: (e) => setDueTo(e.target.value) }} />
          </EcCond>
        )}
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} value={partner} onChange={setPartner} items={masters.partners} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} value={dept} onChange={setDept} items={masters.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} value={project} onChange={setProject} items={masters.projects} />
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={220} value={account} onChange={setAccount} items={masters.accounts} />
        </EcCond>
        <EcCond label={`${word}번호`}>
          <input className="ec-input w-[220px]" placeholder={`${word}번호`} value={bondNo} onChange={(e) => setBondNo(e.target.value)} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input w-[220px]" placeholder="적요" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </EcCond>
      </ul>

      <table ref={tableRef} className="ec-head700 w-full text-left">
        {/* 현황 머리는 굵다(원본 700, .ec-head700) — 조회 화면 머리(400)와 다르다 */}
        {aggMode ? (<>
        <thead>
          <tr>
            <th>{agg1 ? `${agg1}` : '집계'}</th>
            {agg2 && <th>{agg2}</th>}
            <th>적요</th>
            {inc && <th>{word} 만기일자</th>}
            <th className="text-right">금액</th>
          </tr>
        </thead>
        <tbody>
          {!aggOn ? (
            <tr><td colSpan={aggCols} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : aggGroups.length === 0 ? (
            <tr><td colSpan={aggCols} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : aggGroups.flatMap((g) => [
            ...g.items.map((it, i) => (
              <tr key={`${g.k1}-${it.k2}-${i}`}>
                <td>{g.k1}</td>
                {agg2 && <td>{it.k2}</td>}
                <td>{it.row.memo ?? ''}</td>
                {inc && <td>{it.row.dueDate ? it.row.dueDate.replaceAll('-', '/') : ''}</td>}
                <td className="text-right">{won(it.amount)}</td>
              </tr>
            )),
            <tr key={`${g.k1}-s`} className="ec-list-total">
              <td colSpan={aggCols - 1} className="text-center !font-bold">{g.k1} 계</td>
              <td className="text-right !font-bold">{won(g.total)}</td>
            </tr>,
          ])}
        </tbody>
        {aggOn && aggGroups.length > 0 && (
          <tfoot>
            <tr className="ec-list-total">
              <td colSpan={aggCols - 1} className="text-center !font-bold">총합계</td>
              <td className="text-right !font-bold">{won(total)}</td>
            </tr>
          </tfoot>
        )}
        </>) : (<>
        <thead>
          <tr>
            <th>일자-No.</th>
            <th>{word}번호</th>
            <th>거래처명</th>
            <th>계정명</th>
            <th>적요</th>
            {inc && <th>{word} 만기일자</th>}
            <th className="text-right">금액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={cols} className="ec-empty">불러오는 중…</td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={cols} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : groups.flatMap(([k, g]) => [
            ...g.rows.map((r) => (
              <tr key={r.id}>
                <td>{dateNo(r)}</td>
                <td>{r.bondNo}</td>
                <td>{r.partnerName ?? ''}</td>
                <td>{r.accountName}</td>
                <td>{r.memo ?? ''}</td>
                {inc && <td>{r.dueDate ? r.dueDate.replaceAll('-', '/') : ''}</td>}
                <td className="text-right">{won(Number(r.amount))}</td>
              </tr>
            )),
            <tr key={`${k}-s`} className="ec-list-total">
              <td colSpan={cols - 1} className="text-center !font-bold">{g.name} 계</td>
              <td className="text-right !font-bold">{won(g.total)}</td>
            </tr>,
          ])}
        </tbody>
        {groups.length > 0 && (
          <tfoot>
            <tr className="ec-list-total">
              <td colSpan={cols - 1} className="text-center !font-bold">총합계</td>
              <td className="text-right !font-bold">{won(total)}</td>
            </tr>
          </tfoot>
        )}
        </>)}
      </table>
    </EcListShell>
  )
}
