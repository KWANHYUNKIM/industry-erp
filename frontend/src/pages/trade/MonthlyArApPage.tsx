import { useEffect, useMemo, useRef, useState } from 'react'
import { EcReportFoot, EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner, PurchaseDoc, SalesDoc } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { ymd } from '../../components/EcPeriodPicks'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { monthsBetween, partnerYearRows, type PartnerYearRow } from '../../utils/monthlyArAp'

/**
 * 영업관리 > 월별채권/채무증감내역 (이카운트 E040713·E040714)
 * 기준일자 기간(년/월 ~ 년/월)의 달마다 열을 두고, 거래처마다 다섯 줄(매출 · 수금 · 기타할인등차액 · 잔액 · 미회수액) + 끝 [누계].
 *  - 채권: 증가=매출(판매전표 합계), 감소=수금(정산 RECEIPT)
 *  - 채무: 증가=매입(구매전표 합계), 감소=지급(정산 PAYMENT)
 * 데이터는 GET /api/sales, /purchases, /settlements 를 그대로 집계(백엔드 무변경).
 * 이월잔액 = 기간 시작 전날까지의 누적 순잔액(서버 partner-balances).
 */

type Mode = 'AR' | 'AP'   // 채권 / 채무
type SettlementType = 'RECEIPT' | 'PAYMENT'
interface Settlement {
  id: number; type: SettlementType; typeName: string
  partnerId: number; partnerName: string; settleDate: string; amount: number
}

/** /ledger/partner-balances 한 줄 — 그 시점의 거래처별 채권·채무. */
interface Opening { partnerId: number; name: string; receivable: number; payable: number }

const won = (n: number) => n.toLocaleString('ko-KR')
/** 원본 기본 기간은 금월 하나(2026/10 ~ 2026/10). 달마다 열이 하나씩 선다. */
const thisMonth = () => ymd(new Date()).slice(0, 7)
/** 너무 긴 기간은 열이 화면을 덮는다 — 원본처럼 열은 달 수만큼 서되 상한을 둔다. */
const MAX_MONTHS = 24

/**
 * [미회수액] 달별 값 — 원본 월별채권증감내역 실측(2026-10-21, 2026/08~2026/10 · 거래처 32곳):
 * 앞 달 말 잔액이 양수면 그 묵은 채권은 수금이 먼저 깎고(오래된 것부터) 남은 것을 뺀다 → 그 달 잔액 − 남은 묵은 채권.
 * 이 값이 양수인 달만 적고(묵은 채권만 남았거나 0 이면 빈칸), 마지막 달은 잔액이 음수여도 그 잔액을 그대로 적는다.
 * 앞선 달의 음수 잔액은 적지 않는다. [누계] 줄은 거래처 값의 합. 채무 쪽도 같은 규칙(2026-10-22 월별채무증감내역 실측 · 줄 이름만 [미지급액] · 누계 08 77,490,600 · 09 87,352,100 · 10 -166,147,300).
 */
function unpaidByMonth(opening: number, inc: number[], dec: number[]): number[] {
  const out: number[] = []
  let prev = opening
  inc.forEach((_, i) => {
    const bal = prev + inc[i] - dec[i]
    const old = Math.max(prev, 0)
    const rest = old - Math.min(dec[i], old)
    let u = bal - rest
    if (i === inc.length - 1 && bal < 0) u = bal
    else if (u <= 0) u = 0
    out.push(u)
    prev = bal
  })
  return out
}

