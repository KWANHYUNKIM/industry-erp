import { Fragment, useEffect, useMemo, useState } from 'react'
import { ModalWindow } from '../../components/Modal'
import { useSearchParams } from 'react-router-dom'
import { groupKeyOf, UNPOSTED } from '../../utils/ledgerGroup'
import { rollupOf, toRollupMap, type LedgerBasis, type RollupPartner } from '../../utils/partnerRollup'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner } from '../../types/api'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { dateText } from '../../utils/dateText'
import { useRequired } from '../../utils/useRequired'
import TradeEntry from './TradeEntry'
import { ecAlert } from '../../components/EcDialog'
import { ymd } from '../../utils/periods'
import { fmtAmount } from '../../utils/format'

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


interface Line { itemCode: string; itemName: string; spec?: string | null; quantity: number; unitPrice: number; supplyAmount: number; vatAmount?: number }
interface SalesDoc { id: number; docNo: string; saleDate: string; partnerId: number; partnerName: string; totalAmount: number; returnSlip?: boolean; lines: Line[] }
interface PurchaseDoc { id: number; docNo: string; purchaseDate: string; partnerId: number; partnerName: string; totalAmount: number; returnSlip?: boolean; lines: Line[] }
interface Settlement { id: number; docNo: string; settleDate: string; partnerId: number; partnerName: string; type: 'RECEIPT' | 'PAYMENT'; amount: number; method?: string | null; note?: string | null }
/** 회계반영 목록의 한 줄 — 전표 id 와 그 전표가 만든 회계전표번호. */
interface Posted { id: number; journalDocNo: string | null }

/** 대장 한 줄. 증가/감소는 채권·채무 어느 쪽 대장이냐에 따라 뜻이 갈린다. */
interface Entry {
  key: string
  partnerId: number
  partnerName: string
  date: string
  docNo: string
  /** 반품 전표는 금액이 음수라 증가 열에 −로 선다 — 구분도 반품이라 적어야 왜 줄었는지 보인다(26회차). */
  kind: '판매' | '판매반품' | '구매' | '구매반품' | '수금' | '지급'
  side: '채권' | '채무'
  increase: number
  decrease: number
  lines: Line[]
  /** 이 전표가 만든 회계전표 번호. 아직 반영 안 했으면 null. */
  journalDocNo: string | null
  /**
   * 수금·지급의 적요 — 결제수단과 사람이 적은 비고. 판매·구매는 품목으로 적요를 대신해
   * 수금 줄만 늘 비어 있었다(23회차, "SN-… 1차 수금" 이라 적어도 대장에 안 보였다).
   */
  memo?: string
}


/** 그 날의 <b>하루 전</b>. 이월은 기간 시작 <b>전날</b>까지의 잔액이다. */
const dayBefore = (d: string) => {
  if (!d) return d
  const t = new Date(`${d}T00:00:00`)
  t.setDate(t.getDate() - 1)
  return ymd(t)
}

