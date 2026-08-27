import { Fragment, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { groupKeyOf, UNPOSTED } from '../../utils/ledgerGroup'
import { rollupOf, toRollupMap, type LedgerBasis, type RollupPartner } from '../../utils/partnerRollup'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 영업 > 거래처관리대장 — 거래처별로 <b>기간 동안의 오고 감</b>을 본다.
 *
 * <p>예전에는 이 화면이 거래처별 <b>잔액 한 줄</b>이었다(채권·채무 합계). 그건 이미
 * 채권/채무현황이 하는 일이고, 대장이라면 "언제 무엇으로 늘고 무엇으로 줄었나"가 보여야 한다.
 *
 * <p>원본 조건 판 실측(사본 · 거래처관리대장 I):
 *   채권채무구분 [전체 | 채권 | 채무]
 *   집계구분   [전표별 | 전표별+내역 | 일별 | 월별 | 회계전표별]
 *   기준일자(기본 <b>전월+금월</b>) · 거래처 · 대표거래처로 합산 · 거래처관계기준/개별거래처기준
 *   기타(거래처코드없는자료인쇄) · 양식 · 정렬/소계기준
 *
 * <p>[회계전표별]은 오래 안 만들었다 — 우리 회계반영은 선택이라 그 축으로 묶으면
 * <b>아직 반영하지 않은 전표가 대장에서 사라진다</b>고 적어 뒀다. 사라지게 두지 않으면
 * 될 일이었다. 반영 안 된 줄은 <b>'미반영' 한 묶음</b>으로 모은다 — 사라지기는커녕
 * 어느 전표가 아직 회계로 안 갔는지 대장에서 바로 보인다.
 *
 * <p>수금·지급도 회계로 넘어가므로(그전에는 안 넘어갔다) 이 축이 이제야 온전해졌다.
 *
 * <p>대표거래처 합산·거래처관계기준은 거래처 관계 마스터가 있어야 해서 아직 못 한다.
 *
 * <p>잔액은 거래처마다 <b>이월잔액에서 시작해 한 줄씩 누적</b>한다. 채권은 판매로 늘고 수금으로
 * 줄며, 채무는 구매로 늘고 지급으로 준다.
 */
type Side = '전체' | '채권' | '채무'
type Group = '전표별' | '전표별+내역' | '일별' | '월별' | '회계전표별'
const GROUPS = ['전표별', '전표별+내역', '일별', '월별', '회계전표별'] as const


interface Line { itemCode: string; itemName: string; quantity: number; unitPrice: number; supplyAmount: number }
interface SalesDoc { id: number; docNo: string; saleDate: string; partnerId: number; partnerName: string; totalAmount: number; lines: Line[] }
interface PurchaseDoc { id: number; docNo: string; purchaseDate: string; partnerId: number; partnerName: string; totalAmount: number; lines: Line[] }
interface Settlement { id: number; docNo: string; settleDate: string; partnerId: number; partnerName: string; type: 'RECEIPT' | 'PAYMENT'; amount: number }
/** 회계반영 목록의 한 줄 — 전표 id 와 그 전표가 만든 회계전표번호. */
interface Posted { id: number; journalDocNo: string | null }

/** 대장 한 줄. 증가/감소는 채권·채무 어느 쪽 대장이냐에 따라 뜻이 갈린다. */
interface Entry {
  key: string
  partnerId: number
  partnerName: string
  date: string
  docNo: string
  kind: '판매' | '구매' | '수금' | '지급'
  side: '채권' | '채무'
  increase: number
  decrease: number
  lines: Line[]
  /** 이 전표가 만든 회계전표 번호. 아직 반영 안 했으면 null. */
  journalDocNo: string | null
}

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

export default function PartnerLedgerPage({ side: fixedSide = 'BOTH' }: { side?: 'AR' | 'AP' | 'BOTH' }) {
  const title = fixedSide === 'AR' ? '거래처관리대장1(채권)'
    : fixedSide === 'AP' ? '거래처관리대장1(채무)' : '거래처관리대장'

  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  /** 전표 id → 그 전표가 만든 회계전표번호. 반영 안 한 전표는 아예 없다. */
  const [postedSales, setPostedSales] = useState<Map<number, string>>(new Map())
  const [postedPurchases, setPostedPurchases] = useState<Map<number, string>>(new Map())
  const [postedSettles, setPostedSettles] = useState<Map<number, string>>(new Map())
  /** 원본 [대표거래처로 합산]에 쓰는 거래처 관계. id → 대표거래처. */
  const [rollup, setRollup] = useState<Map<number, RollupPartner>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 원본 기본값이 '전월+금월' 이다 — 대장은 지난달 잔액이 이번 달로 어떻게 넘어왔는지 같이 본다.
  const init = periodOf('전월+금월')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [side, setSide] = useState<Side>(fixedSide === 'AR' ? '채권' : fixedSide === 'AP' ? '채무' : '전체')
  const [group, setGroup] = useState<Group>('전표별')
  /**
   * 원본 [대표거래처로 합산] — '거래처관계기준' 이면 지점·사업장 채권채무를 대표 밑으로 모은다.
   * 기본은 원본과 같이 개별거래처기준이다.
   */
  const [basis, setBasis] = useState<LedgerBasis>('개별거래처기준')
  /**
 * 거래처중심입력에서 넘어올 때 <b>그 거래처를 물고</b> 열린다(?partner=거래처명).
 * 허브에서 골라 놓고 넘어왔는데 전체 목록이 나오면 다시 거르게 되고,
 * 그러면 허브가 있으나 마나다.
 */
  const [searchParams] = useSearchParams()
  const [partner, setPartner] = useState(searchParams.get('partner') ?? '')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [s, p, t, js, jp, jt, pt] = await Promise.all([
        api.get<SalesDoc[]>('/sales'),
        api.get<PurchaseDoc[]>('/purchases'),
        api.get<Settlement[]>('/settlements').catch(() => ({ data: [] as Settlement[] })),
        // 회계전표번호를 붙이려면 반영 목록이 필요하다. trade 는 accounting 을 참조할 수
        // 없어(순환) 전표 응답에 번호가 없다 — 화면이 두 쪽을 이어 붙인다.
        api.get<Posted[]>('/accounting-reflection?kind=SALES').catch(() => ({ data: [] as Posted[] })),
        api.get<Posted[]>('/accounting-reflection?kind=PURCHASE').catch(() => ({ data: [] as Posted[] })),
        api.get<Posted[]>('/accounting-reflection?kind=SETTLEMENT').catch(() => ({ data: [] as Posted[] })),
        api.get<RollupPartner[]>('/partners'),
      ])
      setSales(s.data); setPurchases(p.data); setSettlements(t.data)
      const toMap = (rows: Posted[]) =>
        new Map(rows.filter((r) => r.journalDocNo).map((r) => [r.id, r.journalDocNo as string]))
      setPostedSales(toMap(js.data)); setPostedPurchases(toMap(jp.data)); setPostedSettles(toMap(jt.data))
      setRollup(toRollupMap(pt.data))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const reset = () => {
    setFrom(init.from); setTo(init.to); setGroup('전표별'); setPartner(''); setBasis('개별거래처기준')
    setSide(fixedSide === 'AR' ? '채권' : fixedSide === 'AP' ? '채무' : '전체')
  }

  /** 기간과 무관하게 전부 만들어 두고, 기간 앞은 이월잔액으로 접는다. */
  const all = useMemo<Entry[]>(() => {
    const out: Entry[] = []
    for (const d of sales) {
      out.push({
        key: `S${d.id}`, partnerId: d.partnerId, partnerName: d.partnerName, date: d.saleDate,
        docNo: d.docNo, kind: '판매', side: '채권', increase: d.totalAmount, decrease: 0, lines: d.lines ?? [],
        journalDocNo: postedSales.get(d.id) ?? null,
      })
    }
    for (const d of purchases) {
      out.push({
        key: `P${d.id}`, partnerId: d.partnerId, partnerName: d.partnerName, date: d.purchaseDate,
        docNo: d.docNo, kind: '구매', side: '채무', increase: d.totalAmount, decrease: 0, lines: d.lines ?? [],
        journalDocNo: postedPurchases.get(d.id) ?? null,
      })
    }
    for (const t of settlements) {
      out.push({
        key: `T${t.id}`, partnerId: t.partnerId, partnerName: t.partnerName, date: t.settleDate,
        docNo: t.docNo, kind: t.type === 'RECEIPT' ? '수금' : '지급',
        side: t.type === 'RECEIPT' ? '채권' : '채무',
        increase: 0, decrease: t.amount, lines: [],
        journalDocNo: postedSettles.get(t.id) ?? null,
      })
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key < b.key ? -1 : 1))
  }, [sales, purchases, settlements, postedSales, postedPurchases, postedSettles])

  const bySide = useMemo(
    () => all.filter((e) => (side === '전체' || e.side === side)
      && (!partner || e.partnerName.includes(partner))),
    [all, side, partner],
  )

  /** 거래처마다 이월잔액 + 기간 안의 줄 + 소계. */
  const ledger = useMemo(() => {
    const partners = new Map<number, { partnerId: number; name: string; opening: number; entries: Entry[] }>()
    for (const e of bySide) {
      // 규칙은 utils/partnerRollup 에 있다 — 키를 잘못 잡으면 줄이 남의 거래처에 얹힌다.
      const t = rollupOf(e, basis, rollup)
      const cur = partners.get(t.id)
        ?? { partnerId: t.id, name: t.name, opening: 0, entries: [] }
      if (e.date < from) cur.opening += e.increase - e.decrease
      else if (e.date <= to) cur.entries.push(e)
      partners.set(t.id, cur)
    }

    const fold = (entries: Entry[]): Entry[] => {
      if (group === '전표별' || group === '전표별+내역') return entries
      // 규칙은 utils/ledgerGroup 에 있다 — 키를 잘못 잡으면 줄이 조용히 사라진다.
      const keyOf = (e: Entry) => groupKeyOf(e, group) as string
      const m = new Map<string, Entry>()
      for (const e of entries) {
        const k = keyOf(e)
        const cur = m.get(k)
        if (!cur) {
          // 회계전표별은 <b>날짜가 아니라 전표번호</b>로 묶는다. 날짜 자리에 번호를 넣으면
          // 정렬이 엉키므로, 날짜는 그 묶음의 첫 줄 날짜를 그대로 둔다.
          m.set(k, group === '회계전표별'
            ? { ...e, key: `${e.partnerId}-${k}`, docNo: k, lines: [] }
            : { ...e, key: `${e.partnerId}-${k}`, docNo: '', lines: [], date: k })
        } else {
          cur.increase += e.increase
          cur.decrease += e.decrease
        }
      }
      return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
    }

    return [...partners.values()]
      .map((p) => {
        const entries = fold(p.entries)
        let balance = p.opening
        const rows = entries.map((e) => {
          balance += e.increase - e.decrease
          return { entry: e, balance }
        })
        return {
          ...p,
          rows,
          increase: entries.reduce((n, e) => n + e.increase, 0),
          decrease: entries.reduce((n, e) => n + e.decrease, 0),
          closing: balance,
        }
      })
      .filter((p) => p.rows.length > 0 || p.opening !== 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [bySide, from, to, group, basis, rollup])

  const totals = useMemo(() => ledger.reduce(
    (s, p) => ({
      opening: s.opening + p.opening,
      increase: s.increase + p.increase,
      decrease: s.decrease + p.decrease,
      closing: s.closing + p.closing,
    }),
    { opening: 0, increase: 0, decrease: 0, closing: 0 },
  ), [ledger])

  const showDetail = group === '전표별+내역'
  const COLS = 8

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
      >
        {fixedSide === 'BOTH' && (
          <EcCond label="채권채무구분">
            <div className="ec-pills">
              {(['전체', '채권', '채무'] as const).map((s) => (
                <button key={s} type="button" className={`ec-pill no-ec${side === s ? ' active' : ''}`}
                        onClick={() => setSide(s)}>{s}</button>
              ))}
            </div>
          </EcCond>
        )}
        <EcCond label="집계구분">
          <div className="ec-pills">
            {GROUPS.map((g) => (
              <button key={g} type="button" className={`ec-pill no-ec${group === g ? ' active' : ''}`}
                      onClick={() => setGroup(g)}>{g}</button>
            ))}
          </div>
        </EcCond>
        {/*
          원본 조건의 [대표거래처로 합산]. 값이 '거래처관계기준' 과 '개별거래처기준' 둘이다.
          한 회사가 지점별로 거래처코드를 따로 쓰면 채권채무를 회사 단위로 봐야 하는데
          우리는 코드 단위로밖에 볼 수 없었다.
        */}
        <EcCond label="대표거래처로 합산">
          <div className="ec-pills">
            {(['개별거래처기준', '거래처관계기준'] as const).map((b) => (
              <button key={b} type="button" className={`ec-pill no-ec${basis === b ? ' active' : ''}`}
                      onClick={() => setBasis(b)}>{b}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="거래처" pick>
          <input className="ec-input" placeholder="거래처명 일부" value={partner}
                 onChange={(e) => setPartner(e.target.value)} style={{ width: 220 }} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        거래처 <b style={{ color: '#3c4553' }}>{ledger.length}</b>곳
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        이월 <b>{won(totals.opening)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        증가 <b style={{ color: 'var(--ec-blue)' }}>{won(totals.increase)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        감소 <b style={{ color: '#1c7c3c' }}>{won(totals.decrease)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        잔액 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{won(totals.closing)}</b>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 110 }}>일자</th>
            <th style={{ width: 170 }}>전표번호</th>
            <th style={{ width: 80, textAlign: 'center' }}>구분</th>
            <th>적요</th>
            <th style={{ width: 130, textAlign: 'right' }}>증가</th>
            <th style={{ width: 130, textAlign: 'right' }}>감소</th>
            <th style={{ width: 140, textAlign: 'right' }}>잔액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={COLS} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : ledger.length === 0 ? (
            <tr><td colSpan={COLS} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : ledger.map((p) => (
            <Fragment key={p.partnerId}>
              <tr style={{ background: '#f2f6fc', fontWeight: 700 }}>
                <td colSpan={4} style={{ color: 'var(--ec-blue-dark)' }}>{p.name}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>이월잔액</td>
                <td colSpan={2}></td>
                <td style={{ textAlign: 'right' }}>{won(p.opening)}</td>
              </tr>
              {p.rows.map((r, i) => (
                <Fragment key={r.entry.key}>
                  <tr>
                    <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                    <td style={{ fontFamily: 'monospace' }}>{r.entry.date}</td>
                    {/* 회계전표별로 묶으면 이 칸에 회계전표번호가 온다. 미반영 묶음은 눈에 띄게. */}
                    <td style={{
                      fontFamily: 'monospace',
                      color: r.entry.docNo === UNPOSTED ? '#c07a00' : '#5a626e',
                      fontWeight: r.entry.docNo === UNPOSTED ? 700 : undefined,
                    }}>{r.entry.docNo}</td>
                    <td style={{ textAlign: 'center', color: r.entry.increase > 0 ? 'var(--ec-blue)' : '#1c7c3c' }}>
                      {r.entry.kind}
                    </td>
                    <td style={{ color: '#8a929c' }}>
                      {r.entry.lines.length > 0
                        ? `${r.entry.lines[0].itemName}${r.entry.lines.length > 1 ? ` 외 ${r.entry.lines.length - 1}건` : ''}`
                        : ''}
                    </td>
                    <td style={{ textAlign: 'right', color: r.entry.increase ? 'var(--ec-blue)' : '#c9ced6' }}>
                      {r.entry.increase ? won(r.entry.increase) : ''}
                    </td>
                    <td style={{ textAlign: 'right', color: r.entry.decrease ? '#1c7c3c' : '#c9ced6' }}>
                      {r.entry.decrease ? won(r.entry.decrease) : ''}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(r.balance)}</td>
                  </tr>
                  {showDetail && r.entry.lines.map((l, li) => (
                    <tr key={`${r.entry.key}-${li}`} style={{ color: '#5a626e', fontSize: 12 }}>
                      <td></td>
                      <td colSpan={3} style={{ textAlign: 'right', color: '#9aa1ab' }}>└ {l.itemCode}</td>
                      <td>{l.itemName}</td>
                      <td style={{ textAlign: 'right' }}>{won(l.quantity)} × {won(l.unitPrice)}</td>
                      <td style={{ textAlign: 'right' }}>{won(l.supplyAmount)}</td>
                      <td></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr style={{ background: 'var(--ec-body-bg)', fontWeight: 700 }}>
                <td colSpan={5} style={{ textAlign: 'right' }}>{p.name} 소계</td>
                <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(p.increase)}</td>
                <td style={{ textAlign: 'right', color: '#1c7c3c' }}>{won(p.decrease)}</td>
                <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{won(p.closing)}</td>
              </tr>
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
            <td colSpan={5} style={{ textAlign: 'right' }}>합계 ({ledger.length}거래처)</td>
            <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.increase)}</td>
            <td style={{ textAlign: 'right', color: '#1c7c3c' }}>{won(totals.decrease)}</td>
            <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{won(totals.closing)}</td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
