import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { ymd } from '../../components/EcPeriodPicks'
import { fetchBonds, useBondMasters } from '../../features/bond/api'
import { BOND_STATUS_PICKS, byPartnerName, openBonds, type OpenBond } from '../../features/bond/ledger'
import { flatten, sideWord, won, type BondRow, type BondSide } from '../../features/bond/types'

/**
 * 회계 II › 채권관리 › <b>채권현황</b>(E060404) · 채무관리 › 채무현황 — 2026-10-12 loginaa 실측.
 *
 * <p>조건(펼쳐 둠): 기준일자(한 날, 기본 오늘) · 계정 · 채권번호 · 거래처. 적용양식 '현황_집계'.
 * 열: 발생일자 · 채권번호 · 거래처명 · 계정명 · 적요 · 만기일자 · 잔액 — 기준일에 잔액이 남은 채권번호만.
 * 거래처 이름 차례로 '{거래처명} 계', 맨 끝 '총합계'. 버튼줄 인쇄 · Excel(화면) · 자동알림.
 * 증가 50,000 · 감소 20,000 → 그 번호 한 줄 잔액 30,000(발생일자 · 만기일자 · 적요는 증가 줄 것).
 *
 * <p>[자동알림](만기 알림 메일 · 문자 예약)은 바깥으로 보내는 기능이라 두지 않는다.
 */
export default function BondStatusPage({ side }: { side: BondSide }) {
  const word = sideWord(side)
  const title = `${word}현황`
  const masters = useBondMasters()
  // 채권잔액분석표의 [거래처코드] 가 이 화면을 그 거래처 · 계정으로 연다(원본은 채권현황 창 — 2026-10-13 실측)
  const [params] = useSearchParams()
  const [asOf, setAsOf] = useState(params.get('asOf') ?? ymd(new Date()))
  const [account, setAccount] = useState(params.get('account') ?? '')
  const [bondNo, setBondNo] = useState('')
  const [partner, setPartner] = useState(params.get('partner') ?? '')
  const [rows, setRows] = useState<BondRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(flatten(await fetchBonds(side, asOf)))
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [side, asOf])

  const groups = useMemo(() => {
    const open = openBonds(rows, asOf)
      .filter((b) => !account || String(b.accountId) === account)
      .filter((b) => !bondNo || b.bondNo.includes(bondNo))
      .filter((b) => !partner || String(b.partnerId) === partner)
      .sort((a, b) => byPartnerName(a, b) || (a.issueDate < b.issueDate ? -1 : a.issueDate > b.issueDate ? 1 : a.bondNo.localeCompare(b.bondNo)))
    const m = new Map<string, { name: string; rows: OpenBond[]; total: number }>()
    for (const b of open) {
      const k = String(b.partnerId ?? '')
      const g = m.get(k) ?? { name: b.partnerName ?? '', rows: [], total: 0 }
      g.rows.push(b)
      g.total += b.balance
      m.set(k, g)
    }
    return [...m.entries()]
  }, [rows, asOf, account, bondNo, partner])
  const total = groups.reduce((a, [, g]) => a + g.total, 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [groups.length])

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시작성', onClick: () => { setAsOf(ymd(new Date())); setAccount(''); setBondNo(''); setPartner('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={BOND_STATUS_PICKS} currentFrom={asOf} onPick={(r) => setAsOf(r.to)} />
          </span>
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={220} value={account} onChange={setAccount} items={masters.accounts} />
        </EcCond>
        <EcCond label={`${word}번호`}>
          <input className="ec-input w-[220px]" placeholder={`${word}번호`} value={bondNo} onChange={(e) => setBondNo(e.target.value)} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} value={partner} onChange={setPartner} items={masters.partners} />
        </EcCond>
      </ul>

      {/* 조회 목록 격자(table-list) — 출력물(.ec-report)이 아니다. 머리 굵게 · 계 줄 247(2026-10-13 실측) */}
      <table ref={tableRef} className="ec-head700 w-full text-left">
        <thead>
          <tr>
            <th>발생일자</th>
            <th>{word}번호</th>
            <th>거래처명</th>
            <th>계정명</th>
            <th>적요</th>
            <th>만기일자</th>
            <th className="text-right">잔액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : groups.flatMap(([k, g]) => [
            ...g.rows.map((b) => (
              <tr key={b.key}>
                <td>{b.issueDate.replaceAll('-', '/')}</td>
                <td className="text-ec-navy">{b.bondNo}</td>
                <td>{b.partnerName ?? ''}</td>
                <td>{b.accountName}</td>
                <td>{b.memo ?? ''}</td>
                <td>{b.dueDate ? b.dueDate.replaceAll('-', '/') : ''}</td>
                <td className="text-right">{won(b.balance)}</td>
              </tr>
            )),
            <tr key={`${k}-s`} className="ec-list-total [&_td]:!font-bold">
              <td colSpan={6} className="text-center">{g.name} 계</td>
              <td className="text-right">{won(g.total)}</td>
            </tr>,
          ])}
        </tbody>
        {groups.length > 0 && (
          <tfoot>
            <tr className="ec-list-total [&_td]:!font-bold">
              <td colSpan={6} className="text-center">총합계</td>
              <td className="text-right">{won(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