export default function MonthlyArApPage({ defaultMode = 'AR' }: { defaultMode?: Mode }) {
  /* 원본 [기준일자] 년/월 ~ 년/월 — 'YYYY-MM'. */
  const [fromYm, setFromYm] = useState<string>(thisMonth())
  const [toYm, setToYm] = useState<string>(thisMonth())
  /* 채권판 · 채무판은 메뉴가 갈라 준다(원본도 두 화면) — 화면 안 전환은 없다. */
  const mode: Mode = defaultMode
  const months = useMemo(() => monthsBetween(fromYm, toYm).slice(0, MAX_MONTHS), [fromYm, toYm])
  const rangeBad = !fromYm || !toYm || fromYm > toYm
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
      if (rangeBad) { setLoading(false); return }
      const [fy, fm] = fromYm.split('-').map(Number)
      const lastMonth = months[months.length - 1] ?? toYm
      const [ly, lm] = lastMonth.split('-').map(Number)
      const period = { from: `${fromYm}-01`, to: ymd(new Date(ly, lm, 0)) }
      const before = ymd(new Date(fy, fm - 1, 0))   // 기간 시작 전날
      const [s, b, st, pr, ob] = await Promise.all([
        api.get<SalesDoc[]>('/sales', { params: period }),
        api.get<PurchaseDoc[]>('/purchases', { params: period }),
        api.get<Settlement[]>('/settlements', { params: period }),
        api.get<Partner[]>('/partners'),
        api.get<Opening[]>('/ledger/partner-balances', { params: { asOf: before } })
          .catch(() => ({ data: [] as Opening[] })),
      ])
      setSales(s.data); setPurchases(b.data); setSettlements(st.data); setPartnerRows(pr.data)
      setOpenings(ob.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  /* 기간을 바꾸면 그 기간으로 다시 받는다(이월도 같이). */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [fromYm, toYm])

  /*
   * 거른 전표를 <b>한 번만</b> 고른다 - 달별 표와 거래처별 표가 같은 자료를 본다.
   * 갈라 두지 않으면 두 표가 서로 다른 조건으로 셀 수 있다.
   */
  const docs = useMemo(() => {
    // 증가/감소 소스: 채권=매출/수금, 채무=매입/지급
    /* 거래처를 고르면 <b>증가·감소 양쪽</b>을 같이 좁힌다 — 한쪽만 좁히면 잔액이 거짓말이 된다. */
    /*
     * 고른 거래처의 <b>id 집합</b>을 먼저 만든다(코드도움 값이 id 다 — 거래처명은 겹칠 수 있다).
     * [대표거래처로 합산]을 켜면 그 회사를 대표로 둔 거래처를 함께 넣는다.
     */
    const 고른id = new Set<number>()
    if (partner) {
      고른id.add(Number(partner))
      if (rollUp) for (const p of partnerRows) if (String(p.parentId) === partner) 고른id.add(p.id)
    }
    /*
     * 원본 [거래처그룹1] — 담당자와 같은 성질이다. 거래처 마스터에 붙는 값이라
     * 전표에서는 이름으로 잇는다. 하나뿐인 그룹에 원본의 '1' 을 붙인다(거래처등록과 같다).
     */
    const 그룹id = partnerGroup
      ? new Set(partnerRows.filter((p) => (p.partnerGroupName ?? '') === partnerGroup).map((p) => p.id))
      : null
    /* 담당자로 좁힐 때 쓸 거래처 id 집합. 거래처 마스터의 값이라 전표에서는 거래처 id 로 잇는다. */
    const 담당id = manager
      ? new Set(partnerRows.filter((p) => (p.manager ?? '') === manager).map((p) => p.id))
      : null
    const keep = (id: number) => {
      if (고른id.size && !고른id.has(id)) return false
      if (담당id && !담당id.has(id)) return false
      if (그룹id && !그룹id.has(id)) return false
      return true
    }
    /* 거래처 축을 세우려면 이름을 버리면 안 된다 - 원본 격자가 거래처별 두 줄이다. */
    const incDocs = mode === 'AR'
      ? sales.filter((d) => keep(d.partnerId)).map((d) => ({ date: d.saleDate, amt: d.totalAmount, name: d.partnerName ?? '' }))
      : purchases.filter((d) => keep(d.partnerId)).map((d) => ({ date: d.purchaseDate, amt: d.totalAmount, name: d.partnerName ?? '' }))
    const decType: SettlementType = mode === 'AR' ? 'RECEIPT' : 'PAYMENT'
    const decDocs = settlements.filter((s) => s.type === decType && keep(s.partnerId))
      .map((s) => ({ date: s.settleDate, amt: s.amount, name: s.partnerName ?? '' }))

    /*
     * 이월(서버가 낸 기초잔액)도 줄과 <b>같은 잣대</b>로 여기서 거른다 — 그 해에 거래가
     * 없던 거래처도 이월은 있을 수 있어서, '그 해 전표에 나온 거래처' 로 거르면 그런
     * 거래처의 이월이 조용히 빠진다. 다 거른 뒤라 셈(monthlyArAp)의 mine 은 전부 통과시킨다.
     */
    return { inc: incDocs, dec: decDocs, openings: openings.filter((b) => keep(b.partnerId)), mine: () => true }
  }, [sales, purchases, settlements, openings, mode, partner, manager, rollUp, partnerRows, partnerGroup])

  /**
   * 원본 격자 - <b>거래처별 × 달</b>. 우리는 온 회사를 달마다 한 줄로만 보여 주고 있어서
   * <b>어느 거래처가 그 달을 밀었는지</b>를 이 화면에서 볼 수가 없었다(조건으로 하나씩
   * 골라 보는 수밖에 없었다). 위 <code>rows</code> 와 같은 자료를 거래처로 갈라 센다.
   */
  /*
   * 거래처별 이월은 <b>서버가 낸 잔액에서만</b> 온다(2026-09-21 고침 — 전에는 전 해 전표를 접어
   * 냈는데 그런 전표가 더는 오지 않아 <b>늘 0</b> 이었다). 월별 합계와 늘 맞는지를
   * utils/monthlyArAp.test.ts 가 지킨다.
   */
  const byPartner = useMemo<PartnerYearRow[]>(() => {
    const codeOf = new Map(partnerRows.map((p) => [p.name, p.code]))
    return partnerYearRows(docs.inc, docs.dec, docs.openings, docs.mine, mode, months, (n) => codeOf.get(n) ?? '')
  }, [docs, partnerRows, months, mode])

  /** 담당자 목록은 거래처 마스터에 실제로 적힌 것만 — 없는 이름을 고르게 하지 않는다. */
  const managers = useMemo(
    () => [...new Set(partnerRows.map((p) => p.manager).filter(Boolean))] as string[], [partnerRows])

  /* 원본 [구분] 칸에 찍히는 글자 — 채권은 매출/수금, 채무는 매입/지급이다(실측). */
  const incWord = mode === 'AR' ? '매출' : '매입'
  const decWord = mode === 'AR' ? '수금' : '지급'
  const unpaidWord = mode === 'AR' ? '미회수액' : '미지급액'

  /* 달 열이 늘었다 줄었다 하는 표라 정적 검사로는 칸 수를 셀 수 없다 — 렌더된 표를 잰다. */
  const tableRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(tableRef, '월별채권/채무증감내역', [mode, fromYm, toYm, byPartner.length])
  const cols = 5 + months.length

  /* [누계] — 모든 거래처를 줄별로 더한 다섯 줄. 잔액 줄은 달 말 누적. */
  const total = useMemo(() => {
    const inc = months.map((_, i) => byPartner.reduce((n, r) => n + r.inc[i], 0))
    const dec = months.map((_, i) => byPartner.reduce((n, r) => n + r.dec[i], 0))
    const opening = byPartner.reduce((n, r) => n + r.opening, 0)
    const running: number[] = []
    let bal = opening
    months.forEach((_, i) => { bal += inc[i] - dec[i]; running[i] = bal })
    const unpaid = months.map((_, i) => byPartner.reduce((n, r) => n + unpaidByMonth(r.opening, r.inc, r.dec)[i], 0))
    return { inc, dec, opening, running, unpaid, closing: bal,
      sumInc: inc.reduce((n, v) => n + v, 0), sumDec: dec.reduce((n, v) => n + v, 0) }
  }, [byPartner, months])

  return (
    <EcListShell
      /*
        메뉴는 이 파일을 <b>두 이름</b>으로 부른다 — [월별채권증감내역]·[월별채무증감내역]
        (원본도 그렇다). 한 제목으로 눌러 두면 채무로 들어온 사람이 채권 화면에 온 줄 안다.
      */
      title={mode === 'AP' ? '월별채무증감내역' : '월별채권증감내역'}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <div className="flex items-center gap-[12px] mb-[10px] flex-wrap">
        <div className="flex items-center gap-[6px]">
          <span className="text-[12.5px] text-ec-text font-semibold">기준일자</span>
          <input type="month" className="ec-input" aria-label="기준일자 시작" value={fromYm}
                 onChange={(e) => setFromYm(e.target.value)} style={{ width: 130 }} />
          <span>~</span>
          <input type="month" className="ec-input" aria-label="기준일자 끝" value={toYm}
                 onChange={(e) => setToYm(e.target.value)} style={{ width: 130 }} />
        </div>
        {/* 원본 조건 [거래처] — 이름은 응답에 진작 실려 오는데 거를 수가 없었다. */}
        <div className="flex items-center gap-[6px]">
          <span className="text-[12.5px] text-ec-text font-semibold">거래처</span>
          <CodePickerField label="거래처" hideLabel width={180} emptyLabel="전체"
                           value={partner} onChange={setPartner} items={pickers.partners} />
        </div>
        {/* 원본 차례: 거래처 → <b>거래처그룹1</b> → [대표거래처로 합산] → [거래처관리담당자] (사본 실측). */}
        <div className="flex items-center gap-[6px]">
          <span className="text-[12.5px] text-ec-text font-semibold">거래처그룹1</span>
          <CodePickerField label="거래처그룹1" hideLabel width={150} emptyLabel="전체"
                           value={partnerGroup} onChange={setPartnerGroup}
                           items={pgroups.groupOptions.map((g) => ({ value: g, name: g }))} />
        </div>
        <label className="text-[12.5px] flex items-center gap-[4px]">
          <input type="checkbox" checked={rollUp} onChange={(e) => setRollUp(e.target.checked)} disabled={!partner} />
          <span style={{ color: partner ? undefined : '#a8b0ba' }}>대표거래처로 합산</span>
        </label>
        <div className="flex items-center gap-[6px]">
          <span className="text-[12.5px] text-ec-text font-semibold">거래처관리담당자</span>
          {/* 원본은 사람을 고르는 칸을 <b>코드도움</b>으로 둔다 — 거래처 칸과 같은 모양이다. */}
          <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                           value={manager} onChange={setManager}
                           items={managers.map((m) => ({ value: m, name: m }))} />
        </div>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {/*
        원본 격자(E040713): 거래처코드 · 거래처명 · 구분 · 이월잔액 · (기간의 달마다 한 열) · 잔액.

        <b>2026-09-21 에 자료가 있는 기간으로 다시 쟀다.</b> 2026-09-09 에는 그 회사 자료가 없어
        "원본은 [이월잔액]·[잔액]을 두 줄에 따로 두는데 아래 줄에 무엇이 드는지 못 읽었다" 고
        적고 두 칸을 합쳐 두었다. 2025/10~2026/09 로 열어 보니 거래처 하나가 <b>다섯 줄</b>이다:
        <b>매출 · 수금 · 기타할인등차액 · 잔액 · 미회수액</b>. 시작을 2026/05 로 당겨 앞선 매출을
        이월로 넣어 보니 <b>이월잔액은 [잔액] 줄에만</b> 서고(명현농장 26,400,000) 매출·수금 줄의
        이월 칸은 빈다. 끝의 [잔액] 열은 매출·수금 줄에서는 <b>기간의 합</b>, 잔액 줄에서는
        <b>기말 잔액</b>이다.

        <p>2026-10-21 묶음9: 조건을 [기준일자] 년/월 ~ 년/월 로 바꿔 고른 달만 열이 되게 하고,
        거래처마다 <b>다섯 줄</b>(매출 · 수금 · 기타할인등차액 · 잔액 · 미회수액)과 끝의 [누계] 다섯 줄을 그린다.
        <b>[기타할인등차액]</b>: 우리 정산은 수금·지급 두 갈래뿐이라 담을 자리가 없어 칸은 늘 빈다.
        <b>[미회수액]</b>: 2026-10-21 원본 실측으로 채웠다(unpaidByMonth). 채무도 같은 규칙 — 줄 이름 [미지급액].</p>
      */}
      <div className="overflow-x-auto" ref={tableRef}>
      {/*
        <b>출력물 격자</b>(index.css .ec-report) — 원본 실측값으로 맞췄다(2026-09-21).
        열 폭도 원본대로 박는다: <b>거래처코드 100 · 거래처명 115 · 구분 100 · 이월잔액 100 ·
        달마다 100 · 잔액 100px</b>, table-layout fixed, 표 폭은 그 합이다(원본 금월 판 615px =
        달 한 열. 달이 늘면 100px 씩 늘어난다).
        거래처 하나가 세 줄이라 줄무늬는 <b>덩어리마다</b> 건다(줄에 ec-stripe).
        원본은 숫자를 <b>검정</b>으로, 거래처 코드·이름을 <b>보통 굵기의 맑은 고딕</b>으로 찍는다 —
        예전의 파랑·갈색 숫자와 굵은 이름·고정폭 코드는 우리가 덧칠한 것이었다.
      */}
      <div className="ec-report-frame">
      <EcReportHead title={mode === 'AP' ? '월별채무증감내역' : '월별채권증감내역'}
                    period={reportPeriod(`${fromYm}-01`, ymd(new Date(Number(toYm.slice(0, 4)), Number(toYm.slice(5, 7)), 0)))} />
      <table className="text-left ec-report ec-report-fixed">
        <thead>
          <tr>
            <th className="w-[100px]">거래처코드</th>
            <th className="w-[115px]">거래처명</th>
            <th className="w-[100px]">구분</th>
            <th className="text-right w-[100px]">이월잔액</th>
            {months.map((ym) => (
              <th key={ym} className="text-right w-[100px]">{ym.replace('-', '/')}</th>
            ))}
            <th className="text-right w-[100px]">잔액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={cols} className="ec-empty">불러오는 중…</td></tr>
          ) : rangeBad ? (
            <tr><td colSpan={cols} className="ec-empty">기준일자의 시작 년/월이 끝보다 늦습니다.</td></tr>
          ) : byPartner.length === 0 ? (
            <tr><td colSpan={cols} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : [...byPartner.flatMap((r, ri) => {
            /*
             * <b>줄마다 [이월잔액]·[잔액] 칸의 뜻이 다르다</b> — 2026-09-21 원본 실측.
             * 매출·수금 줄은 이월이 비고 끝 칸이 <b>그 기간의 합</b>이다. 이월과 기말 잔액은 [잔액] 줄에 선다.
             */
            const sumInc = r.inc.reduce((s, v) => s + v, 0)
            const sumDec = r.dec.reduce((s, v) => s + v, 0)
            /* [잔액] 줄 — 달마다 <b>그 달 말의 누적 잔액</b>이다. 0 인 달은 원본처럼 비운다. */
            const running: number[] = []
            let bal = r.opening
            months.forEach((_, i) => { bal += r.inc[i] - r.dec[i]; running[i] = bal })
            /* 원본은 거래처 덩어리마다 번갈아 회색이다(경지양돈 덩어리가 rgb(243,243,243)). */
            const stripe = ri % 2 === 1 ? 'ec-stripe' : undefined
            const unpaid = unpaidByMonth(r.opening, r.inc, r.dec)
            const blank = (key: string) => (
              <tr key={`${r.name}-${key}`} className={stripe}>
                <td>{key === 'etc' ? '기타할인등차액' : unpaidWord}</td>
                <td className="text-right" />
                {months.map((ym) => <td key={ym} className="text-right" />)}
                <td className="text-right" />
              </tr>
            )
            return [
              <tr key={`${r.name}-inc`} className={stripe}>
                <td rowSpan={5}>{r.code}</td>
                <td rowSpan={5}>{r.name}</td>
                <td>{incWord}</td>
                <td className="text-right" />
                {months.map((ym, i) => (
                  <td key={ym} className="text-right">{r.inc[i] ? won(r.inc[i]) : ''}</td>
                ))}
                <td className="text-right">{sumInc ? won(sumInc) : ''}</td>
              </tr>,
              <tr key={`${r.name}-dec`} className={stripe}>
                <td>{decWord}</td>
                <td className="text-right" />
                {months.map((ym, i) => (
                  <td key={ym} className="text-right">{r.dec[i] ? won(r.dec[i]) : ''}</td>
                ))}
                <td className="text-right">{sumDec ? won(sumDec) : ''}</td>
              </tr>,
              blank('etc'),
              <tr key={`${r.name}-bal`} className={stripe}>
                <td>잔액</td>
                <td className="text-right">{r.opening ? won(r.opening) : ''}</td>
                {months.map((ym, i) => (
                  <td key={ym} className="text-right">{running[i] ? won(running[i]) : ''}</td>
                ))}
                <td className="text-right">{r.closing ? won(r.closing) : ''}</td>
              </tr>,
              <tr key={`${r.name}-unpaid`} className={stripe}>
                <td>{unpaidWord}</td>
                <td className="text-right" />
                {months.map((ym, i) => <td key={ym} className="text-right">{unpaid[i] ? won(unpaid[i]) : ''}</td>)}
                <td className="text-right" />
              </tr>,
            ]
          }),
          /* 끝 [누계] — colspan 2 · rowspan 5, 거래처 전체를 줄별로 더한 다섯 줄. */
          <tr key="total-inc">
            <td colSpan={2} rowSpan={5}>[누계]</td>
            <td>{incWord}</td>
            <td className="text-right" />
            {months.map((ym, i) => <td key={ym} className="text-right">{total.inc[i] ? won(total.inc[i]) : ''}</td>)}
            <td className="text-right">{total.sumInc ? won(total.sumInc) : ''}</td>
          </tr>,
          <tr key="total-dec">
            <td>{decWord}</td>
            <td className="text-right" />
            {months.map((ym, i) => <td key={ym} className="text-right">{total.dec[i] ? won(total.dec[i]) : ''}</td>)}
            <td className="text-right">{total.sumDec ? won(total.sumDec) : ''}</td>
          </tr>,
          <tr key="total-etc">
            <td>기타할인등차액</td>
            <td className="text-right" />
            {months.map((ym) => <td key={ym} className="text-right" />)}
            <td className="text-right" />
          </tr>,
          <tr key="total-bal">
            <td>잔액</td>
            <td className="text-right">{total.opening ? won(total.opening) : ''}</td>
            {months.map((ym, i) => <td key={ym} className="text-right">{total.running[i] ? won(total.running[i]) : ''}</td>)}
            <td className="text-right">{total.closing ? won(total.closing) : ''}</td>
          </tr>,
          <tr key="total-unpaid">
            <td>{unpaidWord}</td>
            <td className="text-right" />
            {months.map((ym, i) => <td key={ym} className="text-right">{total.unpaid[i] ? won(total.unpaid[i]) : ''}</td>)}
            <td className="text-right" />
          </tr>]}
        </tbody>
      </table>
      <EcReportFoot />
      </div>
      </div>
    </EcListShell>
  )
}
