import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner, PurchaseDoc, SalesDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { ymd } from '../../components/EcPeriodPicks'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

/**
 * 영업관리 > 월별채권/채무증감내역 (이카운트 E040713·E040714)
 * 연도별 12개월의 전월이월·증가·감소·당월잔액을 채권/채무로 나눠 본다.
 *  - 채권: 증가=매출(판매전표 합계), 감소=수금(정산 RECEIPT)
 *  - 채무: 증가=매입(구매전표 합계), 감소=지급(정산 PAYMENT)
 * 데이터는 GET /api/sales, /purchases, /settlements 를 그대로 집계(백엔드 무변경).
 * 전월이월(1월) = 해당 연도 시작 이전까지의 누적 순잔액.
 */

type Mode = 'AR' | 'AP'   // 채권 / 채무
type SettlementType = 'RECEIPT' | 'PAYMENT'
interface Settlement {
  id: number; type: SettlementType; typeName: string
  partnerId: number; partnerName: string; settleDate: string; amount: number
}

/** /ledger/partner-balances 한 줄 — 그 시점의 거래처별 채권·채무. */
interface Opening { partnerId: number; name: string; receivable: number; payable: number }

interface MonthRow { month: number; opening: number; increase: number; decrease: number; closing: number }

/**
 * 원본 격자 한 덩어리(2026-09-09 E040713 실측):
 * <b>거래처코드 · 거래처명 · 구분 · 이월잔액 · (기간의 달마다 한 열) · 잔액</b>.
 * 거래처 하나가 <b>두 줄</b>을 쓴다 - [매출]/[수금](채무면 [매입]/[지급]).
 */
interface PartnerYearRow {
  code: string
  name: string
  opening: number
  inc: number[]
  dec: number[]
  closing: number
}

const won = (n: number) => n.toLocaleString('ko-KR')
/** 원본은 기간의 달마다 열을 하나씩 둔다. 우리 기간은 한 해라 열둘이다. */
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const thisYear = () => Number(ymd(new Date()).slice(0, 4))
const ym = (d: string) => ({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) })

