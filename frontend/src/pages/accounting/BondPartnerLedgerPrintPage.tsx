import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { fetchBonds, useBondMasters } from '../../features/bond/api'
import { BOND_STATUS_PICKS } from '../../features/bond/ledger'
import { flatten, signed, sideWord, won, type BondRow, type BondSide } from '../../features/bond/types'
import { ecAlert } from '../../components/EcDialog'
import NumCheck from '../../components/NumCheck'

/** 원본 리스트 버튼이 고른 줄 없이 눌렸을 때의 알림(부서리스트 · 거래처리스트와 같은 글). */
const NO_PICK = '리스트에 선택된 자료가 없습니다.\n체크박스에 체크한 후 다시 시도 바랍니다.'


interface Row {
  id: string
  code: string
  name: string
  opening: number
  inc: number
  dec: number
  closing: number
}

/**
 * 회계 II › 채권관리 › <b>거래처채권관리대장인쇄</b>(N000008) · 채무관리의 같은 화면 — 2026-10-13 loginaa 실측.
 *
 * <p>조건(펼쳐 둠): 기준일자(기본 금월(~오늘)) · 계정 · 채권번호 · 거래처. 기간 버튼은 거래처채권관리대장과 같다.
 * 격자 위 오른쪽에 '2026/10/01 ~ 2026/10/13'. 열: 번호 체크칸 · 거래처코드(링크) · 거래처명 · 이월잔액 · 증가금액 · 감소금액 · 잔액,
 * 거래처코드 차례, 합계줄 없음. 김치좋아: 이월 98,000 · 증가 50,000 · 잔액 148,000.
 * [거래처코드] 와 고른 줄 [인쇄] 는 그 거래처의 '거래처채권집계관리대장' 창을 연다 — 우리는 그 화면으로 간다.
 * 고른 줄 없이 [인쇄] → '리스트에 선택된 자료가 없습니다. / 체크박스에 체크한 후 다시 시도 바랍니다.'
 * 버튼줄 Email · 인쇄 — Email 은 바깥으로 보내는 기능이라 두지 않는다.
 */
export default function BondPartnerLedgerPrintPage({ side }: { side: BondSide }) {
  const word = sideWord(side)
  const title = `거래처${word}관리대장인쇄`
  const init = periodOf('금월(~오늘)')!
  const masters = useBondMasters()
  const navigate = useNavigate()
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [account, setAccount] = useState('')
  const [bondNo, setBondNo] = useState('')
  const [partner, setPartner] = useState('')
  const [rows, setRows] = useState<BondRow[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(flatten(await fetchBonds(side, to)))
      setPicked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [side, to])

  const list = useMemo(() => {
    const m = new Map<string, Row>()
    for (const r of rows) {
      if (r.entryDate > to) continue
      if (account && String(r.accountId) !== account) continue
      if (bondNo && !r.bondNo.includes(bondNo)) continue
      if (partner && String(r.partnerId) !== partner) continue
      const k = String(r.partnerId ?? '')
      const g = m.get(k) ?? { id: k, code: r.partnerCode ?? '', name: r.partnerName ?? '', opening: 0, inc: 0, dec: 0, closing: 0 }
      if (r.entryDate < from) g.opening += signed(r)
      else if (r.direction === 'INCREASE') g.inc += Number(r.amount)
      else g.dec += Number(r.amount)
      g.closing += signed(r)
      m.set(k, g)
    }
    return [...m.values()]
      .filter((g) => Math.round(g.opening) !== 0 || g.inc !== 0 || g.dec !== 0)
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [rows, from, to, account, bondNo, partner])

  const cell = (n: number) => (Math.round(n) ? won(n) : '')
  const day = (d: string) => d.replaceAll('-', '/')
  const open = (ids: string[]) =>
    navigate(`${side === 'RECEIVABLE' ? '/accounting/bonds/ar/partner-summary' : '/accounting/bonds/ap/partner-summary'}?from=${from}&to=${to}&partners=${ids.join(',')}`)
  const allOn = list.length > 0 && list.every((g) => picked.has(g.id))

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시작성', onClick: () => { setFrom(init.from); setTo(init.to); setAccount(''); setBondNo(''); setPartner('') } },
        { label: '인쇄', onClick: () => { if (picked.size === 0) { void ecAlert(NO_PICK); return } open([...picked]) } },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={BOND_STATUS_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
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

      <p className="text-right mb-[4px]">{day(from)} ~ {day(to)}</p>
      <table className="ec-head700 w-full text-left">
        <thead>
          <tr>
            <th className="w-[40px] text-center">
              <NumCheck tone="plain" no="" head on={allOn} label="전체 선택"
                        onChange={() => setPicked(allOn ? new Set() : new Set(list.map((g) => g.id)))} />
            </th>
            <th>거래처코드</th>
            <th>거래처명</th>
            <th className="text-right">이월잔액</th>
            <th className="text-right">증가금액</th>
            <th className="text-right">감소금액</th>
            <th className="text-right">잔액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : list.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : list.map((g, i) => (
            <tr key={g.id}>
              <td className="text-center">
                <NumCheck tone="plain" no={i + 1} on={picked.has(g.id)} label={`${g.name} 선택`}
                          onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n })} />
              </td>
              <td><button type="button" className="ec-link" onClick={() => open([g.id])}>{g.code}</button></td>
              <td>{g.name}</td>
              <td className="text-right">{cell(g.opening)}</td>
              <td className="text-right">{cell(g.inc)}</td>
              <td className="text-right">{cell(g.dec)}</td>
              <td className="text-right">{won(g.closing)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
