import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { fetchBonds, useBondMasters } from '../../features/bond/api'
import { BOND_FLOW_PICKS, byPartnerName } from '../../features/bond/ledger'
import { dateNo, flatten, sideWord, won, type BondDirection, type BondRow, type BondSide } from '../../features/bond/types'

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
 * <p>[구분]은 '내역'만 둔다 — 집계 · 라인별 · [비교기간] · 그래프로 보기는 원본에서 펼친 모양을 아직 못 쟀다.
 */
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
  const total = groups.reduce((a, [, g]) => a + g.total, 0)
  const cols = inc ? 7 : 6
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [groups.length])

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시작성', onClick: () => { setFrom(init.from); setTo(init.to); setDueFrom(''); setDueTo(''); setPartner(''); setDept(''); setProject(''); setAccount(''); setBondNo(''); setMemo('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={BOND_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        {inc && (
          <EcCond label={`${word} 만기일자`}>
            <input type="date" className="ec-input w-[145px]" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
            <span className="my-0 mx-[4px]">~</span>
            <input type="date" className="ec-input w-[145px]" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
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
      </table>
    </EcListShell>
  )
}