export default function PartnerLedgerPage({ side: fixedSide = 'BOTH' }: { side?: 'AR' | 'AP' | 'BOTH' }) {
  const title = fixedSide === 'AR' ? '거래처관리대장1(채권)'
    : fixedSide === 'AP' ? '거래처관리대장1(채무)' : '거래처관리대장'

  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */

  const pickers = useCondPickers(['partners'])

  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  /**
   * <b>기간 앞까지의 잔액</b> — 서버가 낸다(/ledger/partner-balances?asOf=). 이 값이
   * 화면의 [이월]이 된다. 예전에는 기간 앞 전표를 다 받아 접었는데, 그러려고
   * 전표를 통째로 받아야 했다.
   */
  const [openings, setOpenings] = useState<{ partnerId: number; receivable: number; payable: number }[]>([])
  /** 전표 id → 그 전표가 만든 회계전표번호. 반영 안 한 전표는 아예 없다. */
  const [postedSales, setPostedSales] = useState<Map<number, string>>(new Map())
  const [postedPurchases, setPostedPurchases] = useState<Map<number, string>>(new Map())
  const [postedSettles, setPostedSettles] = useState<Map<number, string>>(new Map())
  /** 원본 [대표거래처로 합산]에 쓰는 거래처 관계. id → 대표거래처. */
  const [rollup, setRollup] = useState<Map<number, RollupPartner>>(new Map())
  /** 원본 대장 I 머리말이 찍는 거래처 등록 정보. */
  const [partnerInfo, setPartnerInfo] = useState<Map<number, Partner>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 원본 기본값이 '전월+금월' 이다 — 대장은 지난달 잔액이 이번 달로 어떻게 넘어왔는지 같이 본다.
  const base = periodOf('전월+금월')!
  /* 거래처관리대장1(채권·채무)은 원본 기본 기간이 전월 1일 ~ 오늘(2026-10-20 실측)이다 — 공용 periodOf 는 말일까지라 여기서만 오늘로 끊는다. */
  const today = ymd(new Date())
  const init = fixedSide === 'BOTH' ? base : { ...base, to: today }
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [side, setSide] = useState<Side>(fixedSide === 'AR' ? '채권' : fixedSide === 'AP' ? '채무' : '전체')
  /*
   * <b>2026-09-09 원본(E040723) 실측 — 열릴 때 눌려 있는 것은 [전표별]이 아니라
   * [전표별+내역] 이다.</b> 우리는 [전표별] 로 열어서, 대장을 열면 전표 한 줄씩만 보이고
   * <b>그 전표에 무엇이 들었는지</b>는 구분을 바꿔야 나왔다. 대장을 보는 까닭이
   * "이 금액이 어디서 왔나" 인데 그 줄이 처음부터 접혀 있었던 셈이다.
   *
   * <p>같이 잰 것: [기준일자] 기본 <b>전월+금월</b>(맞다) · [대표거래처로 합산] 기본
   * <b>거래처관계기준</b>(맞다) · [거래처계층그룹]의 <b>하위그룹포함검색</b>이 켜진 채로 열린다.
   */
  const [group, setGroup] = useState<Group>('전표별+내역')
  /**
   * 원본 [대표거래처로 합산] — '거래처관계기준' 이면 지점·사업장 채권채무를 대표 밑으로 모은다.
   *
   * <p>기본은 <b>거래처관계기준</b>이다. "원본과 같이 개별거래처기준" 이라 적혀 있었으나
   * 대조표는 반대로 적고 있다 — qa/fixtures/ecount-radio-options.json 의
   * `거래처관리대장 I.MainCustFlag` 가 <b>["*거래처관계기준", "개별거래처기준"]</b> 이고
   * `*` 가 원본에서 눌린 채로 열리는 쪽이다. 채권현황·거래처별채권도 같은 값이다.
   */
  const [basis, setBasis] = useState<LedgerBasis>('거래처관계기준')
  /**
 * 거래처중심입력에서 넘어올 때 <b>그 거래처를 물고</b> 열린다(?partnerId=거래처id).
 * 코드도움 값이 id 라서 이름이 아니라 id 로 문다 — 이름은 겹칠 수 있다.
 * 허브에서 골라 놓고 넘어왔는데 전체 목록이 나오면 다시 거르게 되고,
 * 그러면 허브가 있으나 마나다.
 */
  const [searchParams] = useSearchParams()
  const [partner, setPartner] = useState(searchParams.get('partnerId') ?? '')
  /**
   * 거래처관리대장1(채권·채무)은 원본 <b>[거래처] 필수</b> — 비운 채 검색하면 칸에 빨간 테두리가 서고
   * 결과는 없다(E040723 실측 2026-10-20). 거래처 없이 전 거래처를 펼치던 것은 '거래처관리대장' 한 화면(BOTH)에만 남는다.
   */
  const oneSided = fixedSide !== 'BOTH'
  const req = useRequired()
  const search = () => {
    if (oneSided && !req.check({ partner: !!partner })) return
    load()
  }
  /** 원본 [거래처그룹1] — 거래처 마스터에서 잇는다(하나뿐인 그룹에 원본의 1 을 붙인다). */
  const pgroups = usePartnerGroups()
  const [partnerGroup, setPartnerGroup] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const period: Record<string, string> = {}
      if (from) period.from = from
      if (to) period.to = to
      const [s, p, t, ob, js, jp, jt, pt] = await Promise.all([
        /*
         * <b>전표는 기간만 받고, [이월]은 서버가 낸다.</b>
         *
         * <p>2026-09-10 에 기간만 보내 보고 한 번 되돌렸다 — 이 화면은 이월을
         * <code>e.date &lt; from</code> 인 전표로 냈기 때문에, 기간 밖을 안 받으면
         * 이월이 통째로 0이 되어 잔액이 딴 숫자가 됐다(합계가 39,041,591 →
         * 3,093,090). 그때 "서버가 기초잔액을 내주는 것이 먼저다" 라고 적었고,
         * 이번에 그 자리를 <code>/ledger/partner-balances?asOf=</code> 로 이었다.
         *
         * <p><b>두 방식이 같은 값을 내는지 자료로 맞대어 봤다</b> — 2026-08-01 기준
         * 거래처 일곱에서 채권·채무 모두 <b>다른 것이 하나도 없었다</b>.
         */
        /*
         * 채권 대장(fixedSide AR)은 구매 · 매입 회계반영을 안 쓰고, 채무 대장은 판매를 안 쓴다 — 받지 않는다.
         * 회계반영 목록도 기간을 붙인다. 예전엔 판매 전 기간(1.5MB) · 구매(0.4MB)를 다 받아야 '불러오는 중' 이
         * 꺼졌다(2026-10-21 실측, qa/flows/sales-return 이 붐빌 때 20초를 넘김).
         */
        fixedSide === 'AP' ? Promise.resolve({ data: [] as SalesDoc[] }) : api.get<SalesDoc[]>('/sales', { params: period }),
        fixedSide === 'AR' ? Promise.resolve({ data: [] as PurchaseDoc[] }) : api.get<PurchaseDoc[]>('/purchases', { params: period }),
        api.get<Settlement[]>('/settlements', { params: period }).catch(() => ({ data: [] as Settlement[] })),
        api.get<{ partnerId: number; receivable: number; payable: number }[]>(
          '/ledger/partner-balances', { params: { asOf: dayBefore(from) } })
          .catch(() => ({ data: [] as { partnerId: number; receivable: number; payable: number }[] })),
        // 회계전표번호를 붙이려면 반영 목록이 필요하다. trade 는 accounting 을 참조할 수
        // 없어(순환) 전표 응답에 번호가 없다 — 화면이 두 쪽을 이어 붙인다.
        fixedSide === 'AP' ? Promise.resolve({ data: [] as Posted[] })
          : api.get<Posted[]>('/accounting-reflection', { params: { kind: 'SALES', ...period } }).catch(() => ({ data: [] as Posted[] })),
        fixedSide === 'AR' ? Promise.resolve({ data: [] as Posted[] })
          : api.get<Posted[]>('/accounting-reflection', { params: { kind: 'PURCHASE', ...period } }).catch(() => ({ data: [] as Posted[] })),
        api.get<Posted[]>('/accounting-reflection', { params: { kind: 'SETTLEMENT', ...period } }).catch(() => ({ data: [] as Posted[] })),
        api.get<Partner[]>('/partners'),
      ])
      setSales(s.data); setPurchases(p.data); setSettlements(t.data)
      setOpenings(ob.data)
      const toMap = (rows: Posted[]) =>
        new Map(rows.filter((r) => r.journalDocNo).map((r) => [r.id, r.journalDocNo as string]))
      setPostedSales(toMap(js.data)); setPostedPurchases(toMap(jp.data)); setPostedSettles(toMap(jt.data))
      setRollup(toRollupMap(pt.data))
      setPartnerInfo(new Map(pt.data.map((x) => [x.id, x])))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  /* 기간을 바꾸면 그 기간으로 다시 받는다(이월도 같이 다시 받는다). */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  const reset = () => {
    setFrom(init.from); setTo(init.to); setGroup('전표별'); setPartner(''); setBasis('개별거래처기준')
    setSide(fixedSide === 'AR' ? '채권' : fixedSide === 'AP' ? '채무' : '전체')
    req.reset()
  }

  /** 기간과 무관하게 전부 만들어 두고, 기간 앞은 이월잔액으로 접는다. */
  const all = useMemo<Entry[]>(() => {
    const out: Entry[] = []
    for (const d of sales) {
      out.push({
        key: `S${d.id}`, partnerId: d.partnerId, partnerName: d.partnerName, date: d.saleDate,
        docNo: d.docNo, kind: d.returnSlip ? '판매반품' : '판매', side: '채권', increase: d.totalAmount, decrease: 0, lines: d.lines ?? [],
        journalDocNo: postedSales.get(d.id) ?? null,
      })
    }
    for (const d of purchases) {
      out.push({
        key: `P${d.id}`, partnerId: d.partnerId, partnerName: d.partnerName, date: d.purchaseDate,
        docNo: d.docNo, kind: d.returnSlip ? '구매반품' : '구매', side: '채무', increase: d.totalAmount, decrease: 0, lines: d.lines ?? [],
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
        memo: [t.method, t.note].filter(Boolean).join(' · '),
      })
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key < b.key ? -1 : 1))
  }, [sales, purchases, settlements, postedSales, postedPurchases, postedSettles])

  const bySide = useMemo(
    () => all.filter((e) => (side === '전체' || e.side === side)
      && (!partner || String(e.partnerId) === partner)
      /* 원본 [거래처그룹1]. 거래처 마스터에 붙는 값이라 전표에서는 이름으로 잇는다. */
      && (!partnerGroup || pgroups.groupOfName(e.partnerName) === partnerGroup)),
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [all, side, partner, partnerGroup, pgroups.groupOptions],
  )

  /** 거래처마다 이월잔액 + 기간 안의 줄 + 소계. */
  const ledger = useMemo(() => {
    const partners = new Map<number, { partnerId: number; name: string; opening: number; entries: Entry[] }>()
    /*
     * <b>이월은 서버가 낸 기초잔액이다.</b> 묶는 규칙(대표거래처로 합산)이 줄과 같아야
     * 하므로 <b>같은 rollupOf 로</b> 묶어 더한다. [전체] 로 보면 채권과 채무를 함께
     * 세는 화면이라 이월도 둘을 더한다 — 줄 쪽 계산이 그렇게 되어 있다.
     */
    for (const b of openings) {
      /*
       * 이월에도 <b>줄과 같은 조건</b>을 건다. 예전엔 줄만 거르고 이월은 전부 넣어서,
       * 거래처 하나를 골라도 이월이 있는 다른 거래처가 줄줄이 붙었다(2026-10-01, 1곳을 골랐는데
       * '거래처 3곳 · 이월 25,822,000'). 이름도 비워 넘겨 그 묶음은 머리글이 빈칸이었다.
       */
      if (partner && String(b.partnerId) !== partner) continue
      const name = rollup.get(b.partnerId)?.name ?? ''
      if (partnerGroup && pgroups.groupOfName(name) !== partnerGroup) continue
      const t = rollupOf({ partnerId: b.partnerId, partnerName: name } as Entry, basis, rollup)
      const cur = partners.get(t.id) ?? { partnerId: t.id, name: t.name, opening: 0, entries: [] }
      cur.opening += side === '채권' ? b.receivable
        : side === '채무' ? b.payable
        : b.receivable + b.payable
      partners.set(t.id, cur)
    }
    for (const e of bySide) {
      // 규칙은 utils/partnerRollup 에 있다 — 키를 잘못 잡으면 줄이 남의 거래처에 얹힌다.
      const t = rollupOf(e, basis, rollup)
      const cur = partners.get(t.id)
        ?? { partnerId: t.id, name: t.name, opening: 0, entries: [] }
      /* 서버가 이미 기간만 주지만, 조건을 바꾼 직후 옛 자료가 잠깐 남는 것을 막는다. */
      if (e.date >= from && e.date <= to) cur.entries.push(e)
      partners.set(t.id, cur)
    }

    const fold = (entries: Entry[]): Entry[] => {
      if (group === '전표별' || group === '전표별+내역') return entries
      // 규칙은 utils/ledgerGroup 에 있다 — 키를 잘못 잡으면 줄이 조용히 사라진다.
      const keyOf = (e: Entry) => groupKeyOf(e, group) as string
      const m = new Map<string, Entry>()
      for (const e of entries) {
        const k = keyOf(e)
        /* 원본 거래처관리대장1(채권·채무) 회계전표별은 회계 전표가 있는 줄만 보인다(판매·구매는 회계 미반영이면 빠짐, 2026-10-21 실측). */
        if (oneSided && group === '회계전표별' && k === UNPOSTED) continue
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
      /* 거래처가 필수인 화면은 거래처를 고르기 전에는 결과를 내지 않는다. */
      .filter(() => !oneSided || !!partner)
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
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [bySide, openings, side, from, to, group, basis, rollup, partner, partnerGroup, pgroups.groupOptions, oneSided])

  const totals = useMemo(() => ledger.reduce(
    (s, p) => ({
      opening: s.opening + p.opening,
      increase: s.increase + p.increase,
      decrease: s.decrease + p.decrease,
      closing: s.closing + p.closing,
    }),
    { opening: 0, increase: 0, decrease: 0, closing: 0 },
  ), [ledger])

  /*
   * 원본 거래처관리대장1 의 일자-No. 링크(2026-10-21 실측): 누르면 대장 위에 그 전표의 수정 창('판매입력(수정)' · '구매입력(수정)')이
   * 판매조회 · 구매조회와 같은 모양으로 뜬다 — 새 창이 아니라 같은 화면 위의 창이다.
   */
  const [entryPopup, setEntryPopup] = useState<{ mode: 'sales' | 'purchase'; id: number } | null>(null)
  const openEntry = (e: Entry) => {
    if (e.kind.startsWith('판매')) setEntryPopup({ mode: 'sales', id: Number(e.key.slice(1)) })
    else if (e.kind.startsWith('구매')) setEntryPopup({ mode: 'purchase', id: Number(e.key.slice(1)) })
  }
  /*
   * 수금 · 지급 줄의 일자-No. 링크(2026-10-22 실측, 거래처관리대장1 채권 · 채무): 대장 위에 회계 창이 뜬다 — 수금은 '입금보고서'(머리 일자 · 첨언내용 · 탭 찾기(F3) · 자금계획 ·
   * 계좌입출금내역 · 결제대행사내역, 격자 돈 들어온 계좌 검색 · 돈 들어온 계좌명 · 계정코드(대변) · 계정코드명 · 거래처 검색 · 거래처명 · 금액 · 적요명 · 추가정보),
   * 지급은 '지출결의서'(돈 나간 계좌 · 계정코드(차변), 탭에 카드매입내역 · 계정별잔액). 우리 수금 · 지급은 회계전표가 아니라 수금 전표라 있는 값(일자 · 거래처 · 금액 · 적요)만 채운다.
   */
  const [settlePopup, setSettlePopup] = useState<Entry | null>(null)
  const showDetail = group === '전표별+내역'
  const COLS = 8

  /*
   * 원본 조건 판의 <b>[정렬/소계기준]</b>(사본 실측). 우리 대장은 거래처로만 묶여 있어서,
   * 여러 달치를 뽑으면 <b>달마다 얼마씩 오갔는지</b>를 눈으로 세는 수밖에 없었다.
   * [월]을 고르면 거래처 안에서 달이 바뀔 때 그 달의 증가·감소 소계를 끼워 넣는다.
   */
  const SUBTOTALS = ['거래처', '월'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('거래처')

  /*
   * <b>이 화면의 원본에는 화면 위 격자가 없다.</b> [검색]을 눌러도 표가 그려지지 않고
   * <b>출력물</b>로 넘어간다(거래처관리대장 II 와 같다) — 그래서 열 이름·차례·정렬을
   * 잴 축이 없다. 우리 표는 원본 <b>대장 I</b> 의 열(일자 · 전표번호 · 구분 · 적요 ·
   * 증가 · 감소 · 잔액)을 따른다. 지어내지 않는다.
   */
  /** 그 거래처의 등록 정보. 목록에 없으면 undefined — 머리말을 아예 안 그린다. */
  const info = (id: number) => partnerInfo.get(id)

  /**
   * 원본 대장 I 머리말 한 줄. 빈 값은 이름째 뺀다 —
   * 'Fax :' 만 덩그러니 있으면 팩스가 없는 것인지 안 적은 것인지 구분이 안 된다.
   */
  const headline = (x: Partner) => [
    x.bizRegNo && `사업자등록번호 ${x.bizRegNo}`,
    x.ceoName && `대표자 ${x.ceoName}`,
    `여신한도 ${fmtAmount(x.creditLimit ?? 0)}`,
    x.phone && `전화 ${x.phone}`,
    x.email && `Email ${x.email}`,
    x.fax && `Fax ${x.fax}`,
    x.address && `주소 ${x.address}`,
    x.remark && `기타사항 ${x.remark}`,
  ].filter(Boolean).join('   |   ')

  /**
   * 원본 거래처관리대장1(채권·채무) 결과 — 거래처마다 머리표 '{거래처명} 관리대장(거래명세서별)'(+ 거래처 등록 정보) 아래
   * '판매/수금내역'(채무는 '구매/지급내역') 격자 <b>일자 · 적요 · 판매 · 수금 · 잔액</b> 다섯 칸.
   * 내역 줄은 '품목명 / 수량 * 단가', 달이 끝나면 'YYYY/MM 계', 거래처 끝에 누계. 빈 결과는 '등록된 데이터가 없습니다.'
   */
  function renderOneSided() {
    const ar = fixedSide === 'AR'
    const [incLabel, decLabel] = ar ? ['판매', '수금'] : ['구매', '지급']
    if (loading) return <table className="w-full text-left"><tbody><tr><td className="ec-empty">불러오는 중…</td></tr></tbody></table>
    const ym = (d: string) => d.slice(0, 7)
    /* 원본은 거래처를 골랐는데 자료가 없어도 머리표 · 열 머리를 그대로 두고 격자 안에 '등록된 데이터가 없습니다.' 를 둔다(2026-10-21 실측). */
    const shown = ledger.length > 0 ? ledger
      : partner ? [{ partnerId: Number(partner), name: (info(Number(partner))?.name ?? ""), opening: 0, entries: [], rows: [], increase: 0, decrease: 0, closing: 0 }] : []
    if (shown.length === 0) return <table className="w-full text-left"><tbody><tr><td className="ec-empty">등록된 데이터가 없습니다.</td></tr></tbody></table>
    const dayOrMonth = group === '일별' || group === '월별'
    const money = (n: number) => (n ? fmtAmount(n) : '')
    return (
      <>
        {shown.map((p) => {
          const months = dayOrMonth ? [] : [...new Set(p.rows.map((r) => ym(r.entry.date)))]
          return (
            <div key={p.partnerId} className="mb-[16px]">
              <div className="text-[14px] font-bold mb-[2px]">{p.name} 관리대장(거래명세서별)</div>
              {info(p.partnerId) && <div className="text-[11.5px] text-ec-label mb-[4px]">{headline(info(p.partnerId)!)}</div>}
              <table className="w-full text-left ec-list-grid">
                <thead>
                  <tr><th colSpan={5} className="text-left">{incLabel}/{decLabel}내역</th></tr>
                  <tr>
                    <th className="w-[130px]">일자</th>
                    <th>적요</th>
                    <th className="w-[130px] text-right">{incLabel}</th>
                    <th className="w-[130px] text-right">{decLabel}</th>
                    <th className="w-[140px] text-right">잔액</th>
                  </tr>
                </thead>
                <tbody>
                  {p.rows.length === 0 && p.opening === 0 && <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
                  {(p.rows.length > 0 || p.opening !== 0) && (
                    <tr className="font-bold">
                      <td colSpan={2} className="text-center">이월잔액</td><td></td><td></td>
                      <td className="text-right">{fmtAmount(p.opening)}</td>
                    </tr>
                  )}
                  {(dayOrMonth ? [''] : months).map((m) => {
                    const rows = dayOrMonth ? p.rows : p.rows.filter((r) => ym(r.entry.date) === m)
                    const inc = rows.reduce((n, r) => n + r.entry.increase, 0)
                    const dec = rows.reduce((n, r) => n + r.entry.decrease, 0)
                    return (
                      <Fragment key={m || 'all'}>
                        {rows.map((r) => (
                          <Fragment key={r.entry.key}>
                            <tr className="bg-ec-page">
                              <td>{dayOrMonth
                                ? (group === '월별' ? r.entry.date.replace('-', '/') : dateText(r.entry.date))
                                : (r.entry.kind === '수금' || r.entry.kind === '지급')
                                  ? <a className="cursor-pointer" onClick={() => setSettlePopup(r.entry)}>{dateText(r.entry.date)}{r.entry.docNo ? ` ${r.entry.docNo}` : ''}</a>
                                  : <a className="cursor-pointer" onClick={() => openEntry(r.entry)}>{dateText(r.entry.date)}{r.entry.docNo ? ` ${r.entry.docNo}` : ''}</a>}</td>
                              <td>{dayOrMonth ? (group === '월별' ? '월계' : '일계')
                                : <>{r.entry.kind.endsWith('반품') ? `${r.entry.kind} ` : ''}{r.entry.memo ?? ''}</>}</td>
                              <td className="text-right">{r.entry.increase ? fmtAmount(r.entry.increase) : ''}</td>
                              <td className="text-right">{r.entry.decrease ? fmtAmount(r.entry.decrease) : ''}</td>
                              <td className="text-right font-bold">{fmtAmount(r.balance)}</td>
                            </tr>
                            {showDetail && r.entry.lines.map((l, li) => (
                              <tr key={`${r.entry.key}-${li}`}>
                                <td></td>
                                <td>{l.itemName}{l.spec ? ` [${l.spec}]` : ''} / {l.quantity.toLocaleString('ko-KR', { minimumFractionDigits: 2 })} * {fmtAmount(l.unitPrice)}</td>
                                <td className="text-right bg-ec-cell-negative">{fmtAmount(l.supplyAmount + (l.vatAmount ?? 0))}</td>
                                <td></td><td></td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                        {!dayOrMonth && (
                          <tr className="bg-ec-page font-bold">
                            <td colSpan={2} className="text-center">{m.replace('-', '/')} 계</td>
                            <td className="text-right">{money(inc)}</td>
                            <td className="text-right">{money(dec)}</td>
                            <td></td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                  {(p.rows.length > 0 || p.opening !== 0) && (
                    <tr className="bg-ec-page font-bold">
                      <td colSpan={2} className="text-center">누계</td>
                      <td className="text-right">{money(p.increase)}</td>
                      <td className="text-right">{money(p.decrease)}</td>
                      <td className="text-right">{fmtAmount(p.closing)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )
        })}
      </>
    )
  }

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: search },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
        subtotal={subtotal}
        subtotals={SUBTOTALS}
        onSubtotalChange={(v) => setSubtotal(v as typeof SUBTOTALS[number])}
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
        {/* 원본 차례: 집계구분 · <b>거래처 · 대표거래처로 합산</b> (사본 실측) — 우리는 뒤바뀌어 있었다. */}
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel={oneSided ? undefined : '전체'}
                           invalid={req.on('partner', !!partner)}
                           value={partner} onChange={(v) => setPartner(v)}
                           items={pickers.partners} />
        </EcCond>
        {/* 원본 차례: [거래처] 다음이 [거래처그룹1] 이다(사본 실측). */}
        <EcCond label="거래처그룹1" pick>
          <CodePickerField label="거래처그룹1" hideLabel width={150} emptyLabel="전체"
                           value={partnerGroup} onChange={(v) => setPartnerGroup(v)}
                           items={pgroups.groupOptions.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        <EcCond label="대표거래처로 합산">
          <div className="ec-pills">
            {(['개별거래처기준', '거래처관계기준'] as const).map((b) => (
              <button key={b} type="button" className={`ec-pill no-ec${basis === b ? ' active' : ''}`}
                      onClick={() => setBasis(b)}>{b}</button>
            ))}
          </div>
        </EcCond>
      </EcStatusPanel>

      {!oneSided && <div className="mb-[8px] text-[12.5px] text-ec-label text-right">
        거래처 <b className="text-ec-text">{ledger.length}</b>곳
        <span className="my-0 mx-[6px] text-ec-off">|</span>
        이월 <b>{fmtAmount(totals.opening)}</b>
        <span className="my-0 mx-[6px] text-ec-off">|</span>
        증가 <b className="text-ec-blue">{fmtAmount(totals.increase)}</b>
        <span className="my-0 mx-[6px] text-ec-off">|</span>
        감소 <b className="text-ec-success">{fmtAmount(totals.decrease)}</b>
        <span className="my-0 mx-[6px] text-ec-off">|</span>
        잔액 <b className="text-ec-navy text-[14px]">{fmtAmount(totals.closing)}</b>
      </div>}

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {oneSided ? renderOneSided() : <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[110px]">일자</th>
            <th className="w-[170px]">전표번호</th>
            <th className="w-[80px] text-center">구분</th>
            <th>적요</th>
            <th className="w-[130px] text-right">증가</th>
            <th className="w-[130px] text-right">감소</th>
            <th className="w-[140px] text-right">잔액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={COLS} className="ec-empty">불러오는 중…</td></tr>
          ) : ledger.length === 0 ? (
            <tr><td colSpan={COLS} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : ledger.map((p) => (
            <Fragment key={p.partnerId}>
              <tr style={{ background: '#f2f6fc', fontWeight: 700 }}>
                <td colSpan={4} className="text-ec-navy">{p.name}</td>
                <td className="text-right text-ec-label">이월잔액</td>
                <td colSpan={2}></td>
                <td className="text-right">{fmtAmount(p.opening)}</td>
              </tr>
              {/*
                원본 거래처관리대장 I 의 머리말 실측(사본): 사업자등록번호 · 대표자 ·
                여신한도 · 전화 · Email · Fax · 주 소 · 기타사항.
                우리 대장은 거래처 이름 한 줄뿐이라, 인쇄해서 들고 가면 어디로 전화할지
                누구를 찾을지가 안 적혀 있었다.
                거래처를 못 찾으면(지워졌거나 목록이 아직 안 옴) 이 줄을 아예 안 그린다 —
                빈 칸만 늘어놓으면 자료가 없는 것인지 거래처가 없는 것인지 알 수 없다.
              */}
              {info(p.partnerId) && (
                <tr style={{ background: '#f8fafd', fontSize: 11.5, color: 'var(--ec-label)' }}>
                  <td colSpan={COLS} className="py-[4px] px-[8px]">
                    {headline(info(p.partnerId)!)}
                  </td>
                </tr>
              )}
              {p.rows.map((r, i) => {
                /*
                 * 달이 바뀌는 <b>앞</b>에 지난 달 소계를 끼운다. 마지막 달은 아래 거래처
                 * 합계가 받으므로 따로 넣지 않는다 — 같은 숫자를 두 줄로 보여 주면 헷갈린다.
                 */
                const ym = (d: string) => d.slice(0, 7)
                const prev = i > 0 ? p.rows[i - 1] : null
                const monthBreak = subtotal === '월' && prev !== null
                  && ym(prev.entry.date) !== ym(r.entry.date)
                const monthSum = monthBreak
                  ? p.rows.filter((x) => ym(x.entry.date) === ym(prev!.entry.date))
                    .reduce((acc, x) => ({
                      inc: acc.inc + x.entry.increase, dec: acc.dec + x.entry.decrease,
                    }), { inc: 0, dec: 0 })
                  : null
                return (
                <Fragment key={r.entry.key}>
                  {monthSum && (
                    <tr className="bg-ec-page font-semibold text-ec-label">
                      <td colSpan={5} className="text-right">
                        {ym(prev!.entry.date).replace('-', '/')} 소계
                      </td>
                      <td className="text-right">{monthSum.inc ? fmtAmount(monthSum.inc) : ''}</td>
                      <td className="text-right">{monthSum.dec ? fmtAmount(monthSum.dec) : ''}</td>
                      <td></td>
                    </tr>
                  )}
                  <tr>
                    <td className="text-center text-ec-hint">{i + 1}</td>
                    <td>{dateText(r.entry.date)}</td>
                    {/* 회계전표별로 묶으면 이 칸에 회계전표번호가 온다. 미반영 묶음은 눈에 띄게. */}
                    <td style={{
                      fontFamily: 'monospace',
                      color: r.entry.docNo === UNPOSTED ? 'var(--ec-warn)' : 'var(--ec-label)',
                      fontWeight: r.entry.docNo === UNPOSTED ? 700 : undefined,
                    }}>{r.entry.docNo}</td>
                    <td style={{ textAlign: 'center', color: r.entry.kind.endsWith('반품') ? 'var(--ec-danger)' : r.entry.increase > 0 ? 'var(--ec-blue)' : 'var(--ec-success)' }}>
                      {r.entry.kind}
                    </td>
                    <td className="text-ec-hint">
                      {r.entry.lines.length > 0
                        ? `${r.entry.lines[0].itemName}${r.entry.lines.length > 1 ? ` 외 ${r.entry.lines.length - 1}건` : ''}`
                        : (r.entry.memo ?? '')}
                    </td>
                    <td style={{ textAlign: 'right', color: r.entry.increase ? 'var(--ec-blue)' : 'var(--ec-text-off)' }}>
                      {r.entry.increase ? fmtAmount(r.entry.increase) : ''}
                    </td>
                    <td style={{ textAlign: 'right', color: r.entry.decrease ? 'var(--ec-success)' : 'var(--ec-text-off)' }}>
                      {r.entry.decrease ? fmtAmount(r.entry.decrease) : ''}
                    </td>
                    <td className="text-right font-semibold">{fmtAmount(r.balance)}</td>
                  </tr>
                  {showDetail && r.entry.lines.map((l, li) => (
                    <tr key={`${r.entry.key}-${li}`} style={{ color: 'var(--ec-label)', fontSize: 12 }}>
                      <td></td>
                      <td colSpan={3} className="text-right text-ec-hint">└ {l.itemCode}</td>
                      <td>{l.itemName}</td>
                      <td className="text-right">{fmtAmount(l.quantity)} × {fmtAmount(l.unitPrice)}</td>
                      <td className="text-right">{fmtAmount(l.supplyAmount)}</td>
                      <td></td>
                    </tr>
                  ))}
                </Fragment>
                )})}
              <tr className="bg-ec-page font-bold">
                <td colSpan={5} className="text-right">{p.name} 소계</td>
                <td className="text-right text-ec-blue">{fmtAmount(p.increase)}</td>
                <td className="text-right text-ec-success">{fmtAmount(p.decrease)}</td>
                <td className="text-right text-ec-navy">{fmtAmount(p.closing)}</td>
              </tr>
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-ec-page">
            <td colSpan={5} className="text-right">합계 ({ledger.length}거래처)</td>
            <td className="text-right text-ec-blue">{fmtAmount(totals.increase)}</td>
            <td className="text-right text-ec-success">{fmtAmount(totals.decrease)}</td>
            <td className="text-right text-ec-navy">{fmtAmount(totals.closing)}</td>
          </tr>
        </tfoot>
      </table>}
      {settlePopup && (() => {
        const receipt = settlePopup.kind === '수금'
        const title = receipt ? '입금보고서' : '지출결의서'
        const code = pickers.partners.find((x) => x.id === settlePopup.partnerId)?.code ?? ''
        const tabs = receipt ? ['찾기(F3)', '자금계획', '계좌입출금내역', '결제대행사내역'] : ['찾기(F3)', '자금계획', '계좌입출금내역', '카드매입내역', '계정별잔액']
        return (
          <div className="ec-modal-back">
            <ModalWindow title={title} onClose={() => setSettlePopup(null)} className="w-[max(960px,50vw)]">
                <div className="ec-page-head"><span className="ec-page-title">{title}</span></div>
                <div className="mb-[8px] text-[12.5px]">일자 <b>{dateText(settlePopup.date)}</b></div>
                <div className="mb-[8px] text-[12.5px]">첨언내용 {settlePopup.memo ?? ''}</div>
                <div className="mb-[6px] flex gap-[14px] text-[12.5px] text-ec-hint">{tabs.map((t) => <span key={t}>{t}</span>)}</div>
                <table className="w-full text-left">
                  <thead><tr>
                    <th>{receipt ? '돈 들어온 계좌 검색' : '돈 나간 계좌 검색'}</th><th>{receipt ? '돈 들어온 계좌명' : '돈 나간 계좌명'}</th>
                    <th>{receipt ? '계정코드(대변)' : '계정코드(차변)'}</th><th>계정코드명</th><th>거래처 검색</th><th>거래처명</th><th className="text-right">금액</th><th>적요명</th><th>추가정보</th>
                  </tr></thead>
                  <tbody><tr>
                    <td></td><td></td><td></td><td></td><td>{code}</td><td>{settlePopup.partnerName}</td>
                    <td className="text-right">{fmtAmount(settlePopup.decrease)}</td><td>{settlePopup.memo ?? ''}</td><td></td>
                  </tr></tbody>
                </table>
                <div className="mt-[10px]"><button type="button" className="ec-btn" onClick={() => setSettlePopup(null)}>닫기</button></div>
            </ModalWindow>
          </div>
        )
      })()}
      {entryPopup && (
        <div className="ec-modal-back">
          <ModalWindow title={entryPopup.mode === 'sales' ? '판매입력(수정)' : '구매입력(수정)'} onClose={() => setEntryPopup(null)} className="w-[max(960px,50vw)]">
              <TradeEntry key={`${entryPopup.mode}-${entryPopup.id}`} mode={entryPopup.mode} popup={{
                editId: entryPopup.id,
                onCopy: () => {},
                onClose: (changed) => { setEntryPopup(null); if (changed) void load() },
                onMove: () => { void ecAlert('다음 자료가 없습니다.') },
                onReturn: () => { setEntryPopup(null) },
                docs: [],
              }} />
          </ModalWindow>
        </div>
      )}
    </EcListShell>
  )
}
