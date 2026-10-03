import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { NOTE_FLOW_PICKS, periodOf } from '../../components/EcPeriodPicks'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 전표번호 모양 — 연도 두 자리 '26/09/17-1-1'(일자 - 전표 - 줄, 2026-10-03 실측). 우리 전표번호는 일련번호가 아니라 문서번호라 그대로 붙인다. */
const yy = (d: string) => `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}`

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }

/**
 * 회계 I &gt; 출력물 &gt; 장부 &gt; <b>분개장</b>(E010802) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일</b>) · 회계전표No. · 거래처 · 계정 · 부서 · 프로젝트 · 거래유형 · 금액(구간) ·
 * 채권/채무(어음) No. · 적요 · 기타([차/대다른것만보기]). 열: 전표번호 · 계정명 · 거래처 · 차변 · 대변 · 적요, 끝에 '합계'(앞 세 칸 묶음 ·
 * 바탕 rgb(243,243,243)). 분개 한 줄이 한 줄이다.
 *
 * <p>거래유형은 그 전표가 생긴 곳(판매 · 구매 · 비용 …), 금액은 그 줄의 차변 또는 대변, [차/대다른것만보기]는 차변 합과 대변 합이 다른 전표만.
 * 부서 · 프로젝트 · 채권/채무(어음) No. 는 회계전표가 들지 않는다.
 */
export default function JournalBookPage() {
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [docNo, setDocNo] = useState('')
  const [partner, setPartner] = useState('')
  const [account, setAccount] = useState('')
  const [kind, setKind] = useState('')
  const [amtFrom, setAmtFrom] = useState('')
  const [amtTo, setAmtTo] = useState('')
  const [remark, setRemark] = useState('')
  const [unbalancedOnly, setUnbalancedOnly] = useState(false)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from, to } })
      setEntries(r.data.rows)
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const rows = useMemo(() => {
    const out: { key: string; no: string; account: string; partner: string; debit: number; credit: number; remark: string }[] = []
    const es = entries
      .filter((e) => !docNo || e.docNo.includes(docNo))
      .filter((e) => !partner || (e.partnerName ?? '') === partner)
      .filter((e) => !kind || e.sourceTypeName === kind)
      .filter((e) => !unbalancedOnly || Number(e.totalDebit) !== Number(e.totalCredit))
      .sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    for (const e of es) {
      for (const l of [...e.lines].sort((a, b) => a.lineNo - b.lineNo)) {
        const amt = Number(l.debit) || Number(l.credit)
        if (account && l.accountName !== account) continue
        if (amtFrom !== '' && amt < Number(amtFrom)) continue
        if (amtTo !== '' && amt > Number(amtTo)) continue
        const text = l.description ?? e.description ?? ''
        if (remark && !text.includes(remark)) continue
        out.push({ key: `${e.id}-${l.id}`, no: `${yy(e.entryDate)} ${e.docNo}-${l.lineNo}`, account: l.accountName, partner: e.partnerName ?? '',
          debit: Number(l.debit), credit: Number(l.credit), remark: text })
      }
    }
    return out
  }, [entries, docNo, partner, account, kind, amtFrom, amtTo, remark, unbalancedOnly])
  const total = rows.reduce((s, r) => ({ debit: s.debit + r.debit, credit: s.credit + r.credit }), { debit: 0, credit: 0 })
  const partners = useMemo(() => [...new Set(entries.map((e) => e.partnerName).filter(Boolean) as string[])].sort(), [entries])
  const accounts = useMemo(() => [...new Set(entries.flatMap((e) => e.lines.map((l) => l.accountName)))].sort(), [entries])
  const kinds = useMemo(() => [...new Set(entries.map((e) => e.sourceTypeName))].sort(), [entries])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '분개장', [rows.length])

  return (
    <EcListShell
      title="분개장"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setDocNo(''); setPartner(''); setAccount(''); setKind(''); setAmtFrom(''); setAmtTo(''); setRemark(''); setUnbalancedOnly(false) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={NOTE_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="회계전표No.">
          <input className="ec-input" value={docNo} onChange={(e) => setDocNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={partners.map((p) => ({ value: p, name: p }))} />
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={200} emptyLabel="전체" value={account} onChange={setAccount} items={accounts.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        <EcCond label="거래유형">
          <select className="ec-input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 140 }}>
            <option value="">전체</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </EcCond>
        <EcCond label="금액">
          <input className="ec-input" inputMode="decimal" value={amtFrom} onChange={(e) => setAmtFrom(e.target.value)} style={{ width: 110 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input className="ec-input" inputMode="decimal" value={amtTo} onChange={(e) => setAmtTo(e.target.value)} style={{ width: 110 }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={unbalancedOnly} onChange={(e) => setUnbalancedOnly(e.target.checked)} /> 차/대다른것만보기
          </label>
        </EcCond>
      </ul>

      {truncated && <p className="text-[12px] text-ec-warn mb-[6px]">전표가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">전표번호</th>
            <th>계정명</th>
            <th>거래처</th>
            <th className="text-right">차변</th>
            <th className="text-right">대변</th>
            <th>적요</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.key}>
              <td className="text-center">{r.no}</td>
              <td>{r.account}</td>
              <td>{r.partner}</td>
              <td className="text-right">{won(r.debit)}</td>
              <td className="text-right">{won(r.credit)}</td>
              <td>{r.remark}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'rgb(243, 243, 243)' }}>
              <td colSpan={3}>합계</td>
              <td className="text-right">{won(total.debit)}</td>
              <td className="text-right">{won(total.credit)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