export default function MonthlyArApPage({ defaultMode = 'AR' }: { defaultMode?: Mode }) {
  const [year, setYear] = useState<number>(thisYear())
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /*
   * 원본 조건 <b>[거래처]</b>. 이 표는 온 회사의 채권을 달마다 더해 보여 주는데,
   * <b>어느 거래처가 그 달을 밀었는지</b>는 볼 수가 없었다 — 이름은 판매·구매·정산
   * 응답에 진작 실려 온다(하네스가 SalesResponse 에 partnerName 이 있다고 짚어 줬다).
   */
  const [partner, setPartner] = useState('')
  /** 원본 [거래처그룹1] — 거래처 마스터에서 잇는다(하나뿐인 그룹에 원본의 1 을 붙인다). */
  const pgroups = usePartnerGroups()
  const [partnerGroup, setPartnerGroup] = useState('')
  /**
   * 원본 조건 <b>[거래처관리담당자]</b>. 받을 돈을 나눠 맡는 곳에서는 "내가 맡은 곳이
   * 이 달을 얼마나 밀었나" 가 이 표를 여는 이유다. 담당자는 <b>거래처 마스터</b>에 붙어
   * 있고 전표에는 없어서, 거래처 목록을 받아 이름으로 이어 붙인다.
   */
  const [manager, setManager] = useState('')
  /**
   * 원본 조건 <b>[대표거래처로 합산]</b>. 거래처를 하나 골랐을 때 그 회사의 <b>지점·사업장</b>
   * 것까지 같이 센다. 본사로 청구하는 곳이면 지점별로 갈린 표는 읽을 수가 없다.
   * 원본과 같이 기본은 꺼 둔다.
   */
  const [rollUp, setRollUp] = useState(false)
  const [partnerRows, setPartnerRows] = useState<Partner[]>([])
  /** 그 해 시작 <b>전날까지</b>의 잔액 — 이것이 1월의 [전월이월]이다. 서버가 낸다. */
  const [openings, setOpenings] = useState<Opening[]>([])
  const pickers = useCondPickers(['partners'])

  async function load() {
    setLoading(true); setError('')
    try {
      /*
       * <b>전표는 그 해만 받고, [전월이월]은 서버가 낸다.</b>
       *
       * <p>여태 전표를 통째로 받아 <code>ym(d.date).y &lt; year</code> 인 것을 접어
       * 이월을 냈다. 거래처원장에서 같은 자리를 풀었고(2026-09-10),
       * <code>/ledger/partner-balances?asOf=</code> 가 그 값을 그대로 낸다 —
       * 자료로 맞대어 봤다: 2027년 1월 이월을 거래처 일곱에서 채권·채무 모두
       * <b>다른 것이 하나도 없었다</b>(채권합 26,440,090 · 채무합 12,427,701).
       */
      const period = { from: `${year}-01-01`, to: `${year}-12-31` }
      const [s, b, st, pr, ob] = await Promise.all([
        api.get<SalesDoc[]>('/sales', { params: period }),
        api.get<PurchaseDoc[]>('/purchases', { params: period }),
        api.get<Settlement[]>('/settlements', { params: period }),
        api.get<Partner[]>('/partners'),
        api.get<Opening[]>('/ledger/partner-balances', { params: { asOf: `${year - 1}-12-31` } })
          .catch(() => ({ data: [] as Opening[] })),
      ])
      setSales(s.data); setPurchases(b.data); setSettlements(st.data); setPartnerRows(pr.data)
      setOpenings(ob.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  /* 해를 바꾸면 그 해로 다시 받는다(이월도 같이). */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [year])
  // 채권판·채무판이 같은 컴포넌트를 쓰므로 메뉴를 갈아타도 다시 마운트되지 않는다 — 값을 따라가게 한다.
  useEffect(() => { setMode(defaultMode) }, [defaultMode])

  /*
   * 거른 전표를 <b>한 번만</b> 고른다 - 달별 표와 거래처별 표가 같은 자료를 본다.
   * 갈라 두지 않으면 두 표가 서로 다른 조건으로 셀 수 있다.
   */
  const docs = useMemo(() => {
    // 증가/감소 소스: 채권=매출/수금, 채무=매입/지급
    /* 거래처를 고르면 <b>증가·감소 양쪽</b>을 같이 좁힌다 — 한쪽만 좁히면 잔액이 거짓말이 된다. */
    /*
     * 고른 거래처의 <b>이름 집합</b>을 먼저 만든다. [대표거래처로 합산]을 켜면 그 회사를
     * 대표로 둔 거래처의 이름을 함께 넣는다 — 전표는 이름으로만 이어져 있어서다.
     */
    const 고른이름 = new Set<string>()
    if (partner) {
      고른이름.add(partner)
      if (rollUp) {
        const 머리 = partnerRows.find((p) => p.name === partner)
        if (머리) for (const p of partnerRows) if (p.parentId === 머리.id) 고른이름.add(p.name)
      }
    }
    /*
     * 원본 [거래처그룹1] — 담당자와 같은 성질이다. 거래처 마스터에 붙는 값이라
     * 전표에서는 이름으로 잇는다. 하나뿐인 그룹에 원본의 '1' 을 붙인다(거래처등록과 같다).
     */
    const 그룹이름 = partnerGroup
      ? new Set(partnerRows.filter((p) => (p.partnerGroupName ?? '') === partnerGroup).map((p) => p.name))
      : null
    /* 담당자로 좁힐 때 쓸 이름 집합. 거래처 마스터의 값이라 전표에서는 이름으로 잇는다. */
    const 담당이름 = manager
      ? new Set(partnerRows.filter((p) => (p.manager ?? '') === manager).map((p) => p.name))
      : null
    const mine = (name: string | null | undefined) => {
      const n = name ?? ''
      if (고른이름.size && !고른이름.has(n)) return false
      if (담당이름 && !담당이름.has(n)) return false
      if (그룹이름 && !그룹이름.has(n)) return false
      return true
    }
    /* 거래처 축을 세우려면 이름을 버리면 안 된다 - 원본 격자가 거래처별 두 줄이다. */
    const incDocs = mode === 'AR'
      ? sales.filter((d) => mine(d.partnerName)).map((d) => ({ date: d.saleDate, amt: d.totalAmount, name: d.partnerName ?? '' }))
      : purchases.filter((d) => mine(d.partnerName)).map((d) => ({ date: d.purchaseDate, amt: d.totalAmount, name: d.partnerName ?? '' }))
    const decType: SettlementType = mode === 'AR' ? 'RECEIPT' : 'PAYMENT'
    const decDocs = settlements.filter((s) => s.type === decType && mine(s.partnerName))
      .map((s) => ({ date: s.settleDate, amt: s.amount, name: s.partnerName ?? '' }))

    /*
     * <b>거르는 잣대를 함께 낸다.</b> 이월(서버가 낸 기초잔액)도 줄과 <b>같은 잣대</b>로
     * 걸러야 한다 — 그 해에 거래가 없던 거래처도 이월은 있을 수 있어서,
     * '그 해 전표에 나온 이름' 으로 거르면 그런 거래처의 이월이 조용히 빠진다.
     */
    return { inc: incDocs, dec: decDocs, mine }
  }, [sales, purchases, settlements, mode, partner, manager, rollUp, partnerRows, partnerGroup])

  const rows = useMemo<MonthRow[]>(() => {
    /*
     * 연초 이전 누적 순잔액 = 전월이월(1월). <b>서버가 낸 잔액</b>을 쓴다.
     * 거르는 잣대는 줄과 <b>같아야 한다</b> — 아래 docs 가 거래처 이름으로 걸렀으니
     * 이월도 같은 이름 집합으로 거른다. 안 그러면 이월만 남의 거래처를 품는다.
     */
    const opening = openings
      .filter((b) => docs.mine(b.name))
      .reduce((n, b) => n + (mode === 'AR' ? b.receivable : b.payable), 0)

    const inc = new Array(13).fill(0)
    const dec = new Array(13).fill(0)
    for (const d of docs.inc) { const { y, m } = ym(d.date); if (y === year && m >= 1 && m <= 12) inc[m] += d.amt }
    for (const d of docs.dec) { const { y, m } = ym(d.date); if (y === year && m >= 1 && m <= 12) dec[m] += d.amt }

    const out: MonthRow[] = []
    let carry = opening
    for (let m = 1; m <= 12; m++) {
      const closing = carry + inc[m] - dec[m]
      out.push({ month: m, opening: carry, increase: inc[m], decrease: dec[m], closing })
      carry = closing
    }
    return out
  }, [docs, year])

  /**
   * 원본 격자 - <b>거래처별 × 달</b>. 우리는 온 회사를 달마다 한 줄로만 보여 주고 있어서
   * <b>어느 거래처가 그 달을 밀었는지</b>를 이 화면에서 볼 수가 없었다(조건으로 하나씩
   * 골라 보는 수밖에 없었다). 위 <code>rows</code> 와 같은 자료를 거래처로 갈라 센다.
   */
  const byPartner = useMemo<PartnerYearRow[]>(() => {
    const codeOf = new Map(partnerRows.map((p) => [p.name, p.code]))
    const m = new Map<string, PartnerYearRow>()
    const seat = (name: string) => {
      let r = m.get(name)
      if (!r) {
        r = { code: codeOf.get(name) ?? '', name, opening: 0,
          inc: new Array(13).fill(0), dec: new Array(13).fill(0), closing: 0 }
        m.set(name, r)
      }
      return r
    }
    for (const d of docs.inc) {
      const r = seat(d.name); const { y, mo } = { y: Number(d.date.slice(0, 4)), mo: Number(d.date.slice(5, 7)) }
      if (y < year) r.opening += d.amt
      else if (y === year) r.inc[mo] += d.amt
    }
    for (const d of docs.dec) {
      const r = seat(d.name); const { y, mo } = { y: Number(d.date.slice(0, 4)), mo: Number(d.date.slice(5, 7)) }
      if (y < year) r.opening -= d.amt
      else if (y === year) r.dec[mo] += d.amt
    }
    const out = [...m.values()]
    for (const r of out) {
      r.closing = r.opening
      for (let i = 1; i <= 12; i++) r.closing += r.inc[i] - r.dec[i]
    }
    /* 그 해에 아무 일도 없고 이월도 0 인 거래처는 줄을 만들지 않는다. */
    return out.filter((r) => r.opening !== 0 || r.closing !== 0
        || r.inc.some(Boolean) || r.dec.some(Boolean))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  }, [docs, partnerRows, year])

  /** 담당자 목록은 거래처 마스터에 실제로 적힌 것만 — 없는 이름을 고르게 하지 않는다. */
  const managers = useMemo(
    () => [...new Set(partnerRows.map((p) => p.manager).filter(Boolean))] as string[], [partnerRows])

  const totals = useMemo(() => rows.reduce((s, r) => ({ inc: s.inc + r.increase, dec: s.dec + r.decrease }), { inc: 0, dec: 0 }), [rows])
  const closing = rows.length ? rows[rows.length - 1].closing : 0
  const years = [thisYear() + 1, thisYear(), thisYear() - 1, thisYear() - 2]
  const incLabel = mode === 'AR' ? '매출(증가)' : '매입(증가)'
  const decLabel = mode === 'AR' ? '수금(감소)' : '지급(감소)'
  /* 원본 [구분] 칸에 찍히는 글자 — 채권은 매출/수금, 채무는 매입/지급이다(실측). */
  const incWord = mode === 'AR' ? '매출' : '매입'
  const decWord = mode === 'AR' ? '수금' : '지급'

  /* 달 열이 늘었다 줄었다 하는 표라 정적 검사로는 칸 수를 셀 수 없다 — 렌더된 표를 잰다. */
  const tableRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(tableRef, '월별채권/채무증감내역', [mode, year, byPartner.length])
  const incColor = 'var(--ec-blue)'
  const decColor = '#a5561b'

  return (
    <EcListShell
      /*
        메뉴는 이 파일을 <b>두 이름</b>으로 부른다 — [월별채권증감내역]·[월별채무증감내역]
        (원본도 그렇다). 한 제목으로 눌러 두면 채무로 들어온 사람이 채권 화면에 온 줄 안다.
      */
      title={mode === 'AP' ? '월별채무증감내역' : '월별채권증감내역'}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">
        채권=매출−수금, 채무=매입−지급. 전월이월(1월) = 해당 연도 시작 이전 누적 순잔액.
        {settlements.length === 0 && ' (정산 데이터가 없어 감소=0으로 표시됩니다.)'}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>연도</span>
          <select className="ec-input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }}>
            {years.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
        </div>
        {/* 원본 조건 [거래처] — 이름은 응답에 진작 실려 오는데 거를 수가 없었다. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>거래처</span>
          <CodePickerField label="거래처" hideLabel width={180} emptyLabel="전체"
                           value={partner} onChange={setPartner} items={pickers.partners} />
        </div>
        {/* 원본 차례: 거래처 → <b>거래처그룹1</b> → [대표거래처로 합산] → [거래처관리담당자] (사본 실측). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>거래처그룹1</span>
          <CodePickerField label="거래처그룹1" hideLabel width={150} emptyLabel="전체"
                           value={partnerGroup} onChange={setPartnerGroup}
                           items={pgroups.groupOptions.map((g) => ({ value: g, name: g }))} />
        </div>
        <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={rollUp} onChange={(e) => setRollUp(e.target.checked)} disabled={!partner} />
          <span style={{ color: partner ? undefined : '#a8b0ba' }}>대표거래처로 합산</span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>거래처관리담당자</span>
          {/* 원본은 사람을 고르는 칸을 <b>코드도움</b>으로 둔다 — 거래처 칸과 같은 모양이다. */}
          <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                           value={manager} onChange={setManager}
                           items={managers.map((m) => ({ value: m, name: m }))} />
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['AR', 'AP'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className="no-ec" style={{
              padding: '5px 14px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: mode === m ? 'var(--ec-blue)' : '#fff', color: mode === m ? '#fff' : '#3a4453', fontWeight: mode === m ? 700 : 400,
            }}>{m === 'AR' ? '채권(받을 돈)' : '채무(줄 돈)'}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          연말잔액 <b style={{ color: closing >= 0 ? 'var(--ec-blue-dark)' : '#c60a2e', fontSize: 15 }}>{won(closing)}</b>
        </div>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/*
        원본 격자(2026-09-09 E040713 실측): 거래처코드 · 거래처명 · 구분 · 이월잔액 ·
        (기간의 달마다 한 열) · 잔액. 거래처 하나가 <b>두 줄</b>을 쓴다.
        원본은 [이월잔액]·[잔액]을 두 줄에 따로 두는데, 이 회사에 자료가 없어
        <b>아래 줄에 무엇이 들어가는지 못 읽었다</b> — 지어내지 않고 두 줄을 합쳐 둔다
        (합친 칸은 틀릴 수가 없다).
      */}
      <div className="overflow-x-auto" ref={tableRef}>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 110 }}>거래처코드</th>
            <th style={{ minWidth: 140 }}>거래처명</th>
            <th style={{ width: 70 }}>구분</th>
            <th style={{ textAlign: 'right', width: 120 }}>이월잔액</th>
            {MONTHS.map((mo) => (
              <th key={mo} style={{ textAlign: 'right', width: 110 }}>{year}/{String(mo).padStart(2, '0')}</th>
            ))}
            <th style={{ textAlign: 'right', width: 130 }}>잔액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={16} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : byPartner.length === 0 ? (
            <tr><td colSpan={16} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : byPartner.flatMap((r) => [
            <tr key={`${r.name}-inc`}>
              <td rowSpan={2} style={{ fontFamily: 'monospace' }}>{r.code}</td>
              <td rowSpan={2} style={{ fontWeight: 600 }}>{r.name}</td>
              <td>{incWord}</td>
              <td rowSpan={2} style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.opening)}</td>
              {MONTHS.map((mo) => (
                <td key={mo} style={{ textAlign: 'right', color: r.inc[mo] ? incColor : '#c5cbd3' }}>
                  {r.inc[mo] ? won(r.inc[mo]) : ''}
                </td>
              ))}
              <td rowSpan={2} style={{ textAlign: 'right', fontWeight: 700 }}>{won(r.closing)}</td>
            </tr>,
            <tr key={`${r.name}-dec`}>
              <td>{decWord}</td>
              {MONTHS.map((mo) => (
                <td key={mo} style={{ textAlign: 'right', color: r.dec[mo] ? decColor : '#c5cbd3' }}>
                  {r.dec[mo] ? won(r.dec[mo]) : ''}
                </td>
              ))}
            </tr>,
          ])}
        </tbody>
      </table>
      </div>

      {/*
        아래는 원본에 없다 — 온 회사를 달마다 한 줄로 접은 <b>우리가 더 두는 표</b>다.
        위 표가 거래처별로 갈리므로 "이 달에 통틀어 얼마" 는 여기서 본다.
      */}
      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>월별 합계</h3>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 70 }}>월</th>
            <th style={{ textAlign: 'right' }}>전월이월</th>
            <th style={{ textAlign: 'right' }}>{incLabel}</th>
            <th style={{ textAlign: 'right' }}>{decLabel}</th>
            <th style={{ textAlign: 'right' }}>당월잔액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.map((r) => (
            <tr key={r.month}>
              <td style={{ fontWeight: 600 }}>{r.month}월</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.opening)}</td>
              <td style={{ textAlign: 'right', color: r.increase ? incColor : '#c5cbd3', fontWeight: r.increase ? 600 : 400 }}>{r.increase ? won(r.increase) : ''}</td>
              <td style={{ textAlign: 'right', color: r.decrease ? decColor : '#c5cbd3', fontWeight: r.decrease ? 600 : 400 }}>{r.decrease ? won(r.decrease) : ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(r.closing)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td>연간합계</td>
            <td></td>
            <td style={{ textAlign: 'right', color: incColor }}>{won(totals.inc)}</td>
            <td style={{ textAlign: 'right', color: decColor }}>{won(totals.dec)}</td>
            <td style={{ textAlign: 'right' }}>{won(closing)}</td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
